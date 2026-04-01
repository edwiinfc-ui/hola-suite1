#!/bin/bash

# Instalación rápida de Hola Suite

echo "📦 Instalando Hola Suite Dashboard..."
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "Descarga desde: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js detectado: $(node --version)"
echo ""

# Instalar dependencias
echo "📥 Instalando dependencias..."
npm install

echo ""
echo "✅ Instalación completada"
echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "🚀 PARA INICIAR:"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "  npm start"
echo ""
echo "📱 Luego abre: http://localhost:3000"
echo ""
echo "🔐 Credenciales:"
echo "   Usuario: admin@holasuite.com"
echo "   Contraseña: hola2025"
echo ""
