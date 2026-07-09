#!/usr/bin/env bash

# Actualiza una instalación existente de LICS desde un paquete offline.
#
# Este script debe ejecutarse desde:
#
#   <release>/app/scripts/update.sh
#
# Uso:
#
#   sudo ./app/scripts/update.sh
#
# Realiza:
# - verificación integral de checksums del paquete;
# - validación de versión nueva;
# - validación de instalación existente;
# - respaldo obligatorio pre-update;
# - carga de imágenes offline;
# - preparación de nueva aplicación en directorio temporal;
# - preservación de .env.prod existente;
# - actualización de LICS_VERSION;
# - detención controlada de servicios;
# - reemplazo controlado de /opt/lics;
# - ejecución de migraciones;
# - arranque del sistema;
# - healthcheck final.
#
# Este script no implementa rollback automático.
# Antes de reemplazar /opt/lics, conserva una copia en /opt/lics.previous.<timestamp>.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_ROOT="$(cd "${SOURCE_APP_DIR}/.." && pwd)"
SOURCE_IMAGES_DIR="${PACKAGE_ROOT}/images"

INSTALL_ROOT="${LICS_INSTALL_ROOT:-/opt/lics}"
TEMP_INSTALL_ROOT="${INSTALL_ROOT}.updating.$$"
PREVIOUS_INSTALL_ROOT=""

CURRENT_ENV_FILE="${INSTALL_ROOT}/infra/docker/.env.prod"
TEMP_ENV_FILE="${TEMP_INSTALL_ROOT}/infra/docker/.env.prod"

VERSION=""
CURRENT_VERSION=""

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
    return 1
}

cleanup_on_error() {
    local exit_code="$?"

    printf '\n' >&2
    log_error "La actualización no terminó correctamente."

    if [[ -d "${TEMP_INSTALL_ROOT}" ]]; then
        log_warning "Eliminando instalación temporal incompleta."
        rm -rf "${TEMP_INSTALL_ROOT}"
    fi

    log_error "Revise el estado manualmente antes de continuar."
    log_error "Si /opt/lics fue reemplazado, revise la copia anterior:"
    log_error "  ${PREVIOUS_INSTALL_ROOT:-no creada}"

    exit "${exit_code}"
}

trap cleanup_on_error ERR

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        die "Debe ejecutar este actualizador con sudo."
    fi
}

require_command() {
    local command_name="$1"

    command -v "${command_name}" >/dev/null 2>&1 \
        || die "Falta el comando requerido: ${command_name}"
}

env_value_from_file() {
    local file_path="$1"
    local key="$2"

    awk -v expected_key="${key}" '
        index($0, expected_key "=") == 1 {
            sub(/^[^=]*=/, "")
            print
            exit
        }
    ' "${file_path}"
}

set_env_value() {
    local file_path="$1"
    local key="$2"
    local value="$3"
    local temporary_file

    temporary_file="${file_path}.tmp"

    awk \
        -v target_key="${key}" \
        -v target_value="${value}" '
        BEGIN {
            replaced = 0
        }

        index($0, target_key "=") == 1 {
            print target_key "=" target_value
            replaced = 1
            next
        }

        {
            print
        }

        END {
            if (replaced == 0) {
                print target_key "=" target_value
            }
        }
    ' "${file_path}" > "${temporary_file}"

    mv "${temporary_file}" "${file_path}"
}

validate_package_structure() {
    local required_path
    local required_paths=(
        "${PACKAGE_ROOT}/VERSION"
        "${PACKAGE_ROOT}/manifest.txt"
        "${PACKAGE_ROOT}/SHA256SUMS"
        "${PACKAGE_ROOT}/images"
        "${SOURCE_APP_DIR}/VERSION"
        "${SOURCE_APP_DIR}/infra/docker/compose.prod.yml"
        "${SOURCE_APP_DIR}/scripts/start.sh"
        "${SOURCE_APP_DIR}/scripts/stop.sh"
        "${SOURCE_APP_DIR}/scripts/backup.sh"
        "${SOURCE_APP_DIR}/scripts/healthcheck.sh"
    )

    for required_path in "${required_paths[@]}"; do
        if [[ ! -e "${required_path}" ]]; then
            die "Falta un componente del paquete: ${required_path}"
        fi
    done
}

verify_package_checksums() {
    log_info "Verificando integridad completa del paquete..."

    (
        cd "${PACKAGE_ROOT}"
        sha256sum --check SHA256SUMS
    )

    log_ok "Todos los checksums del paquete son correctos."
}

load_versions() {
    VERSION="$(tr -d '[:space:]' < "${PACKAGE_ROOT}/VERSION")"

    if [[ -z "${VERSION}" ]]; then
        die "No fue posible leer la versión del paquete."
    fi

    if [[ "$(tr -d '[:space:]' < "${SOURCE_APP_DIR}/VERSION")" != "${VERSION}" ]]; then
        die "La versión del paquete no coincide con app/VERSION."
    fi

    CURRENT_VERSION="$(env_value_from_file "${CURRENT_ENV_FILE}" LICS_VERSION)"

    if [[ -z "${CURRENT_VERSION}" ]]; then
        die "No fue posible leer LICS_VERSION de la instalación actual."
    fi

    if [[ "${VERSION}" == "${CURRENT_VERSION}" ]]; then
        die "La versión del paquete (${VERSION}) ya está instalada."
    fi

    log_ok "Versión actual: ${CURRENT_VERSION}"
    log_ok "Versión nueva:  ${VERSION}"
}

