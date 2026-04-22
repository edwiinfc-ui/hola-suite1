/**
 * SYNC_MEJORADO.gs
 * 
 * Sistema de sincronización mejorado - Mismo comportamiento que clickupMapper.js
 * pero en Google Apps Script, con alertas inteligentes
 * 
 * USO:
 * 1. Copiar este código a Apps Script
 * 2. Ejecutar: traerDatosClickUpMejorado()
 * 3. Se crean hojas con datos + análisis + alertas
 */

// ========== CONFIGURACIÓN ==========
const CONFIG = {
  API_KEY: 'tu_clickup_api_key_aqui', // Reemplazar con tu API key
  LIST_ID: 'tu_clickup_list_id_aqui', // ID de la lista ClickUp
  
  DIAS_META: {
    kickoff: 3,
    verificacion: 2,
    instalacion: 5,
    capacitacion: 7,
    activacion: 2,
    total: 20
  },
  
  PAISES: {
    'méxico': 'México',
    'mexico': 'México',
    'mx': 'México',
    'colombia': 'Colombia',
    'co': 'Colombia',
    'perú': 'Perú',
    'peru': 'Perú',
    'pe': 'Perú'
  },
  
  DIAS_ALERTA: 7
};

// ========== FUNCIONES AUXILIARES ==========

