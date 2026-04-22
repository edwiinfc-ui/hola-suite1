#!/usr/bin/env node
'use strict';

/**
 * QUICK TEST - Validar que todos los nuevos endpoints de Fase 2 funcionan
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let TOKEN = '';
const tests = [];

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data).catch ? data : JSON.parse(data) : {}
        });
      });
    });

    req.on('error', (e) => {
      resolve({ status: 0, body: { error: e.message } });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, method, path, body = null, expectedStatus = 200) {
  try {
    const headers = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
    const result = await makeRequest(method, path, body, headers);
    
    const passed = result.status === expectedStatus;
    tests.push({ name, passed, status: result.status, expected: expectedStatus });
    
    console.log(`${passed ? '✅' : '❌'} ${name}`);
    if (!passed) {
      console.log(`   Esperado: ${expectedStatus}, Recibido: ${result.status}`);
    }
    
    return result.body;
  } catch (e) {
    console.log(`❌ ${name} - Error: ${e.message}`);
    tests.push({ name, passed: false, error: e.message });
  }
}

async function run() {
  console.log('🧪 PRUEBA RÁPIDA DE ENDPOINTS FASE 2');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Generar token JWT directamente
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = 'tu_jwt_secret_super_seguro_aqui';
  TOKEN = jwt.sign(
    { id: 1, username: 'admin@holasuite.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  console.log('📝 1. Autenticación\n');
  console.log(`   ✅ Token JWT generado\n`);

  // 2. Endpoints de Clientes
  console.log('👥 2. Endpoints de Clientes\n');
  const clientesRes = await test('GET /api/clientes', 'GET', '/api/clientes', null, 200);
  
  let clienteId = 'test123';
  if (clientesRes?.clientes && Array.isArray(clientesRes.clientes) && clientesRes.clientes.length > 0) {
    clienteId = clientesRes.clientes[0].id;
  } else if (clientesRes?.data && Array.isArray(clientesRes.data) && clientesRes.data.length > 0) {
    clienteId = clientesRes.data[0].id;
  }
  
  await test(`GET /api/clientes/:id (${clienteId})`, 'GET', `/api/clientes/${clienteId}`, null, 200);
  await test('GET /api/clientes/:id/comentarios', 'GET', `/api/clientes/${clienteId}/comentarios`, null, 200);
  await test('POST /api/clientes/:id/comentario', 'POST', `/api/clientes/${clienteId}/comentario`, 
    { texto: 'Test comentario', tipo: 'general' }, 200);

  // 3. Endpoints de Alertas
  console.log('\n⚠️  3. Alertas\n');
  await test('GET /api/alertas', 'GET', '/api/alertas', null, 200);
  await test('GET /api/alertas (con filtro)', 'GET', '/api/alertas?severidad=CRITICA', null, 200);

  // 4. Endpoints de Reportes
  console.log('\n📊 4. Reportes\n');
  await test('GET /api/reportes/por-pais', 'GET', '/api/reportes/por-pais', null, 200);
  await test('GET /api/reportes/por-tipo', 'GET', '/api/reportes/por-tipo', null, 200);
  await test('GET /api/reportes/por-consultor', 'GET', '/api/reportes/por-consultor', null, 200);

  // 5. Endpoints de Sincronización
  console.log('\n🔄 5. Sincronización\n');
  await test('GET /api/sync/status', 'GET', '/api/sync/status', null, 200);
  await test('POST /api/sync/start', 'POST', '/api/sync/start', {}, 200);

  // 6. Endpoint de Auditoría
  console.log('\n🔍 6. Auditoría\n');
  await test('GET /api/auditoria', 'GET', '/api/auditoria', null, 200);

  // 7. Resumen
  console.log('\n═══════════════════════════════════════════════════════════════════');
  const passed = tests.filter(t => t.passed).length;
  const total = tests.length;
  console.log(`\n📈 RESULTADO: ${passed}/${total} pruebas pasadas\n`);

  if (passed === total) {
    console.log('✅ TODOS LOS ENDPOINTS DE FASE 2 FUNCIONAN CORRECTAMENTE\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${total - passed} prueba(s) fallida(s)\n`);
    process.exit(1);
  }
}

// Esperar que el servidor esté listo
setTimeout(run, 1000);
