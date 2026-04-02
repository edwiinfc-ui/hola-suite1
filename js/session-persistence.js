/**
 * Sistema de Persistencia de Sesión Mejorado
 * Mantiene la sesión abierta aunque el usuario:
 * - Recargue la página
 * - Abra nuevas pestañas
 * - Cierre y abra el navegador (opcional)
 * 
 * Solo cierra la sesión cuando el usuario click en "Cerrar Sesión"
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE SESIÓN
// ═══════════════════════════════════════════════════════════════

const SESSION_CONFIG = {
  STORAGE_KEY_TOKEN: 'hola_suite_token',
  STORAGE_KEY_USER: 'hola_suite_user',
  STORAGE_KEY_CLICKUP: 'hola_suite_clickup',
  STORAGE_KEY_TIMESTAMP: 'hola_suite_timestamp',
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 horas
};

// ═══════════════════════════════════════════════════════════════
// GUARDAR SESIÓN EN LOCALSTORAGE
// ═══════════════════════════════════════════════════════════════

function guardarSesion(token, usuario, clickupData = null) {
  try {
    // Guardar token
    localStorage.setItem(SESSION_CONFIG.STORAGE_KEY_TOKEN, token);
    
    // Guardar usuario
    localStorage.setItem(SESSION_CONFIG.STORAGE_KEY_USER, JSON.stringify(usuario));
    
    // Guardar datos NO sensibles de ClickUp (nunca guardar API keys en el navegador)
    if (clickupData) {
      const safeClickup = {
        configured: Boolean(clickupData.configured),
        listId: clickupData.listId || ''
      };
      localStorage.setItem(SESSION_CONFIG.STORAGE_KEY_CLICKUP, JSON.stringify(safeClickup));
    }
    
    // Guardar timestamp para validar expiración
    localStorage.setItem(SESSION_CONFIG.STORAGE_KEY_TIMESTAMP, Date.now().toString());
    
    console.log('✅ Sesión guardada correctamente');
    return true;
  } catch (e) {
    console.error('❌ Error guardando sesión:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// RESTAURAR SESIÓN DESDE LOCALSTORAGE
// ═══════════════════════════════════════════════════════════════

function restaurarSesion() {
  try {
    const token = localStorage.getItem(SESSION_CONFIG.STORAGE_KEY_TOKEN);
    const userStr = localStorage.getItem(SESSION_CONFIG.STORAGE_KEY_USER);
    const clickupStr = localStorage.getItem(SESSION_CONFIG.STORAGE_KEY_CLICKUP);
    const timestamp = localStorage.getItem(SESSION_CONFIG.STORAGE_KEY_TIMESTAMP);
    
    // Verificar que todos los datos existan
    if (!token || !userStr) {
      console.log('ℹ️ No hay sesión guardada');
      return null;
    }
    
    // Verificar si la sesión expiró
    if (timestamp) {
      const tiempoTranscurrido = Date.now() - parseInt(timestamp);
      if (tiempoTranscurrido > SESSION_CONFIG.SESSION_TIMEOUT_MS) {
        console.log('⏰ Sesión expirada');
        limpiarSesion();
        return null;
      }
    }
    
    const usuario = JSON.parse(userStr);
    const clickupData = clickupStr ? JSON.parse(clickupStr) : null;
    
    console.log('✅ Sesión restaurada:', usuario.email);
    
    return {
      token,
      usuario,
      clickupData
    };
  } catch (e) {
    console.error('❌ Error restaurando sesión:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// LIMPIAR SESIÓN (Cerrar sesión explícitamente)
// ═══════════════════════════════════════════════════════════════

function limpiarSesion() {
  try {
    localStorage.removeItem(SESSION_CONFIG.STORAGE_KEY_TOKEN);
    localStorage.removeItem(SESSION_CONFIG.STORAGE_KEY_USER);
    localStorage.removeItem(SESSION_CONFIG.STORAGE_KEY_CLICKUP);
    localStorage.removeItem(SESSION_CONFIG.STORAGE_KEY_TIMESTAMP);
    
    console.log('✅ Sesión limpiada');
    return true;
  } catch (e) {
    console.error('❌ Error limpiando sesión:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SINCRONIZAR SESIÓN ENTRE PESTAÑAS
// ═══════════════════════════════════════════════════════════════

function configurarSincronizacionPestanas() {
  // Escuchar cambios en localStorage desde otras pestañas
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_CONFIG.STORAGE_KEY_TOKEN) {
      if (e.newValue === null) {
        // Otra pestaña cerró sesión
        console.log('⚠️ Sesión cerrada en otra pestaña');
        cerrarSesionLocal();
      } else if (e.newValue !== e.oldValue) {
        // Se inició sesión en otra pestaña
        console.log('✅ Nueva sesión detectada en otra pestaña');
        restaurarYMostrar();
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN AUXILIAR: RESTAURAR Y MOSTRAR
// ═══════════════════════════════════════════════════════════════

async function restaurarYMostrar() {
  const sesion = restaurarSesion();
  
  if (!sesion) {
    console.log('⚠️ No hay sesión válida para restaurar');
    return false;
  }
  
  try {
    // Actualizar variables globales
    APP.token = sesion.token;
    APP.currentUser = sesion.usuario;
    
    if (sesion.clickupData) {
      CONFIG.LIST_ID = sesion.clickupData.listId || CONFIG.LIST_ID;
    }
    
    // Mostrar dashboard
    const scr = document.getElementById('loginScreen');
    if (scr) {
      scr.style.transition = 'opacity .5s';
      scr.style.opacity = '0';
      
      setTimeout(() => {
        scr.classList.add('hidden');
        const mainApp = document.getElementById('mainApp');
        if (mainApp) {
          mainApp.classList.remove('hidden');
        }
        setUserUI(sesion.usuario);
        loadSavedData();
        syncClickUp();
        hideLoading();
      }, 500);
    }
    
    console.log('✅ Sesión restaurada y mostrada');
    return true;
  } catch (e) {
    console.error('❌ Error al restaurar y mostrar:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// VALIDAR SESIÓN AL CARGAR LA PÁGINA
// ═══════════════════════════════════════════════════════════════

function validarSesionAlCargar() {
  console.log('🔄 Validando sesión al cargar...');
  
  const sesion = restaurarSesion();
  
  if (sesion) {
    console.log('✅ Sesión válida encontrada');
    // Automaticamente restaurar
    setTimeout(() => {
      restaurarYMostrar();
    }, 500);
    return true;
  } else {
    console.log('ℹ️ No hay sesión válida - mostrar login');
    mostrarPantallaLogin();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CERRAR SESIÓN LOCALMENTE
// ═══════════════════════════════════════════════════════════════

function cerrarSesionLocal() {
  limpiarSesion();
  
  // Volver a la pantalla de login
  const mainApp = document.getElementById('mainApp');
  const loginScreen = document.getElementById('loginScreen');
  
  if (mainApp && loginScreen) {
    mainApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginScreen.style.opacity = '1';
  }
  
  console.log('✅ Sesión cerrada - volviendo a login');
}

// ═══════════════════════════════════════════════════════════════
// MEJORAR FUNCIÓN DE LOGIN EXISTENTE
// ═══════════════════════════════════════════════════════════════

async function doLoginMejorado() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const pass = document.getElementById('loginPassword')?.value;
  
  if (!email || !pass) {
    showError('Ingresa email y contraseña');
    return;
  }
  
  try {
    showLoading(true, 'Conectando...');
    
    // Llamar al endpoint de login
    const loginRes = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: pass
      })
    });
    
    if (!loginRes.ok) {
      const data = await loginRes.json();
      throw new Error(data.error || 'Credenciales incorrectas');
    }
    
    const data = await loginRes.json();
    const { token, user, clickup } = data;
    
    // ✅ GUARDAR SESIÓN EN LOCALSTORAGE
    guardarSesion(token, user, clickup);
    
    // Actualizar variables globales
    APP.token = token;
    APP.currentUser = user;
    
    if (clickup) {
      CONFIG.LIST_ID = clickup.listId || CONFIG.LIST_ID;
    }
    
    // Mostrar dashboard
    const scr = document.getElementById('loginScreen');
    scr.style.transition = 'opacity .5s';
    scr.style.opacity = '0';
    
    setTimeout(() => {
      scr.classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      setUserUI(user);
      loadSavedData();
      syncClickUp();
      hideLoading();
    }, 500);
    
  } catch (e) {
    hideLoading();
    console.error('Error:', e);
    showError('❌ ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// MEJORAR FUNCIÓN DE LOGOUT
// ═══════════════════════════════════════════════════════════════

function cerrarSesion() {
  // Limpiar sesión
  limpiarSesion();
  
  // Volver a login
  const mainApp = document.getElementById('mainApp');
  const loginScreen = document.getElementById('loginScreen');
  
  if (mainApp && loginScreen) {
    loginScreen.style.opacity = '1';
    mainApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
  
  // Limpiar datos globales
  APP.token = null;
  APP.currentUser = null;
  
  console.log('✅ Sesión cerrada correctamente');
  showInfo('Sesión cerrada');
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZAR AL CARGAR LA PÁGINA
// ═══════════════════════════════════════════════════════════════

// Agregar al final del script, en la función de inicialización:
/*
  // En el document.addEventListener('DOMContentLoaded', ...) existente:
  
  // Configurar sincronización entre pestañas
  configurarSincronizacionPestanas();
  
  // Validar sesión al cargar
  validarSesionAlCargar();
*/
