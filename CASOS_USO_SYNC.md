# 📋 CASOS DE USO - SINCRONIZACIÓN BIDIRECCIONAL

## 🎯 Caso 1: Sprint Planning - Traer Información Completa

**Objetivo**: Cada sprint, traer toda la información de ClickUp actualizada

### Procedimiento

```javascript
// Ejecutar al inicio del sprint

// 1. Traer datos completos
const datosCompl = obtenerDatosCompletosClickUp();
console.log('📊 ' + datosCompl.length + ' tareas cargadas');

// 2. Filtrar por Sprint (usando tags)
const delSprint = datosCompl.filter(d => 
  d.tags.some(t => t.toLowerCase().includes('sprint-actual'))
);
console.log('🎯 ' + delSprint.length + ' tareas en sprint');

// 3. Filtrar por tipo
const implementaciones = delSprint.filter(d => 
  d.tags.some(t => t.toLowerCase().includes('implementacion-nueva'))
);
const upgrades = delSprint.filter(d => 
  d.tags.some(t => t.toLowerCase().includes('upgrade'))
);

console.log('📋 Implementaciones: ' + implementaciones.length);
console.log('📈 Upgrades: ' + upgrades.length);

// 4. Mostrar por consultor
const porConsultor = {};
delSprint.forEach(d => {
  const responsables = new Set();
  if (d.rKickoff) responsables.add(d.rKickoff);
  if (d.rCap) responsables.add(d.rCap);
  if (d.rAct) responsables.add(d.rAct);
  
  responsables.forEach(r => {
    if (!porConsultor[r]) porConsultor[r] = [];
    porConsultor[r].push(d.nombre);
  });
});

console.log('\n👥 Distribución de carga:');
Object.entries(porConsultor).forEach(([cons, tareas]) => {
  console.log(cons + ': ' + tareas.length + ' tareas');
  tareas.forEach(t => console.log('  - ' + t));
});
```

---

## 🎯 Caso 2: Detectar Cuellos de Botella

**Objetivo**: Identificar dónde se atascan las implementaciones

### Procedimiento

```javascript
const datos = obtenerDatosCompletosClickUp();

// 1. Clientes atrapados en Capacitación
const enCapacitacion = datos.filter(d => 
  d.estado.includes('capacitacion')
);

console.log('\n⏸️ CLIENTES EN CAPACITACIÓN (Posible cuello de botella)');
console.log('Total: ' + enCapacitacion.length + '\n');

enCapacitacion.forEach(d => {
  const ahora = new Date();
  const dias = Math.floor((ahora - d.fCreacion) / (1000 * 60 * 60 * 24));
  
  console.log('Cliente: ' + d.nombre);
  console.log('  Responsable Cap: ' + (d.rCap || 'SIN ASIGNAR'));
  console.log('  Días desde inicio: ' + dias);
  console.log('  Comentarios: ' + d.comentarios.length);
  
  // Mostrar últimos comentarios
  if (d.comentarios.length > 0) {
    console.log('  Último comentario:');
    const ultimo = d.comentarios[d.comentarios.length - 1];
    console.log('    - ' + ultimo.usuario + ': ' + ultimo.texto.substring(0, 50) + '...');
  }
  console.log('');
});

// 2. Identificar responsables sobrecargados
const carga = {};
datos.forEach(d => {
  if (d.rCap) {
    if (!carga[d.rCap]) carga[d.rCap] = [];
    carga[d.rCap].push(d);
  }
});

console.log('\n👥 CARGA DE RESPONSABLES DE CAPACITACIÓN');
Object.entries(carga)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([cons, tareas]) => {
    const enProceso = tareas.filter(t => t.estado === 'en_proceso').length;
    console.log(cons + ': ' + tareas.length + ' total (' + enProceso + ' en proceso)');
  });
```

---

## 🎯 Caso 3: Editar Responsable y Sincronizar

**Objetivo**: Cambiar responsable de capacitación y que se refleje en ClickUp

### Procedimiento

**Opción 1: Manual desde Sheets**

