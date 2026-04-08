'use strict';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normNom(n) {
  return String(n || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRawValueByAliases(raw, aliases) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const normalizedAliases = (aliases || []).map(normalizeText);
  const keys = Object.keys(row);
  for (const alias of normalizedAliases) {
    const direct = keys.find(k => normalizeText(k) === alias);
    if (direct) return row[direct];
  }
  for (const alias of normalizedAliases) {
    const contains = keys.find(k => normalizeText(k).includes(alias));
    if (contains) return row[contains];
  }
  return undefined;
}

function parseMoneyValue(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let valueStr = String(value).trim();
  if (!valueStr) return 0;

  // Quitar símbolos y texto
  valueStr = valueStr
    .replace(/[^\d.,-]/g, '')
    .replace(/\s+/g, '');

  if (!valueStr) return 0;

  // Manejar formatos 1.234,56 y 1,234.56
  const hasComma = valueStr.includes(',');
  const hasDot = valueStr.includes('.');
  if (hasComma && hasDot) {
    // Tomar el último separador como decimal
    const lastComma = valueStr.lastIndexOf(',');
    const lastDot = valueStr.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    valueStr = valueStr.split(thousandSep).join('');
    valueStr = decimalSep === ',' ? valueStr.replace(',', '.') : valueStr;
  } else if (hasComma && !hasDot) {
    // Puede ser decimal con coma o miles con coma (asumir decimal si hay 2 dígitos al final)
    const parts = valueStr.split(',');
    if (parts.length === 2 && parts[1].length <= 2) valueStr = parts[0] + '.' + parts[1];
    else valueStr = parts.join('');
  } else if (hasDot && !hasComma) {
    const parts = valueStr.split('.');
    if (!(parts.length === 2 && parts[1].length <= 2)) valueStr = parts.join('');
  }

  const parsed = parseFloat(valueStr);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLead(raw) {
  const estadoMap = { open: 'open', abierto: 'open', lead: 'open', mql: 'mql', sql: 'sql', won: 'won', ganado: 'won', lost: 'lost', perdido: 'lost' };
  const estadoRaw =
    getRawValueByAliases(raw, ['estado', 'status', 'stage', 'etapa', 'fase', 'pipeline status', 'status da venda', 'estado da venda']) ||
    raw?.estado || raw?.status || raw?.stage;
  const estado = estadoMap[normalizeText(estadoRaw)] || 'open';

  const extras = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!normalizedKey) return;
    extras[normalizedKey] = value;
  });

  const id = getRawValueByAliases(raw, ['id', 'lead id', 'deal id', 'negocio id', 'oportunidad id']) || raw?.id;
  const nombre =
    getRawValueByAliases(raw, ['nombre', 'name', 'lead', 'cliente', 'cliente nombre', 'contato', 'contacto']) ||
    raw?.nombre || raw?.name || raw?.lead;
  const empresa =
    getRawValueByAliases(raw, ['empresa', 'company', 'account', 'cliente empresa', 'organization', 'organizacion']) ||
    raw?.empresa || raw?.company;
  const fuente =
    getRawValueByAliases(raw, ['fuente', 'source', 'origen', 'channel', 'canal', 'source channel', 'origem']) ||
    raw?.fuente || raw?.source || raw?.channel;
  const valor =
    getRawValueByAliases(raw, ['valor', 'value', 'monto', 'amount', 'importe', 'deal value', 'valor da venda']) ||
    raw?.valor || raw?.value;
  const owner =
    getRawValueByAliases(raw, ['owner', 'responsable', 'consultor', 'asesor', 'seller', 'vendedor', 'comercial']) ||
    raw?.owner || raw?.responsable;
  const updatedAt =
    getRawValueByAliases(raw, ['updatedAt', 'fecha', 'date', 'fecha actualizacion', 'último movimiento', 'ultimo movimiento', 'updated at', 'data atualização']) ||
    raw?.updatedAt || raw?.fecha || raw?.date;
  const campaign =
    getRawValueByAliases(raw, ['campaign', 'marketing', 'campana', 'campaña', 'campaign name', 'utm campaign']) ||
    raw?.campaign || raw?.marketing || raw?.campana;
  const segmento = getRawValueByAliases(raw, ['segmento', 'segment', 'vertical', 'segmentação']) || raw?.segmento || raw?.segment || raw?.vertical;
  const producto = getRawValueByAliases(raw, ['producto', 'product', 'servicio', 'solution', 'produto']) || raw?.producto || raw?.product || raw?.servicio;

  // Referencias potenciales a ClickUp ID (si vienen)
  const clickupTaskId =
    getRawValueByAliases(raw, ['clickup id', 'clickup_id', 'id clickup', 'task id', 'clickup task id', 'cu id']) ||
    extras.clickup_id ||
    extras.clickupId ||
    extras.task_id ||
    '';

  return {
    id: String(id || `${Date.now()}_${Math.random()}`),
    nombre: nombre || 'Sin nombre',
    nombreNorm: normNom(nombre || ''),
    empresa: empresa || '',
    fuente: fuente || 'Sin fuente',
    estado,
    valor: parseMoneyValue(valor),
    owner: owner ? String(owner) : '',
    updatedAt: updatedAt ? String(updatedAt) : '',
    campaign: campaign ? String(campaign) : '',
    segmento: segmento ? String(segmento) : '',
    producto: producto ? String(producto) : '',
    clickupTaskId: String(clickupTaskId || '').trim(),
    extras
  };
}

