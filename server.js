'use strict';

const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const path       = require('path');
const NodeCache  = require('node-cache');
const { getUserDashboardConfig, saveUserDashboardConfig } = require('./dashboardConfig');
const { mapTasksToClients, computeTasksFingerprint, buscarFechaConcluidoFromDetails } = require('./clickupMapper');
const { importSalesFromSheet, syncSalesWithClients } = require('./salesImporter');
require('dotenv').config();

const app   = express();
const PORT  = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 3600 });
const STATIC_ROOT = __dirname;
const MAIN_HTML = path.join(STATIC_ROOT, 'vylex.html');
const FORM_SUBMISSIONS_FILE = path.join(STATIC_ROOT, 'form_submissions.json');
const REQUESTS_FILE = path.join(STATIC_ROOT, 'requests.json');

const PUBLIC_FILES = new Set([
  'vylex.html',
  'charts.js',
  'holasuite.html',
  'holasuitedashnueva.html',
  'dashnuevaholasuite.html',
  'vylex.html'
]);
let cacheMeta = {
  lastSyncAt: null,
  source: 'none',
  taskCount: 0
};

app.use(express.json());
app.use(cors());
app.use('/css', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, express.static(path.join(__dirname, 'css')));
app.use('/js', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, express.static(path.join(__dirname, 'js')));

// ================================================================
// AUDIT LOG SYSTEM
// ================================================================
const LOGS_FILE = path.join(STATIC_ROOT, 'audit_logs.json');
let auditSseClients = []; // SSE para auditoría (opcional)

function writeLog(user, action, details) {
  try {
    const logs = fs.existsSync(LOGS_FILE) ? JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')) : [];
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      user: user?.username || 'system',
      userId: user?.id || null,
      action,
      details
    };
    logs.unshift(newLog);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(0, 500), null, 2));
    
    // Broadcast via SSE
    auditSseClients.forEach(c => {
      try {
        c.res.write(`event: auditLog\ndata: ${JSON.stringify(newLog)}\n\n`);
      } catch (_e) {}
    });
  } catch (e) { console.error('Log error:', e); }
}

app.use((req, res, next) => {
  const oldJson = res.json;
  res.json = function(data) {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.path.includes('/auth/login')) {
      // Defer logging to not block response
      setImmediate(() => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          writeLog(req.user, `${req.method} ${req.path}`, req.body);
        }
      });
    }
    return oldJson.apply(res, arguments);
  };
  next();
});

// ================================================================
// CONFIGURACIÓN
// ================================================================
const CONFIG = {
  CLICKUP_API_KEY  : (process.env.CLICKUP_API_KEY || '').trim(),
  CLICKUP_LIST_ID  : (process.env.CLICKUP_LIST_ID || '').trim(),
  JWT_SECRET       : (process.env.JWT_SECRET || 'tu_jwt_secret_super_seguro_aqui').trim(),
  DIAS_META        : { kickoff:3, verificacion:2, instalacion:5, capacitacion:7, activacion:2, total:20 },
  TAREAS_IGNORAR   : ['configurar whatsapp','configurar telefonia','configurar instagram',
                      'configurar messenger','configurar webchat','teste','crear vm'],
  ESTADOS_IGNORAR  : ['revisión comercial','revision comercial'],
  PAISES: {
    'argentina':'Argentina','colombia':'Colombia','colômbia':'Colombia',
    'méxico':'México','mexico':'México','venezuela':'Venezuela',
    'república dominicana':'República Dominicana','republica dominicana':'República Dominicana',
    'peru':'Perú','perú':'Perú','ecuador':'Ecuador','honduras':'Honduras',
    'chile':'Chile','paraguay':'Paraguay','bolivia':'Bolivia','uruguay':'Uruguay',
    'costa rica':'Costa Rica','panamá':'Panamá','panama':'Panamá',
    'nicaragua':'Nicaragua','guatemala':'Guatemala','el salvador':'El Salvador',
    'brasil':'Brasil','brazil':'Brasil'
  },
  FERIADOS: {
    'Argentina' : ['01-01','02-24','02-25','03-24','04-02','04-18','04-19','05-01','05-25','06-17','06-20','07-09','08-17','10-12','11-20','12-08','12-25'],
    'Colombia'  : ['01-01','01-06','04-17','04-18','04-19','05-01','06-29','07-20','08-07','10-13','11-03','11-10','12-08','12-25'],
    'México'    : ['01-01','02-03','03-17','04-17','04-18','05-01','09-16','11-02','11-18','12-25'],
    'Brasil'    : ['01-01','02-12','02-13','04-17','04-18','04-21','05-01','06-19','09-07','10-12','11-02','11-15','11-20','12-25'],
    'Chile'     : ['01-01','04-17','04-18','05-01','05-21','07-16','08-15','09-18','09-19','10-12','12-08','12-25'],
    'Perú'      : ['01-01','04-17','04-18','05-01','06-29','07-28','07-29','08-30','11-01','12-08','12-25'],
    'Venezuela' : ['01-01','04-17','04-18','04-19','05-01','06-24','07-05','07-24','10-12','12-25'],
    'Ecuador'   : ['01-01','04-18','05-01','05-24','08-10','10-09','11-02','11-03','12-25'],
    'Honduras'  : ['01-01','04-14','04-15','04-17','04-18','05-01','09-15','10-03','10-12','12-25'],
    'Panamá'    : ['01-01','01-09','04-17','04-18','05-01','11-03','11-10','11-28','12-08','12-25']
  }
};

const ESTADOS_IMPL = [
  'listo para kickoff','en kickoff','en onboarding','listo para onboarding',
  'en análisis meta','en analisis meta',
  'listo para instalación','listo para instalacion','en instalación','en instalacion',
  'en capacitación','en capacitacion',
  'go-live','go live','activación canales','activacion canales',
  'concluído','concluido','closed','cerrado','cancelado','en espera wispro'
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const OPA_ALERT_RULES = {
  risk: {
    words: ['cancelar','baja','reembolso','cancel','cancelacion','sair','encerrar'],
    label: 'Riesgo de Cancelación',
    level: 'critical'
  },
  complaint: {
    words: ['malo','pesimo','ruim','horrible','no funciona','erro','error','bug','falha','falla','demora','tarda'],
    label: 'Insatisfacción / Queja',
    level: 'warning'
  },
  technical: {
    words: ['offline','caido','fora do ar','nao abre','no abre','lento','lentitud'],
    label: 'Problema Técnico',
    level: 'warning'
  },
  opportunity: {
    words: ['contratar','comprar','upgrade','plano novo','nuevo plan','querer mas','preciso de mais'],
    label: 'Oportunidad Comercial',
    level: 'info'
  }
};

// ================================================================
// USUARIOS
// ================================================================
const USERS_FILE = path.join(STATIC_ROOT, 'users.json');
function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ================================================================
// CONFIGURACIÓN GLOBAL (ClickUp, API, etc)
// ================================================================
const CONFIG_FILE = path.join(STATIC_ROOT, 'global_config.json');
const SALES_CONFIG_FILE = path.join(STATIC_ROOT, 'sales_config.json');
let sseClients = []; // Para sincronización en tiempo real

function readGlobalConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) { return {}; }
}
function writeGlobalConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  // Notificar a todos los clientes conectados
  broadcastEvent('configUpdated', config);
}

function readSalesConfig() {
  try {
    if (!fs.existsSync(SALES_CONFIG_FILE)) return { sellers: [], salesTargets: {}, monthlyGoals: {}, vendorMatches: {} };
    return JSON.parse(fs.readFileSync(SALES_CONFIG_FILE, 'utf8'));
  } catch (e) { return { sellers: [], salesTargets: {}, monthlyGoals: {}, vendorMatches: {} }; }
}
function writeSalesConfig(config) {
  fs.writeFileSync(SALES_CONFIG_FILE, JSON.stringify(config, null, 2));
  // Notificar a todos los clientes conectados
  broadcastEvent('salesConfigUpdated', config);
}

