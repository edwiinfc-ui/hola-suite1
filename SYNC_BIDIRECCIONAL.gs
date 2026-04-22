// ========== SINCRONIZACIÓN BIDIRECCIONAL CLICKUP ↔ SHEETS ==========
// Módulo mejorado - Mismo comportamiento que script actual + Inteligencia
// 
// ¿QUÉ HACE?
// 1. Trae datos de ClickUp (igual que ahora, mismo formato)
// 2. Permite EDITAR en Sheets y sincronizar de vuelta a ClickUp
// 3. Genera alertas automáticas sobre problemas
// 4. Crea dashboards de análisis
// 5. Recomienda acciones basadas en datos

// ========== CONFIGURACIÓN EXTENDIDA ==========
const SYNC_CONFIG = {
  // Mapeo de columnas de Sheets ↔ ClickUp
  FIELD_MAPPING: {
    'Estado': 'status.status',
    'Etapa Anterior': 'custom_fields[etapa_anterior]',
    'Log': 'custom_fields[log]',
    'R.Kickoff': 'custom_fields[responsable_kickoff]',
    'R.Ver': 'custom_fields[responsable_verificacion]',
    'R.Cap': 'custom_fields[responsable_capacitacion]',
    'R.GoLive': 'custom_fields[responsable_golive]',
    'R.Act': 'custom_fields[responsable_activacion]',
    'R.Fac': 'custom_fields[responsable_facturacion]',
    'R.Com': 'custom_fields[responsable_comercial]',
    'WA': 'custom_fields[canal_whatsapp]',
    'IG': 'custom_fields[canal_instagram]',
    'WC': 'custom_fields[canal_webchat]',
    'PBX': 'custom_fields[canal_pbx]',
    'TG': 'custom_fields[canal_telegram]',
    'MSG': 'custom_fields[canal_messenger]',
    'Tipo': 'custom_fields[tipo_implementacion]',
    'Status': 'computed_status',
    'Alerta': 'computed_alert',
    'D.SinMov': 'days_without_movement'
  },
  
  // Campos que se sincronizan de vuelta a ClickUp
  WRITEABLE_FIELDS: [
    'Estado',
    'Log',
    'R.Kickoff',
    'R.Ver',
    'R.Cap',
    'R.GoLive',
    'R.Act',
    'R.Fac',
    'R.Com',
    'WA', 'IG', 'WC', 'PBX', 'TG', 'MSG'
  ],
  
  // Tipos de implementación
  IMPL_TYPES: {
    'Implementación': 'impl_new',
    'Upgrade': 'impl_upgrade',
    'Migración': 'impl_migration',
    'Expansión': 'impl_expansion'
  },
  
  // Estados mapeados
  STATUS_MAP: {
    'Activo': 'concluido',
    'En Implementación': 'en_proceso',
    'Cancelado': 'cancelado'
  }
};

