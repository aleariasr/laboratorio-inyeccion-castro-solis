#!/usr/bin/env bash

# Construye un paquete de instalación offline para Linux x86_64.
#
# Este script:
# - valida la versión;
# - comprueba las imágenes productivas locales;
# - comprueba que sean compatibles con linux/amd64;
# - exporta las imágenes con docker save;
# - copia únicamente archivos versionados por Git;
# - excluye secretos, backups y archivos de desarrollo no versionados;
# - crea manifiesto y checksums SHA-256;
# - publica el paquete solo si todo termina correctamente.
#
# Uso:
#
#   ./scripts/build-offline-release.sh
#
# Salida:
#
#   release/lics-<version>-linux-amd64/

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

readonly SCRIPT_DIR
readonly PROJECT_ROOT

RELEASE_ROOT="${LICS_RELEASE_ROOT:-${PROJECT_ROOT}/release}"
TARGET_PLATFORM="linux/amd64"

VERSION=""
RELEASE_NAME=""
TEMP_DIRECTORY=""
FINAL_DIRECTORY=""
APP_DIRECTORY=""
IMAGES_DIRECTORY=""
MANIFEST_FILE=""
CHECKSUM_FILE=""

cleanup_on_error() {
    local exit_code="$?"

    if [[ -n "${TEMP_DIRECTORY}" && -d "${TEMP_DIRECTORY}" ]]; then
        printf '[ADVERTENCIA] Eliminando paquete temporal incompleto.\n' >&2
        rm -rf "${TEMP_DIRECTORY}"
    fi

    printf '[ERROR] No fue posible construir el paquete offline.\n' >&2
    exit "${exit_code}"
}

trap cleanup_on_error ERR

log_info() {
    printf '[INFO] %s\n' "$*"
}

log_ok() {
    printf '[OK] %s\n' "$*"
}

die() {
    printf '[ERROR] %s\n' "$*" >&2
    return 1
}

require_command() {
    local command_name="$1"

    command -v "${command_name}" >/dev/null 2>&1 \
        || die "Falta el comando requerido: ${command_name}"
}

sha256_file() {
    local file_path="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file_path}" | awk '{print $1}'
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file_path}" | awk '{print $1}'
        return
    fi

    die "No se encontró sha256sum ni shasum."
}

load_version() {
    if [[ ! -s "${PROJECT_ROOT}/VERSION" ]]; then
        die "VERSION no existe o está vacío."
    fi

    VERSION="$(
        tr -d '[:space:]' < "${PROJECT_ROOT}/VERSION"
    )"

    if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+[-a-zA-Z0-9.]*$ ]]; then
        die "La versión no tiene un formato permitido: ${VERSION}"
    fi
}

required_images() {
    printf '%s\n' \
        "lics-backend:${VERSION}" \
        "lics-frontend:${VERSION}" \
        "nginx:1.28-alpine" \
        "postgres:17-alpine"
}

archive_name_for_image() {
    local image_name="$1"

    case "${image_name}" in
        lics-backend:*)
            printf 'lics-backend-%s-linux-amd64.tar\n' "${VERSION}"
            ;;
        lics-frontend:*)
            printf 'lics-frontend-%s-linux-amd64.tar\n' "${VERSION}"
            ;;
        nginx:1.28-alpine)
            printf 'nginx-1.28-alpine-linux-amd64.tar\n'
            ;;
        postgres:17-alpine)
            printf 'postgres-17-alpine-linux-amd64.tar\n'
            ;;
        *)
            die "No existe nombre de archivo definido para ${image_name}"
            ;;
    esac
}

validate_git_state() {
    if ! git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree \
        >/dev/null 2>&1
    then
        die "El proyecto no está dentro de un repositorio Git."
    fi

    if [[ -n "$(git -C "${PROJECT_ROOT}" status --porcelain)" ]]; then
        die \
            "El repositorio tiene cambios sin commit. Cree el release únicamente desde un estado limpio."
    fi

    log_ok "Repositorio Git limpio."
}

validate_docker() {
    require_command docker

    docker info >/dev/null 2>&1 \
        || die "Docker daemon no está disponible."

    log_ok "Docker daemon disponible."
}

validate_images() {
    local image_name
    local os
    local architecture

    while IFS= read -r image_name; do
        [[ -n "${image_name}" ]] || continue

        docker image inspect "${image_name}" >/dev/null 2>&1 \
            || die "Falta la imagen local: ${image_name}"

        os="$(
            docker image inspect \
                --format '{{.Os}}' \
                "${image_name}"
        )"

        architecture="$(
            docker image inspect \
                --format '{{.Architecture}}' \
                "${image_name}"
        )"

        if [[ "${os}/${architecture}" != "${TARGET_PLATFORM}" ]]; then
            die \
                "La imagen ${image_name} es ${os}/${architecture}; se requiere ${TARGET_PLATFORM}."
        fi

        log_ok "Imagen compatible: ${image_name} (${os}/${architecture})"
    done < <(required_images)
}

