#!/usr/bin/env bash

# Corre DENTRO de la distro lics-wsl (como root, usuario por defecto de esta
# distro) para actualizar una instalación existente de LICS -- backend
# Django y frontend Next incluidos -- usando scripts/update.sh, que ya vive
# en /opt/lics y hace todo el trabajo real de forma segura (checksums,
# respaldo obligatorio antes de tocar nada, migraciones, healthcheck final,
# conserva una copia completa de la versión anterior).
#
# Invocado por infra/windows/electron/lib/backend.js (función
# updateApplication), a su vez disparado desde el menú "LICS > Actualizar
# aplicación" en main.js, con confirmación explícita del usuario antes de
# llamarlo -- no es automático.
#
# Por qué existe este script en vez de llamar update.sh directo: update.sh
# espera correr desde <release>/app/scripts/update.sh, con el paquete de
# release completo (VERSION, manifest.txt, SHA256SUMS, app/, images/) al
# lado. Ese paquete vive en la máquina Windows, no dentro de la distro.
# Este script encuentra el release más nuevo ya copiado a mano a
# C:\lics-dev\ (mismo lugar y mismo criterio -- carpeta con app/ e images/,
# la más nueva por fecha de modificación -- que usa wsl/cut-release.ps1
# para la imagen dorada), lo copia a un directorio nativo de WSL (no corre
# directo sobre /mnt/c: más lento cruzando la frontera drvfs y con semántica
# de permisos Unix distinta) y recién ahí invoca update.sh sin modificarlo.
#
# A propósito NO se ejecuta como parte de la instalación del .exe ni de la
# imagen dorada: install-wsl-distro.ps1 se salta la reimportación del .tar
# si la distro ya existe (para no perder datos), así que los cambios de
# Django/Next dentro de una instalación existente SOLO llegan por esta vía,
# corriendo dentro de la distro que ya está viva -- nunca por reinstalar
# el .exe.

set -Eeuo pipefail

WINDOWS_RELEASES_DIR="/mnt/c/lics-dev"
STAGING_ROOT="/opt/lics-updates"

log_info() {
    printf '[INFO] %s\n' "$*"
}

log_ok() {
    printf '[OK] %s\n' "$*"
}

log_warning() {
    printf '[ADVERTENCIA] %s\n' "$*" >&2
}

log_error() {
    printf '[ERROR] %s\n' "$*" >&2
}

die() {
    log_error "$*"
    exit 1
}

if [[ "$(id -u)" -ne 0 ]]; then
    die "Este script debe correr como root (usuario por defecto de lics-wsl)."
fi

if [[ ! -d "${WINDOWS_RELEASES_DIR}" ]]; then
    die "No se encontró ${WINDOWS_RELEASES_DIR} -- ¿existe C:\\lics-dev\\ en Windows y tiene algo adentro?"
fi

log_info "Buscando el release offline más reciente en ${WINDOWS_RELEASES_DIR}..."

newest_dir=""
newest_mtime=0
other_candidates=()

for candidate in "${WINDOWS_RELEASES_DIR}"/lics-*-linux-amd64/; do
    [[ -d "${candidate}" ]] || continue
    [[ -d "${candidate}app" ]] || continue
    [[ -d "${candidate}images" ]] || continue

    candidate="${candidate%/}"
    candidate_mtime="$(stat -c %Y "${candidate}" 2>/dev/null || echo 0)"

    if (( candidate_mtime > newest_mtime )); then
        if [[ -n "${newest_dir}" ]]; then
            other_candidates+=("$(basename "${newest_dir}")")
        fi
        newest_mtime="${candidate_mtime}"
        newest_dir="${candidate}"
    else
        other_candidates+=("$(basename "${candidate}")")
    fi
done

if [[ -z "${newest_dir}" ]]; then
    die "No se encontró ningún release válido bajo ${WINDOWS_RELEASES_DIR} (se espera una carpeta tipo lics-<versión>-linux-amd64 con app/ e images/ adentro). Copiá ahí el release generado con build-offline-release.sh antes de actualizar."
fi

release_name="$(basename "${newest_dir}")"
log_ok "Release detectado: ${release_name}"

if (( ${#other_candidates[@]} > 0 )); then
    log_warning "Había más de un release en ${WINDOWS_RELEASES_DIR}; se usó el más nuevo por fecha. No usados: ${other_candidates[*]}"
fi

staging_dir="${STAGING_ROOT}/${release_name}-$(date -u '+%Y%m%dT%H%M%SZ')"

log_info "Copiando el release a ${staging_dir} (puede tardar varios minutos: son varios GB de imágenes)..."

mkdir -p "${staging_dir}"
cp -a "${newest_dir}/." "${staging_dir}/"

chmod +x "${staging_dir}/app/scripts/"*.sh 2>/dev/null || true
[[ -f "${staging_dir}/app/scripts/lib/common.sh" ]] && chmod +x "${staging_dir}/app/scripts/lib/common.sh"

if [[ ! -x "${staging_dir}/app/scripts/update.sh" ]]; then
    die "No se encontró (o no quedó ejecutable) ${staging_dir}/app/scripts/update.sh tras la copia."
fi

log_ok "Copia lista."
log_info "Iniciando el actualizador oficial (app/scripts/update.sh)..."
printf '\n'

update_exit_code=0
"${staging_dir}/app/scripts/update.sh" || update_exit_code=$?

if (( update_exit_code == 0 )); then
    printf '\n'
    log_info "Limpiando copia temporal del release en ${staging_dir}..."
    rm -rf "${staging_dir}"
    log_ok "Actualización completada y copia temporal eliminada."
else
    printf '\n'
    log_error "La actualización falló (código ${update_exit_code})."
    log_error "Se conserva la copia del release en ${staging_dir} para diagnóstico -- no se borra sola."
    log_error "Revisar también si quedó /opt/lics.previous.<timestamp> (update.sh la crea antes de tocar /opt/lics)."
    exit "${update_exit_code}"
fi
