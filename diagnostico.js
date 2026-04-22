#!/usr/bin/env node

/**
 * DIAGNÓSTICO VY-LEX
 * Verifica conectividad con ClickUp y configuración
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const CONFIG_FILE = path.join(__dirname, 'global_config.json');

console.log('\n🔍 DIAGNÓSTICO VY-LEX\n');
console.log('═'.repeat(50));

// 1. Verificar archivos
console.log('\n1️⃣ VERIFICANDO ARCHIVOS:');
const archivos = [
  'server.js',
  'global_config.json',
  'ENDPOINTS_INTEGRACION.js',
  'dashboard.html'
];

archivos.forEach(f => {
  const existe = fs.existsSync(path.join(__dirname, f));
  console.log(`   ${existe ? '✅' : '❌'} ${f}`);
});

// 2. Verificar configuración
console.log('\n2️⃣ VERIFICANDO CONFIGURACIÓN:');

let config = {};
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log('   ✅ global_config.json encontrado');
    console.log(`   ${config.clickupApiKey ? '✅' : '❌'} ClickUp API Key: ${config.clickupApiKey ? '***' + config.clickupApiKey.slice(-4) : 'NO CONFIGURADA'}`);
    console.log(`   ${config.clickupListId ? '✅' : '❌'} ClickUp List ID: ${config.clickupListId || 'NO CONFIGURADO'}`);
  } catch (e) {
    console.log(`   ❌ Error leyendo config: ${e.message}`);
  }
} else {
  console.log('   ❌ global_config.json NO EXISTE');
  console.log('      Creando uno vacío...');
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    clickupApiKey: '',
    clickupListId: '',
    googleSheetsApiKey: '',
    complementosSheetId: '',
    complementosSheetName: ''
  }, null, 2));
  console.log('      ✅ Creado (agrega tus credenciales)');
}

// 3. Probar conexión ClickUp
console.log('\n3️⃣ PROBANDO CONEXIÓN CLICKUP:');

(async () => {
  const apiKey = config.clickupApiKey || process.env.CLICKUP_API_KEY;
  const listId = config.clickupListId || process.env.CLICKUP_LIST_ID;
  
  if (!apiKey) {
    console.log('   ❌ NO HAY API KEY');
    console.log('      Solución: Edita global_config.json y agrega tu ClickUp API Key');
    process.exit(1);
  }
  
  if (!listId) {
    console.log('   ❌ NO HAY LIST ID');
    console.log('      Solución: Edita global_config.json y agrega tu ClickUp List ID');
    process.exit(1);
  }
  
  console.log('   Enviando solicitud a ClickUp...');
  
  try {
    // Test 1: Conectar a ClickUp (team endpoint)
    const teamResp = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { 'Authorization': apiKey },
      timeout: 10000
    });
    
    if (!teamResp.ok) {
      console.log(`   ❌ Error de autenticación (${teamResp.status})`);
      console.log(`      Solución: Verifica que tu API Key sea válida`);
      console.log(`      Obtén una nueva en: https://app.clickup.com/settings/apps_and_integrations`);
      process.exit(1);
    }
    
    const teamData = await teamResp.json();
    console.log(`   ✅ API Key válida`);
    console.log(`      Equipo: ${teamData.teams?.[0]?.name || 'Sin nombre'}`);
    
    // Test 2: Verificar List ID
    console.log(`\n   Verificando List ID: ${listId}...`);
    const listResp = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { 'Authorization': apiKey },
      timeout: 10000
    });
    
    if (!listResp.ok) {
      console.log(`   ❌ Error en List ID (${listResp.status})`);
      const error = await listResp.json();
      console.log(`      ${error.err || error.message}`);
      console.log(`      Solución: Verifica que el List ID sea correcto`);
      console.log(`      Obtén el ID en: https://app.clickup.com/list/XXXX (número en URL)`);
      process.exit(1);
    }
    
    const listData = await listResp.json();
    console.log(`   ✅ List ID válido: ${listData.name}`);
    
    // Test 3: Traer tareas
    console.log(`\n   Trayendo tareas...`);
    const tasksResp = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?page=0`, {
      headers: { 'Authorization': apiKey },
      timeout: 10000
    });
    
    if (!tasksResp.ok) {
      console.log(`   ❌ Error trayendo tareas (${tasksResp.status})`);
      process.exit(1);
    }
    
    const tasksData = await tasksResp.json();
    const count = tasksData.tasks?.length || 0;
    console.log(`   ✅ Tareas encontradas: ${count}`);
    
    // Resumen
    console.log('\n' + '═'.repeat(50));
    console.log('\n✅ TODO ESTÁ FUNCIONANDO CORRECTAMENTE\n');
    console.log('Pasos siguientes:');
    console.log('1. npm start');
    console.log('2. Accede a http://localhost:3000/dashboard.html');
    console.log('3. Login con tu usuario');
    
    process.exit(0);
    
  } catch (e) {
    console.log(`   ❌ Error de conexión: ${e.message}`);
    
    if (e.message.includes('ECONNREFUSED')) {
      console.log('      Verifica que tengas conexión a internet');
    } else if (e.message.includes('timeout')) {
      console.log('      Timeout: La API de ClickUp tardó mucho o está caída');
      console.log('      Intenta de nuevo en unos minutos');
    }
    
    process.exit(1);
  }
})();
