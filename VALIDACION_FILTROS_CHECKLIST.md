# ✅ Guía de Validación - Filtros de Conversas

## 🎯 Objetivos

Validar que los nuevos filtros de conversas funcionen correctamente en todas sus facetas.

---

## 📋 Checklist de Validación

### 1️⃣ Validación Inicial del Sistema

- [ ] Servidor Node.js está corriendo (`http://localhost:3000`)
- [ ] No hay errores en la consola del navegador (F12 → Console)
- [ ] Página carga correctamente
- [ ] Menú lateral es funcional

**Paso:**
```bash
# En terminal
npm start

# En navegador
Abre http://localhost:3000
Presiona F12
```

---

### 2️⃣ Validación de Filtros - Período

**Objetivo:** Verificar que las fechas se cargan automáticamente.

**Pasos:**

1. Navega a sección **Conversaciones (OPA)**
2. En la barra de filtros, busca los inputs de fecha
3. Verifica que **estén pre-rellenos**:
   - Fecha inicio: `2026-04-01` (primer día del mes)
   - Fecha final: `2026-04-08` (hoy)

**Checklist:**
- [ ] Input "Fecha inicio" tiene valor pre-relleno
- [ ] Input "Fecha final" tiene valor pre-relleno
- [ ] Valores corresponden a primer día del mes y hoy

**Si falla:**
```javascript
// En consola (F12):
document.getElementById('convDateStart').value  // Debe tener valor
document.getElementById('convDateEnd').value    // Debe tener valor
```

---

### 3️⃣ Validación de Filtros - Departamento

**Objetivo:** Verificar que el filtro de departamento existe y es funcional.

**Pasos:**

1. En la barra de filtros, busca el dropdown "Departamento"
2. Verifica que tenga las siguientes opciones:
   - Sales
   - Support
   - Billing
   - Technical

3. Selecciona "Sales"
4. Verifica que la lista de conversaciones se actualiza

**Checklist:**
- [ ] Dropdown de departamento existe
- [ ] Tiene al menos 4 opciones
- [ ] Al seleccionar, la lista se actualiza

**Si falla:**
```javascript
// En consola (F12):
document.getElementById('convDepartmentFilter')  // Debe existir
```

---

### 4️⃣ Validación de Filtrado - Período

**Objetivo:** Verificar que el filtro de período funciona.

**Pasos:**

1. En la barra de filtros, cambia manualmente la "Fecha inicio"
2. Cambia a una fecha diferente (ej: `2026-03-15`)
3. Presiona Tab o Enter
4. Verifica que la lista se actualiza

**Checklist:**
- [ ] Al cambiar fecha inicio, lista se actualiza
- [ ] Al cambiar fecha final, lista se actualiza
- [ ] Cambios son instantáneos (< 1 segundo)

---

### 5️⃣ Validación de Filtrado - Departamento

**Objetivo:** Verificar que el filtro de departamento funciona.

**Pasos:**

1. Restablece las fechas a los valores por defecto
2. En dropdown "Departamento", selecciona "Support"
3. Verifica que solo aparecen conversaciones de Support
4. Cambia a "Sales"
5. Verifica que ahora solo aparecen conversaciones de Sales

**Checklist:**
- [ ] Al seleccionar departamento, lista se filtra
- [ ] Solo aparecen conversaciones del departamento seleccionado
- [ ] Cambios son instantáneos

---

### 6️⃣ Validación - Combinación de Filtros

**Objetivo:** Verificar que múltiples filtros funcionan juntos.

**Pasos:**

1. Restablece fechas a valores por defecto
2. Selecciona departamento: "Sales"
3. Selecciona estado: "Open"
4. Selecciona canal: "WhatsApp"
5. Verifica que la lista muestra SOLO conversaciones que cumplen TODOS los criterios

**Checklist:**
- [ ] Múltiples filtros se aplican correctamente
- [ ] El resultado es la intersección de todos los filtros
- [ ] Contador muestra el número correcto de resultados

---

### 7️⃣ Validación - Detalles de Conversación

**Objetivo:** Verificar que los detalles carga correctamente.

**Pasos:**

1. Haz click en una conversación de la lista
2. Se abre un modal con detalles
3. Verifica que muestre:
   - Protocolo
   - Estado
   - Sector
   - Canal
   - Atendente
   - Fecha inicio
   - Fecha fin

**Checklist:**
- [ ] Modal se abre correctamente
- [ ] Muestra información del atendimiento
- [ ] No hay errores en consola

---

### 8️⃣ Validación - Mensajes Filtrados

**Objetivo:** Verificar que los mensajes se cargan en el modal.

**Pasos:**

1. En el modal de detalles, busca la sección "Mensajes (período filtrado)"
2. Verifica que muestre una lista de mensajes
3. Cada mensaje debe tener:
   - Nombre del remitente
   - Fecha y hora
   - Contenido del mensaje

**Checklist:**
- [ ] Sección "Mensajes" es visible
- [ ] Muestra al menos un mensaje (o "Sin mensajes disponibles")
- [ ] Los mensajes tienen timestamp
- [ ] No hay errores en consola

