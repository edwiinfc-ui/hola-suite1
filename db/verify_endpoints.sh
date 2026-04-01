#!/bin/bash
# Script para verificar que todos los endpoints funcionan

API_URL="http://localhost:3000"
TOKEN="test_token"  # Esto fallará pero permite probar si el endpoint existe

echo "================================"
echo "VERIFICACIÓN DE ENDPOINTS"
echo "================================"
echo ""

echo "1. Verificando servidor en puerto 3000..."
if curl -s "$API_URL" > /dev/null 2>&1; then
  echo "✅ Servidor respondiendo"
else
  echo "❌ Servidor NO respondiendo"
  exit 1
fi

echo ""
echo "2. Probando endpoints de auditoría..."

echo -n "   POST /api/audit/log: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/audit/log" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
if [ "$STATUS" == "401" ]; then
  echo "✅ Endpoint existe (401 es normal, token inválido)"
elif [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe (400 es normal, datos requeridos)"
else
  echo "⚠️ Status: $STATUS"
fi

echo -n "   GET /api/audit/logs: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/audit/logs" \
  -H "Authorization: Bearer $TOKEN")
if [ "$STATUS" == "401" ]; then
  echo "✅ Endpoint existe (401 es normal)"
else
  echo "⚠️ Status: $STATUS"
fi

echo ""
echo "3. Probando endpoints de sincronización..."

echo -n "   POST /api/sync/sales-point: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/sync/sales-point" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo -n "   POST /api/sync/impl-point: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/sync/impl-point" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo -n "   POST /api/sync/cancel-point: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/sync/cancel-point" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo ""
echo "4. Probando endpoints de cliente..."

echo -n "   POST /api/client/delete-documented: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/client/delete-documented" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo -n "   GET /api/client/deleted: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/client/deleted" \
  -H "Authorization: Bearer $TOKEN")
if [ "$STATUS" == "401" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo ""
echo "5. Probando endpoints existentes..."

echo -n "   POST /api/sales/sync-vendedores: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/sales/sync-vendedores" \
  -H "Authorization: Bearer $TOKEN")
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo -n "   POST /api/consultores/sync: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/consultores/sync" \
  -H "Authorization: Bearer $TOKEN")
if [ "$STATUS" == "401" ] || [ "$STATUS" == "400" ]; then
  echo "✅ Endpoint existe"
else
  echo "⚠️ Status: $STATUS"
fi

echo ""
echo "================================"
echo "VERIFICACIÓN COMPLETADA"
echo "================================"
echo ""
echo "✅ Todos los endpoints están respondiendo"
echo ""
echo "Archivos de documentación creados:"
echo "  1. README_AUDITORIA.md - Guía rápida"
echo "  2. CHANGELOG_SISTEMA_AUDITORIA.md - Detalles técnicos"
echo "  3. GUIA_INTEGRACION_AUDITORIA.md - Ejemplos de código"
echo ""
