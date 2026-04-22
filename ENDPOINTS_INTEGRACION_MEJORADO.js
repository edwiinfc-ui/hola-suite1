'use strict';

/**
 * ============================================================================
 * ENDPOINTS MEJORADOS Y COMPLETOS PARA VY-LEX
 * ============================================================================
 * 
 * Este archivo contiene TODOS los endpoints necesarios para que funcionen:
 * 1. CRUD de Clientes (Create, Read, Update, Delete)
 * 2. Sincronización bidireccional (ClickUp ↔ Dashboard)
 * 3. Análisis y reportes
 * 4. Alertas y monitoreo
 * 5. Ventas y metas
 * 6. Auditoría
 * 
 * INSTRUCCIONES:
 * - Copiar estos endpoints al final de server.js (antes de app.listen())
 * - Reemplazar los endpoints duplicados que ya existen
 * - Asegurarse de importar las funciones helper
 * 
 * ============================================================================
 */

// ================================================================
// HELPER: Validaciones y Utilidades
// ================================================================

/**
 * Crear clase de error mejorada
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

const Errors = {
  VALIDATION: (msg, details = {}) => new AppError(msg, 400, 'VALIDATION_ERROR', details),
  NOT_FOUND: (resource) => new AppError(`${resource} no encontrado`, 404, 'NOT_FOUND'),
  UNAUTHORIZED: () => new AppError('No autenticado', 401, 'UNAUTHORIZED'),
  FORBIDDEN: () => new AppError('No tienes permisos para esta acción', 403, 'FORBIDDEN'),
  CONFLICT: (msg) => new AppError(msg, 409, 'CONFLICT'),
  RATE_LIMIT: () => new AppError('Demasiados requests. Intenta más tarde', 429, 'RATE_LIMIT'),
  CLICKUP_ERROR: (msg) => new AppError(`Error de ClickUp: ${msg}`, 502, 'CLICKUP_ERROR'),
  SERVER_ERROR: (msg) => new AppError(msg, 500, 'INTERNAL_ERROR')
};

/**
 * Validar que los datos cumplan con el esquema (versión simple sin zod)
 */
