'use strict';

/**
 * ============================================================================
 * OPTIMIZACIONES Y MEJORAS CRÍTICAS PARA EL SISTEMA VY-LEX
 * ============================================================================
 * 
 * Este archivo contiene funciones mejoradas para:
 * 1. Retry y backoff exponencial
 * 2. Validación de credenciales
 * 3. Manejo de errores robusto
 * 4. Sincronización bidireccional
 * 5. Caché inteligente
 * 
 * ============================================================================
 */

const crypto = require('crypto');

// ================================================================
// 1. UTILIDADES DE RETRY Y BACKOFF
// ================================================================

/**
 * Ejecutar función con reintentos y backoff exponencial
 * 
 * @param {Function} fn - Función a ejecutar
 * @param {number} maxRetries - Máximo de reintentos (default 3)
 * @param {number} initialDelayMs - Delay inicial en ms (default 1000)
 * @param {number} maxDelayMs - Delay máximo en ms (default 60000)
 * @returns {Promise}
 * 
 * Ejemplo:
 * const result = await retryWithBackoff(
 *   () => fetchFromClickUp(),
 *   3,
 *   1000,
 *   30000
 * );
 */
async function retryWithBackoff(
  fn,
  maxRetries = 3,
  initialDelayMs = 1000,
  maxDelayMs = 60000
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Attempt ${attempt + 1}/${maxRetries + 1}] Ejecutando...`);
      return await fn();
    } catch (err) {
      lastError = err;
      
      // No reintentar si es error de validación (400)
      if (err.statusCode === 400 || err.statusCode === 401) {
        console.error(`[No retry] Error de validación: ${err.message}`);
        throw err;
      }
      
      // No reintentar si es último intento
      if (attempt === maxRetries) {
        console.error(`[Max retries reached] ${err.message}`);
        throw err;
      }
      
      // Calcular delay con backoff exponencial
      const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
      const jitterDelay = Math.random() * 1000; // Jitter: 0-1000ms
      const delayMs = Math.min(exponentialDelay + jitterDelay, maxDelayMs);
      
      console.warn(
        `[Retry ${attempt + 1}/${maxRetries}] ${err.message} ` +
        `Reintentando en ${delayMs.toFixed(0)}ms...`
      );
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Realizar múltiples requests en paralelo con límite de concurrencia
 */
function createLimitedConcurrencyQueue(maxConcurrent = 3) {
  let active = 0;
  const queue = [];
  
  const runNext = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    
    const { fn, resolve, reject } = queue.shift();
    active++;
    
    Promise.resolve()
      .then(() => fn())
      .then(resolve, reject)
      .finally(() => {
        active--;
        runNext();
      });
  };
  
  return (fn) => {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

// ================================================================
// 2. VALIDACIÓN DE CREDENCIALES
// ================================================================

/**
 * Validar que la API key de ClickUp es válida
 */
async function validateClickUpApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key de ClickUp no configurada');
  }
  
  try {
    const resp = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: apiKey },
      timeout: 10000
    });
    
    if (resp.status === 401) {
      throw new Error('API key de ClickUp inválida (401 Unauthorized)');
    }
    
    if (resp.status === 403) {
      throw new Error('API key sin permisos (403 Forbidden)');
    }
    
    if (!resp.ok) {
      throw new Error(`ClickUp API error: ${resp.status} ${resp.statusText}`);
    }
    
    const data = await resp.json();
    return {
      valid: true,
      teamId: data.teams?.[0]?.id,
      teamName: data.teams?.[0]?.name
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}

/**
 * Validar que la List ID existe en ClickUp
 */
async function validateClickUpListId(apiKey, listId) {
  if (!listId || !listId.trim()) {
    throw new Error('List ID de ClickUp no configurada');
  }
  
  try {
    const resp = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}`,
      {
        headers: { Authorization: apiKey },
        timeout: 10000
      }
    );
    
    if (resp.status === 401) throw new Error('API key inválida');
    if (resp.status === 404) throw new Error(`List ID no encontrada: ${listId}`);
    if (!resp.ok) throw new Error(`ClickUp error: ${resp.status}`);
    
    const data = await resp.json();
    return {
      valid: true,
      listId: data.id,
      listName: data.name,
      taskCount: data.task_count || 0
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message
    };
  }
}

// ================================================================
// 3. DETECCIÓN Y MANEJO DE ERRORES DE CLICKUP
// ================================================================

/**
 * Analizar error de ClickUp y decidir si reintentar
 */
function analyzeClickUpError(err, statusCode) {
  const isRateLimited = statusCode === 429;
  const isServerError = statusCode >= 500;
  const isAuthError = statusCode === 401 || statusCode === 403;
  const isNotFound = statusCode === 404;
  const isValidationError = statusCode === 400;
  
  return {
    isRetryable: isRateLimited || isServerError,
    isFatal: isAuthError || isValidationError || isNotFound,
    isRateLimited,
    statusCode,
    message: err.message || statusCode
  };
}

