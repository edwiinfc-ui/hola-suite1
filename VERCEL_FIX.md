# 🔧 Solución: Hola Suite en Vercel no funciona

El problema es que Vercel necesita una estructura específica para funcionar. He configurado todo correctamente.

## ✅ Lo que hice:

### 1. Creé `api/index.js`
- Handler serverless que reemplaza `server.js`
- Maneja todos los endpoints `/api/*`
- Compatible con Vercel Functions

### 2. Actualicé `vercel.json`
- Configuración correcta para Vercel v2
- Rewrites para API y assets estáticos
- CORS habilitado

### 3. Estructura correcta:
```
.
├── api/
│   └── index.js          ← Todos los endpoints
├── vylex.html            ← Frontend
├── charts.js
├── package.json
├── vercel.json           ← Configuración
└── .env                  ← Variables (no subir)
```

---

## 🚀 Cómo Desplegar Ahora:

### Paso 1: Asegúrate de tener .env local

```bash
cp .env.example .env
```

Edita `.env` y agrega:
```env
SUPABASE_URL=https://vvrnufzwyxszknnnfvig.supabase.co
SUPABASE_SERVICE_KEY=tu_service_key
SUPABASE_ANON_KEY=tu_anon_key
JWT_SECRET=tu_secret_seguro
```

### Paso 2: Commit y push a GitHub

```bash
git add api/index.js vercel.json
git commit -m "fix: Fix Vercel deployment configuration"
git push origin main
```

### Paso 3: En Vercel Dashboard

1. Ve a https://vercel.com/dashboard
2. Selecciona proyecto `hola-suite`
3. **Settings** → **Environment Variables**
4. Agrega:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SUPABASE_ANON_KEY`
   - `JWT_SECRET`
5. Click **Redeploy**

### Paso 4: Espera a que Vercel redespliege

Vercel recompilará tu proyecto con la nueva estructura.

---

## 📱 URLs después de reparar:

```
Frontend:   https://hola-suite.vercel.app/
API:        https://hola-suite.vercel.app/api/data
Login:      https://hola-suite.vercel.app/api/login
```

---

## 🔍 Diagnosticar Problemas:

### Ver logs en Vercel:

```bash
vercel logs --follow
```

### Probar API local:

```bash
# Asegúrate de tener .env configurado
npm install
node api/index.js
```

### Probar endpoints:

```bash
# Login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@holasuite.com","password":"hola2025"}'

# Obtener clientes
curl http://localhost:3000/api/data \
  -H "Authorization: Bearer TU_TOKEN"
```

---

## ✨ Próximos Pasos:

1. ✅ Archivo `api/index.js` creado
2. ✅ `vercel.json` actualizado
3. ⏳ Commit y push a GitHub
4. ⏳ Agregar variables en Vercel Dashboard
5. ⏳ Redeploy en Vercel

---

## 🆘 Si aún no funciona:

### Error: "Cannot find module"

```bash
npm install @supabase/supabase-js jsonwebtoken
npm install --save-dev dotenv
```

### Error: "API not found"

Verifica que `api/index.js` existe y está en la raíz.

### Error: "Environment variables not set"

En Vercel Dashboard → Settings → Environment Variables
Agrega todas las variables de `.env.example`

---

**Versión:** 2.1 | Fecha: 1 de Abril de 2026

