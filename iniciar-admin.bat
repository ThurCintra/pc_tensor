@echo off
setlocal
cd /d "%~dp0"
title PC Sentinel - Modo Administrador (Sensores 100%% Reais)

:: 1. Verifica se ja esta executando como Administrador
net session >nul 2>&1
if %errorlevel% == 0 goto :RUN_APP

:: 2. Se nao for administrador, solicita elevacao via VBScript
echo ======================================================================
echo    PC Sentinel - Solicitando Privilegios de Administrador
echo ======================================================================
echo.
echo Solicitando permissao de Administrador (UAC do Windows)...
echo Por favor, clique em "Sim" na janela que vai aparecer.
echo.

set "VBS_FILE=%TEMP%\getadmin_%RANDOM%.vbs"
echo Set UAC = CreateObject^("Shell.Application"^) > "%VBS_FILE%"
echo UAC.ShellExecute "%~f0", "", "", "runas", 1 >> "%VBS_FILE%"

cscript //nologo "%VBS_FILE%"
set "ERR=%errorlevel%"
del "%VBS_FILE%" >nul 2>&1

if %ERR% neq 0 (
    echo.
    echo [AVISO] A elevacao foi cancelada ou bloqueada.
    echo.
    echo Voce tambem pode iniciar facilmente clicando com o
    echo BOTAO DIREITO neste arquivo e escolhendo:
    echo "Executar como Administrador"
    echo.
    pause
)
exit /b

:RUN_APP
echo ======================================================================
echo    PC Sentinel - Modo Administrador Ativo (Sensores 100%% Reais)
echo ======================================================================
echo.
echo [1/2] Limpando processos antigos em segundo plano...
taskkill /F /IM "PC Sentinel.exe" >nul 2>&1
taskkill /F /IM "pc-sensor-bridge.exe" >nul 2>&1

echo [2/2] Iniciando Vite e Electron com sensores fisicos...
echo.
cd /d "%~dp0"
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [INFO] O processo foi encerrado.
    pause
)