// ================================================================
// 4. OBTENER TAREAS CON RECUPERACIÓN
// ================================================================

/**
 * Obtener tareas de ClickUp con recuperación de errores
 * Retorna tareas RAW (sin procesar)
 */
async function obtenerTareasClickUpConRecuperacion({
  apiKey,
  listId,
  maxRetries = 3,
  fallbackFile = null
}) {
  const operation = async () => {
    const tasks = [];
    let page = 0;
    
    while (page < 20) {
      const url = `https://api.clickup.com/api/v2/list/${listId}/task` +
        `?page=${page}&include_closed=true&archived=false`;
      
      console.log(`[ClickUp] Obteniendo página ${page + 1}...`);
      
      const resp = await fetch(url, {
        headers: { Authorization: apiKey },
        timeout: 30000
      });
      
      if (!resp.ok) {
        const analysis = analyzeClickUpError(
          new Error(resp.statusText),
          resp.status
        );
        
        if (analysis.isRateLimited) {
          const retryAfter = parseInt(resp.headers.get('Retry-After') || 60);
          const err = new Error(`Rate limited. Reintenta en ${retryAfter}s`);
          err.statusCode = 429;
          err.retryAfter = retryAfter;
          throw err;
        }
        
        if (analysis.isFatal) {
          throw new Error(`ClickUp fatal error: ${analysis.message}`);
        }
        
        throw new Error(`ClickUp HTTP ${resp.status}`);
      }
      
      const data = await resp.json();
      if (!data.tasks || data.tasks.length === 0) {
        console.log(`[ClickUp] Fin en página ${page + 1}`);
        break;
      }
      
      tasks.push(...data.tasks);
      console.log(`[ClickUp] Página ${page + 1}: ${data.tasks.length} tareas`);
      
      if (data.tasks.length < 100) break;
      
      page++;
      
      // Esperar entre páginas para no saturar
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (tasks.length === 0) {
      throw new Error('No se obtuvieron tareas de ClickUp');
    }
    
    console.log(`[ClickUp] Total: ${tasks.length} tareas`);
    return tasks;
  };
  
  try {
    return await retryWithBackoff(operation, maxRetries, 2000, 60000);
  } catch (err) {
    console.warn(`[ClickUp] Error después de reintentos: ${err.message}`);
    
    // Fallback a archivo local si existe
    if (fallbackFile && require('fs').existsSync(fallbackFile)) {
      try {
        console.log(`[Fallback] Cargando desde ${fallbackFile}...`);
        const data = JSON.parse(
          require('fs').readFileSync(fallbackFile, 'utf8')
        );
        const tasks = Array.isArray(data.clientes)
          ? data.clientes.map(c => ({ id: c.id, name: c.nombre }))
          : [];
        
        if (tasks.length > 0) {
          console.log(`[Fallback] ${tasks.length} tareas cargadas`);
          return tasks;
        }
      } catch (fileErr) {
        console.error(`[Fallback] Error: ${fileErr.message}`);
      }
    }
    
    throw err;
  }
}

// ================================================================
// 5. CACHÉ INTELIGENTE
// ================================================================

/**
 * Wrapper de caché con invalidación inteligente
 */
class SmartCache {
  constructor(ttl = 1800) {
    this.cache = new Map();
    this.ttl = ttl;
    this.stats = { hits: 0, misses: 0 };
  }
  
  set(key, value, ttlOverride = null) {
    const effectiveTTL = ttlOverride || this.ttl;
    const expiresAt = Date.now() + (effectiveTTL * 1000);
    
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: new Date().toISOString(),
      size: JSON.stringify(value).length
    });
    
    console.log(`[Cache] SET ${key} (TTL: ${effectiveTTL}s)`);
  }
  
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (entry.expiresAt < Date.now()) {
      console.log(`[Cache] EXPIRED ${key}`);
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }
  
  delete(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      console.log(`[Cache] DELETE ${key}`);
    }
  }
  
  invalidatePattern(pattern) {
    // Invalidar todas las keys que coincidan con el pattern
    const regex = new RegExp(pattern);
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    console.log(`[Cache] INVALIDATED ${count} keys matching ${pattern}`);
  }
  
  getStats() {
    const totalSize = Array.from(this.cache.values())
      .reduce((sum, e) => sum + e.size, 0);
    
    return {
      keys: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
        : 'N/A',
      sizeBytes: totalSize,
      sizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  }
  
  clear() {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`[Cache] CLEARED ${count} entries`);
  }
}

// ================================================================
// 6. COLA DE CAMBIOS PARA SINCRONIZACIÓN BIDIRECCIONAL
// ================================================================

class ChangesQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.processed = [];
    this.failed = [];
  }
  
  /**
   * Agregar cambio a la cola
   */
  add(clienteId, field, oldValue, newValue, source = 'local') {
    const change = {
      id: crypto.randomUUID(),
      clienteId,
      field,
      oldValue,
      newValue,
      source,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    this.queue.push(change);
    console.log(`[Queue] Agregado cambio: ${field} para cliente ${clienteId}`);
    
    return change.id;
  }
  
  /**
   * Procesar la cola
   */
  async process(processor, batchSize = 5) {
    if (this.processing) {
      console.warn('[Queue] Ya hay un procesamiento en curso');
      return;
    }
    
    this.processing = true;
    const pending = this.queue.filter(c => c.status === 'pending');
    
    console.log(`[Queue] Procesando ${pending.length} cambios (batch size: ${batchSize})`);
    
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      
      for (const change of batch) {
        try {
          console.log(`[Queue] Procesando: ${change.field} para ${change.clienteId}`);
          await processor(change);
          
          change.status = 'synced';
          change.syncedAt = new Date().toISOString();
          this.processed.push(change);
        } catch (err) {
          console.error(`[Queue] Error: ${err.message}`);
          change.status = 'failed';
          change.error = err.message;
          this.failed.push(change);
        }
      }
      
      // Esperar un poco entre batches
      if (i + batchSize < pending.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    this.processing = false;
    
    // Limpiar cola de cambios procesados
    this.queue = this.queue.filter(c => c.status === 'pending');
    
    console.log(
      `[Queue] Completado. Exitosos: ${this.processed.length}, ` +
      `Fallidos: ${this.failed.length}, ` +
      `Pendientes: ${this.queue.length}`
    );
  }
  
  /**
   * Obtener estado de la cola
   */
  getStatus() {
    return {
      pending: this.queue.filter(c => c.status === 'pending').length,
      synced: this.processed.length,
      failed: this.failed.length,
      isProcessing: this.processing,
      queue: this.queue.slice(0, 50) // Primeros 50
    };
  }
}

// ================================================================
// 7. HASH/FINGERPRINT PARA DETECTAR CAMBIOS
// ================================================================

/**
 * Crear hash de tareas para detectar cambios
 */
function createTasksFingerprint(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return crypto.createHash('sha256').update('empty').digest('hex');
  }
  
  const minimal = tasks
    .map(t => ({
      id: String(t.id || ''),
      status: String(t.status?.status || ''),
      updated: String(t.date_updated || ''),
      closed: String(t.date_closed || '')
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  
  return crypto.createHash('sha256')
    .update(JSON.stringify(minimal))
    .digest('hex');
}

/**
 * Detectar qué tareas cambiaron comparando hashes
 */
function detectChanges(oldTasks, newTasks) {
  const oldMap = new Map(oldTasks.map(t => [t.id, t]));
  const newMap = new Map(newTasks.map(t => [t.id, t]));
  
  const changes = {
    created: [],
    updated: [],
    deleted: [],
    total: 0
  };
  
  // Nuevas tareas
  for (const task of newTasks) {
    if (!oldMap.has(task.id)) {
      changes.created.push(task.id);
      changes.total++;
    }
  }
  
  // Tareas eliminadas
  for (const taskId of oldMap.keys()) {
    if (!newMap.has(taskId)) {
      changes.deleted.push(taskId);
      changes.total++;
    }
  }
  
  // Tareas actualizadas
  for (const task of newTasks) {
    if (oldMap.has(task.id)) {
      const old = oldMap.get(task.id);
      if (old.date_updated !== task.date_updated) {
        changes.updated.push(task.id);
        changes.total++;
      }
    }
  }
  
  return changes;
}

// ================================================================
// 8. LOGGING ESTRUCTURADO
// ================================================================

/**
 * Logger estructurado con contexto
 */
class StructuredLogger {
  constructor(service = 'app') {
    this.service = service;
  }
  
  log(level, message, context = {}) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...context
    };
    
    console.log(JSON.stringify(log));
    return log;
  }
  
  info(message, context) { return this.log('INFO', message, context); }
  warn(message, context) { return this.log('WARN', message, context); }
  error(message, context) { return this.log('ERROR', message, context); }
  debug(message, context) { return this.log('DEBUG', message, context); }
}

// ================================================================
// EXPORTAR FUNCIONES
// ================================================================

module.exports = {
  retryWithBackoff,
  createLimitedConcurrencyQueue,
  validateClickUpApiKey,
  validateClickUpListId,
  analyzeClickUpError,
  obtenerTareasClickUpConRecuperacion,
  SmartCache,
  ChangesQueue,
  createTasksFingerprint,
  detectChanges,
  StructuredLogger
};
