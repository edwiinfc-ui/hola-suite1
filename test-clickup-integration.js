/**
 * Test Script para ClickUp Integration
 * Ejecutar en la consola del navegador del dashboard
 */

console.log('🧪 Iniciando pruebas de integración ClickUp...\n');

// Test 1: Verificar que el proxy está disponible
async function testProxyEndpoint() {
  console.log('📍 Test 1: Verificar proxy endpoint');
  try {
    const response = await fetch('/api/clickup/tasks');
    const data = await response.json();
    console.log('✅ Proxy disponible');
    console.log(`   - Tareas: ${data.tasks?.length || 0}`);
    console.log(`   - Meta: ${JSON.stringify(data.meta)}`);
    return data;
  } catch (e) {
    console.error('❌ Proxy no disponible:', e.message);
    return null;
  }
}

// Test 2: Verificar estructura de canales
async function testChannelStructure() {
  console.log('\n📍 Test 2: Verificar estructura de canales');
  const data = await testProxyEndpoint();
  if (!data?.tasks?.[0]) {
    console.warn('⚠️ No hay tareas para analizar');
    return;
  }
  
  const sample = data.tasks[0];
  console.log(`   - Primer cliente: ${sample.nombre}`);
  console.log(`   - Tipo de canales: ${typeof sample.canales}`);
  console.log(`   - Estructura canales:`, sample.canales);
  
  if (typeof sample.canales === 'object' && !Array.isArray(sample.canales)) {
    const activeChannels = Object.entries(sample.canales)
      .filter(([k, v]) => v === 'SÍ')
      .map(([k]) => k);
    console.log(`   - Canales activos: ${activeChannels.join(', ') || 'ninguno'}`);
    console.log('✅ Estructura de canales correcta (objeto)');
  }
}

// Test 3: Verificar responsables en tareas
async function testResponsiblesExtraction() {
  console.log('\n📍 Test 3: Verificar responsables en tareas');
  const data = await testProxyEndpoint();
  if (!data?.tasks?.[0]) {
    console.warn('⚠️ No hay tareas para analizar');
    return;
  }
  
  const sample = data.tasks[0];
  const responsables = {
    rKickoff: sample.rKickoff,
    rVer: sample.rVer,
    rCap: sample.rCap,
    rGoLive: sample.rGoLive,
    rAct: sample.rAct,
    consultoresAsignados: sample.consultoresAsignados
  };
  
  console.log(`   - Cliente: ${sample.nombre}`);
  console.log(`   - Responsables:`, responsables);
  
  if (responsables.consultoresAsignados?.length > 0) {
    console.log('✅ Consultores extraídos correctamente');
  } else {
    console.warn('⚠️ No hay consultores asignados en este cliente');
  }
}

// Test 4: Verificar Kanban después de sincronización
async function testKanbanAfterSync() {
  console.log('\n📍 Test 4: Verificar Kanban después de sincronización');
  
  if (!window.APP || !window.APP.data) {
    console.warn('⚠️ APP.data no disponible. Intenta hacer una sincronización primero.');
    return;
  }
  
  const impl = APP.data.filter(c => c.statusType === 'impl');
  const activos = APP.data.filter(c => c.statusType === 'activo');
  const cancelados = APP.data.filter(c => c.statusType === 'cancelado');
  
  console.log(`   - Clientes en impl: ${impl.length}`);
  console.log(`   - Clientes activos: ${activos.length}`);
  console.log(`   - Clientes cancelados: ${cancelados.length}`);
  console.log(`   - Total: ${APP.data.length}`);
  
  // Verificar que se extrajeron canales correctamente
  const withChannels = APP.data.filter(c => c.canales?.length > 0);
  console.log(`   - Con canales: ${withChannels.length}`);
  
  // Verificar que se extrajeron responsables
  const withConsultants = APP.data.filter(c => c.consultoresAsignados?.length > 0);
  console.log(`   - Con consultores asignados: ${withConsultants.length}`);
  
  if (withChannels.length > 0 || withConsultants.length > 0) {
    console.log('✅ Datos de Kanban disponibles');
  }
}

// Test 5: Verificar usuarios/consultores extraídos
async function testConsultantsExtraction() {
  console.log('\n📍 Test 5: Verificar consultores extraídos');
  
  if (!window.APP || !window.APP.data) {
    console.warn('⚠️ APP.data no disponible. Intenta hacer una sincronización primero.');
    return;
  }
  
  const allConsultants = new Set();
  APP.data.forEach(client => {
    if (client.rKickoff) allConsultants.add(client.rKickoff);
    if (client.rVer) allConsultants.add(client.rVer);
    if (client.rCap) allConsultants.add(client.rCap);
    if (client.rGoLive) allConsultants.add(client.rGoLive);
    if (client.rAct) allConsultants.add(client.rAct);
    if (Array.isArray(client.consultoresAsignados)) {
      client.consultoresAsignados.forEach(c => allConsultants.add(c));
    }
  });
  
  console.log(`   - Consultores únicos extraídos: ${allConsultants.size}`);
  console.log(`   - Lista: ${Array.from(allConsultants).join(', ')}`);
  
  if (allConsultants.size > 0) {
    console.log('✅ Consultores extraídos correctamente');
  }
}