prepare_directories() {
    RELEASE_NAME="lics-${VERSION}-linux-amd64"
    TEMP_DIRECTORY="${RELEASE_ROOT}/.${RELEASE_NAME}.tmp"
    FINAL_DIRECTORY="${RELEASE_ROOT}/${RELEASE_NAME}"

    APP_DIRECTORY="${TEMP_DIRECTORY}/app"
    IMAGES_DIRECTORY="${TEMP_DIRECTORY}/images"
    MANIFEST_FILE="${TEMP_DIRECTORY}/manifest.txt"
    CHECKSUM_FILE="${TEMP_DIRECTORY}/SHA256SUMS"

    mkdir -p "${RELEASE_ROOT}"

    if [[ -e "${TEMP_DIRECTORY}" ]]; then
        rm -rf "${TEMP_DIRECTORY}"
    fi

    if [[ -e "${FINAL_DIRECTORY}" ]]; then
        die "Ya existe el release: ${FINAL_DIRECTORY}"
    fi

    mkdir -p \
        "${APP_DIRECTORY}" \
        "${IMAGES_DIRECTORY}"

    chmod 700 "${TEMP_DIRECTORY}"
}

copy_versioned_application() {
    log_info "Copiando archivos versionados del proyecto..."

    git -C "${PROJECT_ROOT}" archive \
        --format=tar \
        HEAD \
        | tar -xf - -C "${APP_DIRECTORY}"

    if [[ -e "${APP_DIRECTORY}/infra/docker/.env.prod" ]]; then
        die "El paquete contiene accidentalmente .env.prod."
    fi

    if [[ ! -f "${APP_DIRECTORY}/infra/docker/.env.prod.example" ]]; then
        die "Falta .env.prod.example en el paquete."
    fi

    log_ok "Aplicación versionada copiada."
}

export_images() {
    local image_name
    local archive_name
    local archive_path

    while IFS= read -r image_name; do
        [[ -n "${image_name}" ]] || continue

        archive_name="$(archive_name_for_image "${image_name}")"
        archive_path="${IMAGES_DIRECTORY}/${archive_name}"

        log_info "Exportando imagen: ${image_name}"

        docker save \
            --output "${archive_path}" \
            "${image_name}"

        if [[ ! -s "${archive_path}" ]]; then
            die "La imagen exportada quedó vacía: ${archive_path}"
        fi

        chmod 600 "${archive_path}"

        log_ok "Imagen exportada: ${archive_name}"
    done < <(required_images)
}

write_manifest() {
    local commit
    local created_at
    local image_name
    local archive_name

    commit="$(
        git -C "${PROJECT_ROOT}" rev-parse HEAD
    )"

    created_at="$(
        date -u '+%Y-%m-%dT%H:%M:%SZ'
    )"

    {
        printf 'release_name=%s\n' "${RELEASE_NAME}"
        printf 'application_version=%s\n' "${VERSION}"
        printf 'git_commit=%s\n' "${commit}"
        printf 'created_at_utc=%s\n' "${created_at}"
        printf 'target_platform=%s\n' "${TARGET_PLATFORM}"
        printf '\n'
        printf '[images]\n'

        while IFS= read -r image_name; do
            [[ -n "${image_name}" ]] || continue

            archive_name="$(archive_name_for_image "${image_name}")"

            printf '%s=%s\n' \
                "${image_name}" \
                "images/${archive_name}"
        done < <(required_images)
    } > "${MANIFEST_FILE}"

    cp "${PROJECT_ROOT}/VERSION" "${TEMP_DIRECTORY}/VERSION"

    chmod 600 \
        "${MANIFEST_FILE}" \
        "${TEMP_DIRECTORY}/VERSION"

    log_ok "Manifiesto creado."
}

write_checksums() {
    local file_path
    local relative_path
    local checksum

    : > "${CHECKSUM_FILE}"

    while IFS= read -r file_path; do
        [[ -n "${file_path}" ]] || continue

        relative_path="${file_path#"${TEMP_DIRECTORY}/"}"
        checksum="$(sha256_file "${file_path}")"

        printf '%s  %s\n' \
            "${checksum}" \
            "${relative_path}" \
            >> "${CHECKSUM_FILE}"
    done < <(
        find "${TEMP_DIRECTORY}" \
            -type f \
            ! -name 'SHA256SUMS' \
            -print \
            | sort
    )

    chmod 600 "${CHECKSUM_FILE}"

    log_ok "Checksums del paquete creados."
}

verify_checksums() {
    log_info "Verificando checksums generados..."

    if command -v sha256sum >/dev/null 2>&1; then
        (
            cd "${TEMP_DIRECTORY}"
            sha256sum --check SHA256SUMS
        )
    else
        (
            cd "${TEMP_DIRECTORY}"
            shasum -a 256 --check SHA256SUMS
        )
    fi

    log_ok "Todos los checksums fueron verificados."
}

publish_release() {
    mv "${TEMP_DIRECTORY}" "${FINAL_DIRECTORY}"
    TEMP_DIRECTORY=""

    chmod 700 "${FINAL_DIRECTORY}"

    log_ok "Release offline publicado."
}

main() {
    require_command git
    require_command tar
    require_command find
    require_command sort
    require_command awk
    require_command tr

    load_version

    printf 'Construcción de release offline\n'
    printf '===============================\n'
    printf 'Versión:    %s\n' "${VERSION}"
    printf 'Plataforma: %s\n' "${TARGET_PLATFORM}"
    printf '\n'

    validate_git_state
    validate_docker
    validate_images
    prepare_directories
    copy_versioned_application
    export_images
    write_manifest
    write_checksums
    verify_checksums
    publish_release

    printf '\n'
    printf 'Release completado\n'
    printf '==================\n'
    printf 'Ruta: %s\n' "${FINAL_DIRECTORY}"
    printf '\n'

    du -sh "${FINAL_DIRECTORY}"
    find "${FINAL_DIRECTORY}" \
        -maxdepth 2 \
        -type f \
        -exec ls -lh {} \;
}

main "$@"