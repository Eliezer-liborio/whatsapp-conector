#!/bin/bash

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   WhatsApp → HubSpot Middleware      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Verifica Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    echo "   Instale em: https://nodejs.org"
    exit 1
fi

# Verifica .env
if [ ! -f ".env" ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    cp .env.example .env
    echo "   Arquivo .env criado. Edite-o com seu token HubSpot."
    echo "   Abra o arquivo .env e substitua o valor de HUBSPOT_API_KEY"
    exit 1
fi

# Instala dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
    echo ""
fi

echo "🚀 Iniciando servidor..."
echo "   Pressione Ctrl+C para parar."
echo ""
node middleware.js
