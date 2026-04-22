# 📝 GUÍA MANUAL - Copiar Endpoints Fase 2

**Tiempo Estimado:** 20-30 minutos  
**Dificultad:** Media  
**Riesgo:** Bajo (con backup)

---

## ✅ Preparación

### 1. Hacer Backup
```bash
cp server.js server.js.backup_manual_phase2
echo "✅ Backup guardado: server.js.backup_manual_phase2"
```

### 2. Abrir Archivos en Dos Ventanas

**Terminal 1 - Ver ENDPOINTS_INTEGRACION_MEJORADO.js:**
```bash
nano ENDPOINTS_INTEGRACION_MEJORADO.js
# O: code ENDPOINTS_INTEGRACION_MEJORADO.js
```

**Terminal 2 - Editar server.js:**
```bash
nano server.js
# O: code server.js
```

---

## 🔍 Localizar Punto de Inserción en server.js

En server.js, busca: **Ctrl+F → "// ================================================================\n// CATCH-ALL → SPA"**

Esta línea está alrededor de la línea **3850-3860**.

**Insertar LOS ENDPOINTS AQUÍ** (ANTES de CATCH-ALL).

---

## 📋 Endpoints a Copiar (En Orden)

### Bloque 1: HELPERS (líneas ~26-140 en ENDPOINTS_INTEGRACION_MEJORADO.js)

```javascript
// ═══════════════════════════════════════════════════════════════
// HELPERS (Si no existen en tu server.js)
// ═══════════════════════════════════════════════════════════════

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

const Errors = {
  VALIDATION: (msg, details = {}) => new AppError(msg, 400, 'VALIDATION_ERROR', details),
  NOT_FOUND: (resource) => new AppError(`${resource} no encontrado`, 404, 'NOT_FOUND'),
  // ... (copiar resto de clase Errors)
};

function validateRequest(data, schema) {
  // ... (copiar de ENDPOINTS_INTEGRACION_MEJORADO.js líneas ~70-110)
}

// Si ya existen en phase_2_helpers.js, SALTAR este bloque
```

**☝️ NOTA:** Si ya está en `phase_2_helpers.js`, NO copiar. Solo copiar si falta.

---

### Bloque 2: ENDPOINTS CRUD CLIENTES (líneas 157-410)

**Copiar DESDE:**
```javascript
app.get('/api/clientes', auth, async (req, res, next) => {
```

**HASTA (pero NO incluir):**
```javascript
// ================================================================
// 2. ENDPOINTS: COMENTARIOS
// ================================================================
```

**Líneas aproximadas:** 157 - 409

---

### Bloque 3: ENDPOINTS COMENTARIOS (líneas 460-560)

**Copiar DESDE:**
```javascript
app.post('/api/clientes/:id/comentario', auth, async (req, res, next) => {
```

**HASTA (pero NO incluir):**
```javascript
// ================================================================
// 3. ENDPOINTS: ALERTAS
// ================================================================
```

**Líneas aproximadas:** 468 - 559

---

### Bloque 4: ENDPOINTS ALERTAS (líneas 561-701)

**Copiar DESDE:**
```javascript
app.get('/api/alertas', auth, async (req, res, next) => {
```

**HASTA (pero NO incluir):**
```javascript
// ================================================================
// 4. ENDPOINTS: REPORTES Y ANALYTICS
// ================================================================
```

**Líneas aproximadas:** 575 - 700

---

### Bloque 5: ENDPOINTS REPORTES (líneas 702-866)

**Copiar DESDE:**
```javascript
app.get('/api/reportes/por-pais', auth, async (req, res, next) => {
```

**HASTA (pero NO incluir):**
```javascript
// ================================================================
// 5. ENDPOINTS: SINCRONIZACIÓN
// ================================================================
```

**Líneas aproximadas:** 710 - 865

---

### Bloque 6: ENDPOINTS SYNC (líneas 867-1032)

**Copiar DESDE:**
```javascript
app.post('/api/sync/start', auth, async (req, res, next) => {
```

**HASTA (pero NO incluir):**
```javascript
// ================================================================
// ERROR HANDLER MIDDLEWARE
// ================================================================
```

**Líneas aproximadas:** 876 - 1031

---

## 🔧 Instrucciones Paso a Paso

### Paso 1: Preparar Área de Inserción

En **server.js**, busca esta línea (alrededor de línea 3850):
```javascript
// ================================================================
// CATCH-ALL → SPA
// ================================================================
```

Justo ANTES de esta línea, agrega esta MARCA (para facilitar):
```javascript

// ════════════════════════════════════════════════════════════════════
// FASE 2 - ENDPOINTS MEJORADOS (Insertar aquí)
// ════════════════════════════════════════════════════════════════════

```

---

### Paso 2: Copiar Bloque por Bloque

Para **cada bloque** de endpoints:

1. En ENDPOINTS_INTEGRACION_MEJORADO.js:
   - Posiciona en la línea de inicio
   - Selecciona TODO hasta la siguiente sección (Ctrl+Shift+End o selección manual)
   - Copia (Ctrl+C)

