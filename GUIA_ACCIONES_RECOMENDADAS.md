# 🎯 GUÍA DE ACCIONES RECOMENDADAS

## ¿Qué es esto?

Este sistema te muestra **QUÉ HACER** basado en los datos de ClickUp, no solo datos crudos.

## 🚨 ALERTAS Y QUÉ HACER

### 1. SIN MOVIMIENTO (> 7 días)
**Problema:** Tarea sin actualización por más de 7 días
**Acción recomendada:**
- ✅ Contactar a responsable
- ✅ Verificar si está bloqueado
- ✅ Actualizar estado o comentario en ClickUp

### 2. EXCEDIDA META (> 20 días total)
**Problema:** Implementación tomó más de lo estimado
**Acción recomendada:**
- ✅ Revisar qué fase está atrasada
- ✅ Añadir recursos si es posible
- ✅ Actualizar cliente si corresponde

### 3. SIN RESPONSABLE EN CAPACITACIÓN
**Problema:** Fase de capacitación sin capacitador asignado
**Acción recomendada:**
- ✅ Asignar capacitador inmediatamente
- ✅ Programar sesión
- ✅ Actualizar en ClickUp

### 4. SIN CANALES DE COMUNICACIÓN
**Problema:** Cliente no tiene canales configurados (WA, IG, etc.)
**Acción recomendada:**
- ✅ Contactar cliente para definir canales
- ✅ Configurar en Sheets
- ✅ Sincronizar a ClickUp

### 5. ESPERANDO CLIENTE
**Problema:** Tarea bloqueada esperando información/aprobación
**Acción recomendada:**
- ✅ Enviar recordatorio a cliente
- ✅ Dar fecha límite
- ✅ Escalar si es urgente

### 6. UPGRADE DETECTADO
**Problema:** Cliente tiene oportunidad de upgrade
**Acción recomendada:**
- ✅ Contactar equipo comercial
- ✅ Preparar propuesta
- ✅ Agendar reunión

---

## 📊 ANÁLISIS Y RECOMENDACIONES

### POR SECTOR (País)
**¿Qué mirar?**
- Tasa de implementaciones completadas
- Tiempo promedio por sector
- Alertas agrupadas por región

**Acciones:**
- Sector con baja tasa → Aumentar recursos
- Sector con alertas → Reunión de análisis
- Sector lider → Documentar prácticas

### POR TIPO DE IMPLEMENTACIÓN
**¿Qué mirar?**
- Nueva: ¿Cuántas se completaron?
- Upgrade: ¿Cuál es la conversión?
- Migración: ¿Cuál fue la duración?
- Expansión: ¿Qué clientes se expandieron?

**Acciones:**
- Tipo con alertas → Revisar proceso
- Tipo exitoso → Documentar
- Tipo con problemas → Capacitación

### POR CONSULTOR
**¿Qué mirar?**
- Carga de trabajo
- Implementaciones completadas
- Tiempo promedio
- Especialidad

**Acciones:**
- Sobrecargado → Reasignar tareas
- Bajo desempeño → Capacitación
- Alto desempeño → Asignar líderes

---

## 🔄 CÓMO USAR (Paso a Paso)

### PASO 1: Traer Datos
```
Menú → 📊 Traer Datos Completos ClickUp
```
Espera 2-3 minutos. Se crean automáticamente:
- Hoja "Alertas" → Problemas actuales
- Hoja "Por Sector" → Análisis regional
- Hoja "Tipos Impl" → Segmentación

### PASO 2: Revisar Alertas
```
Abre hoja "Alertas"
```
Ve en orden de prioridad:
- 🔴 CRÍTICA (actúa hoy)
- 🟠 ALTA (actúa esta semana)
- 🟡 MEDIA (actúa en 2 semanas)
- 🔵 BAJA (información)

### PASO 3: Tomar Acción
Para cada alerta:
1. Lee el mensaje
2. Busca la tarea en ClickUp o Sheets
3. Ejecuta acción recomendada (arriba)
4. Actualiza estado/comentario

### PASO 4: Sincronizar
Si editas en Sheets:
```
Menú → ⬆️ Sincronizar Cambios → ClickUp
```
Cambios se reflejan en ClickUp automáticamente

---

## 💡 CASOS COMUNES

### CASO: Cliente sin capacitador asignado
**Alerta:** "SIN_RESPONSABLE en Capacitación"
```
1. Abre Sheets
2. Encuentra fila del cliente
3. Columna "R.Cap" → Escribe nombre del capacitador
4. Presiona Enter
5. Menú → Sincronizar → ClickUp
6. LISTO: Actualizado en ClickUp
```

### CASO: Implementación lleva 25 días (meta: 20)
**Alerta:** "EXCEDIDA_META"
```
1. Lee el mensaje: "XYZ implementación lleva 25 días"
2. Abre ClickUp tarea
3. Analiza qué fase está lenta
4. Si es Capacitación: Añade 2do capacitador
5. Si es GoLive: Acelera configuración
6. Actualiza comentario en ClickUp
7. Próxima sincronización lo muestra
```

### CASO: Tarea sin movimiento 10 días
**Alerta:** "SIN_MOVIMIENTO"
```
1. Lee: "Cliente ABC sin movimiento 10 días"
2. Contacta al responsable
3. Pregunta: ¿Está bloqueado? ¿Necesita help?
4. Actualiza en ClickUp (comentario/estado)
5. Sincroniza cambios
6. Alerta desaparece
```

### CASO: 3 clientes esperan GoLive
**Reporte:** "Por Sector" muestra clientes en GoLive
```
1. Ve hoja "Por Sector"
2. Busca país con más "en_proceso"
3. Filtra por ese país
4. Ve qué está retrasando
5. Acelera coordinación
```

---

## 📈 MÉTRICAS A MONITOREAR

| Métrica | Objetivo | Acción si falla |
|---------|----------|-----------------|
| Promedio días implementación | < 20 | Revisar proceso |
| % completadas en meta | > 80% | Aumentar recursos |
| Alertas activas | < 10 | Resolverlas todas |
| Clientes sin responsable | 0 | Asignar inmediato |
| Tiempo sin movimiento | < 2 días | Mejorar comunicación |

---

## 🎯 FRECUENCIA RECOMENDADA

- **Diariamente:** Ver hoja "Alertas" (5 min)
- **3x semana:** Ejecutar sincronización (2 min)
- **Semanalmente:** Revisar "Por Sector" (15 min)
- **Mensualmente:** Análisis completo (1 hora)

---

## ⚙️ CONFIGURACIÓN AVANZADA

Si necesitas:
- Cambiar qué campos se sincronizan
- Modificar fórmulas de alertas
- Ajustar colores de dashboards

Ver: `GUIA_SYNC_BIDIRECCIONAL.md` → Sección "Configuración"

---

**¿Preguntas?** Revisar `CASOS_USO_SYNC.md` para más ejemplos.