```
1. Abre la fila del cliente
2. Columna "R.Cap" → Escribe el nuevo responsable
3. Menú → "⬆️ Sincronizar Cambios → ClickUp"
4. ✅ En 1-2 segundos se actualiza en ClickUp
```

**Opción 2: Por Código (Batch)**

```javascript
// Reasignar todas las capacitaciones de un consultor
const datos = obtenerDatosCompletosClickUp();
const viejoResponsable = 'Consultor Anterior';
const nuevoResponsable = 'Consultor Nuevo';

const aReasignar = datos.filter(d => d.rCap === viejoResponsable);

console.log('📋 Reasignando ' + aReasignar.length + ' capacitaciones...\n');

aReasignar.forEach((tarea, idx) => {
  // Actualizar campo en ClickUp
  const resultado = actualizarCampoClickUp(
    tarea.id,
    { tipo: 'custom_field', id: 'resp_capacitacion' },
    nuevoResponsable
  );
  
  console.log(idx + 1 + '. ' + tarea.nombre + ' → ' + nuevoResponsable);
  
  if (!resultado.exito) {
    console.log('   ❌ ERROR: ' + resultado.error);
  }
  
  Utilities.sleep(500); // Evitar rate limit
});

console.log('\n✅ Reasignación completada');
```

---

## 🎯 Caso 4: Crear Alerta de SLA

**Objetivo**: Generar alertas cuando se excede el tiempo permitido

### Procedimiento

```javascript
const datos = obtenerDatosCompletosClickUp();
const ahora = new Date();

// Definir SLAs por etapa
const SLA = {
  kickoff: { dias: 3, nombre: 'Kickoff' },
  verificacion: { dias: 2, nombre: 'Verificación' },
  capacitacion: { dias: 7, nombre: 'Capacitación' },
  activacion: { dias: 2, nombre: 'Activación' }
};

const alertasSLA = [];

datos.forEach(tarea => {
  // Calcular tiempo por etapa desde historial
  tarea.historial.forEach((evento, idx) => {
    if (idx < tarea.historial.length - 1) {
      const estadoActual = evento.estado.toLowerCase();
      const proximoEvento = tarea.historial[idx + 1];
      
      const tiempoEtapa = (proximoEvento.fecha - evento.fecha) / (1000 * 60 * 60 * 24);
      
      // Verificar SLA
      Object.entries(SLA).forEach(([etapaKey, config]) => {
        if (estadoActual.includes(etapaKey) && tiempoEtapa > config.dias) {
          alertasSLA.push({
            cliente: tarea.nombre,
            etapa: config.nombre,
            dias: tiempoEtapa.toFixed(1),
            limite: config.dias,
            exceso: (tiempoEtapa - config.dias).toFixed(1),
            responsable: tarea.rCap || '—',
            severidad: tiempoEtapa > config.dias * 1.5 ? 'CRITICA' : 'ALTA'
          });
        }
      });
    }
  });
});

console.log('\n🚨 ALERTAS DE SLA EXCEDIDO\n');
console.log('Total alertas: ' + alertasSLA.length + '\n');

alertasSLA
  .sort((a, b) => parseFloat(b.exceso) - parseFloat(a.exceso))
  .forEach(alerta => {
    console.log(alerta.cliente);
    console.log('  ' + alerta.etapa + ': ' + alerta.dias + ' días (SLA: ' + alerta.limite + ' días)');
    console.log('  Exceso: ' + alerta.exceso + ' días');
    console.log('  Responsable: ' + alerta.responsable);
    console.log('  Severidad: ' + alerta.severidad);
    console.log('');
  });
```

---

## 🎯 Caso 5: Reporte de Rendimiento por Mes

**Objetivo**: Ver cómo le fue a cada consultor en el mes

### Procedimiento

