#!/usr/bin/env node
'use strict';

/**
 * Verifica conectividad con:
 * - ClickUp (team + list)
 * - Hola Suite API (endpoint simple)
 * - Google Sheets (solo si hay sheetId/sheetName)
 *
 * Uso:
 *   node scripts/setup-local-config.js
 *   node scripts/verify-connections.js
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function ok(msg) { console.log(`${C.green}✅${C.reset} ${msg}`); }
function warn(msg) { console.log(`${C.yellow}⚠️${C.reset}  ${msg}`); }
function err(msg) { console.log(`${C.red}❌${C.reset} ${msg}`); }
function info(msg) { console.log(`${C.cyan}ℹ️${C.reset}  ${msg}`); }
function header(title) {
  console.log(`\n${C.bold}${title}${C.reset}`);
  console.log('─'.repeat(Math.min(80, Math.max(24, title.length))));
}

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function loadConfig() {
  const repoRoot = path.join(__dirname, '..');
  const candidates = [
    path.join(repoRoot, 'data', 'global_config.local.json'),
    path.join(repoRoot, 'data', 'global_config.json'),
    path.join(repoRoot, 'global_config.json')
  ];
  const merged = {};
  for (const p of candidates) {
    const json = readJsonIfExists(p);
    if (json && typeof json === 'object') Object.assign(merged, json);
  }

  // Env overrides
  if ((process.env.CLICKUP_API_KEY || '').trim()) merged.clickupApiKey = process.env.CLICKUP_API_KEY.trim();
  if ((process.env.CLICKUP_LIST_ID || '').trim()) merged.clickupListId = process.env.CLICKUP_LIST_ID.trim();
  if ((process.env.HOLA_API_URL || '').trim()) merged.holaUrl = process.env.HOLA_API_URL.trim();
  if ((process.env.HOLA_API_TOKEN || '').trim()) merged.holaToken = process.env.HOLA_API_TOKEN.trim();
  if ((process.env.GOOGLE_SHEETS_API_KEY || '').trim()) merged.googleSheetsApiKey = process.env.GOOGLE_SHEETS_API_KEY.trim();
  if ((process.env.SALES_SHEET_ID || '').trim()) merged.salesSheetId = process.env.SALES_SHEET_ID.trim();
  if ((process.env.SALES_SHEET_NAME || '').trim()) merged.salesSheetName = process.env.SALES_SHEET_NAME.trim();

  return merged;
}

function normalizeHolaBase(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

async function checkClickUp(cfg) {
  header('ClickUp');
  const apiKey = String(cfg.clickupApiKey || '').trim();
  const listId = String(cfg.clickupListId || '').trim();
  info(`API Key: ${apiKey ? '***' + apiKey.slice(-6) : '(no configurada)'}`);
  info(`List ID: ${listId || '(no configurado)'}`);
  if (!apiKey || !listId) {
    err('Faltan credenciales de ClickUp. Configura `CLICKUP_API_KEY` y `CLICKUP_LIST_ID`.');
    return false;
  }

  try {
    const teamResp = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: apiKey },
      timeout: 15000
    });
    if (!teamResp.ok) {
      const text = await teamResp.text().catch(() => '');
      err(`Teams HTTP ${teamResp.status}: ${text.slice(0, 160) || teamResp.statusText}`);
      return false;
    }
    const team = await teamResp.json();
    ok(`Teams OK (${team.teams?.length || 0} workspaces)`);
  } catch (e) {
    err(`Teams error: ${e.message}`);
    return false;
  }

  try {
    const listResp = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}`, {
      headers: { Authorization: apiKey },
      timeout: 15000
    });
    if (!listResp.ok) {
      const text = await listResp.text().catch(() => '');
      err(`List HTTP ${listResp.status}: ${text.slice(0, 160) || listResp.statusText}`);
      return false;
    }
    const list = await listResp.json();
    ok(`List OK (${list?.name || 'sin nombre'})`);
  } catch (e) {
    err(`List error: ${e.message}`);
    return false;
  }

  return true;
}

async function checkHola(cfg) {
  header('Hola Suite API (Wispro)');
  const base = normalizeHolaBase(cfg.holaUrl);
  const token = String(cfg.holaToken || '').trim();
  info(`Base URL: ${base || '(no configurada)'}`);
  info(`Token: ${token ? '***' + token.slice(-6) : '(no configurado)'}`);
  if (!base || !token) {
    warn('Sin `holaUrl`/`holaToken`. Saltando test de Hola Suite.');
    return true; // optional
  }

  // Probar endpoints livianos: /departamento y /atendimento (si está disponible)
  const endpoints = [
    '/departamento',
    '/atendimento'
  ];

  for (const ep of endpoints) {
    try {
      const resp = await fetch(`${base}${ep}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        warn(`${ep} HTTP ${resp.status}: ${text.slice(0, 160) || resp.statusText}`);
        continue;
      }
      ok(`${ep} OK`);
      return true;
    } catch (e) {
      warn(`${ep} error: ${e.message}`);
    }
  }

  warn('No se pudo validar un endpoint de Hola Suite (puede ser permiso/URL/token).');
  return false;
}

async function checkSheets(cfg) {
  header('Google Sheets (opcional)');
  const apiKey = String(cfg.googleSheetsApiKey || '').trim();
  const sheetId = String(cfg.salesSheetId || '').trim();
  const sheetName = String(cfg.salesSheetName || '').trim();
  info(`API Key: ${apiKey ? '***' + apiKey.slice(-6) : '(no configurada)'}`);
  info(`Sheet: ${sheetId ? sheetId.slice(0, 6) + '…' : '(no)'} / ${sheetName || '(no)'}`);
  if (!apiKey || !sheetId || !sheetName) {
    warn('Sin config completa de Sheets (apiKey/sheetId/sheetName). Saltando.');
    return true;
  }

  try {
    const range = encodeURIComponent(sheetName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, { timeout: 15000 });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      err(`Sheets HTTP ${resp.status}: ${text.slice(0, 160) || resp.statusText}`);
      return false;
    }
    const json = await resp.json();
    const rows = Array.isArray(json?.values) ? json.values.length : 0;
    ok(`Sheets OK (${rows} filas leídas)`);
    return true;
  } catch (e) {
    err(`Sheets error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log(`${C.bold}🔎 Verificación de Conexiones — Hola Suite Dashboard${C.reset}`);
  const cfg = loadConfig();

  const results = [];
  results.push(await checkClickUp(cfg));
  results.push(await checkHola(cfg));
  results.push(await checkSheets(cfg));

  const okAll = results.every(Boolean);
  header('Resumen');
  if (okAll) {
    ok('Todo OK (o tests opcionales omitidos).');
    process.exitCode = 0;
  } else {
    err('Hay fallos de conectividad/configuración. Revisa los warnings/errores arriba.');
    process.exitCode = 2;
  }
}

main().catch(e => {
  err(e?.message || String(e));
  process.exitCode = 2;
});