async function fetchGoogleSheetValues(sheetId, sheetName, apiKey) {
  if (!apiKey) {
    const err = new Error('Falta Google Sheets API Key (configura global_config.json.googleSheetsApiKey)');
    err.statusCode = 503;
    throw err;
  }
  if (!sheetId || !sheetName) {
    const err = new Error('sheetId y sheetName son requeridos');
    err.statusCode = 400;
    throw err;
  }
  const range = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, { timeout: 30000 });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Google Sheets HTTP ${resp.status}: ${text || resp.statusText}`);
    err.statusCode = resp.status;
    throw err;
  }
  const json = await resp.json();
  const values = Array.isArray(json?.values) ? json.values : [];
  if (values.length === 0) return [];
  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}

// Notificar eventos a todos los clientes SSE
function broadcastEvent(type, data) {
  sseClients.forEach(client => {
    try {
      client.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // Cliente desconectado
    }
  });
}

// ================================================================
// MIDDLEWARE AUTH
// ================================================================
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error:'Token requerido' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], CONFIG.JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error:'Token inválido o expirado' });
  }
}

// ================================================================
// FUNCIONES HELPER (portadas desde Google Apps Script)
// ================================================================
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function getHolaAuthHeader(token) {
  const raw = String(token || '').trim();
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
}

function validateHolaProxyInput(baseUrl, token) {
  if (!baseUrl || !token) {
    const err = new Error('URL base y token son requeridos');
    err.statusCode = 400;
    throw err;
  }
  let parsed;
  try {
    parsed = new URL(normalizeHolaBaseUrl(baseUrl));
  } catch (_err) {
    const err = new Error('URL base inválida');
    err.statusCode = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const err = new Error('La URL base debe usar http o https');
    err.statusCode = 400;
    throw err;
  }
}

async function fetchJsonWithFallbackServer(urls, headers) {
  const errors = [];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers, timeout: 30000 });
      if (!resp.ok) {
        errors.push(`${resp.status} @ ${url}`);
        continue;
      }
      const json = await resp.json();
      return { json, url };
    } catch (err) {
      errors.push(`${err.message} @ ${url}`);
    }
  }
  const error = new Error(errors.slice(0, 4).join(' | ') || 'Sin respuesta de la API de Opa/Hola');
  error.statusCode = 502;
  throw error;
}

async function fetchHolaDepartments(baseUrl, headers) {
  const plain = normalizeHolaBaseUrl(baseUrl);
  const api = normalizeHolaApiBase(baseUrl);
  const { json } = await fetchJsonWithFallbackServer([
    `${api}/departamento`,
    `${api}/departamento/`,
    `${plain}/departamento`
  ], headers);
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return rows.reduce((acc, row) => {
    const id = String(row._id || row.id || '').trim();
    if (id) acc[id] = row;
    return acc;
  }, {});
}

async function fetchHolaConversationsRemote(baseUrl, token, workspace = '') {
  validateHolaProxyInput(baseUrl, token);
  const plain = normalizeHolaBaseUrl(baseUrl);
  const api = normalizeHolaApiBase(baseUrl);
  const headers = {
    Authorization: getHolaAuthHeader(token),
    'Content-Type': 'application/json'
  };
  const ws = String(workspace || '').trim();
  const departments = await fetchHolaDepartments(baseUrl, headers).catch(() => ({}));
  const { json, url } = await fetchJsonWithFallbackServer([
    `${api}/atendimento`,
    ...(ws ? [`${api}/atendimento?workspace=${encodeURIComponent(ws)}`] : []),
    `${api}/conversations?page=1&per_page=100${ws ? `&workspace=${encodeURIComponent(ws)}` : ''}`,
    ...(ws ? [`${api}/workspaces/${encodeURIComponent(ws)}/conversations?page=1&per_page=100`] : []),
    `${api}/chats?page=1&per_page=100${ws ? `&workspace=${encodeURIComponent(ws)}` : ''}`,
    `${plain}/conversations?page=1&per_page=100`
  ], headers);
  const conversations = json.data || json.conversations || json.items || json.results || json || [];
  return {
    conversations: Array.isArray(conversations) ? conversations : [conversations],
    departments,
    resolvedPath: url.startsWith(api) ? url.replace(api, '') : url.replace(plain, '')
  };
}

async function fetchHolaAttendanceDetailRemote(baseUrl, token, attendanceId) {
  validateHolaProxyInput(baseUrl, token);
  const plain = normalizeHolaBaseUrl(baseUrl);
  const api = normalizeHolaApiBase(baseUrl);
  const headers = {
    Authorization: getHolaAuthHeader(token),
    'Content-Type': 'application/json'
  };

  let detailData = null;
  let messageData = null;
  const attempts = [
    { type: 'detail', url: `${api}/atendimento/${encodeURIComponent(attendanceId)}` },
    { type: 'messages', url: `${api}/atendimento/mensagem/${encodeURIComponent(attendanceId)}` },
    { type: 'detail', url: `${plain}/atendimento/${encodeURIComponent(attendanceId)}` },
    { type: 'messages', url: `${plain}/atendimento/mensagem/${encodeURIComponent(attendanceId)}` }
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      const resp = await fetch(attempt.url, { headers, timeout: 30000 });
      if (!resp.ok) {
        errors.push(`${resp.status} @ ${attempt.url}`);
        continue;
      }
      const json = await resp.json();
      if (!json?.data) continue;
      if (attempt.type === 'detail' && !detailData) detailData = json.data;
      if (attempt.type === 'messages' && !messageData) messageData = json.data;
      if (detailData && messageData) break;
    } catch (err) {
      errors.push(`${err.message} @ ${attempt.url}`);
    }
  }
  if (!detailData && !messageData) {
    const error = new Error(errors.slice(0, 4).join(' | ') || 'No se pudo obtener el detalle del atendimento');
    error.statusCode = 502;
    throw error;
  }
  const merged = { ...(detailData || {}), ...(messageData || {}) };
  merged.id_rota = messageData?.id_rota || detailData?.id_rota || merged.id_rota || null;
  merged.observacoes = [...(detailData?.observacoes || []), ...(messageData?.observacoes || [])];
  merged.motivos = [...(detailData?.motivos || []), ...(messageData?.motivos || [])];
  if (messageData?.mensagem) merged.mensagem = messageData.mensagem;
  return merged;
}

function analyzeConversation(conv) {
  const text = normalizeText((conv.last_message || conv.mensagem || conv.subject || '').slice(0, 500));
  const alerts = [];
  
  for (const [key, rule] of Object.entries(OPA_ALERT_RULES)) {
    if (rule.words.some(word => text.includes(word))) {
      alerts.push({
        type: key,
        label: rule.label,
        level: rule.level
      });
    }
  }
  
  return {
    ...conv,
    auto_analysis: {
      alerts,
      is_critical: alerts.some(a => a.level === 'critical'),
      score: alerts.length
    }
  };
}

function sendPublicFile(res, filename) {
  if (!PUBLIC_FILES.has(filename)) {
    return res.status(404).json({ error:'Archivo no disponible' });
  }
  return res.sendFile(path.join(STATIC_ROOT, filename));
}

function getClickUpApiKey(explicitKey = '') {
  const globalConfig = readGlobalConfig();
  const apiKey = String(globalConfig.clickupApiKey || CONFIG.CLICKUP_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('Falta API Key de ClickUp (configura CLICKUP_API_KEY o /api/config/global)');
    err.statusCode = 503;
    throw err;
  }
  return apiKey;
}

function getClickUpListId(explicitId = '') {
  const globalConfig = readGlobalConfig();
  const listId = String(explicitId || globalConfig.clickupListId || CONFIG.CLICKUP_LIST_ID || '').trim();
  if (!listId) {
    const err = new Error('Falta List ID de ClickUp (configura CLICKUP_LIST_ID o /api/config/global)');
    err.statusCode = 503;
    throw err;
  }
  return listId;
}

function readFormSubmissions() {
  try {
    if (!fs.existsSync(FORM_SUBMISSIONS_FILE)) return [];
    const raw = fs.readFileSync(FORM_SUBMISSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeFormSubmissions(items) {
  fs.writeFileSync(FORM_SUBMISSIONS_FILE, JSON.stringify(items, null, 2));
}

function readRequests() {
  try {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
  } catch (e) { return []; }
}
function writeRequests(requests) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

async function createClickUpTask(listId, name, description, tags = []) {
  const apiKey = getClickUpApiKey();
  const resp = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      description,
      tags,
      status: 'to do'
    }),
    timeout: 30000
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.err || json?.error || `ClickUp HTTP ${resp.status}`);
  return json;
}

function findCustomField(cf, names) {
  const normalizedNames = names.map(normalizeText);
  let bestMatch = null;

  cf.forEach(field => {
    const fieldName = normalizeText(field.name);
    normalizedNames.forEach(name => {
      const exactScore = fieldName === name ? 3 : 0;
      const startsWithScore = !exactScore && fieldName.startsWith(name) ? 2 : 0;
      const includesScore = !exactScore && !startsWithScore && fieldName.includes(name) ? 1 : 0;
      const score = exactScore || startsWithScore || includesScore;
      if (score && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { field, score };
      }
    });
  });

  return bestMatch ? bestMatch.field : undefined;
}

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function requireEnvConfig(keys) {
  const missing = keys.filter(key => !CONFIG[key]);
  if (missing.length) {
    const err = new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
    err.statusCode = 503;
    throw err;
  }
}

function normCons(n) {
  if (!n || n === '' || n === 'N/A' || n === '-') return '';
  const l = normalizeText(n);
  const map = {
    'edwin leonardo franco campos':'Edwin Franco','edwin franco campos':'Edwin Franco',
    'edwin franco':'Edwin Franco','edwin':'Edwin Franco','franco':'Edwin Franco',
    'alejandro jose zambrano':'Alejandro Zambrano','alejandro zambrano':'Alejandro Zambrano',
    'alejandro':'Alejandro Zambrano','zambrano':'Alejandro Zambrano',
    'mariane aparecida telo':'Mariane Teló','mariane telo':'Mariane Teló',
    'mariane':'Mariane Teló','telo':'Mariane Teló','mari telo':'Mariane Teló'
  };
  if (map[l]) return map[l];
  for (const [k,v] of Object.entries(map)) {
    if (l.includes(k) && k.length >= 4) return v;
  }
  return '';
}

function getCampo(cf, nom, tipo) {
  const f = findCustomField(cf, [nom]);
  if (!f) return tipo === 'number' ? 0 : '';
  try {
    switch(tipo) {
      case 'number'  : return parseFloat(f.value) || 0;
      case 'date'    : return f.value ? parseInt(f.value) : null;
      case 'dropdown':
        if (f.value === null || f.value === undefined) return '';
        if (f.type_config?.options) {
          const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value) || x.id === f.value);
          return o ? (o.name || o.label || '') : '';
        }
        return f.value?.toString() || '';
      default:
        if (!f.value && f.value !== 0) return '';
        if (typeof f.value === 'string') return f.value.trim();
        return f.value?.toString() || '';
    }
  } catch(e) { return tipo === 'number' ? 0 : ''; }
}

function getPais(cf) {
  const f = findCustomField(cf, ['país', 'pais']);
  if (!f || (f.value === null || f.value === undefined)) return '';
  try {
    if (f.type_config?.options) {
      const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value) || x.id === f.value);
      if (o?.name) {
        const pn = normalizeText(o.name);
        return CONFIG.PAISES[pn] || o.name;
      }
    }
    if (typeof f.value === 'string') {
      const pn = normalizeText(f.value);
      return CONFIG.PAISES[pn] || f.value.trim();
    }
  } catch(e) {}
  return '';
}

function getPlan(cf) {
  const f = findCustomField(cf, ['plan']);
  if (!f || (f.value === null || f.value === undefined)) return '';
  try {
    if (f.type_config?.options) {
      const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value) || x.id === f.value);
      if (o) return (o.name || o.label || '').trim();
    }
    if (typeof f.value === 'string') return f.value.trim();
  } catch(e) {}
  return '';
}

function diasHab(ini, fin, pais) {
  if (!ini || !fin) return 0;
  let d = 0;
  let a = new Date(ini);
  const f = new Date(fin);
  const fer = CONFIG.FERIADOS[pais] || [];
  while (a <= f) {
    const ds = a.getDay();
    const mm = String(a.getMonth()+1).padStart(2,'0');
    const dd = String(a.getDate()).padStart(2,'0');
    const md = mm + '-' + dd;
    if (ds !== 0 && ds !== 6 && !fer.includes(md)) d++;
    a.setDate(a.getDate()+1);
  }
  return d;
}

function debeIgnorar(t) {
  const n = normalizeText(t.name);
  if (CONFIG.TAREAS_IGNORAR.some(x => n.includes(x))) return true;
  const s = normalizeText(t.status.status);
  if (CONFIG.ESTADOS_IGNORAR.includes(s)) return true;
  return false;
}

function esValido(t) {
  if (debeIgnorar(t)) return false;
  const s = normalizeText(t.status.status);
  return ESTADOS_IMPL.some(e => s.includes(normalizeText(e)));
}

function formatMes(fecha) {
  if (!fecha) return 'N/A';
  const f = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(f.getTime())) return 'N/A';
  return MESES[f.getMonth()] + ' ' + f.getFullYear();
}

function fmtFecha(ms) {
  if (!ms) return '';
  const f = new Date(ms);
  return f.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// ================================================================
// LÓGICA: PROCESAR UNA TAREA DE CLICKUP → OBJETO NORMALIZADO
// ================================================================
function procesarTarea(t) {
  const cf  = t.custom_fields || [];
  const now = new Date();
  const creado    = new Date(parseInt(t.date_created));
  const actualizado = new Date(parseInt(t.date_updated));
  const cerrado   = t.date_closed ? new Date(parseInt(t.date_closed)) : null;
  const eLower    = normalizeText(t.status.status);

  /* ---- ESTADO ---- */
  const esConcluido = eLower.includes('conclu') || eLower === 'closed' || eLower === 'cerrado';
  const esCancelado = eLower === 'cancelado';
  const enProceso   = !esConcluido && !esCancelado;

  /* ---- FECHAS ---- */
  let fInicioMs = getCampo(cf,'Fecha Inicio Kickoff','date') ||
                  getCampo(cf,'Fecha Inicio Onboarding','date');
  const fInicio = fInicioMs ? new Date(fInicioMs) : creado;
  const fActiv  = esConcluido ? (cerrado || actualizado) : null;
  const fCanc   = esCancelado ? (cerrado || actualizado) : null;

  /* ---- PAIS / PLAN ---- */
  const pais = getPais(cf) || 'No definido';
  const plan = getPlan(cf) || '';

  /* ---- DÍAS ---- */
  let dImpl = 0;
  if (esConcluido && fActiv) dImpl = diasHab(fInicio, fActiv, pais);
  else if (esCancelado && fCanc) dImpl = diasHab(fInicio, fCanc, pais);
  else dImpl = diasHab(fInicio, now, pais);

  const dUso = (esConcluido && fActiv)
    ? Math.floor((now - fActiv) / 86400000) : 0;
  const dSinMov = !esConcluido && !esCancelado
    ? Math.floor((now - actualizado) / 86400000) : 0;

  /* ---- STATUS ---- */
  let status = enProceso ? 'En Implementación' : esConcluido ? 'Activo' : 'Cancelado';

  /* ---- ALERTA ---- */
  let alerta = '';
  if (enProceso) {
    if (dImpl > CONFIG.DIAS_META.total) alerta = 'CRITICA';
    else if (dSinMov > 7)              alerta = 'SIN_MOV';
  }

  /* ---- CANALES ---- */
  const canField = findCustomField(cf, ['canales contratados']);
  const canales  = [];
  if (canField?.value && Array.isArray(canField.value)) {
    const opts = canField.type_config?.options || [];
    canField.value.forEach(item => {
      let label = '';
      if (typeof item === 'string') {
        const o = opts.find(x => x.id === item);
        label = o ? (o.label || o.name || '') : item;
      } else if (typeof item === 'object') {
        label = item.label || item.name || '';
      }
      if (label.trim()) canales.push(label.toLowerCase().trim());
    });
  }

  const wa  = canales.some(c => c.includes('whatsapp'))              ? 'SÍ' : 'NO';
  const ig  = canales.some(c => c.includes('instagram'))             ? 'SÍ' : 'NO';
  const wc  = canales.some(c => c.includes('webchat'))               ? 'SÍ' : 'NO';
  const pbx = canales.some(c => c.includes('pbx')||c.includes('telefon')) ? 'SÍ' : 'NO';
  const tg  = canales.some(c => c.includes('telegram'))              ? 'SÍ' : 'NO';
  const msg = canales.some(c => c.includes('messenger'))             ? 'SÍ' : 'NO';

  /* ---- RESPONSABLES ---- */
  function buscarResp(terminos) {
    for (const t2 of terminos) {
      const campo = findCustomField(cf, [t2]);
      if (!campo?.value) continue;
      if (Array.isArray(campo.value) && campo.value.length > 0) {
        const n = campo.value[0]?.username || campo.value[0]?.name || '';
        const norm = normCons(n);
        if (norm) return norm;
        if (n.length > 2) return n;
      }
      if (typeof campo.value === 'string' && campo.value.trim().length > 2) {
        return normCons(campo.value) || campo.value.trim();
      }
    }
    return '';
  }

  const rKickoff = buscarResp(['responsable por el kickoff','responsable kickoff','responsable onboarding']);
  const rVer     = buscarResp(['responsable por el análisis','responsable verificaci']);
  const rCap     = buscarResp(['responsable por capacitación','responsable capacit']);
  const rGoLive  = buscarResp(['responsable por el go-live','responsable go-live','responsable go live']);
  const rAct     = buscarResp(['responsable por la activación','responsable activaci']);
  const rVenta   = buscarResp(['responsable comercial','responsable venta','vendedor','responsable de venta']);

  /* ---- IP / DOMINIO ---- */
  const ip      = getCampo(cf,'IP Hola','text');
  const dominio = getCampo(cf,'Domínio','text') || getCampo(cf,'Dominio','text');
  let linkHola  = '';
  if (ip) {
    const esIP = /^\d+\.\d+\.\d+\.\d+$/.test(ip);
    linkHola = esIP ? 'https://'+ip : (ip.startsWith('http') ? ip : 'https://'+ip);
  } else if (dominio) {
    linkHola = dominio.startsWith('http') ? dominio : 'https://'+dominio;
  }

  /* ---- TAGS ---- */
  const tags    = (t.tags||[]).map(x => normalizeText(x.name));
  const tagsStr = tags.join(',');
  const tipoF   = findCustomField(cf, ['tipo de implementación', 'tipo de implementacion']);
  const tipo    = (tipoF?.value?.toString() === '1' || tagsStr.includes('upgrade')) ? 'Upgrade' : 'Implementación';

  /* ---- CAPACITACIONES ---- */
  const cantCap = getCampo(cf,'cantidad de capacitaciones','number') || 0;
  const hCap    = getCampo(cf,'horas de capacitación','number') ||
                  getCampo(cf,'cantidad de horas','number') || 0;

  /* ---- MOTIVO ---- */
  const motivo  = getCampo(cf,'Motivos de baja','dropdown') || (esCancelado ? 'No especificado' : '');

  /* ---- EMAIL / TEL ---- */
  const email   = getCampo(cf,'E-mail','email') || getCampo(cf,'email','text');
  const tel     = getCampo(cf,'Número para contacto','text');

  /* ---- MÓDULOS ---- */
  const modCancelados  = getCampo(cf,'módulos cancelados','text') || getCampo(cf,'módulo cancelado','text') || '';
  const modAdicionados = getCampo(cf,'módulos adicionados','text') || getCampo(cf,'upsell','text') || '';

  return {
    id            : t.id,
    nombre        : t.name,
    url           : t.url,
    estado        : t.status.status,
    status,
    statusType    : esConcluido ? 'activo' : esCancelado ? 'cancelado' : 'impl',
    alerta,
    tipo,
    pais,
    plan,
    email,
    telefono      : tel,
    ip,
    dominio,
    linkHola,
    fInicio       : fInicio.getTime(),
    fInicioFmt    : fmtFecha(fInicio.getTime()),
    fActivacion   : fActiv ? fActiv.getTime() : null,
    fActivacionFmt: fActiv ? fmtFecha(fActiv.getTime()) : '',
    fCancelacion  : fCanc  ? fCanc.getTime()  : null,
    fCancelacionFmt: fCanc ? fmtFecha(fCanc.getTime()) : '',
    fActualizado  : actualizado.getTime(),
    dImpl,
    mImpl         : +(dImpl/30).toFixed(1),
    dUso,
    mUso          : +(dUso/30).toFixed(1),
    dSinMov,
    mesInicio     : formatMes(fInicio),
    mesFin        : fActiv  ? formatMes(fActiv)  : (fCanc ? formatMes(fCanc) : ''),
    mesAct        : fActiv  ? formatMes(fActiv)  : '',
    rKickoff, rVer, rCap, rGoLive, rAct, rVenta,
    cantCap, hCap, motivo,
    modCancelados, modAdicionados,
    canales: { wa, ig, wc, pbx, tg, msg },
    tags          : tagsStr,
    valorVenta    : getCampo(cf, 'Valor Venta', 'number') || getCampo(cf, 'monto', 'number') || 0,
    vendedor      : rVenta || '',
    sinReq        : tagsStr.includes('sin requisitos')      ? 'SÍ' : 'NO',
    pausada       : tagsStr.includes('pausada')             ? 'SÍ' : 'NO',
    espCli        : tagsStr.includes('esperando cliente')   ? 'SÍ' : 'NO',
    moro          : tagsStr.includes('morosidad')           ? 'SÍ' : 'NO',
    upgImpl       : (tagsStr.includes('upgrade') || tipo === 'Upgrade') && !esConcluido ? 'SÍ' : 'NO'
  };
}

// ================================================================
// CLICKUP: OBTENER TAREAS (con caché)
// ================================================================

// Acceso al mapa de campos personalizados desde global_config.json
// Prioridad: global_config > process.env > objeto vacío
function getClickUpCustomFieldMap() {
  const cfg = readGlobalConfig();
  return (cfg.clickupCustomFieldMap && typeof cfg.clickupCustomFieldMap === 'object')
    ? cfg.clickupCustomFieldMap
    : {};
}



async function obtenerTareasClickUp() {
  const CACHE_KEY = 'clickup_tasks_raw';
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    cacheMeta.source = 'cache';
    cacheMeta.taskCount = cached.length;
    return cached;
  }

  // Intentar obtener de ClickUp
  try {
    const apiKey = getClickUpApiKey();
    const listId = getClickUpListId();
    
    // Usar la función optimizada que ya entrega datos crudos
    const rawTasks = await obtenerTareasClickUpRaw({ apiKey, listId });
    
    cache.set(CACHE_KEY, rawTasks, 1800); // 30 min cache
    cacheMeta = {
      lastSyncAt: new Date().toISOString(),
      source: 'clickup',
      taskCount: rawTasks.length
    };
    return rawTasks;
  } catch (err) {
    // Fallback: leer clientes.json generado por el sync completo
    console.warn('ClickUp no disponible, intentando clientes.json:', err.message);
    const clientesFileFallback = path.join(STATIC_ROOT, 'data', 'clientes.json');
    if (fs.existsSync(clientesFileFallback)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(clientesFileFallback, 'utf8'));
        const clientes = Array.isArray(parsed?.clientes) ? parsed.clientes : [];
        if (clientes.length > 0) {
          cache.set(CACHE_KEY, clientes);
          cacheMeta = {
            lastSyncAt: parsed.updatedAt || null,
            source: 'file',
            taskCount: clientes.length
          };
          return clientes;
        }
      } catch (fileErr) {
        console.error('Error leyendo clientes.json:', fileErr.message);
      }
    }
    throw err; // re-lanzar si no hay fallback disponible
  }
}

function invalidarCache() {
  cache.del('clickup_tasks');
}

// ================================================================
// CONSTRUIR DASHBOARD ANALYTICS
// ================================================================
function buildDashboard(tasks) {
  const activos    = tasks.filter(t => t.status === 'Activo');
  const enProceso  = tasks.filter(t => t.status === 'En Implementación');
  const cancelados = tasks.filter(t => t.status === 'Cancelado');

  /* ---- KPIs ---- */
  const total        = tasks.length;
  const tasaExito    = total > 0 ? +((activos.length/total)*100).toFixed(1) : 0;
  const tasaCancel   = total > 0 ? +((cancelados.length/total)*100).toFixed(1) : 0;
  const promDiasImpl = activos.length > 0
    ? +(activos.reduce((s,t)=>s+t.dImpl,0)/activos.length).toFixed(1) : 0;

  /* ---- CANALES ACTIVOS ---- */
  const canales = {
    WhatsApp  : activos.filter(t=>t.canales.wa==='SÍ').length,
    Instagram : activos.filter(t=>t.canales.ig==='SÍ').length,
    WebChat   : activos.filter(t=>t.canales.wc==='SÍ').length,
    PBX       : activos.filter(t=>t.canales.pbx==='SÍ').length,
    Telegram  : activos.filter(t=>t.canales.tg==='SÍ').length,
    Messenger : activos.filter(t=>t.canales.msg==='SÍ').length
  };

  /* ---- POR PAÍS ---- */
  const porPais = {};
  tasks.forEach(t => {
    const p = t.pais || 'No definido';
    if (!porPais[p]) porPais[p] = { total:0, activos:0, enProceso:0, cancelados:0 };
    porPais[p].total++;
    if (t.status==='Activo')            porPais[p].activos++;
    if (t.status==='En Implementación') porPais[p].enProceso++;
    if (t.status==='Cancelado')         porPais[p].cancelados++;
  });

  /* ---- POR CONSULTOR ---- */
  const porConsultor = {};
  tasks.forEach(t => {
    [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct]
      .filter(r => r && r !== '')
      .forEach(consultor => {
        if (!porConsultor[consultor])
          porConsultor[consultor] = { total:0, activos:0, enProceso:0, cancelados:0, etapas:0 };
        porConsultor[consultor].etapas++;
      });
    const participantes = new Set([t.rKickoff,t.rVer,t.rCap,t.rGoLive,t.rAct].filter(r=>r&&r!==''));
    participantes.forEach(c => {
      porConsultor[c].total++;
      if (t.status==='Activo')            porConsultor[c].activos++;
      if (t.status==='En Implementación') porConsultor[c].enProceso++;
      if (t.status==='Cancelado')         porConsultor[c].cancelados++;
    });
  });

  /* ---- POR MES ---- */
  const porMes = {};
  tasks.forEach(t => {
    const mes = t.mesInicio || 'Sin mes';
    if (!porMes[mes]) porMes[mes] = { mes, iniciadas:0, finalizadas:0, canceladas:0, enCurso:0 };
    porMes[mes].iniciadas++;
    if (t.status==='Activo')            porMes[mes].finalizadas++;
    if (t.status==='Cancelado')         porMes[mes].canceladas++;
    if (t.status==='En Implementación') porMes[mes].enCurso++;
  });

  /* ---- ALERTAS ---- */
  const alertas = {
    criticas    : tasks.filter(t=>t.alerta==='CRITICA').length,
    sinMovimiento: tasks.filter(t=>t.alerta==='SIN_MOV').length,
    pausadas    : tasks.filter(t=>t.pausada==='SÍ').length,
    esperandoCli: tasks.filter(t=>t.espCli==='SÍ').length,
    morosidad   : tasks.filter(t=>t.moro==='SÍ').length
  };

  /* ---- TIPOS ---- */
  const porTipo = {
    Implementación: tasks.filter(t=>t.tipo==='Implementación').length,
    Upgrade       : tasks.filter(t=>t.tipo==='Upgrade').length
  };

  const ultimaActualizacion = new Date().toISOString();

  return {
    kpis: { total, activos:activos.length, enProceso:enProceso.length,
            cancelados:cancelados.length, tasaExito, tasaCancel, promDiasImpl },
    canales, porPais, porConsultor, porMes, alertas, porTipo,
    ultimaActualizacion,
    meta: {
      ultimaActualizacion,
      ultimaSincronizacion: cacheMeta.lastSyncAt,
      fuente: cacheMeta.source,
      registros: cacheMeta.taskCount
    }
  };
}

// ================================================================
// RUTAS - AUTH
// ================================================================
app.post('/api/auth/login', (req, res) => {
  if (!CONFIG.JWT_SECRET) {
    return res.status(503).json({ error:'Falta configurar JWT_SECRET en el entorno' });
  }
  const { username, password, lang } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: lang==='pt' ? 'Usuário e senha são obrigatórios' : 'Usuario y contraseña requeridos' });

  const usersList = readUsers();
  const user = usersList.find(u => u.username === username.toLowerCase() && u.password === password);
  if (!user)
    return res.status(401).json({ error: lang==='pt' ? 'Credenciais inválidas' : 'Credenciales inválidas' });

  const token = jwt.sign(
    { id:user.id, username:user.username, role:user.role, name:user.name },
    CONFIG.JWT_SECRET,
    { expiresIn:'8h' }
  );
  
  // Obtener configuración global guardada (sin exponer secretos al cliente)
  const globalConfig = readGlobalConfig();
  const listId = globalConfig.clickupListId || process.env.CLICKUP_LIST_ID;
  
  res.json({ 
    token, 
    user:{ id:user.id, name:user.name, role:user.role, username:user.username },
    clickup: {
      configured: Boolean(globalConfig.clickupApiKey || process.env.CLICKUP_API_KEY),
      listId: listId || ''
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, name, lang } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ error: lang==='pt' ? 'Todos os campos são obrigatórios' : 'Todos los campos son requeridos' });

  const usersList = readUsers();
  if (usersList.some(u => u.username === username.toLowerCase())) {
    return res.status(400).json({ error: lang==='pt' ? 'Usuário já existe' : 'El usuario ya existe' });
  }

  const newUser = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    username: username.toLowerCase().trim(),
    password: password,
    name: name.trim(),
    role: 'consultant',
    createdAt: new Date().toISOString()
  };

  usersList.push(newUser);
  writeUsers(usersList);

  const token = jwt.sign(
    { id:newUser.id, username:newUser.username, role:newUser.role, name:newUser.name },
    CONFIG.JWT_SECRET,
    { expiresIn:'8h' }
  );

  res.json({ 
    token,
    user: { id:newUser.id, name:newUser.name, role:newUser.role, username:newUser.username },
    clickup: {
      configured: Boolean(process.env.CLICKUP_API_KEY),
      listId: process.env.CLICKUP_LIST_ID || ''
    }
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// Obtener información de red (IP local)
app.get('/api/network-info', (req, res) => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  let localIp = 'localhost';
  
  // Buscar primera IP local (no loopback)
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
    if (localIp !== 'localhost') break;
  }
  
  res.json({ localIp, port: PORT });
});

// Generar link compartible de kanban
app.post('/api/kanbans/:id/generate-share-link', auth, (req, res) => {
  const data = readKanbans();
  const kanban = data.kanbans.find(kb => kb.id === req.params.id);
  
  if (!kanban) return res.status(404).json({ error: 'Kanban no encontrado' });
  if (kanban.ownerId !== req.user.id && !kanban.sharedWith?.includes(req.user.id)) {
    return res.status(403).json({ error: 'Prohibido' });
  }
  
  // Generar token de compartir válido por 30 días
  const shareToken = jwt.sign(
    { kbId: req.params.id, ownerId: kanban.ownerId, type: 'share' },
    CONFIG.JWT_SECRET,
    { expiresIn: '30d' }
  );
  
  const shareLink = `${req.protocol}://${req.get('host')}/vylex.html?share=${shareToken}`;
  res.json({ shareLink, token: shareToken });
});

