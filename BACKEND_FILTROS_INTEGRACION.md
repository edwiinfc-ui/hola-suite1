# 🔌 Integración Backend - Filtros de Conversas

## Resumen

Este documento explica qué debe hacer tu backend para que los filtros de conversas funcionen correctamente.

---

## 📡 Endpoints Requeridos

### 1. POST `/api/v1/atendimento` - Buscar Atendimientos

**Descripción:** Retorna lista de atendimientos (conversaciones/tickets) con filtros de período y departamento.

**Request:**
```json
{
  "filter": {
    "protocolo": "OPA202210",              // Opcional: buscar por protocolo
    "dataInicialAbertura": "2026-04-01",  // Opcional: fecha inicio
    "dataFinalAbertura": "2026-04-08",    // Opcional: fecha final
    "departamento": "Sales"                // Opcional: filtrar por departamento
  },
  "options": {
    "limit": 100                           // Máximo de resultados
  }
}
```

**Response (éxito):**
```json
{
  "data": [
    {
      "id": "12345",                       // ID único del atendimiento
      "protocol": "OPA202210",             // Protocolo/número de ticket
      "contactName": "Juan Pérez",         // Nombre del contacto
      "contact": "juan.perez@email.com",  // Email o teléfono
      "department": "Sales",               // Departamento (importante!)
      "status": "open",                    // Estado: open, resolved, pending
      "channel": "whatsapp",               // Canal: whatsapp, instagram, etc
      "createdAt": "2026-04-05T10:30:00Z",// Fecha de creación (ISO 8601)
      "updatedAt": "2026-04-08T15:45:00Z",// Última actualización
      "openedAt": "2026-04-05T10:30:00Z", // Fecha de apertura
      "endedAt": "2026-04-08T15:45:00Z",  // Fecha de cierre (null si abierto)
      "lastMessage": "¿Cómo puedo ayudarte?",  // Último mensaje
      "activeAgentName": "María García",   // Agente asignado
      "sectorName": "Ventas",              // Nombre del sector/departamento
      "messages": []                        // Opcional: array de mensajes
    }
  ],
  "total": 42,                             // Total de resultados
  "filtered": 42                           // Total después de aplicar filtros
}
```

**Campos requeridos en respuesta:**
- `id` - Debe ser único y válido
- `createdAt` O `openedAt` - Para filtro de período
- `department` O `sector` - Para filtro de departamento
- `status` - Para otros filtros

**Campos opcionales pero recomendados:**
- `protocol` - Número de ticket
- `channel` - Para filtro de canal
- `lastMessage` - Para previsualización

---

### 2. POST `/api/v1/atendimento/mensagem` - Obtener Mensajes

**Descripción:** Retorna lista de mensajes de un atendimiento específico.

**Request:**
```json
{
  "filter": {
    "id_rota": "12345"                    // ID del atendimiento
  },
  "options": {
    "limit": 100
  }
}
```

**Response (éxito):**
```json
{
  "data": [
    {
      "id": "msg001",
      "id_atendimento": "12345",          // ID del atendimiento (FK)
      "from": "agent",                     // "agent" o "user"
      "senderName": "María García",        // Nombre de quién envía
      "senderEmail": "maria@company.com",  // Opcional
      "text": "¿En qué puedo ayudarte?", // Contenido del mensaje
      "timestamp": "2026-04-08T15:30:00Z",// Fecha del mensaje (ISO 8601)
      "attachments": []                    // Opcional: archivos adjuntos
    },
    {
      "id": "msg002",
      "id_atendimento": "12345",
      "from": "user",
      "senderName": "Juan Pérez",
      "text": "Tengo una pregunta sobre mi contrato",
      "timestamp": "2026-04-08T15:35:00Z"
    }
  ],
  "total": 15
}
```

**Campos requeridos:**
- `id` - Identificador único del mensaje
- `from` - "agent" o "user" (afecta coloreo en UI)
- `senderName` - Nombre de quién envía
- `text` - Contenido del mensaje
- `timestamp` - Fecha en ISO 8601 (para ordenamiento)