validate_existing_installation() {
    if [[ ! -d "${INSTALL_ROOT}" ]]; then
        die "No existe la instalación actual: ${INSTALL_ROOT}"
    fi

    if [[ ! -f "${CURRENT_ENV_FILE}" ]]; then
        die "No existe el archivo productivo actual: ${CURRENT_ENV_FILE}"
    fi

    if [[ ! -x "${INSTALL_ROOT}/scripts/backup.sh" ]]; then
        die "No existe o no es ejecutable: ${INSTALL_ROOT}/scripts/backup.sh"
    fi

    if [[ ! -x "${INSTALL_ROOT}/scripts/stop.sh" ]]; then
        die "No existe o no es ejecutable: ${INSTALL_ROOT}/scripts/stop.sh"
    fi

    if [[ ! -x "${INSTALL_ROOT}/scripts/start.sh" ]]; then
        die "No existe o no es ejecutable: ${INSTALL_ROOT}/scripts/start.sh"
    fi

    if [[ ! -x "${INSTALL_ROOT}/scripts/healthcheck.sh" ]]; then
        die "No existe o no es ejecutable: ${INSTALL_ROOT}/scripts/healthcheck.sh"
    fi

    if [[ -e "${TEMP_INSTALL_ROOT}" ]]; then
        die "Ya existe el directorio temporal: ${TEMP_INSTALL_ROOT}"
    fi
}

run_current_healthcheck() {
    log_info "Validando salud de la instalación actual..."

    "${INSTALL_ROOT}/scripts/healthcheck.sh"

    log_ok "La instalación actual está saludable."
}

create_pre_update_backup() {
    log_info "Creando respaldo obligatorio pre-update..."

    "${INSTALL_ROOT}/scripts/backup.sh" pre-update

    log_ok "Respaldo pre-update completado."
}

image_archives() {
    find "${SOURCE_IMAGES_DIR}" \
        -maxdepth 1 \
        -type f \
        -name '*.tar' \
        -print \
        | sort
}

load_images() {
    local archive
    local archive_count=0

    log_info "Cargando imágenes productivas desde el paquete offline..."

    while IFS= read -r archive; do
        [[ -n "${archive}" ]] || continue

        archive_count=$((archive_count + 1))

        log_info "Cargando: $(basename "${archive}")"

        docker image load \
            --input "${archive}"

        log_ok "Imagen cargada: $(basename "${archive}")"
    done < <(image_archives)

    if (( archive_count != 4 )); then
        die "Se esperaban exactamente 4 imágenes, pero se encontraron ${archive_count}."
    fi
}

required_images() {
    printf '%s\n' \
        "lics-backend:${VERSION}" \
        "lics-frontend:${VERSION}" \
        "nginx:1.28-alpine" \
        "postgres:17-alpine"
}

validate_loaded_images() {
    local image_name
    local platform

    while IFS= read -r image_name; do
        [[ -n "${image_name}" ]] || continue

        docker image inspect "${image_name}" >/dev/null 2>&1 \
            || die "No se cargó la imagen requerida: ${image_name}"

        platform="$(
            docker image inspect \
                --format '{{.Os}}/{{.Architecture}}' \
                "${image_name}"
        )"

        if [[ "${platform}" != "linux/amd64" ]]; then
            die "La imagen ${image_name} no es linux/amd64: ${platform}"
        fi

        log_ok "Imagen productiva validada: ${image_name}"
    done < <(required_images)
}

prepare_new_application() {
    log_info "Preparando nueva versión en directorio temporal..."

    mkdir -p "${TEMP_INSTALL_ROOT}"

    cp -a "${SOURCE_APP_DIR}/." "${TEMP_INSTALL_ROOT}/"

    cp "${CURRENT_ENV_FILE}" "${TEMP_ENV_FILE}"

    set_env_value "${TEMP_ENV_FILE}" "LICS_VERSION" "${VERSION}"

    chmod 750 "${TEMP_INSTALL_ROOT}"
    chmod 750 "${TEMP_INSTALL_ROOT}/scripts/"*.sh
    chmod 750 "${TEMP_INSTALL_ROOT}/scripts/lib/common.sh"
    chmod 600 "${TEMP_ENV_FILE}"

    if grep -q 'REEMPLAZAR_' "${TEMP_ENV_FILE}"; then
        die "El archivo .env.prod resultante contiene valores de ejemplo."
    fi

    log_ok "Nueva versión preparada."
}

stop_current_application() {
    log_info "Deteniendo instalación actual..."

    "${INSTALL_ROOT}/scripts/stop.sh"

    log_ok "Instalación actual detenida."
}