```javascript
const datos = obtenerDatosCompletosClickUp();
const ahora = new Date();
const mesActual = ahora.getMonth();
const anioActual = ahora.getFullYear();

// Filtrar tareas completadas este mes
const delMes = datos.filter(d => {
  if (!d.fCierre) return false;
  return d.fCierre.getMonth() === mesActual && d.fCierre.getFullYear() === anioActual;
});

console.log('\n📊 RENDIMIENTO ' + ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesActual] + ' ' + anioActual);
console.log('Implementaciones completadas: ' + delMes.length + '\n');

// Agrupar por consultor
const porConsultor = {};

delMes.forEach(tarea => {
  const responsables = new Set();
  if (tarea.rKickoff) responsables.add(tarea.rKickoff);
  if (tarea.rCap) responsables.add(tarea.rCap);
  if (tarea.rAct) responsables.add(tarea.rAct);
  
  responsables.forEach(cons => {
    if (!porConsultor[cons]) {
      porConsultor[cons] = {
        nombre: cons,
        total: 0,
        dias: 0,
        horas: 0,
        activos: 0,
        cancelados: 0
      };
    }
    porConsultor[cons].total++;
    
    const dias = (tarea.fCierre - tarea.fCreacion) / (1000 * 60 * 60 * 24);
    porConsultor[cons].dias += dias;
    porConsultor[cons].horas += tarea.tiempoUsado;
    
    if (tarea.estado === 'concluido') porConsultor[cons].activos++;
    if (tarea.estado === 'cancelado') porConsultor[cons].cancelados++;
  });
});

// Mostrar ranking
console.log('🏆 RANKING DE CONSULTORES\n');

Object.values(porConsultor)
  .sort((a, b) => b.total - a.total)
  .forEach((cons, idx) => {
    const promDias = (cons.dias / cons.total).toFixed(1);
    const promHoras = (cons.horas / cons.total).toFixed(1);
    const tasa = ((cons.activos / cons.total) * 100).toFixed(0);
    
    console.log((idx + 1) + '. ' + cons.nombre);
    console.log('   Tareas: ' + cons.total + ' | Activos: ' + cons.activos + ' | Cancel: ' + cons.cancelados);
    console.log('   Promedio: ' + promDias + ' días | ' + promHoras + ' horas');
    console.log('   Tasa éxito: ' + tasa + '%\n');
  });
```

---

## 🎯 Caso 6: Identificar Clientes en Riesgo

**Objetivo**: Encontrar qué implementaciones pueden cancelarse

### Procedimiento

```javascript
const datos = obtenerDatosCompletosClickUp();
const ahora = new Date();

const enRiesgo = datos.filter(d => {
  // En proceso y...
  if (d.estado !== 'en_proceso') return false;
  
  // Más de 20 días
  const dias = (ahora - d.fCreacion) / (1000 * 60 * 60 * 24);
  if (dias < 20) return false;
  
  // Sin movimiento más de 7 días
  const diasSinMov = (ahora - d.fActualizacion) / (1000 * 60 * 60 * 24);
  if (diasSinMov < 7) return false;
  
  return true;
});

console.log('\n⚠️ CLIENTES EN RIESGO DE CANCELACIÓN\n');
console.log('Total: ' + enRiesgo.length + '\n');

enRiesgo
  .sort((a, b) => {
    const diasA = (ahora - a.fCreacion) / (1000 * 60 * 60 * 24);
    const diasB = (ahora - b.fCreacion) / (1000 * 60 * 60 * 24);
    return diasB - diasA;
  })
  .forEach(cliente => {
    const dias = Math.floor((ahora - cliente.fCreacion) / (1000 * 60 * 60 * 24));
    const diasSinMov = Math.floor((ahora - cliente.fActualizacion) / (1000 * 60 * 60 * 24));
    
    console.log('🚨 ' + cliente.nombre);
    console.log('   En proceso: ' + dias + ' días (SLA: 20)');
    console.log('   Sin movimiento: ' + diasSinMov + ' días');
    console.log('   Responsable: ' + (cliente.rCap || cliente.rKickoff || '—'));
    console.log('   Tags: ' + cliente.tags.join(', '));
    
    // Sugerir acción
    if (diasSinMov > 14) {
      console.log('   ⚠️ URGENTE: Contactar cliente y responsable');
    } else if (dias > 30) {
      console.log('   ⚠️ ALERTA: Replanificar o cancelar');
    }
    console.log('');
  });
```

