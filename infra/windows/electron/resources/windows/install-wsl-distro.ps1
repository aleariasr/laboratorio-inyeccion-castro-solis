# Corre durante la instalación del .exe de LICS (ver build/installer.nsh).
# Prepara WSL2, importa la distro "lics-wsl" desde la imagen dorada offline,
# y registra la tarea programada que la arranca al iniciar sesión.
#
# Código de salida:
#   0 = todo listo
#   2 = Windows necesita reiniciarse para terminar de activar WSL2 o para
#       terminar de instalar el runtime de WSL2 (el MSI de Microsoft)
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

function Get-WslText {
    param([Parameter(Mandatory = $true)][string[]]$WslArgs)

    # wsl.exe emite UTF-16LE. Windows PowerShell 5.1 (el que usa el hook de
    # NSIS) lo lee como ANSI y deja un byte nulo entre cada caracter, asi que
    # cualquier comparacion sobre la salida cruda de wsl falla en silencio.
    # Sin este filtro, el "-notcontains" de mas abajo siempre daba verdadero
    # y un reintento de instalacion intentaba reimportar una distro que ya
    # existia, fallando con codigo 1 sin explicar por que.
    # $ErrorActionPreference = 'Stop' + "2>&1" sobre un comando nativo hace que
    # PowerShell 5.1 lance NativeCommandError apenas wsl.exe escribe algo a
    # stderr -- es decir, exactamente en los casos que queremos capturar y
    # mostrar. Por eso se baja a 'Continue' solo durante la llamada.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & wsl.exe @WslArgs 2>&1
        $script:LastWslExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousEap
    }

    return (($raw | Out-String) -replace "`0", '')
}

function Test-WslRuntimeInstalled {
    # Tener las caracteristicas de Windows habilitadas NO alcanza: si el
    # paquete del runtime de WSL2 nunca se instalo, wsl.exe queda como un
    # stub que solo entiende --install/--status/--help e imprime la ayuda
    # ante cualquier otro comando, --import incluido. Visto en la instalacion
    # real del 11/09/2026 en una Windows 11 limpia.
    $text = Get-WslText @('--version')
    return ($script:LastWslExitCode -eq 0 -and $text -match '\d+\.\d+\.\d+')
}

function Install-WslRuntime {
    param([Parameter(Mandatory = $true)][string]$ResourcesDir)

    $candidates = @(Get-ChildItem -Path $ResourcesDir -Filter 'wsl.*.x64.msi' -File -ErrorAction SilentlyContinue)

    if ($candidates.Count -eq 0) {
        throw "El runtime de WSL2 no esta instalado y no se encontro ningun wsl.*.x64.msi en $ResourcesDir. El instalador esta incompleto: falta empaquetar el MSI junto al .exe."
    }
    if ($candidates.Count -gt 1) {
        throw "Hay mas de un wsl.*.x64.msi en $ResourcesDir ($($candidates.Name -join ', ')). Debe haber exactamente uno."
    }

    $msi = $candidates[0]
    $log = Join-Path $env:TEMP 'lics-wsl-runtime-msi.log'
    Write-Log "El runtime de WSL2 no esta instalado. Instalando $($msi.Name) sin conexion..."

    $proc = Start-Process -FilePath 'msiexec.exe' -Wait -PassThru -ArgumentList @(
        '/i', "`"$($msi.FullName)`"", '/qn', '/norestart', '/l*v', "`"$log`""
    )

    if ($proc.ExitCode -eq 3010) {
        Write-Log "Runtime de WSL2 instalado. Windows necesita reiniciarse para terminar."
        return $false
    }
    if ($proc.ExitCode -ne 0) {
        throw "msiexec fallo con codigo $($proc.ExitCode) instalando $($msi.Name). Revise el log: $log"
    }

    Write-Log "Runtime de WSL2 instalado ($($msi.Name))."
    return $true
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

    if (-not (Test-WslRuntimeInstalled)) {
        if (-not (Install-WslRuntime -ResourcesDir $PSScriptRoot)) {
            exit 2
        }
        if (-not (Test-WslRuntimeInstalled)) {
            Write-Log "El runtime de WSL2 se instalo pero wsl.exe todavia no responde. Hace falta reiniciar Windows."
            exit 2
        }
    } else {
        Write-Log "El runtime de WSL2 ya estaba instalado."
    }

    Get-WslText @('--set-default-version', '2') | Out-Null

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

    $existingDistros = @(
        (Get-WslText @('-l', '-q')) -split "`r?`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ }
    )

    if ($existingDistros -notcontains $DistroName) {
        Write-Log "Importando distro $DistroName desde $RootfsPath (puede tardar varios minutos)..."
        $importOutput = Get-WslText @('--import', $DistroName, $InstallDir, $RootfsPath, '--version', '2')
        if ($script:LastWslExitCode -ne 0) {
            throw "wsl --import fallo con codigo $($script:LastWslExitCode). Salida de wsl: $importOutput"
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
    $bootOutput = Get-WslText @('-d', $DistroName, '--', 'true')
    if ($script:LastWslExitCode -ne 0) {
        throw "La distro se importo pero no arranco correctamente (codigo $($script:LastWslExitCode)). Salida de wsl: $bootOutput"
    }

    Write-Log "Registrando tarea programada de arranque..."
    & (Join-Path $PSScriptRoot 'register-scheduled-task.ps1')

    Write-Log "Instalación de WSL2 completada."
    exit 0

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
