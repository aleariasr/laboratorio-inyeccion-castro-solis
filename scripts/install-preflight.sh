#!/usr/bin/env bash

# Evalúa si una computadora Linux está preparada para instalar LICS.
#
# Este script no instala, copia ni modifica nada.
#
# Comprueba:
# - sistema operativo Linux;
# - arquitectura x86_64/amd64;
# - disponibilidad de systemd;
# - memoria RAM;
# - espacio libre;
# - Docker Engine;
# - Docker Compose v2;
# - acceso al daemon de Docker;
# - herramientas requeridas;
# - archivos productivos del paquete;
# - imágenes locales o archivos .tar para instalación offline.
#
# Uso:
#
#   ./scripts/install-preflight.sh
#
# Variables opcionales:
#
#   LICS_MIN_RAM_MB=4096
#   LICS_MIN_DISK_MB=20480
#   LICS_RELEASE_IMAGES_DIR=/ruta/a/images

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

readonly SCRIPT_DIR
readonly PROJECT_ROOT

MIN_RAM_MB="${LICS_MIN_RAM_MB:-4096}"
MIN_DISK_MB="${LICS_MIN_DISK_MB:-20480}"
RELEASE_IMAGES_DIR="${LICS_RELEASE_IMAGES_DIR:-${PROJECT_ROOT}/release/images}"
DISK_CHECK_PATH="${LICS_DISK_CHECK_PATH:-${PROJECT_ROOT}}"

readonly MIN_RAM_MB
readonly MIN_DISK_MB
readonly RELEASE_IMAGES_DIR
readonly DISK_CHECK_PATH

FAILURES=0
WARNINGS=0

ok() {
    printf '[OK] %s\n' "$*"
}

warning() {
    printf '[ADVERTENCIA] %s\n' "$*" >&2
    WARNINGS=$((WARNINGS + 1))
}

failed() {
    printf '[FALLO] %s\n' "$*" >&2
    FAILURES=$((FAILURES + 1))
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

check_linux() {
    local kernel

    kernel="$(uname -s 2>/dev/null || true)"

    if [[ "${kernel}" == "Linux" ]]; then
        ok "Sistema operativo Linux detectado."
    else
        failed \
            "La instalación productiva requiere Linux. Sistema detectado: ${kernel:-desconocido}"
    fi
}

check_architecture() {
    local architecture

    architecture="$(uname -m 2>/dev/null || true)"

    case "${architecture}" in
        x86_64|amd64)
            ok "Arquitectura compatible: ${architecture}"
            ;;
        *)
            failed \
                "Arquitectura no compatible para esta entrega: ${architecture:-desconocida}. Se requiere x86_64."
            ;;
    esac
}

check_systemd() {
    if [[ -d /run/systemd/system ]] \
        && command_exists systemctl
    then
        ok "systemd está disponible."
    else
        failed \
            "No se detectó systemd. Es necesario para el arranque automático."
    fi
}

check_memory() {
    local total_kb
    local total_mb

    if [[ ! -r /proc/meminfo ]]; then
        failed "No fue posible consultar /proc/meminfo."
        return
    fi

    total_kb="$(
        awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo
    )"

    if [[ ! "${total_kb}" =~ ^[0-9]+$ ]]; then
        failed "No fue posible determinar la memoria RAM."
        return
    fi

    total_mb=$((total_kb / 1024))

    if (( total_mb >= MIN_RAM_MB )); then
        ok "Memoria RAM disponible: ${total_mb} MB"
    else
        failed \
            "Memoria insuficiente: ${total_mb} MB. Mínimo configurado: ${MIN_RAM_MB} MB."
    fi
}

check_disk_space() {
    local available_kb
    local available_mb

    available_kb="$(
        df -Pk "${DISK_CHECK_PATH}" \
            | awk 'NR == 2 {print $4}'
    )"

    if [[ ! "${available_kb}" =~ ^[0-9]+$ ]]; then
        failed "No fue posible determinar el espacio libre."
        return
    fi

    available_mb=$((available_kb / 1024))

    if (( available_mb >= MIN_DISK_MB )); then
        ok "Espacio libre disponible: ${available_mb} MB"
    else
        failed \
            "Espacio insuficiente: ${available_mb} MB. Mínimo configurado: ${MIN_DISK_MB} MB."
    fi
}

check_required_commands() {
    local command_name

    for command_name in \
        awk \
        grep \
        sed \
        find \
        sort \
        tail \
        date \
        chmod \
        chown \
        cp \
        mkdir \
        sha256sum \
        openssl
    do
        if command_exists "${command_name}"; then
            ok "Comando disponible: ${command_name}"
        else
            failed "Falta el comando requerido: ${command_name}"
        fi
    done
}

check_docker_cli() {
    if command_exists docker; then
        ok "Docker CLI está instalado."
    else
        failed "Docker CLI no está instalado."
        return
    fi

    if docker version \
        --format '{{.Client.Version}}' \
        >/dev/null 2>&1
    then
        local client_version

        client_version="$(
            docker version \
                --format '{{.Client.Version}}' \
                2>/dev/null
        )"

        ok "Docker Client: ${client_version}"
    else
        failed "No fue posible consultar Docker Client."
    fi
}

check_docker_daemon() {
    if ! command_exists docker; then
        return
    fi

    if docker info >/dev/null 2>&1; then
        local server_version

        server_version="$(
            docker version \
                --format '{{.Server.Version}}' \
                2>/dev/null
        )"

        ok "Docker daemon accesible: ${server_version}"
    else
        failed \
            "Docker está instalado, pero el usuario actual no puede acceder al daemon."
    fi
}

