/**
 * API Handler para Vercel
 * Todos los endpoints de la aplicación
 */

const jwt = require('jsonwebtoken');

require('dotenv').config();

let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !serviceKey) {
    const err = new Error('Faltan variables de entorno SUPABASE_URL / SUPABASE_SERVICE_KEY en Vercel');
    err.statusCode = 503;
    throw err;
  }
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(url, serviceKey);
  return supabase;
}

/**
 * Middleware para verificar JWT
 */
function verificarAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

async function getClickUpTasks(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });

    const apiKey = (process.env.CLICKUP_API_KEY || '').trim();
    const listId = (process.env.CLICKUP_LIST_ID || '').trim();
    if (!apiKey || !listId) {
      return res.status(503).json({ error: 'Faltan CLICKUP_API_KEY / CLICKUP_LIST_ID en Vercel' });
    }

    const tasks = [];
    for (let page = 0; page < 25; page++) {
      const url = `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
      const resp = await fetch(url, { headers: { Authorization: apiKey, 'Content-Type': 'application/json' } });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return res.status(resp.status).json({ error: `ClickUp HTTP ${resp.status}: ${txt.slice(0, 200)}` });
      }
      const json = await resp.json().catch(() => ({}));
      const chunk = Array.isArray(json.tasks) ? json.tasks : [];
      if (!chunk.length) break;
      tasks.push(...chunk);
      if (chunk.length < 100) break;
    }

    res.status(200).json({ tasks, listId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function requireClickUpConfig(res) {
  const apiKey = (process.env.CLICKUP_API_KEY || '').trim();
  const listId = (process.env.CLICKUP_LIST_ID || '').trim();
  if (!apiKey || !listId) {
    res.status(503).json({ error: 'Faltan CLICKUP_API_KEY / CLICKUP_LIST_ID en Vercel' });
    return null;
  }
  return { apiKey, listId };
}

async function updateClickUpTask(req, res, { pathSuffix = '', body = null, method = 'POST' } = {}) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });

    const cfg = await requireClickUpConfig(res);
    if (!cfg) return;

    const taskId = String(req.query.id || '').trim();
    if (!taskId) return res.status(400).json({ error: 'Task ID requerido' });

    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}${pathSuffix}`;
    const resp = await fetch(url, {
      method,
      headers: { Authorization: cfg.apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
    res.status(200).json({ ok: true, data: json });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function setClickUpStatus(req, res) {
  const status = String(req.body?.status || '').trim();
  if (!status) return res.status(400).json({ error: 'Status requerido' });
  return updateClickUpTask(req, res, { method: 'PUT', body: { status } });
}

async function addClickUpComment(req, res) {
  const comment = String(req.body?.comment || '').trim();
  if (!comment) return res.status(400).json({ error: 'Comentario requerido' });
  return updateClickUpTask(req, res, { pathSuffix: '/comment', method: 'POST', body: { comment_text: comment } });
}

async function addClickUpTag(req, res) {
  const tag = String(req.body?.tag || '').trim();
  if (!tag) return res.status(400).json({ error: 'Etiqueta requerida' });
  // ClickUp tags endpoint is /task/{task_id}/tag/{tag_name}
  // Using POST without body.
  const auth = verificarAuth(req);
  if (!auth) return res.status(401).json({ error: 'No autorizado' });
  const cfg = await requireClickUpConfig(res);
  if (!cfg) return;
  const taskId = String(req.query.id || '').trim();
  if (!taskId) return res.status(400).json({ error: 'Task ID requerido' });
  const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(tag)}`;
  const resp = await fetch(url, { method: 'POST', headers: { Authorization: cfg.apiKey, 'Content-Type': 'application/json' } });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
  res.status(200).json({ ok: true, data: json });
}

async function setClickUpCustomField(req, res) {
  const fieldId = String(req.body?.fieldId || '').trim();
  const value = req.body?.value;
  if (!fieldId) return res.status(400).json({ error: 'fieldId requerido' });
  return updateClickUpTask(req, res, { method: 'PUT', body: { custom_fields: [{ id: fieldId, value }] } });
}

function verifyPublicApiKey(req) {
  const expected = String(process.env.PUBLIC_API_KEY || '').trim();
  if (!expected) return false;
  const provided = String(req.headers['x-api-key'] || '').trim();
  return Boolean(provided && provided === expected);
}

async function publicSearch(req, res) {
  try {
    if (!verifyPublicApiKey(req)) return res.status(401).json({ error: 'API key inválida' });
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.status(200).json({ results: [] });

    const cfg = await requireClickUpConfig(res);
    if (!cfg) return;

    // Fetch first pages and filter by name
    const matches = [];
    for (let page = 0; page < 10; page++) {
      const url = `https://api.clickup.com/api/v2/list/${encodeURIComponent(cfg.listId)}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
      const resp = await fetch(url, { headers: { Authorization: cfg.apiKey, 'Content-Type': 'application/json' } });
      if (!resp.ok) break;
      const json = await resp.json().catch(() => ({}));
      const tasks = Array.isArray(json.tasks) ? json.tasks : [];
      for (const t of tasks) {
        const name = String(t.name || '');
        if (name.toLowerCase().includes(q) || String(t.id || '').includes(q)) {
          matches.push({ id: t.id, name, status: t.status?.status || '', url: t.url || '' });
          if (matches.length >= 20) break;
        }
      }
      if (matches.length >= 20 || tasks.length < 100) break;
    }

    res.status(200).json({ results: matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/auth/me - Obtener usuario actual (JWT)
 */
async function me(req, res) {
  const auth = verificarAuth(req);
  if (!auth) return res.status(401).json({ error: 'No autorizado' });
  res.status(200).json({ user: auth });
}

/**
 * GET /api/data - Obtener todos los clientes
 */
async function getClientes(req, res) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true });
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/login - Login de usuario
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: 'Falta configurar JWT_SECRET en Vercel' });
    }
    
    // Verificación simple (en producción usar Supabase Auth)
    if (email === 'admin@holasuite.com' && password === 'hola2025') {
      const token = jwt.sign(
        { email, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(200).json({
        token,
        user: { email, role: 'admin' },
        clickup: {
          configured: Boolean((process.env.CLICKUP_API_KEY || '').trim()),
          listId: (process.env.CLICKUP_LIST_ID || '').trim()
        }
      });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/data - Crear cliente
 */
async function crearCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clientes')
      .insert([req.body])
      .select();
    
    if (error) throw error;
    res.status(201).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/data/:id - Actualizar cliente
 */
async function actualizarCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const id = req.query.id;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clientes')
      .update(req.body)
      .eq('id', id)
      .select();
    
    if (error) throw error;
    res.status(200).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/data/:id - Eliminar cliente
 */
async function eliminarCliente(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const id = req.query.id;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/sales/goals - Obtener metas de ventas
 */
async function getSalesGoals(req, res) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('sales_goals')
      .select('*')
      .order('mes', { ascending: false });
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/sales/goal - Crear/actualizar meta
 */
async function crearOActualizarGoal(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const { vendedor, mes, meta_clientes, meta_valor } = req.body;
    const supabase = getSupabase();
    
    // Intentar actualizar primero
    const { data: existente } = await supabase
      .from('sales_goals')
      .select('*')
      .eq('vendedor', vendedor)
      .eq('mes', mes);
    
    let data, error;
    
    if (existente && existente.length > 0) {
      ({ data, error } = await supabase
        .from('sales_goals')
        .update({ meta_clientes, meta_valor, updated_at: new Date() })
        .eq('vendedor', vendedor)
        .eq('mes', mes)
        .select());
    } else {
      ({ data, error } = await supabase
        .from('sales_goals')
        .insert([{ vendedor, mes, meta_clientes, meta_valor }])
        .select());
    }
    
    if (error) throw error;
    res.status(200).json(data?.[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/audit - Obtener logs de auditoría
 */
async function getAuditLogs(req, res) {
  try {
    const auth = verificarAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado' });
    
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.status(200).json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Router principal
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { query, method } = req;
  const path = query.path || [];
  
  try {
    // Rutas
    if (path[0] === 'login' && method === 'POST') {
      return login(req, res);
    }

    // Alias para compatibilidad con server.js / frontend
    if (path[0] === 'auth' && path[1] === 'login' && method === 'POST') {
      return login(req, res);
    }
    if (path[0] === 'auth' && path[1] === 'me' && method === 'GET') {
      return me(req, res);
    }

    if (path[0] === 'clickup' && path[1] === 'tasks' && method === 'GET') {
      return getClickUpTasks(req, res);
    }

    if (path[0] === 'clickup' && path[1] === 'task' && path[2] && path[3] === 'status' && method === 'POST') {
      req.query.id = path[2];
      return setClickUpStatus(req, res);
    }
    if (path[0] === 'clickup' && path[1] === 'task' && path[2] && path[3] === 'comment' && method === 'POST') {
      req.query.id = path[2];
      return addClickUpComment(req, res);
    }
    if (path[0] === 'clickup' && path[1] === 'task' && path[2] && path[3] === 'tag' && method === 'POST') {
      req.query.id = path[2];
      return addClickUpTag(req, res);
    }
    if (path[0] === 'clickup' && path[1] === 'task' && path[2] && path[3] === 'custom-field' && method === 'POST') {
      req.query.id = path[2];
      return setClickUpCustomField(req, res);
    }

    if (path[0] === 'public' && path[1] === 'search' && method === 'GET') {
      return publicSearch(req, res);
    }
    
    if (path[0] === 'data') {
      if (path[1]) {
        // Con ID
        if (method === 'PUT') return actualizarCliente(req, res);
        if (method === 'DELETE') return eliminarCliente(req, res);
      } else {
        // Sin ID
        if (method === 'GET') return getClientes(req, res);
        if (method === 'POST') return crearCliente(req, res);
      }
    }
    
    if (path[0] === 'sales') {
      if (path[1] === 'goal' && method === 'POST') {
        return crearOActualizarGoal(req, res);
      }
      if (path[1] === 'goals' && method === 'GET') {
        return getSalesGoals(req, res);
      }
    }
    
    if (path[0] === 'audit' && method === 'GET') {
      return getAuditLogs(req, res);
    }
    
    res.status(404).json({ error: 'Endpoint no encontrado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
