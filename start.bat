@echo off
chcp 1252 >nul
title WhatsApp para HubSpot - Middleware

echo.
echo  ==========================================
echo   WhatsApp para HubSpot CRM - Middleware
echo  ==========================================
echo.

:: Verifica se Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERRO: Node.js nao encontrado!
    echo.
    echo  Para instalar o Node.js:
    echo  1. Abra o navegador
    echo  2. Acesse: https://nodejs.org
    echo  3. Clique em "LTS" para baixar
    echo  4. Execute o instalador
    echo  5. Reinicie o computador
    echo  6. Clique duas vezes neste arquivo novamente
    echo.
    pause
    exit /b 1
)

:: Verifica se o .env existe
if not exist ".env" (
    echo  AVISO: Arquivo .env nao encontrado!
    copy .env.example .env >nul
    echo  Arquivo .env criado com sucesso.
    echo.
    echo  Edite o arquivo .env com seu token HubSpot antes de continuar.
    pause
    exit /b 1
)

:: Instala dependencias se necessario
if not exist "node_modules" (
    echo  Instalando dependencias, aguarde...
    npm install
    echo.
)

echo  Servidor iniciando em http://localhost:3000
echo  Deixe esta janela aberta enquanto usa a extensao.
echo  Para parar, feche esta janela ou pressione Ctrl+C
echo.
node middleware.js
pause
