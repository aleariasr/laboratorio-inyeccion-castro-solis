<#
.SYNOPSIS
    Construye la imagen dorada de WSL2 para LICS de punta a punta, en un solo
    comando — incluyendo el reinicio de Windows si hace falta habilitar WSL2
    por primera vez.

.DESCRIPTION
    Lo ÚNICO que este script NO puede hacer por vos es activar la
    virtualización en BIOS/UEFI (Intel VT-x / AMD-V). Eso es un ajuste de
    firmware; ningún script de Windows puede tocarlo. Si no está activa, el
    script se detiene con un mensaje claro en vez de fallar a medias.

    Todo lo demás es automático y reanudable:
      1. Habilita las funciones de Windows para WSL2 (reinicia solo si hace
         falta, y se reanuda solo al volver a iniciar sesión, vía RunOnce).
      2. Descarga el rootfs oficial de Ubuntu para WSL directamente de
         Canonical e importa la distro con "wsl --import" — a propósito NO
         se usa "wsl --install", porque ese camino puede disparar un
         asistente interactivo de creación de usuario. "--import" nunca lo
         hace: es solo un sistema de archivos, sin asistente.
      3. Activa systemd dentro de la distro (reinicia solo la distro, no
         Windows — es liviano, unos segundos).
      4. Corre provision-golden-image.sh (Docker, la app, imágenes, .env.prod,
         migraciones, lics.service/lics-backup.timer, y valida start.sh y
         healthcheck.sh tal cual están, sin tocarlos).
      5. Exporta la imagen dorada lista para el instalador de Windows.

.PARAMETER ReleaseDir
    Carpeta del release offline ya compilado (contiene app/ e images/),
    generado con scripts/build-offline-release.sh.

.PARAMETER OutputPath
    Dónde dejar el .tar final (ej. C:\lics-build\lics-wsl-rootfs.tar).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File build-golden-image.ps1 `
        -ReleaseDir "C:\Users\ale\lics-1.0.2-beta-linux-amd64" `
        -OutputPath "C:\lics-build\lics-wsl-rootfs.tar"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseDir,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    # Uso interno: la marca este mismo script vía RunOnce para reanudarse
    # automáticamente después de un reinicio de Windows. No se pasa a mano.
    [switch]$Resume
)

$ErrorActionPreference = 'Stop'

$DistroName = 'lics-build'
$BuildDir = "$env:ProgramData\LICS\build-distro"
$StateDir = "$env:ProgramData\LICS\build"
$StateFile = Join-Path $StateDir 'state.json'
$RunOnceKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
$RootfsUrl = 'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-wsl.rootfs.tar.gz'

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-BUILD] $Message"
}

function Save-State {
    New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    @{ releaseDir = $ReleaseDir; outputPath = $OutputPath } | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
}

function Restore-StateIfResuming {
    if ($Resume -and (Test-Path $StateFile)) {
        $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
        $script:ReleaseDir = $saved.releaseDir
        $script:OutputPath = $saved.outputPath
        Write-Log "Reanudando después del reinicio (release: $ReleaseDir)"
    }
}

