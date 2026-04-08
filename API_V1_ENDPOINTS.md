# API v1 - Endpoints para Atendimentos y Mensagens

## Descripción General

Los endpoints v1 actúan como **proxy** entre el frontend y la API externa de Vy-Lex Management Suite.

- **Autenticación:** JWT Token (mismo del dashboard)
- **Base URL:** `http://localhost:3000`
- **Ubicación en servidor:** `server.js` líneas ~2430-2550

---

## 1. POST /api/v1/atendimento

### Propósito
Obtener listado de atendimientos con filtros de período y otros criterios.

### Autenticación
```bash
Requiere: JWT token en header Authorization
Header: Authorization: Bearer <jwt_token>
```

### Request Body
```json
{
  "filter": {
    "protocolo": "OPA202210",
    "dataInicialAbertura": "2026-04-01",
    "dataFinalAbertura": "2026-04-08",
    "dataInicialEncerramento": "2026-04-15",
    "dataFinalEncerramento": "2026-04-17",
    "departamento": "sales"
  },
  "options": {
    "limit": 100
  }
}
```

### Response (Success - 200)
```json
{
  "ok": true,
  "data": [
    {
      "id": "12345",
      "protocolo": "OPA202210",
      "contactName": "Cliente XYZ",
      "status": "open",
      "channel": "whatsapp",
      "department": "sales",
      "createdAt": "2026-04-05T10:30:00Z",
      "updatedAt": "2026-04-08T15:45:00Z",
      "activeAgentName": "Juan Pérez",
      "waitMinutes": 5,
      "serviceMinutes": 120
    }
  ],
  "total": 1,
  "filter": { ... },
  "options": { "limit": 100 }
}
```

### Response (Error - 400/500)
```json
{
  "error": "Base URL y token son requeridos",
  "details": {}
}
```

### Ejemplo cURL
```bash
curl -X POST http://localhost:3000/api/v1/atendimento \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "dataInicialAbertura": "2026-04-01",
      "dataFinalAbertura": "2026-04-08"
    },
    "options": { "limit": 100 }
  }'
```

### Notas
- El filtro se pasa directamente a la API externa (proxy)
- Los campos `dataInicialAbertura` y `dataFinalAbertura` son opcionales
- Si el token de admin está configurado en `global_config.json`, se usará automáticamente

---

## 2. POST /api/v1/atendimento/mensagem

### Propósito
Obtener mensajes de un atendimiento específico, opcionalmente filtrados por período.

### Autenticación
```bash
Requiere: JWT token en header Authorization
Header: Authorization: Bearer <jwt_token>
```

### Request Body
```json
{
  "filter": {
    "id_rota": "12345",
    "dataInicialAbertura": "2026-04-01",
    "dataFinalAbertura": "2026-04-08"
  },
  "options": {
    "limit": 100
  }
}
```

### Response (Success - 200)
```json
{
  "ok": true,
  "messages": [
    {
      "id": "msg_001",
      "id_rota": "12345",
      "from": "agent",
      "senderName": "Juan Pérez",
      "text": "Hola, ¿en qué puedo ayudarte?",
      "timestamp": "2026-04-05T10:30:00Z",
      "channel": "whatsapp"
    },
    {
      "id": "msg_002",
      "id_rota": "12345",
      "from": "user",
      "senderName": "Cliente XYZ",
      "text": "Necesito ayuda con mi cuenta",
      "timestamp": "2026-04-05T10:31:00Z",
      "channel": "whatsapp"
    }
  ],
  "total": 2,
  "filter": { ... },
  "options": { "limit": 100 }
}
```

### Response (Error - 400)
```json
{
  "error": "id_rota es requerido en filter"
}
```

### Ejemplo cURL
```bash
curl -X POST http://localhost:3000/api/v1/atendimento/mensagem \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "id_rota": "12345",
      "dataInicialAbertura": "2026-04-01",
      "dataFinalAbertura": "2026-04-08"
    },
    "options": { "limit": 100 }
  }'
```

### Notas
- `id_rota` (ID del atendimiento) es **obligatorio**
- Los filtros de período son opcionales
- Válidas las variantes: `id_rota`, `idRota`, `attendance_id`

---

## Flujo Completo desde Frontend

### Paso 1: Usuario abre sección "Conversaciones (OPA)"
- Frontend llama `renderOPA()`
- Auto-inicializa filtros de fecha (1º mes - hoy)

### Paso 2: Usuario ajusta filtros y hace click en "Sincronizar"
- Frontend llama `fetchHolaConvs()` (usa proxy)
- **Opcionalmente** puede hacer request directo a `/api/v1/atendimento`

### Paso 3: Usuario hace click en una conversación
- Frontend llama `showConvDetail(id)`
- Carga detalles de conversación
- **Frontend llama** `fetchConvMessages(id, dateStart, dateEnd)`
  - Esto hace POST a `/api/v1/atendimento/mensagem`
  - Envía: `{ filter: { id_rota, dataInicialAbertura, dataFinalAbertura }, options: { limit: 100 } }`

### Paso 4: Modal muestra mensajes filtrados
- Sección "Mensajes (período filtrado)" renderiza respuesta

---

## Configuración en Frontend

El frontend puede usar estos endpoints si:

1. **Está configurada URL + Token en Configuración:**
   - Menú → Configuración → ¡Hola! / Opa Suite API
   - URL: `https://meudominio.com.br`
   - Token: `[tu_token]`

2. **O si están en global_config.json (admin):**
   ```json
   {
     "holaUrl": "https://meudominio.com.br",
     "holaToken": "[tu_token]"
   }
   ```

---

## Testing

### Con Postman
1. Crear nueva request POST
2. URL: `http://localhost:3000/api/v1/atendimento`
3. Headers:
   ```
   Authorization: Bearer <jwt_del_dashboard>
   Content-Type: application/json
   ```
4. Body:
   ```json
   {
     "filter": {
       "dataInicialAbertura": "2026-04-01",
       "dataFinalAbertura": "2026-04-08"
     },
     "options": { "limit": 100 }
   }
   ```

### Con cURL (requiere token válido)
```bash
# Primero, obtener un token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test123"}' \
  | jq -r '.token')

# Luego usar el token
curl -X POST http://localhost:3000/api/v1/atendimento \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "dataInicialAbertura": "2026-04-01",
      "dataFinalAbertura": "2026-04-08"
    },
    "options": { "limit": 100 }
  }' | jq
```

---

## Flujo de Autenticación

```
Frontend (vylex.html)
    ↓
login (obtiene JWT)
    ↓
almacena token en localStorage
    ↓
incluye token en cada request (header Authorization)
    ↓
Backend valida con middleware `auth`
    ↓
Si válido → ejecuta ruta
Si inválido → 401 Unauthorized
```

---

## Error Handling

### 400 Bad Request
- Falta parámetro requerido (ej: `id_rota`)
- Parámetro inválido
- Falta token

### 401 Unauthorized
- Token expirado
- Token inválido
- Usuario no autenticado

### 500 Internal Server Error
- Error en API externa
- Error en procesamiento

---

## Próximas Mejoras

- [ ] Rate limiting
- [ ] Caché de resultados
- [ ] Paginación avanzada
- [ ] Búsqueda full-text
- [ ] Webhooks para cambios en tiempo real

---

Última actualización: 8 de abril de 2026
