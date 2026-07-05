#!/usr/bin/env bash

# Funciones y variables compartidas por los scripts operativos de producción.
#
# Este archivo debe ser importado con:
#
#   source "${SCRIPT_DIR}/lib/common.sh"
#
# No debe ejecutarse directamente.

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Rutas del proyecto
# -----------------------------------------------------------------------------

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${COMMON_DIR}/../.." && pwd)"

COMPOSE_FILE="${LICS_COMPOSE_FILE:-${PROJECT_ROOT}/infra/docker/compose.prod.yml}"
ENV_FILE="${LICS_ENV_FILE:-${PROJECT_ROOT}/infra/docker/.env.prod}"
BACKUP_ROOT="${LICS_BACKUP_DIR:-${PROJECT_ROOT}/backups}"

readonly COMMON_DIR
readonly PROJECT_ROOT
readonly COMPOSE_FILE
readonly ENV_FILE
readonly BACKUP_ROOT

# -----------------------------------------------------------------------------
# Salida
# -----------------------------------------------------------------------------

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

# -----------------------------------------------------------------------------
# Validaciones generales
# -----------------------------------------------------------------------------

require_command() {
    local command_name="$1"

    if ! command -v "${command_name}" >/dev/null 2>&1; then
        die "No se encontró el comando requerido: ${command_name}"
    fi
}

require_file() {
    local file_path="$1"

    if [[ ! -f "${file_path}" ]]; then
        die "No existe el archivo requerido: ${file_path}"
    fi

    if [[ ! -r "${file_path}" ]]; then
        die "No se puede leer el archivo requerido: ${file_path}"
    fi
}

env_value() {
    local key="$1"

    awk -v expected_key="${key}" '
        index($0, expected_key "=") == 1 {
            sub(/^[^=]*=/, "")
            print
            exit
        }
    ' "${ENV_FILE}"
}

require_env_key() {
    local key="$1"
    local value

    value="$(env_value "${key}")"

    if [[ -z "${value}" ]]; then
        die "La variable ${key} no está definida o está vacía en ${ENV_FILE}"
    fi
}

validate_environment_file() {
    require_file "${ENV_FILE}"

    if grep -q 'REEMPLAZAR_' "${ENV_FILE}"; then
        die "El archivo de entorno todavía contiene valores de ejemplo."
    fi

    require_env_key "LICS_VERSION"
    require_env_key "POSTGRES_DB"
    require_env_key "POSTGRES_USER"
    require_env_key "POSTGRES_PASSWORD"
    require_env_key "DJANGO_SECRET_KEY"
    require_env_key "HTTP_PORT"
}

validate_project_files() {
    require_file "${COMPOSE_FILE}"
    validate_environment_file
}

ensure_docker_available() {
    require_command docker

    if ! docker info >/dev/null 2>&1; then
        die "Docker no está disponible o el daemon no está iniciado."
    fi

    if ! docker compose version >/dev/null 2>&1; then
        die "Docker Compose no está disponible."
    fi
}

validate_compose_configuration() {
    if ! docker compose \
        --env-file "${ENV_FILE}" \
        -f "${COMPOSE_FILE}" \
        config --quiet
    then
        die "La configuración productiva de Docker Compose no es válida."
    fi
}

validate_runtime() {
    ensure_docker_available
    validate_project_files
    validate_compose_configuration
}

ensure_private_directory() {
    local directory_path="$1"

    mkdir -p "${directory_path}"
    chmod 700 "${directory_path}"

    if [[ ! -d "${directory_path}" ]]; then
        die "No fue posible crear el directorio: ${directory_path}"
    fi

    if [[ ! -w "${directory_path}" ]]; then
        die "No se puede escribir en el directorio: ${directory_path}"
    fi
}

sha256_file() {
    local file_path="$1"

    require_file "${file_path}"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${file_path}" | awk '{print $1}'
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${file_path}" | awk '{print $1}'
        return
    fi

    die "No se encontró sha256sum ni shasum para calcular checksums."
}

utc_timestamp() {
    date -u '+%Y%m%dT%H%M%SZ'
}

# -----------------------------------------------------------------------------
# Docker Compose
# -----------------------------------------------------------------------------

required_images() {
    docker compose \
        --env-file "${ENV_FILE}" \
        -f "${COMPOSE_FILE}" \
        config --images \
        | sort -u
}

validate_required_images() {
    local image
    local missing=0

    while IFS= read -r image; do
        [[ -n "${image}" ]] || continue

        if docker image inspect "${image}" >/dev/null 2>&1; then
            log_ok "Imagen local disponible: ${image}"
        else
            log_error "No existe localmente la imagen requerida: ${image}"
            missing=1
        fi
    done < <(required_images)

    if (( missing != 0 )); then
        die "Faltan imágenes locales. El arranque productivo no descargará ni construirá imágenes."
    fi
}

compose() {
    docker compose \
        --env-file "${ENV_FILE}" \
        -f "${COMPOSE_FILE}" \
        "$@"
}

service_container_id() {
    local service="$1"

    compose ps -q "${service}"
}

service_health_status() {
    local service="$1"
    local container_id

    container_id="$(service_container_id "${service}")"

    if [[ -z "${container_id}" ]]; then
        printf 'missing\n'
        return
    fi

    docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${container_id}"
}

wait_for_service() {
    local service="$1"
    local timeout_seconds="${2:-120}"
    local start_time
    local current_time
    local elapsed
    local status

    start_time="$(date +%s)"

    while true; do
        status="$(service_health_status "${service}")"

        case "${status}" in
            healthy|running)
                log_ok "Servicio saludable: ${service}"
                return 0
                ;;
            unhealthy|exited|dead)
                log_error "El servicio ${service} está en estado: ${status}"
                return 1
                ;;
        esac

        current_time="$(date +%s)"
        elapsed=$((current_time - start_time))

        if (( elapsed >= timeout_seconds )); then
            log_error \
                "El servicio ${service} no quedó saludable en ${timeout_seconds} segundos. Estado: ${status}"
            return 1
        fi

        sleep 2
    done
}

wait_for_all_services() {
    local timeout_seconds="${1:-120}"
    local service

    for service in postgres backend frontend nginx; do
        wait_for_service "${service}" "${timeout_seconds}" || return 1
    done
}

# -----------------------------------------------------------------------------
# Metadatos no sensibles
# -----------------------------------------------------------------------------

installed_version() {
    env_value "LICS_VERSION"
}

configured_http_port() {
    local port

    port="$(env_value "HTTP_PORT")"

    if [[ -z "${port}" ]]; then
        port="80"
    fi

    printf '%s\n' "${port}"
}

application_url() {
    printf 'http://127.0.0.1:%s\n' "$(configured_http_port)"
}