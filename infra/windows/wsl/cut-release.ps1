<#
.SYNOPSIS
    Un solo comando para llevar el release offline mas nuevo (ya copiado a
    esta maquina) hasta un instalador .exe nuevo publicado en GitHub
    Actions.

.DESCRIPTION
    Reemplaza la secuencia manual de:
      1. Encontrar a mano la carpeta de release mas nueva en
         C:\lics-dev\lics-<version>-linux-amd64
      2. Correr build-golden-image.ps1 con -ReleaseDir y -OutputPath
      3. Ir a GitHub > Actions > Run workflow a mano

    por un solo comando.

    Lo que este script NO puede eliminar: el release offline (carpeta
    app/ e images/, generada en el Mac con scripts/build-offline-release.sh)
    tiene que estar ya copiado a esta maquina Windows antes de correr esto.
    El Mac donde se compila y esta Windows son dos computadoras fisicas
    distintas, sin puente automatico entre ellas en este pipeline - esa
    parte sigue siendo manual (USB, red, lo que uses).

    Requiere GitHub CLI ("gh") instalado y autenticado para disparar el
    workflow solo. Si no esta instalado, hace igual la reconstruccion de
    la imagen dorada y al final te dice el paso manual que falta.

.PARAMETER ReleaseParentDir
    Carpeta donde buscar carpetas de release (lics-<version>-linux-amd64).
    Por defecto C:\lics-dev, se usa la mas nueva por fecha si hay varias.

.PARAMETER OutputPath
    Donde dejar el .tar de la imagen dorada.

.PARAMETER WorkflowFile
    Nombre del archivo de workflow a disparar.

.PARAMETER SkipActions
    Si se pasa, solo reconstruye la imagen dorada y no toca GitHub Actions.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File cut-release.ps1
#>

param(
    [string]$ReleaseParentDir = "C:\lics-dev",
    [string]$OutputPath = "C:\lics-build\lics-wsl-rootfs.tar",
    [string]$WorkflowFile = "build-windows-installer.yml",
    [switch]$SkipActions
)

$ErrorActionPreference = 'Stop'

function Write-Log {
    param([string]$Message)
    Write-Host "[LICS-RELEASE] $Message"
}

# 1. Encontrar el release mas nuevo ------------------------------------------

$candidates = Get-ChildItem -Path $ReleaseParentDir -Directory -Filter 'lics-*-linux-amd64' -ErrorAction SilentlyContinue |
    Where-Object {
        (Test-Path (Join-Path $_.FullName 'app')) -and (Test-Path (Join-Path $_.FullName 'images'))
    } |
    Sort-Object LastWriteTime -Descending

if (-not $candidates -or $candidates.Count -eq 0) {
    Write-Error "No encontre ninguna carpeta de release valida en $ReleaseParentDir (se espera algo tipo lics-<version>-linux-amd64 con app\ e images\ adentro). Corre scripts/build-offline-release.sh en el Mac y copia la carpeta resultante aca primero."
    exit 1
}

$releaseDir = $candidates[0].FullName
Write-Log "Usando release mas nuevo: $releaseDir"

if ($candidates.Count -gt 1) {
    $otros = ($candidates | Select-Object -Skip 1 | ForEach-Object { $_.Name }) -join ', '
    Write-Log "ADVERTENCIA: hay $($candidates.Count) carpetas de release en $ReleaseParentDir. Se uso la mas reciente por fecha. Las demas (no usadas): $otros"
}

# 2. Reconstruir la imagen dorada ---------------------------------------------

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildScript = Join-Path $scriptDir 'build-golden-image.ps1'

if (-not (Test-Path $buildScript)) {
    Write-Error "No encontre build-golden-image.ps1 junto a este script en $scriptDir."
    exit 1
}

Write-Log "Reconstruyendo la imagen dorada (esto tarda varios minutos)..."
& $buildScript -ReleaseDir $releaseDir -OutputPath $OutputPath

if ($LASTEXITCODE -ne 0) {
    Write-Error "build-golden-image.ps1 termino con codigo $LASTEXITCODE. No se dispara el workflow."
    exit 1
}

Write-Log "Imagen dorada lista: $OutputPath"

# 3. Disparar el workflow de GitHub Actions -----------------------------------

if ($SkipActions) {
    Write-Log "SkipActions activo, no se toca GitHub Actions. Corre 'Run workflow' a mano cuando quieras."
    exit 0
}

$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue

if (-not $ghAvailable) {
    Write-Log "No encontre 'gh' (GitHub CLI) instalado en esta maquina."
    Write-Log "Ultimo paso, a mano: GitHub > pestana Actions > $WorkflowFile > Run workflow (rama main)."
    exit 0
}

Write-Log "Disparando el workflow $WorkflowFile via GitHub CLI..."
gh workflow run $WorkflowFile --ref main

if ($LASTEXITCODE -ne 0) {
    Write-Error "gh workflow run fallo con codigo $LASTEXITCODE. Disparalo a mano desde GitHub > Actions."
    exit 1
}

Write-Log "Workflow disparado. Seguimos la corrida (esto puede tardar varios minutos)..."
Start-Sleep -Seconds 5
gh run watch --exit-status

if ($LASTEXITCODE -eq 0) {
    Write-Log "LISTO. El .exe nuevo esta en el artifact 'LICS-Setup' de esta corrida, en la pestana Actions de GitHub."
} else {
    Write-Error "El workflow termino con errores. Revisa el log completo en GitHub Actions."
    exit 1
}