function Register-ResumeAfterReboot {
    $scriptPath = $MyInvocation.MyCommand.Path
    if (-not $scriptPath) { $scriptPath = $PSCommandPath }

    $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ReleaseDir `"$ReleaseDir`" -OutputPath `"$OutputPath`" -Resume"
    New-Item -Path $RunOnceKey -Force | Out-Null
    New-ItemProperty -Path $RunOnceKey -Name 'LICSBuildResume' -Value $command -PropertyType String -Force | Out-Null
    Write-Log "Reanudación automática registrada para después del reinicio."
}

function Test-VirtualizationEnabled {
    # Win32_Processor.VirtualizationFirmwareEnabled es conocido por dar falsos
    # negativos en hardware real (WMI mal poblado por el fabricante, o no se
    # actualiza sin un reinicio completo desde frio tras el cambio en BIOS).
    # Por eso NO se usa como bloqueo duro: se combina con una segunda fuente
    # (systeminfo, que usa una ruta distinta por debajo) y, si ninguna de las
    # dos confirma que esta activa, se deja pasar con una advertencia en vez
    # de frenar el script. La prueba real y confiable es mas abajo: si de
    # verdad no hay virtualizacion, "wsl -d $DistroName -- true" en
    # Step-InstallDistro va a fallar con un error explicito de WSL.
    $signals = @()

    try {
        $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop
        $signals += [bool]$cpu.VirtualizationFirmwareEnabled
    } catch {
        # sin señal de este lado
    }

    try {
        $info = systeminfo 2>$null | Select-String 'Virtualization Enabled In Firmware'
        if ($info) {
            $signals += ($info -match ':\s*Yes')
        }
    } catch {
        # sin señal de este lado
    }

    if ($signals.Count -eq 0) {
        # Ninguna de las dos fuentes pudo responder: no bloquear por algo que
        # no se pudo medir.
        return $true
    }

    return ($signals -contains $true)
}

function Step-EnableFeatures {
    if (-not (Test-VirtualizationEnabled)) {
        Write-Log "AVISO: Windows reporta la virtualizacion como desactivada (Win32_Processor / systeminfo), pero esa señal es poco confiable en varios equipos reales."
        Write-Log "Como ya confirmaste que esta activa en BIOS/UEFI, se continua igual. Si de verdad no estuviera activa, va a fallar mas adelante con un error explicito de WSL (no a medias)."
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
        Write-Log "Windows necesita reiniciar para terminar de activar WSL2."
        Write-Log "Se va a reiniciar en 15 segundos y va a CONTINUAR SOLO al volver a iniciar sesión con este mismo usuario."
        Save-State
        Register-ResumeAfterReboot
        Start-Sleep -Seconds 15
        Restart-Computer -Force
        exit 0
    }

    Write-Log "WSL2 y VirtualMachinePlatform ya estaban habilitados, no hace falta reiniciar."
}

function Test-GzipFileValid {
    # El .tar.gz pesa varios cientos de MB; si la conexión se corta a mitad
    # de la descarga (como pasó acá: "se ha forzado la interrupción de una
    # conexión existente por el host remoto"), Invoke-WebRequest puede dejar
    # un archivo parcial en disco SIN lanzar error. Esto lo detecta leyendo
    # el gzip completo hasta el final; si está truncado, falla acá y no en
    # medio de "wsl --import" con un error críptico de bsdtar.
    param([string]$Path)
    try {
        $fs = [System.IO.File]::OpenRead($Path)
        try {
            $gz = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Decompress)
            $buffer = New-Object byte[] 1MB
            while ($true) {
                $read = $gz.Read($buffer, 0, $buffer.Length)
                if ($read -le 0) { break }
            }
            $gz.Dispose()
            return $true
        } finally {
            $fs.Dispose()
        }
    } catch {
        return $false
    }
}

function Get-ValidRootfsFile {
    param([string]$Path)

    if ((Test-Path $Path) -and -not (Test-GzipFileValid -Path $Path)) {
        Write-Log "El rootfs descargado antes está incompleto o dañado (se cortó la descarga), se borra y se descarga de nuevo."
        Remove-Item -Path $Path -Force
    }

    if (Test-Path $Path) {
        Write-Log "El rootfs base ya estaba descargado y es válido, se reutiliza."
        return
    }

    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            Write-Log "Descargando rootfs oficial de Ubuntu 24.04 para WSL (Canonical, sin asistente interactivo) — intento $attempt de $maxAttempts..."
            Invoke-WebRequest -Uri $RootfsUrl -OutFile $Path
            if (Test-GzipFileValid -Path $Path) {
                return
            }
            throw "El archivo descargado no es un gzip válido (descarga incompleta)."
        } catch {
            Write-Log "Intento $attempt falló: $($_.Exception.Message)"
            Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
            if ($attempt -eq $maxAttempts) {
                throw "No se pudo descargar un rootfs válido tras $maxAttempts intentos. Puede ser la conexión de esta red; volvé a correr el script."
            }
            Start-Sleep -Seconds 5
        }
    }
}

function Step-InstallDistro {
    $existing = (wsl -l -q) 2>$null
    if ($existing -contains $DistroName) {
        Write-Log "La distro $DistroName ya existe, se omite instalación."
        return
    }

    wsl --set-default-version 2 | Out-Null

    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    $rootfsPath = Join-Path $BuildDir 'ubuntu-base.tar.gz'

    Get-ValidRootfsFile -Path $rootfsPath

    Write-Log "Importando como distro '$DistroName' (wsl --import nunca dispara asistentes)..."
    wsl --import $DistroName $BuildDir $rootfsPath --version 2
    if ($LASTEXITCODE -ne 0) { throw "wsl --import fallo con codigo $LASTEXITCODE" }

    wsl -d $DistroName -- true
    if ($LASTEXITCODE -ne 0) {
        throw "La distro $DistroName no arrancó tras importarla (código $LASTEXITCODE). Esta es la prueba real de si WSL2 puede correr: si el error de arriba menciona virtualización, Hyper-V o 'Virtual Machine Platform', entonces sí es la BIOS/UEFI, revisala de nuevo. Si el error es otro, no es un problema de virtualización."
    }

    Write-Log "Distro base importada sin ninguna intervención manual."
}

function Step-EnableSystemdAndRootUser {
    $currentConf = (wsl -d $DistroName -- cat /etc/wsl.conf) 2>$null

    if ($currentConf -match 'systemd\s*=\s*true') {
        Write-Log "systemd ya está activo dentro de la distro."
        return
    }

    Write-Log "Activando systemd y usuario por defecto root dentro de la distro..."
    $wslConf = "[boot]`nsystemd=true`n`n[user]`ndefault=root`n"
    $wslConf | wsl -d $DistroName -- tee /etc/wsl.conf | Out-Null

    Write-Log "Reiniciando la distro (solo la distro, no Windows) para aplicar systemd..."
    wsl --terminate $DistroName
    Start-Sleep -Seconds 3

    $status = (wsl -d $DistroName -- systemctl is-system-running) 2>$null
    Write-Log "Estado de systemd tras reiniciar la distro: $status"

    if ($status -notmatch 'running|degraded') {
        throw "systemd no arrancó correctamente dentro de la distro (estado: $status)."
    }
}

