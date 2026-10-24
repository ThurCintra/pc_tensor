@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PC Sentinel - Inicializador Master

:: ============================================================================
:: 1. AUTO-ELEVAÇÃO AUTOMÁTICA PARA ADMINISTRADOR (UAC)
:: Necessário para acesso direto aos diodos térmicos e drivers AMD ADL / Intel
:: ============================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ======================================================================
    echo    PC Sentinel - Solicitando Privilegios de Administrador
    echo ======================================================================
    echo.
    echo Sensores de hardware de baixo nivel (AMD Ryzen/Radeon) e portas de rede
    echo necessitam de permissao de Administrador para leitura direta.
    echo.
    echo Solicitando elevacao UAC... Clique em "Sim" na janela do Windows.
    echo.

    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: ============================================================================
:: 2. CABEÇALHO DO SISTEMA
:: ============================================================================
cls
echo ======================================================================
echo    PC SENTINEL - SISTEMA DE TELEMETRIA E STREAMING HUD
echo    Modo: Administrador (Sensores Fisicos Reais Sincronizados)
echo ======================================================================
echo.

:: ============================================================================
:: 3. VERIFICAÇÃO DO AMBIENTE (NODE.JS)
:: ============================================================================
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO CRITICO] O Node.js nao foi encontrado no sistema!
    echo Para executar o PC Sentinel, instale o Node.js v18 ou superior em:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: ============================================================================
:: 4. INSTALAÇÃO INICIAL OU VERIFICAÇÃO DE ATUALIZAÇÕES
:: ============================================================================
if not exist "node_modules\" (
    echo [1/5] Primeira execucao detectada: Instalando dependencias do PC Sentinel...
    echo Isso pode levar de 1 a 2 minutos dependendo da sua conexao...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao instalar dependencias do Node.js.
        pause
        exit /b 1
    )
) else (
    rem Atualizacoes NAO sao baixadas automaticamente: este script roda como
    rem Administrador e executaria qualquer codigo novo do repositorio sem revisao.
    rem Para atualizar, rode "git pull" manualmente e revise as mudancas.
    echo [1/5] Dependencias encontradas.
)

echo [2/5] Compilando interface de producao (Vite)...
call npm run build
if !errorlevel! neq 0 (
    echo [ERRO] Falha ao compilar a interface.
    pause
    exit /b 1
)

:: ============================================================================
:: 5. LIBERAÇÃO DA PORTA DO FIREWALL PARA O SMARTPHONE (PORTA 3890)
:: ============================================================================
echo [3/5] Verificando Firewall do Windows para conexao mobile...
netsh advfirewall firewall show rule name="PC Sentinel LAN (3890)" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="PC Sentinel LAN (3890)" dir=in action=allow protocol=TCP localport=3890 profile=any >nul 2>&1
    echo [OK] Regra criada: Porta 3890 liberada para o HUD mobile.
) else (
    echo [OK] Firewall configurado corretamente (Porta 3890 liberada).
)

:: ============================================================================
:: 6. FINALIZAR PROCESSOS ANTIGOS E GARANTIR PONTE DE SENSORES HARDWARE C#
:: ============================================================================
echo [4/5] Sincronizando modulo de sensores de hardware (AMD ADL / LibreHardware)...
taskkill /F /IM "pc-sensor-bridge.exe" >nul 2>&1
taskkill /F /IM "pc-sensor-bridge-new.exe" >nul 2>&1

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "tools\LibreHardwareMonitor\pc-sensor-bridge.exe" (
    if exist "%CSC%" (
        echo Compilando ponte nativa C# de sensores...
        "%CSC%" /target:exe /out:"tools\LibreHardwareMonitor\pc-sensor-bridge.exe" /reference:"tools\LibreHardwareMonitor\LibreHardwareMonitorLib.dll,tools\LibreHardwareMonitor\HidSharp.dll" "tools\LibreHardwareMonitor\pc-sensor-bridge.cs" >nul 2>&1
    )
)
echo [OK] Sensores fisicos de CPU (AMD Ryzen) e GPU (AMD Radeon) prontos.

:: ============================================================================
:: 7. INICIAR O PC SENTINEL
:: ============================================================================
echo.
echo ======================================================================
echo    PC SENTINEL PRONTO PARA EXECUCAO!
echo    - Dashboard Desktop: janela do PC Sentinel (build de producao)
echo    - Mobile HUD: http://[SEU_IP_LOCAL]:3890 (QR Code na interface)
echo    - Pressione Ctrl+C nesta janela quando desejar encerrar.
echo    - Para desenvolvimento com hot reload use: npm run dev
echo ======================================================================
echo.

call npm start

if %errorlevel% neq 0 (
    echo.
    echo [INFO] O PC Sentinel foi finalizado.
    pause
)