---

## 🔄 Flujo de Datos

```
Frontend (vylex.html)
    │
    ├─→ renderOPA()
    │   └─→ setea convDateStart = "2026-04-01"
    │   └─→ setea convDateEnd = "2026-04-08"
    │
    ├─→ Usuario selecciona departamento = "Sales"
    │
    ├─→ filterConvs() se ejecuta
    │
    ├─→ POST /api/v1/atendimento
    │   {
    │     "filter": {
    │       "dataInicialAbertura": "2026-04-01",
    │       "dataFinalAbertura": "2026-04-08",
    │       "departamento": "Sales"
    │     },
    │     "options": {"limit": 100}
    │   }
    │
    ├─← Backend retorna conversaciones filtradas
    │
    ├─→ renderConvList() muestra resultados
    │
    ├─→ Usuario hace click en conversación
    │
    ├─→ showConvDetail(id) se ejecuta
    │
    ├─→ POST /api/v1/atendimento/mensagem
    │   {
    │     "filter": {"id_rota": "12345"},
    │     "options": {"limit": 100}
    │   }
    │
    ├─← Backend retorna mensajes del atendimiento
    │
    └─→ Modal muestra detalles + mensajes
```

---

## 🛠️ Ejemplo de Implementación (Node.js/Express)

```javascript
// Ejemplo backend para POST /api/v1/atendimento
app.post('/api/v1/atendimento', async (req, res) => {
  try {
    const { filter = {}, options = {} } = req.body;
    
    let query = db.from('atendimentos');
    
    // Aplicar filtros
    if (filter.protocolo) {
      query = query.where('protocolo', filter.protocolo);
    }
    
    if (filter.departamento) {
      query = query.where('departamento', filter.departamento);
    }
    
    // Filtro de período (importante!)
    if (filter.dataInicialAbertura) {
      query = query.where('data_abertura', '>=', new Date(filter.dataInicialAbertura));
    }
    
    if (filter.dataFinalAbertura) {
      const endDate = new Date(filter.dataFinalAbertura);
      endDate.setHours(23, 59, 59, 999);
      query = query.where('data_abertura', '<=', endDate);
    }
    
    // Limit
    const limit = options.limit || 100;
    query = query.limit(limit);
    
    // Ejecutar query
    const atendimentos = await query;
    
    // Normalizar respuesta
    const data = atendimentos.map(att => ({
      id: att.id,
      protocol: att.protocolo,
      contactName: att.nome_cliente,
      contact: att.email || att.telefone,
      department: att.departamento,
      status: att.status, // 'open', 'resolved', 'pending'
      channel: att.canal, // 'whatsapp', 'instagram', etc
      createdAt: att.data_abertura.toISOString(),
      updatedAt: att.data_atualizacao?.toISOString(),
      openedAt: att.data_abertura.toISOString(),
      endedAt: att.data_encerramento?.toISOString() || null,
      lastMessage: att.ultimo_mensagem,
      activeAgentName: att.agente_responsavel,
      sectorName: att.departamento
    }));
    
    res.json({
      data,
      total: atendimentos.length,
      filtered: atendimentos.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ejemplo backend para POST /api/v1/atendimento/mensagem
app.post('/api/v1/atendimento/mensagem', async (req, res) => {
  try {
    const { filter = {}, options = {} } = req.body;
    const attendanceId = filter.id_rota;
    
    if (!attendanceId) {
      return res.status(400).json({ error: 'id_rota es requerido' });
    }
    
    // Buscar mensajes del atendimiento
    const mensagens = await db.from('mensagens')
      .where('id_atendimento', attendanceId)
      .orderBy('data_mensagem', 'asc')
      .limit(options.limit || 100);
    
    // Normalizar respuesta
    const data = mensagens.map(msg => ({
      id: msg.id,
      id_atendimento: msg.id_atendimento,
      from: msg.tipo === 'agente' ? 'agent' : 'user', // Normalizar
      senderName: msg.nome_remetente,
      senderEmail: msg.email_remetente,
      text: msg.conteudo,
      timestamp: msg.data_mensagem.toISOString()
    }));
    
    res.json({
      data,
      total: mensagens.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## 🚨 Posibles Errores y Soluciones

### Error: "Sin conversaciones que coincidan con los filtros"

**Causa:** El backend no retorna datos o están fuera del período.

**Solución:**
1. Verifica que el campo `createdAt` o `openedAt` esté en ISO 8601
2. Asegúrate de que hay datos en el rango de fechas especificado
3. Log los filtros que recibe el backend

### Error: "El filtro de departamento no funciona"

**Causa:** El campo `department` no existe en la respuesta.

**Solución:**
```javascript
// Asegúrate de retornar:
{
  "id": "12345",
  "department": "Sales",    // ← Debe existir
  // ...
}
```

### Error: "Los mensajes no se cargan"

**Causa:** El endpoint `/api/v1/atendimento/mensagem` no responde correctamente.

**Solución:**
1. Verifica que el endpoint esté implementado
2. Asegúrate de que `id_rota` sea el ID correcto
3. Verifica el formato de la respuesta (debe tener array `data`)

### Error: "Las fechas no se filtran correctamente"

**Causa:** Formato de fecha incorrecto o comparación incorrecta.

**Solución:**
```javascript
// CORRECTO: ISO 8601
"dataInicialAbertura": "2026-04-01"    // ✓ YYYY-MM-DD