// Obtener datos del kanban compartido sin login
app.get('/api/kanbans/:id/shared', (req, res) => {
  const { share } = req.query;
  if (!share) return res.status(400).json({ error: 'Token requerido' });
  
  try {
    const decoded = jwt.verify(share, CONFIG.JWT_SECRET);
    if (decoded.type !== 'share' || decoded.kbId !== req.params.id) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    const data = readKanbans();
    const kanban = data.kanbans.find(kb => kb.id === req.params.id);
    if (!kanban) return res.status(404).json({ error: 'Kanban no encontrado' });
    
    res.json({ kanban, owner: { id: decoded.ownerId } });
  } catch (e) {
    res.status(401).json({ error: 'Token expirado o inválido' });
  }
});

// ================================================================
// RUTAS - USUARIOS
// ================================================================
app.get('/api/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const users = readUsers();
  res.json({ users: users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role })) });
});

app.post('/api/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const users = readUsers();
  const newUser = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    username: String(req.body.username || '').toLowerCase().trim(),
    password: String(req.body.password || ''),
    role: String(req.body.role || 'consultant'),
    name: String(req.body.name || '').trim()
  };
  if (!newUser.username || !newUser.password || !newUser.name) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  if (users.some(u => u.username === newUser.username)) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  users.push(newUser);
  writeUsers(users);
  res.json({ ok: true, user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role } });
});

app.put('/api/users/:id/password', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const users = readUsers();
  const id = parseInt(req.params.id, 10);
  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const newPassword = String(req.body.password || '').trim();
  if (!newPassword) return res.status(400).json({ error: 'Contraseña vacía' });
  user.password = newPassword;
  writeUsers(users);
  res.json({ ok: true, message: 'Contraseña actualizada' });
});

