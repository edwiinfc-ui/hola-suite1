/**
 * debug-clickup.js — Diagnóstico Completo del Sistema
 * 
 * Pasos:
 *   1. Verificar global_config.json
 *   2. Probar API Key de ClickUp (Teams/Members)
 *   3. Probar List ID (Tareas)
 *   4. Inspeccionar Custom Fields de la primera tarea
 *   5. Verificar estados (statuses) disponibles en la lista
 *   6. Test de conectividad a Hola Suite API
 * 
 * Uso: node debug-clickup.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const CONFIG_FILE = path.join(__dirname, 'global_config.json');

// Colores ANSI para la consola
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function ok(msg) { console.log(`  ${C.green}✅${C.reset} ${msg}`); }
function err(msg) { console.log(`  ${C.red}❌${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}⚠️${C.reset}  ${msg}`); }
function info(msg) { console.log(`  ${C.cyan}ℹ️${C.reset}  ${msg}`); }
function header(n, title) {
  console.log(`\n${C.bold}${C.cyan}Step ${n}: ${title}${C.reset}`);
  console.log('─'.repeat(55));
}

async function debug() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════╗`);
  console.log(`║   🔍 Hola Suite — Diagnóstico Completo            ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}\n`);

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  // ──────────────────────────────────────────────────────────────
  // STEP 1: global_config.json
  // ──────────────────────────────────────────────────────────────
  header(1, 'Verificando global_config.json');
  let globalConfig = {};
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      err(`Archivo no encontrado: ${CONFIG_FILE}`);
      failed++;
    } else {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      globalConfig = JSON.parse(raw);
      ok('global_config.json es un JSON válido');
      passed++;
      
      const keys = Object.keys(globalConfig);
      info(`Claves encontradas: ${keys.join(', ')}`);
    }
  } catch (e) {
    err(`Error parseando global_config.json: ${e.message}`);
    failed++;
    if (e.message.includes('position')) {
      const pos = parseInt((e.message.match(/position (\d+)/) || [])[1] || '0');
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      warn(`Contenido cerca del error: "${raw.substring(Math.max(0, pos - 20), pos + 20)}"`);
    }
    return;
  }

  const apiKey = (globalConfig.clickupApiKey || process.env.CLICKUP_API_KEY || '').trim();
  const listId = (globalConfig.clickupListId || process.env.CLICKUP_LIST_ID || '').trim();
  const holaUrl = (globalConfig.holaUrl || process.env.HOLA_API_URL || '').trim();
  const holaToken = (globalConfig.holaToken || process.env.HOLA_API_TOKEN || '').trim();

  info(`API Key ClickUp: ${apiKey ? '***' + apiKey.slice(-6) : 'FALTA'}`);
  info(`List ID ClickUp: ${listId || C.red + 'FALTA' + C.reset}`);
  info(`Hola URL:        ${holaUrl || C.yellow + 'No configurada' + C.reset}`);
  info(`Hola Token:      ${holaToken ? '***' + holaToken.slice(-6) : C.yellow + 'No configurado' + C.reset}`);
  info(`Consultores mapeados: ${Object.keys(globalConfig.CONSULTORES || {}).length}`);

  if (!apiKey) { err('Falta CLICKUP_API_KEY'); failed++; }
  if (!listId) { err('Falta CLICKUP_LIST_ID'); failed++; }
  if (!apiKey || !listId) {
    console.log('\n❌ Las credenciales básicas de ClickUp no están configuradas. Abortando.\n');
    return;
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 2: API Key — Teams/Members
  // ──────────────────────────────────────────────────────────────
  header(2, 'Probando API Key de ClickUp (Teams)');
  let teamId = null;
  try {
    const res = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: apiKey },
      timeout: 15000
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      err(`HTTP ${res.status} — ${text.slice(0, 100)}`);
      failed++;
    } else {
      const data = await res.json();
      ok(`API Key válida. Workspaces encontrados: ${data.teams?.length || 0}`);
      passed++;
      if (data.teams?.length > 0) {
        const team = data.teams[0];
        teamId = team.id;
        info(`Workspace: "${team.name}" (ID: ${team.id})`);
        info(`Miembros: ${team.members?.length || 0}`);
        if (team.members?.length > 0) {
          const firstMembers = team.members.slice(0, 3).map(m => m.user?.username || m.user?.email || '?');
          info(`Primeros miembros: ${firstMembers.join(', ')}${team.members.length > 3 ? '...' : ''}`);
        }
      }
    }
  } catch (e) {
    err(`Error de red: ${e.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 3: List ID — Tareas
  // ──────────────────────────────────────────────────────────────
  header(3, 'Probando List ID (Tareas)');
  let firstTask = null;
  let allTasks = [];
  try {
    const taskUrl = `https://api.clickup.com/api/v2/list/${listId}/task?page=0&limit=5&include_closed=true`;
    const res = await fetch(taskUrl, {
      headers: { Authorization: apiKey },
      timeout: 15000
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      err(`HTTP ${res.status} — ${text.slice(0, 150)}`);
      failed++;
    } else {
      const data = await res.json();
      allTasks = data.tasks || [];
      ok(`List ID válido. Tareas en página 0: ${allTasks.length}`);
      passed++;
      if (allTasks.length > 0) {
        firstTask = allTasks[0];
        info(`Primera tarea: "${firstTask.name}" (ID: ${firstTask.id})`);
        info(`Estado:        "${firstTask.status?.status}"`);
        info(`Custom Fields: ${firstTask.custom_fields?.length || 0}`);
      }
      
      // Contar total estimado
      if (data.tasks?.length === 5) {
        info('Lista tiene más de 5 tareas (paginación disponible)');
      }
    }
  } catch (e) {
    err(`Error de red: ${e.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 4: Custom Fields de la primera tarea
  // ──────────────────────────────────────────────────────────────
  header(4, 'Inspeccionando Custom Fields');
  if (!firstTask) {
    warn('Sin tarea disponible para inspeccionar custom fields');
  } else {
    const cf = firstTask.custom_fields || [];
    if (cf.length === 0) {
      warn('La tarea no tiene custom fields (o no se retornaron)');
    } else {
      ok(`${cf.length} custom fields encontrados en la primera tarea`);
      passed++;
      
      // Tabla resumen de campos
      console.log(`\n  ${C.dim}${'Campo'.padEnd(35)} ${'Tipo'.padEnd(15)} ${'Tiene Valor'.padEnd(12)} Opciones${C.reset}`);
      console.log(`  ${'─'.repeat(80)}`);
      cf.forEach(f => {
        const hasValue = f.value !== null && f.value !== undefined && f.value !== '';
        const optCount = f.type_config?.options?.length || 0;
        const cname = String(f.name || '').substring(0, 34).padEnd(35);
        const ctype = String(f.type || '').substring(0, 14).padEnd(15);
        const cval = (hasValue ? `${C.green}SÍ${C.reset}` : `${C.dim}NO${C.reset}`).padEnd(12 + 9);
        const copts = optCount > 0 ? `${optCount} opts` : '';
        console.log(`  ${cname} ${ctype} ${cval} ${copts}`);
      });

      // Campos críticos para el sistema
      console.log(`\n  ${C.bold}Campos clave para el mapper:${C.reset}`);
      const camposClave = [
        'Fecha Inicio Kickoff', 'Fecha Inicio Onboarding',
        'Responsable por el Kickoff', 'Responsable por el Análisis',
        'IP Hola', 'Domínio', 'País', 'Plan',
        'Canales contratados', 'Canales bajados',
        'E-mail', 'Número para contacto',
        'Tipo de implementación', 'Motivos de baja'
      ];
      camposClave.forEach(clave => {
        const found = cf.find(f => {
          const fname = String(f.name || '').toLowerCase();
          return fname === clave.toLowerCase() ||
                 fname.includes(clave.toLowerCase().split(' ').slice(0, 2).join(' '));
        });
        if (found) {
          info(`${clave}: ${C.green}encontrado${C.reset} → "${found.name}" (${found.type})`);
        } else {
          warn(`${clave}: ${C.yellow}no encontrado en esta tarea${C.reset}`);
        }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 5: Status disponibles en la lista
  // ──────────────────────────────────────────────────────────────
  header(5, 'Verificando estados (statuses) de la lista');
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: apiKey },
      timeout: 15000
    });

    if (!res.ok) {
      warn(`No se pudo obtener info de la lista: HTTP ${res.status}`);
    } else {
      const data = await res.json();
      const statuses = data.statuses || [];
      ok(`Lista: "${data.name}" — ${statuses.length} estados encontrados`);
      passed++;
      
      if (statuses.length > 0) {
        console.log(`\n  ${C.dim}${'Estado'.padEnd(35)} ${'Tipo'.padEnd(12)} Color${C.reset}`);
        console.log(`  ${'─'.repeat(60)}`);
        statuses
          .sort((a, b) => (a.orderindex || 0) - (b.orderindex || 0))
          .forEach(s => {
            const name = String(s.status || '').padEnd(35);
            const type = String(s.type || '').padEnd(12);
            console.log(`  ${name} ${type} ${s.color || ''}`);
          });
      }

      // Verificar si los estados del sistema coinciden con los reales
      const ESTADOS_SISTEMA = [
        'listo para kickoff','en kickoff','en onboarding',
        'en análisis meta','listo para instalación','en instalación',
        'en capacitación','go-live','activación canales','en espera wispro',
        'concluído','cancelado','closed'
      ];
      const statusesLower = statuses.map(s => String(s.status || '').toLowerCase());
      const noEncontrados = ESTADOS_SISTEMA.filter(e =>
        !statusesLower.some(s => s === e || s.includes(e.split(' ')[0]))
      );
      if (noEncontrados.length > 0) {
        warn(`Estados esperados por el sistema NO encontrados en la lista:`);
        noEncontrados.forEach(e => warn(`  → "${e}"`));
      } else {
        ok('Todos los estados del sistema se detectaron en la lista ClickUp');
      }
    }
  } catch (e) {
    warn(`Error obteniendo info de lista: ${e.message}`);
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 6: Conectividad a Hola Suite API
  // ──────────────────────────────────────────────────────────────
  header(6, 'Test de conectividad — Hola Suite API');
  if (!holaUrl || !holaToken) {
    warn('Hola Suite URL o Token no configurados — omitiendo test');
    info('Para configurar: admin → Configuración → URL Hola Suite y Token');
  } else {
    const apiBase = holaUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
    const endpoints = [
      `${apiBase}/departamento`,
      `${apiBase}/atendimento`
    ];
    
    let holaOk = false;
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: holaToken.toLowerCase().startsWith('bearer ') ? holaToken : `Bearer ${holaToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        if (res.ok) {
          const data = await res.json();
          ok(`Hola Suite responde en: ${endpoint}`);
          const count = Array.isArray(data?.data) ? data.data.length :
                        Array.isArray(data) ? data.length : '?';
          info(`Registros retornados: ${count}`);
          holaOk = true;
          passed++;
          break;
        } else {
          warn(`HTTP ${res.status} en ${endpoint}`);
          if (res.status === 401) {
            err('Token Hola Suite inválido o expirado. Actualizar en Configuración.');
            failed++;
            break;
          }
        }
      } catch (e) {
        warn(`Error en ${endpoint}: ${e.message}`);
      }
    }
    
    if (!holaOk) {
      err('No se pudo conectar a Hola Suite API. Verificar URL y Token.');
      failed++;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // RESUMEN FINAL
  // ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = passed + failed;
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════╗`);
  console.log(`║   📊 Resumen del Diagnóstico                      ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n  ${C.green}Exitosos: ${passed}/${total}${C.reset}`);
  console.log(`  ${C.red}Fallidos: ${failed}/${total}${C.reset}`);
  console.log(`  Tiempo:   ${elapsed}s\n`);

  if (failed === 0) {
    console.log(`  ${C.bold}${C.green}🎉 Sistema completamente operativo!${C.reset}\n`);
  } else {
    console.log(`  ${C.yellow}⚠️  Hay ${failed} problema(s) que requieren atención.${C.reset}\n`);
    console.log(`  Pasos sugeridos:`);
    console.log(`  1. Verifica las credenciales en global_config.json`);
    console.log(`  2. Actualiza el token de Hola Suite si expiró`);
    console.log(`  3. Ejecuta: npm start — y verifica los logs del servidor\n`);
  }
}

debug().catch(e => {
  console.error(`\n${C.red}Error fatal: ${e.message}${C.reset}\n`);
  process.exit(1);
});