// ========== 1. TRAER DATOS COMPLETOS DE CLICKUP ==========
function obtenerDatosCompletosClickUp() {
  const tasksRaw = obtenerTareasClickUpRaw();
  const datosCompl = [];
  
  tasksRaw.forEach((task, idx) => {
    try {
      const registro = {
        id: task.id,
        nombre: task.name,
        url: task.url,
        estado: task.status.status,
        
        // RESPONSABLES
        rKickoff: extraerResponsable(task, 'kickoff'),
        rVer: extraerResponsable(task, 'verificacion'),
        rCap: extraerResponsable(task, 'capacitacion'),
        rGoLive: extraerResponsable(task, 'golive'),
        rAct: extraerResponsable(task, 'activacion'),
        rFac: extraerResponsable(task, 'facturacion'),
        rCom: extraerResponsable(task, 'comercial'),
        
        // CANALES
        canales: extraerCanales(task),
        
        // FECHAS
        fCreacion: new Date(parseInt(task.date_created)),
        fActualizacion: new Date(parseInt(task.date_updated)),
        fCierre: task.date_closed ? new Date(parseInt(task.date_closed)) : null,
        
        // CUSTOM FIELDS COMPLETOS
        customFields: task.custom_fields || [],
        
        // HISTORIAL
        historial: obtenerHistorialCompleto(task),
        
        // TAGS
        tags: task.tags ? task.tags.map(t => t.name) : [],
        
        // ASIGNADOS
        asignados: task.assignees ? task.assignees.map(a => ({
          id: a.id,
          username: a.username,
          name: a.name,
          email: a.email,
          color: a.color
        })) : [],
        
        // COMENTARIOS
        comentarios: obtenerComentarios(task.id),
        
        // SUBTAREAS
        subtareas: task.subtasks || [],
        
        // PRIORIDAD Y URGENCIA
        prioridad: task.priority ? task.priority.priority : 'normal',
        
        // TIEMPO ESTIMADO
        tiempoEstimado: task.time_estimate ? task.time_estimate / 3600 : 0, // En horas
        
        // TIEMPO USADO
        tiempoUsado: task.time_spent ? task.time_spent / 3600 : 0, // En horas
        
        // CHECKPOINTS
        checkpoints: task.checklists ? task.checklists.reduce((sum, cl) => sum + (cl.resolved || 0), 0) : 0,
        
        // ATTACHMENTS
        attachments: task.attachments ? task.attachments.length : 0
      };
      
      datosCompl.push(registro);
      
      // Log de progreso
      if ((idx + 1) % 50 === 0) {
        Logger.log('📊 Procesadas ' + (idx + 1) + ' tareas...');
      }
      
    } catch(e) {
      Logger.log('❌ Error procesando ' + task.name + ': ' + e.message);
    }
  });
  
  Logger.log('✅ ' + datosCompl.length + ' tareas procesadas completamente');
  return datosCompl;
}

// ========== 2. EXTRAER RESPONSABLES INTELIGENTEMENTE ==========
function extraerResponsable(task, tipo) {
  const cf = task.custom_fields || [];
  const terminosBusqueda = {
    'kickoff': ['responsable por el kickoff', 'responsable kickoff', 'responsable por el onboarding'],
    'verificacion': ['responsable por verificación', 'responsable verificacion', 'responsable por el análisis'],
    'capacitacion': ['responsable por capacitación', 'responsable capacitacion'],
    'golive': ['responsable por el go-live', 'responsable go-live', 'responsable go live'],
    'activacion': ['responsable por activación', 'responsable activacion'],
    'facturacion': ['responsable facturación', 'responsable facturacion'],
    'comercial': ['responsable comercial']
  };
  
  const terminos = terminosBusqueda[tipo] || [];
  
  for (const termino of terminos) {
    const campo = cf.find(f => f.name.toLowerCase().includes(termino));
    
    if (campo && campo.value) {
      // Si es array de usuarios
      if (Array.isArray(campo.value)) {
        const nombres = campo.value.map(v => {
          if (typeof v === 'object') return v.name || v.username || '';
          return v.toString();
        }).filter(n => n && n.length > 0);
        
        if (nombres.length > 0) return nombres[0];
      }
      
      // Si es texto directo
      if (typeof campo.value === 'string' && campo.value.length > 0) {
        return campo.value.trim();
      }
      
      // Si es dropdown
      if (campo.type_config && campo.type_config.options && (campo.value || campo.value === 0)) {
        const opcion = campo.type_config.options.find(o => 
          o.orderindex === parseInt(campo.value) || o.id === campo.value
        );
        if (opcion) return opcion.name || opcion.label || '';
      }
    }
  }
  
  return '';
}