async function importSalesFromSheet(sheetId, sheetName, config = {}) {
  const fetchGoogleSheet = config.fetchGoogleSheet;
  if (typeof fetchGoogleSheet !== 'function') {
    throw new Error('fetchGoogleSheet(sheetId, sheetName) no está configurado');
  }
  if (!sheetId || !sheetName) {
    throw new Error('sheetId y sheetName son requeridos');
  }

  const rows = await fetchGoogleSheet(sheetId, sheetName);
  const arr = Array.isArray(rows) ? rows : [];
  const leads = arr.map(normalizeLead);
  return { sheetId, sheetName, leads };
}

function syncSalesWithClients({ clients, leads }) {
  const list = Array.isArray(clients) ? clients : [];
  const lds = Array.isArray(leads) ? leads : [];

  const leadByClickupId = new Map();
  const leadByNameNorm = new Map();
  lds.forEach(lead => {
    const clickupId = String(lead?.clickupTaskId || '').trim();
    if (clickupId) leadByClickupId.set(clickupId, lead);
    const nn = String(lead?.nombreNorm || '').trim();
    if (nn && !leadByNameNorm.has(nn)) leadByNameNorm.set(nn, lead);
  });

  const changes = [];
  list.forEach(client => {
    const clientId = String(client?.id || '').trim();
    const clientName = client?.nombre || client?.name || '';
    const clientNameNorm = normNom(clientName);

    let lead = null;
    if (clientId && leadByClickupId.has(clientId)) lead = leadByClickupId.get(clientId);
    if (!lead && clientNameNorm && leadByNameNorm.has(clientNameNorm)) lead = leadByNameNorm.get(clientNameNorm);
    if (!lead) return;

    const oldValor = client.valorVenta ?? null;
    const oldVendedor = client.rVenta ?? client.vendedor ?? '';

    const newValor = lead.valor || 0;
    const newVendedor = lead.owner || '';

    // No inventar: solo set si viene de sheet (valor/owner)
    let touched = false;
    if (newValor !== null && newValor !== undefined) {
      if (Number(oldValor || 0) !== Number(newValor || 0)) {
        client.valorVenta = newValor;
        touched = true;
      }
    }
    if (newVendedor) {
      if (String(oldVendedor || '') !== String(newVendedor)) {
        client.rVenta = newVendedor;
        client.vendedor = newVendedor;
        touched = true;
      }
    }

    if (touched) {
      client.salesSync = { leadId: lead.id, sheet: true, at: new Date().toISOString() };
      changes.push({
        clientId: clientId,
        clientName,
        oldValor: Number(oldValor || 0),
        newValor: Number(client.valorVenta || 0),
        oldVendedor: String(oldVendedor || ''),
        newVendedor: String(client.rVenta || '')
      });
    } else {
      client.salesSync = client.salesSync || { leadId: lead.id, sheet: true };
    }
  });

  return { updated: changes.length, changes };
}

module.exports = {
  importSalesFromSheet,
  normalizeLead,
  getRawValueByAliases,
  parseMoneyValue,
  syncSalesWithClients,
  normNom
};

