# 📚 Guía: Activar Integraciones Opcionales

## Estado Actual
✅ **Sistema Base**: Funcional
✅ **ClickUp API**: Activa (100 tareas disponibles)
✅ **Fase 1 & 2**: Completadas
⏳ **Google Sheets**: Lista para activar
⏳ **¡Hola! Suite**: Lista para activar

---

## 1. Google Sheets (OPCIONAL)

### Paso 1: Obtener credenciales de Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita estas APIs:
   - **Google Sheets API v4**
   - **Google Drive API** (opcional, para acceso a archivos)
4. Ve a `Credenciales` → `+ Crear credenciales`
5. Selecciona `Clave de API`
6. Copia la clave API

### Paso 2: Obtener ID de la hoja

1. Ve a tu Google Sheet en Google Drive
2. En la URL, copia el ID (la parte larga entre `/d/` y `/edit`):
   ```
   https://docs.google.com/spreadsheets/d/1XXXXX...XXXXX/edit
                                        ^^^^^^^^^^^^^^^^^^^^
                                        ID DE LA HOJA
   ```

### Paso 3: Agregar a .env

```bash
# Editar .env
GOOGLE_SHEETS_API_KEY=AIzaSyD...XXX
GOOGLE_SHEET_ID=1XXXXX...XXXXX
```

### Paso 4: Verificar

```bash
# Reiniciar servidor
npm start

# Ejecutar verificación
node verify_all_integrations.js
```

---

## 2. ¡Hola! Suite (OPCIONAL)

### Paso 1: Obtener credenciales de ¡Hola!

1. Contacta a tu administrador de ¡Hola! Suite
2. Solicita:
   - **URL de API**: `https://wispro.holasuite.com` (o tu dominio)
   - **Token API**: Token de acceso (Bearer o JWT)
3. Verifica que tengas acceso a estos endpoints (depende de tu plan):
   - `GET /api/v1/departments` - Departamentos
   - `GET /api/v1/conversations` - Conversaciones
   - `GET /api/v1/attendance/details` - Asistencia

### Paso 2: Agregar a .env

```bash
# Editar .env
HOLA_API_URL=https://wispro.holasuite.com
HOLA_API_TOKEN=eyJhbGc...XYZ
```

### Paso 3: Verificar

```bash
# Reiniciar servidor
npm start

# Ejecutar verificación
node verify_all_integrations.js
```

---

## 3. Verificar todas las integraciones

```bash
# Ver estado de todas las integraciones
node verify_all_integrations.js

# Ver dashboard de integraciones
node integration_dashboard.js

# Ver log del servidor
npm start
```

---

## 4. Endpoints adicionales (cuando están activadas)

### Si Google Sheets está activa:

```bash
# Importar datos desde Google Sheets
curl -X POST http://localhost:3000/api/sheets/import \
  -H "Authorization: Bearer <TOKEN>"

# Ver ventas importadas
curl http://localhost:3000/api/sheets/sales \
  -H "Authorization: Bearer <TOKEN>"
```

### Si ¡Hola! Suite está activa:

```bash
# Ver departamentos
curl http://localhost:3000/api/hola/departments \
  -H "Authorization: Bearer <TOKEN>"

# Ver conversaciones
curl http://localhost:3000/api/hola/conversations \
  -H "Authorization: Bearer <TOKEN>"

# Ver asistencia
curl http://localhost:3000/api/hola/attendance \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 5. Solución de problemas

### "API Key inválida"
- Verifica que la clave sea la correcta en .env
- Revisa que no haya espacios en blanco al copiar

### "Token expirado"
- Los tokens pueden expirar, solicita uno nuevo a tu proveedor
- Actualiza .env con el nuevo token

### "Acceso denegado"
- Verifica que las credenciales tengan permisos para los endpoints necesarios
- Contacta a tu administrador

### "Conexión rechazada"
- Verifica que la URL sea correcta (sin typos)
- Prueba la conexión: `curl <URL>`

---

## 6. Monitoreo

```bash
# Ver últimas 100 auditorías
curl "http://localhost:3000/api/auditoria?limit=100" \
  -H "Authorization: Bearer <TOKEN>" | jq '.'

# Ver estadísticas de cache
curl http://localhost:3000/api/cache/stats \
  -H "Authorization: Bearer <TOKEN>" | jq '.'
```

---

## 📋 Resumen

| Integración | Estado | Requerida | Documentación |
|-----------|--------|-----------|---------------|
| ClickUp | ✅ Activa | Sí | [setup-clickup.md](./docs/setup-clickup.md) |
| Google Sheets | ⏳ Lista | No | ⬆️ Arriba |
| ¡Hola! Suite | ⏳ Lista | No | ⬆️ Arriba |

**Recomendación**: Activa Google Sheets primero (más simple), luego ¡Hola! Suite.

---

**¿Necesitas ayuda?** Contacta al equipo técnico.
