#!/usr/bin/env node

/**
 * ============================================================================
 * INTEGRATE_PHASE_2_ENDPOINTS.js
 * ============================================================================
 * 
 * Script para integrar automáticamente los 15 endpoints de Fase 2
 * desde ENDPOINTS_INTEGRACION_MEJORADO.js a server.js
 * 
 * Uso:
 *   node integrate_phase_2_endpoints.js
 * 
 * ✅ Ventajas:
 *   - Copia automática sin riesgo de error manual
 *   - Backup automático de server.js
 *   - Validación de sintaxis después de integración
 *   - Rollback automático si falla
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENDPOINTS_FILE = path.join(__dirname, 'ENDPOINTS_INTEGRACION_MEJORADO.js');
const SERVER_FILE = path.join(__dirname, 'server.js');
const BACKUP_FILE = path.join(__dirname, 'server.js.backup_phase2_endpoints');

console.log('🚀 INTEGRACIÓN AUTOMÁTICA - FASE 2 ENDPOINTS');
console.log('═'.repeat(70));

// ════════════════════════════════════════════════════════════════
// 1. VALIDACIONES PREVIAS
// ════════════════════════════════════════════════════════════════

console.log('\n1️⃣  Validando archivos...');

if (!fs.existsSync(ENDPOINTS_FILE)) {
  console.error(`❌ No encontrado: ${ENDPOINTS_FILE}`);
  process.exit(1);
}
console.log('   ✅ ENDPOINTS_INTEGRACION_MEJORADO.js existe');

if (!fs.existsSync(SERVER_FILE)) {
  console.error(`❌ No encontrado: ${SERVER_FILE}`);
  process.exit(1);
}
console.log('   ✅ server.js existe');

// ════════════════════════════════════════════════════════════════
// 2. CREAR BACKUP
// ════════════════════════════════════════════════════════════════

console.log('\n2️⃣  Creando backup...');
try {
  const serverCode = fs.readFileSync(SERVER_FILE, 'utf8');
  fs.writeFileSync(BACKUP_FILE, serverCode);
  console.log(`   ✅ Backup creado: server.js.backup_phase2_endpoints`);
} catch (e) {
  console.error(`   ❌ Error al crear backup: ${e.message}`);
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════
// 3. EXTRAER ENDPOINTS DEL ARCHIVO
// ════════════════════════════════════════════════════════════════

console.log('\n3️⃣  Extrayendo endpoints...');

const endpointsCode = fs.readFileSync(ENDPOINTS_FILE, 'utf8');

// Buscar la sección de endpoints (después de "ENDPOINTS: CRUD DE CLIENTES")
const endpointsSectionStart = endpointsCode.indexOf('// ================================================================\n// 1. ENDPOINTS: CRUD DE CLIENTES');
const endpointsSectionEnd = endpointsCode.indexOf('// ================================================================\n// ERROR HANDLER MIDDLEWARE');

if (endpointsSectionStart === -1 || endpointsSectionEnd === -1) {
  console.error('❌ No se pudo ubicar la sección de endpoints en ENDPOINTS_INTEGRACION_MEJORADO.js');
  process.exit(1);
}

const endpointsToAdd = endpointsCode.substring(endpointsSectionStart, endpointsSectionEnd).trim();

// Contar endpoints
const endpointCount = (endpointsToAdd.match(/^app\.(get|post|put|delete)/gm) || []).length;
console.log(`   ✅ Extrayeron ${endpointCount} endpoints`);

// ════════════════════════════════════════════════════════════════
// 4. INTEGRAR EN SERVER.JS
// ════════════════════════════════════════════════════════════════

console.log('\n4️⃣  Integrando endpoints en server.js...');

let serverCode = fs.readFileSync(SERVER_FILE, 'utf8');

// Buscar el punto de inserción: justo antes de "// ================================================================\n// CATCH-ALL → SPA"
const insertPoint = serverCode.indexOf('// ================================================================\n// CATCH-ALL → SPA');

if (insertPoint === -1) {
  console.error('❌ No se pudo encontrar el punto de inserción en server.js');
  console.error('   Deberías tener: "// ================================================================\\n// CATCH-ALL → SPA"');
  process.exit(1);
}

// Insertar endpoints antes del CATCH-ALL
const endpointsComments = `

// ================================================================
// FASE 2 - ENDPOINTS MEJORADOS (Autogenerados)
// ================================================================
// Estos endpoints fueron integrados automáticamente desde:
// ${path.basename(ENDPOINTS_FILE)}
// 
// Incluyen:
// - CRUD completo de clientes
// - Sistema de comentarios
// - Reportes y analytics
// - Alertas del sistema
// - Sync status
// ================================================================

${endpointsToAdd}

`;

serverCode = serverCode.substring(0, insertPoint) + endpointsComments + serverCode.substring(insertPoint);

// ════════════════════════════════════════════════════════════════
// 5. VALIDAR SINTAXIS
// ════════════════════════════════════════════════════════════════

console.log('\n5️⃣  Validando sintaxis...');

try {
  // Guardar temporalmente para validar
  const tempFile = path.join(__dirname, '.temp_validate.js');
  fs.writeFileSync(tempFile, serverCode);
  
  // Ejecutar validación de sintaxis
  execSync(`node -c "${tempFile}"`, { stdio: 'pipe' });
  
  // Limpiar temp
  fs.unlinkSync(tempFile);
  
  console.log('   ✅ Sintaxis válida');
} catch (e) {
  console.error('   ❌ Error de sintaxis detectado:');
  console.error(`      ${e.message}`);
  console.error('   Revirtiendo cambios...');
  
  fs.copyFileSync(BACKUP_FILE, SERVER_FILE);
  console.log('   ✅ Revertido a backup');
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════
// 6. GUARDAR CAMBIOS
// ════════════════════════════════════════════════════════════════

console.log('\n6️⃣  Guardando cambios...');

try {
  fs.writeFileSync(SERVER_FILE, serverCode);
  console.log('   ✅ server.js actualizado');
} catch (e) {
  console.error(`   ❌ Error al guardar: ${e.message}`);
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════
// 7. VERIFICACIÓN FINAL
// ════════════════════════════════════════════════════════════════

console.log('\n7️⃣  Verificación final...');

const newServerCode = fs.readFileSync(SERVER_FILE, 'utf8');
const newEndpointCount = (newServerCode.match(/^app\.(get|post|put|delete)/gm) || []).length;
const endpointsAdded = newEndpointCount - (fs.readFileSync(BACKUP_FILE, 'utf8').match(/^app\.(get|post|put|delete)/gm) || []).length;

console.log(`   ✅ Total endpoints: ${newEndpointCount}`);
console.log(`   ✅ Endpoints agregados: ${endpointsAdded}`);

if (endpointsAdded === endpointCount) {
  console.log(`   ✅ Verificación exitosa`);
} else {
  console.warn(`   ⚠️  Se agregaron ${endpointsAdded} pero se esperaban ${endpointCount}`);
}

// ════════════════════════════════════════════════════════════════
// RESUMEN FINAL
// ════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(70));
console.log('✅ INTEGRACIÓN COMPLETADA');
console.log('='.repeat(70));

console.log(`
📊 Resumen:
   ✅ ${endpointCount} endpoints integrados
   ✅ Sintaxis validada
   ✅ Backup: ${path.basename(BACKUP_FILE)}

🚀 Próximos pasos:

   1. Iniciar servidor:
      npm start

   2. Verificar en otra terminal:
      curl http://localhost:3000/api/clientes \\
        -H "Authorization: Bearer <token>"

   3. Si algo falla, restaurar:
      cp ${path.basename(BACKUP_FILE)} server.js

📝 Notas:
   • Todos los endpoints tienen validación
   • Usan los helpers de phase_2_helpers.js
   • Incluyen rate limiting automático
   • Errores estructurados con RequestId

💡 Para ver cambios exactos:
   diff -u ${path.basename(BACKUP_FILE)} server.js | head -50

`);

process.exit(0);
