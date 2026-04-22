#!/usr/bin/env node

/**
 * ============================================================================
 * INTEGRATION_DASHBOARD.js
 * ============================================================================
 * 
 * Dashboard detallado de todas las integraciones y funciones disponibles
 * 
 * Uso:
 *   node integration_dashboard.js
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║                  📊 DASHBOARD DE INTEGRACIONES DEL SISTEMA               ║
║                                                                           ║
║                        Sistema VY-LEX - Vista General                    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

// ════════════════════════════════════════════════════════════════════════════
// 1. INTEGRACIONES DISPONIBLES
// ════════════════════════════════════════════════════════════════════════════

console.log(`
🔌 INTEGRACIONES DISPONIBLES
═══════════════════════════════════════════════════════════════════════════

1. ✅ CLICKUP API (Primaria)
   ├─ Estado: ACTIVA
   ├─ Base URL: https://api.clickup.com/api/v2
   ├─ Autenticación: API Key (en .env)
   ├─ Endpoint Principal: /list/{LIST_ID}/task
   ├─ Funciones:
   │  ├─ obtenerTareasClickUp() → Obtiene todas las tareas
   │  ├─ createClickUpTask() → Crea nueva tarea
   │  ├─ patchClickUpCustomField() → Actualiza campo personalizado
   │  ├─ obtenerTareasClickUpRaw() → Obtiene datos brutos
   │  └─ mapTasksToClients() → Mapea tareas a clientes
   └─ Rate Limit: 180 requests/min

2. ⚠️  GOOGLE SHEETS API (Opcional)
   ├─ Estado: NO CONFIGURADA
   ├─ Base URL: https://sheets.googleapis.com/v4
   ├─ Configuración requerida: GOOGLE_SHEET_ID + GOOGLE_API_KEY
   ├─ Funciones disponibles:
   │  ├─ fetchGoogleSheetValues() → Lee datos de hoja
   │  ├─ importSalesFromSheet() → Importa ventas
   │  └─ syncSalesWithClients() → Sincroniza con clientes
   └─ Para activar: Agregar credenciales a .env

3. ⚠️  ¡HOLA! SUITE API (Opcional)
   ├─ Estado: NO CONFIGURADA
   ├─ Base URL: Se obtiene de HOLA_API_URL
   ├─ Configuración requerida: HOLA_API_URL + HOLA_API_TOKEN
   ├─ Funciones disponibles:
   │  ├─ fetchHolaDepartments() → Obtiene departamentos
   │  ├─ fetchHolaConversationsRemote() → Obtiene conversaciones
   │  └─ fetchHolaAttendanceDetailRemote() → Obtiene asistencia
   └─ Para activar: Agregar URL y token a .env

4. ✅ BASE DE DATOS LOCAL (Respaldo)
   ├─ Estado: ACTIVA
   ├─ Archivos:
   │  ├─ users.json → Usuarios del sistema
   │  ├─ audit_logs.json → Logs de auditoría
   │  ├─ global_config.json → Configuración global
   │  └─ data/clientes.json → Clientes sincronizados
   └─ Uso: Fallback cuando APIs externas fallan

5. ✅ CACHE INTELIGENTE (SmartCache)
   ├─ Estado: ACTIVA
   ├─ Ubicación: phase_2_helpers.js
   ├─ Funciones:
   │  ├─ cache.set(key, value) → Guardar en cache
   │  ├─ cache.get(key) → Obtener del cache
   │  ├─ cache.invalidatePattern(regex) → Invalidar por patrón
   │  └─ cache.getStats() → Ver estadísticas
   └─ TTL: Configurable (default 3600s = 1 hora)

`);

// ════════════════════════════════════════════════════════════════════════════
// 2. ENDPOINTS DISPONIBLES POR INTEGRACIÓN
// ════════════════════════════════════════════════════════════════════════════

console.log(`
📋 ENDPOINTS POR INTEGRACIÓN
═══════════════════════════════════════════════════════════════════════════

🟢 CLICKUP - Endpoints Autenticados:

  GET  /api/clientes                    → Lista clientes con paginación
  GET  /api/clientes/:id                → Detalle de cliente
  GET  /api/clientes/:id/comentarios    → Comentarios de cliente
  POST /api/clientes/:id/comentario     → Agregar comentario
  
  GET  /api/alertas                     → Sistema de alertas
  GET  /api/reportes/por-pais           → Analytics por país
  GET  /api/reportes/por-tipo           → Analytics por tipo
  GET  /api/reportes/por-consultor      → Analytics por consultor
  
  GET  /api/sync/status                 → Estado de sincronización
  POST /api/sync/start                  → Iniciar sincronización manual
  
  GET  /api/auditoria                   → Logs de auditoría
  GET  /api/cache/stats                 → Estadísticas de cache
  GET  /api/health                      → Health check


🟡 SHEETS (Si está configurada) - Endpoints:

  GET  /api/sheets/sales                → Obtener ventas importadas
  POST /api/sheets/import               → Importar desde Google Sheets
  GET  /api/sheets/status               → Estado de sincronización


🟡 HOLA! SUITE (Si está configurada) - Endpoints:

  GET  /api/hola/departments            → Departamentos
  GET  /api/hola/conversations          → Conversaciones
  GET  /api/hola/attendance             → Asistencia
  

🟢 AUTENTICACIÓN:

  POST /api/auth/login                  → Obtener JWT token
  POST /api/auth/register               → Registrar nuevo usuario
  GET  /api/auth/verify                 → Verificar token
  

`);

// ════════════════════════════════════════════════════════════════════════════
// 3. FUNCIONES HELPER DISPONIBLES
// ════════════════════════════════════════════════════════════════════════════

console.log(`
🛠️  FUNCIONES HELPER DISPONIBLES
═══════════════════════════════════════════════════════════════════════════

De phase_2_helpers.js:

  retryWithBackoff(fn, maxRetries=3, initialDelayMs=1000)
    ├─ Reintentos con backoff exponencial
    ├─ Uso: await retryWithBackoff(() => fetch(url))
    └─ Beneficio: Maneja rate limits automáticamente

  SmartCache(ttlSeconds)
    ├─ cache.set(key, value, ttlOverride?)
    ├─ cache.get(key)
    ├─ cache.invalidatePattern(regex)
    ├─ cache.getStats()
    └─ cache.clear()

  validateRequest(data, schema)
    ├─ Valida datos contra esquema
    ├─ Soporta: required, type, enum, min/max, pattern
    └─ Retorna: errors object o null

  ChangesQueue()
    ├─ queue.add(clienteId, field, oldValue, newValue, source)
    ├─ queue.process(processor, batchSize=5)
    ├─ queue.getStatus()
    └─ Para sincronización bidireccional


De server.js:

  obtenerTareasClickUp()
    ├─ Obtiene tareas de ClickUp
    ├─ Utiliza cache y retry logic
    └─ Fallback a data/clientes.json

  mapTasksToClients(tasks)
    ├─ Convierte tareas ClickUp a objetos clientes
    └─ Aplica mapeo de campos personalizados

  buildDashboard(clientesData)
    ├─ Genera KPIs y estadísticas
    └─ Calcula meta vs realizado

  writeLog(user, action, details)
    ├─ Escribe en audit_logs.json
    └─ Con timestamp y userId


`);

// ════════════════════════════════════════════════════════════════════════════
// 4. FLUJO DE SINCRONIZACIÓN
// ════════════════════════════════════════════════════════════════════════════

console.log(`
🔄 FLUJO DE SINCRONIZACIÓN
═══════════════════════════════════════════════════════════════════════════

Ciclo Principal:

  1. GET /api/clientes
     ├─ Intenta: Cache (SmartCache)
     ├─ Si no: ClickUp API con retry logic
     ├─ Si falla: data/clientes.json (local fallback)
     └─ Retorna: JSON al cliente

  2. POST /api/sync/start (Manual)
     ├─ Obtiene tareas de ClickUp
     ├─ Mapea a formato cliente
     ├─ Guarda en data/clientes.json
     ├─ Invalida cache (invalidatePattern)
     └─ Retorna: { synced: N, lastUpdate: timestamp }

  3. Cambios Locales → ClickUp (Cuando esté implementado)
     ├─ Usuario modifica cliente en dashboard
     ├─ Cambio se agrega a ChangesQueue
     ├─ Queue procesa en lotes (batch)
     ├─ Se actualiza en ClickUp vía PATCH
     └─ Se invalida cache después

  4. Google Sheets (Si está configurada)
     ├─ Importa datos de hoja
     ├─ Sincroniza con clientes existentes
     └─ Actualiza base de datos local

  5. ¡Hola! Suite (Si está configurada)
     ├─ Obtiene datos adicionales
     ├─ Enriquece información de clientes
     └─ Almacena en data/clientes.json


`);

// ════════════════════════════════════════════════════════════════════════════
// 5. ESTADO ACTUAL DE INTEGRACIONES
// ════════════════════════════════════════════════════════════════════════════

console.log(`
✨ ESTADO ACTUAL
═══════════════════════════════════════════════════════════════════════════

`);

try {
  const report = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'INTEGRATION_REPORT.json'),
    'utf8'
  ));

  console.log('Última verificación: ' + report.timestamp);
  console.log('\n✅ Integraciones Funcionales:');
  
  for (const [name, result] of Object.entries(report.integrations)) {
    if (result.status === 'OK') {
      console.log(`  ✅ ${name}: ${result.details || 'Funcionando'}`);
    }
  }

  console.log('\n⚠️  Integraciones Opcionales:');
  for (const [name, result] of Object.entries(report.integrations)) {
    if (result.status === 'SKIPPED') {
      console.log(`  ⚠️  ${name}: No configurada`);
    }
  }

  console.log('\n📊 Resumen:');
  console.log(`  • Pasadas: ${report.summary.passed}`);
  console.log(`  • Fallidas: ${report.summary.failed}`);
  console.log(`  • Advertencias: ${report.summary.warnings}`);

} catch (e) {
  console.log('⚠️  No hay reporte anterior. Ejecuta: node verify_all_integrations.js');
}

// ════════════════════════════════════════════════════════════════════════════
// 6. CONFIGURACIÓN REQUERIDA
// ════════════════════════════════════════════════════════════════════════════

console.log(`

⚙️  CONFIGURACIÓN REQUERIDA (En .env)
═══════════════════════════════════════════════════════════════════════════

✅ REQUERIDO (para ClickUp - Actualmente configurado):
  CLICKUP_API_KEY=pk_XXXXXXXXXX
  CLICKUP_LIST_ID=901406307381

⚠️  OPCIONAL (Google Sheets - No configurado):
  GOOGLE_SHEET_ID=1XXXXXX...
  GOOGLE_API_KEY=AIzaXXXXXXX...

⚠️  OPCIONAL (¡Hola! Suite - No configurado):
  HOLA_API_URL=https://wispro.holasuite.com
  HOLA_API_TOKEN=eyJXXXXXXX...

✅ YA CONFIGURADO:
  JWT_SECRET=tu_jwt_secret_super_seguro_aqui
  PORT=3000
  NODE_ENV=development


🚀 PRÓXIMAS ACCIONES
═══════════════════════════════════════════════════════════════════════════

1. Verificar integraciones:
   $ node verify_all_integrations.js

2. Probar endpoints (con token válido):
   $ curl http://localhost:3000/api/clientes \\
       -H "Authorization: Bearer <token>"

3. Ver estadísticas de cache:
   $ curl http://localhost:3000/api/cache/stats \\
       -H "Authorization: Bearer <token>"

4. Ver logs de auditoría:
   $ curl http://localhost:3000/api/auditoria \\
       -H "Authorization: Bearer <token>" | jq '.'

5. Para activar Google Sheets:
   - Crear API key en Google Cloud Console
   - Agregar GOOGLE_SHEET_ID y GOOGLE_API_KEY a .env
   - Reiniciar: npm start

6. Para activar ¡Hola! Suite:
   - Obtener credenciales de ¡Hola! Suite
   - Agregar HOLA_API_URL y HOLA_API_TOKEN a .env
   - Reiniciar: npm start


═══════════════════════════════════════════════════════════════════════════

                    ✅ Sistema de Integraciones Activo

═══════════════════════════════════════════════════════════════════════════
`);
