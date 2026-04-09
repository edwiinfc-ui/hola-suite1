#!/bin/bash
#
# TEST-CLICKUP-FIX.sh
# Prueba rápida del fix de ClickUp (tareas vacío)
#

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     🧪 TEST: Fix ClickUp Tareas Vacío (v2.5)                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración
API_USER="${1:-admin@holasuite.com}"
API_PASS="${2:-hola2025}"
SERVER_URL="${3:-http://localhost:3000}"
LIST_ID="${4:}"

echo "🔧 CONFIGURACIÓN:"
echo "   Usuario: $API_USER"
echo "   Servidor: $SERVER_URL"
echo "   List ID: ${LIST_ID:-NO_CONFIGURADO}"
echo ""

# PASO 1: Login
echo "📍 PASO 1: Autenticación"
echo "───────────────────────────────────────"
LOGIN_RESP=$(curl -s -X POST "$SERVER_URL/api/auth" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$API_USER\", \"password\": \"$API_PASS\"}")

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login falló${NC}"
  echo "Respuesta: $LOGIN_RESP"
  exit 1
fi

echo -e "${GREEN}✅ Login exitoso${NC}"
echo "Token: ${TOKEN:0:30}..."
echo ""

# PASO 2: Test /api/clickup/tasks
echo "📍 PASO 2: Obtener tareas procesadas (/api/clickup/tasks)"
echo "───────────────────────────────────────"

TASKS_RESP=$(curl -s -X GET "$SERVER_URL/api/clickup/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

TASK_COUNT=$(echo "$TASKS_RESP" | grep -o '"tasks":\[' | wc -l)

if [ $TASK_COUNT -eq 0 ]; then
  echo -e "${RED}❌ Sin tareas en respuesta${NC}"
  echo "Respuesta: $TASKS_RESP" | head -10
  exit 1
fi

TASK_COUNT=$(echo "$TASKS_RESP" | grep -o '{"id"' | wc -l)
echo -e "${GREEN}✅ Endpoint /api/clickup/tasks funciona${NC}"
echo "Tareas procesadas recibidas: $TASK_COUNT"
echo ""

# PASO 3: Analizar estructura
echo "📍 PASO 3: Validar estructura de datos"
echo "───────────────────────────────────────"

# Verificar si tiene estructura de cliente (no RAW)
HAS_NOMBRE=$(echo "$TASKS_RESP" | grep -o '"nombre":"' | wc -l)
HAS_STATUS_TYPE=$(echo "$TASKS_RESP" | grep -o '"statusType":"' | wc -l)
HAS_PAIS=$(echo "$TASKS_RESP" | grep -o '"pais":"' | wc -l)

if [ $HAS_NOMBRE -gt 0 ] && [ $HAS_STATUS_TYPE -gt 0 ]; then
  echo -e "${GREEN}✅ Estructura de CLIENTE PROCESADO${NC}"
  echo "   • nombre: $HAS_NOMBRE"
  echo "   • statusType: $HAS_STATUS_TYPE"
  echo "   • pais: $HAS_PAIS"
else
  echo -e "${YELLOW}⚠️  Podría ser estructura RAW${NC}"
  echo "   • nombre: $HAS_NOMBRE (esperado > 0)"
  echo "   • statusType: $HAS_STATUS_TYPE (esperado > 0)"
fi
echo ""

# PASO 4: Meta información
echo "📍 PASO 4: Meta información"
echo "───────────────────────────────────────"

META_SOURCE=$(echo "$TASKS_RESP" | grep -o '"source":"[^"]*' | cut -d'"' -f4)
META_TOTAL_RAW=$(echo "$TASKS_RESP" | grep -o '"totalRaw":[0-9]*' | cut -d':' -f2)

echo "Meta:"
echo "   • source: $META_SOURCE"
echo "   • totalRaw: $META_TOTAL_RAW"
echo "   • processedCount: $TASK_COUNT"
echo ""

# PASO 5: Resumen
echo "╔═══════════════════════════════════════════════════════════════╗"
if [ $TASK_COUNT -gt 0 ]; then
  echo -e "║ ${GREEN}✅ EXITOSO${NC}: $TASK_COUNT tareas procesadas"
else
  echo -e "║ ${YELLOW}⚠️  ADVERTENCIA${NC}: Sin tareas en respuesta"
fi
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

echo "💡 PRÓXIMOS PASOS:"
echo "1. Abre http://localhost:3000"
echo "2. Ve a Configuración (⚙️)"
echo "3. Sección 'Conexión ClickUp'"
echo "4. Haz clic en botón 'Diagnóstico'"
echo "5. Revisa consola (F12) para ver estados de ClickUp vs CONFIG"
echo ""