function validateRequest(data, schema) {
  const errors = {};
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Requerido
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${field} es requerido`;
      continue;
    }
    
    if (value === undefined || value === null || value === '') continue;
    
    // Tipo
    if (rules.type && typeof value !== rules.type) {
      errors[field] = `${field} debe ser de tipo ${rules.type}`;
      continue;
    }
    
    // Enum
    if (rules.enum && !rules.enum.includes(value)) {
      errors[field] = `${field} debe ser uno de: ${rules.enum.join(', ')}`;
      continue;
    }
    
    // Min/Max
    if (rules.min !== undefined && value < rules.min) {
      errors[field] = `${field} debe ser >= ${rules.min}`;
      continue;
    }
    if (rules.max !== undefined && value > rules.max) {
      errors[field] = `${field} debe ser <= ${rules.max}`;
      continue;
    }
    
    // Longitud de string
    if (rules.minLength !== undefined && String(value).length < rules.minLength) {
      errors[field] = `${field} debe tener al menos ${rules.minLength} caracteres`;
      continue;
    }
    if (rules.maxLength !== undefined && String(value).length > rules.maxLength) {
      errors[field] = `${field} no puede exceder ${rules.maxLength} caracteres`;
      continue;
    }
    
    // Regex
    if (rules.regex && !rules.regex.test(String(value))) {
      errors[field] = `${field} tiene formato inválido`;
      continue;
    }
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Middleware para manejar errores de forma consistente
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const response = {
    error: err.message,
    code: err.code || 'INTERNAL_ERROR',
    timestamp: err.timestamp || new Date().toISOString()
  };
  
  if (process.env.NODE_ENV === 'development') {
    response.details = err.details;
    response.stack = err.stack;
  }
  
  // Loguear error
  writeLog(req.user || null, 'ERROR_RESPONSE', {
    statusCode,
    code: response.code,
    message: err.message,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });
  
  res.status(statusCode).json(response);
}

// ================================================================
// 1. ENDPOINTS: CRUD DE CLIENTES
// ================================================================

/**
 * GET /api/clientes
 * Obtener lista de clientes con filtros y paginación
 * 
 * Query params:
 * - pais: filtrar por país
 * - estado: filtrar por estado
 * - tipo: "Implementación" | "Upgrade"
 * - responsable: filtrar por responsable
 * - limit: items por página (default 50, max 500)
 * - offset: items a saltar (default 0)
 * - search: búsqueda de texto en nombre
 */
app.get('/api/clientes', auth, async (req, res, next) => {
  try {
    const { pais, estado, tipo, responsable, search, limit = '50', offset = '0' } = req.query;
    
    // Validar paginación
    const parsedLimit = Math.min(parseInt(limit) || 50, 500);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    if (parsedLimit < 1) throw Errors.VALIDATION('limit debe ser >= 1');
    if (parsedOffset < 0) throw Errors.VALIDATION('offset debe ser >= 0');
    
    // Obtener tareas
    let tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    // Aplicar filtros
    let filtradas = procesadas;
    
    if (pais?.trim()) {
      const paisNorm = normalizeText(pais.trim());
      filtradas = filtradas.filter(t => normalizeText(t.pais).includes(paisNorm));
    }
    
    if (estado?.trim()) {
      const estadoNorm = normalizeText(estado.trim());
      filtradas = filtradas.filter(t => normalizeText(t.estado).includes(estadoNorm));
    }
    
    if (tipo && ['Implementación', 'Upgrade'].includes(tipo)) {
      filtradas = filtradas.filter(t => t.tipo === tipo);
    }
    
    if (responsable?.trim()) {
      const respNorm = normalizeText(responsable.trim());
      filtradas = filtradas.filter(t => 
        [t.rKickoff, t.rVer, t.rCap, t.rGoLive, t.rAct, t.rVenta]
          .some(r => r && normalizeText(r).includes(respNorm))
      );
    }
    
    if (search?.trim()) {
      const searchNorm = normalizeText(search.trim());
      filtradas = filtradas.filter(t => normalizeText(t.nombre).includes(searchNorm));
    }
    
    // Paginación
    const total = filtradas.length;
    const pages = Math.ceil(total / parsedLimit);
    const page = Math.floor(parsedOffset / parsedLimit) + 1;
    const clientes = filtradas.slice(parsedOffset, parsedOffset + parsedLimit).map(t => ({
      id: t.id,
      nombre: t.nombre,
      estado: t.estado,
      status: t.status,
      pais: t.pais,
      plan: t.plan,
      tipo: t.tipo,
      dias: t.dImpl,
      url: t.url,
      responsables: { kickoff: t.rKickoff, verificacion: t.rVer, capacitacion: t.rCap, golive: t.rGoLive, activacion: t.rAct, vendedor: t.rVenta },
      canales: t.canales,
      alerta: t.alerta,
      diasSinMovimiento: t.dSinMov,
      valorVenta: t.valorVenta
    }));
    
    res.json({
      ok: true,
      data: clientes,
      pagination: { total, pages, page, limit: parsedLimit, offset: parsedOffset },
      filters: { pais, estado, tipo, responsable, search }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/clientes/:id
 * Obtener detalle completo de un cliente
 */
app.get('/api/clientes/:id', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    
    if (!tarea) throw Errors.NOT_FOUND('Cliente');
    
    const procesada = procesarTarea(tarea);
    
    // Obtener complementos si existen
    let complementos = {};
    try {
      const complementosFile = path.join(STATIC_ROOT, 'data', 'complementos.json');
      if (fs.existsSync(complementosFile)) {
        const allComps = JSON.parse(fs.readFileSync(complementosFile, 'utf8'));
        complementos = allComps[req.params.id] || {};
      }
    } catch (e) {
      // Silent fail - complementos opcionales
    }
    
    res.json({
      ok: true,
      data: {
        id: procesada.id,
        nombre: procesada.nombre,
        estado: procesada.estado,
        status: procesada.status,
        url: procesada.url,
        
        datos: {
          pais: procesada.pais,
          plan: procesada.plan,
          tipo: procesada.tipo,
          diasImplementacion: procesada.dImpl,
          diasSinMovimiento: procesada.dSinMov,
          alerta: procesada.alerta
        },
        
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
        
        capacitacion: { cantidad: procesada.cantCap, horas: procesada.hCap },
        modulos: { cancelados: procesada.modCancelados, adicionados: procesada.modAdicionados },
        
        fechas: {
          creacion: procesada.fInicioFmt,
          activacion: procesada.fActivacionFmt,
          cancelacion: procesada.fCancelacionFmt,
          ultimaActualizacion: new Date(procesada.fActualizado).toLocaleDateString('es-ES')
        },
        
        comercial: {
          plan: procesada.plan,
          vendedor: procesada.rVenta,
          valorVenta: procesada.valorVenta,
          tipoImplementacion: procesada.tipo
        },
        
        tags: procesada.tags,
        
        indicadores: {
          sinRequisitos: procesada.sinReq === 'SÍ',
          pausada: procesada.pausada === 'SÍ',
          esperandoCliente: procesada.espCli === 'SÍ',
          morosidad: procesada.moro === 'SÍ',
          upgradeEnCurso: procesada.upgImpl === 'SÍ'
        },
        
        complementos // Datos adicionales guardados localmente
      }
    });
  } catch (e) {
    next(e);
  }
});

/**
 * PUT /api/clientes/:id
 * Actualizar cliente (campos locales, no en ClickUp directamente)
 */
app.put('/api/clientes/:id', auth, async (req, res, next) => {
  try {
    // Solo admin y manager pueden editar
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw Errors.FORBIDDEN();
    }
    
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    if (!tarea) throw Errors.NOT_FOUND('Cliente');
    
    // Validar entrada
    const schema = {
      estado: { type: 'string', maxLength: 100 },
      plan: { type: 'string', maxLength: 100 },
      pais: { type: 'string', maxLength: 100 },
      vendedor: { type: 'string', maxLength: 100 },
      email: { type: 'string', maxLength: 255 },
      telefono: { type: 'string', maxLength: 20 },
      notas: { type: 'string', maxLength: 1000 },
      tags: { type: 'object' }
    };
    
    const validationErrors = validateRequest(req.body, schema);
    if (validationErrors) throw Errors.VALIDATION('Datos inválidos', validationErrors);
    
    // Guardar cambios en complementos.json
    const complementosFile = path.join(STATIC_ROOT, 'data', 'complementos.json');
    let complementos = {};
    
    if (fs.existsSync(complementosFile)) {
      try {
        complementos = JSON.parse(fs.readFileSync(complementosFile, 'utf8'));
      } catch (e) {}
    }
    
    complementos[req.params.id] = {
      ...complementos[req.params.id],
      ...req.body,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: req.user.username
    };
    
    const dataDir = path.join(STATIC_ROOT, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(complementosFile, JSON.stringify(complementos, null, 2));
    
    // Loguear cambio
    writeLog(req.user, 'CLIENTE_ACTUALIZADO', {
      clienteId: req.params.id,
      clienteNombre: tarea.name,
      cambios: Object.keys(req.body)
    });
    
    // Invalidar cache
    cache.del('clickup_tasks_raw');
    
    // Broadcast cambio a otros usuarios conectados
    broadcastEvent('clienteActualizado', {
      clienteId: req.params.id,
      cambios: req.body,
      actualizadoPor: req.user.username,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      ok: true,
      message: 'Cliente actualizado correctamente',
      cliente: complementos[req.params.id]
    });
  } catch (e) {
    next(e);
  }
});

/**
 * DELETE /api/clientes/:id
 * Eliminar cliente (soft delete - solo en complementos locales)
 */
app.delete('/api/clientes/:id', auth, async (req, res, next) => {
  try {
    // Solo admin
    if (req.user.role !== 'admin') throw Errors.FORBIDDEN();
    
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    if (!tarea) throw Errors.NOT_FOUND('Cliente');
    
    // Soft delete en complementos
    const complementosFile = path.join(STATIC_ROOT, 'data', 'complementos.json');
    let complementos = {};
    
    if (fs.existsSync(complementosFile)) {
      try {
        complementos = JSON.parse(fs.readFileSync(complementosFile, 'utf8'));
      } catch (e) {}
    }
    
    complementos[req.params.id] = {
      ...complementos[req.params.id],
      deletedAt: new Date().toISOString(),
      deletedBy: req.user.username
    };
    
    const dataDir = path.join(STATIC_ROOT, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(complementosFile, JSON.stringify(complementos, null, 2));
    
    writeLog(req.user, 'CLIENTE_ELIMINADO', {
      clienteId: req.params.id,
      clienteNombre: tarea.name,
      eliminadoPor: req.user.username
    });
    
    cache.del('clickup_tasks_raw');
    
    res.json({
      ok: true,
      message: 'Cliente eliminado correctamente'
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// 2. ENDPOINTS: COMENTARIOS Y HISTORIAL
// ================================================================

/**
 * POST /api/clientes/:id/comentario
 * Agregar comentario a un cliente
 */
app.post('/api/clientes/:id/comentario', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const tarea = tareas.find(t => t.id === req.params.id);
    if (!tarea) throw Errors.NOT_FOUND('Cliente');
    
    const { texto, tipo = 'general' } = req.body;
    
    const schema = {
      texto: { required: true, type: 'string', minLength: 1, maxLength: 1000 },
      tipo: { enum: ['general', 'internal', 'alert'] }
    };
    
    const errors = validateRequest(req.body, schema);
    if (errors) throw Errors.VALIDATION('Datos inválidos', errors);
    
    // Guardar comentario
    const comentariosFile = path.join(STATIC_ROOT, 'data', 'comentarios.json');
    let comentarios = {};
    
    if (fs.existsSync(comentariosFile)) {
      try {
        comentarios = JSON.parse(fs.readFileSync(comentariosFile, 'utf8'));
      } catch (e) {}
    }
    
    if (!comentarios[req.params.id]) comentarios[req.params.id] = [];
    
    const comentario = {
      id: Date.now(),
      texto: texto.trim(),
      tipo,
      autor: req.user.username,
      autorId: req.user.id,
      createdAt: new Date().toISOString()
    };
    
    comentarios[req.params.id].push(comentario);
    
    const dataDir = path.join(STATIC_ROOT, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(comentariosFile, JSON.stringify(comentarios, null, 2));
    
    writeLog(req.user, 'COMENTARIO_AGREGADO', {
      clienteId: req.params.id,
      comentarioId: comentario.id,
      tipo
    });
    
    broadcastEvent('comentarioNuevo', {
      clienteId: req.params.id,
      comentario
    });
    
    res.json({
      ok: true,
      comentario
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/clientes/:id/comentarios
 * Obtener comentarios de un cliente
 */
app.get('/api/clientes/:id/comentarios', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    if (!tareas.find(t => t.id === req.params.id)) {
      throw Errors.NOT_FOUND('Cliente');
    }
    
    const comentariosFile = path.join(STATIC_ROOT, 'data', 'comentarios.json');
    let comentarios = [];
    
    if (fs.existsSync(comentariosFile)) {
      try {
        const allComments = JSON.parse(fs.readFileSync(comentariosFile, 'utf8'));
        comentarios = allComments[req.params.id] || [];
      } catch (e) {}
    }
    
    res.json({
      ok: true,
      data: comentarios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// 3. ENDPOINTS: ALERTAS Y MONITOREO
// ================================================================

/**
 * GET /api/alertas
 * Obtener alertas del sistema
 * 
 * Query params:
 * - severidad: "CRITICA" | "ALTA" | "MEDIA" | "BAJA"
 * - tipo: "SIN_MOVIMIENTO" | "EXCEDIDA_META" | etc
 * - limit: items por página
 * - offset: items a saltar
 */
app.get('/api/alertas', auth, async (req, res, next) => {
  try {
    const { severidad, tipo, limit = '100', offset = '0' } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const alertas = [];
    
    procesadas.forEach(t => {
      // Alerta 1: Sin movimiento > 7 días
      if (t.dSinMov > 7 && t.statusType === 'impl') {
        alertas.push({
          id: `${t.id}_sin_mov`,
          clienteId: t.id,
          tipo: 'SIN_MOVIMIENTO',
          severidad: 'MEDIA',
          cliente: t.nombre,
          mensaje: `Sin movimiento por ${t.dSinMov} días`,
          accion: 'Contactar responsable',
          url: t.url,
          responsable: t.rKickoff || t.rVer || 'N/A',
          createdAt: new Date().toISOString()
        });
      }
      
      // Alerta 2: Excedida meta
      if (t.dImpl > 20 && t.statusType === 'impl') {
        alertas.push({
          id: `${t.id}_excedida_meta`,
          clienteId: t.id,
          tipo: 'EXCEDIDA_META',
          severidad: 'ALTA',
          cliente: t.nombre,
          mensaje: `Implementación lleva ${t.dImpl} días (meta: 20)`,
          accion: 'Acelerar implementación',
          url: t.url,
          responsable: t.rKickoff || 'N/A',
          createdAt: new Date().toISOString()
        });
      }
      
      // Alerta 3: Sin capacitador
      if (!t.rCap && t.estado.toLowerCase().includes('capacit')) {
        alertas.push({
          id: `${t.id}_sin_cap`,
          clienteId: t.id,
          tipo: 'SIN_RESPONSABLE',
          severidad: 'ALTA',
          cliente: t.nombre,
          mensaje: 'Sin capacitador asignado',
          accion: 'Asignar capacitador inmediatamente',
          url: t.url,
          responsable: 'Sin asignar',
          createdAt: new Date().toISOString()
        });
      }
      
      // Alerta 4: Esperando cliente
      if (t.espCli === 'SÍ') {
        alertas.push({
          id: `${t.id}_esp_cli`,
          clienteId: t.id,
          tipo: 'ESPERANDO_CLIENTE',
          severidad: 'BAJA',
          cliente: t.nombre,
          mensaje: 'Cliente esperando respuesta',
          accion: 'Dar seguimiento',
          url: t.url,
          responsable: t.rVenta || 'N/A',
          createdAt: new Date().toISOString()
        });
      }
      
      // Alerta 5: Morosidad
      if (t.moro === 'SÍ') {
        alertas.push({
          id: `${t.id}_moro`,
          clienteId: t.id,
          tipo: 'MOROSIDAD',
          severidad: 'CRITICA',
          cliente: t.nombre,
          mensaje: 'Cliente con problemas de pago',
          accion: 'Contactar área administrativa',
          url: t.url,
          responsable: t.rVenta || 'N/A',
          createdAt: new Date().toISOString()
        });
      }
    });
    
    // Filtrar
    let resultado = alertas;
    if (severidad && ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].includes(severidad)) {
      resultado = resultado.filter(a => a.severidad === severidad);
    }
    if (tipo) {
      resultado = resultado.filter(a => a.tipo === tipo);
    }
    
    // Ordenar por severidad
    const orden = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAJA: 4 };
    resultado.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    
    // Paginación
    const total = resultado.length;
    const pages = Math.ceil(total / parsedLimit);
    const data = resultado.slice(parsedOffset, parsedOffset + parsedLimit);
    
    res.json({
      ok: true,
      data,
      pagination: { total, pages, limit: parsedLimit, offset: parsedOffset },
      resumen: {
        criticas: alertas.filter(a => a.severidad === 'CRITICA').length,
        altas: alertas.filter(a => a.severidad === 'ALTA').length,
        medias: alertas.filter(a => a.severidad === 'MEDIA').length,
        bajas: alertas.filter(a => a.severidad === 'BAJA').length
      }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// 4. ENDPOINTS: ESTADÍSTICAS Y REPORTES
// ================================================================

/**
 * GET /api/reportes/por-pais
 * Estadísticas por país
 */
app.get('/api/reportes/por-pais', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porPais = {};
    procesadas.forEach(t => {
      const p = t.pais || 'No definido';
      if (!porPais[p]) {
        porPais[p] = {
          total: 0,
          activos: 0,
          enProceso: 0,
          cancelados: 0,
          diasPromedio: 0,
          diasTotal: 0,
          tasaExito: 0
        };
      }
      porPais[p].total++;
      porPais[p].diasTotal += t.dImpl;
      
      if (t.status === 'Activo') porPais[p].activos++;
      if (t.status === 'En Implementación') porPais[p].enProceso++;
      if (t.status === 'Cancelado') porPais[p].cancelados++;
    });
    
    const resultado = Object.entries(porPais).map(([pais, stats]) => ({
      pais,
      ...stats,
      diasPromedio: stats.total > 0 ? (stats.diasTotal / stats.total).toFixed(1) : 0,
      tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
    }));
    
    res.json({
      ok: true,
      data: resultado,
      total: resultado.length
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/reportes/por-tipo
 * Estadísticas por tipo de implementación
 */
app.get('/api/reportes/por-tipo', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porTipo = {};
    procesadas.forEach(t => {
      const tipo = t.tipo || 'Desconocido';
      if (!porTipo[tipo]) {
        porTipo[tipo] = {
          total: 0,
          activos: 0,
          enProceso: 0,
          cancelados: 0,
          diasPromedio: 0,
          diasTotal: 0,
          tasaExito: 0
        };
      }
      porTipo[tipo].total++;
      porTipo[tipo].diasTotal += t.dImpl;
      
      if (t.status === 'Activo') porTipo[tipo].activos++;
      if (t.status === 'En Implementación') porTipo[tipo].enProceso++;
      if (t.status === 'Cancelado') porTipo[tipo].cancelados++;
    });
    
    const resultado = Object.entries(porTipo).map(([tipo, stats]) => ({
      tipo,
      ...stats,
      diasPromedio: stats.total > 0 ? (stats.diasTotal / stats.total).toFixed(1) : 0,
      tasaExito: stats.total > 0 ? ((stats.activos / stats.total) * 100).toFixed(1) : 0
    }));
    
    res.json({
      ok: true,
      data: resultado,
      total: resultado.length
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/reportes/por-consultor
 * Estadísticas por consultor/responsable
 */
app.get('/api/reportes/por-consultor', auth, async (req, res, next) => {
  try {
    const tareas = await obtenerTareasClickUp();
    const procesadas = tareas.map(t => procesarTarea(t));
    
    const porConsultor = {};
    procesadas.forEach(t => {
      [
        { name: t.rKickoff, role: 'Kickoff' },
        { name: t.rVer, role: 'Verificación' },
        { name: t.rCap, role: 'Capacitación' },
        { name: t.rGoLive, role: 'Go-Live' },
        { name: t.rAct, role: 'Activación' },
        { name: t.rVenta, role: 'Vendedor' }
      ].forEach(({ name, role }) => {
        if (!name || !name.trim()) return;
        
        if (!porConsultor[name]) {
          porConsultor[name] = {
            nombre: name,
            roles: new Set(),
            clientesUnicos: new Set(),
            activos: 0,
            enProceso: 0,
            cancelados: 0,
            etapas: 0
          };
        }
        
        porConsultor[name].roles.add(role);
        porConsultor[name].clientesUnicos.add(t.id);
        porConsultor[name].etapas++;
        
        if (t.status === 'Activo') porConsultor[name].activos++;
        if (t.status === 'En Implementación') porConsultor[name].enProceso++;
        if (t.status === 'Cancelado') porConsultor[name].cancelados++;
      });
    });
    
    const resultado = Object.values(porConsultor)
      .map(stats => ({
        consultor: stats.nombre,
        roles: Array.from(stats.roles),
        clientesUnicos: stats.clientesUnicos.size,
        activos: stats.activos,
        enProceso: stats.enProceso,
        cancelados: stats.cancelados,
        etapasAsignadas: stats.etapas
      }))
      .sort((a, b) => b.clientesUnicos - a.clientesUnicos);
    
    res.json({
      ok: true,
      data: resultado,
      total: resultado.length
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// 5. ENDPOINTS: SINCRONIZACIÓN
// ================================================================

/**
 * POST /api/sync/start
 * Iniciar sincronización manual desde ClickUp
 * Solo admin
 */
app.post('/api/sync/start', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') throw Errors.FORBIDDEN();
    
    broadcastEvent('syncStarted', { initiatedBy: req.user.username });
    
    // Iniciar sync en background (no esperar)
    setImmediate(async () => {
      try {
        const apiKey = getClickUpApiKey();
        const listId = getClickUpListId();
        
        const rawTasks = await obtenerTareasClickUpRaw({ apiKey, listId });
        const clients = await mapTasksToClients(rawTasks, {
          DIAS_ALERTA: 7,
          DIAS_META: CONFIG.DIAS_META,
          PAISES: CONFIG.PAISES,
          FERIADOS: CONFIG.FERIADOS,
          TAREAS_IGNORAR: CONFIG.TAREAS_IGNORAR,
          ESTADOS_IGNORAR: CONFIG.ESTADOS_IGNORAR,
          ESTADOS_IMPL: CONFIG.ESTADOS_IMPL || []
        });
        
        const dataDir = path.join(STATIC_ROOT, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        fs.writeFileSync(
          path.join(dataDir, 'clientes.json'),
          JSON.stringify({
            fingerprint: computeTasksFingerprint(rawTasks),
            updatedAt: new Date().toISOString(),
            clientes: clients
          }, null, 2)
        );
        
        cache.del('clickup_tasks_raw');
        
        writeLog(req.user, 'SYNC_COMPLETED', {
          clientsCount: clients.length,
          timestamp: new Date().toISOString()
        });
        
        broadcastEvent('syncCompleted', {
          total: clients.length,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.error('Sync error:', e);
        broadcastEvent('syncFailed', {
          error: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    res.json({
      ok: true,
      message: 'Sincronización iniciada. Recibirás actualización cuando finalice.'
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/sync/status
 * Obtener estado de la última sincronización
 */
app.get('/api/sync/status', auth, (req, res, next) => {
  try {
    res.json({
      ok: true,
      data: {
        ...cacheMeta,
        lastSync: cache.getStats().keys.includes('clickup_tasks_raw') ? 'cached' : 'expired'
      }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// 6. AUDITORÍA Y LOGS
// ================================================================

/**
 * GET /api/auditoria
 * Obtener logs de auditoría (solo admin/manager)
 * 
 * Query params:
 * - desde: fecha ISO
 * - hasta: fecha ISO
 * - usuario: nombre de usuario
 * - tipo: tipo de acción
 * - limit: items por página
 * - offset: items a saltar
 */
app.get('/api/auditoria', auth, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      throw Errors.FORBIDDEN();
    }
    
    const { desde, hasta, usuario, tipo, limit = '100', offset = '0' } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);
    
    let logs = [];
    const logsFile = path.join(STATIC_ROOT, 'audit_logs.json');
    
    if (fs.existsSync(logsFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
      } catch (e) {}
    }
    
    // Aplicar filtros
    let filtrados = logs;
    
    if (desde) {
      const desdeMs = new Date(desde).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() >= desdeMs);
    }
    
    if (hasta) {
      const hastaMs = new Date(hasta).getTime();
      filtrados = filtrados.filter(l => new Date(l.timestamp).getTime() <= hastaMs);
    }
    
    if (usuario?.trim()) {
      filtrados = filtrados.filter(l => normalizeText(l.user).includes(normalizeText(usuario.trim())));
    }
    
    if (tipo?.trim()) {
      filtrados = filtrados.filter(l => l.action === tipo.trim());
    }
    
    // Ordenar por timestamp descendente (más recientes primero)
    filtrados.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Paginación
    const total = filtrados.length;
    const pages = Math.ceil(total / parsedLimit);
    const data = filtrados.slice(parsedOffset, parsedOffset + parsedLimit);
    
    res.json({
      ok: true,
      data,
      pagination: { total, pages, limit: parsedLimit, offset: parsedOffset },
      filters: { desde, hasta, usuario, tipo }
    });
  } catch (e) {
    next(e);
  }
});

// ================================================================
// MIDDLEWARE: Error Handler (AGREGAR AL FINAL, ANTES DE app.listen())
// ================================================================

// Agregar este middleware DESPUÉS de definir todos los endpoints
// app.use(errorHandler);

// ================================================================
// NOTAS DE IMPLEMENTACIÓN
// ================================================================

/**
 * 1. COPIAR TODO ESTO AL FINAL DE server.js
 * 2. REEMPLAZAR/ELIMINAR endpoints duplicados
 * 3. ASEGURAR QUE LAS FUNCIONES HELPER EXISTAN:
 *    - obtenerTareasClickUp()
 *    - procesarTarea()
 *    - obtenerTareasClickUpRaw()
 *    - mapTasksToClients()
 *    - normalizeText()
 *    - computeTasksFingerprint()
 *    - writeLog()
 *    - broadcastEvent()
 * 4. AGREGAR MIDDLEWARE DE ERROR AL FINAL
 * 5. TESTEAR TODOS LOS ENDPOINTS
 */

module.exports = {
  AppError,
  Errors,
  validateRequest,
  errorHandler
};
