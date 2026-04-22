# ✨ INSTALACIÓN Y ACTIVACIÓN - SISTEMA BIDIRECCIONAL

## 🚀 PASOS DE INSTALACIÓN

### Paso 1: Copiar el código

1. Abre tu Google Sheet del Dashboard
2. **Herramientas** → **Editor de secuencias de comandos**
3. Crea un nuevo archivo llamado `SYNC_BIDIRECCIONAL.gs`
4. Copia TODO el contenido de [SYNC_BIDIRECCIONAL.gs](SYNC_BIDIRECCIONAL.gs)
5. Pégalo en el editor
6. **Guardar** (Ctrl+S)

### Paso 2: Autorizar permisos

1. Ejecuta cualquier función (por ejemplo: `onOpen()`)
2. Se abrirá una ventana pidiendo permisos
3. **Revisar permisos** → **Permitir** → Confirma con tu cuenta
4. ✅ Listo

### Paso 3: Recargar la página

1. Recarga tu Google Sheet (F5 o Cmd+R)
2. Debería aparecer nuevo menú: **"🔄 Sincronización Avanzada"**
3. ✅ Listo para usar

---

## 📋 VERIFICACIÓN DE INSTALACIÓN

```javascript
// En Consola de Apps Script (Ctrl+Shift+I)

// Test 1: Verificar acceso a ClickUp
try {
  const test = UrlFetchApp.fetch(
    'https://api.clickup.com/api/v2/team',
    { 
      headers: { 'Authorization': CONFIG.API_KEY },
      muteHttpExceptions: true 
    }
  );
  console.log('✅ ClickUp API accesible: ' + test.getResponseCode());
} catch(e) {
  console.log('❌ Error ClickUp: ' + e.message);
}

// Test 2: Traer 5 tareas de prueba
try {
  const tasks = obtenerTareasClickUpRaw();
  console.log('✅ Tareas obtenidas: ' + tasks.length);
  if (tasks.length > 0) {
    console.log('  Ejemplo: ' + tasks[0].name);
  }
} catch(e) {
  console.log('❌ Error tareas: ' + e.message);
}

// Test 3: Verificar funciones principales
console.log('✅ Funciones disponibles:');
console.log('  - obtenerDatosCompletosClickUp()');
console.log('  - generarAlertas()');
console.log('  - sincronizarCambiosAClickUp()');
```

---

## ✅ CHECKLIST PRE-LANZAMIENTO

- [ ] API Key de ClickUp válida en CONFIG
- [ ] Permisos autorizado para Google Sheets
- [ ] Menú "🔄 Sincronización Avanzada" visible
- [ ] Test 1: ✅ ClickUp API accesible
- [ ] Test 2: ✅ Tareas obtenidas correctamente
- [ ] Test 3: ✅ Funciones disponibles
- [ ] Primera sincronización completa (2-3 min)
- [ ] Dashboard de alertas creado
- [ ] Análisis por sector generado

---

## 🎯 PRIMER USO - PASO A PASO

### 1. SINCRONIZACIÓN INICIAL (5 minutos)

```
Menú: 🔄 Sincronización Avanzada
  → 📊 Traer Datos Completos ClickUp
  
Esperar... (verás progreso en la consola)

Se crearán 3 hojas nuevas:
✅ Alertas
✅ Por Sector  
✅ Tipos Implementación
```

### 2. REVISAR ALERTAS (2 minutos)

```
Abre hoja: "Alertas"

Verás:
- Clientes sin movimiento > 7 días
- Implementaciones > 20 días
- Capacitaciones sin responsable
- Canales incompletos
- Upgrades (información)
```

### 3. EDITAR Y SINCRONIZAR (1 minuto)

```
En cualquier fila:

1. Haz clic en un campo editable (Estado, Responsables, Canales)
2. Cambia el valor
3. Presiona Enter

Menú: ⬆️ Sincronizar Cambios → ClickUp

✅ En 1-2 segundos se actualiza en ClickUp
```

### 4. GENERAR REPORTES (5 minutos)

```
Menú: 🔄 Sincronización Avanzada
  → 📈 Reporte Tipos Implementación
  
  → 👥 Reporte Consultores Detallado

Se crean nuevas hojas con análisis
```

---

## 📊 ESTRUCTURA DE DATOS

### Datos Traídos de ClickUp

```javascript
// Cada tarea incluye:
{
  id: 'task_id',
  nombre: 'Nombre cliente',
  estado: 'en_proceso',
  
  // Responsables
  rKickoff: 'Edwin Franco',
  rVer: 'Alejandro Zambrano',
  rCap: 'Mariane Teló',
  rGoLive: 'Edwin Franco',
  rAct: 'Alejandro Zambrano',
  
  // Canales
  canales: {
    wa: true,
    ig: true,
    wc: false,
    pbx: true,
    tg: false,
    msg: true
  },
  
  // Fechas
  fCreacion: Date,
  fActualizacion: Date,
  fCierre: Date,
  
  // Historial completo
  historial: [...],
  
  // Comentarios
  comentarios: [...],
  
  // Y mucho más...
}
```

