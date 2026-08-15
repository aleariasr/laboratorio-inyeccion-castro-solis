; Hooks personalizados para el instalador NSIS generado por electron-builder.
; No reemplazan el instalador estándar: se agregan a él (perMachine: true en
; package.json ya hace que este instalador pida elevación de administrador).

!macro customInstall
  DetailPrint "Configurando WSL2 y los servicios de LICS (puede tardar varios minutos la primera vez)..."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows\install-wsl-distro.ps1" -RootfsPath "$INSTDIR\resources\windows\lics-wsl-rootfs.tar"'
  Pop $0

  ${If} $0 == "2"
    MessageBox MB_OK|MB_ICONINFORMATION "Windows necesita reiniciarse para terminar de activar WSL2.$\r$\nReinicie la computadora y vuelva a abrir este instalador."
  ${ElseIf} $0 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Hubo un problema configurando WSL2 (código $0). Revise el registro de instalación y contacte a soporte técnico antes de usar LICS."
  ${EndIf}
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "¿Eliminar también los servicios de LICS dentro de WSL2 (incluye la base de datos y los respaldos)?$\r$\nSi no está seguro, elija NO y consulte a soporte técnico." IDYES uninstallWsl IDNO skipWsl

  uninstallWsl:
    DetailPrint "Eliminando la distro WSL2 lics-wsl (incluye datos y respaldos)..."
    nsExec::ExecToLog 'wsl --unregister lics-wsl'
    Goto doneWsl

  skipWsl:
    DetailPrint "Se conserva la distro WSL2 lics-wsl. LICS ya no tiene ícono, pero los datos siguen intactos."
    DetailPrint "Para eliminarla manualmente más adelante: wsl --unregister lics-wsl"

  doneWsl:
!macroend
