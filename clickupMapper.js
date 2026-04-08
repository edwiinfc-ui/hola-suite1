'use strict';

const crypto = require('crypto');

const DEFAULT_CONFIG = {
  DIAS_ALERTA: 7,
  DIAS_META: { kickoff: 3, verificacion: 2, instalacion: 5, capacitacion: 7, activacion: 2, total: 20 },
  PAISES: {},
  FERIADOS: {},
  TAREAS_IGNORAR: [],
  ESTADOS_IGNORAR: [],
  ESTADOS_IMPL: []
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
  // Mantener el formato dd/MM/yyyy del Apps Script
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

function findCustomField(cf, names) {
  const normalizedNames = names.map(normalizeText);
  let bestMatch = null;

  (cf || []).forEach(field => {
    const fieldName = normalizeText(field?.name);
    normalizedNames.forEach(name => {
      const exactScore = fieldName === name ? 3 : 0;
      const startsWithScore = !exactScore && fieldName.startsWith(name) ? 2 : 0;
      const includesScore = !exactScore && !startsWithScore && fieldName.includes(name) ? 1 : 0;
      const score = exactScore || startsWithScore || includesScore;
      if (score && (!bestMatch || score > bestMatch.score)) bestMatch = { field, score };
    });
  });

  return bestMatch ? bestMatch.field : undefined;
}

function getCampo(cf, nom, tipo) {
  const f = (cf || []).find(x => String(x?.name || '').toLowerCase().includes(String(nom || '').toLowerCase()));
  if (!f) return tipo === 'number' ? 0 : '';

  try {
    switch (tipo) {
      case 'number':
        return parseFloat(f.value) || 0;
      case 'date':
        return f.value ? parseInt(f.value, 10) : null;
      case 'dropdown': {
        if (!f.value && f.value !== 0) return '';
        if (f.type_config?.options) {
          const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value, 10) || x.id === f.value);
          return o ? (o.name || o.label || '') : '';
        }
        return String(f.value);
      }
      case 'email':
      case 'text': {
        if (!f.value && f.value !== 0) return '';
        if (typeof f.value === 'string') return f.value.trim();
        if (f.type_config?.options) {
          const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value, 10) || x.id === f.value);
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
  const f = (cf || []).find(x => {
    const nombreCampo = String(x?.name || '').toLowerCase().trim();
    return nombreCampo === 'país' || nombreCampo === 'pais';
  });
  if (!f) return '';
  if (!f.value && f.value !== 0) return '';

  try {
    if (f.type_config?.options) {
      const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value, 10) || x.id === f.value);
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

function getPlan(cf) {
  const f = (cf || []).find(x => String(x?.name || '').toLowerCase().trim() === 'plan');
  if (!f) return '';
  if (!f.value && f.value !== 0) return '';

  try {
    if (f.type_config?.options) {
      const o = f.type_config.options.find(x => x.orderindex === parseInt(f.value, 10) || x.id === f.value);
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

function normCons(n) {
  if (!n || n === 'N/A' || n === '' || n === '-') return '';
  const l = String(n || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const consultoresMap = {
    'edwin leonardo franco campos': 'Edwin Franco',
    'edwin franco campos': 'Edwin Franco',
    'edwin leonardo franco': 'Edwin Franco',
    'edwin l franco campos': 'Edwin Franco',
    'edwin l. franco campos': 'Edwin Franco',
    'edwin l franco': 'Edwin Franco',
    'edwin franco': 'Edwin Franco',
    'franco edwin': 'Edwin Franco',
    'edwin': 'Edwin Franco',
    'franco': 'Edwin Franco',
    'e. franco': 'Edwin Franco',
    'edwin f': 'Edwin Franco',
    'e franco': 'Edwin Franco',

    'alejandro jose zambrano': 'Alejandro Zambrano',
    'alejandro josé zambrano': 'Alejandro Zambrano',
    'alejandro j zambrano': 'Alejandro Zambrano',
    'alejandro j. zambrano': 'Alejandro Zambrano',
    'alejandro zambrano': 'Alejandro Zambrano',
    'zambrano alejandro': 'Alejandro Zambrano',
    'alejandro': 'Alejandro Zambrano',
    'zambrano': 'Alejandro Zambrano',
    'alex zambrano': 'Alejandro Zambrano',
    'a. zambrano': 'Alejandro Zambrano',
    'a zambrano': 'Alejandro Zambrano',

    'mariane aparecida telo': 'Mariane Teló',
    'mariane aparecida télo': 'Mariane Teló',
    'mariane a telo': 'Mariane Teló',
    'mariane a. telo': 'Mariane Teló',
    'mariane telo': 'Mariane Teló',
    'mariane télo': 'Mariane Teló',
    'telo mariane': 'Mariane Teló',
    'mariane': 'Mariane Teló',
    'telo': 'Mariane Teló',
    'mari telo': 'Mariane Teló',
    'mari': 'Mariane Teló',
    'mariane t': 'Mariane Teló',
    'm. telo': 'Mariane Teló',
    'm telo': 'Mariane Teló'
  };

  if (consultoresMap[l]) return consultoresMap[l];
  for (const [key, value] of Object.entries(consultoresMap)) {
    if (l.includes(key)) return value;
  }
  for (const [key, value] of Object.entries(consultoresMap)) {
    if (key.includes(l) && l.length >= 4) return value;
  }
  return '';
}

function debeIgnorarTarea(tarea, cfg) {
  const nombreNorm = String(tarea?.name || '').toLowerCase().trim();
  return (cfg.TAREAS_IGNORAR || []).some(t => nombreNorm.includes(String(t || '').toLowerCase().trim()));
}

function debeIgnorarPorEstado(tarea, cfg) {
  const status = String(tarea?.status?.status || '').toLowerCase();
  
  // Si no hay lista de estados a ignorar, no ignoramos nada por estado
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
    const campo = (cf || []).find(x => String(x?.name || '').toLowerCase().includes(String(termino || '').toLowerCase()));
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

    if (campo.type_config?.options && (campo.value || campo.value === 0)) {
      const opcion = campo.type_config.options.find(opt => opt.orderindex === parseInt(campo.value, 10) || opt.id === campo.value);
      if (opcion && (opcion.name || opcion.label)) {
        const nombreOpcion = (opcion.name || opcion.label).trim();
        if (nombreOpcion && nombreOpcion.length > 2) return [nombreOpcion];
      }
    }
  }

  return [];
}

function procesarResponsable(array) {
  if (!array || array.length === 0) return '';
  const primero = array[0];
  if (!esNombreValido(primero)) return '';
  const normConsultor = normCons(primero);
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

    const sorted = [...history].sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));
    let etapaAnterior = 'Creado';
    if (sorted.length >= 2) etapaAnterior = sorted[sorted.length - 2].status || 'N/A';

    const diasPorEtapa = { kickoff: 0, verificacion: 0, instalacion: 0, capacitacion: 0, activacion: 0 };
    const historiaPausa = [];
    const pais = 'No definido';

    for (let i = 0; i < sorted.length; i++) {
      const estado = String(sorted[i]?.status || '').toLowerCase();
      const fechaInicio = new Date(parseInt(sorted[i]?.date, 10));
      const fechaFin = i < sorted.length - 1 ? new Date(parseInt(sorted[i + 1]?.date, 10)) : new Date();
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
      if ((estadoLower.includes('conclu') || estadoLower === 'closed') && h?.date) {
        return new Date(parseInt(h.date, 10));
      }
    }
    return null;
  } catch (_e) {
    return null;
  }
}

async function procesarTareaActualizadaNode(t, allTasks, cfg, ctx) {
  const cf = t.custom_fields || [];
  const tz = ctx?.tz || 'UTC';
  const ahora = new Date();
  const creado = new Date(parseInt(t.date_created, 10));
  const actualizado = new Date(parseInt(t.date_updated, 10));
  const cerrado = t.date_closed ? new Date(parseInt(t.date_closed, 10)) : null;

  const id = t.id;
  const nombre = t.name;
  const link = t.url;
  const estado = t.status.status;
  const eLower = String(estado || '').toLowerCase();

  let fInicioKickoff = getCampo(cf, 'Fecha Inicio Kickoff', 'date');
  if (!fInicioKickoff) fInicioKickoff = getCampo(cf, 'Fecha Inicio Onboarding', 'date');
  const fInicio = fInicioKickoff ? new Date(fInicioKickoff) : creado;

  let fActiv = null;
  let fCanc = null;
  let fConcluido = null;

  const esConcluido = eLower.includes('conclu') || eLower === 'closed' || eLower === 'cerrado';
  const esCancelado = eLower === 'cancelado';

  let taskDetails = null;
  if (typeof ctx?.fetchTaskDetails === 'function') {
    taskDetails = await ctx.fetchTaskDetails(id);
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
    'responsable por el kickoff',
    'responsable kickoff',
    'responsable por el kick',
    'responsable onboarding',
    'responsable por el onboarding'
  ]);
  const rVerArray = buscarResponsable(cf, [
    'responsable por el análisis',
    'responsable por el analisis',
    'responsable por verificación',
    'responsable por verificacion',
    'responsable verificación',
    'responsable verificacion'
  ]);
  const rCapArray = buscarResponsable(cf, [
    'responsable por capacitación',
    'responsable por capacitacion',
    'responsable capacitación',
    'responsable capacitacion'
  ]);
  const rGoLiveArray = buscarResponsable(cf, [
    'responsable por el go-live',
    'responsable por el go live',
    'responsable go-live',
    'responsable go live'
  ]);
  const rActArray = buscarResponsable(cf, [
    'responsable por la activación',
    'responsable por la activacion',
    'responsable activación',
    'responsable activacion'
  ]);
  const rPBXArray = buscarResponsable(cf, ['resposable por pbx', 'responsable pbx']);
  const rFacArray = buscarResponsable(cf, ['responsable facturación', 'responsable facturacion']);
  const rComArray = buscarResponsable(cf, ['responsable comercial']);

  let fuente = 'ClickUp';

  let rKickoff = procesarResponsable(rKickoffArray);
  let rVer = procesarResponsable(rVerArray);
  let rGoLive = procesarResponsable(rGoLiveArray);
  let rAct = procesarResponsable(rActArray);
  let rPBX = rPBXArray.length > 0 ? rPBXArray.map(n => limpiarNombre(n)).join(', ') : '';
  let rFac = procesarResponsable(rFacArray);
  let rCom = procesarResponsable(rComArray);

  let rCap = '';
  let rCap2 = '';
  let capR1 = 0;
  let capR2 = 0;

  let cantCap = getCampo(cf, 'cantidad de capacitaciones', 'number') || 0;
  const capR1Field = (cf || []).find(x => String(x?.name || '').toLowerCase().includes('cantidad de capacitaciones r1'));
  const capR2Field = (cf || []).find(x => String(x?.name || '').toLowerCase().includes('cantidad de capacitaciones r2'));
  if (capR1Field?.value) capR1 = parseFloat(capR1Field.value) || 0;
  if (capR2Field?.value) capR2 = parseFloat(capR2Field.value) || 0;

  if (rCapArray.length > 0) {
    const consultoresValidos = rCapArray
      .filter(n => esNombreValido(n))
      .map(n => {
        const normConsultor = normCons(n);
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
      if (!ipPrimaria) ipPrimaria = backup.ip || backup.ipPrimaria;
      if (!ipSecundaria) ipSecundaria = backup.ipSecundaria;
      if (!dominioPrincipal) dominioPrincipal = backup.dominio || backup.dominioPrincipal;
      if (!dominio2) dominio2 = backup.dominio2;
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

  function buscarCampo(terminos, tipo = 'text') {
    for (const termino of terminos) {
      const campo = (cf || []).find(x => String(x?.name || '').toLowerCase().includes(String(termino || '').toLowerCase()));
      if (!campo) continue;
      switch (tipo) {
        case 'number':
          return parseFloat(campo.value) || 0;
        case 'dropdown': {
          if (!campo.value && campo.value !== 0) return '';
          if (campo.type_config?.options) {
            const opcion = campo.type_config.options.find(x => x.orderindex === parseInt(campo.value, 10));
            return opcion ? opcion.name : '';
          }
          return '';
        }
        default:
          return campo.value ? String(campo.value) : '';
      }
    }
    return tipo === 'number' ? 0 : '';
  }

  const mesICap = buscarCampo(['mes de inicio capacit'], 'dropdown');
  const mesFCap = buscarCampo(['mes de finalización ca', 'mes fin capacit'], 'dropdown');
  let mesAct = '';
  const reunCap = buscarCampo(['cantidad de reuniones'], 'number');
  const hCap = buscarCampo(['horas de capacitación', 'cantidad de horas'], 'number');

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

  const canField = findCustomField(cf, ['canales contratados']);
  let canalesArray = [];
  if (canField?.value && Array.isArray(canField.value)) {
    const opciones = canField.type_config?.options || [];
    canField.value.forEach(item => {
      let label = '';
      if (typeof item === 'string') {
        const opcion = opciones.find(opt => opt.id === item);
        label = opcion ? (opcion.label || opcion.name || '') : item;
      } else if (typeof item === 'object' && item !== null) {
        label = item.label || item.name || item.value || '';
      } else if (typeof item === 'number') {
        const opcion = opciones.find(opt => opt.orderindex === item || opt.id === item);
        if (opcion) label = opcion.name || opcion.label || '';
      }
      if (label && label.trim() !== '') canalesArray.push(label.toLowerCase().trim());
    });
  }

  const wa = esConcluido ? 'SÍ' : (canalesArray.some(c => c.includes('whatsapp')) ? 'SÍ' : 'NO');
  const ig = canalesArray.some(c => c.includes('instagram')) ? 'SÍ' : 'NO';
  const wc = canalesArray.some(c => c.includes('webchat')) ? 'SÍ' : 'NO';
  const pbx = canalesArray.some(c => c.includes('pbx') || c.includes('telefonia') || c.includes('telefonía')) ? 'SÍ' : 'NO';
  const tg = canalesArray.some(c => c.includes('telegram')) ? 'SÍ' : 'NO';
  const msg = canalesArray.some(c => c.includes('messenger')) ? 'SÍ' : 'NO';
  const telCanal = pbx;

  const tagsArray = t.tags ? t.tags.map(tag => String(tag?.name || '').toLowerCase()) : [];
  const tagsStr = tagsArray.join(',');

  let upgImpl = 'NO';
  let upgPost = 'NO';
  let upgradeOrigID = '';

  if (tagsStr.includes('upgrade') || (cf.find(f => String(f?.name || '').toLowerCase().includes('tipo de implem'))?.value?.toString() === '1')) {
    if (!esConcluido) upgImpl = 'SÍ';
  }

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
  const email = getCampo(cf, 'E-mail', 'email');
  const telefono = getCampo(cf, 'Número para contacto', 'text');

  const tipoF = cf.find(f => String(f?.name || '').toLowerCase().includes('tipo de implem'));
  const tipo = tipoF?.value?.toString() === '1' ? 'Upgrade' : 'Implementación';

  const consCom = rKickoff && rKickoff === rVer && rVer === rCap && rCap === rGoLive && rGoLive === rAct && rKickoff !== '' ? 'SÍ' : 'NO';
  const mesInicio = formatearMesAnio(fInicio);
  const mesFin = fConcluido ? formatearMesAnio(fConcluido) : 'N/A';

  return {
    id,
    nombre,
    url: link,
    estado,
    etapaAnterior,
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
    status,
    alerta,
    dSinMov,
    usoPlat,
    dUsoTotal: dUsoTot,
    mUsoTotal: mUsoTot,
    motivo,
    canales: { wa, ig, wc, pbx, tg, msg, tel: telCanal },
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
    mesFin
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
  for (const t of filtered) {
    // Nota: esta función puede ser lenta si ctx.fetchTaskDetails hace una llamada por tarea.
    const client = await procesarTareaActualizadaNode(t, filtered, cfg, { ...ctx, tz });
    clients.push(client);
  }

  // Misma orden que server.js: más recientes primero por inicio
  clients.sort((a, b) => (b.fInicio || 0) - (a.fInicio || 0));
  return clients;
}

function buscarDomIPExacto(nombre, domDatos) {
  if (!nombre || !domDatos || !Array.isArray(domDatos)) return null;
  const n = String(nombre || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  return domDatos.find(d => {
    const rawVal = d.cliente || d.nombre || d.CLIENTE || d.Cliente || '';
    const normVal = String(rawVal).toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return normVal === n;
  }) || null;
}

module.exports = {
  mapTasksToClients,
  computeTasksFingerprint,
  normNom,
  buscarDomIPExacto,
  getPais,
  getPlan,
  normCons,
  diasHab,
  obtenerHistorialEstadosActualizadoFromDetails,
  buscarFechaConcluidoFromDetails
};



