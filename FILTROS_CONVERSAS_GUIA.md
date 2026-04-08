# 📋 Guía de Filtros de Conversas - v2.3.1

## Resumen de Cambios

Se han implementado **filtros avanzados por período y departamento** en la sección OPA (Conversaciones/Atendimientos).

---

## 🎯 Funcionalidades Nuevas

### 1️⃣ Filtro por Período (Fecha)

**Comportamiento:**
- Al abrir la sección OPA, las fechas se cargan automáticamente:
  - **Fecha Inicio:** Primer día del mes actual
  - **Fecha Final:** Hoy (fecha actual)

**Elementos HTML:**
```html
<input type="date" id="convDateStart" ... />
<input type="date" id="convDateEnd" ... />
```

**Ejemplo:**
- Si hoy es 8 de abril de 2026:
  - Inicio: `2026-04-01` (primer día del mes)
  - Final: `2026-04-08` (hoy)

### 2️⃣ Filtro por Departamento

**Opciones disponibles:**
- Sales
- Support
- Billing
- Technical

**Elemento HTML:**
```html
<select id="convDepartmentFilter" ...>
  <option value="">Departamento</option>
  <option value="sales">Sales</option>
  <option value="support">Support</option>
  <option value="billing">Billing</option>
  <option value="technical">Technical</option>
</select>
```

**Comportamiento:**
- Vacío por defecto (muestra todos los departamentos)
- Se aplica en tiempo real al cambiar la selección

### 3️⃣ Carga de Mensajes Filtrados

**Nueva función:** `fetchConvMessages(attendanceId, dateStart, dateEnd)`

**Ubicación:** Detalles de conversación (modal)

**Características:**
- Carga mensajes dentro del rango de fechas especificado
- Muestra timestamp de cada mensaje
- Diferencia entre mensajes de agente y usuario (colores)

---

## 📐 Estructura API

### Endpoint 1: Buscar Atendimientos (Conversas)

```
POST https://meudominio.com.br/api/v1/atendimento
```

**Payload:**
```json
{
  "filter": {
    "protocolo": "OPA202210",               // Opcional
    "dataInicialAbertura": "2026-04-01",   // Inicio período
    "dataFinalAbertura": "2026-04-08",     // Final período
    "departamento": "Sales"                // Opcional
  },
  "options": {
    "limit": 100
  }
}
```

**Respuesta esperada:**
```json
{
  "data": [
    {
      "id": "12345",
      "protocol": "OPA202210",
      "contactName": "Juan Pérez",
      "department": "Sales",
      "status": "open",
      "createdAt": "2026-04-05T10:30:00Z",
      "updatedAt": "2026-04-08T15:45:00Z",
      ...
    }
  ]
}
```

---

### Endpoint 2: Obtener Mensajes de Atendimiento

```
POST https://meudominio.com.br/api/v1/atendimento/mensagem
```

**Payload:**
```json
{
  "filter": {
    "id_rota": "12345"                     // ID del atendimiento
  },
  "options": {
    "limit": 100
  }
}
```

**Respuesta esperada:**
```json
{
  "data": [
    {
      "id": "msg001",
      "id_atendimento": "12345",
      "from": "agent",                      // "agent" o "user"
      "senderName": "María García",
      "text": "¿En qué puedo ayudarte?",
      "timestamp": "2026-04-08T15:30:00Z"
    },
    {
      "id": "msg002",
      "id_atendimento": "12345",
      "from": "user",
      "senderName": "Juan Pérez",
      "text": "Tengo una pregunta sobre mi contrato",
      "timestamp": "2026-04-08T15:35:00Z"
    }
  ]
}
```

---

## 💻 Cambios en Código

### Función: `renderOPA()`
**Ubicación:** `vylex.html` línea ~7272

**Lo que hace:**
1. Auto-rellena las fechas (primer día del mes → hoy)
2. Renderiza la lista de conversaciones
3. Calcula métricas

```javascript
function renderOPA(){
  // Inicializar filtros de fecha por defecto
  const now=new Date();
  const firstDay=new Date(now.getFullYear(),now.getMonth(),1);
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  
  const dateStartInput=document.getElementById('convDateStart');
  const dateEndInput=document.getElementById('convDateEnd');
  
  if(dateStartInput&&!dateStartInput.value){
    dateStartInput.value=firstDay.toISOString().split('T')[0];
  }
  if(dateEndInput&&!dateEndInput.value){
    dateEndInput.value=today.toISOString().split('T')[0];
  }
  
  // ... resto del código
}
```

---

### Función: `getFilteredConvs()`
**Ubicación:** `vylex.html` línea ~7328

**Lo que hace:**
Filtra conversaciones según:
- Búsqueda por texto
- Estado (Open/Resolved/Pending)
- Canal (WhatsApp/Instagram/Telegram/WebChat)
- Alerta (Critical/Warning/None)
- **Período de fechas (NUEVO)**
- **Departamento (NUEVO)**

