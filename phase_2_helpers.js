'use strict';

/**
 * ============================================================================
 * PHASE_2_HELPERS.js
 * ============================================================================
 * Funciones helper para Fase 2 (Endpoints Mejorados)
 * 
 * ¿Cómo usar?
 * 1. Copiar este archivo al directorio root
 * 2. En server.js, después de los require(): 
 *    const { retryWithBackoff, SmartCache, validateRequest, ChangesQueue } = require('./phase_2_helpers');
 * 3. En server.js ANTES de app.listen(), agregar:
 *    require('./phase_2_endpoints')(app, { auth, writeLog, readGlobalConfig, readUsers, getClickUpListId });
 * 
 * ============================================================================
 */

const fetch = require('node-fetch');

// ================================================================
// 1. RETRY WITH BACKOFF
// ================================================================

/**
 * Reintentar una función con backoff exponencial
 * 
 * Uso:
 *   await retryWithBackoff(async () => {
 *     return await fetch(url);
 *   }, 3, 1000);
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
      return await fn();
    } catch (error) {
      lastError = error;
      
      // No reintentar en algunos casos
      if (error.statusCode === 401 || error.statusCode === 403) {
        throw error; // Auth/Forbidden - no reintentar
      }
      
      if (attempt === maxRetries) {
        throw error; // Último intento fallido
      }
      
      // Calcular delay con jitter
      const exponentialDelay = Math.min(
        initialDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );
      const jitter = Math.random() * 500; // ±500ms
      const delay = exponentialDelay + (Math.random() > 0.5 ? jitter : -jitter);
      
      console.log(`⚠️ Reintentando en ${Math.round(delay)}ms (intento ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ================================================================
// 2. SMART CACHE
// ================================================================

class SmartCache {
  constructor(ttlSeconds = 3600) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }
  
  set(key, value, ttlOverride = null) {
    const ttl = ttlOverride ? ttlOverride * 1000 : this.ttl;
    const expiresAt = Date.now() + ttl;
    
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
    
    this.stats.sets++;
    
    // Auto-cleanup
    setTimeout(() => this.cache.delete(key), ttl);
  }
  
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }
  
  delete(key) {
    this.cache.delete(key);
  }
  
  /**
   * Invalidar todas las claves que coincidan con un patrón regex
   */
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    let invalidatedCount = 0;
    
    for (const [key] of this.cache.entries()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }
    
    return invalidatedCount;
  }
  
  clear() {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }
  
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(2) : 0;
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`,
      memoryEstimate: `${(this.cache.size * 1.2).toFixed(2)} KB`
    };
  }
}

// ================================================================
// 3. VALIDATE REQUEST
// ================================================================

/**
 * Validar datos contra esquema
 * 
 * Uso:
 *   const errors = validateRequest(req.body, {
 *     nombre: { required: true, type: 'string', minLength: 3 },
 *     email: { required: true, type: 'string' },
 *     edad: { type: 'number', min: 18, max: 120 }
 *   });
 *   
 *   if (errors) {
 *     return res.status(400).json({ error: 'Validación fallida', errors });
 *   }
 */
function validateRequest(data, schema) {
  const errors = {};
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Required
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${field} es requerido`;
      continue;
    }
    
    // Skip validation if empty and not required
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }
    
    // Type
    if (rules.type && typeof value !== rules.type) {
      errors[field] = `${field} debe ser tipo ${rules.type}, recibido ${typeof value}`;
      continue;
    }
    
    // Enum
    if (rules.enum && !rules.enum.includes(value)) {
      errors[field] = `${field} debe ser uno de: ${rules.enum.join(', ')}`;
      continue;
    }
    
    // Min/Max for numbers
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors[field] = `${field} debe ser >= ${rules.min}`;
        continue;
      }
      if (rules.max !== undefined && value > rules.max) {
        errors[field] = `${field} debe ser <= ${rules.max}`;
        continue;
      }
    }
    
    // String length
    if (typeof value === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors[field] = `${field} debe tener al menos ${rules.minLength} caracteres`;
        continue;
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors[field] = `${field} no puede exceder ${rules.maxLength} caracteres`;
        continue;
      }
      
      // Regex pattern
      if (rules.pattern && !rules.pattern.test(value)) {
        errors[field] = `${field} tiene formato inválido`;
        continue;
      }
    }
  }
  
  return Object.keys(errors).length > 0 ? errors : null;
}

// ================================================================
// 4. CHANGES QUEUE (Bidirectional Sync)
// ================================================================

class ChangesQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  
  add(clienteId, field, oldValue, newValue, source = 'dashboard') {
    const change = {
      id: Date.now() + Math.random().toString().substr(2, 9),
      timestamp: new Date().toISOString(),
      clienteId,
      field,
      oldValue,
      newValue,
      source, // 'dashboard' o 'clickup'
      status: 'pending' // pending, processing, completed, failed
    };
    
    this.queue.push(change);
    console.log(`📝 Cambio encolado: ${clienteId}.${field} = ${newValue}`);
  }
  
  /**
   * Procesar cambios en lotes
   */
  async process(processor, batchSize = 5) {
    if (this.processing) return;
    this.processing = true;
    
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, batchSize);
        
        for (const change of batch) {
          change.status = 'processing';
          
          try {
            await processor(change);
            change.status = 'completed';
            console.log(`✅ Cambio procesado: ${change.clienteId}.${change.field}`);
          } catch (error) {
            change.status = 'failed';
            change.error = error.message;
            console.error(`❌ Error procesando cambio: ${error.message}`);
            // Reintentar después
            this.queue.push(change);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }
  
  getStatus() {
    return {
      totalChanges: this.queue.length,
      pending: this.queue.filter(c => c.status === 'pending').length,
      processing: this.queue.filter(c => c.status === 'processing').length,
      completed: this.queue.filter(c => c.status === 'completed').length,
      failed: this.queue.filter(c => c.status === 'failed').length
    };
  }
}

// ================================================================
// EXPORTAR
// ================================================================

module.exports = {
  retryWithBackoff,
  SmartCache,
  validateRequest,
  ChangesQueue
};
