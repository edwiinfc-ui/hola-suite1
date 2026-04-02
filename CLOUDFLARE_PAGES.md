# Cloudflare Pages (sin Vercel)

Este proyecto puede publicarse en **Cloudflare Pages** (gratis) usando:

- Frontend estático: `vylex.html`, `css/`, `js/`, etc.
- Backend serverless: **Pages Functions** en `functions/api/[[path]].js` (rutas `/api/...`)

## 1) Crear el proyecto

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages**
2. Conecta GitHub y selecciona el repo `edwiinfc-ui/hola-suite1`
3. Settings del build:
   - **Framework preset:** None
   - **Build command:** *(vacío)*
   - **Build output directory:** `/`

## 2) Variables de entorno (Pages → Settings → Variables)

Obligatorias:

- `JWT_SECRET`
- `CLICKUP_API_KEY`
- `CLICKUP_LIST_ID`

Opcionales:

- `PUBLIC_API_KEY` (para extensión/búsqueda: `GET /api/public/search?q=...` con header `x-api-key`)
- `HOLA_API_URL` (ej: `https://wispro.holasuite.com/api`)
- `HOLA_API_TOKEN`
- `ADMIN_EMAIL` (default: `admin@holasuite.com`)
- `ADMIN_PASSWORD` (default: `hola2025`)

## 3) URLs

- App: `https://<tu-proyecto>.pages.dev/vylex.html`
- Login: `POST /api/auth/login`
- Sesión: `GET /api/auth/me`
- ClickUp tasks: `GET /api/clickup/tasks`
- OPA/Hola: `POST /api/opa/conversations`, `POST /api/opa/attendance/:id/detail`

## 4) Auto-deploy

Cada `git push` a la rama configurada en Pages redeploya automáticamente (production). PRs generan preview.