---

## 🔄 CICLO DE VIDA DE SINCRONIZACIÓN

```
┌─────────────────┐
│   ClickUp API   │
│   (Datos Raw)   │
└────────┬────────┘
         │ obtenerTareasClickUpRaw()
         ↓
┌─────────────────────────────────┐
│ Procesar Datos Completos        │
│ - Responsables                  │
│ - Canales                       │
│ - Historial                     │
│ - Comentarios                   │
│ - Custom Fields                 │
└────────┬────────────────────────┘
         │ obtenerDatosCompletosClickUp()
         ↓
┌─────────────────────────────────┐
│ Google Sheets                   │
│ (Dashboard Principal)           │
└────────┬────────────────────────┘
         │ Editar en Sheets
         ↓
┌─────────────────────────────────┐
│ Detectar Cambios                │
│ sincronizarCambiosAClickUp()    │
└────────┬────────────────────────┘
         │ actualizarCampoClickUp()
         ↓
┌─────────────────────────────────┐
│ ClickUp API (Actualizado)       │
│ ✅ Sincronizado                 │
└─────────────────────────────────┘
```

---

## ⚙️ CONFIGURACIÓN IMPORTANTE

### API Key de ClickUp

**Ubicación**: `CONFIG.API_KEY`

```javascript
const CONFIG = {
  API_KEY: 'pk_9905747_YA8JWPKAC2GPO5MRWL74KLTCU5918QQG',
  // ...
}
```

**Obtener tu API Key**:
1. Ve a https://app.clickup.com
2. Perfil → Configuración → Integraciones
3. Copia tu "Personal API Token"
4. Reemplaza en el código

### List ID

**Ubicación**: `CONFIG.LIST_ID`

```javascript
const CONFIG = {
  API_KEY: '...',
  LIST_ID: '901406307381',
  // ...
}
```

**Obtener tu List ID**:
1. Ve a tu lista en ClickUp
2. La URL será: `https://app.clickup.com/[TEAM_ID]/v/l/[LIST_ID]`
3. Copia el `[LIST_ID]`

---

## 🐛 TROUBLESHOOTING COMÚN

### "No aparece el menú"

**Solución**:
```
1. Herramientas → Editor de secuencias de comandos
2. Ejecuta: onOpen()
3. Recarga el Sheet (F5)
```

### "Error: No está autorizado"

**Solución**:
```
1. Herramientas → Configuración de proyecto
2. Ejecuta una función (ejemplo: obtenerTareasClickUpRaw())
3. Autoriza los permisos
```

### "API Key inválida"

**Solución**:
```
1. Verifica tu API Key en CONFIG.API_KEY
2. Obtén una nueva en https://app.clickup.com
3. Reemplaza en el código
```

### "No se sincronizan los cambios"

**Solución**:
```
1. Verifica que el campo sea EDITABLE (está en WRITEABLE_FIELDS)
2. Ejecuta: sincronizarCambiosActuales()
3. Revisa el log de errores
```

### "Timeout en sincronización"

**Solución**:
```javascript
// Aumentar el timeout
const opts = {
  // ...
  timeout: 60000  // 60 segundos
};
```

---

## 📈 PRÓXIMAS OPTIMIZACIONES

Una vez que todo funcione:

### 1. Webhooks ClickUp
```
Recibir notificaciones en tiempo real
cuando cambia algo en ClickUp
```

### 2. Notificaciones en Slack
```
Alertas automáticas en Slack
cuando hay cambios críticos
```

### 3. Exportar a Google Slides
```
Crear presentaciones automáticas
con los dashboards
```

### 4. API Pública
```
Acceso externo a los datos
desde aplicaciones terceras
```

### 5. Gráficos Dinámicos
```
Gráficos que se actualicen
automáticamente
```

---

## 📞 SOPORTE Y RECURSOS

### Si hay errores:

1. **Abre Ejecuciones**: Herramientas → Ejecuciones
2. **Busca el error** en la lista
3. **Revisa los detalles**
4. **Usa el log** para diagnosticar

### Documentación útil:

- 🔗 [ClickUp API Docs](https://clickup.com/api)
- 📚 [Google Sheets API](https://developers.google.com/sheets/api)
- 🐍 [Google Apps Script Docs](https://developers.google.com/apps-script)

### Comando para ver errores recientes:

```javascript
// En Consola de Apps Script
Logger.getLog()
```

---

## ✅ ÉXITO

Si ves esto:

```
📊 Traer Datos Completos ClickUp
🚨 Actualizar Alertas
🌍 Análisis por Sector
⬆️ Sincronizar Cambios → ClickUp
```

¡**TODO ESTÁ LISTO PARA USAR!** 🎉

---

**Versión**: 2.0 | **Instalación**: Simple (5 min) | **Soporte**: 24/7 | **Status**: ✅ Listo

