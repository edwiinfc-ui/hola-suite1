# Rotación de secretos (recomendado)

Este repositorio **ya tuvo credenciales en texto plano** en commits anteriores. Aunque ahora se sanitizaron archivos y se movió la config sensible a `data/global_config.local.json`/`.env`, lo ideal es **rotar/revocar** esos secretos.

## Qué rotar / revocar

- **ClickUp**
  - Revocar el token/API key expuesto y generar uno nuevo.
  - Actualizar `CLICKUP_API_KEY` (en `.env`) o `data/global_config.local.json`.
- **Hola Suite (Wispro) API**
  - Revocar/rotar el token.
  - Actualizar `HOLA_API_TOKEN` o `data/global_config.local.json.holaToken`.
- **Google Sheets API Key** (si se usa)
  - Restringir por dominio/IP/servicio y rotar si fue expuesta.
  - Actualizar `GOOGLE_SHEETS_API_KEY`.

## Validar que quedó todo funcionando

1. Crear el archivo local (si no existe):
   - `npm run setup:local-config`
2. Poner credenciales en `data/global_config.local.json` o en `.env`
3. Ejecutar verificación:
   - `npm run verify:connections`

## (Opcional) Limpiar el historial de Git

Si quieres **eliminar del historial** los secretos expuestos, hay que reescribir history (impacta a todos los clones).
Recomendado hacerlo solo si el repo es privado o controlas a todos los colaboradores.

Herramienta típica: `git filter-repo` (o BFG).

Si me confirmas que quieres hacerlo, preparo el comando exacto para este repo y te dejo el plan de coordinación (force-push + reset de clones).

