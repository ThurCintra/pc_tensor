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

  ; Driver PawnIO: sem ele o LibreHardwareMonitor não lê temperatura, clock nem potência da CPU. Só instala se
  ; ainda não houver um (outros programas, como FanControl, usam o mesmo driver). O setup do PawnIO pede o UAC
  ; sozinho, por isso ExecShellWait (ExecWait não abre programas que exigem administrador); recusado, o app
  ; avisa na Visão geral e mostra onde baixar.
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO" "DisplayVersion"
  SetRegView lastused
  StrCmp $0 "" 0 pawnio_done
  IfFileExists "$INSTDIR\resources\pawnio\PawnIO_setup.exe" 0 pawnio_done
  DetailPrint "Instalando o driver de sensores PawnIO..."
  ExecShellWait "" "$INSTDIR\resources\pawnio\PawnIO_setup.exe" "-install -silent" SW_HIDE
  pawnio_done:
!macroend

!macro customUnInstall
  DetailPrint "Removendo regras no Firewall do Windows do PC Sentinel..."
  ExecWait 'netsh advfirewall firewall delete rule name="PC Sentinel LAN (3890)"'
  ExecWait 'netsh advfirewall firewall delete rule name="PC Sentinel Service (3891)"'
!macroend
