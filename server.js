'use strict';

const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const path       = require('path');
const NodeCache  = require('node-cache');
const bcryptjs   = require('bcryptjs'); // 🔒 Nuevo: Hashing de contraseñas
const rateLimit  = require('express-rate-limit'); // 🚦 Nuevo: Rate limiting
const { getUserDashboardConfig, saveUserDashboardConfig } = require('./dashboardConfig');
const { mapTasksToClients, computeTasksFingerprint, buscarFechaConcluidoFromDetails, extractAllCustomFieldsRaw, findCustomField: findCustomFieldMapper, getCampo: getCampoMapper } = require('./clickupMapper');
const { importSalesFromSheet, syncSalesWithClients } = require('./salesImporter');
const { retryWithBackoff, SmartCache, validateRequest, ChangesQueue } = require('./phase_2_helpers'); // 🆕 Fase 2 helpers
require('dotenv').config();

const app   = express();
const PORT  = process.env.PORT || 3000;
const cache = new SmartCache(parseInt(process.env.CACHE_TTL) || 3600); // 🆕 SmartCache con invalidación inteligente
const STATIC_ROOT = __dirname;
const MAIN_HTML = path.join(STATIC_ROOT, 'vylex.html');
const DATA_DIR  = path.join(STATIC_ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FORM_SUBMISSIONS_FILE = path.join(DATA_DIR, 'form_submissions.json');
const FORMS_DEFINITIONS_FILE = path.join(DATA_DIR, 'forms_definitions.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const CLIENTES_FILE = path.join(DATA_DIR, 'clientes.json');
const LOCAL_OVERRIDES_FILE = path.join(DATA_DIR, 'local_overrides.json');
const SALES_CONFIG_FILE = path.join(DATA_DIR, 'sales_config.json');
const LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');
const KANBANS_FILE = path.join(DATA_DIR, 'kanbans.json');
const CONFIG_FILE = path.join(DATA_DIR, 'global_config.json'); // defaults (trackeable)
const CONFIG_LOCAL_FILE = path.join(DATA_DIR, 'global_config.local.json'); // secrets/overrides (gitignored)
const HOST = (process.env.HOST || '127.0.0.1').trim();

const PUBLIC_FILES = new Set([
  'vylex.html',
  'vylex-modern.html',
  'charts.js',
  'holasuite.html',
  'holasuitedashnueva.html',
  'dashnuevaholasuite.html'
]);
let cacheMeta = {
  lastSyncAt: null,
  source: 'none',
  taskCount: 0
};

// ================================================================
// SYNC MANAGER (ClickUp / Sheets / etc.)
// ================================================================
const CLICKUP_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
let clickupSync = {
  running: false,
  currentPromise: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastReason: null,
  lastStats: null
};

app.use(express.json());
app.use(cors());

// ================================================================
// SECURITY HEADERS
// ================================================================
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 🚦 RATE LIMITING - Nuevo
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: { error: 'Demasiados intentos de login. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 requests por minuto
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
  skip: (req) => req.user && req.user.role === 'admin', // Admin sin límite
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

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
let auditSseClients = []; // SSE para auditoría (opcional)

function writeLog(user, action, details) {
  try {
    // Leer solo el archivo si existe y tiene menos de 2MB; sino truncar
    let logs = [];
    if (fs.existsSync(LOGS_FILE)) {
      const stat = fs.statSync(LOGS_FILE);
      if (stat.size < 2 * 1024 * 1024) {
        try { logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')); } catch (_e) { logs = []; }
      }
    }
    if (!Array.isArray(logs)) logs = [];
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      user: user?.username || 'system',
      userId: user?.id || null,
      action,
      details
    };
    logs.unshift(newLog);
    // Mantener solo los últimos 1000 registros para evitar crecimiento ilimitado
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs.slice(0, 1000), null, 2));

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
  TAREAS_IGNORAR   : ['configurar whatsapp','configuracion whatsapp','configuracion de whatsapp',
                      'configurar telefonia','configuracion telefonia','configuracion de telefonia',
                      'configurar instagram','configuracion instagram','configuracion de instagram',
                      'configurar messenger','configuracion messenger','configuracion de messenger',
                      'configurar webchat','configuracion webchat','configuracion de webchat',
                      'prueba','test','teste','demo','crear vm'],
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
  'en análisis meta','en analisis meta','analisis de meta','en analisis de meta',
  'listo para instalación','listo para instalacion','en instalación','en instalacion',
  'en capacitación','en capacitacion','capacitacion',
  'go-live','go live','activación canales','activacion canales','activación','activacion',
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
// CONFIGURACIÓN Y PERSISTENCIA
// ================================================================
let sseClients = []; // Para sincronización en tiempo real

function readGlobalConfig() {
  try {
    const base = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
    const local = fs.existsSync(CONFIG_LOCAL_FILE) ? JSON.parse(fs.readFileSync(CONFIG_LOCAL_FILE, 'utf8')) : {};
    const merged = { ...(base || {}), ...(local || {}) };

    // Env overrides (highest priority)
    if ((process.env.CLICKUP_API_KEY || '').trim()) merged.clickupApiKey = (process.env.CLICKUP_API_KEY || '').trim();
    if ((process.env.CLICKUP_LIST_ID || '').trim()) merged.clickupListId = (process.env.CLICKUP_LIST_ID || '').trim();
    if ((process.env.HOLA_API_URL || '').trim()) merged.holaUrl = (process.env.HOLA_API_URL || '').trim();
    if ((process.env.HOLA_API_TOKEN || '').trim()) merged.holaToken = (process.env.HOLA_API_TOKEN || '').trim();
    if ((process.env.GOOGLE_SHEETS_API_KEY || '').trim()) merged.googleSheetsApiKey = (process.env.GOOGLE_SHEETS_API_KEY || '').trim();

    return merged;
  } catch (e) { return {}; }
}
function writeGlobalConfig(config) {
  // Para evitar commitear secretos por accidente, persistimos en un archivo local (gitignored).
  // Mantiene compatibilidad: si CONFIG_LOCAL_FILE no existe, se crea automáticamente.
  fs.writeFileSync(CONFIG_LOCAL_FILE, JSON.stringify(config, null, 2));
  // Notificar a todos los clientes conectados
  broadcastEvent('configUpdated', config);
}

function readSalesConfig() {
  try { return fs.existsSync(SALES_CONFIG_FILE) ? JSON.parse(fs.readFileSync(SALES_CONFIG_FILE, 'utf8')) : {}; }
  catch(e) { return {}; }
}

function writeSalesConfig(data) {
  fs.writeFileSync(SALES_CONFIG_FILE, JSON.stringify(data, null, 2));
  // Notificar a todos los clientes conectados
  broadcastEvent('salesConfigUpdated', data);
}

function readLocalOverrides() {
  try { return fs.existsSync(LOCAL_OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(LOCAL_OVERRIDES_FILE, 'utf8')) : {}; }
  catch(e) { return {}; }
}

function writeLocalOverrides(data) {
  fs.writeFileSync(LOCAL_OVERRIDES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Fusionar datos de ClickUp con sobreescrituras locales
 */
function mergeOverrides(clients) {
  if (!Array.isArray(clients)) return clients;
  const overrides = readLocalOverrides();
  
  return clients.map(client => {
    const ov = overrides[client.id];
    if (!ov) return client;
    
    // Aplicar sobreescrituras (prioridad local)
    return {
      ...client,
      ...ov,
      _hasOverrides: true
    };
  });
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
  // Prevent stale HTML/CSS/JS when iterating quickly on the UI.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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

function defaultFormsDefinitions() {
  return [
    {
      id: 'upgrade',
      name: 'Upgrade / Cross-sell',
      public: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: [
        { id: 'clientName', label: 'Cliente', type: 'text', required: true },
        { id: 'contactName', label: 'Contacto / solicitante', type: 'text', required: false },
        { id: 'email', label: 'Email', type: 'email', required: false },
        { id: 'requestedPlan', label: 'Plan / producto solicitado', type: 'text', required: false },
        { id: 'value', label: 'Valor estimado USD', type: 'number', required: false },
        { id: 'details', label: 'Detalles', type: 'textarea', required: false }
      ]
    },
    {
      id: 'churn-risk',
      name: 'Riesgo de baja',
      public: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: [
        { id: 'clientName', label: 'Cliente', type: 'text', required: true },
        { id: 'contactName', label: 'Contacto / solicitante', type: 'text', required: false },
        { id: 'email', label: 'Email', type: 'email', required: false },
        { id: 'urgency', label: 'Urgencia', type: 'select', required: false, options: ['alta', 'media', 'baja'] },
        { id: 'reason', label: 'Motivo de riesgo', type: 'text', required: false },
        { id: 'details', label: 'Detalles', type: 'textarea', required: false }
      ]
    },
    {
      id: 'eval-system',
      name: 'Evaluación del Sistema',
      public: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: [
        { id: 'name', label: 'Nombre', type: 'text', required: false },
        { id: 'company', label: 'Empresa', type: 'text', required: false },
        { id: 'role', label: 'Rol / área', type: 'text', required: false },
        { id: 'rating', label: 'Puntuación (1-5)', type: 'rating', required: true, min: 1, max: 5 },
        { id: 'best', label: '¿Qué fue lo mejor?', type: 'textarea', required: false },
        { id: 'improve', label: '¿Qué mejorarías?', type: 'textarea', required: false }
      ]
    },
    {
      id: 'eval-implementation',
      name: 'Evaluación del Proceso de Implementación',
      public: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: [
        { id: 'clientName', label: 'Cliente', type: 'text', required: false },
        { id: 'name', label: 'Nombre', type: 'text', required: false },
        { id: 'rating', label: 'Puntuación (1-5)', type: 'rating', required: true, min: 1, max: 5 },
        { id: 'timeline', label: '¿Cumplimos tiempos?', type: 'select', required: false, options: ['sí', 'parcial', 'no'] },
        { id: 'communication', label: 'Comunicación', type: 'select', required: false, options: ['excelente', 'buena', 'regular', 'mala'] },
        { id: 'comments', label: 'Comentarios', type: 'textarea', required: false }
      ]
    }
  ];
}

function readFormsDefinitions() {
  try {
    if (!fs.existsSync(FORMS_DEFINITIONS_FILE)) {
      const defaults = defaultFormsDefinitions();
      fs.writeFileSync(FORMS_DEFINITIONS_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const parsed = JSON.parse(fs.readFileSync(FORMS_DEFINITIONS_FILE, 'utf8'));
    if (!Array.isArray(parsed)) return defaultFormsDefinitions();
    // Auto-migrate: asegurar defaults presentes
    const ids = new Set(parsed.map(f => f?.id).filter(Boolean));
    const merged = [...parsed];
    defaultFormsDefinitions().forEach(df => {
      if (!ids.has(df.id)) merged.push(df);
    });
    return merged;
  } catch (_e) {
    return defaultFormsDefinitions();
  }
}

function writeFormsDefinitions(forms) {
  fs.writeFileSync(FORMS_DEFINITIONS_FILE, JSON.stringify(forms, null, 2));
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
    'mariane':'Mariane Teló','telo':'Mariane Teló','mari telo':'Mariane Teló',
    'blitzangel leon': 'Blitzangel Leon', 'blitzangel': 'Blitzangel Leon',
    'bruno gabriel rodrigues': 'Bruno Gabriel Rodrigues', 'bruno gabriel': 'Bruno Gabriel Rodrigues', 'bruno': 'Bruno Gabriel Rodrigues'
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

// Helpers de filtrado global
function debeIgnorar(t) {
  if (!t || !t.nombre && !t.name) return true;
  const n = normalizeText(t.nombre || t.name);
  if (CONFIG.TAREAS_IGNORAR.some(x => n.includes(normalizeText(x)))) return true;
  
  const status = t.estado || t.status?.status || '';
  const s = normalizeText(status);
  if (CONFIG.ESTADOS_IGNORAR.some(x => normalizeText(x) === s)) return true;
  
  return false;
}

function esValido(t) {
  if (debeIgnorar(t)) return false;
  const status = t.estado || t.status?.status || '';
  const s = normalizeText(status);
  return (CONFIG.ESTADOS_IMPL || []).some(e => s.includes(normalizeText(e)));
}

// Funciones de mapeo movidas a clickupMapper.js

// ================================================================
// CLICKUP: OBTENER TAREAS (con caché)
// ================================================================


async function obtenerTareasClickUp() {
  const CACHE_KEY = 'clickup_tasks_raw';
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    cacheMeta.source = 'cache';
    cacheMeta.taskCount = cached.length;
    return cached;
  }

  // Intentar obtener de ClickUp con retry logic 🔄
  try {
    const apiKey = getClickUpApiKey();
    const listId = getClickUpListId();
    
    // 🆕 Usar retryWithBackoff para resistir rate limits
    const rawTasks = await retryWithBackoff(
      () => obtenerTareasClickUpRaw({ apiKey, listId }),
      3, // maxRetries
      1000, // initialDelayMs
      60000 // maxDelayMs
    );
    
    cache.set(CACHE_KEY, rawTasks); // 🆕 SmartCache auto-maneja TTL
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

async function computeProcessedClientsFromTasks(tareas) {
  if (!Array.isArray(tareas)) return [];

  // Si ya viene procesado (desde clientes.json), no remapear.
  const looksRaw = tareas.length > 0 && (tareas[0].custom_fields || tareas[0].status?.status);
  if (!looksRaw) return tareas;

  const apiKey = getClickUpApiKey();
  const fetcher = async (id) => {
    try {
      const resDetail = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
        headers: { Authorization: apiKey },
        timeout: 30000
      });
      if (!resDetail.ok) return null;
      return await resDetail.json();
    } catch (_e) {
      return null;
    }
  };

  const procesadas = await mapTasksToClients(tareas, CONFIG, {
    fetchTaskDetails: fetcher
  });

  return procesadas;
}

async function runClickUpSync({ reason = 'manual', force = false } = {}) {
  if (clickupSync.running && clickupSync.currentPromise) return clickupSync.currentPromise;

  const now = Date.now();
  if (!force && clickupSync.lastStartedAt) {
    const elapsed = now - new Date(clickupSync.lastStartedAt).getTime();
    // Anti-spam: evitar iniciar syncs seguidos por múltiples clicks
    if (elapsed >= 0 && elapsed < 20 * 1000 && clickupSync.currentPromise) {
      return clickupSync.currentPromise;
    }
  }

  clickupSync.running = true;
  clickupSync.lastStartedAt = new Date().toISOString();
  clickupSync.lastReason = reason;
  clickupSync.lastError = null;

  clickupSync.currentPromise = (async () => {
    const startedAt = Date.now();
    try {
      const tareasRaw = await obtenerTareasClickUp();
      let procesadas = await computeProcessedClientsFromTasks(tareasRaw);

      const beforeFilter = procesadas.length;
      procesadas = procesadas.filter(t => !debeIgnorar(t));
      const ignored = beforeFilter - procesadas.length;

      const dashboard = buildDashboard(procesadas);

      cache.set('clickup_clients_processed', procesadas, CLICKUP_SYNC_INTERVAL_MS / 1000);
      cache.set('clickup_dashboard_snapshot', dashboard, CLICKUP_SYNC_INTERVAL_MS / 1000);

      const payload = {
        updatedAt: new Date().toISOString(),
        clientes: procesadas,
        meta: {
          reason,
          ignored,
          total: procesadas.length,
          tookMs: Date.now() - startedAt
        }
      };
      fs.writeFileSync(CLIENTES_FILE, JSON.stringify(payload, null, 2));
      fs.writeFileSync(
        path.join(DATA_DIR, 'sync_complete.json'),
        JSON.stringify({ total: procesadas.length, timestamp: payload.updatedAt, reason }, null, 2)
      );

      clickupSync.lastSuccessAt = payload.updatedAt;
      clickupSync.lastStats = payload.meta;
      return { ok: true, meta: payload.meta };
    } catch (e) {
      clickupSync.lastError = e.message;
      return { ok: false, error: e.message };
    } finally {
      clickupSync.running = false;
      clickupSync.lastFinishedAt = new Date().toISOString();
      clickupSync.currentPromise = null;
    }
  })();

  return clickupSync.currentPromise;
}

function invalidarCache() {
  // 🆕 SmartCache invalidaría por patrón, no por clave
  cache.invalidatePattern('clickup_tasks.*');
}

// ================================================================
// CONSTRUIR DASHBOARD ANALYTICS
// ================================================================
function buildDashboard(tasks) {
  const activos    = tasks.filter(t => t.status === 'Activo' || (t.status && t.status.includes('Activo')));
  const enProceso  = tasks.filter(t => t.status === 'En Implementación' || (t.status && t.status.includes('Implementación')));
  const cancelados = tasks.filter(t => t.status === 'Cancelado' || (t.status && t.status.includes('Cancelado')));

  /* ---- KPIs ---- */
  const total        = tasks.length;
  const tasaExito    = total > 0 ? +((activos.length/total)*100).toFixed(1) : 0;
  const tasaCancel   = total > 0 ? +((cancelados.length/total)*100).toFixed(1) : 0;
  const tasaUpgrade  = total > 0 ? +((tasks.filter(t => t.tipo === 'Upgrade').length/total)*100).toFixed(1) : 0;
  const promDiasImpl = activos.length > 0
    ? +(activos.reduce((s,t)=>s+(t.dImpl||0),0)/activos.length).toFixed(1) : 0;
  const promDiasEnProceso = enProceso.length > 0
    ? +(enProceso.reduce((s,t)=>s+(t.dImpl||0),0)/enProceso.length).toFixed(1) : 0;

  /* ---- CANALES (sobre activos + en proceso) ---- */
  const allActive = [...activos, ...enProceso];
  const canales = {
    WhatsApp  : allActive.filter(t=>t.canales?.wa==='SÍ').length,
    Instagram : allActive.filter(t=>t.canales?.ig==='SÍ').length,
    WebChat   : allActive.filter(t=>t.canales?.wc==='SÍ').length,
    PBX       : allActive.filter(t=>t.canales?.pbx==='SÍ').length,
    Telegram  : allActive.filter(t=>t.canales?.tg==='SÍ').length,
    Messenger : allActive.filter(t=>t.canales?.msg==='SÍ').length
  };

  /* ---- POR PAÍS ---- */
  const porPais = {};
  tasks.forEach(t => {
    const p = t.pais || 'No definido';
    if (!porPais[p]) porPais[p] = { total:0, activos:0, enProceso:0, cancelados:0 };
    porPais[p].total++;
    if (t.status==='Activo' || (t.status && t.status.includes('Activo')))           porPais[p].activos++;
    if (t.status==='En Implementación' || (t.status && t.status.includes('Implementación'))) porPais[p].enProceso++;
    if (t.status==='Cancelado' || (t.status && t.status.includes('Cancelado')))     porPais[p].cancelados++;
  });

  /* ---- POR PLAN ---- */
  const porPlan = {};
  tasks.forEach(t => {
    const p = t.plan || 'Sin plan';
    if (!porPlan[p]) porPlan[p] = { total:0, activos:0, enProceso:0, cancelados:0 };
    porPlan[p].total++;
    if (t.status==='Activo' || (t.status && t.status.includes('Activo')))           porPlan[p].activos++;
    if (t.status==='En Implementación' || (t.status && t.status.includes('Implementación'))) porPlan[p].enProceso++;
    if (t.status==='Cancelado' || (t.status && t.status.includes('Cancelado')))     porPlan[p].cancelados++;
  });

  /* ---- ETAPA ACTUAL (solo en proceso) ---- */
  const etapaActual = {};
  enProceso.forEach(t => {
    const etapa = t.etapaActual || t.estado || 'Desconocida';
    if (!etapaActual[etapa]) etapaActual[etapa] = 0;
    etapaActual[etapa]++;
  });

  /* ---- VALORES FINANCIEROS (NUEVO) ---- */
  const salesCfg = readSalesConfig();
  const aderenciaDefault = salesCfg.generalConfig?.aderenciaDefault || 50;
  
  let valorTotalGanado = 0;
  let valorTotalPerdido = 0;
  let mensualidadTotal = 0;
  let adherenciaTotal = 0;

  // Solo contamos lo ganado en el mes actual para la meta de este mes
  const currentMonthStr = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  const metasMes = salesCfg.monthlyGoals?.[currentMonthStr] || { general: 0, individual: {} };

  tasks.forEach(t => {
    const mensualidad = parseFloat(t.mensualidad) || 0;
    const aderencia = t.aderencia !== undefined ? parseFloat(t.aderencia) : aderenciaDefault;
    const totalCliente = mensualidad + aderencia;

    if (t.status === 'Activo' || (t.status && t.status.includes('Activo'))) {
      valorTotalGanado += totalCliente;
      mensualidadTotal += mensualidad;
      adherenciaTotal += aderencia;
    } else if (t.status === 'Cancelado' || (t.status && t.status.includes('Cancelado'))) {
      valorTotalPerdido += totalCliente;
    }
  });

  /* ---- POR CONSULTOR (con metas) ---- */
  const globalCfg = readGlobalConfig();
  const consultantMetas = globalCfg.consultantMetas || {};
  const individualSalesGoals = metasMes.individual || {};

  const porConsultor = {};
  tasks.forEach(t => {
    const mensualidad = parseFloat(t.mensualidad) || 0;
    const aderencia = t.aderencia !== undefined ? parseFloat(t.aderencia) : aderenciaDefault;
    const totalCliente = mensualidad + aderencia;
    const isActivo = t.status === 'Activo' || (t.status && t.status.includes('Activo'));

    // Incluir a rVenta (vendedor) + los responsables de implementación
    const personasInteres = new Set([t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct, t.rVenta].filter(r => r && r !== ''));

    personasInteres.forEach(consultor => {
      if (!porConsultor[consultor])
        porConsultor[consultor] = { 
          total: 0, activos: 0, enProceso: 0, cancelados: 0, etapas: 0, 
          metaImpl: consultantMetas[consultor] || 0,
          metaVenta: individualSalesGoals[consultor] || 0,
          valorGanado: 0 
        };
      
      // Contar una etapa si es responsable de una etapa técnica
      const esTecnico = [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct].includes(consultor);
      if (esTecnico) porConsultor[consultor].etapas++;
      
      porConsultor[consultor].total++;
      if (isActivo) {
        porConsultor[consultor].activos++;
        // Si es el vendedor, le sumamos el valor ganado
        if (t.rVenta === consultor) {
          porConsultor[consultor].valorGanado += totalCliente;
        }
      }
      if (t.status === 'En Implementación' || (t.status && t.status.includes('Implementación'))) porConsultor[consultor].enProceso++;
      if (t.status === 'Cancelado' || (t.status && t.status.includes('Cancelado'))) porConsultor[consultor].cancelados++;
    });
  });

  // Agregar % de cumplimiento de meta
  Object.values(porConsultor).forEach(c => {
    c.pctMetaImpl = c.metaImpl > 0 ? +((c.enProceso / c.metaImpl) * 100).toFixed(1) : null;
    c.pctMetaVenta = c.metaVenta > 0 ? +((c.valorGanado / c.metaVenta) * 100).toFixed(1) : null;
  });

  /* ---- POR MES ---- */
  const porMes = {};
  tasks.forEach(t => {
    const mes = t.mesInicio || 'Sin mes';
    if (!porMes[mes]) porMes[mes] = { mes, iniciadas:0, finalizadas:0, canceladas:0, enCurso:0 };
    porMes[mes].iniciadas++;
    if (t.status==='Activo' || (t.status && t.status.includes('Activo')))           porMes[mes].finalizadas++;
    if (t.status==='Cancelado' || (t.status && t.status.includes('Cancelado')))     porMes[mes].canceladas++;
    if (t.status==='En Implementación' || (t.status && t.status.includes('Implementación'))) porMes[mes].enCurso++;
  });

  /* ---- ALERTAS ---- */
  const tareasEnAlerta = tasks
    .filter(t => t.alerta && t.alerta !== 'NO')
    .map(t => ({
      id: t.id,
      nombre: t.nombre,
      alerta: t.alerta,
      dImpl: t.dImpl,
      dSinMov: t.dSinMov,
      pais: t.pais,
      rKickoff: t.rKickoff,
      estado: t.estado
    }))
    .slice(0, 50);

  const alertas = {
    criticas     : tasks.filter(t => t.alerta && t.alerta.includes('20')).length,
    sinMovimiento: tasks.filter(t => t.alerta && t.alerta.includes('Sin mov')).length,
    pausadas     : tasks.filter(t => t.pausada==='SÍ').length,
    esperandoCli : tasks.filter(t => t.espCli==='SÍ').length,
    morosidad    : tasks.filter(t => t.moro==='SÍ').length,
    detalle      : tareasEnAlerta
  };

  /* ---- TIPOS ---- */
  const porTipo = {
    Implementación: tasks.filter(t=>t.tipo==='Implementación').length,
    Upgrade       : tasks.filter(t=>t.tipo==='Upgrade').length
  };

  const ultimaActualizacion = new Date().toISOString();

  return {
    kpis: {
      total,
      activos: activos.length,
      enProceso: enProceso.length,
      cancelados: cancelados.length,
      tasaExito,
      tasaCancel,
      tasaUpgrade,
      promDiasImpl,
      promDiasEnProceso,
      valorTotalGanado,
      valorTotalPerdido,
      mensualidadTotal,
      adherenciaTotal,
      metaGeneral: metasMes.general,
      pctMetaGeneral: metasMes.general > 0 ? +((valorTotalGanado / metasMes.general) * 100).toFixed(1) : null
    },
    canales, porPais, porPlan, etapaActual, porConsultor, porMes, alertas, porTipo,
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
app.post('/api/auth/login', loginLimiter, (req, res) => {
  if (!CONFIG.JWT_SECRET) {
    return res.status(503).json({ error:'Falta configurar JWT_SECRET en el entorno' });
  }
  const { username, password, lang } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: lang==='pt' ? 'Usuário e senha são obrigatórios' : 'Usuario y contraseña requeridos' });

  const usersList = readUsers();
  const user = usersList.find(u => u.username === username.toLowerCase());
  
  // 🔒 Verificar contraseña con bcrypt (compatibilidad con ambas - migración en progreso)
  const passwordIsValid = user && (
    bcryptjs.compareSync(password, user.password) || 
    user.password === password // Compatibilidad temporal con plaintext
  );
  
  if (!user || !passwordIsValid)
    return res.status(401).json({ error: lang==='pt' ? 'Credenciais inválidas' : 'Credenciales inválidas' });

  const token = jwt.sign(
    { id:user.id, username:user.username, role:user.role, name:user.name },
    CONFIG.JWT_SECRET,
    { expiresIn:'8h' } // 8h para evitar desconexiones frecuentes
  );
  
  // Obtener configuración global guardada (sin exponer secretos al cliente)
  const globalConfig = readGlobalConfig();
  const listId = globalConfig.clickupListId || process.env.CLICKUP_LIST_ID;
  
  // ✅ Audit log
  writeLog(user, 'AUTH_LOGIN_SUCCESS', { username: user.username });
  
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

  // 🔒 Hash password con bcrypt
  const hashedPassword = bcryptjs.hashSync(password, 10);
  
  const newUser = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    username: username.toLowerCase().trim(),
    password: hashedPassword, // 🔒 Contraseña hasheada
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

// Renovar token JWT sin necesidad de volver a loguear
// El cliente debe llamar este endpoint antes de que expire (ej: a los 7h de una sesión de 8h)
app.post('/api/auth/token-refresh', auth, (req, res) => {
  try {
    if (!CONFIG.JWT_SECRET) {
      return res.status(503).json({ error: 'JWT_SECRET no configurado' });
    }
    const newToken = jwt.sign(
      { id: req.user.id, username: req.user.username, role: req.user.role, name: req.user.name },
      CONFIG.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token: newToken, expiresIn: '8h' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  const rawPassword = String(req.body.password || '').trim();
  if (rawPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const newUser = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    username: String(req.body.username || '').toLowerCase().trim(),
    password: bcryptjs.hashSync(rawPassword, 10), // 🔒 Siempre hasheado
    role: String(req.body.role || 'consultant'),
    name: String(req.body.name || '').trim(),
    createdAt: new Date().toISOString()
  };
  if (!newUser.username || !newUser.name) {
    return res.status(400).json({ error: 'Datos incompletos: username y name son requeridos' });
  }
  if (users.some(u => u.username === newUser.username)) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  users.push(newUser);
  writeUsers(users);
  writeLog(req.user, 'CREATE_USER', { username: newUser.username, role: newUser.role });
  res.json({ ok: true, user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role } });
});

app.put('/api/users/:id/password', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const users = readUsers();
  const id = parseInt(req.params.id, 10);
  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const newPassword = String(req.body.password || '').trim();
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Contraseña inválida (mínimo 6 caracteres)' });
  }
  user.password = bcryptjs.hashSync(newPassword, 10); // 🔒 Siempre hasheado
  writeUsers(users);
  writeLog(req.user, 'CHANGE_PASSWORD', { targetUserId: id, targetUsername: user.username });
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
// RUTAS - VENTAS Y METAS (CONSOLIDADO)
// ================================================================
app.get('/api/sales/config', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  res.json(readSalesConfig());
});

app.post('/api/sales/config', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Prohibido' });
  const config = readSalesConfig();
  const newConfig = { ...config, ...req.body };
  writeSalesConfig(newConfig);
  res.json({ ok: true, config: newConfig });
});

// Sincronizar vendedores desde Excel/CSV
// Helper: Normalizar texto para matching
function normalizeForMatching(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Helper: Buscar cliente por nombre (fuzzy matching)
function findClientByName(nombre) {
  const tareas = cache.get('clickup_tasks_raw') || [];
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
    
    const overrides = readLocalOverrides();
    const rows = Array.isArray(req.body.rows) ? req.body.rows : (Array.isArray(req.body.data) ? req.body.data : []);
    const requestVendedor = req.body.vendedor || '';
    let matched = 0;
    let updated = 0;
    let created = 0;
    const results = [];
    
    rows.forEach(row => {
      const clienteName = (row.cliente || row.nombre || '').trim();
      if (!clienteName) return;
      
      const existingTask = findClientByName(clienteName);
      
      if (existingTask) {
        matched++;
        const id = existingTask.id;
        if (!overrides[id]) overrides[id] = {};
        
        // Mensualidad
        const m = row.mensualidad || row.recurrente || row.monthly;
        if (m !== undefined && m !== '') {
          overrides[id].mensualidad = parseFloat(m) || 0;
          updated++;
        }
        
        // Adherencia
        const a = row.aderencia || row.implementacion || row.setup;
        if (a !== undefined && a !== '') {
          overrides[id].aderencia = parseFloat(a) || 0;
          updated++;
        }

        // Vendedor
        const v = row.vendedor || row.owner || requestVendedor;
        if (v) {
          overrides[id].rVenta = String(v).trim();
          updated++;
        }

        // Estado (complementario local)
        if (row.estado || row.status) {
          overrides[id].lastImportStatus = String(row.estado || row.status).toLowerCase();
        }

        results.push({ id, cliente: clienteName, action: 'updated' });
      } else {
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

    writeLocalOverrides(overrides);
    writeLog(req.user, 'IMPORT_CLIENTS_EXCEL', { count: rows.length, matched, updated, created });
    
    res.json({
      ok: true,
      matched,
      updated,
      created,
      results,
      message: `${matched} coincidencias, ${updated} actualizados en capa local, ${created} nuevos no encontrados`
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
  try {
    const tareas = cache.get('clickup_tasks') || [];
    const fromBodyCons = Array.isArray(req.body.consultores) ? req.body.consultores : [];
    const fromBodyVend = Array.isArray(req.body.vendedores) ? req.body.vendedores : [];

    const consultores = new Set(fromBodyVend); // Priorizar lo que viene del frontend mejor procesado
    const implementadores = new Set(fromBodyCons);
    
    const vendorMatches = {};
    const implMatches = {};
    
    // Si tenemos tareas, extraer también para asegurar matches individuales
    tareas.forEach(t => {
      if (t.rVenta) {
        consultores.add(t.rVenta.trim());
        vendorMatches[t.id] = { clientName: t.nombre, consultor: t.rVenta.trim(), status: t.status, tipo: 'vendedor' };
      }
      
      const impl_roles = [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct].filter(r => r && r.trim());
      impl_roles.forEach(role => {
        implementadores.add(role);
        if (!implMatches[t.id]) implMatches[t.id] = [];
        implMatches[t.id].push({ nombre: role, roles: { kickoff: t.rKickoff === role, cap: t.rCap === role, act: t.rAct === role } });
      });
    });
    
    const config = readSalesConfig();
    config.consultores = Array.from(consultores).sort();
    config.implementadores = Array.from(implementadores).sort();
    // Vendedores son consultores comerciales
    config.sellers = config.consultores;
    
    writeSalesConfig(config);
    
    writeLog(req.user, 'SYNC_ROLES_SUCCESS', { count: consultores.size + implementadores.size });
    res.json({ ok: true, vendedores: config.consultores.length, implementadores: config.implementadores.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/consultores/sync', auth, async (req, res) => {
  // Sincronizar lista de consultores desde ClickUp members
  try {
    const consultores = {};
    
    // Obtener miembros desde ClickUp
    const teamRes = await fetch(`https://api.clickup.com/api/v2/team`, {
      headers: { Authorization: getClickUpApiKey() }
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
    
    // Guardar en configuración (preferimos archivo local gitignored)
    if (Object.keys(consultores).length > 0) {
      const globalConfig = readGlobalConfig();
      globalConfig.CONSULTORES = consultores;
      writeGlobalConfig(globalConfig);
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

// Eliminado bloque duplicado de CLICKUP MEMBERS para evitar conflictos de estructura.
// La versión definitiva reside en la línea ~2840.

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

// PROXY GENÉRICO PARA CLICKUP (CORS FIX)
// ================================================================
app.get('/api/clickup/proxy/list/:id', auth, async (req, res) => {
  try {
    const listId = req.params.id;
    const apiKey = getClickUpApiKey();
    const resp = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: apiKey }
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/clickup/proxy/tasks', auth, async (req, res) => {
  try {
    const listId = getClickUpListId();
    const apiKey = getClickUpApiKey();
    const page = req.query.page || 0;
    const url = `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true&archived=false&subtasks=true`;
    const resp = await fetch(url, {
      headers: { Authorization: apiKey }
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// CLICKUP SYNC → data/clientes.json + SSE(dataUpdated)
// ================================================================
function ensureDataDir() {
  // Ya manejado al inicio del servidor
}

async function obtenerTareasClickUpRaw({ apiKey, listId }) {
  const mask = (s) => s ? (s.substring(0, 4) + '...' + s.substring(s.length - 4)) : 'MISSING';
  console.log(`📡 Iniciando sincronización ClickUp. ListId: ${mask(listId)}, ApiKey: ${mask(apiKey)}`);
  
  const tasks = [];
  let page = 0;
  while (page < 20) {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task` +
      `?page=${page}&include_closed=true&archived=false&subtasks=true`;
    let resp;
    let retries = 0;
    // Manejo de rate-limit 429 con retry automático
    while (retries <= 3) {
      resp = await fetch(url, {
        headers: { Authorization: apiKey },
        timeout: 30000
      });
      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') || '10', 10);
        const waitMs = Math.min(retryAfter * 1000, 60000);
        console.warn(`⚠️ ClickUp Rate Limit (429) en página ${page}. Esperando ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        retries++;
        continue;
      }
      break;
    }
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`❌ ClickUp API Error ${resp.status} en página ${page}: ${resp.statusText}. Detalle: ${errText}`);
      throw new Error(`ClickUp API ${resp.status}: ${resp.statusText}`);
    }
    const data = await resp.json();
    if (!data.tasks || data.tasks.length === 0) break;
    tasks.push(...data.tasks);
    if (data.tasks.length < 100) break;
    page++;
    await new Promise(r => setTimeout(r, 400)); // Pequeña pausa entre páginas
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

    // 🆕 Limitar el fetching de detalles a tareas relevantes (no canceladas ni muy antiguas)
    const detailedTasks = tasksRaw
      .filter(t => {
         const st = (t.status?.status || '').toLowerCase();
         return !st.includes('cancel') && !st.includes('closed') && !st.includes('cerrado');
      })
      .slice(0, 100); // Límite de seguridad inicial

    const detailFetcher = createLimitedFetcher(10, async (id) => {
      const start = Date.now();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
        headers: { Authorization: apiKey }
      });
      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`⚠️ Rate Limit en ClickUp para tarea ${id}`);
          return null;
        }
        return null;
      }
      return res.json();
    });

    // Leer datos anteriores para optimizar (prevClients cache fInicio)
    let prevData = { clientes: [] };
    if (fs.existsSync(CLIENTES_FILE)) {
      try {
        prevData = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
      } catch(e) { console.error('Error leyendo prevData:', e); }
    }

    const clients = await mapTasksToClients(tasksRaw, {
      DIAS_ALERTA: 7,
      DIAS_META: CONFIG.DIAS_META,
      PAISES: CONFIG.PAISES,
      FERIADOS: CONFIG.FERIADOS,
      TAREAS_IGNORAR: CONFIG.TAREAS_IGNORAR,
      ESTADOS_IGNORAR: CONFIG.ESTADOS_IGNORAR,
      ESTADOS_IMPL: CONFIG.ESTADOS_IMPL || []
    }, {
      tz,
      prevClients: prevData.clientes || [],
      fetchTaskDetails: async (id) => {
        // Solo obtener detalles si es una de las tareas filtradas como relevantes
        if (detailedTasks.some(dt => dt.id === id)) {
           return detailFetcher(id);
        }
        return null;
      },
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
    let clientes = [];
    let meta = {};

    // 1. Obtener datos (archivo o caché)
    if (fs.existsSync(CLIENTES_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
        clientes = Array.isArray(parsed?.clientes) ? parsed.clientes : [];
        meta = {
          source: 'file',
          updatedAt: parsed.updatedAt || null,
          totalOriginal: clientes.length,
          fingerprint: parsed.fingerprint || null
        };
      } catch (_e) { /* fallthrough */ }
    }

    if (clientes.length === 0) {
      clientes = await obtenerTareasClickUp();
      meta = { ...cacheMeta, source: 'cache', totalOriginal: clientes.length };
    }

    // 2. Aplicar Filtros (Query Params)
    const { status, pais, consultor, plan, q, limit, skip } = req.query;

    if (status) {
      const s = String(status).toLowerCase();
      clientes = clientes.filter(c => String(c.status || '').toLowerCase().includes(s) || String(c.estado || '').toLowerCase().includes(s));
    }
    if (pais) {
      const p = normalizeText(pais);
      clientes = clientes.filter(c => normalizeText(c.pais || '').includes(p));
    }
    if (consultor) {
      const cons = normalizeText(consultor);
      clientes = clientes.filter(c => 
        normalizeText(c.rKickoff || '').includes(cons) || 
        normalizeText(c.rVer || '').includes(cons) || 
        normalizeText(c.rCap || '').includes(cons)
      );
    }
    if (plan) {
      const pl = normalizeText(plan);
      clientes = clientes.filter(c => normalizeText(c.plan || '').includes(pl));
    }
    if (q) {
      const search = normalizeText(q);
      clientes = clientes.filter(c => 
        normalizeText(c.nombre || '').includes(search) || 
        normalizeText(c.ip || '').includes(search) || 
        normalizeText(c.dominio || '').includes(search)
      );
    }

    // 3. Paginación y Retorno
    let finalClientes = mergeOverrides(clientes);
    const totalFiltrado = finalClientes.length;
    if (skip) finalClientes = finalClientes.slice(parseInt(skip, 10));
    if (limit) finalClientes = finalClientes.slice(0, parseInt(limit, 10));

    res.json({
      clientes: finalClientes,
      meta: {
        ...meta,
        totalFiltrado,
        limit: limit ? parseInt(limit, 10) : null,
        skip: skip ? parseInt(skip, 10) : 0
      }
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTAS - DASHBOARD
// ================================================================
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const tasksRaw  = await obtenerTareasClickUp();
    const tasks     = mergeOverrides(tasksRaw);
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

    let filtradas = tasks.filter(t => !debeIgnorar(t));
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
  rKickoff: '6c5d07c7-82df-4ea8-997a-19b40ef0a1cf',
  rVer: 'cfc49e0f-16c8-4518-a1f2-09cffab319a9',
  rCap: '25f5a125-50cb-45b2-aaf7-82af69340a84',
  rGoLive: 'f67429f1-4f69-4432-99c8-c592f11015f5',
  rAct: '565da23b-9415-4a54-8e78-4b3e80765ded',
  pais: '0db874a3-5801-407f-8026-1c3af67dc4e3',
  plan: '24777517-3feb-493c-87b6-716d504c49b9',
  email: '049004a9-ff71-4463-b3ce-fd8d2b58606d',
  telefono: '6b351359-0e4b-4c02-8d07-d7ba1bcbda83'
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
    if (!q || q.length < 2) return res.json({ resultados: [] });
    const tasks    = await obtenerTareasClickUp();
    const busqueda = normalizeText(q);
    const resultados = tasks
      .filter(t =>
        normalizeText(t.nombre || '').includes(busqueda) ||
        (t.ip     && normalizeText(t.ip).includes(busqueda)) ||
        (t.dominio && normalizeText(t.dominio).includes(busqueda)) ||
        (t.pais   && normalizeText(t.pais).includes(busqueda)) ||
        (t.email  && normalizeText(t.email).includes(busqueda)) ||
        (t.plan   && normalizeText(t.plan).includes(busqueda)) ||
        (t.rKickoff && normalizeText(t.rKickoff).includes(busqueda)) ||
        (t.rVer   && normalizeText(t.rVer).includes(busqueda)) ||
        (t.rCap   && normalizeText(t.rCap).includes(busqueda)) ||
        (t.rVenta && normalizeText(t.rVenta).includes(busqueda))
      )
      .slice(0, 20)
      .map(t => ({
        id: t.id,
        nombre: t.nombre,
        status: t.status,
        estado: t.estado || '',
        pais: t.pais || '',
        plan: t.plan || '',
        ip: t.ip || '',
        dominio: t.dominio || '',
        linkHola: t.linkHola || '',
        rKickoff: t.rKickoff || '',
        rVenta: t.rVenta || ''
      }));
    res.json({ resultados, total: resultados.length });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ================================================================
// RUTA - ACTUALIZAR VALORES FINANCIEROS (LOCAL OVERRIDE)
// ================================================================
app.post('/api/clientes/:id/financials', auth, (req, res) => {
  try {
    const { id } = req.params;
    const { mensualidad, aderencia, v_total, rVenta, notas } = req.body;
    
    const overrides = readLocalOverrides();
    if (!overrides[id]) overrides[id] = {};
    
    if (mensualidad !== undefined) overrides[id].mensualidad = parseFloat(mensualidad) || 0;
    if (aderencia !== undefined) overrides[id].aderencia = parseFloat(aderencia) || 0;
    if (v_total !== undefined) overrides[id].valorVenta = parseFloat(v_total) || 0;
    if (rVenta !== undefined) overrides[id].rVenta = String(rVenta).trim();
    if (notas !== undefined) overrides[id].notas_locales = String(notas).trim();
    
    overrides[id].updatedAt = new Date().toISOString();
    
    writeLocalOverrides(overrides);
    writeLog(req.user, 'EDIT_FINANCIALS', { clientId: id, fields: Object.keys(req.body) });
    
    res.json({ ok: true, id, data: overrides[id] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ================================================================
// RUTAS - VENTAS Y METAS
// ================================================================

/**
 * Establecer metas de ventas (General e Individual por mes)
 */
app.post('/api/sales/goals', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins' });
    
    const { month, general, individual } = req.body; // month: "2024-04"
    if (!month) return res.status(400).json({ error: 'Falta mes (YYYY-MM)' });
    
    const salesCfg = readSalesConfig();
    if (!salesCfg.monthlyGoals) salesCfg.monthlyGoals = {};
    
    salesCfg.monthlyGoals[month] = {
      general: parseFloat(general) || 0,
      individual: individual || {}
    };
    
    writeSalesConfig(salesCfg);
    writeLog(req.user, 'SET_GOALS', { month, general });
    
    res.json({ ok: true, month, data: salesCfg.monthlyGoals[month] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Obtener estadísticas históricas de ventas
 */
app.get('/api/sales/stats', auth, async (req, res) => {
  try {
    const tasksRaw = await obtenerTareasClickUp();
    const tasks = mergeOverrides(tasksRaw);
    
    const statsByMonth = {};
    const salesCfg = readSalesConfig();
    const aderenciaDefault = salesCfg.generalConfig?.aderenciaDefault || 50;

    tasks.forEach(t => {
      const month = t.mesInicio || 'Desconocido';
      if (!statsByMonth[month]) {
        statsByMonth[month] = { 
          month, 
          ganado: 0, 
          perdido: 0, 
          iniciados: 0, 
          concluidos: 0,
          meta: salesCfg.monthlyGoals?.[month]?.general || 0
        };
      }
      
      const val = (parseFloat(t.mensualidad) || 0) + (t.aderencia !== undefined ? parseFloat(t.aderencia) : aderenciaDefault);
      
      statsByMonth[month].iniciados++;
      if (t.status === 'Activo' || (t.status && t.status.includes('Activo'))) {
        statsByMonth[month].ganado += val;
        statsByMonth[month].concluidos++;
      } else if (t.status === 'Cancelado' || (t.status && t.status.includes('Cancelado'))) {
        statsByMonth[month].perdido += val;
      }
    });

    res.json(Object.values(statsByMonth).sort((a, b) => b.month.localeCompare(a.month)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
    let status = String(req.body?.status || '').trim().toLowerCase();
    if (!status) return res.status(400).json({ error: 'Status requerido' });

    // Normalización de estados para el Kanban
    const statusMap = {
      'kickoff': 'en kickoff',
      'analisis meta': 'en analisis meta',
      'análisis de meta': 'en analisis meta',
      'instalacion': 'listo para instalación',
      'capacitacion': 'en capacitación',
      'go-live': 'go-live',
      'go live': 'go-live',
      'activac': 'activación canales',
      'activación / canales': 'activación canales',
      'espera wispro': 'en espera wispro'
    };

    if (statusMap[status]) {
      status = statusMap[status];
    }

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
    const author = String(req.body?.author || '').trim();
    
    if (!comment) {
      return res.status(400).json({ error: 'Comentario requerido' });
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'API Key de ClickUp no disponible' });
    }
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID requerido' });
    }
    
    const commentText = author ? `Comentado por ${author}: ${comment}` : comment;

    const resp = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment_text: commentText, notify_all: false }),
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

/**
 * 🆕 NUEVO: Obtener miembros del espacio de trabajo (Team) de ClickUp con Caché
 */
app.get('/api/clickup/members', auth, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    
    // 1. Verificar Caché (si no se fuerza)
    if (!force) {
      const cachedMembers = cache.get('clickup_members');
      if (cachedMembers) {
        console.log(`📡 [API] Retornando ${cachedMembers.members.length} miembros desde caché`);
        return res.json({ ok: true, ...cachedMembers, fromCache: true });
      }
    } else {
      console.log('📡 [API] Forzando recarga de miembros de ClickUp...');
    }

    const apiKey = getClickUpApiKey();
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API Key no disponible' });
    
    // 2. Obtener el Team ID (Workspace)
    const teamsResp = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: apiKey }
    });
    
    if (!teamsResp.ok) {
      const errJson = await teamsResp.json().catch(() => ({}));
      return res.status(teamsResp.status).json({ error: errJson.err || errJson.error || 'No se pudo obtener el Workspace de ClickUp' });
    }

    const teamsJson = await teamsResp.json();
    if (!teamsJson.teams?.length) {
      return res.status(404).json({ error: 'No se encontraron Workspaces vinculados en ClickUp' });
    }
    
    const teamId = teamsJson.teams[0].id;
    const members = teamsJson.teams[0].members || [];
    
    // 3. Guardar en Caché (10 minutos para miembros)
    const cacheData = { teamId, members };
    cache.set('clickup_members', cacheData, 600); 

    console.log(`📡 [API] Enviando ${members.length} miembros del Team ${teamId} (y guardando en caché)`);
    res.json({ ok: true, ...cacheData });
  } catch (e) {
    console.error('❌ Error fetching ClickUp members:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 🆕 NUEVO: Actualizar Campo Personalizado en ClickUp
 */
app.post('/api/clickup/task/:id/custom_field/:fieldId', auth, async (req, res) => {
  try {
    const { id, fieldId } = req.params;
    const { value } = req.body; // El valor puede ser un string, array, etc.
    const apiKey = getClickUpApiKey();

    if (!apiKey) return res.status(400).json({ error: 'ClickUp API Key no disponible' });

    // ClickUp requiere un formato específico para campos personalizados según su tipo
    const resp = await fetch(`https://api.clickup.com/api/v2/task/${id}/field/${fieldId}`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value }),
      timeout: 30000
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`ClickUp API Error (CustomField):`, resp.status, json);
      return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });
    }

    res.json({ ok: true, value, response: json });
  } catch (e) {
    console.error('Custom field endpoint error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * 🆕 NUEVO: Eliminar Etiqueta en ClickUp
 */
app.delete('/api/clickup/task/:id/tag/:tag', auth, async (req, res) => {
  try {
    const { id, tag } = req.params;
    const apiKey = getClickUpApiKey();
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API Key no disponible' });

    const resp = await fetch(`https://api.clickup.com/api/v2/task/${id}/tag/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
      headers: { Authorization: apiKey },
      timeout: 30000
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });

    res.json({ ok: true, tag });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * 🆕 NUEVO: Actualizar Responsables (Assignees) en ClickUp
 */
app.put('/api/clickup/task/:id/assignees', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignees } = req.body; // Array de IDs de usuario
    const apiKey = getClickUpApiKey();
    if (!apiKey) return res.status(400).json({ error: 'ClickUp API Key no disponible' });

    if (!Array.isArray(assignees)) {
      return res.status(400).json({ error: 'Se requiere un array de assignees' });
    }

    const resp = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ assignees }),
      timeout: 30000
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ error: json?.err || json?.error || `ClickUp HTTP ${resp.status}` });

    res.json({ ok: true, assignees: json.assignees });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// Admin: listar/crear/editar formularios dinámicos
app.get('/api/forms', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Permiso denegado' });
  const forms = readFormsDefinitions();
  res.json({ ok: true, forms });
});

app.post('/api/forms', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Permiso denegado' });
  const body = req.body || {};
  const id = String(body.id || '').trim() || `form-${Date.now()}`;
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const forms = readFormsDefinitions();
  if (forms.find(f => f.id === id)) return res.status(400).json({ error: 'ID ya existe' });
  const nowIso = new Date().toISOString();
  const record = {
    id,
    name,
    public: Boolean(body.public),
    fields: Array.isArray(body.fields) ? body.fields : [],
    createdAt: nowIso,
    updatedAt: nowIso
  };
  forms.unshift(record);
  writeFormsDefinitions(forms);
  res.json({ ok: true, form: record });
});

app.put('/api/forms/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Permiso denegado' });
  const id = String(req.params.id || '').trim();
  const forms = readFormsDefinitions();
  const idx = forms.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Formulario no encontrado' });
  const existing = forms[idx];
  const body = req.body || {};
  const updated = {
    ...existing,
    name: String(body.name ?? existing.name).trim(),
    public: body.public === undefined ? existing.public : Boolean(body.public),
    fields: Array.isArray(body.fields) ? body.fields : existing.fields,
    updatedAt: new Date().toISOString()
  };
  forms[idx] = updated;
  writeFormsDefinitions(forms);
  res.json({ ok: true, form: updated });
});

app.delete('/api/forms/:id', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Permiso denegado' });
  const id = String(req.params.id || '').trim();
  const forms = readFormsDefinitions();
  const protectedIds = new Set(['upgrade', 'churn-risk', 'eval-system', 'eval-implementation']);
  if (protectedIds.has(id)) return res.status(400).json({ error: 'No se puede eliminar este formulario' });
  const filtered = forms.filter(f => f.id !== id);
  writeFormsDefinitions(filtered);
  res.json({ ok: true });
});

// Público: obtener definición y enviar respuesta
app.get('/api/forms/public/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const forms = readFormsDefinitions();
  const form = forms.find(f => f.id === id);
  if (!form || !form.public) return res.status(404).json({ error: 'Formulario no disponible' });
  res.json({ ok: true, form: { id: form.id, name: form.name, fields: form.fields } });
});

function persistDynamicFormSubmission(form, answers) {
  const record = {
    id: `form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    formId: form.id,
    formName: form.name,
    createdAt: new Date().toISOString(),
    source: 'public_form_dynamic',
    answers
  };
  const items = readFormSubmissions();
  items.unshift(record);
  writeFormSubmissions(items);
  return record;
}

app.post('/api/forms/submit/:id', (req, res) => {
  const id = String(req.params.id || '').trim();
  const forms = readFormsDefinitions();
  const form = forms.find(f => f.id === id);
  if (!form || !form.public) return res.status(404).json({ error: 'Formulario no disponible' });
  const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

  const missing = [];
  (form.fields || []).forEach(field => {
    if (!field?.required) return;
    const val = answers[field.id];
    if (val === undefined || val === null || String(val).trim() === '') missing.push(field.id);
  });
  if (missing.length) return res.status(400).json({ error: `Campos requeridos faltantes: ${missing.join(', ')}` });

  const record = persistDynamicFormSubmission(form, answers);
  res.json({ ok: true, submission: record });
});

app.post('/api/forms/:type', (req, res) => {
  const type = String(req.params.type || '').trim();
  if (!['upgrade', 'churn-risk'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de formulario no soportado' });
  }
  const payload = req.body || {};
  const answers = {
    clientName: String(payload.clientName || '').trim(),
    contactName: String(payload.contactName || '').trim(),
    email: String(payload.email || '').trim(),
    details: String(payload.details || '').trim(),
    requestedPlan: String(payload.requestedPlan || '').trim(),
    value: Number(payload.value || 0) || 0,
    reason: String(payload.reason || '').trim(),
    urgency: String(payload.urgency || '').trim()
  };
  const forms = readFormsDefinitions();
  const form = forms.find(f => f.id === type);
  if (!form || !form.public) return res.status(404).json({ error: 'Formulario no disponible' });
  const record = persistDynamicFormSubmission(form, answers);
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

function readKanbans() {
  try {
    let kanbans = fs.existsSync(KANBANS_FILE) ? JSON.parse(fs.readFileSync(KANBANS_FILE, 'utf8')) : [];
    if (!Array.isArray(kanbans)) kanbans = [];

    // Seed: asegurar que exista un tablero base (ClickUp) para que el Kanban nunca quede vacío
    if (kanbans.length === 0) {
      const seeded = [
        {
          id: 'default',
          name: 'Implementación (ClickUp)',
          ownerId: 0,
          sharedWith: [],
          linkedToClickup: true,
          columns: [
            { id: "kickoff", title: "Kickoff", filter: { statusContains: "kickoff" } },
            { id: "capacitacion", title: "Capacitación", filter: { statusContains: "capacitacion" } },
            { id: "golive", title: "Go-Live", filter: { statusContains: "go-live" } },
            { id: "activacion", title: "Activación", filter: { statusContains: "activacion" } }
          ],
          permissions: { view: ["admin", "consultant", "cs", "viewer"], edit: ["admin"] }
        }
      ];
      try {
        fs.writeFileSync(KANBANS_FILE, JSON.stringify(seeded, null, 2));
      } catch (_e) {}
      return seeded;
    }

    return kanbans;
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
      kb.permissions?.view?.includes(role) || kb.ownerId === req.user.id || (Array.isArray(kb.sharedWith) && kb.sharedWith.includes(req.user.id))
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
      sharedWith: [],
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
    const safeSharedWith = Array.isArray(req.body?.sharedWith)
      ? req.body.sharedWith.map(x => Number(x)).filter(Number.isFinite)
      : board.sharedWith;
    const updated = { ...board, ...req.body, sharedWith: safeSharedWith, id: board.id, ownerId: board.ownerId };
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
    if (fs.existsSync(SALES_CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(SALES_CONFIG_FILE, 'utf8'));
    }

    if (!config.deletedClients) config.deletedClients = [];
    
    config.deletedClients.push({
      clientId,
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.username,
      reason,
      documentation
    });

    fs.writeFileSync(SALES_CONFIG_FILE, JSON.stringify(config, null, 2));

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
    if (fs.existsSync(SALES_CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(SALES_CONFIG_FILE, 'utf8'));
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

// ========== ENDPOINT 1: Traer TODO de ClickUp ==========
app.get('/api/clickup/full-data', async (req, res) => {
  try {
    // 0) Prioridad: snapshot procesado (servidor) para no pegarle a ClickUp en cada carga
    const cachedProcessed = cache.get('clickup_clients_processed');
    const cachedDashboard = cache.get('clickup_dashboard_snapshot');
    if (Array.isArray(cachedProcessed) && cachedProcessed.length > 0) {
      const dashboard = cachedDashboard || buildDashboard(cachedProcessed);
      return res.json({
        ok: true,
        data: {
          tareas: cachedProcessed,
          summary: dashboard.kpis,
          porPais: dashboard.porPais,
          porConsultor: dashboard.porConsultor,
          alertas: dashboard.alertas,
          canales: dashboard.canales,
          meta: dashboard.meta
        },
        meta: {
          source: 'server_cache',
          syncedAt: clickupSync.lastSuccessAt || null
        }
      });
    }

    // 1) Fallback: archivo local (última sync exitosa)
    if (fs.existsSync(CLIENTES_FILE)) {
      try {
        const payload = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
        const clientes = Array.isArray(payload?.clientes) ? payload.clientes : [];
        if (clientes.length > 0) {
          const dashboard = buildDashboard(clientes);
          cache.set('clickup_clients_processed', clientes, CLICKUP_SYNC_INTERVAL_MS / 1000);
          cache.set('clickup_dashboard_snapshot', dashboard, CLICKUP_SYNC_INTERVAL_MS / 1000);
          return res.json({
            ok: true,
            data: {
              tareas: clientes,
              summary: dashboard.kpis,
              porPais: dashboard.porPais,
              porConsultor: dashboard.porConsultor,
              alertas: dashboard.alertas,
              canales: dashboard.canales,
              meta: dashboard.meta
            },
            meta: {
              source: 'file',
              syncedAt: payload.updatedAt || null
            }
          });
        }
      } catch (_e) {}
    }

    let tareas = [];
    
    // Intentar obtener de ClickUp con timeout
    try {
      console.log('📡 Intentando obtener datos de ClickUp...');
      const taskPromise = obtenerTareasClickUp();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 30000)
      );
      tareas = await Promise.race([taskPromise, timeoutPromise]);
      console.log(`✅ Datos obtenidos de ClickUp: ${tareas.length} items`);
    } catch (e) {
      console.warn(`⚠️ ClickUp no disponible (${e.message}), usando archivo de fallback...`);
      
      // Fallback: leer clientes.json local
      if (fs.existsSync(CLIENTES_FILE)) {
        const data = JSON.parse(fs.readFileSync(CLIENTES_FILE, 'utf8'));
        tareas = Array.isArray(data.clientes) ? data.clientes : [];
        console.log(`✅ Datos obtenidos del archivo local: ${tareas.length} items`);
      } else {
        throw new Error('No hay datos disponibles (ClickUp no responde y no hay fallback)');
      }
    }
    
    let procesadas = await computeProcessedClientsFromTasks(tareas);

    // Filtrar tareas ignoradas (tests, configs, etc) GLOBALMENTE
    const conteoAntes = procesadas.length;
    procesadas = procesadas.filter(t => !debeIgnorar(t));
    console.log(`✅ Filtrado completado: ${conteoAntes - procesadas.length} tareas ignoradas eliminadas. Quedan ${procesadas.length}.`);

    const dashboard = buildDashboard(procesadas);
    // Cachear snapshot para siguientes cargas
    cache.set('clickup_clients_processed', procesadas, CLICKUP_SYNC_INTERVAL_MS / 1000);
    cache.set('clickup_dashboard_snapshot', dashboard, CLICKUP_SYNC_INTERVAL_MS / 1000);
    res.json({
      ok: true,
      data: {
        tareas: procesadas,
        summary: dashboard.kpis,
        porPais: dashboard.porPais,
        porConsultor: dashboard.porConsultor,
        alertas: dashboard.alertas,
        canales: dashboard.canales,
        meta: dashboard.meta
      }
    });
  } catch (e) {
    console.error('❌ Error en /api/clickup/full-data:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 1b: Diagnóstico ClickUp (Server-side) ==========
app.get('/api/clickup/diagnostic', auth, async (req, res) => {
  try {
    const listId = getClickUpListId();
    const apiKey = getClickUpApiKey();
    
    if (!apiKey || !listId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Credenciales de ClickUp no configuradas en el servidor' 
      });
    }

    console.log('🔍 Ejecutando diagnóstico de ClickUp desde el servidor...');
    
    // 1. Info de la lista (usando fetch nativo)
    const listResp = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: apiKey },
      timeout: 30000
    });
    if (!listResp.ok) throw new Error(`ClickUp list API ${listResp.status}: ${listResp.statusText}`);
    const listData = await listResp.json();
    
    // 2. Tareas (limit 100 para diagnóstico)
    const tasksResp = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?page=0&include_closed=true&archived=false&limit=100`, {
      headers: { Authorization: apiKey },
      timeout: 30000
    });
    if (!tasksResp.ok) throw new Error(`ClickUp tasks API ${tasksResp.status}: ${tasksResp.statusText}`);
    const tasksData = await tasksResp.json();
    const tasks = tasksData.tasks || [];
    
    // Contar por estado
    const countByStatus = {};
    tasks.forEach(t => {
      const s = t.status?.status || 'Sin estado';
      countByStatus[s] = (countByStatus[s] || 0) + 1;
    });

    res.json({
      ok: true,
      diagnostico: {
        lista: listData.name,
        id: listId,
        estadosClickUp: (listData.statuses || []).map(s => s.status),
        conteoPorEstado: countByStatus,
        estadosConfigurados: ESTADOS_IMPL,
        ignorarTareas: CONFIG.TAREAS_IGNORAR,
        ignorarEstados: CONFIG.ESTADOS_IGNORAR,
        totalTareasMuestra: tasks.length
      }
    });
  } catch (e) {
    console.error('❌ Error en diagnóstico ClickUp:', e.message);
    res.status(500).json({ 
      ok: false, 
      error: e.message 
    });
  }
});

// ========== ENDPOINT 2: Traer clientes CON responsables ==========
app.get('/api/clientes', auth, async (req, res) => {
  try {
    const { pais, estado, tipo, responsable } = req.query;
    let tareas = await obtenerTareasClickUp();
    // Filtrar tareas ignoradas
    const filtradasGlobal = tareas.filter(t => !debeIgnorar(t));
    const procesadas = filtradasGlobal.map(t => procesarTarea(t));
    let filtradas = procesadas;
    if (pais) filtradas = filtradas.filter(t => normalizeText(t.pais).includes(normalizeText(pais)));
    if (estado) filtradas = filtradas.filter(t => normalizeText(t.estado).includes(normalizeText(estado)));
    if (tipo) filtradas = filtradas.filter(t => t.tipo === tipo);
    if (responsable) filtradas = filtradas.filter(t => [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct, t.rVenta].some(r => normalizeText(r || '').includes(normalizeText(responsable))));
    const clientes = filtradas.map(t => ({ id: t.id, nombre: t.nombre, estado: t.estado, status: t.status, statusType: t.statusType, pais: t.pais, plan: t.plan, tipo: t.tipo, dias: t.dImpl, url: t.url, responsables: { kickoff: t.rKickoff, verificacion: t.rVer, capacitacion: t.rCap, golive: t.rGoLive, activacion: t.rAct, vendedor: t.rVenta }, canales: t.canales, alerta: t.alerta, diasSinMovimiento: t.dSinMov, fechaCreacion: t.fInicioFmt, fechaActivacion: t.fActivacionFmt, fechaCancelacion: t.fCancelacionFmt, valorVenta: t.valorVenta }));
    res.json({ ok: true, total: clientes.length, filtros: { pais, estado, tipo, responsable }, clientes });
  } catch (e) {
    console.error('Error en /api/clientes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 3: Detalle de cliente ==========
app.get('/api/clientes/:id', auth, async (req, res) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    if (!tarea) return res.status(404).json({ error: 'Cliente no encontrado' });
    const procesada = procesarTarea(tarea);
    res.json({ ok: true, cliente: { id: procesada.id, nombre: procesada.nombre, estado: procesada.estado, status: procesada.status, url: procesada.url, datos: { pais: procesada.pais, plan: procesada.plan, tipo: procesada.tipo, diasImplementacion: procesada.dImpl, diasSinMovimiento: procesada.dSinMov, alerta: procesada.alerta }, responsables: { kickoff: procesada.rKickoff, verificacion: procesada.rVer, capacitacion: procesada.rCap, golive: procesada.rGoLive, activacion: procesada.rAct, vendedor: procesada.rVenta }, canales: procesada.canales, tecnica: { ip: procesada.ip, dominio: procesada.dominio, linkHola: procesada.linkHola, email: procesada.email, telefono: procesada.telefono }, capacitacion: { cantidad: procesada.cantCap, horas: procesada.hCap }, modulos: { cancelados: procesada.modCancelados, adicionados: procesada.modAdicionados }, fechas: { creacion: procesada.fInicioFmt, activacion: procesada.fActivacionFmt, cancelacion: procesada.fCancelacionFmt, ultimaActualizacion: new Date(procesada.fActualizado).toLocaleDateString('es-ES') }, comercial: { plan: procesada.plan, vendedor: procesada.rVenta, valorVenta: procesada.valorVenta, tipoImplementacion: procesada.tipo }, tags: procesada.tags, indicadores: { sinRequisitos: procesada.sinReq, pausada: procesada.pausada, esperandoCliente: procesada.espCli, morosidad: procesada.moro, upgradeEnCurso: procesada.upgImpl } } });
  } catch (e) {
    console.error('Error en /api/clientes/:id:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 4: Analytics ==========
app.get('/api/analytics', auth, async (req, res) => {
  try {
    const { tipo = 'sector' } = req.query;
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    let resultado = {};
    if (tipo === 'sector') {
      const porPais = {};
      procesadas.forEach(t => {
        const p = t.pais || 'No definido';
        if (!porPais[p]) porPais[p] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, dias: 0 };
        porPais[p].total++;
        if (t.statusType === 'activo') porPais[p].activos++;
        if (t.statusType === 'impl') porPais[p].enProceso++;
        if (t.statusType === 'cancelado') porPais[p].cancelados++;
        porPais[p].dias += t.dImpl;
      });
      resultado = Object.entries(porPais).map(([pais, stats]) => ({ sector: pais, total: stats.total, completadas: stats.activos, enCurso: stats.enProceso, canceladas: stats.cancelados, promedioDias: stats.total > 0 ? (stats.dias / stats.total).toFixed(1) : 0, tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0 }));
    } else if (tipo === 'implementacion') {
      const porTipo = {};
      procesadas.forEach(t => {
        const tp = t.tipo || 'Desconocido';
        if (!porTipo[tp]) porTipo[tp] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, dias: 0 };
        porTipo[tp].total++;
        if (t.statusType === 'activo') porTipo[tp].activos++;
        if (t.statusType === 'impl') porTipo[tp].enProceso++;
        if (t.statusType === 'cancelado') porTipo[tp].cancelados++;
        porTipo[tp].dias += t.dImpl;
      });
      resultado = Object.entries(porTipo).map(([tipo, stats]) => ({ tipo, total: stats.total, completadas: stats.activos, enCurso: stats.enProceso, canceladas: stats.cancelados, promedioDias: stats.total > 0 ? (stats.dias / stats.total).toFixed(1) : 0, tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0 }));
    } else if (tipo === 'consultor') {
      const porConsultor = {};
      procesadas.forEach(t => {
        [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct].forEach(consultor => {
          if (!consultor) return;
          if (!porConsultor[consultor]) porConsultor[consultor] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, etapas: 0 };
          porConsultor[consultor].etapas++;
        });
      });
      resultado = Object.entries(porConsultor).map(([consultor, stats]) => ({ consultor, etapasAsignadas: stats.etapas, clientesÚnicos: stats.total, completadas: stats.activos, enCurso: stats.enProceso, canceladas: stats.cancelados }));
    }
    res.json({ ok: true, tipo, datos: resultado });
  } catch (e) {
    console.error('Error en /api/analytics:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 5: Alertas ==========
app.get('/api/alertas', auth, async (req, res) => {
  try {
    const { severidad = '' } = req.query;
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    const alertas = [];
    procesadas.forEach(t => {
      if (t.dSinMov > 7 && t.statusType === 'impl') alertas.push({ id: t.id, tipo: 'SIN_MOVIMIENTO', severidad: 'MEDIA', cliente: t.nombre, mensaje: `Sin movimiento por ${t.dSinMov} días`, accion: 'Contactar responsable', url: t.url, responsable: t.rKickoff || t.rVer || 'N/A' });
      if (t.dImpl > 20 && t.statusType === 'impl') alertas.push({ id: t.id, tipo: 'EXCEDIDA_META', severidad: 'ALTA', cliente: t.nombre, mensaje: `Implementación lleva ${t.dImpl} días (meta: 20)`, accion: 'Acelerar implementación', url: t.url, responsable: t.rKickoff || 'N/A' });
      if (!t.rCap && t.estado.includes('capacitacion')) alertas.push({ id: t.id, tipo: 'SIN_RESPONSABLE', severidad: 'ALTA', cliente: t.nombre, mensaje: 'Sin capacitador asignado', accion: 'Asignar capacitador inmediatamente', url: t.url, responsable: 'Sin asignar' });
      if (t.espCli === 'SÍ') alertas.push({ id: t.id, tipo: 'ESPERANDO_CLIENTE', severidad: 'BAJA', cliente: t.nombre, mensaje: 'Cliente esperando respuesta', accion: 'Dar seguimiento', url: t.url, responsable: t.rVenta || 'N/A' });
      if (t.moro === 'SÍ') alertas.push({ id: t.id, tipo: 'MOROSIDAD', severidad: 'CRÍTICA', cliente: t.nombre, mensaje: 'Cliente con problemas de pago', accion: 'Contactar área administrativa', url: t.url, responsable: t.rVenta || 'N/A' });
    });
    let resultado = severidad ? alertas.filter(a => a.severidad === severidad) : alertas;
    const orden = { 'CRÍTICA': 1, 'ALTA': 2, 'MEDIA': 3, 'BAJA': 4 };
    resultado.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    res.json({ ok: true, total: resultado.length, criticas: resultado.filter(a => a.severidad === 'CRÍTICA').length, altas: resultado.filter(a => a.severidad === 'ALTA').length, medias: resultado.filter(a => a.severidad === 'MEDIA').length, bajas: resultado.filter(a => a.severidad === 'BAJA').length, alertas: resultado });
  } catch (e) {
    console.error('Error en /api/alertas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 6 & 7: Complementos & Auditoria ==========
const COMPLEMENTOS_FILE_VY = path.join(DATA_DIR, 'complementos.json');
function leerComplementosVy() {
  try { if (!fs.existsSync(COMPLEMENTOS_FILE_VY)) return {}; return JSON.parse(fs.readFileSync(COMPLEMENTOS_FILE_VY, 'utf8')); } catch (e) { return {}; }
}
function guardarComplementosVy(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(COMPLEMENTOS_FILE_VY, JSON.stringify(data, null, 2));
}
app.get('/api/complementos/:clienteId', auth, async (req, res) => {
  try {
    const complementos = leerComplementosVy();
    const dato = complementos[req.params.clienteId] || {};
    res.json({ ok: true, complemento: { ...dato, desdeSheets: null } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/complementos/:clienteId', auth, (req, res) => {
  try {
    const complementos = leerComplementosVy();
    const { notas, contactoAdicional, informacionExtra, estadoLocal, prioridadLocal, tags } = req.body;
    complementos[req.params.clienteId] = { clienteId: req.params.clienteId, notas: notas || '', contactoAdicional: contactoAdicional || '', informacionExtra: informacionExtra || {}, estadoLocal: estadoLocal || '', prioridadLocal: prioridadLocal || '', tags: Array.isArray(tags) ? tags : [], actualizadoEn: new Date().toISOString(), actualizadoPor: req.user.username };
    guardarComplementosVy(complementos);
    writeLog(req.user, 'COMPLEMENTO_ACTUALIZADO', { clienteId: req.params.clienteId, usuario: req.user.username });
    res.json({ ok: true, complemento: complementos[req.params.clienteId] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/auditoria', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') return res.status(403).json({ error: 'Acceso denegado' });
    let logs = [];
    try { if (fs.existsSync(LOGS_FILE)) logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')); } catch (e) { logs = []; }
    const { desde, hasta, usuario, tipo } = req.query;
    let filtrados = logs;
    if (desde) filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() >= new Date(desde).getTime());
    if (hasta) filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() <= new Date(hasta).getTime());
    if (usuario) filtrados = filtrados.filter(l => l.user === usuario);
    if (tipo) filtrados = filtrados.filter(l => l.action === tipo);
    res.json({ ok: true, total: filtrados.length, logs: filtrados.slice(0, 500) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// ERROR HANDLER MIDDLEWARE - 🆕 GLOBAL
// ================================================================
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Logging
  console.error(`[ERROR] ${requestId}`, {
    method: req.method,
    path: req.path,
    status: err.status || 500,
    message: err.message,
    stack: err.stack
  });
  
  // Escribir en audit log
  writeLog(req.user, 'ERROR', {
    requestId,
    path: req.path,
    method: req.method,
    message: err.message,
    code: err.code
  });
  
  // Responder con error estructurado
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  
  return res.status(statusCode).json({
    error: err.message || 'Error interno del servidor',
    code: errorCode,
    requestId: requestId,
    timestamp: timestamp,
    details: process.env.NODE_ENV === 'development' ? { stack: err.stack } : undefined
  });
});

// ================================================================
// FASE 2: ENDPOINTS MEJORADOS - CRUD DE CLIENTES
// ================================================================

/**
 * GET /api/clientes
 * Obtener lista de clientes con filtros y paginación
 */
app.get('/api/clientes', auth, async (req, res, next) => {
  try {
    const { pais, estado, tipo, responsable, search, limit = '50', offset = '0' } = req.query;
    
    const parsedLimit = Math.min(parseInt(limit) || 50, 500);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    if (parsedLimit < 1) throw { status: 400, message: 'limit debe ser >= 1' };
    if (parsedOffset < 0) throw { status: 400, message: 'offset debe ser >= 0' };
    
    let tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    let filtradas = procesadas;
    
    if (pais?.trim()) {
      const paisNorm = pais.trim().toLowerCase();
      filtradas = filtradas.filter(t => (t.pais || '').toLowerCase().includes(paisNorm));
    }
    
    if (estado?.trim()) {
      const estadoNorm = estado.trim().toLowerCase();
      filtradas = filtradas.filter(t => (t.estado || '').toLowerCase().includes(estadoNorm));
    }
    
    if (tipo && ['Implementación', 'Upgrade'].includes(tipo)) {
      filtradas = filtradas.filter(t => t.tipo === tipo);
    }
    
    if (responsable?.trim()) {
      const respNorm = responsable.trim().toLowerCase();
      filtradas = filtradas.filter(t => 
        [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct, t.rVenta]
          .some(r => r && r.toLowerCase().includes(respNorm))
      );
    }
    
    if (search?.trim()) {
      const searchNorm = search.trim().toLowerCase();
      filtradas = filtradas.filter(t => (t.nombre || '').toLowerCase().includes(searchNorm));
    }
    
    const total = filtradas.length;
    const pages = Math.ceil(total / parsedLimit);
    const page = Math.floor(parsedOffset / parsedLimit) + 1;
    const clientes = filtradas.slice(parsedOffset, parsedOffset + parsedLimit).map(t => ({
      id: t.id,
      nombre: t.nombre,
      estado: t.estado,
      status: t.status,
      pais: t.pais,
      plan: t.plan,
      tipo: t.tipo,
      dias: t.dImpl,
      url: t.url,
      responsables: { kickoff: t.rKickoff, verificacion: t.rVer, capacitacion: t.rCap, golive: t.rGoLive, activacion: t.rAct, vendedor: t.rVenta },
      canales: t.canales,
      alerta: t.alerta,
      diasSinMovimiento: t.dSinMov,
      valorVenta: t.valorVenta
    }));
    
    res.json({
      ok: true,
      data: clientes,
      pagination: { total, pages, page, limit: parsedLimit, offset: parsedOffset },
      filters: { pais, estado, tipo, responsable, search }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/clientes/:id
 * Obtener detalle completo de un cliente
 */
app.get('/api/clientes/:id', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    
    if (!tarea) return res.status(404).json({ error: 'Cliente no encontrado' });
    
    const procesada = procesarTarea(tarea);
    
    res.json({
      ok: true,
      data: {
        id: procesada.id,
        nombre: procesada.nombre,
        estado: procesada.estado,
        status: procesada.status,
        url: procesada.url,
        datos: {
          pais: procesada.pais,
          plan: procesada.plan,
          tipo: procesada.tipo,
          diasImplementacion: procesada.dImpl,
          diasSinMovimiento: procesada.dSinMov,
          alerta: procesada.alerta
        },
        responsables: {
          kickoff: procesada.rKickoff,
          verificacion: procesada.rVer,
          capacitacion: procesada.rCap,
          golive: procesada.rGoLive,
          activacion: procesada.rAct,
          vendedor: procesada.rVenta
        },
        canales: procesada.canales,
        tecnica: {
          ip: procesada.ip,
          dominio: procesada.dominio,
          linkHola: procesada.linkHola,
          email: procesada.email,
          telefono: procesada.telefono
        },
        capacitacion: { cantidad: procesada.cantCap, horas: procesada.hCap },
        modulos: { cancelados: procesada.modCancelados, adicionados: procesada.modAdicionados },
        fechas: {
          creacion: procesada.fInicioFmt,
          activacion: procesada.fActivacionFmt,
          cancelacion: procesada.fCancelacionFmt
        },
        comercial: {
          plan: procesada.plan,
          vendedor: procesada.rVenta,
          valorVenta: procesada.valorVenta,
          tipoImplementacion: procesada.tipo
        },
        tags: procesada.tags
      }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/clientes/:id/comentario
 * Agregar comentario a un cliente
 */
app.post('/api/clientes/:id/comentario', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    if (!tarea) return res.status(404).json({ error: 'Cliente no encontrado' });
    
    const { texto, tipo = 'general' } = req.body;
    if (!texto || !texto.trim()) {
      return res.status(400).json({ error: 'Texto requerido' });
    }
    
    const comentariosFile = path.join(DATA_DIR, 'comentarios.json');
    let comentarios = {};
    
    if (fs.existsSync(comentariosFile)) {
      try {
        comentarios = JSON.parse(fs.readFileSync(comentariosFile, 'utf8'));
      } catch (e) {}
    }
    
    if (!comentarios[req.params.id]) comentarios[req.params.id] = [];
    
    const comentario = {
      id: Date.now(),
      texto: texto.trim(),
      tipo,
      autor: req.user.username,
      autorId: req.user.id,
      createdAt: new Date().toISOString()
    };
    
    comentarios[req.params.id].push(comentario);
    
    const dataDir = path.join(STATIC_ROOT, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(comentariosFile, JSON.stringify(comentarios, null, 2));
    
    writeLog(req.user, 'COMENTARIO_AGREGADO', {
      clienteId: req.params.id,
      comentarioId: comentario.id,
      tipo
    });
    
    res.json({ ok: true, comentario });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/clientes/:id/comentarios
 * Obtener comentarios de un cliente
 */
app.get('/api/clientes/:id/comentarios', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    if (!tareas.find(t => t.id === req.params.id)) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    const comentariosFile = path.join(STATIC_ROOT, 'data', 'comentarios.json');
    let comentarios = [];
    
    if (fs.existsSync(comentariosFile)) {
      try {
        const allComments = JSON.parse(fs.readFileSync(comentariosFile, 'utf8'));
        comentarios = allComments[req.params.id] || [];
      } catch (e) {}
    }
    
    res.json({
      ok: true,
      data: comentarios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// FASE 2: ALERTAS
// ================================================================

/**
 * GET /api/alertas
 * Obtener alertas del sistema con filtros
 */
app.get('/api/alertas', auth, async (req, res, next) => {
  try {
    const { severidad, tipo, limit = '100', offset = '0' } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const alertas = [];
    
    procesadas.forEach(t => {
      if (t.dSinMov > 7 && t.statusType === 'impl') {
        alertas.push({
          id: `${t.id}_sin_mov`,
          clienteId: t.id,
          tipo: 'SIN_MOVIMIENTO',
          severidad: 'MEDIA',
          cliente: t.nombre,
          mensaje: `Sin movimiento por ${t.dSinMov} días`,
          accion: 'Contactar responsable',
          url: t.url
        });
      }
      
      if (t.dImpl > 20 && t.statusType === 'impl') {
        alertas.push({
          id: `${t.id}_excedida_meta`,
          clienteId: t.id,
          tipo: 'EXCEDIDA_META',
          severidad: 'ALTA',
          cliente: t.nombre,
          mensaje: `Implementación lleva ${t.dImpl} días (meta: 20)`,
          accion: 'Acelerar implementación',
          url: t.url
        });
      }
      
      if (t.moro === 'SÍ') {
        alertas.push({
          id: `${t.id}_moro`,
          clienteId: t.id,
          tipo: 'MOROSIDAD',
          severidad: 'CRITICA',
          cliente: t.nombre,
          mensaje: 'Cliente con problemas de pago',
          accion: 'Contactar área administrativa',
          url: t.url
        });
      }
    });
    
    let resultado = alertas;
    if (severidad && ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].includes(severidad)) {
      resultado = resultado.filter(a => a.severidad === severidad);
    }
    if (tipo) {
      resultado = resultado.filter(a => a.tipo === tipo);
    }
    
    const orden = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAJA: 4 };
    resultado.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    
    const total = resultado.length;
    const pages = Math.ceil(total / parsedLimit);
    const data = resultado.slice(parsedOffset, parsedOffset + parsedLimit);
    
    res.json({
      ok: true,
      data,
      pagination: { total, pages, limit: parsedLimit, offset: parsedOffset },
      resumen: {
        criticas: alertas.filter(a => a.severidad === 'CRITICA').length,
        altas: alertas.filter(a => a.severidad === 'ALTA').length
      }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// FASE 2: REPORTES
// ================================================================

/**
 * GET /api/reportes/por-pais
 */
app.get('/api/reportes/por-pais', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porPais = {};
    procesadas.forEach(t => {
      const p = t.pais || 'No definido';
      if (!porPais[p]) {
        porPais[p] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, diasTotal: 0 };
      }
      porPais[p].total++;
      porPais[p].diasTotal += t.dImpl;
      if (t.status === 'Activo') porPais[p].activos++;
      if (t.status === 'En Implementación') porPais[p].enProceso++;
      if (t.status === 'Cancelado') porPais[p].cancelados++;
    });
    
    const resultado = Object.entries(porPais).map(([pais, stats]) => ({
      pais,
      ...stats,
      diasPromedio: stats.total > 0 ? (stats.diasTotal / stats.total).toFixed(1) : 0,
      tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
    }));
    
    res.json({ ok: true, data: resultado });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/reportes/por-tipo
 */
app.get('/api/reportes/por-tipo', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porTipo = {};
    procesadas.forEach(t => {
      const tipo = t.tipo || 'Desconocido';
      if (!porTipo[tipo]) {
        porTipo[tipo] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, diasTotal: 0 };
      }
      porTipo[tipo].total++;
      porTipo[tipo].diasTotal += t.dImpl;
      if (t.status === 'Activo') porTipo[tipo].activos++;
      if (t.status === 'En Implementación') porTipo[tipo].enProceso++;
      if (t.status === 'Cancelado') porTipo[tipo].cancelados++;
    });
    
    const resultado = Object.entries(porTipo).map(([tipo, stats]) => ({
      tipo,
      ...stats,
      diasPromedio: stats.total > 0 ? (stats.diasTotal / stats.total).toFixed(1) : 0,
      tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
    }));
    
    res.json({ ok: true, data: resultado });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/reportes/por-consultor
 */
app.get('/api/reportes/por-consultor', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porConsultor = {};
    procesadas.forEach(t => {
      [
        { name: t.rKickoff, role: 'Kickoff' },
        { name: t.rVer, role: 'Verificación' },
        { name: t.rCap, role: 'Capacitación' },
        { name: t.rGoLive, role: 'Go-Live' },
        { name: t.rAct, role: 'Activación' },
        { name: t.rVenta, role: 'Vendedor' }
      ].forEach(({ name, role }) => {
        if (!name || !name.trim()) return;
        
        if (!porConsultor[name]) {
          porConsultor[name] = {
            nombre: name,
            roles: new Set(),
            clientesUnicos: new Set(),
            activos: 0,
            enProceso: 0,
            etapas: 0
          };
        }
        
        porConsultor[name].roles.add(role);
        porConsultor[name].clientesUnicos.add(t.id);
        porConsultor[name].etapas++;
        
        if (t.status === 'Activo') porConsultor[name].activos++;
        if (t.status === 'En Implementación') porConsultor[name].enProceso++;
      });
    });
    
    const resultado = Object.values(porConsultor)
      .map(stats => ({
        consultor: stats.nombre,
        roles: Array.from(stats.roles),
        clientesUnicos: stats.clientesUnicos.size,
        activos: stats.activos,
        enProceso: stats.enProceso,
        etapasAsignadas: stats.etapas
      }))
      .sort((a, b) => b.clientesUnicos - a.clientesUnicos);
    
    res.json({ ok: true, data: resultado });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// FASE 2: SINCRONIZACIÓN
// ================================================================

/**
 * POST /api/sync/clickup
 * - Dispara una sincronización server-side (mutex) y opcionalmente espera el resultado.
 * - No obliga al frontend a pegarle directo a ClickUp (más liviano al entrar al sistema).
 */
app.post('/api/sync/clickup', auth, async (req, res) => {
  const wait = String(req.query.wait || '').trim() === '1' || Boolean(req.body?.wait);
  const force = (req.user?.role === 'admin') && (String(req.query.force || '').trim() === '1' || Boolean(req.body?.force));
  const reason = `api:${req.user?.username || 'user'}`;

  try {
    const promise = runClickUpSync({ reason, force });

    if (!wait) {
      return res.json({
        ok: true,
        message: 'Sincronización encolada',
        state: {
          running: clickupSync.running,
          lastSuccessAt: clickupSync.lastSuccessAt,
          lastError: clickupSync.lastError,
          lastReason: clickupSync.lastReason,
          lastStats: clickupSync.lastStats
        }
      });
    }

    const timeoutMs = 25000;
    const result = await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout esperando sincronización')), timeoutMs))
    ]).catch(e => ({ ok: false, error: e.message, timeout: true }));

    return res.json({
      ok: true,
      result,
      state: {
        running: clickupSync.running,
        lastSuccessAt: clickupSync.lastSuccessAt,
        lastError: clickupSync.lastError,
        lastReason: clickupSync.lastReason,
        lastStats: clickupSync.lastStats
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/sync/start
 */
app.post('/api/sync/start', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permiso denegado' });
    }
    
    setImmediate(async () => {
      try {
        const result = await runClickUpSync({ reason: `api:sync-start:${req.user.username}`, force: true });
        if (result?.ok) {
          writeLog(req.user, 'SYNC_COMPLETED', { ...result.meta });
        } else {
          writeLog(req.user, 'SYNC_FAILED', { error: result?.error || 'unknown' });
        }
      } catch (e) {
        console.error('Sync error:', e);
      }
    });
    
    res.json({ ok: true, message: 'Sincronización iniciada' });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sync/status
 */
app.get('/api/sync/status', auth, (req, res, next) => {
  try {
    const syncFile = path.join(STATIC_ROOT, 'data', 'sync_complete.json');
    let lastSync = null;
    
    if (fs.existsSync(syncFile)) {
      try {
        lastSync = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
      } catch (e) {}
    }
    
    res.json({
      ok: true,
      data: {
        lastSync,
        status: lastSync ? 'OK' : 'NEVER_SYNCED',
        clickup: {
          running: clickupSync.running,
          lastStartedAt: clickupSync.lastStartedAt,
          lastFinishedAt: clickupSync.lastFinishedAt,
          lastSuccessAt: clickupSync.lastSuccessAt,
          lastError: clickupSync.lastError,
          lastReason: clickupSync.lastReason,
          lastStats: clickupSync.lastStats
        }
      }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// FASE 2: AUDITORÍA
// ================================================================

/**
 * GET /api/auditoria
 */
app.get('/api/auditoria', auth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Permiso denegado' });
    }
    
    const { desde, hasta, usuario, tipo, limit = '100', offset = '0' } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    let logs = [];
    const logsFile = path.join(STATIC_ROOT, 'audit_logs.json');
    
    if (fs.existsSync(logsFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
      } catch (e) {}
    }
    
    let filtrados = logs;
    
    if (desde) {
      const desdeMs = new Date(desde).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() >= desdeMs);
    }
    
    if (hasta) {
      const hastaMs = new Date(hasta).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() <= hastaMs);
    }
    
    if (usuario?.trim()) {
      filtrados = filtrados.filter(l => (l.user || '').toLowerCase().includes(usuario.trim().toLowerCase()));
    }
    
    if (tipo?.trim()) {
      filtrados = filtrados.filter(l => l.action === tipo.trim());
    }
    
    filtrados.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const total = filtrados.length;
    const pages = Math.ceil(total / parsedLimit);
    const data = filtrados.slice(parsedOffset, parsedOffset + parsedLimit);
    
    res.json({
      ok: true,
      data,
      pagination: { total, pages, limit: parsedLimit, offset: parsedOffset }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// CATCH-ALL → SPA
// ================================================================
app.get('*', (_req, res) => {
  // Prevent browser caching of the main HTML entry.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(MAIN_HTML);
});

// ================================================================
// INICIO
// ================================================================
ensureDataDir();
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor corriendo en http://${HOST}:${PORT}`);
  console.log(`🔑 JWT_SECRET: ${CONFIG.JWT_SECRET ? 'Cargado CORRECTAMENTE' : 'ERROR: NO CARGADO'}`);
  
  // Obtener List ID activo (prefiere global_config sobre env)
  let activeListId = 'no configurada';
  try {
    activeListId = getClickUpListId();
  } catch (_e) {}
  
  console.log(`🔑 ClickUp List Activa: ${activeListId}`);
  console.log(`💾 Cache TTL: ${process.env.CACHE_TTL || 3600}s`);

  // 🚀 Iniciar sincronización programada (cada 30 min) sin bloquear el login de los usuarios
  iniciarBackgroundSync();
});
server.on('error', (err) => {
  console.error('❌ Error iniciando servidor:', err?.message || err);
  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    console.error(`ℹ️  Tip: prueba con HOST=127.0.0.1 PORT=${PORT} (o cambia el puerto).`);
  }
  process.exitCode = 1;
});

async function iniciarBackgroundSync() {
  console.log(`🔄 Background Sync: Inicializado (intervalo: ${Math.round(CLICKUP_SYNC_INTERVAL_MS / 60000)} min)`);

  // Primera ejecución (con delay) para no impactar el arranque
  setTimeout(() => {
    runClickUpSync({ reason: 'startup', force: false }).catch(() => {});
  }, 15000);

  setInterval(() => {
    runClickUpSync({ reason: 'scheduler', force: false }).catch(() => {});
  }, CLICKUP_SYNC_INTERVAL_MS);
}
