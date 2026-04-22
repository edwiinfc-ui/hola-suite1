#!/bin/bash
# 🚀 QUICK START - COMANDOS PARA COMENZAR LA IMPLEMENTACIÓN

# Este archivo contiene todos los comandos que necesitas ejecutar para comenzar

echo "🚀 VY-LEX IMPLEMENTACIÓN RÁPIDA"
echo "================================"
echo ""

# 1. BACKUP
echo "1️⃣  Creando backup..."
mkdir -p backup
BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
tar -czf "${BACKUP_NAME}.tar.gz" \
  server.js \
  ENDPOINTS_INTEGRACION.js \
  data/ 2>/dev/null \
  users.json \
  audit_logs.json \
  global_config.json
echo "✅ Backup creado: ${BACKUP_NAME}.tar.gz"
echo ""

# 2. INSTALAR DEPENDENCIAS
echo "2️⃣  Instalando dependencias..."
npm install bcryptjs express-rate-limit joi dotenv

if [ $? -eq 0 ]; then
  echo "✅ Dependencias instaladas"
else
  echo "❌ Error instalando dependencias"
  exit 1
fi
echo ""

# 3. CREAR .env
echo "3️⃣  Creando archivo .env..."
if [ ! -f .env ]; then
  cat > .env << 'EOF'
PORT=3000
NODE_ENV=development
JWT_SECRET=tu_jwt_secret_super_seguro_cambia_esto_en_prod_123456789
CLICKUP_API_KEY=
CLICKUP_LIST_ID=
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000
BCRYPT_ROUNDS=10
JWT_EXPIRATION=1h
LOG_LEVEL=info
CACHE_TTL=1800
EOF
  echo "✅ .env creado. EDITA tus credenciales."
else
  echo "⚠️  .env ya existe, no se sobrescribe"
fi
echo ""

# 4. CREAR DIRECTORIOS
echo "4️⃣  Creando directorios..."
mkdir -p data logs tests

# 5. CREAR global_config.json
echo "5️⃣  Creando global_config.json..."
if [ ! -f global_config.json ]; then
  cat > global_config.json << 'EOF'
{
  "clickupApiKey": "",
  "clickupListId": "",
  "googleSheetsApiKey": "",
  "CONSULTORES": {},
  "consultantMetas": {},
  "enabledIntegrations": {
    "clickup": true,
    "sheets": false,
    "hola": false
  }
}
EOF
  echo "✅ global_config.json creado"
else
  echo "⚠️  global_config.json ya existe"
fi
echo ""

# 6. VERIFICAR ARCHIVOS CREADOS
echo "6️⃣  Verificando archivos creados..."
echo ""
echo "📄 Nuevos archivos:"
ls -lh ANALISIS_COMPLETO_Y_MEJORAS.md \
      ENDPOINTS_INTEGRACION_MEJORADO.js \
      OPTIMIZACIONES_Y_MEJORAS.js \
      GUIA_IMPLEMENTACION_PASO_A_PASO.md \
      RESUMEN_Y_PLAN_ACCION.md \
      INDICE_ARCHIVOS_CREADOS.md 2>/dev/null | grep -E "^-"

echo ""
echo "✅ Verificación completa"
echo ""

# 7. MOSTRAR NEXT STEPS
echo "📋 PRÓXIMOS PASOS:"
echo "================================================"
echo ""
echo "1. Editar .env con tus credenciales:"
echo "   nano .env"
echo ""
echo "2. Leer documentación (en este orden):"
echo "   a) INDICE_ARCHIVOS_CREADOS.md (2 min)"
echo "   b) RESUMEN_Y_PLAN_ACCION.md (15 min)"
echo "   c) ANALISIS_COMPLETO_Y_MEJORAS.md (1 hora)"
echo ""
echo "3. Comenzar implementación:"
echo "   a) Seguir GUIA_IMPLEMENTACION_PASO_A_PASO.md"
echo "   b) Fase 1: Setup (2 horas)"
echo "   c) Fase 2: Core Fixes (4 horas)"
echo ""
echo "4. Verificar:"
echo "   npm start"
echo ""
echo "🎉 ¡Listo para comenzar!"
echo ""
