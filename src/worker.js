import { SignJWT, jwtVerify } from 'jose';

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

function withCors(resp) {
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  return new Response(resp.body, { status: resp.status, headers: h });
}

function getBearer(req) {
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function getJwtSecret(env) {
  const secret = String(env.JWT_SECRET || '').trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function requireAuth(request, env) {
  const token = getBearer(request);
  if (!token) return null;
  const secret = await getJwtSecret(env);
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

function requireEnv(env, keys) {
  const missing = keys.filter((k) => !String(env[k] || '').trim());
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeHolaBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function normalizeHolaApiBase(url) {
  const base = normalizeHolaBaseUrl(url);
  if (!base) return '';
  if (/\/api\/v1$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/v1`;
  return `${base}/api/v1`;
}

function holaAuthHeader(token) {
  const raw = String(token || '').trim();
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
}

async function fetchJson(url, init = {}) {
  const resp = await fetch(url, init);
  const text = await resp.text().catch(() => '');
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json: parsed };
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const username = String(body.username || body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();

  const adminEmail = String(env.ADMIN_EMAIL || 'admin@holasuite.com').trim().toLowerCase();
  const adminPass = String(env.ADMIN_PASSWORD || 'hola2025').trim();

  const secret = await getJwtSecret(env);
  if (!secret) return json({ error: 'Falta configurar JWT_SECRET' }, { status: 503 });

  if (!username || !password) return json({ error: 'Usuario y contraseña requeridos' }, { status: 400 });
  if (username !== adminEmail || password !== adminPass) return json({ error: 'Credenciales inválidas' }, { status: 401 });

  const token = await new SignJWT({ id: 1, username: adminEmail, role: 'admin', name: 'Edwin Franco' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);

  return json({
    token,
    user: { id: 1, username: adminEmail, role: 'admin', name: 'Edwin Franco' },
    clickup: {
      configured: Boolean(String(env.CLICKUP_API_KEY || '').trim()),
      listId: String(env.CLICKUP_LIST_ID || '').trim()
    }
  });
}

async function handleMe(request, env) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'No autorizado' }, { status: 401 });
  return json({ user });
}

async function handleClickupTasks(request, env) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'No autorizado' }, { status: 401 });
  const cfg = requireEnv(env, ['CLICKUP_API_KEY', 'CLICKUP_LIST_ID']);
  if (!cfg.ok) return json({ error: `Faltan ${cfg.missing.join(', ')}` }, { status: 503 });
  const apiKey = String(env.CLICKUP_API_KEY).trim();
  const listId = String(env.CLICKUP_LIST_ID).trim();

  const tasks = [];
  for (let page = 0; page < 25; page++) {
    const url = `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
    const { ok, status, json: data } = await fetchJson(url, { headers: { Authorization: apiKey, 'Content-Type': 'application/json' } });
    if (!ok) return json({ error: `ClickUp HTTP ${status}` }, { status });
    const chunk = Array.isArray(data?.tasks) ? data.tasks : [];
    if (!chunk.length) break;
    tasks.push(...chunk);
    if (chunk.length < 100) break;
  }
  return json({ tasks, listId });
}

async function handleClickupUpdate(request, env, { taskId, kind }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'No autorizado' }, { status: 401 });
  const cfg = requireEnv(env, ['CLICKUP_API_KEY']);
  if (!cfg.ok) return json({ error: `Falta ${cfg.missing.join(', ')}` }, { status: 503 });
  const apiKey = String(env.CLICKUP_API_KEY).trim();
  if (!taskId) return json({ error: 'Task ID requerido' }, { status: 400 });
  const body = await readJson(request);

  if (kind === 'status') {
    const statusValue = String(body.status || '').trim();
    if (!statusValue) return json({ error: 'Status requerido' }, { status: 400 });
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
    const resp = await fetchJson(url, {
      method: 'PUT',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusValue })
    });
    if (!resp.ok) return json({ error: resp.json?.err || resp.json?.error || `ClickUp HTTP ${resp.status}` }, { status: resp.status });
    return json({ ok: true, data: resp.json });
  }

  if (kind === 'comment') {
    const comment = String(body.comment || '').trim();
    if (!comment) return json({ error: 'Comentario requerido' }, { status: 400 });
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment`;
    const resp = await fetchJson(url, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_text: comment })
    });
    if (!resp.ok) return json({ error: resp.json?.err || resp.json?.error || `ClickUp HTTP ${resp.status}` }, { status: resp.status });
    return json({ ok: true, data: resp.json });
  }

  if (kind === 'tag') {
    const tag = String(body.tag || '').trim();
    if (!tag) return json({ error: 'Etiqueta requerida' }, { status: 400 });
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(tag)}`;
    const resp = await fetchJson(url, { method: 'POST', headers: { Authorization: apiKey, 'Content-Type': 'application/json' } });
    if (!resp.ok) return json({ error: resp.json?.err || resp.json?.error || `ClickUp HTTP ${resp.status}` }, { status: resp.status });
    return json({ ok: true, data: resp.json });
  }

  if (kind === 'custom-field') {
    const fieldId = String(body.fieldId || '').trim();
    const value = body.value;
    if (!fieldId) return json({ error: 'fieldId requerido' }, { status: 400 });
    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
    const resp = await fetchJson(url, {
      method: 'PUT',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_fields: [{ id: fieldId, value }] })
    });
    if (!resp.ok) return json({ error: resp.json?.err || resp.json?.error || `ClickUp HTTP ${resp.status}` }, { status: resp.status });
    return json({ ok: true, data: resp.json });
  }

  return json({ error: 'Endpoint no encontrado' }, { status: 404 });
}