function Convert-WindowsPathToWsl {
    param([string]$WindowsPath)

    $resolved = (Resolve-Path $WindowsPath).Path
    $drive = $resolved.Substring(0, 1).ToLower()
    $rest = $resolved.Substring(2).Replace('\', '/')
    return "/mnt/$drive$rest"
}

function Step-Provision {
    $wslReleasePath = Convert-WindowsPathToWsl -WindowsPath $ReleaseDir

    $scriptDir = Split-Path -Parent (Resolve-Path $PSCommandPath).Path
    $provisionScriptWin = Join-Path $scriptDir 'provision-golden-image.sh'
    $wslScriptPath = Convert-WindowsPathToWsl -WindowsPath $provisionScriptWin

    Write-Log "Ejecutando provision-golden-image.sh como root dentro de la distro (esto tarda varios minutos)..."
    wsl -d $DistroName -- bash "$wslScriptPath" "$wslReleasePath"
    if ($LASTEXITCODE -ne 0) { throw "provision-golden-image.sh terminó con errores (código $LASTEXITCODE). Revisá el log de arriba." }
}

function Step-Export {
    Write-Log "Apagando la distro para exportar un estado limpio..."
    wsl --shutdown
    Start-Sleep -Seconds 3

    $outDir = Split-Path -Parent $OutputPath
    if ($outDir -and -not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }

    Write-Log "Exportando a $OutputPath (puede tardar varios minutos, el archivo pesa varios GB)..."
    wsl --export $DistroName $OutputPath
    if ($LASTEXITCODE -ne 0) { throw "wsl --export fallo con codigo $LASTEXITCODE" }

    Write-Log "Imagen dorada lista: $OutputPath"
}

try {
    Restore-StateIfResuming

    Write-Log "Release: $ReleaseDir"
    Write-Log "Salida:  $OutputPath"

    Step-EnableFeatures
    Step-InstallDistro
    Step-EnableSystemdAndRootUser
    Step-Provision
    Step-Export

    Remove-Item -Path $StateFile -ErrorAction SilentlyContinue

    Write-Log "LISTO. Copiá '$OutputPath' a infra\windows\electron\resources\windows\lics-wsl-rootfs.tar y corré 'npm run dist' dentro de electron\."

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
