@echo off
chcp 65001 >nul
title PC Sentinel - Liberar Porta 3890 no Firewall

echo ============================================================
echo   Liberando porta 3890 no Firewall do Windows (LAN / Wi-Fi)
echo ============================================================
echo.
powershell -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\"PC Sentinel LAN (3890)\" dir=in action=allow protocol=TCP localport=3890' -Verb RunAs -Wait"
echo.
echo Concluido! Verificando regra no Firewall:
netsh advfirewall firewall show rule name="PC Sentinel LAN (3890)"
pause