---

## 🎯 Caso 7: Sincronizar Estados en Batch

**Objetivo**: Cambiar el estado de múltiples clientes a la vez

### Procedimiento

```javascript
// Cambiar todos los clientes en "Listo para Kickoff" a "En Kickoff"

const datos = obtenerDatosCompletosClickUp();
const aActualizar = datos.filter(d => 
  d.estado.toLowerCase() === 'listo para kickoff'
);

console.log('📋 Cambiando ' + aActualizar.length + ' clientes a "En Kickoff"...\n');

let actualizados = 0;
let errores = 0;

aActualizar.forEach((tarea, idx) => {
  const resultado = actualizarCampoClickUp(
    tarea.id,
    { tipo: 'status', id: '' },
    'en kickoff'
  );
  
  if (resultado.exito) {
    console.log('✅ ' + tarea.nombre);
    actualizados++;
  } else {
    console.log('❌ ' + tarea.nombre + ': ' + resultado.error);
    errores++;
  }
  
  // Esperar entre peticiones para evitar rate limit
  Utilities.sleep(500);
});

console.log('\n✅ Actualizados: ' + actualizados);
console.log('❌ Errores: ' + errores);
```

---

## 🎯 Caso 8: Exportar Datos para Presentación

**Objetivo**: Generar un resumen ejecutivo limpio

### Procedimiento

```javascript
const datos = obtenerDatosCompletosClickUp();
const ahora = new Date();

// Calcular métricas principales
const activos = datos.filter(d => d.estado === 'concluido').length;
const enProceso = datos.filter(d => d.estado === 'en_proceso').length;
const cancelados = datos.filter(d => d.estado === 'cancelado').length;

const promDias = datos.reduce((sum, d) => {
  return sum + ((d.fCierre || ahora - d.fCreacion) / (1000 * 60 * 60 * 24));
}, 0) / datos.length;

// Crear resumen
const resumen = {
  fecha: ahora.toLocaleDateString('es-ES'),
  totales: {
    implementaciones: datos.length,
    activos: activos,
    enProceso: enProceso,
    cancelados: cancelados,
    porcentajeExito: ((activos / datos.length) * 100).toFixed(1) + '%'
  },
  eficiencia: {
    promedioDias: promDias.toFixed(1),
    metaDias: 20,
    cumplimiento: promDias <= 20 ? '✅ Cumple' : '⚠️ Excede'
  },
  consultores: {},
  paises: {},
  alertas: generarAlertas(datos).length
};

console.log('\n📊 RESUMEN EJECUTIVO');
console.log('═══════════════════════════════════════');
console.log('Fecha: ' + resumen.fecha);
console.log('\n📋 TOTALES');
console.log('Total: ' + resumen.totales.implementaciones);
console.log('✅ Activos: ' + resumen.totales.activos + ' (' + ((resumen.totales.activos/resumen.totales.implementaciones)*100).toFixed(0) + '%)');
console.log('⚙️ En Proceso: ' + resumen.totales.enProceso);
console.log('❌ Cancelados: ' + resumen.totales.cancelados);
console.log('\n⏱️ EFICIENCIA');
console.log('Promedio: ' + resumen.eficiencia.promedioDias + ' días');
console.log('Meta: ' + resumen.eficiencia.metaDias + ' días');
console.log('Status: ' + resumen.eficiencia.cumplimiento);
console.log('\n🚨 ALERTAS');
console.log('Total: ' + resumen.alertas);

return resumen;
```

---

## 📞 NOTAS IMPORTANTES

✅ **Todos los casos funcionan con la sincronización bidireccional**
✅ **Los cambios se guardan en ClickUp automáticamente**
✅ **Puedes combinar casos para crear lógica más compleja**
✅ **Usa `Utilities.sleep(500)` entre peticiones para evitar rate limit**
✅ **Siempre revisa el log en Apps Script → Ejecuciones**

---

**Última actualización**: Abril 2026
