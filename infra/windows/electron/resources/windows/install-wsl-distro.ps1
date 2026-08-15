# Corre durante la instalación del .exe de LICS (ver build/installer.nsh).
# Prepara WSL2, importa la distro "lics-wsl" desde la imagen dorada offline,
# y registra la tarea programada que la arranca al iniciar sesión.
#
# Código de salida:
#   0 = todo listo
#   2 = Windows necesita reiniciarse para terminar de activar WSL2
#   >0 (otro) = error real, revisar mensaje

param(
    [Parameter(Mandatory = $true)]
    [string]$RootfsPath
)

$ErrorActionPreference = 'Stop'

$DistroName = 'lics-wsl'
$InstallDir = "$env:ProgramData\LICS\wsl"

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-WSL] $Message"
}

function Test-VirtualizationEnabled {
    try {
        $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop
        return [bool]$cpu.VirtualizationFirmwareEnabled
    } catch {
        return $true  # si no se puede determinar, no bloquear la instalación por esto
    }
}

try {
    if (-not (Test-VirtualizationEnabled)) {
        Write-Log "ADVERTENCIA: la virtualizacion no parece estar activa en BIOS/UEFI."
        Write-Log "WSL2 no va a arrancar hasta activarla manualmente y reiniciar la maquina."
    }

    if (-not (Test-Path $RootfsPath)) {
        Write-Log "ERROR: no se encontro la imagen dorada en $RootfsPath"
        Write-Log "El instalador esta incompleto: falta empaquetar lics-wsl-rootfs.tar junto al .exe."
        exit 1
    }

    $features = @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')
    $needsReboot = $false

    foreach ($feature in $features) {
        $state = (Get-WindowsOptionalFeature -Online -FeatureName $feature).State
        if ($state -ne 'Enabled') {
            Write-Log "Habilitando $feature..."
            Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart | Out-Null
            $needsReboot = $true
        } else {
            Write-Log "$feature ya estaba habilitado."
        }
    }

    if ($needsReboot) {
        Write-Log "Windows necesita reiniciarse para terminar de habilitar WSL2."
        exit 2
    }

    wsl --set-default-version 2 | Out-Null

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # El disco de la distro (.vhdx) vive en $InstallDir. Sin excluirlo del
    # antivirus en tiempo real, el escaneo puede frenar el I/O lo suficiente
    # como para que el arranque de systemd supere el timeout interno de WSL2
    # (10s) y WSL termine apagando la distro justo despues de terminar de
    # arrancarla -- visto en validacion real como cortes intermitentes de
    # conexion. No es fatal si falla (puede haber otro antivirus, o esto no
    # correr como admin todavia en ese punto).
    try {
        Add-MpPreference -ExclusionPath $InstallDir -ErrorAction Stop
        Write-Log "Excluido $InstallDir del escaneo en tiempo real de Windows Defender."
    } catch {
        Write-Log "ADVERTENCIA: no se pudo agregar $InstallDir a las exclusiones de Windows Defender ($($_.Exception.Message)). Si usan otro antivirus, agreguen esa exclusion a mano."
    }

    $existingDistros = (wsl -l -q) 2>$null
    if ($existingDistros -notcontains $DistroName) {
        Write-Log "Importando distro $DistroName desde $RootfsPath (puede tardar varios minutos)..."
        wsl --import $DistroName $InstallDir $RootfsPath --version 2
        if ($LASTEXITCODE -ne 0) {
            throw "wsl --import fallo con codigo $LASTEXITCODE"
        }
        Write-Log "Distro importada."
    } else {
        Write-Log "La distro $DistroName ya existe, no se reimporta (para no perder datos existentes)."
    }

    # .wslconfig es por usuario de Windows. Se escribe para el usuario que
    # ejecuta la instalación; si el taller usa una cuenta compartida distinta
    # para el día a día, hay que repetir este paso logueado con esa cuenta.
    $wslConfigPath = Join-Path $env:USERPROFILE '.wslconfig'
    $hasIdleTimeout = (Test-Path $wslConfigPath) -and (Select-String -Path $wslConfigPath -Pattern 'vmIdleTimeout' -Quiet -ErrorAction SilentlyContinue)

    if (-not $hasIdleTimeout) {
        Add-Content -Path $wslConfigPath -Value "`n[wsl2]`nvmIdleTimeout=-1`n"
        Write-Log "Configurado vmIdleTimeout=-1 en $wslConfigPath (evita que WSL2 apague la distro por inactividad y rompa los respaldos programados)."
    } else {
        Write-Log "$wslConfigPath ya tiene vmIdleTimeout configurado, no se toca."
    }

    Write-Log "Validando que la distro arranca..."
    wsl -d $DistroName -- true
    if ($LASTEXITCODE -ne 0) {
        throw "La distro se importo pero no arranco correctamente."
    }

    Write-Log "Registrando tarea programada de arranque..."
    & (Join-Path $PSScriptRoot 'register-scheduled-task.ps1')

    Write-Log "Instalación de WSL2 completada."
    exit 0

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
