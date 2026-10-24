!macro customInit
  nsExec::Exec 'taskkill /F /IM "PC Sentinel.exe"'
  nsExec::Exec 'taskkill /F /IM "pc-sentinel-service.exe"'
!macroend

!macro customInstall
  DetailPrint "Configurando regras no Firewall do Windows para o PC Sentinel (portas 3890 e 3891)..."
  ; Remove as regras anteriores para não duplicar ao reinstalar
  nsExec::Exec 'netsh advfirewall firewall delete rule name="PC Sentinel LAN (3890)"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="PC Sentinel Service (3891)"'
  ExecWait 'netsh advfirewall firewall add rule name="PC Sentinel LAN (3890)" dir=in action=allow protocol=TCP localport=3890'
  ExecWait 'netsh advfirewall firewall add rule name="PC Sentinel Service (3891)" dir=in action=allow protocol=TCP localport=3891'
!macroend

!macro customUnInstall
  DetailPrint "Removendo regras no Firewall do Windows do PC Sentinel..."
  ExecWait 'netsh advfirewall firewall delete rule name="PC Sentinel LAN (3890)"'
  ExecWait 'netsh advfirewall firewall delete rule name="PC Sentinel Service (3891)"'
!macroend