publish_new_application() {
    local timestamp

    timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    PREVIOUS_INSTALL_ROOT="${INSTALL_ROOT}.previous.${timestamp}"

    if [[ -e "${PREVIOUS_INSTALL_ROOT}" ]]; then
        die "Ya existe la ruta de versión anterior: ${PREVIOUS_INSTALL_ROOT}"
    fi

    log_info "Conservando instalación anterior en ${PREVIOUS_INSTALL_ROOT}..."

    mv "${INSTALL_ROOT}" "${PREVIOUS_INSTALL_ROOT}"

    log_info "Publicando nueva versión en ${INSTALL_ROOT}..."

    mv "${TEMP_INSTALL_ROOT}" "${INSTALL_ROOT}"

    if [[ -d "${PREVIOUS_INSTALL_ROOT}/backups" ]]; then
        log_info "Preservando historial de respaldos..."

        rm -rf "${INSTALL_ROOT}/backups"
        mv "${PREVIOUS_INSTALL_ROOT}/backups" "${INSTALL_ROOT}/backups"
        chmod 700 "${INSTALL_ROOT}/backups"

        log_ok "Historial de respaldos preservado."
    fi

    chmod 750 "${INSTALL_ROOT}"
    chmod 600 "${INSTALL_ROOT}/infra/docker/.env.prod"

    log_ok "Nueva versión publicada."
}

compose_new() {
    docker compose \
        --env-file "${INSTALL_ROOT}/infra/docker/.env.prod" \
        --file "${INSTALL_ROOT}/infra/docker/compose.prod.yml" \
        "$@"
}

wait_for_new_postgres() {
    local timeout_seconds=120
    local start_time
    local current_time
    local elapsed
    local container_id
    local health_status

    start_time="$(date +%s)"

    while true; do
        container_id="$(
            compose_new ps \
                --quiet \
                postgres
        )"

        if [[ -n "${container_id}" ]]; then
            health_status="$(
                docker inspect \
                    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
                    "${container_id}"
            )"

            if [[ "${health_status}" == "healthy" ]]; then
                log_ok "PostgreSQL de la nueva versión está saludable."
                return
            fi

            if [[ "${health_status}" == "unhealthy" ]] \
                || [[ "${health_status}" == "exited" ]] \
                || [[ "${health_status}" == "dead" ]]
            then
                die "PostgreSQL entró en estado ${health_status}."
            fi
        fi

        current_time="$(date +%s)"
        elapsed=$((current_time - start_time))

        if (( elapsed >= timeout_seconds )); then
            die "PostgreSQL no quedó saludable dentro del tiempo esperado."
        fi

        sleep 2
    done
}

run_migrations() {
    log_info "Iniciando PostgreSQL para ejecutar migraciones..."

    compose_new up \
        --detach \
        --no-build \
        --pull never \
        postgres

    wait_for_new_postgres

    log_info "Ejecutando migraciones de la nueva versión..."

    compose_new run \
        --rm \
        --no-deps \
        backend \
        python src/manage.py migrate --noinput

    log_info "Asegurando roles base de la aplicación..."

    compose_new run \
        --rm \
        --no-deps \
        backend \
        python src/manage.py setup_roles

    log_ok "Migraciones y roles base completados."
}

start_new_application() {
    log_info "Iniciando nueva versión..."

    "${INSTALL_ROOT}/scripts/start.sh"

    log_ok "Nueva versión iniciada."
}

run_final_healthcheck() {
    log_info "Ejecutando healthcheck final..."

    "${INSTALL_ROOT}/scripts/healthcheck.sh"

    log_ok "Healthcheck final correcto."
}

print_result() {
    printf '\n'
    printf 'Actualización completada\n'
    printf '========================\n'
    printf 'Versión anterior: %s\n' "${CURRENT_VERSION}"
    printf 'Versión nueva:    %s\n' "${VERSION}"
    printf 'Instalación:      %s\n' "${INSTALL_ROOT}"
    printf 'Copia anterior:   %s\n' "${PREVIOUS_INSTALL_ROOT}"
    printf '\n'
    printf '[OK] LICS quedó actualizado y saludable.\n'
}

main() {
    printf 'Actualizador offline de LICS\n'
    printf '============================\n'
    printf 'Paquete:     %s\n' "${PACKAGE_ROOT}"
    printf 'Instalación: %s\n' "${INSTALL_ROOT}"
    printf '\n'

    require_root

    require_command awk
    require_command basename
    require_command cp
    require_command date
    require_command docker
    require_command find
    require_command grep
    require_command mkdir
    require_command mv
    require_command rm
    require_command sha256sum
    require_command sort
    require_command tr

    validate_package_structure
    verify_package_checksums
    validate_existing_installation
    load_versions
    run_current_healthcheck
    create_pre_update_backup
    load_images
    validate_loaded_images
    prepare_new_application
    stop_current_application
    publish_new_application
    run_migrations
    start_new_application
    run_final_healthcheck
    print_result
}

main "$@"