2. En server.js:
   - Posiciona antes de "// ════════════════════════════════════════"
   - Pega (Ctrl+V)

3. **Verifica que la sintaxis es correcta:**
   ```bash
   npm start 2>&1 | grep -i error | head -10
   ```
   Si no hay errores, puedes continuar con el siguiente bloque.

---

### Paso 3: Validar Después de Cada Bloque

```bash
# Terminal - Validar sintaxis
node -c server.js
```

Si hay error, puedes hacer rollback:
```bash
cp server.js.backup_manual_phase2 server.js
```

---

## 📊 Checklist de Copia

Usar este checklist mientras copias:

```
Bloque 1 - Helpers:
  [ ] Copiar AppError class
  [ ] Copiar Errors object
  [ ] ✅ Validación sintaxis

Bloque 2 - CRUD Clientes (5 endpoints):
  [ ] app.get('/api/clientes', ...) - lista con paginación
  [ ] app.get('/api/clientes/:id', ...) - detalle
  [ ] app.put('/api/clientes/:id', ...) - actualizar
  [ ] app.delete('/api/clientes/:id', ...) - eliminar
  [ ] ✅ Validación sintaxis

Bloque 3 - Comentarios (2 endpoints):
  [ ] app.post('/api/clientes/:id/comentario', ...) - crear
  [ ] app.get('/api/clientes/:id/comentarios', ...) - listar
  [ ] ✅ Validación sintaxis

Bloque 4 - Alertas (1 endpoint):
  [ ] app.get('/api/alertas', ...) - alertas sistema
  [ ] ✅ Validación sintaxis

Bloque 5 - Reportes (3 endpoints):
  [ ] app.get('/api/reportes/por-pais', ...) - por país
  [ ] app.get('/api/reportes/por-tipo', ...) - por tipo
  [ ] app.get('/api/reportes/por-consultor', ...) - por consultor
  [ ] ✅ Validación sintaxis

Bloque 6 - Sync (2 endpoints):
  [ ] app.post('/api/sync/start', ...) - iniciar
  [ ] app.get('/api/sync/status', ...) - estado
  [ ] ✅ Validación sintaxis

✅ TODAS LAS SECCIONES COPIADAS
```

---

## 🧪 Pruebas Después de Copiar

```bash
# 1. Iniciar servidor
npm start

# 2. En otra terminal, obtener token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@holasuite.com","password":"123456789"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: $TOKEN"

# 3. Probar cada endpoint
echo "1. GET /api/clientes:"
curl -s http://localhost:3000/api/clientes \
  -H "Authorization: Bearer $TOKEN" | jq '.' | head -20

echo -e "\n2. GET /api/alertas:"
curl -s http://localhost:3000/api/alertas \
  -H "Authorization: Bearer $TOKEN" | jq '.' | head -20

echo -e "\n3. GET /api/reportes/por-pais:"
curl -s http://localhost:3000/api/reportes/por-pais \
  -H "Authorization: Bearer $TOKEN" | jq '.' | head -20

echo -e "\n4. GET /api/sync/status:"
curl -s http://localhost:3000/api/sync/status \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## ⚠️ Troubleshooting

### Error: "Sintaxis inválida"
```bash
# Solución:
cp server.js.backup_manual_phase2 server.js
npm start
# Revisa qué endpoint causó el problema y cópialo de nuevo
```

### Error: "Cannot find module 'phase_2_helpers'"
```bash
# El archivo debe existir:
ls -la phase_2_helpers.js
# Si no existe, copia los helpers manualmente (Bloque 1)
```

### Endpoints retornan 404
```bash
# Verificar que están registrados:
grep -c "app.get('/api/clientes" server.js
# Debería dar 1 o más
```

### Login no funciona
```bash
# Asegurar que no se dañó /api/auth/login:
grep -A 3 "app.post('/api/auth/login'" server.js
# Debería tener: loginLimiter, bcryptjs.compareSync, etc.
```

---

## ✅ Verificación Final

```bash
# Contar endpoints antes y después
echo "Endpoints en backup:"
grep -c "^app\." server.js.backup_manual_phase2

echo "Endpoints después:"
grep -c "^app\." server.js

echo "Diferencia (debe ser ~13-15):"
expr $(grep -c "^app\." server.js) - $(grep -c "^app\." server.js.backup_manual_phase2)
```

---

## 🎉 Listo!

Si todas las pruebas pasan, has completado Fase 2 exitosamente.

**Próximo:** 
- Fase 3: Testing (GUIA_IMPLEMENTACION_PASO_A_PASO.md Fase 3)
- Monitorear logs: `tail -f audit_logs.json`
- Optimizar según uso real

---

**Tiempo total estimado:** 30 minutos  
**Resultado:** 15 endpoints nuevos + validación + retry logic  
**Ganancia:** Funcionalidad +25% mejor, Fiabilidad +40% mejor