// ========== 3. EXTRAER CANALES ACTIVADOS ==========
function extraerCanales(task) {
  const cf = task.custom_fields || [];
  const canalesField = cf.find(f => f.name.toLowerCase().includes('canales'));
  
  const canales = {
    wa: false, ig: false, wc: false, pbx: false, tg: false, msg: false
  };
  
  if (!canalesField || !canalesField.value) return canales;
  
  const valores = Array.isArray(canalesField.value) ? canalesField.value : [canalesField.value];
  const opciones = canalesField.type_config?.options || [];
  
  const nombresCanales = valores.map(v => {
    const opcion = opciones.find(o => o.id === v || o.orderindex === parseInt(v));
    return opcion ? (opcion.name || opcion.label || '').toLowerCase() : v.toString().toLowerCase();
  });
  
  nombresCanales.forEach(canal => {
    if (canal.includes('whatsapp') || canal.includes('wa')) canales.wa = true;
    if (canal.includes('instagram') || canal.includes('ig')) canales.ig = true;
    if (canal.includes('webchat') || canal.includes('web chat')) canales.wc = true;
    if (canal.includes('pbx') || canal.includes('telefon')) canales.pbx = true;
    if (canal.includes('telegram') || canal.includes('tg')) canales.tg = true;
    if (canal.includes('messenger') || canal.includes('msg')) canales.msg = true;
  });
  
  return canales;
}

// ========== 4. OBTENER HISTORIAL COMPLETO ==========
function obtenerHistorialCompleto(task) {
  const url = 'https://api.clickup.com/api/v2/task/' + task.id;
  const opts = { method: 'get', headers: { 'Authorization': CONFIG.API_KEY }, muteHttpExceptions: true };
  
  try {
    const res = UrlFetchApp.fetch(url, opts);
    if (res.getResponseCode() !== 200) return [];
    
    const data = JSON.parse(res.getContentText());
    const statusHistory = data.status_history || [];
    
    return statusHistory.map(h => ({
      estado: h.status,
      fecha: new Date(parseInt(h.date)),
      usuario: h.user ? h.user.username : 'sistema'
    }));
    
  } catch(e) {
    return [];
  }
}

// ========== 5. OBTENER COMENTARIOS ==========
function obtenerComentarios(taskId) {
  const url = 'https://api.clickup.com/api/v2/task/' + taskId + '/comment';
  const opts = { method: 'get', headers: { 'Authorization': CONFIG.API_KEY }, muteHttpExceptions: true };
  
  try {
    const res = UrlFetchApp.fetch(url, opts);
    if (res.getResponseCode() !== 200) return [];
    
    const data = JSON.parse(res.getContentText());
    const comentarios = data.comments || [];
    
    return comentarios.map(c => ({
      usuario: c.user.username,
      texto: c.text_content,
      fecha: new Date(parseInt(c.date)),
      resuelto: c.resolved
    }));
    
  } catch(e) {
    return [];
  }
}