check_docker_compose() {
    if ! command_exists docker; then
        return
    fi

    if docker compose version >/dev/null 2>&1; then
        local compose_version

        compose_version="$(
            docker compose version \
                --short \
                2>/dev/null
        )"

        ok "Docker Compose v2 disponible: ${compose_version}"
    else
        failed "Docker Compose v2 no está disponible."
    fi
}

check_project_files() {
    local relative_path
    local required_files=(
        "VERSION"
        "infra/docker/compose.prod.yml"
        "infra/docker/.env.prod.example"
        "infra/nginx/default.prod.conf"
        "scripts/start.sh"
        "scripts/stop.sh"
        "scripts/restart.sh"
        "scripts/status.sh"
        "scripts/healthcheck.sh"
        "scripts/backup.sh"
        "scripts/verify-backup.sh"
        "scripts/test-restore.sh"
        "scripts/restore.sh"
        "scripts/lib/common.sh"
    )

    for relative_path in "${required_files[@]}"; do
        if [[ -f "${PROJECT_ROOT}/${relative_path}" ]]; then
            ok "Archivo productivo presente: ${relative_path}"
        else
            failed "Falta archivo productivo: ${relative_path}"
        fi
    done
}

check_version() {
    local version

    if [[ ! -s "${PROJECT_ROOT}/VERSION" ]]; then
        failed "El archivo VERSION no existe o está vacío."
        return
    fi

    version="$(
        tr -d '[:space:]' < "${PROJECT_ROOT}/VERSION"
    )"

    if [[ -n "${version}" ]]; then
        ok "Versión del paquete: ${version}"
    else
        failed "No fue posible leer la versión del paquete."
    fi
}

required_image_names() {
    local version

    version="$(
        tr -d '[:space:]' < "${PROJECT_ROOT}/VERSION"
    )"

    printf '%s\n' \
        "lics-backend:${version}" \
        "lics-frontend:${version}" \
        "nginx:1.28-alpine" \
        "postgres:17-alpine"
}

image_archive_exists() {
    local image_name="$1"
    local archive

    if [[ ! -d "${RELEASE_IMAGES_DIR}" ]]; then
        return 1
    fi

    while IFS= read -r archive; do
        [[ -n "${archive}" ]] || continue
        return 0
    done < <(
        find "${RELEASE_IMAGES_DIR}" \
            -maxdepth 1 \
            -type f \
            \( -name '*.tar' -o -name '*.tar.gz' \) \
            -print
    )

    return 1
}

check_images() {
    local image_name
    local missing_images=0

    if ! command_exists docker; then
        failed "No se pueden comprobar imágenes porque Docker no está disponible."
        return
    fi

    while IFS= read -r image_name; do
        [[ -n "${image_name}" ]] || continue

        if docker image inspect "${image_name}" >/dev/null 2>&1; then
            ok "Imagen local disponible: ${image_name}"
        else
            warning "Imagen local ausente: ${image_name}"
            missing_images=$((missing_images + 1))
        fi
    done < <(required_image_names)

    if (( missing_images == 0 )); then
        ok "Todas las imágenes productivas están cargadas localmente."
        return
    fi

    if image_archive_exists "unused"; then
        warning \
            "Faltan ${missing_images} imágenes locales, pero existen archivos de imágenes en ${RELEASE_IMAGES_DIR}."
        warning \
            "El instalador podrá cargarlas durante la instalación offline."
    else
        failed \
            "Faltan ${missing_images} imágenes y no se encontraron archivos .tar en ${RELEASE_IMAGES_DIR}."
    fi
}

check_existing_installation() {
    if [[ -e /opt/lics ]]; then
        warning "Ya existe /opt/lics. Puede haber una instalación previa."
    else
        ok "No se detectó una instalación previa en /opt/lics."
    fi

    if [[ -e /etc/systemd/system/lics.service ]]; then
        warning "Ya existe el servicio systemd lics.service."
    else
        ok "No se detectó un servicio lics.service previo."
    fi
}

print_summary() {
    printf '\n'
    printf 'Resumen de preinstalación\n'
    printf '=========================\n'
    printf 'Fallos:       %s\n' "${FAILURES}"
    printf 'Advertencias: %s\n' "${WARNINGS}"
    printf '\n'

    if (( FAILURES > 0 )); then
        printf '[FALLO] La computadora no está lista para instalar LICS.\n' >&2
        return 1
    fi

    if (( WARNINGS > 0 )); then
        printf '[OK] La computadora cumple los requisitos obligatorios.\n'
        printf '[ADVERTENCIA] Revise las advertencias antes de instalar.\n'
        return 0
    fi

    printf '[OK] La computadora está lista para instalar LICS.\n'
}

main() {
    printf 'Preinstalación de LICS\n'
    printf '======================\n'
    printf 'Proyecto: %s\n' "${PROJECT_ROOT}"
    printf 'Imágenes: %s\n' "${RELEASE_IMAGES_DIR}"
    printf 'Disco:    %s\n' "${DISK_CHECK_PATH}"
    printf '\n'

    check_linux
    check_architecture
    check_systemd
    check_memory
    check_disk_space
    check_required_commands
    check_docker_cli
    check_docker_daemon
    check_docker_compose
    check_project_files
    check_version
    check_images
    check_existing_installation

    print_summary
}

main "$@"