# 🚀 VY-LEX PRODUCCIÓN - INSTALACIÓN FINAL

## Arquitectura

```
ClickUp (Datos Madre)
    ↓
Vy-Lex Server (Procesa/Analiza)
    ↓
7 APIs REST + Dashboard Web
    ↓
Sheets (Opcional - Complementos)
```

## ✅ Pasos de Instalación

### 1️⃣ Copiar Endpoints a server.js

```bash
# Abre: server.js
# Ve a la línea final (antes de app.listen())
# Copia TODO el contenido de: ENDPOINTS_INTEGRACION.js
# Pégalo en server.js
```

### 2️⃣ Verificar PUBLIC_FILES

En **server.js**, busca `PUBLIC_FILES` y asegúrate que incluya:

```javascript
const PUBLIC_FILES = new Set([
  'dashboard.html',  // ← AGREGAR ESTA LÍNEA
  'vylex.html',
  'vylex-modern.html',
  // ... resto
]);
```

### 3️⃣ Configurar Global Config

Accede a: `http://localhost:3000/vylex.html` (o dashboard.html)

Ve a: **Config → Global Settings** y agrega:
- ✅ ClickUp API Key
- ✅ ClickUp List ID
- ✅ (Opcional) Google Sheets API Key para complementos

### 4️⃣ Reiniciar Server

```bash
cd "/home/ixcsoft/Dashboard- Hola suite"
npm start
```

## 📊 Dashboard Acceso

```
http://localhost:3000/dashboard.html
```

**Login requerido:**
- Usa tu usuario y contraseña registrados
- El token se guarda automáticamente

## 🔌 APIs Disponibles

### 1. GET /api/clickup/full-data
**Trae TODO de ClickUp con análisis**
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/clickup/full-data
```

Retorna:
- ✅ Todas las tareas
- ✅ Resumen (total, activos, en proceso, etc)
- ✅ Por país, por consultor, alertas, canales

### 2. GET /api/clientes
**Lista clientes con filtros**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/clientes?pais=México&estado=active&tipo=Implementación"
```

Parámetros:
- `pais` - Filtrar por país
- `estado` - Filtrar por estado
- `tipo` - Implementación o Upgrade
- `responsable` - Filtrar por responsable

### 3. GET /api/clientes/:id
**Detalle completo de un cliente**
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/clientes/TASK_ID
```

Retorna: Datos ClickUp + responsables + técnica + comercial

### 4. GET /api/clientes/:id/enriquecido
**Cliente CON complementos (ClickUp + Sheets + Local)**
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/clientes/TASK_ID/enriquecido
```

Retorna: 
- Datos ClickUp
- Complementos locales (notas, tags, info extra)
- Complementos desde Sheets (si están configurados)

### 5. GET /api/alertas
**Alertas inteligentes**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/alertas?severidad=CRÍTICA"
```

Retorna:
- 🔴 SIN_MOVIMIENTO - Sin actualización > 7 días
- 🔴 EXCEDIDA_META - Implementación > 20 días
- 🔴 SIN_RESPONSABLE - Etapa sin responsable
- 🔴 ESPERANDO_CLIENTE - Cliente en espera
- 🔴 MOROSIDAD - Problemas de pago

### 6. POST /api/complementos/:clienteId
**Guardar información adicional (complemento local)**
```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notas": "Cliente muy importante",
    "contactoAdicional": "+57 300 123 4567",
    "informacionExtra": {"departamento": "Ventas"},
    "tags": ["VIP", "Urgente"]
  }' \
  http://localhost:3000/api/complementos/TASK_ID
```

### 7. GET /api/analytics
**Análisis avanzado**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/analytics?tipo=sector"
```

Tipos:
- `sector` - Análisis por país
- `implementacion` - Análisis por tipo (Nueva/Upgrade/Migración)
- `consultor` - Carga de trabajo por consultor

### 8. GET /api/auditoria
**Registro de cambios**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/auditoria?usuario=admin&desde=2026-04-01"
```

## 🔄 Integración Sheets (Opcional)

Si quieres agregar complementos desde Sheets:

### En Global Config:
```json
{
  "complementosSheetId": "SHEET_ID",
  "complementosSheetName": "Complementos",
  "googleSheetsApiKey": "YOUR_API_KEY"
}
```

### En el Sheets:
Columnas esperadas:
- `clienteId` - ID de la tarea ClickUp
- `notas` - Notas adicionales
- `contactoAdicional` - Teléfono/Email extra
- `informacionExtra` - Datos JSON adicionales

Luego accede a: `GET /api/clientes/:id/enriquecido`

Y obtendrás:
```json
{
  "cliente": {
    "clickup": { ... datos de ClickUp ... },
    "complementosLocales": { ... datos guardados en API ... },
    "complementosSheets": { ... datos desde Sheets ... }
  }
}
```

## 📈 Casos de Uso Reales

### Caso 1: Dashboard Ejecutivo
```javascript
// Obtener resumen para jefatura
fetch('/api/clickup/full-data')
  .then(r => r.json())
  .then(d => console.log(d.data.summary))
```

### Caso 2: Alertas en Tiempo Real
```javascript
// Mostrar alertas críticas
fetch('/api/alertas?severidad=CRÍTICA')
  .then(r => r.json())
  .then(d => d.alertas.forEach(a => console.log(a)))
```

### Caso 3: Análisis por Región
```javascript
// Comparar desempeño entre países
fetch('/api/analytics?tipo=sector')
  .then(r => r.json())
  .then(d => console.log(d.datos))
```

### Caso 4: Cliente Completo (ClickUp + Info Extra)
```javascript
// Ver cliente con todos los complementos
fetch('/api/clientes/TASK_ID/enriquecido')
  .then(r => r.json())
  .then(d => console.log(d.cliente))
```

## 🔐 Seguridad

- ✅ Todos los endpoints requieren `Authorization: Bearer TOKEN`
- ✅ Tokens válidos por 8 horas
- ✅ Auditoría de todos los cambios
- ✅ API Key de ClickUp guardada en `global_config.json` (local, no público)

## 📚 Archivos Clave

- `server.js` - Servidor Node.js
- `ENDPOINTS_INTEGRACION.js` - 7 nuevos endpoints (copiar a server.js)
- `dashboard.html` - Dashboard web
- `data/complementos.json` - Información local guardada
- `data/clientes.json` - Cache de clientes
- `audit_logs.json` - Registro de cambios

## 🚀 Deploy a Producción

### Con PM2:
```bash
npm install -g pm2
pm2 start server.js --name "vy-lex"
pm2 save
pm2 startup
```

### Con Docker:
```bash
docker build -t vy-lex .
docker run -p 3000:3000 -v $(pwd)/data:/app/data vy-lex
```

## 📞 Soporte

- ClickUp Docs: https://clickup.com/api
- Server logs: `npm start` (terminal)
- Auditoría: GET /api/auditoria (dashboard)

---

**Estado: ✅ LISTO PARA PRODUCCIÓN**

Todos los datos vienen de ClickUp (fuente madre).
Sheets es opcional para complementos.
Dashboard web disponible en http://localhost:3000/dashboard.html