// INCORRECTO:
"dataInicialAbertura": "01/04/2026"    // ✗ DD/MM/YYYY
"dataInicialAbertura": "2026-04-01 10:30:00"  // ✗ Demasiado específico
```

---

## 📋 Checklist de Implementación

- [ ] Endpoint `/api/v1/atendimento` implementado
- [ ] Endpoint `/api/v1/atendimento/mensagem` implementado
- [ ] Respuestas retornan JSON válido
- [ ] Campo `department` o `sector` existe en atendimentos
- [ ] Campo `createdAt` o `openedAt` está en ISO 8601
- [ ] Filtro por período funciona en backend
- [ ] Filtro por departamento funciona en backend
- [ ] Campo `from` retorna "agent" o "user"
- [ ] Campo `timestamp` está en ISO 8601
- [ ] Error handling es correcto (status 400, 500, etc)

---

## 🧪 Test Manual

Usar Postman o curl:

```bash
# Test 1: Buscar atendimientos
curl -X POST http://localhost:3000/api/v1/atendimento \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "dataInicialAbertura": "2026-04-01",
      "dataFinalAbertura": "2026-04-08",
      "departamento": "Sales"
    },
    "options": {"limit": 10}
  }'

# Test 2: Obtener mensajes
curl -X POST http://localhost:3000/api/v1/atendimento/mensagem \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"id_rota": "12345"},
    "options": {"limit": 50}
  }'
```

**Verificar que:**
- Status sea 200
- `data` sea un array
- Cada elemento tenga los campos requeridos
- Fechas estén en formato ISO 8601

---

## 🔐 Seguridad

⚠️ **Importante:**

1. **Validar entrada:**
   ```javascript
   if (!filter.dataInicialAbertura || !isValidDate(filter.dataInicialAbertura)) {
     return res.status(400).json({ error: 'Fecha inválida' });
   }
   ```

2. **Limitar resultados:**
   ```javascript
   const limit = Math.min(options.limit || 100, 1000); // Máximo 1000
   ```

3. **Autenticación:**
   - Asegúrate de que el usuario esté autenticado
   - Solo retornar datos que el usuario pueda ver

4. **Inyección SQL:**
   - Usar ORM (Sequelize, TypeORM) o queries preparadas
   - Nunca concatenar strings en queries

---

## 📞 Soporte

Si el backend no tiene estos endpoints, el frontend mostrará:
- "Sin conversaciones que coincidan con los filtros"
- "Configurar la API primero"

Implementa ambos endpoints y los filtros funcionarán correctamente.

---

**Versión:** v2.3.1  
**Fecha:** 8 de abril de 2026
