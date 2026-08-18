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
#    lo confirmaron.
#
# VENTANA REALMENTE OCULTA (corrección sobre la versión anterior de este
# archivo): "-Hidden" en New-ScheduledTaskSettingsSet NO oculta la ventana
# de consola del proceso lanzado -- solo oculta la TAREA de la lista del
# Programador de Tareas (la UI de administración). Confirmado contra la
# documentación oficial de Microsoft (ITaskSettings::put_Hidden). La
# versión anterior invocaba wsl.exe directo como acción de la tarea, y como
# la tarea corre en la sesión interactiva del usuario (necesario para que
# funcione con cualquier usuario que inicie sesión, sin guardar contraseña),
# eso sí abría una ventana de consola real y visible -- indistinguible de
# cualquier otra terminal abierta a simple vista. Confirmado en validación
# real: se cerró por error junto con otras terminales, matando el proceso
# (LastTaskResult 0xC000013A = STATUS_CONTROL_C_EXIT, el código que deja
# Windows al cerrar la consola de un proceso que no maneja esa señal) y
# reproduciendo el problema original de "no fue posible comunicarse con el
# sistema local".
#
# La acción de cada tarea ahora es "powershell.exe -WindowStyle Hidden"
# envolviendo un "Start-Process ... -WindowStyle Hidden" hacia wsl.exe: con
# -WindowStyle Hidden en ambos niveles, el proceso final no tiene ninguna
# ventana que mostrar -- no aparece en la barra de tareas, no se puede
# Alt-Tab a él, y sobre todo no hay nada que el usuario pueda cerrar por
# error. Para la tarea de mantener sesión, el wrapper además reintenta en
# un bucle infinito si el proceso muere (docker restart, wsl --shutdown
# manual, lo que sea), en vez de depender solo del RestartCount de Task
# Scheduler -- ese sigue configurado igual, como red de seguridad adicional
# por si el wrapper mismo muere.
#
# SEGUNDA RONDA (18/08/2026): "LICS - Mantener sesion WSL activa" quedó
# confirmada realmente invisible (verificado en validación real: proceso
# corriendo, sin ninguna ventana). "LICS - Iniciar backend", con el mismo
# wrapper Start-Process -WindowStyle Hidden, SÍ aparecía -- minimizada,
# en negro, sin poder usarse -- al iniciar sesión. Causa real: -WindowStyle
# Hidden en Start-Process oculta la ventana DESPUÉS de creada
# (ShowWindow(SW_HIDE)), no impide que se cree. Para "sleep infinity" (sin
# salida) esa ventana, si llega a existir un instante, no muestra nada y
# nadie la nota. Para start.sh (docker compose, migraciones, con salida
# real durante segundos o minutos) esa ventana existe el tiempo suficiente
# para ser visible antes de que el ocultamiento termine de aplicarse.
#
# Fix real: en vez de crear la ventana y ocultarla, evitar que se cree del
# todo, con el flag CreateNoWindow de .NET (System.Diagnostics.Process),
# que se aplica en el momento mismo de crear el proceso (a nivel de
# CreateProcess de Windows), no después. Es un mecanismo distinto y más
# confiable que Start-Process -WindowStyle Hidden para procesos de consola
# que sí producen salida.

$ErrorActionPreference = 'Stop'

$Distro = 'lics-wsl'
$WslExe = Join-Path $env:WINDIR 'System32\wsl.exe'
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-WSL] $Message"
}

function Register-LicsTask {
    param(
        [Parameter(Mandatory = $true)][string]$TaskName,
        [Parameter(Mandatory = $true)][string]$WslArgument,
        [Parameter(Mandatory = $true)][string]$Description,
        [switch]$KeepAlive
    )

    # Un solo apóstrofe dentro de $WslArgument rompería el -Command de abajo;
    # ninguno de los argumentos que se usan hoy lo tiene, pero por las dudas
    # se escapa igual (comilla simple duplicada, forma estándar de
    # PowerShell dentro de un string entre comillas simples).
    $escapedWslArgument = $WslArgument.Replace("'", "''")
    $escapedWslExe = $WslExe.Replace("'", "''")

    # CreateNoWindow=$true evita que se cree la ventana de consola de raíz
    # (a diferencia de Start-Process -WindowStyle Hidden, que la crea y
    # recién después la oculta -- ver comentario de cabecera, "SEGUNDA
    # RONDA"). UseShellExecute debe ir en $false para que CreateNoWindow
    # tenga efecto.
    $psiCommand = "`$psi = New-Object System.Diagnostics.ProcessStartInfo; " +
        "`$psi.FileName = '$escapedWslExe'; " +
        "`$psi.Arguments = '$escapedWslArgument'; " +
        "`$psi.UseShellExecute = `$false; " +
        "`$psi.CreateNoWindow = `$true; " +
        "`$proc = [System.Diagnostics.Process]::Start(`$psi); " +
        "`$proc.WaitForExit()"

    if ($KeepAlive) {
        # Bucle infinito propio en vez de depender solo de RestartCount de
        # Task Scheduler: si wsl.exe muere por lo que sea, se relanza solo
        # en segundos, sin esperar a que Task Scheduler decida que la tarea
        # "falló" y aplique su propio intervalo de reintento.
        $psCommand = "while (`$true) { try { $psiCommand } catch { } Start-Sleep -Seconds 5 }"
    } else {
        $psCommand = $psiCommand
    }

    $psArgument = "-NoProfile -WindowStyle Hidden -Command `"$psCommand`""

    $action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument $psArgument
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Limited

    if ($KeepAlive) {
        # ExecutionTimeLimit en 0 = sin límite (el default de Task Scheduler
        # es matar la tarea a los 3 días, lo cual mataría el wrapper). El
        # bucle propio de arriba ya reintenta wsl.exe si muere; RestartCount/
        # RestartInterval acá son red de seguridad adicional por si el
        # wrapper de powershell.exe mismo muere (no debería, pero por las
        # dudas).
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

    Write-Log "Tarea programada '$TaskName' registrada (dispara con el inicio de sesion de cualquier usuario, sin ventana visible)."
}

Register-LicsTask `
    -TaskName 'LICS - Iniciar backend' `
    -WslArgument "-d $Distro -- /opt/lics/scripts/start.sh" `
    -Description 'Arranca los servicios de LICS (Docker dentro de WSL2) cuando cualquier usuario inicia sesion en esta computadora, para que los respaldos automaticos y la app esten listos sin esperar.'

Register-LicsTask `
    -TaskName 'LICS - Mantener sesion WSL activa' `
    -WslArgument "-d $Distro -- sleep infinity" `
    -Description 'Mantiene una sesion wsl.exe conectada a la distro de forma indefinida, sin ventana visible, para evitar que WSL2 la apague por quedarse sin clientes conectados (ver infra/windows/README.md, seccion Problema conocido).' `
    -KeepAlive