function normTexto(txt) {
  return String(txt || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extraerValorCampo(campo, tipo = 'text') {
  if (!campo || (!campo.value && campo.value !== 0)) return tipo === 'number' ? 0 : '';
  
  try {
    if (tipo === 'number') return parseFloat(campo.value) || 0;
    if (tipo === 'date') return campo.value ? parseInt(campo.value, 10) : null;
    if (tipo === 'dropdown' && campo.type_config?.options) {
      const opt = campo.type_config.options.find(o => 
        o.orderindex === parseInt(campo.value, 10) || o.id === campo.value
      );
      return opt ? (opt.name || opt.label || '') : '';
    }
    return String(campo.value).trim();
  } catch (e) {
    return tipo === 'number' ? 0 : '';
  }
}

function obtenerPais(customFields) {
  const campo = (customFields || []).find(cf => 
    normTexto(cf.name) === 'país' || normTexto(cf.name) === 'pais'
  );
  if (!campo) return '';
  
  const valor = extraerValorCampo(campo, 'text');
  if (!valor) return '';
  
  // Buscar en mapeo
  const normalizado = normTexto(valor);
  for (const [key, mapped] of Object.entries(CONFIG.PAISES)) {
    if (normalizado.includes(key)) return mapped;
  }
  return valor;
}

function obtenerPlan(customFields) {
  const campo = (customFields || []).find(cf => normTexto(cf.name) === 'plan');
  if (!campo) return '';
  return extraerValorCampo(campo, 'text');
}

function obtenerResponsable(customFields, tipo = 'verificacion') {
  // Buscar por tipo de responsable (kickoff, verificacion, etc)
  const patrones = {
    'kickoff': ['kickoff', 'kick off', 'inicio'],
    'verificacion': ['verif', 'verificacion', 'verification'],
    'capacitacion': ['capac', 'training', 'capacitador'],
    'golive': ['golive', 'go live', 'activación'],
    'activacion': ['activ', 'activation'],
    'facturacion': ['factur', 'billing'],
    'comercial': ['comercial', 'sales', 'vendedor']
  };
  
  const patronesBuscados = patrones[tipo] || [];
  
  for (const cf of (customFields || [])) {
    const nombreNorm = normTexto(cf.name);
    if (patronesBuscados.some(p => nombreNorm.includes(p))) {
      return extraerValorCampo(cf, 'text');
    }
  }
  return '';
}

function formatearFecha(timestamp) {
  if (!timestamp) return '';
  const d = new Date(parseInt(timestamp) * 1000);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function diasTranscurridos(inicio, fin) {
  if (!inicio || !fin) return 0;
  const ms = fin - inicio;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ========== OBTENER DATOS DE CLICKUP ==========

function obtenerTareasClickUp() {
  const url = `https://api.clickup.com/api/v2/list/${CONFIG.LIST_ID}/task?include_archived=false`;
  
  const opciones = {
    method: 'get',
    headers: {
      'Authorization': CONFIG.API_KEY,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  try {
    const respuesta = UrlFetchApp.fetch(url, opciones);
    const json = JSON.parse(respuesta.getContentText());
    
    if (respuesta.getResponseCode() === 200) {
      return json.tasks || [];
    } else {
      Logger.log('Error ClickUp:', json);
      return [];
    }
  } catch (e) {
    Logger.log('Error al obtener tareas:', e);
    return [];
  }
}

function procesarTareas(tareasRaw) {
  const procesadas = [];
  
  for (const tarea of tareasRaw) {
    const status = tarea.status?.status || 'N/A';
    const pais = obtenerPais(tarea.custom_fields || []);
    const plan = obtenerPlan(tarea.custom_fields || []);
    
    const rKickoff = obtenerResponsable(tarea.custom_fields || [], 'kickoff');
    const rVerificacion = obtenerResponsable(tarea.custom_fields || [], 'verificacion');
    const rCapacitacion = obtenerResponsable(tarea.custom_fields || [], 'capacitacion');
    const rGoLive = obtenerResponsable(tarea.custom_fields || [], 'golive');
    
    const fCreacion = formatearFecha(tarea.date_created);
    const fActualizacion = formatearFecha(tarea.date_updated);
    const fCierre = tarea.date_closed ? formatearFecha(tarea.date_closed) : '';
    
    const dias = tarea.date_closed ? 
      diasTranscurridos(parseInt(tarea.date_created), parseInt(tarea.date_closed) * 1000) : 
      diasTranscurridos(parseInt(tarea.date_created), Date.now());
    
    procesadas.push({
      id: tarea.id,
      nombre: tarea.name,
      estado: status,
      pais: pais,
      plan: plan,
      responsableKickoff: rKickoff,
      responsableVerificacion: rVerificacion,
      responsableCapacitacion: rCapacitacion,
      responsableGoLive: rGoLive,
      fechaCreacion: fCreacion,
      fechaActualizacion: fActualizacion,
      fechaCierre: fCierre,
      diasTranscurridos: dias,
      tags: (tarea.tags || []).map(t => t.name).join(', '),
      prioridad: tarea.priority?.priority || 'normal',
      url: tarea.url
    });
  }
  
  return procesadas;
}

// ========== GENERAR ALERTAS ==========

function generarAlertas(tareas) {
  const alertas = [];
  
  for (const t of tareas) {
    // Alerta 1: Sin movimiento > 7 días
    if (t.fechaActualizacion) {
      const diasSinMovimiento = diasTranscurridos(
        new Date(t.fechaActualizacion.split('/').reverse().join('-')).getTime(),
        Date.now()
      );
      
      if (diasSinMovimiento > CONFIG.DIAS_ALERTA) {
        alertas.push({
          tipo: 'SIN_MOVIMIENTO',
          severidad: 'MEDIA',
          tarea: t.nombre,
          mensaje: `Sin movimiento por ${diasSinMovimiento} días`,
          accion: 'Contactar responsable',
          url: t.url
        });
      }
    }
    
    // Alerta 2: Excedida meta (> 20 días)
    if (t.diasTranscurridos > CONFIG.DIAS_META.total && t.estado !== 'closed') {
      alertas.push({
        tipo: 'EXCEDIDA_META',
        severidad: 'ALTA',
        tarea: t.nombre,
        mensaje: `Lleva ${t.diasTranscurridos} días (meta: ${CONFIG.DIAS_META.total})`,
        accion: 'Acelerar implementación',
        url: t.url
      });
    }
    
    // Alerta 3: Sin responsable en capacitación
    if (t.estado.includes('capacitacion') && !t.responsableCapacitacion) {
      alertas.push({
        tipo: 'SIN_RESPONSABLE',
        severidad: 'ALTA',
        tarea: t.nombre,
        mensaje: 'Sin capacitador asignado',
        accion: 'Asignar capacitador inmediatamente',
        url: t.url
      });
    }
    
    // Alerta 4: Cliente en peligro (muchas alertas)
    const conteoAlertas = alertas.filter(a => a.tarea === t.nombre).length;
    if (conteoAlertas >= 2) {
      alertas.push({
        tipo: 'CLIENTE_EN_RIESGO',
        severidad: 'CRÍTICA',
        tarea: t.nombre,
        mensaje: `Multiple issues detected: ${conteoAlertas} alertas`,
        accion: 'Revisar implementación completa',
        url: t.url
      });
    }
  }
  
  return alertas;
}

// ========== CREAR HOJAS EN SHEETS ==========

function traerDatosClickUpMejorado() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('📡 Trayendo tareas de ClickUp...');
  const tareasRaw = obtenerTareasClickUp();
  
  if (tareasRaw.length === 0) {
    SpreadsheetApp.getUi().alert('❌ No se encontraron tareas. Verifica tu API Key y List ID.');
    return;
  }
  
  Logger.log(`✅ ${tareasRaw.length} tareas encontradas`);
  
  // Procesar tareas
  const tareas = procesarTareas(tareasRaw);
  
  // Crear hoja de datos
  crearHojaDatos(ss, tareas);
  
  // Crear hoja de alertas
  const alertas = generarAlertas(tareas);
  crearHojaAlertas(ss, alertas);
  
  // Crear hoja de análisis
  crearHojaAnalisis(ss, tareas);
  
  Logger.log('✅ Sistema sincronizado correctamente');
  SpreadsheetApp.getUi().alert('✅ Datos de ClickUp sincronizados\n\nRevisa las hojas:\n• Datos\n• Alertas\n• Análisis');
}

function crearHojaDatos(ss, tareas) {
  let hoja = ss.getSheetByName('Datos');
  if (hoja) ss.deleteSheet(hoja);
  
  hoja = ss.insertSheet('Datos');
  
  // Headers
  const headers = [
    'Cliente',
    'Estado',
    'País',
    'Plan',
    'R.Kickoff',
    'R.Verificación',
    'R.Capacitación',
    'R.GoLive',
    'Creada',
    'Actualizada',
    'Cierre',
    'Días',
    'Tags',
    'Prioridad'
  ];
  
  hoja.appendRow(headers);
  
  // Datos
  for (const t of tareas) {
    hoja.appendRow([
      t.nombre,
      t.estado,
      t.pais,
      t.plan,
      t.responsableKickoff,
      t.responsableVerificacion,
      t.responsableCapacitacion,
      t.responsableGoLive,
      t.fechaCreacion,
      t.fechaActualizacion,
      t.fechaCierre,
      t.diasTranscurridos,
      t.tags,
      t.prioridad
    ]);
  }
  
  // Formato
  const rango = hoja.getRange(1, 1, 1, headers.length);
  rango.setBackground('#1f77d4').setFontColor('white').setFontWeight('bold');
  
  hoja.autoResizeColumns(1, headers.length);
}

function crearHojaAlertas(ss, alertas) {
  let hoja = ss.getSheetByName('Alertas');
  if (hoja) ss.deleteSheet(hoja);
  
  hoja = ss.insertSheet('Alertas');
  
  // Ordenar por severidad
  const orden = { 'CRÍTICA': 1, 'ALTA': 2, 'MEDIA': 3, 'BAJA': 4 };
  alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  
  // Headers
  hoja.appendRow(['Tipo', 'Severidad', 'Cliente', 'Problema', 'Acción']);
  
  // Datos
  for (const a of alertas) {
    hoja.appendRow([
      a.tipo,
      a.severidad,
      a.tarea,
      a.mensaje,
      a.accion
    ]);
  }
  
  // Formato
  const rango = hoja.getRange(1, 1, 1, 5);
  rango.setBackground('#e74c3c').setFontColor('white').setFontWeight('bold');
  
  // Color por severidad
  for (let i = 2; i <= alertas.length + 1; i++) {
    const severidad = hoja.getRange(i, 2).getValue();
    let color = '#f8f9fa';
    if (severidad === 'CRÍTICA') color = '#e74c3c';
    else if (severidad === 'ALTA') color = '#f39c12';
    else if (severidad === 'MEDIA') color = '#f1c40f';
    
    hoja.getRange(i, 1, 1, 5).setBackground(color);
  }
  
  hoja.autoResizeColumns(1, 5);
}

function crearHojaAnalisis(ss, tareas) {
  let hoja = ss.getSheetByName('Análisis');
  if (hoja) ss.deleteSheet(hoja);
  
  hoja = ss.insertSheet('Análisis');
  
  // Por país
  const porPais = {};
  for (const t of tareas) {
    if (!porPais[t.pais]) {
      porPais[t.pais] = { total: 0, completadas: 0, dias: 0 };
    }
    porPais[t.pais].total++;
    if (t.estado === 'closed') porPais[t.pais].completadas++;
    porPais[t.pais].dias += t.diasTranscurridos;
  }
  
  // Resumen por país
  hoja.appendRow(['PAÍS', 'Total', 'Completadas', 'Promedio Días', '% Éxito']);
  
  for (const [pais, datos] of Object.entries(porPais)) {
    const porcentaje = datos.total > 0 ? (datos.completadas / datos.total * 100).toFixed(0) : 0;
    const promedio = datos.total > 0 ? (datos.dias / datos.total).toFixed(1) : 0;
    
    hoja.appendRow([
      pais || 'N/A',
      datos.total,
      datos.completadas,
      promedio,
      `${porcentaje}%`
    ]);
  }
  
  // Formato
  const rangoHeader = hoja.getRange(1, 1, 1, 5);
  rangoHeader.setBackground('#27ae60').setFontColor('white').setFontWeight('bold');
  
  hoja.autoResizeColumns(1, 5);
}

// ========== MENU ==========

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Sync Mejorado')
    .addItem('📡 Traer Datos de ClickUp', 'traerDatosClickUpMejorado')
    .addToUi();
}
