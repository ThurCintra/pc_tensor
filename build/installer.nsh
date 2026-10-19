!macro customInit
  nsExec::Exec 'taskkill /F /IM "PC Sentinel.exe"'
!macroend

!macro customInstall
  DetailPrint "Configurando regra no Firewall do Windows para o PC Sentinel (porta 3890)..."
  ExecWait 'netsh advfirewall firewall add rule name="PC Sentinel LAN (3890)" dir=in action=allow protocol=TCP localport=3890'
!macroend

!macro customUnInstall
  DetailPrint "Removendo regra no Firewall do Windows do PC Sentinel..."
  ExecWait 'netsh advfirewall firewall delete rule name="PC Sentinel LAN (3890)"'
!macroend
