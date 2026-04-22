'use strict';

const crypto = require('crypto');

const DEFAULT_CONFIG = {
  DIAS_ALERTA: 7,
  DIAS_META: { kickoff: 3, verificacion: 2, instalacion: 5, capacitacion: 7, activacion: 2, total: 20 },
  PAISES: {},
  FERIADOS: {},
  TAREAS_IGNORAR: [],
  ESTADOS_IGNORAR: [],
  ESTADOS_IMPL: [],
  CONSULTORES: {} // Mapa dinámico de consultores desde global_config
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function fmtFecha(date, tz = 'UTC') {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

function formatearMesAnio(fecha) {
  if (!fecha || fecha === '' || fecha === 'N/A' || fecha === '-') return 'N/A';
  if (typeof fecha === 'string' && MESES.some(m => fecha.includes(m))) return fecha;
  let f;
  if (fecha instanceof Date) f = fecha;
  else if (typeof fecha === 'string') {
    const partes = fecha.split('/');
    if (partes.length === 3) f = new Date(partes[2], partes[1] - 1, partes[0]);
    else f = new Date(fecha);
  } else if (typeof fecha === 'number') f = new Date(fecha);
  else return 'N/A';
  if (Number.isNaN(f.getTime())) return 'N/A';
  return MESES[f.getMonth()] + ' ' + f.getFullYear();
}

function normNom(n) {
  return String(n || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeTasksFingerprint(tasks) {
  const safe = Array.isArray(tasks) ? tasks : [];
  const minimal = safe
    .map(t => ({
      id: String(t?.id || ''),
      status: String(t?.status?.status || ''),
      date_updated: String(t?.date_updated || ''),
      date_closed: String(t?.date_closed || ''),
      name: String(t?.name || '')
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const json = JSON.stringify(minimal);
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Buscar el mejor campo personalizado que coincida con uno de los nombres dados.
 * Estrategia: exacto (3) > empieza con (2) > contiene (1)
 */
function findCustomField(cf, names) {
  if (!Array.isArray(cf) || !cf.length) return undefined;
  const normalizedNames = names.map(normalizeText);
  let bestMatch = null;

  cf.forEach(field => {
    if (!field) return;
    const fieldName = normalizeText(field?.name);
    normalizedNames.forEach(name => {
      if (!name) return;
      const exactScore = fieldName === name ? 3 : 0;
      const startsWithScore = !exactScore && fieldName.startsWith(name) ? 2 : 0;
      const includesScore = !exactScore && !startsWithScore && fieldName.includes(name) ? 1 : 0;
      const score = exactScore || startsWithScore || includesScore;
      if (score && (!bestMatch || score > bestMatch.score)) bestMatch = { field, score };
    });
  });

  return bestMatch ? bestMatch.field : undefined;
}

/**
 * Obtener el valor de un campo personalizado con manejo robusto de tipos
 */
function getCampo(cf, nom, tipo) {
  const f = findCustomField(cf || [], [nom]);
  if (!f) return tipo === 'number' ? 0 : '';

  try {
    switch (tipo) {
      case 'number':
        return parseFloat(f.value) || 0;
      case 'date': {
        if (!f.value && f.value !== 0) return null;
        const ms = parseInt(String(f.value), 10);
        return Number.isNaN(ms) ? null : ms;
      }
      case 'dropdown': {
        if (f.value === null || f.value === undefined) return '';
        if (f.type_config?.options) {
          // Buscar por id primero, luego por orderindex
          const valStr = String(f.value);
          const valInt = parseInt(valStr, 10);
          const o = f.type_config.options.find(x =>
            x.id === valStr ||
            (!Number.isNaN(valInt) && x.orderindex === valInt) ||
            x.name === valStr || x.label === valStr
          );
          return o ? (o.name || o.label || '') : '';
        }
        return String(f.value);
      }
      case 'email':
      case 'text': {
        if (!f.value && f.value !== 0) return '';
        if (typeof f.value === 'string') return f.value.trim();
        if (f.type_config?.options) {
          const valStr = String(f.value);
          const valInt = parseInt(valStr, 10);
          const o = f.type_config.options.find(x =>
            x.id === valStr || (!Number.isNaN(valInt) && x.orderindex === valInt)
          );
          return o ? (o.name || o.label || '') : '';
        }
        return String(f.value);
      }
      default:
        if (!f.value && f.value !== 0) return '';
        return String(f.value);
    }
  } catch (_e) {
    return tipo === 'number' ? 0 : '';
  }
}

function getPais(cf, cfg) {
  const f = findCustomField(cf || [], ['país', 'pais', 'country', 'pais de origem']);
  if (!f) return '';
  if (f.value === null || f.value === undefined) return '';

  try {
    if (f.type_config?.options) {
      const valStr = String(f.value);
      const valInt = parseInt(valStr, 10);
      const o = f.type_config.options.find(x =>
        x.id === valStr || (!Number.isNaN(valInt) && x.orderindex === valInt)
      );
      if (o?.name) {
        const pn = normalizeText(o.name);
        const mapped = cfg.PAISES?.[pn];
        if (mapped) return mapped;
        return o.name;
      }
    }
    if (typeof f.value === 'string') {
      const pn = normalizeText(f.value);
      const mapped = cfg.PAISES?.[pn];
      if (mapped) return mapped;
      if (pn.length >= 3 && /^[a-záéíóúñ\s]+$/.test(pn)) return f.value.trim();
    }
  } catch (_e) {}
  return '';
}

/**
 * Obtener valor del campo Plan con búsqueda ampliada
 */
function getPlan(cf) {
  // Buscar por múltiples nombres posibles del campo plan
  const f = findCustomField(cf || [], ['plan', 'tipo de plan', 'plano', 'plan contratado', 'plan de servicio']);
  if (!f) return '';
  if (f.value === null || f.value === undefined) return '';

  try {
    if (f.type_config?.options) {
      const valStr = String(f.value);
      const valInt = parseInt(valStr, 10);
      const o = f.type_config.options.find(x =>
        x.id === valStr || (!Number.isNaN(valInt) && x.orderindex === valInt)
      );
      const planValue = (o?.name || o?.label || '').trim();
      if (planValue && planValue.length >= 2) return planValue;
    }
    if (typeof f.value === 'string') {
      const planValue = f.value.trim();
      if (planValue.length >= 2 && planValue.length <= 50) return planValue;
    }
  } catch (_e) {}

  return '';
}

function diasHab(ini, fin, p, cfg, tz = 'UTC') {
  if (!ini || !fin) return 0;
  let d = 0;
  let a = new Date(ini);
  const f = new Date(fin);
  if (Number.isNaN(a.getTime()) || Number.isNaN(f.getTime())) return 0;
  const fer = cfg.FERIADOS?.[p] || [];

  while (a <= f) {
    const ds = a.getDay();
    const mm = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: '2-digit' }).format(a);
    const dd = new Intl.DateTimeFormat('en-US', { timeZone: tz, day: '2-digit' }).format(a);
    const md = mm + '-' + dd;
    if (ds !== 0 && ds !== 6 && !fer.includes(md)) d++;
    a.setDate(a.getDate() + 1);
  }
  return d;
}

/**
 * Normalizar nombre de consultor de forma DINÁMICA usando el mapa del config.
 * Primero busca en cfg.CONSULTORES (de global_config.json), luego en el mapa hardcodeado de fallback.
 */
function normCons(n, cfg) {
  if (!n || n === 'N/A' || n === '' || n === '-') return '';
  const l = String(n || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Buscar en el mapa dinámico de CONSULTORES (global_config.json)
  if (cfg && cfg.CONSULTORES && typeof cfg.CONSULTORES === 'object') {
    // Búsqueda exacta
    for (const [key, value] of Object.entries(cfg.CONSULTORES)) {
      const keyNorm = normalizeText(key);
      if (keyNorm === l) return value;
    }
    // Búsqueda parcial (la entrada contiene el input)
    for (const [key, value] of Object.entries(cfg.CONSULTORES)) {
      const keyNorm = normalizeText(key);
      if (l.includes(keyNorm) && keyNorm.length >= 4) return value;
    }
    // Búsqueda inversa (el input contiene la entrada)
    for (const [key, value] of Object.entries(cfg.CONSULTORES)) {
      const keyNorm = normalizeText(key);
      if (keyNorm.includes(l) && l.length >= 4) return value;
    }
  }

  // 2. Fallback: mapa hardcodeado para los consultores principales conocidos
  const consultoresMap = {
    'edwin leonardo franco campos': 'Edwin Franco',
    'edwin franco campos': 'Edwin Franco',
    'edwin leonardo franco': 'Edwin Franco',
    'edwin l franco campos': 'Edwin Franco',
    'edwin l. franco campos': 'Edwin Franco',
    'edwin l franco': 'Edwin Franco',
    'edwin franco': 'Edwin Franco',
    'franco edwin': 'Edwin Franco',
    'e. franco': 'Edwin Franco',
    'edwin f': 'Edwin Franco',
    'e franco': 'Edwin Franco',

    'alejandro jose zambrano': 'Alejandro Zambrano',
    'alejandro jose zambrano': 'Alejandro Zambrano',
    'alejandro j zambrano': 'Alejandro Zambrano',
    'alejandro j. zambrano': 'Alejandro Zambrano',
    'alejandro zambrano': 'Alejandro Zambrano',
    'zambrano alejandro': 'Alejandro Zambrano',
    'alex zambrano': 'Alejandro Zambrano',
    'a. zambrano': 'Alejandro Zambrano',
    'a zambrano': 'Alejandro Zambrano',

    'mariane aparecida telo': 'Mariane Teló',
    'mariane aparecida telo': 'Mariane Teló',
    'mariane a telo': 'Mariane Teló',
    'mariane a. telo': 'Mariane Teló',
    'mariane telo': 'Mariane Teló',
    'mariane telo': 'Mariane Teló',
    'telo mariane': 'Mariane Teló',
    'mari telo': 'Mariane Teló',
    'mariane t': 'Mariane Teló',
    'm. telo': 'Mariane Teló',
    'm telo': 'Mariane Teló',

    'blitzangel leon': 'Blitzangel Leon',
    'blitz': 'Blitzangel Leon',

    'bruno gabriel rodrigues': 'Bruno Gabriel Rodrigues',
    'bruno gabriel': 'Bruno Gabriel Rodrigues',
    'bruno rodrigues': 'Bruno Gabriel Rodrigues',
    'bruno g. rodrigues': 'Bruno Gabriel Rodrigues',
  };

  if (consultoresMap[l]) return consultoresMap[l];
  for (const [key, value] of Object.entries(consultoresMap)) {
    if (l.includes(key) && key.length >= 4) return value;
  }
  for (const [key, value] of Object.entries(consultoresMap)) {
    if (key.includes(l) && l.length >= 4) return value;
  }

  // 3. Ninguna coincidencia: retornar vacío (no inventar)
  return '';
}

function debeIgnorarTarea(tarea, cfg) {
  const nombreNorm = String(tarea?.name || '').toLowerCase().trim();
  return (cfg.TAREAS_IGNORAR || []).some(t => nombreNorm.includes(String(t || '').toLowerCase().trim()));
}

function debeIgnorarPorEstado(tarea, cfg) {
  const status = String(tarea?.status?.status || '').toLowerCase();
  if (!cfg.ESTADOS_IGNORAR || cfg.ESTADOS_IGNORAR.length === 0) return false;
  return cfg.ESTADOS_IGNORAR.some(e => {
    if (!e) return false;
    const ign = String(e).toLowerCase();
    return status === ign || status.includes(ign);
  });
}

function limpiarNombre(nombre) {
  if (!nombre || nombre === '') return '';
  let limpio = String(nombre).replace(/<[^>]+>/g, '').trim();
  return limpio.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function esNombreValido(nombre) {
  if (!nombre || nombre === '' || String(nombre).length < 3) return false;
  const n = String(nombre);
  if (['N/A', '-', 'null', 'undefined'].includes(n)) return false;
  const soloLetras = n.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  return soloLetras.length >= 3;
}

function buscarResponsable(cf, terminos) {
  const terminosExtendidos = [...terminos];
  terminos.forEach(termino => {
    if (termino.includes('kickoff')) terminosExtendidos.push(termino.replace('kickoff', 'onboarding'));
    if (termino.includes('onboarding')) terminosExtendidos.push(termino.replace('onboarding', 'kickoff'));
  });

  for (const termino of terminosExtendidos) {
    const campo = findCustomField(cf || [], [termino]);
    if (!campo || !campo.value) continue;

    if (Array.isArray(campo.value) && campo.value.length > 0) {
      const nombres = campo.value
        .map(v => (v?.username || v?.name || v?.email || '').toString().trim())
        .filter(n => n && n.length > 2);
      if (nombres.length > 0) return nombres;
    }

    if (typeof campo.value === 'string') {
      const valorLimpio = campo.value.trim();
      if (valorLimpio && valorLimpio.length > 2) return [valorLimpio];
    }

    if (campo.type_config?.options && (campo.value !== null && campo.value !== undefined)) {
      const valStr = String(campo.value);
      const valInt = parseInt(valStr, 10);
      const opcion = campo.type_config.options.find(opt =>
        opt.id === valStr || (!Number.isNaN(valInt) && opt.orderindex === valInt)
      );
      if (opcion && (opcion.name || opcion.label)) {
        const nombreOpcion = (opcion.name || opcion.label).trim();
        if (nombreOpcion && nombreOpcion.length > 2) return [nombreOpcion];
      }
    }
  }

  return [];
}

function procesarResponsable(array, cfg) {
  if (!array || array.length === 0) return '';
  const primero = array[0];
  if (!esNombreValido(primero)) return '';
  const normConsultor = normCons(primero, cfg);
  return normConsultor !== '' ? normConsultor : limpiarNombre(primero);
}

function obtenerHistorialEstadosActualizadoFromDetails(taskDetails, cfg, tz = 'UTC') {
  try {
    const history = Array.isArray(taskDetails?.status_history) ? taskDetails.status_history : [];
    if (history.length === 0) {
      return {
        etapaAnterior: 'Creado',
        diasPorEtapa: { kickoff: 0, verificacion: 0, instalacion: 0, capacitacion: 0, activacion: 0 },
        historiaPausa: []
      };
    }

    const sorted = [...history].sort((a, b) => {
      const da = parseInt(String(a.date || '0'), 10);
      const db = parseInt(String(b.date || '0'), 10);
      return da - db;
    });
    let etapaAnterior = 'Creado';
    if (sorted.length >= 2) etapaAnterior = sorted[sorted.length - 2].status || 'N/A';

    const diasPorEtapa = { kickoff: 0, verificacion: 0, instalacion: 0, capacitacion: 0, activacion: 0 };
    const historiaPausa = [];
    const pais = 'No definido';

    for (let i = 0; i < sorted.length; i++) {
      const estado = String(sorted[i]?.status || '').toLowerCase();
      const tsInicio = parseInt(String(sorted[i]?.date || '0'), 10);
      const tsFin = i < sorted.length - 1
        ? parseInt(String(sorted[i + 1]?.date || '0'), 10)
        : Date.now();
      const fechaInicio = new Date(tsInicio);
      const fechaFin = new Date(tsFin);
      const dias = diasHab(fechaInicio, fechaFin, pais, cfg, tz);

      if (estado.includes('kickoff') || estado.includes('onboarding')) diasPorEtapa.kickoff += dias;
      else if (estado.includes('analisis meta') || estado.includes('análisis meta')) diasPorEtapa.verificacion += dias;
      else if (estado.includes('instalación') || estado.includes('instalacion')) diasPorEtapa.instalacion += dias;
      else if (estado.includes('capacitación') || estado.includes('capacitacion')) diasPorEtapa.capacitacion += dias;
      else if (
        estado.includes('go-live') || estado.includes('go live') ||
        estado.includes('activación canales') || estado.includes('activacion canales')
      ) diasPorEtapa.activacion += dias;

      if (estado.includes('pausa') || estado.includes('pausada')) historiaPausa.push(fechaInicio);
    }

    return { etapaAnterior, diasPorEtapa, historiaPausa };
  } catch (_e) {
    return {
      etapaAnterior: 'Error',
      diasPorEtapa: { kickoff: 0, verificacion: 0, instalacion: 0, capacitacion: 0, activacion: 0 },
      historiaPausa: []
    };
  }
}

function buscarFechaConcluidoFromDetails(taskDetails) {
  try {
    const history = Array.isArray(taskDetails?.status_history) ? taskDetails.status_history : [];
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      const estadoLower = String(h?.status || '').toLowerCase();
      if ((estadoLower.includes('conclu') || estadoLower === 'closed' || estadoLower === 'cerrado') && h?.date) {
        const ts = parseInt(String(h.date), 10);
        if (!Number.isNaN(ts)) return new Date(ts);
      }
    }
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Extraer todos los custom fields como raw para diagnóstico/debug
 */
function extractAllCustomFieldsRaw(task) {
  const cf = Array.isArray(task?.custom_fields) ? task.custom_fields : [];
  return cf.map(f => ({
    id: f.id,
    name: f.name,
    type: f.type,
    value: f.value,
    hasOptions: Boolean(f.type_config?.options?.length),
    optionCount: f.type_config?.options?.length || 0
  }));
}

/**
 * Detectar tipo de implementación de forma robusta.
 * Busca el campo por nombre, luego intenta interpretar el valor como:
 *   - Índice 1 / nombre "upgrade" / tag "upgrade"
 */
function detectarTipoImpl(cf, tagsStr) {
  const tipoF = findCustomField(cf || [], ['tipo de implementación', 'tipo de implementacion', 'tipo impl', 'type']);
  if (tipoF) {
    const val = tipoF.value;
    if (val !== null && val !== undefined) {
      // Puede ser: '1', 1, 'upgrade', nombre de opción
      const valStr = String(val).toLowerCase();
      if (valStr === '1' || valStr.includes('upgrade')) return 'Upgrade';
      // Buscar en opciones
      if (tipoF.type_config?.options) {
        const valInt = parseInt(String(val), 10);
        const o = tipoF.type_config.options.find(x =>
          x.id === String(val) ||
          (!Number.isNaN(valInt) && x.orderindex === valInt) ||
          x.name?.toLowerCase().includes('upgrade') ||
          x.label?.toLowerCase().includes('upgrade')
        );
        if (o && (o.name || o.label || '').toLowerCase().includes('upgrade')) return 'Upgrade';
      }
    }
  }
  // Fallback a tags
  if (tagsStr && tagsStr.includes('upgrade')) return 'Upgrade';
  return 'Implementación';
}

async function procesarTareaActualizadaNode(t, allTasks, cfg, ctx) {
  const cf = t.custom_fields || [];
  const tz = ctx?.tz || 'UTC';
  const ahora = new Date();
  const creado = new Date(parseInt(String(t.date_created || '0'), 10));
  const actualizado = new Date(parseInt(String(t.date_updated || '0'), 10));
  const cerrado = t.date_closed ? new Date(parseInt(String(t.date_closed), 10)) : null;

  const id = t.id;
  const nombre = t.name;
  const link = t.url;
  const estado = t.status?.status || '';
  const eLower = String(estado || '').toLowerCase();

  const esConcluido = eLower.includes('conclu') || eLower === 'closed' || eLower === 'cerrado';
  const esCancelado = eLower === 'cancelado';

  let fInicio = ctx?.cachedFInicio ? new Date(ctx.cachedFInicio) : creado;
  let fActiv = null;
  let fConcluido = null;
  let fCanc = null;

  let taskDetails = null;
  // Solo buscar detalles si NO tenemos fecha de inicio cacheada O si es una tarea que requiere análisis profundo (concluida/cancelada)
  if (typeof ctx?.fetchTaskDetails === 'function' && (!ctx.cachedFInicio || esConcluido || esCancelado)) {
    try {
      taskDetails = await ctx.fetchTaskDetails(id);
    } catch (_e) {
      taskDetails = null;
    }
  }

  // Si tenemos detalles y NO tenemos fInicio cacheada, buscarla en la historia
  if (taskDetails && !ctx.cachedFInicio && Array.isArray(taskDetails.status_history)) {
    const sortedHistory = [...taskDetails.status_history].sort((a, b) => parseInt(a.date) - parseInt(b.date));
    const firstImplStatus = sortedHistory.find(h => {
      const s = String(h.status || '').toLowerCase();
      return ESTADOS_IMPL.some(ei => s.includes(ei) && !s.includes('cerrado') && !s.includes('concluido'));
    });
    if (firstImplStatus) {
      fInicio = new Date(parseInt(firstImplStatus.date));
    }
  }

  // Si no se encontró por historial, intentar por campos personalizados específicos
  if (!fInicio || fInicio.getTime() === creado.getTime()) {
    let fInicioKickoff = getCampo(cf, 'Fecha Inicio Kickoff', 'date');
    if (!fInicioKickoff) fInicioKickoff = getCampo(cf, 'Fecha Inicio Onboarding', 'date');
    if (fInicioKickoff) fInicio = new Date(fInicioKickoff);
  }

  if (esConcluido) {
    const fActivCustom = getCampo(cf, 'Fecha Activación', 'date');
    fActiv = fActivCustom ? new Date(fActivCustom) : (cerrado || actualizado);
    fConcluido = fActiv;
  } else if (esCancelado) {
    fConcluido = taskDetails ? buscarFechaConcluidoFromDetails(taskDetails) : null;
    fCanc = cerrado || actualizado;
    if (fConcluido) fActiv = fConcluido;
  }

  const historial = taskDetails
    ? obtenerHistorialEstadosActualizadoFromDetails(taskDetails, cfg, tz)
    : {
        etapaAnterior: 'N/A',
        diasPorEtapa: { kickoff: 0, verificacion: 0, instalacion: 0, capacitacion: 0, activacion: 0 },
        historiaPausa: []
      };

  const etapaAnterior = historial.etapaAnterior;
  const diasPorEtapa = historial.diasPorEtapa;

  const logs = [];
  const eKickoffListo = eLower.includes('listo para kickoff');
  const eKickoff = eLower === 'en kickoff' || eLower.includes('en onboarding');
  const eAnalisis = eLower.includes('analisis meta') || eLower.includes('análisis meta');
  const eInstListo = eLower.includes('listo para instalación') || eLower.includes('listo para instalacion');
  const eInst = eLower.includes('en instalación') || eLower.includes('en instalacion');
  const eCap = eLower.includes('en capacitación') || eLower.includes('en capacitacion');
  const eGoLive = eLower.includes('go-live') || eLower.includes('go live');
  const eActCanales = eLower.includes('activación canales') || eLower.includes('activacion canales');

  if (eKickoffListo) logs.push('L.KO');
  if (eKickoff) logs.push('En KO');
  if (eAnalisis) logs.push('Anal.Meta');
  if (eInstListo) logs.push('L.Inst');
  if (eInst) logs.push('Inst');
  if (eCap) logs.push('Cap');
  if (eGoLive) logs.push('GoLive');
  if (eActCanales) logs.push('ActCan');
  if (esConcluido) logs.push('✅');
  if (esCancelado) logs.push('❌');
  if (logs.length === 0) logs.push(String(estado || '').substring(0, 10));

  const rKickoffArray = buscarResponsable(cf, [
    'responsable por el kickoff', 'responsable kickoff',
    'responsable por el kick', 'responsable onboarding', 'responsable por el onboarding'
  ]);
  const rVerArray = buscarResponsable(cf, [
    'responsable por el análisis', 'responsable por el analisis',
    'responsable por verificación', 'responsable por verificacion',
    'responsable verificación', 'responsable verificacion'
  ]);
  const rCapArray = buscarResponsable(cf, [
    'responsable por capacitación', 'responsable por capacitacion',
    'responsable capacitación', 'responsable capacitacion'
  ]);
  const rGoLiveArray = buscarResponsable(cf, [
    'responsable por el go-live', 'responsable por el go live',
    'responsable go-live', 'responsable go live'
  ]);
  const rActArray = buscarResponsable(cf, [
    'responsable por la activación', 'responsable por la activacion',
    'responsable activación', 'responsable activacion'
  ]);
  const rPBXArray = buscarResponsable(cf, ['resposable por pbx', 'responsable pbx']);
  const rFacArray = buscarResponsable(cf, ['responsable facturación', 'responsable facturacion']);
  const rComArray = buscarResponsable(cf, ['responsable comercial']);

  let fuente = 'ClickUp';

  let rKickoff = procesarResponsable(rKickoffArray, cfg);
  let rVer = procesarResponsable(rVerArray, cfg);
  let rGoLive = procesarResponsable(rGoLiveArray, cfg);
  let rAct = procesarResponsable(rActArray, cfg);
  let rPBX = rPBXArray.length > 0 ? rPBXArray.map(n => limpiarNombre(n)).join(', ') : '';
  let rFac = procesarResponsable(rFacArray, cfg);
  let rCom = procesarResponsable(rComArray, cfg);

  let rCap = '';
  let rCap2 = '';
  let capR1 = 0;
  let capR2 = 0;

  let cantCap = getCampo(cf, 'cantidad de capacitaciones', 'number') || 0;
  const capR1Field = findCustomField(cf, ['cantidad de capacitaciones r1']);
  const capR2Field = findCustomField(cf, ['cantidad de capacitaciones r2']);
  if (capR1Field?.value) capR1 = parseFloat(capR1Field.value) || 0;
  if (capR2Field?.value) capR2 = parseFloat(capR2Field.value) || 0;

  if (rCapArray.length > 0) {
    const consultoresValidos = rCapArray
      .filter(n => esNombreValido(n))
      .map(n => {
        const normConsultor = normCons(n, cfg);
        return normConsultor !== '' ? normConsultor : limpiarNombre(n);
      })
      .filter(n => n !== '');

    if (consultoresValidos.length >= 1) {
      rCap = consultoresValidos[0];
      if (capR1 === 0 && capR2 === 0) capR1 = cantCap || 1;
    }
    if (consultoresValidos.length >= 2) {
      rCap2 = consultoresValidos[1];
      if (capR2 === 0 && cantCap > capR1) capR2 = cantCap - capR1;
      else if (capR2 === 0) capR2 = 1;
    }
  }

  if (capR1 === 0 && cantCap > 0 && rCap) capR1 = cantCap;
  if (rCap && !rCap2 && capR1 === 0) capR1 = cantCap || 1;

  if (!rKickoff || !esNombreValido(rKickoff)) rKickoff = '';
  if (!rVer || !esNombreValido(rVer)) rVer = '';
  if (!rCap || !esNombreValido(rCap)) rCap = '';
  if (!rCap2 || !esNombreValido(rCap2)) rCap2 = '';
  if (!rGoLive || !esNombreValido(rGoLive)) rGoLive = '';
  if (!rAct || !esNombreValido(rAct)) rAct = '';
  if (!rFac || !esNombreValido(rFac)) rFac = '';
  if (!rCom || !esNombreValido(rCom)) rCom = '';

  let ipPrimaria = getCampo(cf, 'IP Hola', 'text');
  let ipSecundaria = getCampo(cf, 'IP Secundaria', 'text');
  let dominioPrincipal = getCampo(cf, 'Domínio', 'text') || getCampo(cf, 'Dominio', 'text');
  let dominio2 = getCampo(cf, 'Dominio 2', 'text');
  let pais = getPais(cf, cfg);

  // Fallback a backup de dominios si están vacíos
  if ((!ipPrimaria && !dominioPrincipal) && ctx?.domData) {
    const backup = buscarDomIPExacto(nombre, ctx.domData);
    if (backup) {
      if (!ipPrimaria) ipPrimaria = backup.ip || backup.ipPrimaria || '';
      if (!ipSecundaria) ipSecundaria = backup.ipSecundaria || '';
      if (!dominioPrincipal) dominioPrincipal = backup.dominio || backup.dominioPrincipal || '';
      if (!dominio2) dominio2 = backup.dominio2 || '';
    }
  }

  let linkH = '';
  if (ipPrimaria && ipPrimaria.trim() !== '') {
    const cleanIP = ipPrimaria.trim();
    const esIP = /^\d+\.\d+\.\d+\.\d+$/.test(cleanIP);
    linkH = esIP ? 'https://' + cleanIP : (cleanIP.startsWith('http') ? cleanIP : 'https://' + cleanIP);
  } else if (dominioPrincipal && dominioPrincipal.trim() !== '') {
    const cleanDom = dominioPrincipal.trim();
    linkH = cleanDom.startsWith('http') ? cleanDom : 'https://' + cleanDom;
  }

  if (!pais || pais === '') pais = 'No definido';

  let dImpl = 0;
  let dUso = 0;
  let mImpl = 0;
  let mUso = 0;
  const ahoraMs = ahora.getTime();

  if (esConcluido) {
    dImpl = diasHab(fInicio, fConcluido, pais, cfg, tz);
    dUso = fConcluido ? Math.floor((ahoraMs - fConcluido.getTime()) / 86400000) : 0;
    mImpl = +(dImpl / 30).toFixed(1);
    mUso = +(dUso / 30).toFixed(1);
  } else if (esCancelado) {
    if (fConcluido) dImpl = diasHab(fInicio, fConcluido, pais, cfg, tz);
    else if (fCanc) dImpl = diasHab(fInicio, fCanc, pais, cfg, tz);
    mImpl = +(dImpl / 30).toFixed(1);
  } else {
    dImpl = diasHab(fInicio, ahora, pais, cfg, tz);
    mImpl = +(dImpl / 30).toFixed(1);
  }

  const dKickoffActual = (eKickoff || eKickoffListo) ? diasHab(fInicio, ahora, pais, cfg, tz) : 0;
  const dVerActual = eAnalisis ? diasHab(fInicio, ahora, pais, cfg, tz) : 0;
  const dInstActual = (eInst || eInstListo) ? diasHab(fInicio, ahora, pais, cfg, tz) : 0;
  const dCapActual = eCap ? diasHab(fInicio, ahora, pais, cfg, tz) : 0;
  const dActActual = (eGoLive || eActCanales) ? diasHab(fInicio, ahora, pais, cfg, tz) : 0;

  const dKickoffTotal = diasPorEtapa.kickoff || 0;
  const dVerTotal = diasPorEtapa.verificacion || 0;
  const dInstTotal = diasPorEtapa.instalacion || 0;
  const dCapTotal = diasPorEtapa.capacitacion || 0;
  const dActTotal = diasPorEtapa.activacion || 0;

  let hKickoff = 0;
  let hVer = 0;
  let hGoLive = 0;
  let hAct = 0;
  if (dKickoffTotal > 0 || esConcluido) hKickoff = 1;
  if (dVerTotal > 0 || esConcluido) hVer = 1;
  if (rGoLive || esConcluido) hGoLive = 1;
  if (dActTotal > 0 || esConcluido) hAct = 1;

  function buscarCampoLocal(terminos, tipo = 'text') {
    const f2 = findCustomField(cf || [], terminos);
    if (!f2) return tipo === 'number' ? 0 : '';
    if (tipo === 'number') return parseFloat(f2.value) || 0;
    if (tipo === 'dropdown') {
      if (!f2.value && f2.value !== 0) return '';
      if (f2.type_config?.options) {
        const valStr = String(f2.value);
        const valInt = parseInt(valStr, 10);
        const opcion = f2.type_config.options.find(x =>
          x.id === valStr || (!Number.isNaN(valInt) && x.orderindex === valInt)
        );
        return opcion ? (opcion.name || opcion.label || '') : '';
      }
      return '';
    }
    return f2.value ? String(f2.value) : '';
  }

  const mesICap = buscarCampoLocal(['mes de inicio capacit'], 'dropdown');
  const mesFCap = buscarCampoLocal(['mes de finalización ca', 'mes fin capacit'], 'dropdown');
  let mesAct = '';
  const reunCap = buscarCampoLocal(['cantidad de reuniones'], 'number');
  const hCap = buscarCampoLocal(['horas de capacitación', 'cantidad de horas'], 'number');

  if (fConcluido && (!mesAct || mesAct === '')) mesAct = formatearMesAnio(fConcluido);

  let status = '';
  if (esConcluido) status = '✅ Activo';
  else if (esCancelado) status = '❌ Cancelado';
  else status = '⚙️ En Implementación';

  let dSinMov = 0;
  let alerta = 'NO';
  if (!esConcluido && !esCancelado) {
    dSinMov = Math.floor((ahora.getTime() - actualizado.getTime()) / 86400000);
    if (dImpl > cfg.DIAS_META.total) alerta = '🚨 +20 días';
    else if (dSinMov > cfg.DIAS_ALERTA) alerta = '⚠️ Sin mov';
  }

  let usoPlat = 'NO';
  let dUsoTot = 0;
  let mUsoTot = 0;
  if (esCancelado && fConcluido && fCanc) {
    usoPlat = 'SÍ';
    dUsoTot = Math.floor((fCanc.getTime() - fConcluido.getTime()) / 86400000);
    mUsoTot = +(dUsoTot / 30).toFixed(1);
  }

  const motivo = getCampo(cf, 'Motivos de baja', 'dropdown') || (esCancelado ? 'No especificado' : 'N/A');
  const tipoBajaRaw = getCampo(cf, 'Tipo de baja', 'dropdown');
  const tipoBaja = tipoBajaRaw || (esCancelado ? 'Producto' : '');

  const cantUsuariosExtra = getCampo(cf, 'Cantidad de Usuarios extras', 'number') || 0;

  // --- CANALES ---
  const extractCanales = (fieldNames) => {
    // Buscar todos los campos que coincidan con los nombres candidatos
    const matchingFields = (cf || []).filter(f => {
      const fName = normalizeText(f?.name);
      return fieldNames.some(name => fName.includes(normalizeText(name)));
    });

    let array = [];
    matchingFields.forEach(f3 => {
      if (f3?.value) {
        if (Array.isArray(f3.value)) {
          const opciones = f3.type_config?.options || [];
          f3.value.forEach(item => {
            let label = '';
            if (typeof item === 'string') {
              const opcion = opciones.find(opt => opt.id === item || opt.name === item || opt.label === item);
              label = opcion ? (opcion.label || opcion.name || '') : item;
            } else if (typeof item === 'object' && item !== null) {
              label = item.label || item.name || item.value || '';
              if (!label && item.id && opciones.length) {
                const o = opciones.find(opt => opt.id === item.id);
                if (o) label = o.label || o.name || '';
              }
            } else if (typeof item === 'number') {
              const opcion = opciones.find(opt => opt.orderindex === item);
              if (opcion) label = opcion.name || opcion.label || '';
            }
            if (label && label.trim() !== '') array.push(label.toLowerCase().trim());
          });
        } else if (typeof f3.value === 'string') {
          const split = f3.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          array.push(...split);
        } else if (f3.type_config?.options && (f3.value !== null && f3.value !== undefined)) {
          // Caso Dropdown simple (valor único)
          const valStr = String(f3.value);
          const valInt = parseInt(valStr, 10);
          const o = f3.type_config.options.find(x => 
            x.id === valStr || (!Number.isNaN(valInt) && x.orderindex === valInt)
          );
          if (o) array.push((o.name || o.label || '').toLowerCase().trim());
        }
      }
    });
    return [...new Set(array)];
  };

  const cCandidates = ['canales contratados', 'canais contratados', 'canales', 'canais'];
  const bCandidates = ['canales bajados', 'canais baixados', 'canales desactivados'];
  
  const canalesArray = extractCanales(cCandidates);
  const canalesBajadosArray = extractCanales(bCandidates);

  const checkChannel = (arr, keys) => arr.some(c => keys.some(k => normalizeText(c).includes(normalizeText(k))));

  let wa = checkChannel(canalesArray, ['whatsapp', 'wpp', 'waba', 'wa ']) ? 'SÍ' : 'NO';
  const ig = checkChannel(canalesArray, ['instagram', 'ig ']) ? 'SÍ' : 'NO';
  const wc = checkChannel(canalesArray, ['webchat', 'wc ']) ? 'SÍ' : 'NO';
  const pbx = checkChannel(canalesArray, ['pbx', 'telefonia', 'telefonía', 'telephony', 'telefon ']) ? 'SÍ' : 'NO';
  const tg = checkChannel(canalesArray, ['telegram', 'tg ']) ? 'SÍ' : 'NO';
  const msg = checkChannel(canalesArray, ['messenger', 'facebook', 'fb ']) ? 'SÍ' : 'NO';
  const ai = checkChannel(canalesArray, ['hola ia', 'ia ', 'ai ']) ? 'SÍ' : 'NO';

  // Verificación extra para WhatsApp API Oficial
  const waOficial = getCampo(cf, 'WhatsApp API Oficial', 'dropdown');
  if (waOficial === 'Si' || waOficial === 'SÍ' || waOficial === 'si') wa = 'SÍ';

  const waBajado = canalesBajadosArray.some(c => c.includes('whatsapp')) ? 'SÍ' : 'NO';
  const igBajado = canalesBajadosArray.some(c => c.includes('instagram')) ? 'SÍ' : 'NO';
  const pbxBajado = canalesBajadosArray.some(c => c.includes('pbx') || c.includes('telefonia') || c.includes('telefonía')) ? 'SÍ' : 'NO';

  const prodContratado = getCampo(cf, 'Productos contratados', 'dropdown') || 'Hola! Suite';

  const tagsArray = t.tags ? t.tags.map(tag => String(tag?.name || '').toLowerCase()) : [];
  const tagsStr = tagsArray.join(',');

  // Detectar tipo de implementación de forma robusta
  const tipo = detectarTipoImpl(cf, tagsStr);

  let upgImpl = 'NO';
  let upgPost = 'NO';
  let upgradeOrigID = '';
  if (tipo === 'Upgrade' && !esConcluido) upgImpl = 'SÍ';

  const sinReq = tagsStr.includes('sin requisitos') ? 'SÍ' : 'NO';
  const pausada = tagsStr.includes('pausada') || tagsStr.includes('pausa') ? 'SÍ' : 'NO';
  const espCli = tagsStr.includes('esperando cliente') || tagsStr.includes('sin respuesta') ? 'SÍ' : 'NO';
  const espWis = tagsStr.includes('esperando wispro') || tagsStr.includes('esperando hola') ? 'SÍ' : 'NO';
  const moro = tagsStr.includes('morosidad') || tagsStr.includes('mora') ? 'SÍ' : 'NO';

  let diasPausa = 0;
  if (pausada === 'SÍ') {
    const historiaPausa = historial.historiaPausa || [];
    if (historiaPausa.length > 0) {
      const ultimaPausa = historiaPausa[historiaPausa.length - 1];
      diasPausa = Math.floor((ahora.getTime() - ultimaPausa.getTime()) / 86400000);
    }
  }

  const plan = getPlan(cf);
  const email = getCampo(cf, 'E-mail', 'email') || getCampo(cf, 'email', 'text');
  const telefono = getCampo(cf, 'Número para contacto', 'text') || getCampo(cf, 'telefono', 'text');

  const consCom = rKickoff && rKickoff === rVer && rVer === rCap && rCap === rGoLive && rGoLive === rAct && rKickoff !== '' ? 'SÍ' : 'NO';
  const mesInicio = formatearMesAnio(fInicio);
  const mesFin = fConcluido ? formatearMesAnio(fConcluido) : 'N/A';

  // Etapa actual legible
  let etapaActual = 'Desconocida';
  if (esConcluido) etapaActual = 'Activo';
  else if (esCancelado) etapaActual = 'Cancelado';
  else if (eKickoffListo) etapaActual = 'Listo para Kickoff';
  else if (eKickoff) etapaActual = 'En Kickoff';
  else if (eAnalisis) etapaActual = 'Análisis de Meta';
  else if (eInstListo) etapaActual = 'Listo para Instalación';
  else if (eInst) etapaActual = 'En Instalación';
  else if (eCap) etapaActual = 'En Capacitación';
  else if (eGoLive) etapaActual = 'Go-Live';
  else if (eActCanales) etapaActual = 'Activación Canales';
  else etapaActual = String(estado || '').substring(0, 30) || 'Desconocida';

  return {
    id,
    nombre,
    url: link,
    estado,
    etapaAnterior,
    etapaActual,
    log: logs.join('→'),
    fInicio: fInicio.getTime(),
    fInicioFmt: fmtFecha(fInicio, tz),
    fActivacion: fActiv ? fActiv.getTime() : null,
    fActivacionFmt: fActiv ? fmtFecha(fActiv, tz) : '',
    fCancelacion: fCanc ? fCanc.getTime() : null,
    fCancelacionFmt: fCanc ? fmtFecha(fCanc, tz) : '',
    fActualizado: actualizado.getTime(),
    fActualizadoFmt: fmtFecha(actualizado, tz),
    fConcluido: fConcluido ? fConcluido.getTime() : null,
    fConcluidoFmt: fConcluido ? fmtFecha(fConcluido, tz) : '',
    rKickoff, rVer, rCap, rCap2, capR1, capR2, rGoLive, rAct, rPBX, rFac, rCom,
    ip: ipPrimaria,
    ipPrimaria,
    ipSecundaria,
    dominio: dominioPrincipal,
    dominioPrincipal,
    dominio2,
    linkHola: linkH,
    dImpl, mImpl, dUso, mUso,
    dKickoffActual, dVerActual, dInstActual, dCapActual, dActActual,
    dKickoffTotal, dVerTotal, dInstTotal, dCapTotal, dActTotal,
    mesICap, mesFCap, mesAct, cantCap, hCap, reunCap,
    hKickoff, hVer, hGoLive, hAct,
    rVenta: rCom || '',
    rCom: rCom || '',
    mensualidad: getCampo(cf, 'Mensualidad', 'number') || getCampo(cf, 'monto', 'number') || 0,
    aderencia: getCampo(cf, 'Cuota de adherencia', 'number') || getCampo(cf, 'adherencia', 'number') || undefined,
    status,
    alerta,
    dSinMov,
    usoPlat,
    dUsoTotal: dUsoTot,
    mUsoTotal: mUsoTot,
    motivo,
    tipoBaja,
    cantUsuariosExtra,
    prodContratado,
    canales: { wa, ig, wc, pbx, tg, msg, ai, tel: pbx },
    canalesBajados: { wa: waBajado, ig: igBajado, pbx: pbxBajado, raw: canalesBajadosArray },
    canalesArray,
    upgImpl, upgPost, upgradeOrigID,
    sinReq, pausada, espCli, espWis, moro,
    pais,
    plan,
    email,
    telefono,
    tipo,
    consCom,
    fuente,
    dPausa: diasPausa,
    mesInicio,
    mesFin,
    // Fechas formateadas para UI
    fInicioFmt: fmtFecha(fInicio, tz),
    fActivacionFmt: fActiv ? fmtFecha(fActiv, tz) : '',
    fCancelacionFmt: fCanc ? fmtFecha(fCanc, tz) : '',
    fConcluidoFmt: fConcluido ? fmtFecha(fConcluido, tz) : ''
  };
}

async function mapTasksToClients(tasks, config = {}, ctx = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const tz = ctx?.tz || 'UTC';

  const raw = Array.isArray(tasks) ? tasks : [];

  // Filtrado flexible
  const filtered = raw.filter(t => {
    if (debeIgnorarTarea(t, cfg)) return false;
    if (debeIgnorarPorEstado(t, cfg)) return false;

    // Si la lista de estados implementables está vacía, incluimos todo lo que no sea ignorado
    if (!cfg.ESTADOS_IMPL || cfg.ESTADOS_IMPL.length === 0) return true;

    const estadoLower = String(t?.status?.status || '').toLowerCase();
    return (cfg.ESTADOS_IMPL || []).some(e => {
      const impl = String(e || '').toLowerCase();
      return estadoLower === impl || estadoLower.includes(impl);
    });
  });

  const clients = [];
  const batchSize = 25; // Procesar 25 tareas en paralelo a la vez
  const prevClients = ctx.prevClients || [];
  
  // Mapear clientes previos por ID para acceso rápido
  const prevMap = new Map();
  prevClients.forEach(c => prevMap.set(c.id, c));

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (t) => {
      try {
        // Optimización: Si el cliente ya existe y la fecha de actualización no ha cambiado, 
        // podemos intentar reutilizar la fInicio encontrada anteriormente para evitar fetch de historia.
        const cached = prevMap.get(t.id);
        const taskCtx = { ...ctx, tz };
        
        if (cached && cached.fInicio && String(t.date_updated) === String(cached.fActualizado)) {
           taskCtx.cachedFInicio = cached.fInicio;
        }

        return await procesarTareaActualizadaNode(t, filtered, cfg, taskCtx);
      } catch (err) {
        console.error(`[clickupMapper] Error procesando tarea ${t.id} (${t.name}):`, err.message);
        return null;
      }
    }));
    clients.push(...results.filter(Boolean));
  }

  // Más recientes primero por inicio
  clients.sort((a, b) => (b.fInicio || 0) - (a.fInicio || 0));
  return clients;
}

function buscarDomIPExacto(nombre, domDatos) {
  if (!nombre || !domDatos || !Array.isArray(domDatos)) return null;
  const n = normNom(nombre);
  return domDatos.find(d => {
    const rawVal = d.cliente || d.nombre || d.CLIENTE || d.Cliente || '';
    const normVal = normNom(rawVal);
    return normVal === n;
  }) || null;
}

module.exports = {
  mapTasksToClients,
  computeTasksFingerprint,
  normNom,
  normCons,
  buscarDomIPExacto,
  getPais,
  getPlan,
  diasHab,
  obtenerHistorialEstadosActualizadoFromDetails,
  buscarFechaConcluidoFromDetails,
  extractAllCustomFieldsRaw,
  findCustomField,
  getCampo,
  detectarTipoImpl,
};