```javascript
function getFilteredConvs(){
  let convs=[...APP.vylexConversations];
  
  // ... filtros existentes ...
  
  // Filtro por departamento (NUEVO)
  if(department)convs=convs.filter(c=>c.department===department||c.sector===department);
  
  // Filtro por período (NUEVO)
  if(dateStart||dateEnd){
    convs=convs.filter(c=>{
      const convDate=new Date(c.createdAt||c.openedAt||c.updatedAt||'');
      if(!convDate.getTime())return true;
      if(dateStart){
        const start=new Date(dateStart);
        if(convDate<start)return false;
      }
      if(dateEnd){
        const end=new Date(dateEnd);
        end.setHours(23,59,59,999);
        if(convDate>end)return false;
      }
      return true;
    });
  }
  
  return convs;
}
```

---

### Función: `fetchConvMessages()` (NUEVA)
**Ubicación:** `vylex.html` línea ~7577

**Parámetros:**
- `attendanceId` - ID del atendimiento
- `dateStart` - Fecha inicio (formato: YYYY-MM-DD)
- `dateEnd` - Fecha final (formato: YYYY-MM-DD)

**Retorno:**
Array de mensajes con campos:
- `id` - ID del mensaje
- `from` - "agent" o "user"
- `senderName` - Nombre del remitente
- `text` - Contenido del mensaje
- `timestamp` - Fecha y hora

```javascript
async function fetchConvMessages(attendanceId, dateStart, dateEnd){
  if(!attendanceId)return[];
  
  const filter={
    id_rota:attendanceId
  };
  const options={limit:100};
  
  if(dateStart || dateEnd){
    if(dateStart)filter.dataInicialAbertura=dateStart;
    if(dateEnd)filter.dataFinalAbertura=dateEnd;
  }
  
  const payload={filter,options};
  
  // Intenta proxy primero, luego API directa
  if(canUseServerProxy()){
    try{
      const result=await postJson('/api/opa/messages',{attendance_id:attendanceId,...payload});
      return Array.isArray(result.messages)?result.messages:[];
    }catch(err){
      console.error('Error en proxy:', err);
      return[];
    }
  }
  // ... resto de la función
}
```

---

## 🧪 Cómo Probar

### 1. Abrir la sección OPA

1. Accede a `http://localhost:3000`
2. Navega a **Conversaciones (OPA)**
3. Observa que los campos de fecha están auto-rellenos

### 2. Verificar filtro de período

```
Inicio: 2026-04-01 (primer día del mes)
Final:  2026-04-08 (hoy)
```

- Cambia manualmente las fechas
- Verifica que la lista se actualiza en tiempo real

### 3. Verificar filtro de departamento

1. Selecciona "Sales" en el dropdown de departamento
2. Verifica que solo aparecen conversaciones de ese departamento
3. Cambia a otro departamento y verifica nuevamente

### 4. Ver mensajes filtrados

1. Haz click en una conversación
2. En el modal, busca la sección "Mensajes (período filtrado)"
3. Verifica que muestra solo mensajes dentro del rango de fechas

---

## 📌 Notas Importantes

⚠️ **Campos de fecha:**
- Las fechas se auto-rellenan solo la primera vez que se abre OPA
- Si el usuario cambia manualmente, se respeta el valor ingresado

⚠️ **Departamento:**
- El backend debe retornar campo `department` o `sector` en cada conversación
- Si el campo no existe, el filtro no funcionará

⚠️ **Mensajes:**
- Requiere que el endpoint `/api/v1/atendimento/mensagem` funcione correctamente
- Si falla, se muestra "Sin mensajes disponibles" sin quebrar el modal

⚠️ **Rendimiento:**
- Con más de 500 conversaciones, el filtrado es client-side
- Para datasets mayores, considera implementar paginación en el backend

---

## 🔧 Customización

### Cambiar rango de fechas por defecto

En la función `renderOPA()`, modificar:

```javascript
// ANTES: Primer día del mes
const firstDay=new Date(now.getFullYear(),now.getMonth(),1);

// DESPUÉS: Últimos 7 días
const firstDay=new Date(today.getTime()-6*86400000);
```

### Agregar más departamentos

En el HTML, agregar opciones:

```html
<select id="convDepartmentFilter" ...>
  <option value="sales">Sales</option>
  <option value="support">Support</option>
  <option value="billing">Billing</option>
  <option value="technical">Technical</option>
  <option value="onboarding">Onboarding</option> <!-- NUEVO -->
  <option value="success">Success</option>      <!-- NUEVO -->
</select>
```

### Cambiar formato de fechas en API

La función `fetchConvMessages()` usa `YYYY-MM-DD`. Para cambiar:

```javascript
// ANTES
filter.dataInicialAbertura=dateStart;  // "2026-04-01"

// DESPUÉS: Timestamp Unix
const startDate=new Date(dateStart);
filter.dataInicialAbertura=startDate.getTime();
```

---

## 📞 Soporte

Si algo no funciona:

1. Abre la **Consola del Navegador (F12)**
2. Busca errores en la pestaña **Console**
3. Verifica que el backend retorne datos válidos
4. Asegúrate de que los campos `department` / `createdAt` existan en los datos

---

## ✅ Checklist de Verificación

- [ ] Las fechas se cargan automáticamente al abrir OPA
- [ ] El filtro de departamento es funcional
- [ ] La lista se actualiza al cambiar filtros
- [ ] El modal de detalles muestra la sección de mensajes
- [ ] Los mensajes están filtrados por período
- [ ] No hay errores en la consola del navegador
- [ ] El backend responde correctamente a los endpoints

---

**Versión:** v2.3.1  
**Fecha:** 8 de abril de 2026  
**Estado:** ✅ Producción
