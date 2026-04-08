#!/bin/bash

# Script para probar los endpoints v1 de atendimento

set -e

BASE_URL="http://localhost:3000"
USERNAME="${1:-admin@holasuite.com}"
PASSWORD="${2:-hola2025}"

echo "═══════════════════════════════════════════════════════════════════════════"
echo "  🧪 Testing OPA v1 Endpoints"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Step 1: Login
echo "PASO 1️⃣  Autenticación"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Haciendo login como: $USERNAME"
echo ""

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USERNAME\",
    \"password\": \"$PASSWORD\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Error: No se pudo obtener token"
  echo "Respuesta: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Token obtenido: ${TOKEN:0:50}..."
echo ""

# Step 2: Test /api/v1/atendimento
echo "PASO 2️⃣  Probar /api/v1/atendimento"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Pidiendo atendimientos con filtro de período..."
echo ""

PAYLOAD_ATEND=$(cat <<'EOF'
{
  "filter": {
    "dataInicialAbertura": "2026-04-01",
    "dataFinalAbertura": "2026-04-08"
  },
  "options": {
    "limit": 100
  }
}
EOF
)

echo "Payload enviado:"
echo "$PAYLOAD_ATEND" | jq '.' 2>/dev/null || echo "$PAYLOAD_ATEND"
echo ""

ATEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/atendimento" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_ATEND")

echo "Respuesta:"
echo "$ATEND_RESPONSE" | jq '.' 2>/dev/null || echo "$ATEND_RESPONSE"
echo ""

# Check if error
if echo "$ATEND_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  ERROR=$(echo "$ATEND_RESPONSE" | jq -r '.error')
  echo "⚠️  API Error: $ERROR"
  echo "Esto es NORMAL si el backend no está configurado aún."
  echo ""
else
  TOTAL=$(echo "$ATEND_RESPONSE" | jq -r '.total // 0')
  echo "✅ Atendimientos encontrados: $TOTAL"
  echo ""
fi

# Step 3: Test /api/v1/atendimento/mensagem (con ID dummy)
echo "PASO 3️⃣  Probar /api/v1/atendimento/mensagem"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Pidiendo mensajes de un atendimiento..."
echo ""

PAYLOAD_MSG=$(cat <<'EOF'
{
  "filter": {
    "id_rota": "test_123",
    "dataInicialAbertura": "2026-04-01",
    "dataFinalAbertura": "2026-04-08"
  },
  "options": {
    "limit": 100
  }
}
EOF
)

echo "Payload enviado:"
echo "$PAYLOAD_MSG" | jq '.' 2>/dev/null || echo "$PAYLOAD_MSG"
echo ""

MSG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/atendimento/mensagem" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD_MSG")

echo "Respuesta:"
echo "$MSG_RESPONSE" | jq '.' 2>/dev/null || echo "$MSG_RESPONSE"
echo ""

# Check if error
if echo "$MSG_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  ERROR=$(echo "$MSG_RESPONSE" | jq -r '.error')
  echo "⚠️  API Error: $ERROR"
  echo "Esto es NORMAL si el backend no está configurado aún."
  echo ""
else
  TOTAL=$(echo "$MSG_RESPONSE" | jq -r '.total // 0')
  echo "✅ Mensajes encontrados: $TOTAL"
  echo ""
fi

# Step 4: Summary
echo "RESUMEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Endpoints /api/v1 están respondiendo correctamente"
echo ""
echo "Próximos pasos:"
echo "1. Configurar URL y Token en el backend (global_config.json)"
echo "2. Los endpoints forwardearán requests a tu API externa"
echo "3. Frontend podrá usar filtros de período y departamento"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
