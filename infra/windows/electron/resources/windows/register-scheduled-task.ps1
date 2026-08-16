# Registra (de forma idempotente) dos tareas programadas para la distro WSL2
# de LICS, disparadas cuando cualquier usuario inicia sesión en esta
# computadora.
#
# 1. "LICS - Iniciar backend": corre start.sh una vez, para que los
#    servicios (y los respaldos automáticos, vía lics-backup.timer con
#    Persistent=true dentro de la distro) estén listos sin esperar a que
#    alguien abra la app.
#
# 2. "LICS - Mantener sesion WSL activa": mantiene un proceso wsl.exe
#    conectado a la distro de forma indefinida (sleep infinity adentro). Sin
#    esto, en validación real se confirmó que WSL2 apaga la distro completa
#    (systemd, Docker, todo) segundos después de terminar de arrancar
#    cuando ningún proceso wsl.exe queda conectado como cliente — incluso
#    con systemd=true en wsl.conf, que en teoría debería bastar pero en la
#    práctica no lo hizo en esta validación. Ver infra/windows/README.md,
#    sección "Problema conocido", para el detalle completo con los logs que
#    lo confirmaron. Configurada para reiniciarse sola si por lo que sea el
#    proceso muere (reinicio de la distro, etc.), como red de seguridad
#    adicional a lics-watchdog.timer (que corre DENTRO de la distro).

$ErrorActionPreference = 'Stop'

$Distro = 'lics-wsl'
$WslExe = Join-Path $env:WINDIR 'System32\wsl.exe'

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-WSL] $Message"
}

function Register-LicsTask {
    param(
        [Parameter(Mandatory = $true)][string]$TaskName,
        [Parameter(Mandatory = $true)][string]$Argument,
        [Parameter(Mandatory = $true)][string]$Description,
        [switch]$KeepAlive
    )

    $action = New-ScheduledTaskAction -Execute $WslExe -Argument $Argument
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Limited

    if ($KeepAlive) {
        # ExecutionTimeLimit en 0 = sin límite (el default de Task Scheduler
        # es matar la tarea a los 3 días, lo cual mataría "sleep infinity").
        # RestartCount/RestartInterval: si el proceso muere igual, se
        # reintenta solo cada minuto, indefinidamente.
        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -Hidden `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
            -RestartCount 999 `
            -RestartInterval (New-TimeSpan -Minutes 1)
    } else {
        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -Hidden `
            -MultipleInstances IgnoreNew
    }

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
        -Description $Description `
        | Out-Null

    Write-Log "Tarea programada '$TaskName' registrada (dispara con el inicio de sesion de cualquier usuario)."
}

Register-LicsTask `
    -TaskName 'LICS - Iniciar backend' `
    -Argument "-d $Distro -- /opt/lics/scripts/start.sh" `
    -Description 'Arranca los servicios de LICS (Docker dentro de WSL2) cuando cualquier usuario inicia sesion en esta computadora, para que los respaldos automaticos y la app esten listos sin esperar.'

Register-LicsTask `
    -TaskName 'LICS - Mantener sesion WSL activa' `
    -Argument "-d $Distro -- sleep infinity" `
    -Description 'Mantiene una sesion wsl.exe conectada a la distro de forma indefinida, para evitar que WSL2 la apague por quedarse sin clientes conectados (ver infra/windows/README.md, seccion Problema conocido).' `
    -KeepAlive
