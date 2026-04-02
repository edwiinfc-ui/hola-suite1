# 🔗 SOLUCIONAR CONEXIÓN A CLICKUP

## ❌ Problema
"No está conectando con ClickUp"

## ✅ Solución

### PASO 1: Obtener Credenciales de ClickUp

**Opción A - API Key:**
1. Ve a https://app.clickup.com/settings/account
2. En "Apps" → "Integrations"
3. Busca "API token"
4. Genera o copia tu API token
5. Guárdalo en un lugar seguro

**Opción B - List ID:**
1. Ve a https://app.clickup.com
2. Abre tu Workspace
3. Haz clic en una Lista
4. En la URL verás: `list/xxxxxxxxxx`
5. Ese número es tu **List ID**

### PASO 2: Configurar en la App

**En el navegador:**
1. Abre https://hola-suite.vercel.app
2. Ve a la sección **Configuración** (abajo del menú)
3. Busca **"Conexión ClickUp"**
4. Llena los campos:

```
┌──────────────────────────────────────────┐
│ Fuente principal: ClickUp                │
├──────────────────────────────────────────┤
│ API Key: [pega tu API token aquí]        │
│ List ID: [pega tu list ID aquí]          │
└──────────────────────────────────────────┘
```

5. Click en **"Guardar"**

### PASO 3: Probar Conexión

**Opción A - Botón Sincronizar:**
1. Arriba a la izquierda hay un botón ⟳ (Sincronizar)
2. Haz click
3. Espera a que termine
4. Deberías ver: "X clientes sincronizados desde ClickUp"

**Opción B - Verificar en Console:**
1. Presiona F12 (DevTools)
2. Ve a Console
3. Busca mensajes tipo:
   - ✅ "Conectando con ClickUp..."
   - ✅ "X clientes sincronizados"
   - ❌ O errores si algo falla

### PASO 4: Si Sigue Sin Funcionar

**Verifica:**

| Problema | Solución |
|----------|----------|
| "HTTP 401" | API Key incorrecta o expirada |
| "HTTP 404" | List ID incorrecto |
| "Sin datos" | ClickUp vacío o tareas cerradas |
| "CORS error" | Problema de servidor Vercel |

**Si es CORS o HTTP error:**
1. Contacta al admin del servidor
2. O usa datos locales (JSON) por ahora

---

## 📋 Pasos Exactos (Copiar-Pega)

### 1. Obtener API Key
```
https://app.clickup.com/settings/account → Apps → API token → Copiar
```

### 2. Obtener List ID
```
https://app.clickup.com → Click en Lista → URL contiene list/XXXXXXXX
```

### 3. Configurar en la app
```
Configuración → Conexión ClickUp → Pegar credenciales → Guardar
```

### 4. Sincronizar
```
Click en botón ⟳ → Sincronizar → Esperar resultado
```

---

## 🧪 Verificación Rápida

En DevTools Console, ejecuta:

```javascript
// Ver configuración actual
console.log('API Key:', document.getElementById('cfgApiKey')?.value);
console.log('List ID:', document.getElementById('cfgListId')?.value);

// Probar conexión
fetch('https://api.clickup.com/api/v2/team', {
  headers: {
    Authorization: 'pk_xxxxx', // tu API key
    'Content-Type': 'application/json'
  }
}).then(r => r.json()).then(d => console.log('✅ Conectado:', d))
```

Si ves "✅ Conectado", las credenciales son correctas.

---

## 📊 Estado de Sincronización

Después de sincronizar, verifica:

1. **Dashboard Principal**: Deberías ver X clientes
2. **Estado en la app**: Debe mostrar "ClickUp" en la esquina
3. **Datos en tabla**: Las filas deben tener información real
4. **Timestamps**: "Sincronizado hace X segundos"

---

## 🔄 Cómo Sincronizar Automáticamente

**Opción 1 - Manual:**
- Click en botón ⟳ cada vez que quieras actualizar

**Opción 2 - Automático (cada 10 minutos):**
- En Configuración, activa "Sincronización automática"
- La app se sincronizará sola en background

---

## ❓ Preguntas Frecuentes

**P: ¿Mi API Key es segura?**
A: Se guarda en localStorage. Usa una API Key con permisos limitados si es posible.

**P: ¿Qué datos se sincronizan?**
A: Todos los campos de tareas de ClickUp → Se convierten a clientes.

**P: ¿Puedo sincronizar múltiples listas?**
A: Por ahora solo una. Para múltiples, necesita desarrollo adicional.

**P: ¿Funciona offline?**
A: No. La app necesita internet para conectar con ClickUp.

---

## 🚨 Si Nada Funciona

1. Verifica que tienes internet
2. Verifica que la App está en https://hola-suite.vercel.app
3. Verifica que ClickUp no está en mantenimiento
4. Limpia caché (Ctrl+Shift+Delete)
5. Abre nueva ventana privada
6. Si persiste, contáctame con el error exacto de Console (F12)

---

**Versión:** 1.0
**Fecha:** 2 de Abril de 2026
**Status:** ✅ Guía Completa

