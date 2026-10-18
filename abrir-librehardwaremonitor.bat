@echo off
title Abrir LibreHardwareMonitor
echo ======================================================================
echo            Iniciando LibreHardwareMonitor Portatil
echo ======================================================================
echo.
cd /d "%~dp0\tools\LibreHardwareMonitor"
start "" LibreHardwareMonitor.exe
echo [OK] LibreHardwareMonitor iniciado.
echo.
echo DICA: Para sincronizar tudo via Web Server local:
echo       Va em Options -> Remote web server -> Run no LibreHardwareMonitor.
echo.
timeout /t 4 >nul
