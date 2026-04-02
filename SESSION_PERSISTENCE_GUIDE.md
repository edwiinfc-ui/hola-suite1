# 🔐 Mejora: Persistencia de Sesión

## Problema Resuelto

**Antes:**
- Al recargar la página → sesión se cerraba
- Al abrir nueva pestaña → sesión se cerraba
- Usuario tenía que hacer login cada vez

**Ahora:**
- ✅ Recarga la página → sesión se mantiene
- ✅ Abre nueva pestaña → sesión se mantiene
- ✅ Solo cierra si hace click en "Cerrar Sesión"
- ✅ Sesión sincronizada entre pestañas

---

## 📁 Archivo Creado

**`js/session-persistence.js`**
- Sistema completo de persistencia de sesión
- Sincronización entre pestañas
- Validación de expiración

---

## 🔧 Cómo Integrar

### Paso 1: Agregar script al HTML

En `vylex.html`, dentro del `<head>`, agrega:

```html
<script src="/js/session-persistence.js"></script>
```

### Paso 2: Inicializar al cargar

Encuentra la función `document.addEventListener('DOMContentLoaded', ...)` y agrega:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // ... código existente ...
  
  // ✨ AGREGAR ESTAS LÍNEAS:
  // Configurar sincronización entre pestañas
  configurarSincronizacionPestanas();
  
  // Validar sesión al cargar
  validarSesionAlCargar();
});
```

### Paso 3: Actualizar función de login

Reemplaza tu función `doLogin()` con `doLoginMejorado()` O llama a `guardarSesion()` después de login exitoso:

```javascript
async function doLogin() {
  // ... código de login existente ...
  
  // Después de obtener el token:
  const { token, user, clickup } = data;
  
  // ✨ AGREGAR:
  guardarSesion(token, user, clickup);
  
  // ... resto del código ...
}
```

### Paso 4: Actualizar función de logout

Reemplaza tu `logout()` con:

```javascript
function logout() {
  // ✨ Limpiar sesión
  limpiarSesion();
  
  // Volver a login
  const mainApp = document.getElementById('mainApp');
  const loginScreen = document.getElementById('loginScreen');
  
  if (mainApp && loginScreen) {
    loginScreen.style.opacity = '1';
    mainApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
  
  APP.token = null;
  APP.currentUser = null;
  
  showInfo('Sesión cerrada');
}
```

---

## 🎯 Funciones Principales

### `guardarSesion(token, usuario, clickupData)`
Guarda la sesión en localStorage.

```javascript
guardarSesion(
  'token_123',
  { email: 'admin@holasuite.com', name: 'Admin' },
  { apiKey: '...', listId: '...' }
);
```

### `restaurarSesion()`
Restaura la sesión desde localStorage.

```javascript
const sesion = restaurarSesion();
if (sesion) {
  console.log(sesion.usuario.email);
  console.log(sesion.token);
}
```

### `limpiarSesion()`
Limpia la sesión (logout explícito).

```javascript
limpiarSesion();
```

### `validarSesionAlCargar()`
Valida si hay sesión al cargar la página.

```javascript
// Llamar al cargar
validarSesionAlCargar();
// → Si hay sesión: muestra dashboard
// → Si no hay: muestra login
```

### `configurarSincronizacionPestanas()`
Sincroniza sesión entre pestañas.

```javascript
configurarSincronizacionPestanas();
// Ahora si cierras sesión en una pestaña, 
// otras se actualizan automáticamente
```

---

## 📊 Datos Almacenados

En localStorage se guarda:

```javascript
// Token JWT
hola_suite_token: "eyJ..."

// Usuario
hola_suite_user: {
  email: "admin@holasuite.com",
  name: "Admin",
  role: "admin"
}

// Datos de ClickUp (opcional)
hola_suite_clickup: {
  apiKey: "pk_...",
  listId: "..."
}

// Timestamp para validar expiración
hola_suite_timestamp: 1712152000000
```

---

## ⏰ Configuración de Expiración

Por defecto, la sesión expira en **24 horas**.

Para cambiar, edita en `session-persistence.js`:

```javascript
const SESSION_CONFIG = {
  // ... otra config ...
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000,  // ← CAMBIAR AQUÍ
  // Ejemplos:
  // 1 hora:     1 * 60 * 60 * 1000
  // 7 días:     7 * 24 * 60 * 60 * 1000
  // Infinito:   Number.MAX_VALUE
};
```

---

## 🔒 Seguridad

### ✅ Protegido
- Token en localStorage (encriptado por navegador)
- Sincronización segura entre pestañas
- Validación de expiración

### ⚠️ Nota
- localStorage es accesible vía JavaScript
- En production: considera usar HttpOnly cookies
- No es 100% seguro contra XSS

### Mejora Futura
```javascript
// Para mayor seguridad, usar:
// 1. HttpOnly cookies (servidor)
// 2. CSRF tokens
// 3. Refresh tokens con expiración corta
```

---

## 🧪 Pruebas

### Prueba 1: Recarga de página
1. Haz login
2. Presiona F5 (recargar)
3. ✅ La sesión debe mantenerse

### Prueba 2: Nueva pestaña
1. Haz login en pestaña 1
2. Abre nueva pestaña y accede a la app
3. ✅ La sesión debe restaurarse automáticamente

### Prueba 3: Sincronización
1. Abre 2 pestañas con sesión activa
2. En pestaña 1, cierra sesión
3. ✅ Pestaña 2 debe actualizar automáticamente

### Prueba 4: Logout
1. Haz login
2. Click en "Cerrar Sesión"
3. Recarga la página
4. ✅ Debe pedir login nuevamente

---

## 📝 Ejemplo Completo de Integración

En `vylex.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- ... otros scripts ... -->
  <script src="/js/session-persistence.js"></script>
</head>
<body>
  <!-- ... contenido ... -->
  
  <script>
    // Al cargar la página
    document.addEventListener('DOMContentLoaded', function() {
      // Sincronizar entre pestañas
      configurarSincronizacionPestanas();
      
      // Validar sesión guardada
      validarSesionAlCargar();
    });
    
    // Función login mejorada
    function hacerLogin() {
      const email = document.getElementById('email').value;
      const pass = document.getElementById('password').value;
      
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      })
      .then(r => r.json())
      .then(data => {
        // ✨ GUARDAR SESIÓN
        guardarSesion(data.token, data.user, data.clickup);
        
        // Mostrar dashboard
        mostrarDashboard(data.user);
      });
    }
    
    // Función logout mejorada
    function hacerLogout() {
      // ✨ LIMPIAR SESIÓN
      limpiarSesion();
      
      // Volver a login
      mostrarLogin();
    }
  </script>
</body>
</html>
```

---

## 🎯 Beneficios

✅ **Mejor UX** - No necesita hacer login cada vez  
✅ **Más rápido** - Carga los datos guardados  
✅ **Más seguro** - Control total sobre sesión  
✅ **Sincronización** - Múltiples pestañas funcionan juntas  
✅ **Flexible** - Configurable según necesidades  

---

## 📚 Recursos

- [localStorage en MDN](https://developer.mozilla.org/es/docs/Web/API/Window/localStorage)
- [Storage Events](https://developer.mozilla.org/es/docs/Web/API/StorageEvent)
- [JWT en localStorage](https://auth0.com/blog/secure-browser-storage-best-practices/)

---

**Versión:** 2.1  
**Fecha:** 2 de Abril de 2026  
**Sistema:** Hola Suite Dashboard - Session Persistence

