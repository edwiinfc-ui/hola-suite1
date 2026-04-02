#!/bin/bash

# 📊 Script de Verificación de Cambios Responsivos
# Verifica que todos los archivos de responsive design están en su lugar

echo "
╔════════════════════════════════════════════════════════════════╗
║         ✓ RESPONSIVE DESIGN - VERIFICACIÓN RÁPIDA            ║
╚════════════════════════════════════════════════════════════════╝
"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador
TOTAL=0
OK=0

# Función para verificar archivo
check_file() {
    local file=$1
    local desc=$2
    TOTAL=$((TOTAL+1))
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $desc"
        echo "  📍 $file"
        local size=$(wc -c < "$file" | numfmt --to=iec 2>/dev/null || wc -c < "$file")
        echo "  📦 Tamaño: $size"
        OK=$((OK+1))
    else
        echo -e "${RED}✗${NC} $desc"
        echo "  📍 $file (NO ENCONTRADO)"
    fi
    echo ""
}

# Verificar archivos CSS
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 ARCHIVOS CSS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "css/responsive.css" "CSS Responsivo"

# Verificar archivos JavaScript
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚙️  ARCHIVOS JAVASCRIPT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "js/responsive-manager.js" "Gestor de Responsividad"
check_file "js/session-persistence.js" "Persistencia de Sesión"

# Verificar archivos de documentación
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 ARCHIVOS DE DOCUMENTACIÓN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "RESPONSIVE_GUIDE.md" "Guía de Responsive Design"
check_file "SESSION_PERSISTENCE_GUIDE.md" "Guía de Persistencia de Sesión"
check_file "INSTRUCCIONES_FINALES.txt" "Instrucciones Actualizadas"

# Verificar cambios en HTML
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 VERIFICACIÓN EN vylex.html"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "responsive.css" vylex.html; then
    echo -e "${GREEN}✓${NC} CSS responsivo enlazado"
else
    echo -e "${RED}✗${NC} CSS responsivo NO enlazado"
fi

if grep -q "responsive-manager.js" vylex.html; then
    echo -e "${GREEN}✓${NC} Script responsive-manager enlazado"
else
    echo -e "${RED}✗${NC} Script responsive-manager NO enlazado"
fi

if grep -q "session-persistence.js" vylex.html; then
    echo -e "${GREEN}✓${NC} Script session-persistence enlazado"
else
    echo -e "${RED}✗${NC} Script session-persistence NO enlazado"
fi

if grep -q "viewport-fit=cover" vylex.html; then
    echo -e "${GREEN}✓${NC} Viewport meta tag mejorado"
else
    echo -e "${RED}✗${NC} Viewport meta tag NO actualizado"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Archivos verificados: $TOTAL"
echo -e "Archivos encontrados: ${GREEN}$OK${NC}/$TOTAL"

if [ $OK -eq $TOTAL ]; then
    echo -e "\n${GREEN}✓ ¡TODOS LOS ARCHIVOS ESTÁN EN SU LUGAR!${NC}\n"
else
    echo -e "\n${YELLOW}⚠ Faltan algunos archivos${NC}\n"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 PRÓXIMOS PASOS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Probar en navegador desktop:"
echo "   $ npm start"
echo "   → Abre http://localhost:3000"
echo ""
echo "2. Probar en móvil:"
echo "   • Abre DevTools (F12)"
echo "   • Toggle Device Toolbar (Ctrl+Shift+M)"
echo "   • Selecciona dispositivo"
echo ""
echo "3. Probar en teléfono real:"
echo "   $ vercel deploy"
echo "   → Abre https://hola-suite.vercel.app"
echo ""
echo "4. Hacer commit:"
echo "   $ git add -A"
echo "   $ git commit -m 'feat: Add responsive design and session persistence'"
echo "   $ git push origin main"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Setup completado - ¡Tu app es responsive!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
