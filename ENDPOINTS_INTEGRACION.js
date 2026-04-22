/**
 * INTEGRACIÓN VY-LEX + CLICKUP + SHEETS
 * 
 * vy-lex es el HUB central que:
 * 1. Conecta con ClickUp (datos de Implementación/Ventas/CS)
 * 2. Expone APIs para traer datos completos
 * 3. Permite que Sheets se integre como complemento
 * 4. Mantiene auditoría de todos los cambios
 * 
 * ENDPOINTS A AGREGAR EN server.js
 */

// ========== ENDPOINT 1: Traer TODO de ClickUp ==========
// GET /api/clickup/full-data
// Devuelve: Todas las tareas con datos completos

app.get('/api/clickup/full-data', auth, async (req, res) => {
  try {
    const tasks = await obtenerTareasClickUp();
    const procesadas = tasks.map(t => procesarTarea(t));
    
    // Construir el dashboard
    const dashboard = buildDashboard(procesadas);
    
    res.json({
      ok: true,
      data: {
        tareas: procesadas,
        summary: dashboard.kpis,
        porPais: dashboard.porPais,
        porConsultor: dashboard.porConsultor,
        alertas: dashboard.alertas,
        canales: dashboard.canales,
        meta: dashboard.meta
      }
    });
  } catch (e) {
    console.error('Error en /api/clickup/full-data:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 2: Traer clientes CON responsables ==========
// GET /api/clientes?pais=&estado=&tipo=
// Devuelve: Clientes con filtros, kanban, responsables

app.get('/api/clientes', auth, async (req, res) => {
  try {
    const { pais, estado, tipo, responsable } = req.query;
    let tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    // Filtrar por parámetros
    let filtradas = procesadas;
    
    if (pais) {
      filtradas = filtradas.filter(t => normalizeText(t.pais).includes(normalizeText(pais)));
    }
    
    if (estado) {
      filtradas = filtradas.filter(t => normalizeText(t.estado).includes(normalizeText(estado)));
    }
    
    if (tipo) {
      filtradas = filtradas.filter(t => t.tipo === tipo);
    }
    
    if (responsable) {
      filtradas = filtradas.filter(t => 
        [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct, t.rVenta]
          .some(r => normalizeText(r || '').includes(normalizeText(responsable)))
      );
    }
    
    // Formatear respuesta
    const clientes = filtradas.map(t => ({
      id: t.id,
      nombre: t.nombre,
      estado: t.estado,
      status: t.status,
      statusType: t.statusType,
      pais: t.pais,
      plan: t.plan,
      tipo: t.tipo,
      dias: t.dImpl,
      url: t.url,
      
      // RESPONSABLES
      responsables: {
        kickoff: t.rKickoff,
        verificacion: t.rVer,
        capacitacion: t.rCap,
        golive: t.rGoLive,
        activacion: t.rAct,
        vendedor: t.rVenta
      },
      
      // CANALES ACTIVOS
      canales: t.canales,
      
      // ALERTAS
      alerta: t.alerta,
      diasSinMovimiento: t.dSinMov,
      
      // FECHAS
      fechaCreacion: t.fInicioFmt,
      fechaActivacion: t.fActivacionFmt,
      fechaCancelacion: t.fCancelacionFmt,
      
      // INFORMACIÓN COMERCIAL
      plan: t.plan,
      vendedor: t.rVenta,
      valorVenta: t.valorVenta
    }));
    
    res.json({
      ok: true,
      total: clientes.length,
      filtros: { pais, estado, tipo, responsable },
      clientes
    });
  } catch (e) {
    console.error('Error en /api/clientes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 3: Obtener detalle de un cliente ==========
// GET /api/clientes/:id
// Devuelve: Info completa + historial + comentarios

app.get('/api/clientes/:id', auth, async (req, res) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    
    if (!tarea) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    const procesada = procesarTarea(tarea);
    
    res.json({
      ok: true,
      cliente: {
        id: procesada.id,
        nombre: procesada.nombre,
        estado: procesada.estado,
        status: procesada.status,
        url: procesada.url,
        
        // DATOS PRINCIPALES
        datos: {
          pais: procesada.pais,
          plan: procesada.plan,
          tipo: procesada.tipo,
          diasImplementacion: procesada.dImpl,
          diasSinMovimiento: procesada.dSinMov,
          alerta: procesada.alerta
        },
        
        // RESPONSABLES
        responsables: {
          kickoff: procesada.rKickoff,
          verificacion: procesada.rVer,
          capacitacion: procesada.rCap,
          golive: procesada.rGoLive,
          activacion: procesada.rAct,
          vendedor: procesada.rVenta
        },
        
        // CANALES ACTIVOS
        canales: procesada.canales,
        
        // INFORMACIÓN TÉCNICA
        tecnica: {
          ip: procesada.ip,
          dominio: procesada.dominio,
          linkHola: procesada.linkHola,
          email: procesada.email,
          telefono: procesada.telefono
        },
        
        // CAPACITACIONES
        capacitacion: {
          cantidad: procesada.cantCap,
          horas: procesada.hCap
        },
        
        // MÓDULOS
        modulos: {
          cancelados: procesada.modCancelados,
          adicionados: procesada.modAdicionados
        },
        
        // FECHAS
        fechas: {
          creacion: procesada.fInicioFmt,
          activacion: procesada.fActivacionFmt,
          cancelacion: procesada.fCancelacionFmt,
          ultimaActualizacion: new Date(procesada.fActualizado).toLocaleDateString('es-ES')
        },
        
        // INFORMACIÓN COMERCIAL
        comercial: {
          plan: procesada.plan,
          vendedor: procesada.rVenta,
          valorVenta: procesada.valorVenta,
          tipoImplementacion: procesada.tipo
        },
        
        // TAGS
        tags: procesada.tags,
        
        // INDICADORES
        indicadores: {
          sinRequisitos: procesada.sinReq,
          pausada: procesada.pausada,
          esperandoCliente: procesada.espCli,
          morosidad: procesada.moro,
          upgradeEnCurso: procesada.upgImpl
        }
      }
    });
  } catch (e) {
    console.error('Error en /api/clientes/:id:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 4: Análisis por sector/tipo/persona ==========
// GET /api/analytics?tipo=sector|implementacion|consultor&filtro=valor

app.get('/api/analytics', auth, async (req, res) => {
  try {
    const { tipo = 'sector', filtro = '' } = req.query;
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    let resultado = {};
    
    if (tipo === 'sector') {
      // Análisis por país
      const porPais = {};
      procesadas.forEach(t => {
        const p = t.pais || 'No definido';
        if (!porPais[p]) {
          porPais[p] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, dias: 0, tags: [] };
        }
        porPais[p].total++;
        if (t.statusType === 'activo') porPais[p].activos++;
        if (t.statusType === 'impl') porPais[p].enProceso++;
        if (t.statusType === 'cancelado') porPais[p].cancelados++;
        porPais[p].dias += t.dImpl;
      });
      
      resultado = Object.entries(porPais).map(([pais, stats]) => ({
        sector: pais,
        total: stats.total,
        completadas: stats.activos,
        enCurso: stats.enProceso,
        canceladas: stats.cancelados,
        promedioDias: stats.total > 0 ? (stats.dias / stats.total).toFixed(1) : 0,
        tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
      }));
    } else if (tipo === 'implementacion') {
      // Análisis por tipo de implementación
      const porTipo = {};
      procesadas.forEach(t => {
        const tp = t.tipo || 'Desconocido';
        if (!porTipo[tp]) {
          porTipo[tp] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, dias: 0 };
        }
        porTipo[tp].total++;
        if (t.statusType === 'activo') porTipo[tp].activos++;
        if (t.statusType === 'impl') porTipo[tp].enProceso++;
        if (t.statusType === 'cancelado') porTipo[tp].cancelados++;
        porTipo[tp].dias += t.dImpl;
      });
      
      resultado = Object.entries(porTipo).map(([tipo, stats]) => ({
        tipo,
        total: stats.total,
        completadas: stats.activos,
        enCurso: stats.enProceso,
        canceladas: stats.cancelados,
        promedioDias: stats.total > 0 ? (stats.dias / stats.total).toFixed(1) : 0,
        tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
      }));
    } else if (tipo === 'consultor') {
      // Análisis por consultor
      const porConsultor = {};
      procesadas.forEach(t => {
        [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct].forEach(consultor => {
          if (!consultor) return;
          if (!porConsultor[consultor]) {
            porConsultor[consultor] = { total: 0, activos: 0, enProceso: 0, cancelados: 0, etapas: 0 };
          }
          porConsultor[consultor].etapas++;
        });
      });
      
      resultado = Object.entries(porConsultor).map(([consultor, stats]) => ({
        consultor,
        etapasAsignadas: stats.etapas,
        clientesÚnicos: stats.total,
        completadas: stats.activos,
        enCurso: stats.enProceso,
        canceladas: stats.cancelados
      }));
    }
    
    res.json({
      ok: true,
      tipo,
      datos: resultado
    });
  } catch (e) {
    console.error('Error en /api/analytics:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 5: Alertas del sistema ==========
// GET /api/alertas?severidad=CRITICA|ALTA|MEDIA|BAJA

app.get('/api/alertas', auth, async (req, res) => {
  try {
    const { severidad = '' } = req.query;
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const alertas = [];
    
    procesadas.forEach(t => {
      // Alerta 1: Sin movimiento > 7 días
      if (t.dSinMov > 7 && t.statusType === 'impl') {
        alertas.push({
          id: t.id,
          tipo: 'SIN_MOVIMIENTO',
          severidad: 'MEDIA',
          cliente: t.nombre,
          mensaje: `Sin movimiento por ${t.dSinMov} días`,
          accion: 'Contactar responsable',
          url: t.url,
          responsable: t.rKickoff || t.rVer || 'N/A'
        });
      }
      
      // Alerta 2: Excedida meta
      if (t.dImpl > 20 && t.statusType === 'impl') {
        alertas.push({
          id: t.id,
          tipo: 'EXCEDIDA_META',
          severidad: 'ALTA',
          cliente: t.nombre,
          mensaje: `Implementación lleva ${t.dImpl} días (meta: 20)`,
          accion: 'Acelerar implementación',
          url: t.url,
          responsable: t.rKickoff || 'N/A'
        });
      }
      
      // Alerta 3: Sin capacitador
      if (!t.rCap && t.estado.includes('capacitacion')) {
        alertas.push({
          id: t.id,
          tipo: 'SIN_RESPONSABLE',
          severidad: 'ALTA',
          cliente: t.nombre,
          mensaje: 'Sin capacitador asignado',
          accion: 'Asignar capacitador inmediatamente',
          url: t.url,
          responsable: 'Sin asignar'
        });
      }
      
      // Alerta 4: Cliente en espera (esperando cliente)
      if (t.espCli === 'SÍ') {
        alertas.push({
          id: t.id,
          tipo: 'ESPERANDO_CLIENTE',
          severidad: 'BAJA',
          cliente: t.nombre,
          mensaje: 'Cliente esperando respuesta',
          accion: 'Dar seguimiento',
          url: t.url,
          responsable: t.rVenta || 'N/A'
        });
      }
      
      // Alerta 5: Morosidad
      if (t.moro === 'SÍ') {
        alertas.push({
          id: t.id,
          tipo: 'MOROSIDAD',
          severidad: 'CRÍTICA',
          cliente: t.nombre,
          mensaje: 'Cliente con problemas de pago',
          accion: 'Contactar área administrativa',
          url: t.url,
          responsable: t.rVenta || 'N/A'
        });
      }
    });
    
    // Filtrar por severidad si es especificada
    let resultado = alertas;
    if (severidad) {
      resultado = alertas.filter(a => a.severidad === severidad);
    }
    
    // Ordenar por severidad
    const orden = { 'CRÍTICA': 1, 'ALTA': 2, 'MEDIA': 3, 'BAJA': 4 };
    resultado.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    
    res.json({
      ok: true,
      total: resultado.length,
      criticas: resultado.filter(a => a.severidad === 'CRÍTICA').length,
      altas: resultado.filter(a => a.severidad === 'ALTA').length,
      medias: resultado.filter(a => a.severidad === 'MEDIA').length,
      bajas: resultado.filter(a => a.severidad === 'BAJA').length,
      alertas: resultado
    });
  } catch (e) {
    console.error('Error en /api/alertas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 6: Integración Sheets como COMPLEMENTO ==========
// Sheets es SOLO complemento (notas, detalles, info adicional)
// La información madre viene de ClickUp

const COMPLEMENTOS_FILE = path.join(STATIC_ROOT, 'data', 'complementos.json');

function leerComplementos() {
  try {
    ensureDataDir();
    if (!fs.existsSync(COMPLEMENTOS_FILE)) return {};
    return JSON.parse(fs.readFileSync(COMPLEMENTOS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function guardarComplementos(data) {
  ensureDataDir();
  fs.writeFileSync(COMPLEMENTOS_FILE, JSON.stringify(data, null, 2));
}

// GET /api/complementos/:clienteId - Obtener información adicional (desde Sheets o local)
app.get('/api/complementos/:clienteId', auth, async (req, res) => {
  try {
    const complementos = leerComplementos();
    const dato = complementos[req.params.clienteId] || {};
    
    // Si existe en sheets, traerlo también
    const globalConfig = readGlobalConfig();
    let sheetData = null;
    
    if (globalConfig.complementosSheetId && globalConfig.complementosSheetName) {
      try {
        const googleSheetsApiKey = String(globalConfig.googleSheetsApiKey || '').trim();
        if (googleSheetsApiKey) {
          const rows = await fetchGoogleSheetValues(
            globalConfig.complementosSheetId,
            globalConfig.complementosSheetName,
            googleSheetsApiKey
          );
          // Buscar cliente en sheet
          sheetData = rows.find(r => r.clienteId === req.params.clienteId || r.id === req.params.clienteId);
        }
      } catch (e) {
        console.warn('No se pudo traer datos de Sheets:', e.message);
      }
    }
    
    res.json({ 
      ok: true, 
      complemento: {
        ...dato,
        desdeSheets: sheetData || null
      } 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/complementos/:clienteId - Guardar información adicional (complemento local)
app.post('/api/complementos/:clienteId', auth, (req, res) => {
  try {
    const complementos = leerComplementos();
    const { 
      notas, 
      contactoAdicional, 
      informacionExtra,
      estadoLocal,
      prioridadLocal,
      tags
    } = req.body;
    
    complementos[req.params.clienteId] = {
      clienteId: req.params.clienteId,
      notas: notas || '',
      contactoAdicional: contactoAdicional || '',
      informacionExtra: informacionExtra || {},
      estadoLocal: estadoLocal || '',
      prioridadLocal: prioridadLocal || '',
      tags: Array.isArray(tags) ? tags : [],
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: req.user.username
    };
    
    guardarComplementos(complementos);
    
    writeLog(req.user, 'COMPLEMENTO_ACTUALIZADO', {
      clienteId: req.params.clienteId,
      usuario: req.user.username,
      campos: Object.keys(req.body)
    });
    
    res.json({ ok: true, complemento: complementos[req.params.clienteId] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/clientes/:id/enriquecido - Cliente con datos ClickUp + complementos Sheets/local
app.get('/api/clientes/:id/enriquecido', auth, async (req, res) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    
    if (!tarea) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    const procesada = procesarTarea(tarea);
    
    // Obtener complementos
    const complementos = leerComplementos();
    const complemento = complementos[req.params.id] || {};
    
    // Buscar en Sheets
    let datosSheets = null;
    const globalConfig = readGlobalConfig();
    if (globalConfig.complementosSheetId && globalConfig.complementosSheetName) {
      try {
        const googleSheetsApiKey = String(globalConfig.googleSheetsApiKey || '').trim();
        if (googleSheetsApiKey) {
          const rows = await fetchGoogleSheetValues(
            globalConfig.complementosSheetId,
            globalConfig.complementosSheetName,
            googleSheetsApiKey
          );
          datosSheets = rows.find(r => r.clienteId === req.params.id || r.id === req.params.id);
        }
      } catch (e) {
        console.warn('Error leyendo Sheets:', e.message);
      }
    }
    
    res.json({
      ok: true,
      cliente: {
        // DATOS PRIMARIOS DE CLICKUP
        clickup: {
          id: procesada.id,
          nombre: procesada.nombre,
          estado: procesada.estado,
          status: procesada.status,
          url: procesada.url,
          pais: procesada.pais,
          plan: procesada.plan,
          tipo: procesada.tipo,
          diasImplementacion: procesada.dImpl,
          diasSinMovimiento: procesada.dSinMov,
          alerta: procesada.alerta,
          
          responsables: {
            kickoff: procesada.rKickoff,
            verificacion: procesada.rVer,
            capacitacion: procesada.rCap,
            golive: procesada.rGoLive,
            activacion: procesada.rAct,
            vendedor: procesada.rVenta
          },
          
          canales: procesada.canales,
          
          tecnica: {
            ip: procesada.ip,
            dominio: procesada.dominio,
            linkHola: procesada.linkHola,
            email: procesada.email,
            telefono: procesada.telefono
          },
          
          fechas: {
            creacion: procesada.fInicioFmt,
            activacion: procesada.fActivacionFmt,
            cancelacion: procesada.fCancelacionFmt
          },
          
          comercial: {
            plan: procesada.plan,
            vendedor: procesada.rVenta,
            valorVenta: procesada.valorVenta,
            tipoImplementacion: procesada.tipo
          },
          
          tags: procesada.tags
        },
        
        // COMPLEMENTOS LOCALES (desde API)
        complementosLocales: complemento,
        
        // COMPLEMENTOS DESDE SHEETS
        complementosSheets: datosSheets || null
      }
    });
  } catch (e) {
    console.error('Error en /api/clientes/:id/enriquecido:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========== ENDPOINT 7: Auditoria de cambios ==========
// GET /api/auditoria?desde=fecha&hasta=fecha&usuario=&tipo=

app.get('/api/auditoria', auth, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    let logs = [];
    try {
      if (fs.existsSync(LOGS_FILE)) {
        logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
      }
    } catch (e) {
      logs = [];
    }
    
    // Filtros opcionales
    const { desde, hasta, usuario, tipo } = req.query;
    
    let filtrados = logs;
    
    if (desde) {
      const desdeMs = new Date(desde).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() >= desdeMs);
    }
    
    if (hasta) {
      const hastaMs = new Date(hasta).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() <= hastaMs);
    }
    
    if (usuario) {
      filtrados = filtrados.filter(l => l.user === usuario);
    }
    
    if (tipo) {
      filtrados = filtrados.filter(l => l.action === tipo);
    }
    
    res.json({
      ok: true,
      total: filtrados.length,
      logs: filtrados.slice(0, 500)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== EXPORTAR ENDPOINTS PARA AGREGAR A server.js ==========
// Copiar/pegar todo esto al final de server.js, ANTES del app.listen()
// Los endpoints estarán disponibles en:
// - GET /api/clickup/full-data
// - GET /api/clientes
// - GET /api/clientes/:id
// - GET /api/analytics
// - GET /api/alertas
// - GET /api/complementos/:clienteId
// - POST /api/complementos/:clienteId
// - GET /api/auditoria