function verifyPublicApiKey(request, env) {
  const expected = String(env.PUBLIC_API_KEY || '').trim();
  if (!expected) return false;
  const provided = String(request.headers.get('X-API-Key') || request.headers.get('x-api-key') || '').trim();
  return Boolean(provided && provided === expected);
}

async function handlePublicSearch(request, env, url) {
  if (!verifyPublicApiKey(request, env)) return json({ error: 'API key inválida' }, { status: 401 });
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return json({ results: [] });

  const cfg = requireEnv(env, ['CLICKUP_API_KEY', 'CLICKUP_LIST_ID']);
  if (!cfg.ok) return json({ error: `Faltan ${cfg.missing.join(', ')}` }, { status: 503 });
  const apiKey = String(env.CLICKUP_API_KEY).trim();
  const listId = String(env.CLICKUP_LIST_ID).trim();

  const results = [];
  for (let page = 0; page < 10; page++) {
    const apiUrl = `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
    const { ok, json: data } = await fetchJson(apiUrl, { headers: { Authorization: apiKey, 'Content-Type': 'application/json' } });
    if (!ok) break;
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    for (const t of tasks) {
      const id = String(t.id || '');
      const name = String(t.name || '');
      if (id.includes(q) || name.toLowerCase().includes(q)) {
        results.push({ id, name, status: t.status?.status || '', url: t.url || '' });
        if (results.length >= 20) break;
      }
    }
    if (results.length >= 20 || tasks.length < 100) break;
  }
  return json({ results });
}

async function handleHolaConversations(request, env) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'No autorizado' }, { status: 401 });
  const cfg = requireEnv(env, ['HOLA_API_URL', 'HOLA_API_TOKEN']);
  if (!cfg.ok) return json({ error: `Faltan ${cfg.missing.join(', ')}` }, { status: 503 });
  const baseUrl = normalizeHolaApiBase(env.HOLA_API_URL);
  const token = holaAuthHeader(env.HOLA_API_TOKEN);
  const body = await readJson(request);
  const ws = String(body.workspace || '').trim();

  const headers = { Authorization: token, 'Content-Type': 'application/json' };
  const urls = [
    `${baseUrl}/atendimento`,
    ...(ws ? [`${baseUrl}/atendimento?workspace=${encodeURIComponent(ws)}`] : [])
  ];
  let lastErr = null;
  for (const u of urls) {
    const resp = await fetchJson(u, { headers });
    if (resp.ok) {
      const conversations = resp.json?.data || resp.json?.conversations || resp.json || [];
      return json({ ok: true, conversations: Array.isArray(conversations) ? conversations : [conversations] });
    }
    lastErr = resp;
  }
  return json({ error: `Hola HTTP ${lastErr?.status || 502}` }, { status: lastErr?.status || 502 });
}

async function handleHolaAttendanceDetail(request, env, attendanceId) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: 'No autorizado' }, { status: 401 });
  const cfg = requireEnv(env, ['HOLA_API_URL', 'HOLA_API_TOKEN']);
  if (!cfg.ok) return json({ error: `Faltan ${cfg.missing.join(', ')}` }, { status: 503 });
  const baseUrl = normalizeHolaApiBase(env.HOLA_API_URL);
  const token = holaAuthHeader(env.HOLA_API_TOKEN);
  const headers = { Authorization: token, 'Content-Type': 'application/json' };

  const detailUrl = `${baseUrl}/atendimento/${encodeURIComponent(attendanceId)}`;
  const msgUrl = `${baseUrl}/atendimento/mensagem/${encodeURIComponent(attendanceId)}`;
  const d = await fetchJson(detailUrl, { headers });
  const m = await fetchJson(msgUrl, { headers });
  if (!d.ok && !m.ok) return json({ error: `Hola HTTP ${d.status || m.status}` }, { status: d.status || m.status || 502 });
  const merged = { ...(d.json?.data || {}), ...(m.json?.data || {}) };
  return json({ ok: true, detail: merged });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  const parts = url.pathname.replace(/^\/+/, '').split('/');
  const apiIndex = parts.indexOf('api');
  const route = apiIndex >= 0 ? parts.slice(apiIndex + 1) : [];
  const [a, b, c, d] = route;

  if (a === 'auth' && b === 'login' && request.method === 'POST') return withCors(handleLogin(request, env));
  if (a === 'auth' && b === 'me' && request.method === 'GET') return withCors(handleMe(request, env));

  if (a === 'clickup' && b === 'tasks' && request.method === 'GET') return withCors(handleClickupTasks(request, env));
  if (a === 'clickup' && b === 'task' && c && d === 'status' && request.method === 'POST') return withCors(handleClickupUpdate(request, env, { taskId: c, kind: 'status' }));
  if (a === 'clickup' && b === 'task' && c && d === 'comment' && request.method === 'POST') return withCors(handleClickupUpdate(request, env, { taskId: c, kind: 'comment' }));
  if (a === 'clickup' && b === 'task' && c && d === 'tag' && request.method === 'POST') return withCors(handleClickupUpdate(request, env, { taskId: c, kind: 'tag' }));
  if (a === 'clickup' && b === 'task' && c && d === 'custom-field' && request.method === 'POST') return withCors(handleClickupUpdate(request, env, { taskId: c, kind: 'custom-field' }));

  if (a === 'opa' && b === 'conversations' && request.method === 'POST') return withCors(handleHolaConversations(request, env));
  if (a === 'opa' && b === 'attendance' && c && d === 'detail' && request.method === 'POST') return withCors(handleHolaAttendanceDetail(request, env, c));

  if (a === 'public' && b === 'search' && request.method === 'GET') return withCors(handlePublicSearch(request, env, url));

  return withCors(json({ error: 'Endpoint no encontrado' }, { status: 404 }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    // Default route: serve vylex.html at /
    if (url.pathname === '/' || url.pathname === '') {
      const next = new URL(request.url);
      next.pathname = '/vylex.html';
      return env.ASSETS.fetch(new Request(next.toString(), request));
    }

    return env.ASSETS.fetch(request);
  }
};

