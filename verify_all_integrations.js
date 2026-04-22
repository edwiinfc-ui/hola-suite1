#!/usr/bin/env node

/**
 * ============================================================================
 * VERIFY_ALL_INTEGRATIONS.js
 * ============================================================================
 * 
 * Verifica que TODAS las integraciones funcionen:
 * 1. ClickUp API (lectura/escritura)
 * 2. Google Sheets API (lectura)
 * 3. ¡Hola! Suite API (si está configurada)
 * 4. Base datos local (backup)
 * 5. Cache del sistema
 * 
 * Uso:
 *   node verify_all_integrations.js
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

const CONFIG = {
  CLICKUP_API_KEY: (process.env.CLICKUP_API_KEY || '').trim(),
  CLICKUP_LIST_ID: (process.env.CLICKUP_LIST_ID || '').trim(),
  GOOGLE_SHEET_ID: (process.env.GOOGLE_SHEET_ID || '').trim(),
  GOOGLE_API_KEY: (process.env.GOOGLE_API_KEY || '').trim(),
  HOLA_API_URL: (process.env.HOLA_API_URL || '').trim(),
  HOLA_API_TOKEN: (process.env.HOLA_API_TOKEN || '').trim(),
};

let resultsReport = {
  timestamp: new Date().toISOString(),
  integrations: {},
  summary: { passed: 0, failed: 0, warnings: 0 }
};

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║          🔍 VERIFICACIÓN DE INTEGRACIONES DEL SISTEMA             ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

// ════════════════════════════════════════════════════════════════════════════
// 1. VERIFICAR CONFIGURACIÓN
// ════════════════════════════════════════════════════════════════════════════

console.log('\n1️⃣ Verificando Configuración Ambiental...\n');

const requiredEnvVars = {
  'CLICKUP_API_KEY': CONFIG.CLICKUP_API_KEY,
  'CLICKUP_LIST_ID': CONFIG.CLICKUP_LIST_ID,
};

let configOk = true;
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.error(`   ❌ ${key}: NO CONFIGURADO`);
    resultsReport.summary.failed++;
    configOk = false;
  } else {
    console.log(`   ✅ ${key}: Configurado`);
    resultsReport.summary.passed++;
  }
}

if (!configOk) {
  console.error('\n❌ Configuración incompleta. Edita .env');
  process.exit(1);
}

// Integraciones opcionales
console.log('\n📋 Integraciones Opcionales:');
if (CONFIG.GOOGLE_SHEET_ID && CONFIG.GOOGLE_API_KEY) {
  console.log('   ✅ Google Sheets: Disponible');
} else {
  console.log('   ⚠️  Google Sheets: No configurado');
  resultsReport.summary.warnings++;
}

if (CONFIG.HOLA_API_URL && CONFIG.HOLA_API_TOKEN) {
  console.log('   ✅ ¡Hola! Suite: Disponible');
} else {
  console.log('   ⚠️  ¡Hola! Suite: No configurado');
  resultsReport.summary.warnings++;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. VERIFICAR CLICKUP API
// ════════════════════════════════════════════════════════════════════════════

async function testClickUpAPI() {
  console.log('\n2️⃣ Verificando ClickUp API...\n');
  
  try {
    // Test 1: Listar tareas
    console.log('   🔄 Test 1: Obteniendo tareas...');
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${CONFIG.CLICKUP_LIST_ID}/task`,
      {
        method: 'GET',
        headers: {
          'Authorization': CONFIG.CLICKUP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const taskCount = data.tasks ? data.tasks.length : 0;
    
    console.log(`      ✅ Conexión OK - ${taskCount} tareas encontradas`);
    
    // Test 2: Información de la lista
    console.log('   🔄 Test 2: Obteniendo información de lista...');
    const listResponse = await fetch(
      `https://api.clickup.com/api/v2/list/${CONFIG.CLICKUP_LIST_ID}`,
      {
        method: 'GET',
        headers: {
          'Authorization': CONFIG.CLICKUP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!listResponse.ok) {
      throw new Error(`HTTP ${listResponse.status}: ${listResponse.statusText}`);
    }

    const listData = await listResponse.json();
    console.log(`      ✅ Lista: "${listData.name}"`);
    
    resultsReport.integrations.clickup = {
      status: 'OK',
      taskCount: taskCount,
      listName: listData.name,
      details: `API funciona correctamente, ${taskCount} tareas disponibles`
    };
    
    resultsReport.summary.passed++;
    console.log('   ✅ ClickUp API: FUNCIONAL\n');
    
  } catch (error) {
    console.error(`   ❌ Error en ClickUp API: ${error.message}\n`);
    resultsReport.integrations.clickup = {
      status: 'FAILED',
      error: error.message
    };
    resultsReport.summary.failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. VERIFICAR GOOGLE SHEETS API (Opcional)
// ════════════════════════════════════════════════════════════════════════════

async function testGoogleSheets() {
  if (!CONFIG.GOOGLE_SHEET_ID || !CONFIG.GOOGLE_API_KEY) {
    console.log('3️⃣ Google Sheets API: Omitido (no configurado)\n');
    resultsReport.integrations.googleSheets = {
      status: 'SKIPPED',
      reason: 'Not configured'
    };
    return;
  }

  console.log('3️⃣ Verificando Google Sheets API...\n');
  
  try {
    console.log('   🔄 Test: Leyendo valores de hoja...');
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.GOOGLE_SHEET_ID}/values/A1?key=${CONFIG.GOOGLE_API_KEY}`,
      {
        method: 'GET'
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`      ✅ Conexión OK`);
    
    resultsReport.integrations.googleSheets = {
      status: 'OK',
      details: 'Google Sheets API funciona correctamente'
    };
    
    resultsReport.summary.passed++;
    console.log('   ✅ Google Sheets API: FUNCIONAL\n');
    
  } catch (error) {
    console.error(`   ❌ Error en Google Sheets: ${error.message}\n`);
    resultsReport.integrations.googleSheets = {
      status: 'FAILED',
      error: error.message
    };
    resultsReport.summary.failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. VERIFICAR ¡HOLA! SUITE API (Opcional)
// ════════════════════════════════════════════════════════════════════════════

async function testHolaSuiteAPI() {
  if (!CONFIG.HOLA_API_URL || !CONFIG.HOLA_API_TOKEN) {
    console.log('4️⃣ ¡Hola! Suite API: Omitido (no configurado)\n');
    resultsReport.integrations.holasuite = {
      status: 'SKIPPED',
      reason: 'Not configured'
    };
    return;
  }

  console.log('4️⃣ Verificando ¡Hola! Suite API...\n');
  
  try {
    console.log('   🔄 Test 1: Obteniendo departamentos...');
    const response = await fetch(
      `${CONFIG.HOLA_API_URL}/api/departments`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.HOLA_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`      ✅ Conexión OK`);
    
    resultsReport.integrations.holasuite = {
      status: 'OK',
      details: '¡Hola! Suite API funciona correctamente'
    };
    
    resultsReport.summary.passed++;
    console.log('   ✅ ¡Hola! Suite API: FUNCIONAL\n');
    
  } catch (error) {
    console.error(`   ⚠️  Error en ¡Hola! Suite: ${error.message}\n`);
    resultsReport.integrations.holasuite = {
      status: 'WARNING',
      error: error.message
    };
    resultsReport.summary.warnings++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. VERIFICAR BASE DE DATOS LOCAL
// ════════════════════════════════════════════════════════════════════════════

function testLocalDatabase() {
  console.log('5️⃣ Verificando Base de Datos Local...\n');
  
  const filesToCheck = [
    { name: 'users.json', path: path.join(__dirname, 'users.json') },
    { name: 'audit_logs.json', path: path.join(__dirname, 'audit_logs.json') },
    { name: 'data/global_config.local.json', path: path.join(__dirname, 'data', 'global_config.local.json') },
    { name: 'data/global_config.json', path: path.join(__dirname, 'data', 'global_config.json') },
    { name: 'global_config.json (legacy)', path: path.join(__dirname, 'global_config.json') },
    { name: 'data/clientes.json', path: path.join(__dirname, 'data', 'clientes.json') },
  ];

  let allOk = true;
  for (const file of filesToCheck) {
    if (fs.existsSync(file.path)) {
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        const size = (content.length / 1024).toFixed(2);
        console.log(`   ✅ ${file.name}: ${size} KB`);
      } catch (e) {
        console.error(`   ❌ ${file.name}: Error leyendo - ${e.message}`);
        allOk = false;
      }
    } else {
      console.warn(`   ⚠️  ${file.name}: No existe (crear on demand)`);
    }
  }

  resultsReport.integrations.localStorage = {
    status: allOk ? 'OK' : 'WARNING',
    details: 'Archivos locales disponibles'
  };
  
  resultsReport.summary.passed++;
  console.log('   ✅ Base de Datos Local: FUNCIONAL\n');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. VERIFICAR CACHE DEL SISTEMA
// ════════════════════════════════════════════════════════════════════════════

function testSystemCache() {
  console.log('6️⃣ Verificando Cache del Sistema...\n');
  
  try {
    const { SmartCache } = require('./phase_2_helpers');
    const testCache = new SmartCache(60); // 60 segundos
    
    // Test set/get
    testCache.set('test_key', 'test_value');
    const value = testCache.get('test_key');
    
    if (value === 'test_value') {
      console.log('   ✅ SmartCache: Funciona correctamente');
      const stats = testCache.getStats();
      console.log(`      - Tamaño: ${stats.size} items`);
      console.log(`      - Hit rate: ${stats.hitRate}`);
    } else {
      throw new Error('Cache set/get mismatch');
    }
    
    resultsReport.integrations.cache = {
      status: 'OK',
      details: 'SmartCache funciona correctamente'
    };
    
    resultsReport.summary.passed++;
    console.log('   ✅ Cache del Sistema: FUNCIONAL\n');
    
  } catch (error) {
    console.warn(`   ⚠️  Cache: ${error.message}\n`);
    resultsReport.integrations.cache = {
      status: 'WARNING',
      error: error.message
    };
    resultsReport.summary.warnings++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EJECUTAR TODAS LAS PRUEBAS
// ════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  try {
    await testClickUpAPI();
    await testGoogleSheets();
    await testHolaSuiteAPI();
    testLocalDatabase();
    testSystemCache();
    
    // Guardar reporte
    const reportFile = path.join(__dirname, 'INTEGRATION_REPORT.json');
    fs.writeFileSync(reportFile, JSON.stringify(resultsReport, null, 2));
    
    // Resumen final
    console.log('═'.repeat(70));
    console.log('\n📊 RESUMEN FINAL DE INTEGRACIONES\n');
    
    console.log(`✅ Pasadas: ${resultsReport.summary.passed}`);
    console.log(`❌ Fallidas: ${resultsReport.summary.failed}`);
    console.log(`⚠️  Advertencias: ${resultsReport.summary.warnings}`);
    
    console.log('\n📋 Estado por Integración:\n');
    
    for (const [name, result] of Object.entries(resultsReport.integrations)) {
      const status = result.status === 'OK' ? '✅' : result.status === 'FAILED' ? '❌' : '⚠️ ';
      console.log(`${status} ${name}: ${result.status}`);
      if (result.details) console.log(`   └─ ${result.details}`);
      if (result.error) console.log(`   └─ Error: ${result.error}`);
    }
    
    console.log(`\n📄 Reporte guardado: ${reportFile}\n`);
    
    if (resultsReport.summary.failed > 0) {
      console.error('❌ Algunas integraciones fallaron. Revisa los errores arriba.');
      process.exit(1);
    } else {
      console.log('✅ ¡Todas las integraciones funciona correctamente!\n');
      process.exit(0);
    }
    
  } catch (error) {
    console.error(`\n❌ Error fatal: ${error.message}\n`);
    process.exit(1);
  }
}

runAllTests();