app.delete('/api/users/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  let users = readUsers();
  const id = parseInt(req.params.id, 10);
  if (req.user.id === id) return res.status(400).json({ error: 'No puedes borrar tu propio usuario' });
  users = users.filter(u => u.id !== id);
  writeUsers(users);
  res.json({ ok: true });
});

// ================================================================
// RUTAS - CONFIGURACIÓN GLOBAL
// ================================================================
app.get('/api/config/global', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readGlobalConfig();
  const safe = { ...config };
  if (safe.clickupApiKey) safe.clickupApiKey = '********';
  if (safe.holaToken) safe.holaToken = '********';
  safe.hasClickupApiKey = Boolean(config.clickupApiKey || process.env.CLICKUP_API_KEY);
  safe.hasHolaToken = Boolean(config.holaToken || process.env.HOLA_API_TOKEN);
  res.json(safe);
});

app.post('/api/config/global', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readGlobalConfig();
  const b = req.body || {};

  // Campos de integración principal
  if (b.clickupApiKey  !== undefined) config.clickupApiKey  = b.clickupApiKey;
  if (b.clickupListId  !== undefined) config.clickupListId  = b.clickupListId;
  if (b.holaUrl        !== undefined) config.holaUrl        = b.holaUrl;
  if (b.holaToken      !== undefined) config.holaToken      = b.holaToken;
  if (b.holaWs         !== undefined) config.holaWs         = b.holaWs;

  // Listas de ClickUp para solicitudes internas
  if (b.clickupListIdBajas    !== undefined) config.clickupListIdBajas    = b.clickupListIdBajas;
  if (b.clickupListIdUpgrades !== undefined) config.clickupListIdUpgrades = b.clickupListIdUpgrades;

  // Mapeo de campos personalizados de ClickUp
  if (b.clickupCustomFieldMap !== undefined && typeof b.clickupCustomFieldMap === 'object') {
    config.clickupCustomFieldMap = { ...(config.clickupCustomFieldMap || {}), ...b.clickupCustomFieldMap };
  }

  // Metas por consultor (distribución automática)
  if (b.consultantMetas !== undefined && typeof b.consultantMetas === 'object') {
    config.consultantMetas = b.consultantMetas;
  }

  // Google Sheets (ventas y dominios)
  if (b.googleSheetsApiKey !== undefined) config.googleSheetsApiKey = b.googleSheetsApiKey;
  if (b.salesSheetId       !== undefined) config.salesSheetId       = b.salesSheetId;
  if (b.salesSheetName     !== undefined) config.salesSheetName     = b.salesSheetName;
  if (b.domainSheetId      !== undefined) config.domainSheetId      = b.domainSheetId;
  if (b.domainSheetName    !== undefined) config.domainSheetName    = b.domainSheetName;

  writeGlobalConfig(config);
  const safe = { ...config };
  if (safe.clickupApiKey) safe.clickupApiKey = '********';
  if (safe.holaToken)     safe.holaToken     = '********';
  safe.hasClickupApiKey = Boolean(config.clickupApiKey || process.env.CLICKUP_API_KEY);
  safe.hasHolaToken     = Boolean(config.holaToken     || process.env.HOLA_API_TOKEN);
  res.json({ ok: true, config: safe });
});

// ================================================================
// RUTAS - CONFIGURACIÓN DE DASHBOARD (por usuario/rol)
// ================================================================
app.get('/api/dashboard/config', auth, (req, res) => {
  try {
    const resolved = getUserDashboardConfig(req.user);
    res.json(resolved);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/dashboard/config', auth, (req, res) => {
  try {
    const widgets = req.body?.widgets;
    if (!Array.isArray(widgets)) {
      return res.status(400).json({ error: 'widgets debe ser un array' });
    }
    saveUserDashboardConfig(req.user, widgets);
    writeLog(req.user, 'UPDATE_DASHBOARD_CONFIG', { userId: req.user.id, widgetCount: widgets.length });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// SSE - SINCRONIZACIÓN EN TIEMPO REAL
// ================================================================
app.get('/api/events', (req, res) => {
  // Verificar token desde URL o header
  let token = req.query.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  
  let user;
  try {
    user = jwt.verify(token, CONFIG.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const client = { res, user };
  sseClients.push(client);
  
  // Enviar evento de conexión
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);
  
  // Mantener conexión viva
  const keepAlive = setInterval(() => {
    res.write(`:keepalive\n\n`);
  }, 30000);
  
  // Limpiar cuando el cliente se desconecta
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients = sseClients.filter(c => c.res !== res);
  });
});

// SSE opcional para auditoría (no usado por el frontend principal)
app.get('/api/audit/events', auth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = Date.now();
  const client = { id: clientId, res };
  auditSseClients.push(client);

  const keepAlive = setInterval(() => res.write(`:keepalive\n\n`), 30000);
  req.on('close', () => {
    clearInterval(keepAlive);
    auditSseClients = auditSseClients.filter(c => c.id !== clientId);
  });
});

// ================================================================
// RUTAS - DATA SYNC
// ================================================================
app.get('/api/data/sync', auth, (req, res) => {
  const config = readGlobalConfig();
  res.json({
    config,
    timestamp: new Date().toISOString()
  });
});

// ================================================================
// RUTAS - VENTAS Y METAS
// ================================================================
app.get('/api/sales/config', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readSalesConfig();
  res.json(config);
});

app.post('/api/sales/config', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readSalesConfig();
  
  // Actualizar vendedores
  if (req.body.sellers !== undefined) config.sellers = req.body.sellers;
  if (req.body.monthlyGoals !== undefined) config.monthlyGoals = req.body.monthlyGoals;
  if (req.body.vendorMatches !== undefined) config.vendorMatches = req.body.vendorMatches;
  if (req.body.salesTargets !== undefined) config.salesTargets = req.body.salesTargets;
  
  writeSalesConfig(config);
  res.json({ ok: true, config });
});

app.post('/api/sales/goal', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readSalesConfig();
  const { seller, month, goal } = req.body;
  
  if (!seller || !month || goal === undefined) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  
  if (!config.monthlyGoals[seller]) config.monthlyGoals[seller] = {};
  config.monthlyGoals[seller][month] = goal;
  
  writeSalesConfig(config);
  res.json({ ok: true });
});

app.get('/api/sales/goals', auth, (req, res) => {
  const config = readSalesConfig();
  res.json(config.monthlyGoals || {});
});

// Sincronizar vendedores desde Excel/CSV
// Helper: Normalizar texto para matching
function normalizeForMatching(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Helper: Buscar cliente por nombre (fuzzy matching)
function findClientByName(nombre) {
  const tareas = cache.get('clickup_tasks') || [];
  const normalized = normalizeForMatching(nombre);
  
  // Búsqueda exacta primero
  let found = tareas.find(t => normalizeForMatching(t.nombre) === normalized);
  if (found) return found;
  
  // Búsqueda parcial (contiene)
  found = tareas.find(t => normalizeForMatching(t.nombre).includes(normalized) || 
                            normalized.includes(normalizeForMatching(t.nombre)));
  return found || null;
}

// Importar clientes desde Excel con matching inteligente
app.post('/api/sales/import-clients', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admins pueden importar' });
    }
    
    const { rows, vendedor } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Formato inválido. Requiere array "rows"' });
    }
    
    const tareas = cache.get('clickup_tasks') || [];
    const config = readSalesConfig();
    
    let matched = 0;
    let updated = 0;
    let created = 0;
    const results = [];
    
    rows.forEach(row => {
      const clienteName = (row.cliente || row.nombre || '').trim();
      if (!clienteName) return;
      
      const existingTask = findClientByName(clienteName);
      
      if (existingTask) {
        // UPDATE: Cliente existe, actualizar campos
        matched++;
        
        // Actualizar estado si viene en el Excel
        if (row.estado || row.status) {
          const nuevoEstado = (row.estado || row.status).trim().toLowerCase();
          const estadosValidos = ['ganado', 'won', 'perdido', 'lost', 'implementando', 'in-implementation', 'desistio', 'canceled'];
          
          if (estadosValidos.includes(nuevoEstado)) {
            let estadoMapeado = nuevoEstado;
            if (nuevoEstado === 'won' || nuevoEstado === 'ganado') estadoMapeado = 'ganado';
            if (nuevoEstado === 'lost' || nuevoEstado === 'perdido') estadoMapeado = 'perdido';
            if (nuevoEstado === 'in-implementation' || nuevoEstado === 'implementando') estadoMapeado = 'en-implementacion';
            if (nuevoEstado === 'canceled' || nuevoEstado === 'desistio') estadoMapeado = 'desistio';
            
            existingTask.statusSheet = estadoMapeado;
            updated++;
          }
        }
        
        // Actualizar valor si viene en el Excel
        if (row.valor || row.monto || row.amount) {
          const valor = parseFloat(row.valor || row.monto || row.amount) || 0;
          if (valor > 0) {
            existingTask.valorSheet = valor;
            updated++;
          }
        }
        
        // Actualizar vendedor si viene asignado
        if (vendedor) {
          existingTask.rVenta = vendedor;
          updated++;
        }
        
        results.push({
          cliente: clienteName,
          action: 'updated',
          taskId: existingTask.id,
          estado: existingTask.statusSheet,
          valor: existingTask.valorSheet
        });
      } else {
        // CREATE: Cliente nuevo (no existe en ClickUp)
        created++;
        results.push({
          cliente: clienteName,
          action: 'new',
          estado: row.estado || row.status || 'nuevo',
          valor: parseFloat(row.valor || row.monto || 0) || 0,
          nota: 'Crear en ClickUp manualmente'
        });
      }
    });
    
    // Actualizar cache con cambios
    cache.set('clickup_tasks', tareas);
    
    writeLog(req.user, 'IMPORT_CLIENTS_EXCEL', {
      matched,
      updated,
      created,
      vendedor,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      ok: true,
      matched,
      updated,
      created,
      results,
      message: `${matched} coincidencias, ${updated} actualizados, ${created} nuevos`
    });
  } catch (e) {
    console.error('Error importando clientes:', e);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint antiguo: Importar metas de vendedores
app.post('/api/sales/import-excel', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admins pueden importar' });
    }
    
    const { rows } = req.body; // rows = [{vendedor: 'name', meta_mes: value, ...}]
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Formato inválido. Requiere array "rows"' });
    }
    
    const config = readSalesConfig();
    let imported = 0;
    
    rows.forEach(row => {
      if (!row.vendedor || !row.vendedor.trim()) return;
      
      const vendedor = row.vendedor.trim();
      
      // Agregar a consultores si no existe
      if (!config.consultores) config.consultores = [];
      if (!config.consultores.includes(vendedor)) {
        config.consultores.push(vendedor);
      }
      
      // Importar metas mensuales
      if (row.mes && row.meta) {
        if (!config.monthlyGoals[vendedor]) {
          config.monthlyGoals[vendedor] = {};
        }
        config.monthlyGoals[vendedor][row.mes] = parseFloat(row.meta) || 0;
        imported++;
      }
    });
    
    // Mantener sellers para compatibilidad
    config.sellers = config.consultores || [];
    writeSalesConfig(config);
    
    writeLog(req.user, 'IMPORT_EXCEL_VENDEDORES', {
      rowsProcessed: imported,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      ok: true, 
      imported,
      consultores: config.consultores.length,
      message: `${imported} metas importadas exitosamente`
    });
  } catch (e) {
    console.error('Error importando Excel:', e);
    res.status(500).json({ error: e.message });
  }
});