// Test 6: Sincronización completa
async function performFullSync() {
  console.log('\n📍 Test 6: Realizar sincronización completa');
  
  if (typeof syncClickUp !== 'function') {
    console.error('❌ syncClickUp no está disponible');
    return;
  }
  
  console.log('   - Iniciando sincronización...');
  try {
    await syncClickUp();
    console.log('✅ Sincronización completada');
  } catch (e) {
    console.error('❌ Error en sincronización:', e.message);
  }
}

// Test 7: Verificar consultores sincronizados
async function testConsultoresSync() {
  console.log('\n📍 Test 7: Verificar consultores sincronizados');
  
  if (!window.APP || !window.APP.data) {
    console.warn('⚠️ APP.data no disponible. Intenta hacer una sincronización primero.');
    return;
  }
  
  const uniqueConsultores = new Set();
  APP.data.forEach(c => {
    if (c.rKickoff) uniqueConsultores.add(c.rKickoff);
    if (c.rVer) uniqueConsultores.add(c.rVer);
    if (c.rCap) uniqueConsultores.add(c.rCap);
    if (c.rGoLive) uniqueConsultores.add(c.rGoLive);
    if (c.rAct) uniqueConsultores.add(c.rAct);
  });
  
  console.log(`   - Consultores únicos encontrados: ${uniqueConsultores.size}`);
  console.log(`   - Lista: ${Array.from(uniqueConsultores).join(', ')}`);
  
  if (uniqueConsultores.size > 3) {
    console.log('✅ Se encontraron múltiples consultores (más de 3)');
  } else if (uniqueConsultores.size > 0) {
    console.warn('⚠️ Solo se encontraron ' + uniqueConsultores.size + ' consultores');
  }
}

// Test 8: Verificar vendedores sincronizados
async function testVendedoresSync() {
  console.log('\n📍 Test 8: Verificar vendedores sincronizados');
  
  if (!window.APP || !window.APP.data) {
    console.warn('⚠️ APP.data no disponible. Intenta hacer una sincronización primero.');
    return;
  }
  
  const uniqueVendedores = new Set();
  APP.data.forEach(c => {
    if (c.rVenta && c.rVenta.trim()) {
      uniqueVendedores.add(c.rVenta);
    } else if (c.vendedor && c.vendedor.trim()) {
      uniqueVendedores.add(c.vendedor);
    }
  });
  
  console.log(`   - Vendedores únicos encontrados: ${uniqueVendedores.size}`);
  console.log(`   - Lista: ${Array.from(uniqueVendedores).join(', ')}`);
  
  if (uniqueVendedores.size > 0) {
    console.log('✅ Vendedores extraídos correctamente');
  } else {
    console.warn('⚠️ No se encontraron vendedores');
  }
}

// Test 9: Verificar usuarios sincronizados desde ClickUp
async function testUsuariosSincronizados() {
  console.log('\n📍 Test 9: Verificar usuarios sincronizados desde ClickUp');
  
  if (!window.APP || !window.APP.users) {
    console.warn('⚠️ APP.users no disponible.');
    return;
  }
  
  const usuariosClickUp = APP.users.filter(u => u.source === 'clickup' || !u.source);
  console.log(`   - Total usuarios en sistema: ${APP.users.length}`);
  console.log(`   - Usuarios desde ClickUp: ${usuariosClickUp.length}`);
  console.log(`   - Usuarios:`, APP.users.map(u => u.name).join(', '));
  
  if (usuariosClickUp.length > 0) {
    console.log('✅ Usuarios sincronizados desde ClickUp');
  }
}

// Ejecutar todos los tests
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════\n');
  console.log('🚀 SUITE DE PRUEBAS: INTEGRACIÓN CLICKUP\n');
  console.log('═══════════════════════════════════════════════════\n');
  
  try {
    await testProxyEndpoint();
    await testChannelStructure();
    await testResponsiblesExtraction();
    await testKanbanAfterSync();
    await testConsultantsExtraction();
    await testConsultoresSync();
    await testVendedoresSync();
    await testUsuariosSincronizados();
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ Tests completados\n');
    console.log('Próximos pasos:');
    console.log('1. Ejecuta performFullSync() para hacer una sincronización completa');
    console.log('2. Revisa la consola para errores o warnings');
    console.log('3. Verifica:');
    console.log('   - Tab Consultores: Deberías ver todos los consultores');
    console.log('   - Tab Vendedores: Deberías ver tabla con vendedores');
    console.log('   - Tab Usuarios: Deberías ver todos los usuarios\n');
    console.log('═══════════════════════════════════════════════════\n');
  } catch (e) {
    console.error('❌ Error general:', e);
  }
}

// Exportar para uso en consola
window.clickupTests = {
  testProxyEndpoint,
  testChannelStructure,
  testResponsiblesExtraction,
  testKanbanAfterSync,
  testConsultantsExtraction,
  performFullSync,
  testConsultoresSync,
  testVendedoresSync,
  testUsuariosSincronizados,
  runAllTests
};

// Ejecutar automáticamente
runAllTests();