**Si falla:**
- [ ] El backend puede no estar retornando mensajes
- [ ] Ver consola para detectar error

---

### 9️⃣ Validación - Persistencia

**Objetivo:** Verificar que los filtros se mantienen después de cerrar modal.

**Pasos:**

1. Establece filtros personalizados:
   - Fecha: `2026-03-01` a `2026-03-31`
   - Departamento: "Support"
2. Haz click en una conversación
3. Cierra el modal
4. Verifica que los filtros siguen aplicados

**Checklist:**
- [ ] Filtros se mantienen después de cerrar modal
- [ ] La lista sigue mostrando resultados filtrados

---

### 🔟 Validación - Búsqueda + Filtros

**Objetivo:** Verificar que búsqueda + filtros funcionan juntos.

**Pasos:**

1. En "Buscar conversación", escribe parte de un nombre
2. Verifica que se filtra por búsqueda Y período Y departamento
3. Cambia el período
4. Verifica que la búsqueda sigue aplicada

**Checklist:**
- [ ] Búsqueda + Filtros trabajan juntos
- [ ] Cada cambio actualiza la lista correctamente

---

## 🐛 Troubleshooting

### Problema: "Las fechas no están rellenas"

**Solución:**
1. Abre consola (F12)
2. Ejecuta:
   ```javascript
   renderOPA()
   ```
3. Verifica si las fechas se cargan

**Si funciona:** Problema en inicialización automática
**Si no funciona:** Problema en renderOPA()

---

### Problema: "El filtro de departamento no funciona"

**Causas posibles:**
1. Backend no retorna campo `department`
2. Función getFilteredConvs() no se ejecuta

**Solución:**
```javascript
// En consola (F12):
// 1. Verifica que APP.vylexConversations existe
console.log(APP.vylexConversations[0])

// 2. Verifica que tiene campo 'department'
console.log(APP.vylexConversations[0].department)

// 3. Manualmente filtra
APP.vylexConversations.filter(c => c.department === 'Sales')
```

---

### Problema: "Los mensajes no se cargan"

**Causas posibles:**
1. Backend no implementó endpoint `/api/v1/atendimento/mensagem`
2. Respuesta de API tiene formato incorrecto

**Solución:**
```javascript
// En consola (F12):
// Intenta cargar mensajes manualmente
await fetchConvMessages('12345', '2026-04-01', '2026-04-08')
```

---

### Problema: "La lista está vacía"

**Causas posibles:**
1. No hay datos en el período especificado
2. Filtro de departamento no coincide

**Solución:**
1. Expande el período de fechas
2. Limpia el filtro de departamento
3. Verifica en consola:
   ```javascript
   console.log(APP.vylexConversations)  // Debe tener datos
   ```

---

## 🧪 Test Automatizado (para QA)

```javascript
// Copiar y pegar en consola (F12)

async function testFiltros() {
  console.log('=== TEST FILTROS ===');
  
  // Test 1: Fechas inicializadas
  const ds = document.getElementById('convDateStart').value;
  const de = document.getElementById('convDateEnd').value;
  console.log('✓ Fechas inicializadas:', ds, de);
  
  // Test 2: Departamento existe
  const dept = document.getElementById('convDepartmentFilter');
  console.log('✓ Departamento existe:', !!dept);
  
  // Test 3: getFilteredConvs ejecuta
  const filtered = getFilteredConvs();
  console.log('✓ Conversaciones filtradas:', filtered.length);
  
  // Test 4: Obtener mensajes
  if (APP.vylexConversations.length > 0) {
    const firstId = APP.vylexConversations[0].id;
    const msgs = await fetchConvMessages(firstId, ds, de);
    console.log('✓ Mensajes obtenidos:', msgs.length);
  }
  
  console.log('=== TEST COMPLETADO ===');
}

testFiltros()
```

---

## 📊 Métricas de Validación

Completa esta tabla:

| Test | Estado | Notas |
|------|--------|-------|
| Fechas auto-rellenas | ✓/✗ | |
| Departamento funciona | ✓/✗ | |
| Período filtra | ✓/✗ | |
| Múltiples filtros | ✓/✗ | |
| Detalles se abren | ✓/✗ | |
| Mensajes cargan | ✓/✗ | |
| Persistencia | ✓/✗ | |
| Búsqueda + filtros | ✓/✗ | |
| Sin errores en consola | ✓/✗ | |

---

## ✅ Aprobación Final

**Marcar como completado cuando:**

- [x] Todos los tests del checklist pasan
- [x] No hay errores en consola
- [x] El filtrado es rápido (< 500ms)
- [x] Los mensajes se cargan sin errores
- [x] La UI es responsive

---

## 📝 Notas Finales

- Si algo falla, verificar console.log en F12
- Backend debe retornar campos: `department`, `createdAt`, `id`, `from`, `timestamp`
- Formato de fecha debe ser ISO 8601 (YYYY-MM-DD)

---

**Validado el:** _______________  
**Por:** _______________  
**Estado:** ✅ APROBADO / ❌ RECHAZADO
