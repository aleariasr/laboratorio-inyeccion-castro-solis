# Registra (de forma idempotente) la tarea programada que arranca la distro
# WSL2 de LICS cuando cualquier usuario inicia sesión en esta computadora.
#
# Esto NO reemplaza los respaldos automáticos: esos ya están resueltos por
# infra/systemd/lics-backup.timer (Persistent=true) DENTRO de la distro, sin
# cambios. Esta tarea solo garantiza que la distro efectivamente arranque
# cada vez que la computadora se enciende, para que ese timer tenga la
# oportunidad de correr (y de "ponerse al día" si la máquina estuvo apagada
# a la hora programada).

$ErrorActionPreference = 'Stop'

$TaskName = 'LICS - Iniciar backend'
$Distro = 'lics-wsl'
$WslExe = Join-Path $env:WINDIR 'System32\wsl.exe'

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-WSL] $Message"
}

$action = New-ScheduledTaskAction -Execute $WslExe -Argument "-d $Distro -- /opt/lics/scripts/start.sh"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -Hidden `
    -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Log "Ya existe la tarea '$TaskName', se reemplaza."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Arranca los servicios de LICS (Docker dentro de WSL2) cuando cualquier usuario inicia sesion en esta computadora, para que los respaldos automaticos y la app esten listos sin esperar.' `
    | Out-Null

Write-Log "Tarea programada '$TaskName' registrada (dispara con el inicio de sesion de cualquier usuario)."