// Obtener vendedores sincronizados (para dropdown)
app.get('/api/sales/consultores', auth, (req, res) => {
  try {
    const config = readSalesConfig();
    const consultores = config.consultores || config.sellers || [];
    res.json({ 
      consultores: consultores.sort(),
      total: consultores.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Importar leads/ventas desde Google Sheets (API v4)
app.post('/api/sales/import-sheet', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins pueden importar' });

    const globalConfig = readGlobalConfig();
    const sheetId = String(req.body?.sheetId || globalConfig.salesSheetId || '').trim();
    const sheetName = String(req.body?.sheetName || globalConfig.salesSheetName || '').trim();
    if (!sheetId || !sheetName) {
      return res.status(400).json({ error: 'sheetId y sheetName son requeridos (o configura global_config.json.salesSheetId/salesSheetName)' });
    }

    const googleSheetsApiKey = String(globalConfig.googleSheetsApiKey || '').trim();
    const { leads } = await importSalesFromSheet(sheetId, sheetName, {
      fetchGoogleSheet: (id, name) => fetchGoogleSheetValues(id, name, googleSheetsApiKey)
    });

    const cfg = readSalesConfig();
    cfg.leads = leads;
    cfg.leadsMeta = { sheetId, sheetName, importedAt: new Date().toISOString(), total: leads.length };
    writeSalesConfig(cfg);

    writeLog(req.user, 'SALES_IMPORT_SHEET', { sheetId, sheetName, total: leads.length });
    res.json({ ok: true, total: leads.length, meta: cfg.leadsMeta });
  } catch (e) {
    console.error('sales/import-sheet error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Exponer leads actuales (para UI)
app.get('/api/sales/leads', auth, (req, res) => {
  try {
    const cfg = readSalesConfig();
    res.json({ leads: cfg.leads || [], meta: cfg.leadsMeta || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sincronizar leads/ventas ↔ clientes (ClickUp dataset)
app.post('/api/sales/sync-with-clientes', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });

    const salesCfg = readSalesConfig();
    const leads = Array.isArray(salesCfg.leads) ? salesCfg.leads : [];
    if (!leads.length) return res.status(400).json({ error: 'No hay leads cargados. Ejecuta /api/sales/import-sheet primero.' });

    // Preferir dataset en memoria (cache) si existe; sino, traer de ClickUp
    const tasks = cache.get('clickup_tasks') || await obtenerTareasClickUp();
    const { updated, changes } = syncSalesWithClients({ clients: tasks, leads });

    if (updated > 0) cache.set('clickup_tasks', tasks);

    // También actualizar data/clientes.json si existe (dataset persistido por clickup/sync)
    try {
      if (fs.existsSync(CLIENTES_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
        const clientesFile = Array.isArray(parsed?.clientes) ? parsed.clientes : [];
        const fileRes = syncSalesWithClients({ clients: clientesFile, leads });
        if (fileRes.updated > 0) {
          fs.writeFileSync(CLIENTES_FILE, JSON.stringify({ ...parsed, clientes: clientesFile, salesSyncedAt: new Date().toISOString() }, null, 2));
        }
      }
    } catch (_e) {}

    changes.slice(0, 500).forEach(ch => {
      writeLog(req.user, 'SALES_SYNC_CLIENT', {
        source: 'sales-sync',
        clientId: ch.clientId,
        clientName: ch.clientName,
        changes: {
          valorVenta: ch.oldValor !== ch.newValor ? { old: ch.oldValor, new: ch.newValor } : undefined,
          vendedor: ch.oldVendedor !== ch.newVendedor ? { old: ch.oldVendedor, new: ch.newVendedor } : undefined
        }
      });
    });

    broadcastEvent('dataUpdated', { source: 'sales-sync', updated, timestamp: new Date().toISOString() });
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('sales/sync-with-clientes error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Obtener datos técnicos (IP/Dominio/Link) de un cliente específico
app.get('/api/clientes/:id/hola', auth, (req, res) => {
  try {
    const tasks = cache.get('clickup_tasks') || [];
    const client = tasks.find(c => String(c.id) === req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    res.json({
      ipPrimaria: client.ipPrimaria || client.ip || '',
      ipSecundaria: client.ipSecundaria || '',
      dominioPrincipal: client.dominioPrincipal || client.dominio || '',
      dominio2: client.dominio2 || '',
      linkHola: client.linkHola || ''
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET Wiki content by language
app.get('/api/wiki', auth, (req, res) => {
  try {
    const lang = ['es', 'en', 'pt'].includes(req.query.lang) ? req.query.lang : 'es';
    const wikiFile = path.join(STATIC_ROOT, `wiki_${lang}.json`);
    if (!fs.existsSync(wikiFile)) {
      return res.status(404).json({ error: 'Wiki no encontrada para este idioma' });
    }
    const data = JSON.parse(fs.readFileSync(wikiFile, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// UPDATE Wiki page (only admins)
app.put('/api/wiki/:lang/:page', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para editar la wiki' });
    }
    const { lang, page } = req.params;
    if (!['es', 'en', 'pt'].includes(lang)) return res.status(400).json({ error: 'Idioma inválido' });
    
    const wikiFile = path.join(STATIC_ROOT, `wiki_${lang}.json`);
    if (!fs.existsSync(wikiFile)) return res.status(404).json({ error: 'Archivo wiki no encontrado' });
    
    const data = JSON.parse(fs.readFileSync(wikiFile, 'utf8'));
    data[page] = req.body; // Upsert page content
    
    fs.writeFileSync(wikiFile, JSON.stringify(data, null, 2));
    writeLog(req.user, 'WIKI_EDIT', { lang, page });
    
    res.status(200).json({ ok: true, lang, page });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


async function cargarDatosDominiosLocal() {
  try {
    const globalConfig = readGlobalConfig();
    const sheetId = globalConfig.domainSheetId;
    const sheetName = globalConfig.domainSheetName || 'Dominios';
    const apiKey = globalConfig.googleSheetsApiKey;

    if (!sheetId || !apiKey) return null;

    console.log('Cargando respaldo de dominios...');
    return await fetchGoogleSheetValues(sheetId, sheetName, apiKey);
  } catch (e) {
    console.warn('Error cargando respaldo de dominios:', e.message);
    return null;
  }
}

app.post('/api/sales/sync-vendedores', auth, (req, res) => {
  // Sincronizar CONSULTORES (responsables comerciales) vs IMPLEMENTADORES
  try {
    const tareas = cache.get('clickup_tasks') || [];
    const consultores = new Set();
    const implementadores = new Set();
    const vendorMatches = {};
    const implMatches = {};
    
    tareas.forEach(t => {
      // CONSULTORES = Responsables Comerciales (Vendedores)
      if (t.rVenta && t.rVenta.trim()) {
        const vend = t.rVenta.trim();
        consultores.add(vend);
        
        if (!vendorMatches[t.id]) {
          vendorMatches[t.id] = {
            clientName: t.nombre,
            consultor: vend,
            status: t.status,
            plan: t.plan,
            tipo: 'vendedor'
          };
        }
      }
      
      // IMPLEMENTADORES = Los otros responsables (kickoff, verificación, capacitación, go-live, activación)
      const implementadores_roles = [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct]
        .filter(r => r && r.trim());
      
      implementadores_roles.forEach(role => {
        implementadores.add(role);
        if (!implMatches[t.id]) implMatches[t.id] = [];
        implMatches[t.id].push({
          nombre: role,
          roles: {
            kickoff: t.rKickoff === role,
            verificacion: t.rVer === role,
            capacitacion: t.rCap === role,
            golive: t.rGoLive === role,
            activacion: t.rAct === role
          }
        });
      });
    });
    
    const config = readSalesConfig();
    config.consultores = Array.from(consultores).sort();
    config.implementadores = Array.from(implementadores).sort();
    config.vendorMatches = vendorMatches;
    config.implMatches = implMatches;
    // Mantener sellers para compatibilidad hacia atrás
    config.sellers = config.consultores;
    writeSalesConfig(config);
    
    writeLog(req.user, 'SYNC_ROLES', {
      consultores: config.consultores.length,
      implementadores: config.implementadores.length,
      matches: Object.keys(vendorMatches).length
    });
    
    res.json({
      ok: true,
      consultores: config.consultores.length,
      implementadores: config.implementadores.length,
      matches: Object.keys(vendorMatches).length
    });
  } catch (e) {
    console.error('Error sincronizando consultores/implementadores:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/consultores/sync', auth, async (req, res) => {
  // Sincronizar lista de consultores desde ClickUp members
  try {
    const consultores = {};
    
    // Obtener miembros desde ClickUp
    const teamRes = await fetch(`https://api.clickup.com/api/v2/team`, {
      headers: { Authorization: CONFIG.CLICKUP_API_KEY }
    });
    const teamData = await teamRes.json();
    
    if (teamData && teamData.teams && teamData.teams.length > 0) {
      teamData.teams[0].members.forEach(m => {
        const user = m.user;
        if (user && user.username) {
          const username = user.username.toLowerCase().trim();
          const displayName = user.username || user.email || 'Unknown';
          consultores[username] = displayName;
        }
      });
    }
    
    // Guardar en global_config.json
    if (Object.keys(consultores).length > 0) {
      let globalConfig = {};
      const cfgFile = path.join(__dirname, 'global_config.json');
      if (fs.existsSync(cfgFile)) {
        try {
          globalConfig = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
        } catch (parseErr) {
          globalConfig = {};
        }
      }
      globalConfig.CONSULTORES = consultores;
      fs.writeFileSync(cfgFile, JSON.stringify(globalConfig, null, 2));
    }
    
    res.json({ ok: true, consultores: Object.keys(consultores).length });
  } catch (e) {
    console.error('Error sincronizando consultores:', e);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// KANBANS: Las rutas definitivas están definidas más abajo (línea ~2700).
// Este bloque fue eliminado para evitar rutas duplicadas que rompían RBAC.

// ================================================================
// CLICKUP MEMBERS
// ================================================================
app.get('/api/clickup/members', auth, async (req, res) => {
  try {
    const clickupApiKey = getClickUpApiKey();
    const CACHE_KEY = 'clickup_members';
    const cached = cache.get(CACHE_KEY);
    if (cached) return res.json({ members: cached });

    let members = [];
    const teamRes = await fetch(`https://api.clickup.com/api/v2/team`, {
      headers: { Authorization: clickupApiKey }
    });
    const teamData = await teamRes.json();
    if (teamData && teamData.teams && teamData.teams.length > 0) {
      members = teamData.teams[0].members.map(m => m.user);
    }

    const uniqueMembers = members.map(m => ({
      id: m.id,
      username: m.username,
      color: m.color,
      initials: m.initials,
      email: m.email
    }));

    cache.set(CACHE_KEY, uniqueMembers, 3600);
    res.json({ members: uniqueMembers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Nuevo endpoint: Obtener estados disponibles en ClickUp
// ================================================================
app.get('/api/clickup/list-info', auth, async (req, res) => {
  try {
    const apiKey = getClickUpApiKey();
    const listId = getClickUpListId();
    
    const resp = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: apiKey }
    });
    
    if (!resp.ok) {
      throw new Error(`ClickUp HTTP ${resp.status}`);
    }
    
    const data = await resp.json();
    const statuses = data.statuses || [];
    
    res.json({ 
      list: {
        id: data.id,
        name: data.name,
        statuses: statuses.map(s => ({
          id: s.id,
          status: s.status,
          orderindex: s.orderindex,
          color: s.color,
          type: s.type
        }))
      }
    });
  } catch (e) {
    console.error('Error en /api/clickup/list-info:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// CLICKUP SYNC → data/clientes.json + SSE(dataUpdated)
// ================================================================
const DATA_DIR = path.join(STATIC_ROOT, 'data');
const CLIENTES_FILE = path.join(DATA_DIR, 'clientes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function obtenerTareasClickUpRaw({ apiKey, listId }) {
  const tasks = [];
  let page = 0;
  while (page < 20) {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task` +
      `?page=${page}&include_closed=true&archived=false&subtasks=true`;
    const resp = await fetch(url, {
      headers: { Authorization: apiKey },
      timeout: 30000
    });
    if (!resp.ok) throw new Error(`ClickUp API ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    if (!data.tasks || data.tasks.length === 0) break;
    tasks.push(...data.tasks);
    if (data.tasks.length < 100) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }
  return tasks;
}

function createLimitedFetcher(limit, fn) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= limit) return;
    const item = queue.shift();
    if (!item) return;
    active++;
    Promise.resolve()
      .then(() => fn(...item.args))
      .then(item.resolve, item.reject)
      .finally(() => {
        active--;
        runNext();
      });
  };
  return (...args) =>
    new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject });
      runNext();
    });
}

app.post('/api/clickup/sync', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });

    const apiKey = getClickUpApiKey();
    const listId = getClickUpListId();
    const tz = req.body?.tz || 'America/Sao_Paulo';

    // Obtener tareas pero SIN pedir detalles individuales para evitar Rate Limit
    // El list endpoint ya trae los custom_fields necesarios
    const tasksRaw = await obtenerTareasClickUpRaw({ apiKey, listId });
    const fingerprint = computeTasksFingerprint(tasksRaw);

    const domData = await cargarDatosDominiosLocal();

    // Pasar fetchTaskDetails como null o una función vacía ya que NO lo usaremos ahora
    // Los campos ya vienen en tasksRaw.custom_fields
    const clients = await mapTasksToClients(tasksRaw, {
      DIAS_ALERTA: 7,
      DIAS_META: CONFIG.DIAS_META,
      PAISES: CONFIG.PAISES,
      FERIADOS: CONFIG.FERIADOS,
      TAREAS_IGNORAR: CONFIG.TAREAS_IGNORAR,
      ESTADOS_IGNORAR: CONFIG.ESTADOS_IGNORAR,
      ESTADOS_IMPL
    }, {
      tz,
      fetchTaskDetails: null, // Desactivado para evitar 429
      domData
    });

    ensureDataDir();
    fs.writeFileSync(CLIENTES_FILE, JSON.stringify({ fingerprint, updatedAt: new Date().toISOString(), clientes: clients }, null, 2));

    broadcastEvent('dataUpdated', { fingerprint, total: clients.length, updatedAt: new Date().toISOString() });
    writeLog(req.user, 'CLICKUP_SYNC', { source: 'clickup-sync', fingerprint, total: clients.length });

    res.json({ ok: true, fingerprint, total: clients.length });
  } catch (e) {
    console.error('clickup/sync error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - PROXY DE TAREAS CLICKUP PARA EL FRONTEND (evita CORS)
// El frontend llama GET /api/clickup/tasks cuando usa el servidor como proxy.
// Retorna tareas PROCESADAS (mapeadas a clientes) no tareas RAW de ClickUp
// ================================================================
app.get('/api/clickup/tasks', auth, async (req, res) => {
  try {
    const apiKey = getClickUpApiKey();
    const listId = getClickUpListId();
    
    // Obtener tareas RAW
    const rawTasks = await obtenerTareasClickUpRaw({ apiKey, listId });
    
    // Procesar a clientes usando el mapper
    const clients = await mapTasksToClients(rawTasks, {
      DIAS_ALERTA: 7,
      DIAS_META: CONFIG.DIAS_META,
      PAISES: CONFIG.PAISES,
      FERIADOS: CONFIG.FERIADOS,
      TAREAS_IGNORAR: CONFIG.TAREAS_IGNORAR,
      ESTADOS_IGNORAR: CONFIG.ESTADOS_IGNORAR,
      ESTADOS_IMPL: CONFIG.ESTADOS_IMPL || []
    }, {
      tz: 'America/Sao_Paulo',
      fetchTaskDetails: null
    });
    
    res.json({ 
      tasks: clients, 
      meta: { 
        ...cacheMeta, 
        taskCount: clients.length,
        totalRaw: rawTasks.length,
        processedAt: new Date().toISOString()
      } 
    });
  } catch (e) {
    console.error('Error en /api/clickup/tasks:', e.message);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - GET /api/data (dataset general — frontend y scripts externos)
// Prefiere clientes.json (sync completo) sobre el caché en memoria.
// ================================================================
app.get('/api/data', auth, async (req, res) => {
  try {
    // Intentar leer el dataset persistido por el sync completo
    if (fs.existsSync(CLIENTES_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
        const clientes = Array.isArray(parsed?.clientes) ? parsed.clientes : [];
        if (clientes.length > 0) {
          return res.json({
            clientes,
            meta: {
              source: 'file',
              updatedAt: parsed.updatedAt || null,
              total: clientes.length,
              fingerprint: parsed.fingerprint || null
            }
          });
        }
      } catch (_e) { /* fallthrough to cache */ }
    }
    // Fallback: caché en memoria / ClickUp en tiempo real
    const tasks = await obtenerTareasClickUp();
    res.json({ clientes: tasks, meta: cacheMeta });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTAS - DASHBOARD
// ================================================================
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const tasks     = await obtenerTareasClickUp();
    const dashboard = buildDashboard(tasks);
    res.json(dashboard);
  } catch(e) {
    console.error('Error dashboard:', e.message);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTAS - CLIENTES (listado completo)
// ================================================================
app.get('/api/clientes', auth, async (req, res) => {
  try {
    const tasks  = await obtenerTareasClickUp();
    const { status, pais, consultor, busqueda, page=1, limit=50 } = req.query;
    const limitNum = parsePositiveInt(limit, 50, { min:1, max:200 });
    const pageNum = parsePositiveInt(page, 1, { min:1, max:10000 });

    let filtradas = tasks;
    if (status)    filtradas = filtradas.filter(t => t.status === status);
    if (pais)      filtradas = filtradas.filter(t => t.pais   === pais);
    if (consultor) filtradas = filtradas.filter(t =>
      [t.rKickoff,t.rVer,t.rCap,t.rGoLive,t.rAct].includes(consultor));
    if (busqueda) {
      const b = normalizeText(busqueda);
      filtradas = filtradas.filter(t => normalizeText(t.nombre).includes(b));
    }

    filtradas.sort((a,b) => b.fInicio - a.fInicio);

    const total    = filtradas.length;
    const pages    = Math.max(1, Math.ceil(total / limitNum));
    const safePage = Math.min(pageNum, pages);
    const inicio   = (safePage-1) * limitNum;
    const paginado = filtradas.slice(inicio, inicio + limitNum);

    res.json({ clientes:paginado, total, page:safePage, pages, meta: cacheMeta });
  } catch(e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - BÚSQUEDA EXTERNA PARA EXTENSIONES (replica buscarClienteAPI de Apps Script)
// GET /api/clientes/search-externo?nombre=X&apikey=Y
// Autenticación por apikey en lugar de JWT (para extensiones/integraciones externas)
// ================================================================
app.get('/api/clientes/search-externo', async (req, res) => {
  try {
    const { nombre, apikey } = req.query;

    // Verificar api key contra la de ClickUp (puede ajustarse a otra secret)
    const validApiKey = String(readGlobalConfig().externalApiKey || process.env.EXTERNAL_API_KEY || '').trim();
    if (!validApiKey || String(apikey || '').trim() !== validApiKey) {
      return res.status(401).json({ error: 'API Key inválida', resultados: [], total: 0 });
    }

    if (!nombre || String(nombre).trim().length < 2) {
      return res.status(400).json({ error: 'Parámetro nombre requerido (mínimo 2 caracteres)', resultados: [], total: 0 });
    }

    const busqueda = normalizeText(String(nombre).trim());
    const tasks = await obtenerTareasClickUp();

    const resultados = tasks
      .filter(t => {
        const n = normalizeText(t.nombre || '');
        return n.includes(busqueda);
      })
      .map(t => ({
        id         : t.id,
        nombre     : t.nombre,
        status     : t.status,
        statusType : t.statusType,
        pais       : t.pais,
        plan       : t.plan,
        ip         : t.ip || '',
        dominio    : t.dominio || '',
        linkHola   : t.linkHola || '',
        rKickoff   : t.rKickoff || '',
        rVenta     : t.rVenta || '',
        fInicio    : t.fInicio || null,
        fActivacion: t.fActivacion || null
      }));

    const clientesUnicos = [...new Set(resultados.map(r => normalizeText(r.nombre)))].length;

    res.json({
      resultados,
      total         : resultados.length,
      clientesUnicos,
      timestamp     : new Date().toISOString()
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message, resultados: [], total: 0 });
  }
});

// ================================================================
// RUTA - CLIENTE INDIVIDUAL
// ================================================================
app.get('/api/clientes/:id', auth, async (req, res) => {
  try {
    const tasks  = await obtenerTareasClickUp();
    const client = tasks.find(t => t.id === req.params.id);
    if (!client) return res.status(404).json({ error:'Cliente no encontrado' });
    res.json(client);
  } catch(e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - EDICIÓN MASIVA DE CLIENTES
// ================================================================
const BULK_UPDATE_FIELDS = new Set(['rKickoff','rVer','rCap','rGoLive','rAct','pais','plan','email','telefono']);
const DEFAULT_CLICKUP_CUSTOM_FIELD_MAP = {
  // Ejemplo: mapear "rKickoff" al ID real del custom field en ClickUp
  // NOTA: estos IDs deben coincidir con los custom fields de tu lista en ClickUp.
  rKickoff: 'cf_rKickoff_id_aqui',
  rVer: 'cf_rVer_id_aqui',
  rCap: 'cf_rCap_id_aqui',
  rGoLive: 'cf_rGoLive_id_aqui',
  rAct: 'cf_rAct_id_aqui',
  pais: 'cf_pais_id_aqui',
  plan: 'cf_plan_id_aqui',
  email: 'cf_email_id_aqui',
  telefono: 'cf_telefono_id_aqui'
};

function getClickUpCustomFieldMap() {
  const globalConfig = readGlobalConfig();
  const fromConfig = globalConfig?.clickupCustomFieldMap && typeof globalConfig.clickupCustomFieldMap === 'object'
    ? globalConfig.clickupCustomFieldMap
    : {};
  return { ...DEFAULT_CLICKUP_CUSTOM_FIELD_MAP, ...fromConfig };
}

async function patchClickUpCustomField(taskId, customFieldId, value) {
  const apiKey = getClickUpApiKey();
  if (!apiKey) {
    const err = new Error('API Key de ClickUp no disponible');
    err.statusCode = 400;
    throw err;
  }
  // ClickUp v2: POST /task/{task_id}/field/{field_id} — NOT PUT on the task root
  const resp = await fetch(
    `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(customFieldId)}`,
    {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
      timeout: 30000
    }
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(json?.err || json?.error || `ClickUp HTTP ${resp.status}`);
    err.statusCode = resp.status;
    throw err;
  }
  return json;
}

app.post('/api/clientes/bulk-update', auth, async (req, res) => {
  try {
    if (!['admin', 'consultant'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Prohibido: rol sin permisos para editar' });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => String(x || '').trim()).filter(Boolean) : [];
    const field = String(req.body?.field || '').trim();
    const clear = Boolean(req.body?.clear);
    const rawValue = req.body?.value;
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);

    if (ids.length === 0) return res.status(400).json({ error: 'ids requerido (array no vacío)' });
    if (ids.length > 200) return res.status(400).json({ error: 'Máximo 200 ids por operación' });
    if (!BULK_UPDATE_FIELDS.has(field)) return res.status(400).json({ error: `field inválido: ${field}` });

    const shouldClear = clear === true && value === '';
    const newValueForDataset = shouldClear ? '' : value;
    const newValueForClickUp = shouldClear ? null : value;

    const clickupMap = getClickUpCustomFieldMap();
    const customFieldId = clickupMap[field];
    if (!customFieldId || String(customFieldId).includes('_id_aqui')) {
      return res.status(400).json({
        error: `No hay mapeo de ClickUp para el campo "${field}". Configura global_config.json > clickupCustomFieldMap.${field}`
      });
    }

    const tasks = await obtenerTareasClickUp(); // puede venir de caché
    const changes = [];
    let updated = 0;

    for (const taskId of ids) {
      const client = tasks.find(t => String(t.id) === String(taskId));
      if (client) {
        // Enriquecer con nuevos campos si no existen (legacy)
        client.ipPrimaria = client.ipPrimaria || client.ip || '';
        client.ipSecundaria = client.ipSecundaria || '';
        client.dominioPrincipal = client.dominioPrincipal || client.dominio || '';
        client.dominio2 = client.dominio2 || '';
        client.linkHola = client.linkHola || '';
      }
      if (!client) continue;

      const oldValue = client[field] ?? '';
      if (String(oldValue) === String(newValueForDataset)) continue;

      client[field] = newValueForDataset;
      updated++;

      // Sincronizar con ClickUp
      await patchClickUpCustomField(taskId, customFieldId, newValueForClickUp);
      await new Promise(r => setTimeout(r, 200));

      changes.push({ id: taskId, oldValue, newValue: newValueForDataset });
    }

    // Mantener "dataset" en memoria: refrescar el caché con las tareas ya mutadas
    cache.set('clickup_tasks', tasks);
    cacheMeta.source = 'cache';

    writeLog(req.user, 'BULK_EDIT', {
      source: 'bulk-edit',
      timestamp: new Date().toISOString(),
      ids,
      field,
      value: newValueForDataset,
      clear: shouldClear,
      updated,
      changes
    });

    res.json({ ok: true, updated, field, value: newValueForDataset, cleared: shouldClear });
  } catch (e) {
    console.error('bulk-update error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - FORZAR ACTUALIZACIÓN
// ================================================================
app.post('/api/refresh', auth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error:'Sin permisos' });
  try {
    invalidarCache();
    const tasks     = await obtenerTareasClickUp();
    const dashboard = buildDashboard(tasks);
    res.json({ ok:true, total:tasks.length, dashboard });
  } catch(e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - BÚSQUEDA RÁPIDA
// ================================================================
app.get('/api/buscar', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ resultados:[] });
    const tasks     = await obtenerTareasClickUp();
    const busqueda  = normalizeText(q);
    const resultados = tasks
      .filter(t => normalizeText(t.nombre).includes(busqueda) ||
                   (t.ip && normalizeText(t.ip).includes(busqueda)) ||
                   (t.dominio && normalizeText(t.dominio).includes(busqueda)))
      .slice(0,10)
      .map(t => ({ id:t.id, nombre:t.nombre, status:t.status,
                   pais:t.pais, ip:t.ip, linkHola:t.linkHola }));
    res.json({ resultados });
  } catch(e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTAS - OPA / HOLA SUITE PROXY
// ================================================================
app.post('/api/opa/test', auth, async (req, res) => {
  try {
    const globalConfig = readGlobalConfig();
    const baseUrl = req.user.role === 'admin'
      ? (req.body?.baseUrl || globalConfig.holaUrl || process.env.HOLA_API_URL)
      : (globalConfig.holaUrl || process.env.HOLA_API_URL);
    const token = req.user.role === 'admin' ? (req.body?.token || globalConfig.holaToken || process.env.HOLA_API_TOKEN) : (globalConfig.holaToken || process.env.HOLA_API_TOKEN);
    const workspace = req.user.role === 'admin' ? (req.body?.workspace || globalConfig.holaWs) : globalConfig.holaWs;
    const result = await fetchHolaConversationsRemote(baseUrl, token, workspace);
    res.json({
      ok: true,
      path: result.resolvedPath || '/atendimento',
      total: result.conversations.length,
      departments: Object.keys(result.departments || {}).length
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/opa/conversations', auth, async (req, res) => {
  try {
    const globalConfig = readGlobalConfig();
    const baseUrl = req.user.role === 'admin'
      ? (req.body?.baseUrl || globalConfig.holaUrl || process.env.HOLA_API_URL)
      : (globalConfig.holaUrl || process.env.HOLA_API_URL);
    const token = req.user.role === 'admin' ? (req.body?.token || globalConfig.holaToken || process.env.HOLA_API_TOKEN) : (globalConfig.holaToken || process.env.HOLA_API_TOKEN);
    const workspace = req.user.role === 'admin' ? (req.body?.workspace || globalConfig.holaWs) : globalConfig.holaWs;
    const result = await fetchHolaConversationsRemote(baseUrl, token, workspace);
    
    // Auto-analyze conversations
    const analyzed = (result.conversations || []).map(analyzeConversation);

    res.json({
      ok: true,
      conversations: analyzed,
      departments: result.departments,
      path: result.resolvedPath || '/atendimento'
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/opa/attendance/:id/detail', auth, async (req, res) => {
  try {
    const globalConfig = readGlobalConfig();
    const baseUrl = req.user.role === 'admin'
      ? (req.body?.baseUrl || globalConfig.holaUrl || process.env.HOLA_API_URL)
      : (globalConfig.holaUrl || process.env.HOLA_API_URL);
    const token = req.user.role === 'admin' ? (req.body?.token || globalConfig.holaToken || process.env.HOLA_API_TOKEN) : (globalConfig.holaToken || process.env.HOLA_API_TOKEN);
    const detail = await fetchHolaAttendanceDetailRemote(baseUrl, token, req.params.id);
    res.json({ ok: true, detail });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// OPA API v1 ENDPOINTS (atendimento + mensagem)
// ================================================================

app.post('/api/v1/atendimento', auth, async (req, res) => {
  try {
    const globalConfig = readGlobalConfig();
    const baseUrl = req.user.role === 'admin'
      ? (req.body?.baseUrl || globalConfig.holaUrl || process.env.HOLA_API_URL)
      : (globalConfig.holaUrl || process.env.HOLA_API_URL);
    const token = req.user.role === 'admin' ? (req.body?.token || globalConfig.holaToken || process.env.HOLA_API_TOKEN) : (globalConfig.holaToken || process.env.HOLA_API_TOKEN);

    if (!baseUrl || !token) {
      return res.status(400).json({ error: 'Base URL y token son requeridos' });
    }

    // Build filter and options from request
    const filter = req.body?.filter || {};
    const options = req.body?.options || { limit: 100 };

    // Make request to external OPA API
    const opaUrl = new URL(baseUrl).origin + '/api/v1/atendimento';
    const response = await fetch(opaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filter, options }),
      timeout: 30000
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData?.error || `OPA API HTTP ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();

    // Return data in expected format
    res.json({
      ok: true,
      data: data.data || data.atendimentos || data.conversations || [],
      total: data.total || (Array.isArray(data.data) ? data.data.length : 0),
      filter,
      options
    });
  } catch (e) {
    console.error('Error en /api/v1/atendimento:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/atendimento/mensagem', auth, async (req, res) => {
  try {
    const globalConfig = readGlobalConfig();
    const baseUrl = req.user.role === 'admin'
      ? (req.body?.baseUrl || globalConfig.holaUrl || process.env.HOLA_API_URL)
      : (globalConfig.holaUrl || process.env.HOLA_API_URL);
    const token = req.user.role === 'admin' ? (req.body?.token || globalConfig.holaToken || process.env.HOLA_API_TOKEN) : (globalConfig.holaToken || process.env.HOLA_API_TOKEN);

    if (!baseUrl || !token) {
      return res.status(400).json({ error: 'Base URL y token son requeridos' });
    }

    // Build filter and options from request
    const filter = req.body?.filter || {};
    const options = req.body?.options || { limit: 100 };

    if (!filter.id_rota && !filter.idRota && !filter.attendance_id) {
      return res.status(400).json({ error: 'id_rota es requerido en filter' });
    }

    // Make request to external OPA API
    const opaUrl = new URL(baseUrl).origin + '/api/v1/atendimento/mensagem';
    const response = await fetch(opaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filter, options }),
      timeout: 30000
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData?.error || `OPA API HTTP ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();

    // Return data in expected format
    res.json({
      ok: true,
      messages: data.data || data.mensagens || data.messages || [],
      total: data.total || (Array.isArray(data.data) ? data.data.length : 0),
      filter,
      options
    });
  } catch (e) {
    console.error('Error en /api/v1/atendimento/mensagem:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/clickup/task/:id/status', auth, async (req, res) => {
  try {
    const apiKey = getClickUpApiKey();
    const status = String(req.body?.status || '').trim();
    if (!status) return res.status(400).json({ error: 'Status requerido' });
    const resp = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(req.params.id)}`, {
      method: 'PUT',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status }),
      timeout: 30000
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
    res.json({ ok: true, task: json });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/clickup/task/:id/comment', auth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const apiKey = getClickUpApiKey();
    const comment = String(req.body?.comment || '').trim();
    
    if (!comment) {
      return res.status(400).json({ error: 'Comentario requerido' });
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key de ClickUp no disponible' });
    }
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID requerido' });
    }
    
    const resp = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment_text: comment, notify_all: false }),
      timeout: 30000
    });
    
    const json = await resp.json().catch(() => ({}));
    
    if (!resp.ok) {
      console.error(`ClickUp API error for task ${taskId}:`, resp.status, json);
      return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
    }
    
    res.json({ ok: true, comment: json });
  } catch (e) {
    console.error('Comment endpoint error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post('/api/clickup/task/:id/tag', auth, async (req, res) => {
  try {
    const apiKey = getClickUpApiKey();
    const tag = String(req.body?.tag || '').trim();
    if (!tag) return res.status(400).json({ error: 'Tag requerida' });
    const resp = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(req.params.id)}/tag/${encodeURIComponent(tag)}`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
    res.json({ ok: true, tag, response: json });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get('/api/logs', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  try {
    const logs = fs.existsSync(LOGS_FILE) ? JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')) : [];
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/forms/submissions', (_req, res) => {
  res.json({ ok: true, submissions: readFormSubmissions() });
});

app.post('/api/forms/:type', (req, res) => {
  const type = String(req.params.type || '').trim();
  if (!['upgrade', 'churn-risk'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de formulario no soportado' });
  }
  const payload = req.body || {};
  const record = {
    id: `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: new Date().toISOString(),
    clientName: String(payload.clientName || '').trim(),
    contactName: String(payload.contactName || '').trim(),
    email: String(payload.email || '').trim(),
    details: String(payload.details || '').trim(),
    requestedPlan: String(payload.requestedPlan || '').trim(),
    value: Number(payload.value || 0) || 0,
    reason: String(payload.reason || '').trim(),
    urgency: String(payload.urgency || '').trim(),
    source: 'public_form'
  };
  const items = readFormSubmissions();
  items.unshift(record);
  writeFormSubmissions(items);
  res.json({ ok: true, submission: record });
});

// ================================================================
// ARCHIVOS PÚBLICOS
// ================================================================
app.get('/', (_req, res) => {
  sendPublicFile(res, 'vylex.html');
});

app.get('/js/:filename', (req, res, next) => {
  const requested = String(req.params.filename || '').trim();
  if (!requested) return next();
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(STATIC_ROOT, 'js', requested));
});

app.get('/css/:filename', (req, res, next) => {
  const requested = String(req.params.filename || '').trim();
  if (!requested) return next();
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(path.join(STATIC_ROOT, 'css', requested));
});

app.get('/:filename', (req, res, next) => {
  if (req.params.filename.startsWith('api')) return next();
  if (!PUBLIC_FILES.has(req.params.filename)) return next();
  sendPublicFile(res, req.params.filename);
});

// ================================================================
// KANBANS PERSONALIZADOS
// ================================================================
const KANBANS_FILE = path.join(STATIC_ROOT, 'kanbans.json');

function readKanbans() {
  try {
    return fs.existsSync(KANBANS_FILE) ? JSON.parse(fs.readFileSync(KANBANS_FILE, 'utf8')) : [];
  } catch(e) {
    return [];
  }
}

function writeKanbans(data) {
  fs.writeFileSync(KANBANS_FILE, JSON.stringify(data, null, 2));
}

// GET all visible boards for current user
// ================================================================
// SOLICITUDES INTERNAS (BAJA, UPGRADE, CROSS-SELL)
// ================================================================
app.get('/api/requests', auth, (req, res) => {
  try {
    const { tipo, estado } = req.query;
    let requests = readRequests();
    
    // Filtros
    if (tipo) requests = requests.filter(r => r.tipo === tipo);
    if (estado) requests = requests.filter(r => r.estado === estado);
    
    // Solo Admin y CS pueden ver todas. Consultores solo las suyas (opcional, pero user pidió "para CS / admin")
    if (req.user.role !== 'admin' && req.user.role !== 'cs') {
       requests = requests.filter(r => r.usuarioId === req.user.id);
    }
    
    res.json(requests);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/requests', auth, async (req, res) => {
  try {
    const { tipo, clienteId, clienteNombre, motivo, valorEstimado, comentarios } = req.body;
    if (!tipo || !clienteNombre) return res.status(400).json({ error: 'Faltan campos requeridos' });

    const requests = readRequests();
    const newRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tipo,
      clienteId,
      clienteNombre,
      usuarioId: req.user.id,
      usuarioNombre: req.user.username,
      fecha: new Date().toISOString(),
      estado: 'pending',
      motivo,
      valorEstimado: parseFloat(valorEstimado) || 0,
      comentarios: comentarios ? [comentarios] : []
    };

    requests.unshift(newRequest);
    writeRequests(requests);

    // Opcional: ClickUp Integration
    const gConfig = readGlobalConfig();
    let targetListId = null;
    if (tipo === 'baja') targetListId = gConfig.clickupListIdBajas;
    if (tipo === 'upgrade') targetListId = gConfig.clickupListIdUpgrades;

    if (targetListId) {
      try {
        const desc = `Solicitud de ${tipo} creada por ${req.user.username}.\nMotivo: ${motivo}\nValor: ${valorEstimado}`;
        await createClickUpTask(targetListId, `SOLICITUD: ${tipo.toUpperCase()} - ${clienteNombre}`, desc, [tipo]);
      } catch (ce) {
        console.error('Error creating ClickUp task for request:', ce.message);
        // No bloqueamos la respuesta del dashboard por error en ClickUp
      }
    }

    res.status(201).json(newRequest);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// REPARTO AUTOMÁTICO DE CLIENTES
// ================================================================
function sugerirDistribucionNuevosClientes({ nuevosClientes, cargaActual, consultantMetas }) {
  const suggestions = [];
  const currentLoad = { ...cargaActual };
  const consultores = Object.keys(consultantMetas);

  for (const cliente of nuevosClientes) {
    const sorted = consultores
      .map(name => ({
        name,
        load: currentLoad[name] || 0,
        meta: consultantMetas[name] || 10,
        ratio: (currentLoad[name] || 0) / (consultantMetas[name] || 10)
      }))
      .filter(c => c.load < c.meta)
      .sort((a, b) => a.ratio - b.ratio || a.load - b.load);

    if (sorted.length > 0) {
      const best = sorted[0];
      suggestions.push({
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        consultorSugerido: best.name,
        cargaActual: best.load,
        meta: best.meta
      });
      currentLoad[best.name] = (currentLoad[best.name] || 0) + 1;
    } else {
      suggestions.push({
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        consultorSugerido: "SIN CUPO",
        cargaActual: 0,
        meta: 0
      });
    }
  }
  return suggestions;
}

app.post('/api/consultores/distribuir-nuevos', auth, async (req, res) => {
  try {
    const { aplicar = false } = req.body;
    const gConfig = readGlobalConfig();
    const consultantMetas = gConfig.consultantMetas || {};
    
    // Obtener todos los clientes actuales
    const allTasks = await obtenerTareasClickUp();
    
    // 1. Identificar Nuevos Clientes (mes actual, statusType = impl)
    const currentMonth = MESES[new Date().getMonth()] + ' ' + new Date().getFullYear();
    const nuevosClientes = allTasks.filter(t => t.mesInicio === currentMonth && t.statusType === 'impl' && !t.rKickoff);
    
    // 2. Calcular Carga Actual (statusType = impl)
    const cargaActual = {};
    allTasks.forEach(t => {
      if (t.statusType === 'impl' && t.rKickoff) {
        cargaActual[t.rKickoff] = (cargaActual[t.rKickoff] || 0) + 1;
      }
    });

    // 3. Generar Sugerencia
    const propuesta = sugerirDistribucionNuevosClientes({ 
      nuevosClientes, 
      cargaActual, 
      consultantMetas 
    });

    // 4. Aplicar si se solicita
    if (aplicar) {
      const fieldMap = gConfig.clickupCustomFieldMap || {};
      const fieldId = fieldMap.rKickoff;
      if (!fieldId) return res.status(400).json({ error: 'ID del campo Responsable Kickoff no configurado' });

      let actualizados = 0;
      for (const s of propuesta) {
        if (s.consultorSugerido !== "SIN CUPO") {
          try {
            await patchClickUpCustomField(s.clienteId, fieldId, s.consultorSugerido);
            writeLog(req.user, 'ASSIGN_CLIENT', { clienteId: s.clienteId, clienteNombre: s.clienteNombre, consultor: s.consultorSugerido });
            actualizados++;
          } catch (err) {
            console.error(`Error asignando ${s.clienteId}:`, err.message);
          }
        }
      }
      return res.json({ message: `Reparto completado. Clientes asignados: ${actualizados}`, propuesta });
    }

    res.json(propuesta);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/requests/:id', auth, (req, res) => {
  try {
    const { id } = req.params;
    const { estado, comentario } = req.body;
    const requests = readRequests();
    const idx = requests.findIndex(r => r.id === id);
    
    if (idx === -1) return res.status(404).json({ error: 'Solicitud no encontrada' });
    
    if (estado) {
      if (req.user.role !== 'admin' && req.user.role !== 'cs') {
        return res.status(403).json({ error: 'Solo Admin o CS pueden cambiar el estado' });
      }
      requests[idx].estado = estado;
    }
    
    if (comentario) {
      if (!requests[idx].comentarios) requests[idx].comentarios = [];
      requests[idx].comentarios.push({
        usuario: req.user.username,
        fecha: new Date().toISOString(),
        texto: comentario
      });
    }
    
    writeRequests(requests);
    res.json(requests[idx]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/kanbans', auth, (req, res) => {

  try {
    const role = req.user.role || 'viewer';
    const allKanbans = readKanbans();
    const visibleKanbans = allKanbans.filter(kb => 
      kb.permissions?.view?.includes(role) || kb.ownerId === req.user.id
    );
    res.json(visibleKanbans);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CREATE new board (Admin only)
app.post('/api/kanbans', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para crear tableros' });
    }
    const { name, linkedToClickup, columns, permissions } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });

    const allKanbans = readKanbans();
    const newBoard = {
      id: 'kb_' + Date.now(),
      name,
      ownerId: req.user.id,
      linkedToClickup: !!linkedToClickup,
      columns: columns || [],
      cards: linkedToClickup ? undefined : [],
      permissions: permissions || { view: ["admin"], edit: ["admin"] }
    };

    allKanbans.push(newBoard);
    writeKanbans(allKanbans);
    res.json(newBoard);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// UPDATE board (Admin or Owner)
app.put('/api/kanbans/:id', auth, (req, res) => {
  try {
    const allKanbans = readKanbans();
    const idx = allKanbans.findIndex(kb => kb.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Tablero no encontrado' });

    const board = allKanbans[idx];
    if (req.user.role !== 'admin' && board.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    // Update fields
    const updated = { ...board, ...req.body, id: board.id, ownerId: board.ownerId };
    allKanbans[idx] = updated;

    writeKanbans(allKanbans);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE board (Owner/Admin & not linked to ClickUp)
app.delete('/api/kanbans/:id', auth, (req, res) => {
  try {
    const allKanbans = readKanbans();
    const idx = allKanbans.findIndex(kb => kb.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Tablero no encontrado' });

    const board = allKanbans[idx];
    if (board.linkedToClickup === true) {
      return res.status(400).json({ error: 'No se puede borrar el tablero estándar sincronizado' });
    }

    if (req.user.role !== 'admin' && board.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    const filtered = allKanbans.filter(kb => kb.id !== req.params.id);
    writeKanbans(filtered);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agregar comentario a tarjeta (usa archivo separado para no corromper el array de kanbans)
const KANBAN_COMMENTS_FILE = path.join(STATIC_ROOT, 'kanban_comments.json');

function readKanbanComments() {
  try {
    if (!fs.existsSync(KANBAN_COMMENTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(KANBAN_COMMENTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) { return []; }
}

function writeKanbanComments(comments) {
  fs.writeFileSync(KANBAN_COMMENTS_FILE, JSON.stringify(comments, null, 2));
}

app.post('/api/kanbans/:id/comments', auth, (req, res) => {
  const { cardId, text } = req.body;
  if (!cardId || !text) return res.status(400).json({ error: 'Campos requeridos' });

  const comments = readKanbanComments();
  const comment = {
    id: 'cmt_' + Date.now(),
    kanbanId: req.params.id,
    cardId,
    userId: req.user.id,
    username: req.user.username,
    text,
    createdAt: new Date().toISOString()
  };
  comments.push(comment);
  writeKanbanComments(comments);
  res.json({ comment });
});

// Obtener comentarios de un tablero
app.get('/api/kanbans/:id/comments', auth, (req, res) => {
  const comments = readKanbanComments().filter(c => c.kanbanId === req.params.id);
  res.json({ comments });
});

// ================================================================
// AUDITORÍA: Logging de cambios
// ================================================================
app.post('/api/audit/log', auth, (req, res) => {
  const { action, entityType, entityId, field, oldValue, newValue, reason } = req.body;
  
  if (!action || !entityType || !entityId) {
    return res.status(400).json({ error: 'action, entityType, entityId requeridos' });
  }

  writeLog(req.user, action, {
    entityType,
    entityId,
    field,
    oldValue,
    newValue,
    reason,
    timestamp: new Date().toISOString()
  });

  res.json({ ok: true });
});

// ================================================================
// 3-POINT CLICKUP SYNC: Venta, Implementación, Cancelamiento
// ================================================================

// 1. SALES POINT - Cuando se asigna/modifica vendedor
app.post('/api/sync/sales-point', auth, async (req, res) => {
  try {
    const { taskId, vendor, clientName } = req.body;
    if (!taskId || !vendor) {
      return res.status(400).json({ error: 'taskId y vendor requeridos' });
    }

    writeLog(req.user, 'SALES_POINT_SYNC', { taskId, vendor, clientName, action: 'Asignación de vendedor' });

    // Usar getClickUpCustomFieldMap() en lugar de CONFIG.VENDOR_FIELD_ID (que no existe)
    const fieldMap = getClickUpCustomFieldMap();
    const fieldId = fieldMap.rVenta || fieldMap.vendedor;
    if (fieldId && !String(fieldId).includes('_id_aqui')) {
      await patchClickUpCustomField(taskId, fieldId, vendor);
    } else {
      console.warn('sales-point sync: field ID para vendedor no configurado en clickupCustomFieldMap');
    }

    broadcastEvent('sync-completed', { point: 'sales', taskId, vendor });
    res.json({ ok: true, synced: Boolean(fieldId) });
  } catch (e) {
    console.error('Sales point sync error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// 2. IMPLEMENTATION POINT - Cuando comienza implementación
app.post('/api/sync/impl-point', auth, async (req, res) => {
  try {
    const { taskId, implementador, startDate } = req.body;
    if (!taskId || !implementador) {
      return res.status(400).json({ error: 'taskId e implementador requeridos' });
    }

    writeLog(req.user, 'IMPL_POINT_SYNC', { taskId, implementador, startDate, action: 'Inicio de implementación' });

    const fieldMap = getClickUpCustomFieldMap();
    const fieldId = fieldMap.rKickoff;
    if (fieldId && !String(fieldId).includes('_id_aqui')) {
      await patchClickUpCustomField(taskId, fieldId, implementador);
    } else {
      console.warn('impl-point sync: field ID para rKickoff no configurado en clickupCustomFieldMap');
    }

    broadcastEvent('sync-completed', { point: 'implementation', taskId, implementador });
    res.json({ ok: true, synced: Boolean(fieldId) });
  } catch (e) {
    console.error('Implementation point sync error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// 3. CANCELLATION POINT - Cuando se cancela un cliente
app.post('/api/sync/cancel-point', auth, async (req, res) => {
  try {
    const { taskId, reason, cancelledBy } = req.body;
    if (!taskId || !reason) {
      return res.status(400).json({ error: 'taskId y reason requeridos' });
    }

    writeLog(req.user, 'CANCEL_POINT_SYNC', { taskId, reason, cancelledBy, action: 'Cancelación de cliente' });

    const fieldMap = getClickUpCustomFieldMap();
    const fieldId = fieldMap.motivoBaja || fieldMap.cancelReason;
    if (fieldId && !String(fieldId).includes('_id_aqui')) {
      await patchClickUpCustomField(taskId, fieldId, reason);
    } else {
      console.warn('cancel-point sync: field ID para motivo de baja no configurado en clickupCustomFieldMap');
    }

    broadcastEvent('sync-completed', { point: 'cancellation', taskId });
    res.json({ ok: true, synced: Boolean(fieldId) });
  } catch (e) {
    console.error('Cancellation point error:', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// IMMUTABILITY: Delete with documentation
// ================================================================
app.post('/api/client/delete-documented', auth, async (req, res) => {
  try {
    const { clientId, reason, documentation } = req.body;
    if (!clientId || !reason || !documentation) {
      return res.status(400).json({
        error: 'clientId, reason y documentation son requeridos'
      });
    }

    // Log the deletion attempt with full documentation
    writeLog(req.user, 'CLIENT_DELETE_ATTEMPT', {
      clientId,
      reason,
      documentation,
      authorizedBy: req.user.username,
      timestamp: new Date().toISOString()
    });

    // Mark as deleted in database (soft delete) instead of hard delete
    let config = {};
    const cfgFile = path.join(__dirname, 'sales_config.json');
    if (fs.existsSync(cfgFile)) {
      config = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    }

    if (!config.deletedClients) config.deletedClients = [];
    
    config.deletedClients.push({
      clientId,
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.username,
      reason,
      documentation
    });

    fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2));

    // Broadcast to all clients
    broadcastEvent('client-deleted', {
      clientId,
      deletedBy: req.user.username
    });

    res.json({ ok: true, deleted: true });
  } catch (e) {
    console.error('Delete documented error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET audit logs
app.get('/api/audit/logs', auth, (req, res) => {
  try {
    const logs = fs.existsSync(LOGS_FILE)
      ? JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'))
      : [];
    
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET deleted clients
app.get('/api/client/deleted', auth, (req, res) => {
  try {
    let config = {};
    const cfgFile = path.join(__dirname, 'sales_config.json');
    if (fs.existsSync(cfgFile)) {
      config = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    }
    
    res.json({ deletedClients: config.deletedClients || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ================================================================
// SALES TARGETS - METAS GENERALES DE VENTA
// ================================================================

// Obtener metas generales
app.get('/api/sales/general-targets', auth, (req, res) => {
  try {
    const config = readSalesConfig();
    
    // Estructura de metas generales
    const targets = config.generalTargets || {
      totalClientes: 0,
      totalDolares: 0,
      metaPorPersona: 0,
      periodo: 'mensual', // mensual, trimestral, anual
      fechaInicio: new Date().toISOString().split('T')[0],
      activo: false
    };
    
    // Calcular progreso actual
    const tareas = cache.get('clickup_tasks') || [];
    const ganados = tareas.filter(t => {
      const st = (t.statusSheet || t.status || '').toLowerCase();
      return st.includes('ganado') || st.includes('won') || st.includes('listo para kickoff');
    }).length;
    
    const totalValor = tareas.reduce((sum, t) => {
      const valor = parseFloat(t.valorSheet || t.valor || 0);
      return sum + (isNaN(valor) ? 0 : valor);
    }, 0);
    
    res.json({
      targets,
      progreso: {
        clientesGanados: ganados,
        dolaresTotales: totalValor,
        clientesRestantes: Math.max(0, targets.totalClientes - ganados),
        dolaresRestantes: Math.max(0, targets.totalDolares - totalValor),
        porcentajeClientes: targets.totalClientes > 0 ? Math.round((ganados / targets.totalClientes) * 100) : 0,
        porcentajeDolares: targets.totalDolares > 0 ? Math.round((totalValor / targets.totalDolares) * 100) : 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar metas generales
app.post('/api/sales/general-targets', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admins pueden actualizar metas' });
    }
    
    const config = readSalesConfig();
    const { totalClientes, totalDolares, metaPorPersona, periodo, fechaInicio, activo } = req.body;
    
    config.generalTargets = {
      totalClientes: parseFloat(totalClientes) || 0,
      totalDolares: parseFloat(totalDolares) || 0,
      metaPorPersona: parseFloat(metaPorPersona) || 0,
      periodo: periodo || 'mensual',
      fechaInicio: fechaInicio || new Date().toISOString().split('T')[0],
      activo: activo !== undefined ? activo : true
    };
    
    writeSalesConfig(config);
    
    writeLog(req.user, 'UPDATE_GENERAL_TARGETS', {
      targets: config.generalTargets,
      timestamp: new Date().toISOString()
    });
    
    res.json({ ok: true, targets: config.generalTargets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener metas por vendedor
app.get('/api/sales/vendor-targets/:vendedor', auth, (req, res) => {
  try {
    const { vendedor } = req.params;
    const config = readSalesConfig();
    const tareas = cache.get('clickup_tasks') || [];
    
    // Clientes asignados a este vendedor
    const clientesVendedor = tareas.filter(t => {
      const rVenta = (t.rVenta || '').trim().toLowerCase();
      return rVenta === vendedor.toLowerCase();
    });
    
    // Estadísticas del vendedor
    const ganados = clientesVendedor.filter(t => {
      const st = (t.statusSheet || t.status || '').toLowerCase();
      return st.includes('ganado') || st.includes('won');
    }).length;
    
    const enImplementacion = clientesVendedor.filter(t => {
      const st = (t.statusSheet || t.status || '').toLowerCase();
      return st.includes('implementando') || st.includes('implementation');
    }).length;
    
    const desistidos = clientesVendedor.filter(t => {
      const st = (t.statusSheet || t.status || '').toLowerCase();
      return st.includes('desistio') || st.includes('canceled');
    }).length;
    
    const totalValor = clientesVendedor.reduce((sum, t) => {
      const valor = parseFloat(t.valorSheet || t.valor || 0);
      return sum + (isNaN(valor) ? 0 : valor);
    }, 0);
    
    const vendorMeta = config.monthlyGoals?.[vendedor] || {};
    
    res.json({
      vendedor,
      clientes: {
        total: clientesVendedor.length,
        ganados,
        enImplementacion,
        desistidos
      },
      valor: {
        total: totalValor
      },
      meta: vendorMeta,
      clientesDetalle: clientesVendedor.map(t => ({
        id: t.id,
        nombre: t.nombre,
        estado: t.statusSheet || t.status,
        valor: parseFloat(t.valorSheet || t.valor || 0),
        plan: t.plan
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener resumen de metas (dashboard)
app.get('/api/sales/summary', auth, (req, res) => {
  try {
    const config = readSalesConfig();
    const tareas = cache.get('clickup_tasks') || [];
    const consultores = config.consultores || [];
    
    // Metas generales
    const generalTargets = config.generalTargets || {};
    
    // Agregar por vendedor
    const porVendedor = {};
    consultores.forEach(cons => {
      const clientesCons = tareas.filter(t => {
        const rVenta = (t.rVenta || '').trim().toLowerCase();
        return rVenta === cons.toLowerCase();
      });
      
      const ganados = clientesCons.filter(t => {
        const st = (t.statusSheet || t.status || '').toLowerCase();
        return st.includes('ganado') || st.includes('won');
      }).length;
      
      const valor = clientesCons.reduce((sum, t) => {
        const v = parseFloat(t.valorSheet || t.valor || 0);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      
      porVendedor[cons] = {
        clientes: clientesCons.length,
        ganados,
        valor,
        meta: config.monthlyGoals?.[cons] || {}
      };
    });
    
    // Totales generales
    const totalClientesGanados = tareas.filter(t => {
      const st = (t.statusSheet || t.status || '').toLowerCase();
      return st.includes('ganado') || st.includes('won');
    }).length;
    
    const totalValor = tareas.reduce((sum, t) => {
      const valor = parseFloat(t.valorSheet || t.valor || 0);
      return sum + (isNaN(valor) ? 0 : valor);
    }, 0);
    
    res.json({
      generalTargets,
      porVendedor,
      totales: {
        clientes: tareas.length,
        clientesGanados: totalClientesGanados,
        valor: totalValor,
        vendedores: consultores.length
      },
      progreso: {
        porcentajeClientes: generalTargets.totalClientes ? Math.round((totalClientesGanados / generalTargets.totalClientes) * 100) : 0,
        porcentajeDolares: generalTargets.totalDolares ? Math.round((totalValor / generalTargets.totalDolares) * 100) : 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// CATCH-ALL → SPA
// ================================================================
app.get('*', (_req, res) => {
  res.sendFile(MAIN_HTML);
});

// ================================================================
// INICIO
// ================================================================
ensureDataDir();
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 JWT_SECRET: ${CONFIG.JWT_SECRET ? 'Cargado CORRECTAMENTE' : 'ERROR: NO CARGADO'}`);
  console.log(`🔑 ClickUp List: ${CONFIG.CLICKUP_LIST_ID || 'no configurada'}`);
  console.log(`💾 Cache TTL: ${process.env.CACHE_TTL || 3600}s`);
});