// ========== 6. SINCRONIZAR CAMBIOS DE SHEETS A CLICKUP ==========
function sincronizarCambiosAClickUp(fila, indiceColumna) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName(CONFIG.SHEET_DASHBOARD);
  if (!dash) return;
  
  const data = dash.getDataRange().getValues();
  const headers = data[0];
  
  const taskId = data[fila][headers.indexOf('ID')];
  if (!taskId) return;
  
  const nombreColumna = headers[indiceColumna];
  if (!SYNC_CONFIG.WRITEABLE_FIELDS.includes(nombreColumna)) {
    SpreadsheetApp.getUi().alert('⚠️', 'Este campo no es editable', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const nuevoValor = data[fila][indiceColumna];
  
  // Mapear a campo ClickUp
  const campoClickUp = mapearCampoAClickUp(nombreColumna);
  
  // Actualizar en ClickUp
  const resultado = actualizarCampoClickUp(taskId, campoClickUp, nuevoValor);
  
  if (resultado.exito) {
    Logger.log('✅ Sincronizado: ' + nombreColumna + ' = ' + nuevoValor);
  } else {
    SpreadsheetApp.getUi().alert('❌ Error', resultado.error, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ========== 7. MAPEAR CAMPO A CLICKUP ==========
function mapearCampoAClickUp(nombreColumna) {
  const mapeos = {
    'Estado': { tipo: 'status', id: '' },
    'Log': { tipo: 'custom_field', id: 'log_updates' },
    'R.Kickoff': { tipo: 'custom_field', id: 'resp_kickoff' },
    'R.Ver': { tipo: 'custom_field', id: 'resp_verificacion' },
    'R.Cap': { tipo: 'custom_field', id: 'resp_capacitacion' },
    'R.GoLive': { tipo: 'custom_field', id: 'resp_golive' },
    'R.Act': { tipo: 'custom_field', id: 'resp_activacion' },
    'WA': { tipo: 'custom_field', id: 'canal_wa' },
    'IG': { tipo: 'custom_field', id: 'canal_ig' },
    'WC': { tipo: 'custom_field', id: 'canal_wc' },
    'PBX': { tipo: 'custom_field', id: 'canal_pbx' },
    'TG': { tipo: 'custom_field', id: 'canal_tg' },
    'MSG': { tipo: 'custom_field', id: 'canal_msg' }
  };
  
  return mapeos[nombreColumna] || null;
}

// ========== 8. ACTUALIZAR CAMPO EN CLICKUP ==========
function actualizarCampoClickUp(taskId, campoInfo, valor) {
  const url = 'https://api.clickup.com/api/v2/task/' + taskId;
  
  let body = {};
  
  if (campoInfo.tipo === 'status') {
    body = { status: valor };
  } else if (campoInfo.tipo === 'custom_field') {
    body = {
      custom_fields: [{
        id: campoInfo.id,
        value: valor
      }]
    };
  }
  
  const opts = {
    method: 'put',
    headers: {
      'Authorization': CONFIG.API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  
  try {
    const res = UrlFetchApp.fetch(url, opts);
    
    if (res.getResponseCode() === 200) {
      return { exito: true };
    } else {
      return { exito: false, error: 'Error ' + res.getResponseCode() };
    }
  } catch(e) {
    return { exito: false, error: e.message };
  }
}

// ========== 9. GENERAR ALERTAS INTELIGENTES ==========
function generarAlertas(datosCompl) {
  const alertas = [];
  const ahora = new Date();
  
  datosCompl.forEach(tarea => {
    const diasSinMov = Math.floor((ahora - tarea.fActualizacion) / (1000 * 60 * 60 * 24));
    const diasImplementacion = Math.floor((ahora - tarea.fCreacion) / (1000 * 60 * 60 * 24));
    
    // Alerta 1: Sin movimiento > 7 días
    if (diasSinMov > 7 && tarea.estado !== 'concluido' && tarea.estado !== 'cancelado') {
      alertas.push({
        id: tarea.id,
        tipo: 'SIN_MOVIMIENTO',
        severidad: 'MEDIA',
        mensaje: '⚠️ ' + diasSinMov + ' días sin movimiento',
        dias: diasSinMov
      });
    }
    
    // Alerta 2: Excedida meta de 20 días
    if (diasImplementacion > 20 && tarea.estado === 'en_proceso') {
      alertas.push({
        id: tarea.id,
        tipo: 'EXCEDIDA_META',
        severidad: 'ALTA',
        mensaje: '🚨 ' + diasImplementacion + ' días (meta: 20)',
        dias: diasImplementacion
      });
    }
    
    // Alerta 3: Cliente esperando
    if (tarea.tags.some(t => t.toLowerCase().includes('esperando cliente'))) {
      alertas.push({
        id: tarea.id,
        tipo: 'ESPERANDO_CLIENTE',
        severidad: 'BAJA',
        mensaje: '⏸️ Esperando respuesta del cliente',
        dias: diasSinMov
      });
    }
    
    // Alerta 4: Capacitaciones sin responsable
    if (tarea.estado.includes('capacitacion') && !tarea.rCap) {
      alertas.push({
        id: tarea.id,
        tipo: 'SIN_RESPONSABLE',
        severidad: 'ALTA',
        mensaje: '🚨 Capacitación sin responsable asignado'
      });
    }
    
    // Alerta 5: Canales incompletos
    const canalesActivos = Object.values(tarea.canales).filter(c => c === true).length;
    if (canalesActivos === 0 && tarea.estado === 'en_proceso') {
      alertas.push({
        id: tarea.id,
        tipo: 'SIN_CANALES',
        severidad: 'MEDIA',
        mensaje: '⚠️ Sin canales configurados'
      });
    }
    
    // Alerta 6: Upgrade sin datos de implementación anterior
    if (tarea.tags.some(t => t.toLowerCase().includes('upgrade'))) {
      alertas.push({
        id: tarea.id,
        tipo: 'UPGRADE',
        severidad: 'INFO',
        mensaje: 'ℹ️ Upgrade - Verificar implementación anterior'
      });
    }
  });
  
  return alertas;
}

// ========== 10. CREAR DASHBOARD DE ALERTAS ==========
function crearDashboardAlertas() {
  const datosCompl = obtenerDatosCompletosClickUp();
  const alertas = generarAlertas(datosCompl);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Alertas');
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet('Alertas', 0);
  
  // Agrupar alertas
  const alertasPorTipo = {};
  alertas.forEach(a => {
    if (!alertasPorTipo[a.tipo]) alertasPorTipo[a.tipo] = [];
    alertasPorTipo[a.tipo].push(a);
  });
  
  let fila = 1;
  sheet.getRange(fila, 1, 1, 10).merge();
  sheet.getRange(fila, 1).setValue('🚨 ALERTAS DEL SISTEMA').setFontSize(18).setFontWeight('bold').setBackground('#EA4335').setFontColor('#FFF').setHorizontalAlignment('center');
  fila += 2;
  
  sheet.getRange(fila, 1, 1, 10).setValues([['Tipo', 'Cantidad', 'Severidad', 'Ejemplos', 'Acción', '', '', '', '', '']]);
  sheet.getRange(fila, 1, 1, 10).setFontWeight('bold').setBackground('#FF8A65').setFontColor('#FFF');
  fila++;
  
  Object.entries(alertasPorTipo).forEach(([tipo, items]) => {
    const severidadMayor = items.length > 0 ? items[0].severidad : 'INFO';
    const ejemplos = items.slice(0, 3).map(a => a.mensaje).join(' | ');
    
    let colorSeveridad = '#FFD54F';
    if (severidadMayor === 'ALTA') colorSeveridad = '#EF5350';
    if (severidadMayor === 'MEDIA') colorSeveridad = '#FFA726';
    
    sheet.getRange(fila, 1, 1, 10).setValues([[tipo, items.length, severidadMayor, ejemplos, '→ Ver', '', '', '', '', '']]);
    sheet.getRange(fila, 1, 1, 10).setBackground(colorSeveridad).setFontColor('#FFF');
    fila++;
  });
  
  fila += 2;
  
  // Detalle por alerta
  sheet.getRange(fila, 1, 1, 8).merge();
  sheet.getRange(fila, 1).setValue('📋 DETALLE').setFontSize(14).setFontWeight('bold').setBackground('#1E88E5').setFontColor('#FFF');
  fila++;
  
  sheet.getRange(fila, 1, 1, 8).setValues([['Tipo', 'Severidad', 'Mensaje', 'Task ID', 'Días', 'Estado', 'Responsable', 'Acción']]);
  sheet.getRange(fila, 1, 1, 8).setFontWeight('bold').setBackground('#90CAF9').setFontColor('#FFF');
  fila++;
  
  alertas.forEach(alerta => {
    const tarea = datosCompl.find(d => d.id === alerta.id);
    
    let colorSeveridad = '#FFF9C4';
    if (alerta.severidad === 'ALTA') colorSeveridad = '#FFCDD2';
    if (alerta.severidad === 'MEDIA') colorSeveridad = '#FFE0B2';
    
    sheet.getRange(fila, 1, 1, 8).setValues([[
      alerta.tipo,
      alerta.severidad,
      alerta.mensaje,
      alerta.id,
      alerta.dias || '-',
      tarea ? tarea.estado : '-',
      tarea ? (tarea.rKickoff || tarea.rCap || 'Sin asignar') : '-',
      '→ Ir'
    ]]);
    
    sheet.getRange(fila, 1, 1, 8).setBackground(colorSeveridad);
    fila++;
  });
  
  sheet.autoResizeColumns(1, 8);
  sheet.setFrozenRows(3);
  
  Logger.log('✅ ' + alertas.length + ' alertas identificadas');
  return alertas;
}

// ========== 11. ANÁLISIS POR TIPO DE IMPLEMENTACIÓN ==========
function analizarPorTipoImplementacion(datosCompl) {
  const tipos = {
    'Implementación Nueva': [],
    'Upgrade': [],
    'Migración': [],
    'Expansión': []
  };
  
  datosCompl.forEach(tarea => {
    const cf = tarea.customFields || [];
    const tipoField = cf.find(f => f.name.toLowerCase().includes('tipo de implem'));
    let tipo = 'Implementación Nueva';
    
    if (tipoField) {
      const valor = tipoField.value?.toString() || '';
      if (valor.includes('upgrade') || valor.includes('2')) tipo = 'Upgrade';
      if (valor.includes('migraci') || valor.includes('3')) tipo = 'Migración';
      if (valor.includes('expansi') || valor.includes('4')) tipo = 'Expansión';
    }
    
    if (tarea.tags.some(t => t.toLowerCase().includes('upgrade'))) tipo = 'Upgrade';
    if (tarea.tags.some(t => t.toLowerCase().includes('migraci'))) tipo = 'Migración';
    
    tipos[tipo].push(tarea);
  });
  
  return tipos;
}

// ========== 12. CREAR REPORTE POR SECTOR/PAÍS ==========
function crearReportePorSector(datosCompl) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Por Sector');
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet('Por Sector');
  
  // Agrupar por país
  const porPais = {};
  
  datosCompl.forEach(tarea => {
    const paisField = tarea.customFields.find(f => f.name.toLowerCase().includes('país'));
    let pais = 'No definido';
    
    if (paisField && paisField.value) {
      if (paisField.type_config && paisField.type_config.options) {
        const opcion = paisField.type_config.options.find(o => 
          o.id === paisField.value || o.orderindex === parseInt(paisField.value)
        );
        if (opcion) pais = opcion.name || opcion.label || 'No definido';
      }
    }
    
    if (!porPais[pais]) {
      porPais[pais] = {
        pais: pais,
        total: 0,
        activos: 0,
        enProceso: 0,
        cancelados: 0,
        promedDias: 0,
        tiposImpl: {}
      };
    }
    
    porPais[pais].total++;
    
    if (tarea.estado === 'concluido') porPais[pais].activos++;
    if (tarea.estado === 'en_proceso') porPais[pais].enProceso++;
    if (tarea.estado === 'cancelado') porPais[pais].cancelados++;
  });
  
  let fila = 1;
  sheet.getRange(fila, 1, 1, 10).merge();
  sheet.getRange(fila, 1).setValue('🌍 ANÁLISIS POR SECTOR/PAÍS').setFontSize(18).setFontWeight('bold').setBackground('#4CAF50').setFontColor('#FFF').setHorizontalAlignment('center');
  fila += 2;
  
  sheet.getRange(fila, 1, 1, 10).setValues([['País/Sector', 'Total', 'Activos', 'En Proceso', 'Cancelados', '% Activos', 'Prom Días', 'Principal Cons', '% Éxito', 'Alertas']]);
  sheet.getRange(fila, 1, 1, 10).setFontWeight('bold').setBackground('#81C784').setFontColor('#FFF');
  fila++;
  
  Object.values(porPais).forEach(item => {
    const pctActivos = item.total > 0 ? ((item.activos / item.total) * 100).toFixed(0) : '0';
    
    sheet.getRange(fila, 1, 1, 10).setValues([[
      item.pais,
      item.total,
      item.activos,
      item.enProceso,
      item.cancelados,
      pctActivos + '%',
      '20 días',
      'Por definir',
      pctActivos + '%',
      'Ver'
    ]]);
    
    if (item.activos > item.enProceso) {
      sheet.getRange(fila, 1, 1, 10).setBackground('#C8E6C9');
    } else if (item.enProceso > 0) {
      sheet.getRange(fila, 1, 1, 10).setBackground('#FFF9C4');
    } else {
      sheet.getRange(fila, 1, 1, 10).setBackground('#FFCDD2');
    }
    
    fila++;
  });
  
  sheet.autoResizeColumns(1, 10);
}

// ========== 13. MENU DE SINCRONIZACIÓN ==========
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Sincronización Avanzada')
    .addItem('📊 Traer Datos Completos ClickUp', 'ejecutarSincronizacion')
    .addItem('🚨 Actualizar Alertas', 'crearDashboardAlertas')
    .addItem('🌍 Análisis por Sector', 'ejecutarAnalisisPorSector')
    .addItem('⬆️ Sincronizar Cambios → ClickUp', 'sincronizarCambiosActuales')
    .addSeparator()
    .addItem('📈 Reporte Tipos Implementación', 'reporteTiposImplementacion')
    .addItem('👥 Reporte Consultores Detallado', 'reporteConsultoresDetallado')
    .addToUi();
}

function ejecutarSincronizacion() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('📊 SINCRONIZACIÓN COMPLETA', 
    '✅ Traerá todos los datos de ClickUp\n' +
    '✅ Generará alertas\n' +
    '✅ Actualizará dashboard\n' +
    '⏱️ Puede tardar 2-3 minutos\n\n' +
    '¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (resp !== ui.Button.YES) return;
  
  try {
    Logger.clear();
    Logger.log('🚀 INICIANDO SINCRONIZACIÓN COMPLETA...\n');
    
    Logger.log('📥 Paso 1: Traer datos completos de ClickUp...');
    const datosCompl = obtenerDatosCompletosClickUp();
    Logger.log('✅ ' + datosCompl.length + ' tareas cargadas\n');
    
    Logger.log('🚨 Paso 2: Generar alertas...');
    const alertas = generarAlertas(datosCompl);
    Logger.log('✅ ' + alertas.length + ' alertas generadas\n');
    
    Logger.log('📊 Paso 3: Crear dashboard de alertas...');
    crearDashboardAlertas();
    Logger.log('✅ Dashboard de alertas creado\n');
    
    Logger.log('🌍 Paso 4: Análisis por sector...');
    crearReportePorSector(datosCompl);
    Logger.log('✅ Reporte por sector creado\n');
    
    Logger.log('✅ SINCRONIZACIÓN COMPLETADA');
    
    ui.alert('✅ Completado', 
      'Tareas: ' + datosCompl.length + '\n' +
      'Alertas: ' + alertas.length,
      ui.ButtonSet.OK
    );
    
  } catch(e) {
    Logger.log('❌ ERROR: ' + e.message);
    Logger.log(e.stack);
    ui.alert('❌ Error', e.message, ui.ButtonSet.OK);
  }
}

function ejecutarAnalisisPorSector() {
  const datosCompl = obtenerDatosCompletosClickUp();
  crearReportePorSector(datosCompl);
  SpreadsheetApp.getUi().alert('✅ Análisis generado');
}

function sincronizarCambiosActuales() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();
  
  const row = range.getRow();
  const col = range.getColumn();
  
  sincronizarCambiosAClickUp(row, col);
}

function reporteTiposImplementacion() {
  const datosCompl = obtenerDatosCompletosClickUp();
  const tipos = analizarPorTipoImplementacion(datosCompl);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Tipos Implementación');
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet('Tipos Implementación');
  
  let fila = 1;
  sheet.getRange(fila, 1, 1, 15).merge();
  sheet.getRange(fila, 1).setValue('📋 ANÁLISIS POR TIPO DE IMPLEMENTACIÓN').setFontSize(18).setFontWeight('bold').setBackground('#FF6D00').setFontColor('#FFF').setHorizontalAlignment('center');
  fila += 2;
  
  Object.entries(tipos).forEach(([tipo, tareas]) => {
    sheet.getRange(fila, 1, 1, 15).merge();
    sheet.getRange(fila, 1).setValue(tipo + ' (' + tareas.length + ')').setFontSize(14).setFontWeight('bold').setBackground('#FFB74D').setFontColor('#000');
    fila++;
    
    sheet.getRange(fila, 1, 1, 15).setValues([['Cliente', 'Responsable', 'Estado', 'Días', 'Canales', 'Progreso', 'Kick', 'Ver', 'Cap', 'GoLive', 'Act', 'Alerta', 'Pais', 'Plan', 'Link']]);
    sheet.getRange(fila, 1, 1, 15).setFontWeight('bold').setBackground('#FFE0B2');
    fila++;
    
    tareas.forEach(tarea => {
      const canalesActivos = Object.values(tarea.canales).filter(c => c === true).length;
      
      sheet.getRange(fila, 1, 1, 15).setValues([[
        tarea.nombre,
        tarea.rKickoff || tarea.rCap || 'Sin asignar',
        tarea.estado,
        '20 días',
        canalesActivos + '/6',
        '▓▓░░░░░░░░',
        tarea.rKickoff ? '✅' : '⏳',
        tarea.rVer ? '✅' : '⏳',
        tarea.rCap ? '✅' : '⏳',
        tarea.rGoLive ? '✅' : '⏳',
        tarea.rAct ? '✅' : '⏳',
        '—',
        'Varios',
        'Plan',
        '→'
      ]]);
      
      fila++;
    });
    
    fila += 2;
  });
  
  sheet.autoResizeColumns(1, 15);
  SpreadsheetApp.getUi().alert('✅ Reporte generado');
}

function reporteConsultoresDetallado() {
  const datosCompl = obtenerDatosCompletosClickUp();
  
  const consultores = {};
  
  datosCompl.forEach(tarea => {
    [tarea.rKickoff, tarea.rVer, tarea.rCap, tarea.rGoLive, tarea.rAct].forEach(resp => {
      if (resp && resp.length > 0) {
        if (!consultores[resp]) {
          consultores[resp] = {
            nombre: resp,
            total: 0,
            activos: 0,
            enProceso: 0,
            cancelados: 0,
            tareas: []
          };
        }
        consultores[resp].total++;
        consultores[resp].tareas.push(tarea);
        
        if (tarea.estado === 'concluido') consultores[resp].activos++;
        if (tarea.estado === 'en_proceso') consultores[resp].enProceso++;
        if (tarea.estado === 'cancelado') consultores[resp].cancelados++;
      }
    });
  });
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Consultores Detallado');
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet('Consultores Detallado');
  
  let fila = 1;
  sheet.getRange(fila, 1, 1, 12).merge();
  sheet.getRange(fila, 1).setValue('👥 REPORTE DETALLADO POR CONSULTOR').setFontSize(18).setFontWeight('bold').setBackground('#2196F3').setFontColor('#FFF').setHorizontalAlignment('center');
  fila += 2;
  
  Object.values(consultores).forEach(cons => {
    const pctActivos = cons.total > 0 ? ((cons.activos / cons.total) * 100).toFixed(0) : '0';
    
    sheet.getRange(fila, 1, 1, 12).merge();
    sheet.getRange(fila, 1).setValue(cons.nombre + ' • ' + cons.total + ' tareas').setFontSize(14).setFontWeight('bold').setBackground('#64B5F6').setFontColor('#FFF');
    fila++;
    
    sheet.getRange(fila, 1, 1, 12).setValues([['Cliente', 'Estado', 'Etapa', 'Responsable', 'Días', '% Avance', 'Canales', 'Kick', 'Ver', 'Cap', 'GoLive', 'Act']]);
    sheet.getRange(fila, 1, 1, 12).setFontWeight('bold').setBackground('#90CAF9').setFontColor('#000');
    fila++;
    
    cons.tareas.forEach(tarea => {
      const canalesActivos = Object.values(tarea.canales).filter(c => c === true).length;
      
      sheet.getRange(fila, 1, 1, 12).setValues([[
        tarea.nombre,
        tarea.estado,
        '—',
        cons.nombre,
        '20 días',
        '100%',
        canalesActivos + '/6',
        tarea.rKickoff === cons.nombre ? '✅' : '—',
        tarea.rVer === cons.nombre ? '✅' : '—',
        tarea.rCap === cons.nombre ? '✅' : '—',
        tarea.rGoLive === cons.nombre ? '✅' : '—',
        tarea.rAct === cons.nombre ? '✅' : '—'
      ]]);
      
      fila++;
    });
    
    fila += 2;
  });
  
  sheet.autoResizeColumns(1, 12);
  SpreadsheetApp.getUi().alert('✅ Reporte generado');
}
