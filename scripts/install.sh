#!/usr/bin/env bash

# Instala LICS desde un paquete offline versionado.
#
# Este script debe ejecutarse desde:
#
#   <release>/app/scripts/install.sh
#
# Uso:
#
#   sudo ./app/scripts/install.sh
#
# Realiza:
# - verificación integral de checksums;
# - validación Linux x86_64;
# - validación de Docker y Docker Compose;
# - carga de imágenes offline;
# - instalación atómica en /opt/lics;
# - generación segura de secretos;
# - inicialización de PostgreSQL;
# - ejecución de migraciones;
# - arranque del sistema;
# - healthcheck final.
#
# Configura automáticamente:
# - servicio systemd de LICS;
# - timer systemd de backups automáticos;
# - usuario operativo dedicado;
# - autologin de Ubuntu Desktop mediante GDM;
# - kiosk Chromium para el usuario operativo.
#
# No configura todavía:
# - SSH;
# - firewall.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_ROOT="$(cd "${SOURCE_APP_DIR}/.." && pwd)"
SOURCE_IMAGES_DIR="${PACKAGE_ROOT}/images"

INSTALL_ROOT="${LICS_INSTALL_ROOT:-/opt/lics}"
TEMP_INSTALL_ROOT="${INSTALL_ROOT}.installing.$$"

COMPOSE_FILE="${INSTALL_ROOT}/infra/docker/compose.prod.yml"
ENV_FILE="${INSTALL_ROOT}/infra/docker/.env.prod"

readonly SCRIPT_DIR
readonly SOURCE_APP_DIR
readonly PACKAGE_ROOT
readonly SOURCE_IMAGES_DIR
readonly INSTALL_ROOT
readonly TEMP_INSTALL_ROOT
readonly COMPOSE_FILE
readonly ENV_FILE

VERSION=""
POSTGRES_DATABASE="lics"
POSTGRES_USER="lics"
POSTGRES_PASSWORD=""
DJANGO_SECRET_KEY=""
HTTP_PORT="${LICS_HTTP_PORT:-80}"

INSTALL_DIRECTORY_CREATED=0

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
    log_error "La instalación no terminó correctamente."

    if [[ -d "${TEMP_INSTALL_ROOT}" ]]; then
        log_warning "Eliminando instalación temporal incompleta."
        rm -rf "${TEMP_INSTALL_ROOT}"
    fi

    if (( INSTALL_DIRECTORY_CREATED == 1 )); then
        log_warning \
            "La instalación ya había sido publicada en ${INSTALL_ROOT}."

        if [[ -x "${INSTALL_ROOT}/scripts/stop.sh" ]]; then
            "${INSTALL_ROOT}/scripts/stop.sh" >/dev/null 2>&1 || true
        fi
    fi

    exit "${exit_code}"
}

trap cleanup_on_error ERR

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        die "Debe ejecutar este instalador con sudo."
    fi
}

require_command() {
    local command_name="$1"

    command -v "${command_name}" >/dev/null 2>&1 \
        || die "Falta el comando requerido: ${command_name}"
}

validate_http_port() {
    if [[ ! "${HTTP_PORT}" =~ ^[0-9]+$ ]]; then
        die "LICS_HTTP_PORT debe ser un número."
    fi

    if (( HTTP_PORT < 1 || HTTP_PORT > 65535 )); then
        die "LICS_HTTP_PORT debe estar entre 1 y 65535."
    fi
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
        "${SOURCE_APP_DIR}/infra/docker/.env.prod.example"
        "${SOURCE_APP_DIR}/scripts/install-preflight.sh"
        "${SOURCE_APP_DIR}/scripts/start.sh"
        "${SOURCE_APP_DIR}/scripts/healthcheck.sh"
        "${SOURCE_APP_DIR}/infra/systemd/lics.service"
        "${SOURCE_APP_DIR}/infra/systemd/lics-backup.service"
        "${SOURCE_APP_DIR}/infra/systemd/lics-backup.timer"
        "${SOURCE_APP_DIR}/scripts/install-systemd.sh"
        "${SOURCE_APP_DIR}/scripts/install-backup-timer.sh"
        "${SOURCE_APP_DIR}/scripts/cleanup-backups.sh"
        "${SOURCE_APP_DIR}/scripts/install-desktop-user.sh"
        "${SOURCE_APP_DIR}/scripts/install-autologin-gdm.sh"
        "${SOURCE_APP_DIR}/scripts/install-kiosk.sh"
        "${SOURCE_APP_DIR}/scripts/install-workstation.sh"
        "${SOURCE_APP_DIR}/scripts/wait-for-lics.sh"
        "${SOURCE_APP_DIR}/scripts/start-kiosk.sh"
        "${SOURCE_APP_DIR}/infra/systemd/lics-kiosk.service"
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

load_version() {
    VERSION="$(
        tr -d '[:space:]' < "${PACKAGE_ROOT}/VERSION"
    )"

    if [[ -z "${VERSION}" ]]; then
        die "No fue posible leer la versión del paquete."
    fi

    if [[ "$(
        tr -d '[:space:]' < "${SOURCE_APP_DIR}/VERSION"
    )" != "${VERSION}" ]]; then
        die "La versión del paquete no coincide con app/VERSION."
    fi

    log_ok "Versión validada: ${VERSION}"
}

run_preflight() {
    log_info "Ejecutando comprobaciones de preinstalación..."

    LICS_RELEASE_IMAGES_DIR="${SOURCE_IMAGES_DIR}" \
    LICS_DISK_CHECK_PATH="/opt" \
    "${SOURCE_APP_DIR}/scripts/install-preflight.sh"

    log_ok "Preinstalación aprobada."
}

validate_target() {
    if [[ -e "${INSTALL_ROOT}" ]]; then
        die \
            "Ya existe ${INSTALL_ROOT}. Use el proceso de actualización, no el instalador inicial."
    fi

    if [[ -e "${TEMP_INSTALL_ROOT}" ]]; then
        die "Ya existe el directorio temporal ${TEMP_INSTALL_ROOT}."
    fi
}

validate_desktop_requirements() {
    log_info "Validando entorno gráfico de producción..."

    if [[ ! -d /etc/gdm3 ]] || ! command -v gdm3 >/dev/null 2>&1; then
        die "Se requiere Ubuntu Desktop con GDM para autologin."
    fi

    if command -v chromium >/dev/null 2>&1; then
        log_ok "Chromium disponible."
        return
    fi

    if command -v chromium-browser >/dev/null 2>&1; then
        log_ok "Chromium Browser disponible."
        return
    fi

    if command -v google-chrome >/dev/null 2>&1; then
        log_ok "Google Chrome disponible."
        return
    fi

    die "No se encontró Chromium ni Google Chrome. Instale Chromium antes de ejecutar el instalador."
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
        die \
            "Se esperaban exactamente 4 imágenes, pero se encontraron ${archive_count}."
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
            die \
                "La imagen ${image_name} no es linux/amd64: ${platform}"
        fi

        log_ok "Imagen productiva validada: ${image_name}"
    done < <(required_images)
}

generate_secret() {
    openssl rand -hex 32
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

prepare_application_files() {
    log_info "Preparando instalación temporal..."

    mkdir -p "${TEMP_INSTALL_ROOT}"

    cp -a \
        "${SOURCE_APP_DIR}/." \
        "${TEMP_INSTALL_ROOT}/"

    chmod 750 "${TEMP_INSTALL_ROOT}/scripts/"*.sh
    chmod 750 "${TEMP_INSTALL_ROOT}/scripts/lib/common.sh"

    log_ok "Archivos de aplicación copiados."
}

generate_environment_file() {
    local environment_file

    environment_file="${TEMP_INSTALL_ROOT}/infra/docker/.env.prod"

    cp \
        "${TEMP_INSTALL_ROOT}/infra/docker/.env.prod.example" \
        "${environment_file}"

    POSTGRES_PASSWORD="$(generate_secret)"
    DJANGO_SECRET_KEY="$(generate_secret)"

    set_env_value "${environment_file}" \
        "LICS_VERSION" \
        "${VERSION}"

    set_env_value "${environment_file}" \
        "POSTGRES_DB" \
        "${POSTGRES_DATABASE}"

    set_env_value "${environment_file}" \
        "POSTGRES_USER" \
        "${POSTGRES_USER}"

    set_env_value "${environment_file}" \
        "POSTGRES_PASSWORD" \
        "${POSTGRES_PASSWORD}"

    set_env_value "${environment_file}" \
        "DJANGO_SECRET_KEY" \
        "${DJANGO_SECRET_KEY}"

    set_env_value "${environment_file}" \
        "HTTP_PORT" \
        "${HTTP_PORT}"

    chmod 600 "${environment_file}"

    if grep -q 'REEMPLAZAR_' "${environment_file}"; then
        die \
            "El archivo .env.prod todavía contiene valores REEMPLAZAR_."
    fi

    log_ok "Configuración productiva generada."
}

publish_installation() {
    log_info "Publicando instalación en ${INSTALL_ROOT}..."

    mv "${TEMP_INSTALL_ROOT}" "${INSTALL_ROOT}"

    INSTALL_DIRECTORY_CREATED=1

    chmod 750 "${INSTALL_ROOT}"
    chmod 600 "${ENV_FILE}"

    log_ok "Instalación publicada."
}

compose() {
    docker compose \
        --env-file "${ENV_FILE}" \
        --file "${COMPOSE_FILE}" \
        "$@"
}

start_postgres() {
    log_info "Iniciando PostgreSQL..."

    compose up \
        --detach \
        --no-build \
        --pull never \
        postgres

    log_ok "Contenedor PostgreSQL iniciado."
}

wait_for_postgres() {
    local timeout_seconds=120
    local start_time
    local current_time
    local elapsed
    local container_id
    local health_status

    start_time="$(date +%s)"

    while true; do
        container_id="$(
            compose ps \
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
                log_ok "PostgreSQL está saludable."
                return
            fi

            if [[ "${health_status}" == "unhealthy" ]] \
                || [[ "${health_status}" == "exited" ]] \
                || [[ "${health_status}" == "dead" ]]
            then
                die \
                    "PostgreSQL entró en estado ${health_status}."
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
    log_info "Ejecutando migraciones iniciales..."

    compose run \
        --rm \
        --no-deps \
        backend \
        python src/manage.py migrate --noinput

    log_info "Creando roles base de la aplicación..."

    compose run \
        --rm \
        --no-deps \
        backend \
        python src/manage.py setup_roles

    log_ok "Migraciones iniciales y roles base completados."
}

start_application() {
    log_info "Iniciando todos los servicios..."

    "${INSTALL_ROOT}/scripts/start.sh"

    log_ok "Servicios iniciados."
}

run_healthcheck() {
    log_info "Ejecutando comprobación integral..."

    "${INSTALL_ROOT}/scripts/healthcheck.sh"

    log_ok "Healthcheck completado correctamente."
}

install_operating_system_services() {
    log_info "Instalando servicios del sistema operativo..."

    "${INSTALL_ROOT}/scripts/install-systemd.sh"
    "${INSTALL_ROOT}/scripts/install-backup-timer.sh"

    log_ok "Servicios del sistema operativo instalados."
}

install_desktop_services() {
    log_info "Configurando estación gráfica dedicada..."

    "${INSTALL_ROOT}/scripts/install-desktop-user.sh"
    "${INSTALL_ROOT}/scripts/install-autologin-gdm.sh"

    log_ok "Estación gráfica dedicada configurada."
}

print_result() {
    printf '\n'
    printf 'Instalación completada\n'
    printf '======================\n'
    printf 'Versión:    %s\n' "${VERSION}"
    printf 'Directorio: %s\n' "${INSTALL_ROOT}"
    printf 'URL:        http://127.0.0.1:%s\n' "${HTTP_PORT}"
    printf '\n'
    printf 'Comandos administrativos:\n'
    printf '  %s/scripts/status.sh\n' "${INSTALL_ROOT}"
    printf '  %s/scripts/healthcheck.sh\n' "${INSTALL_ROOT}"
    printf '  %s/scripts/backup.sh manual\n' "${INSTALL_ROOT}"
    printf '\n'
    printf '[OK] LICS quedó instalado y saludable.\n'
    printf '[OK] El usuario operativo y el kiosco quedaron configurados.\n'
    printf '\n'
    printf 'Reinicie la computadora para validar el arranque automático completo.\n'
}

main() {
    printf 'Instalador offline de LICS\n'
    printf '==========================\n'
    printf 'Paquete:     %s\n' "${PACKAGE_ROOT}"
    printf 'Instalación: %s\n' "${INSTALL_ROOT}"
    printf '\n'

    require_root

    require_command awk
    require_command cp
    require_command date
    require_command docker
    require_command find
    require_command grep
    require_command id
    require_command mkdir
    require_command mv
    require_command openssl
    require_command sha256sum
    require_command sort
    require_command tr

    validate_http_port
    validate_package_structure
    verify_package_checksums
    load_version
    run_preflight
    validate_target
    validate_desktop_requirements
    load_images
    validate_loaded_images
    prepare_application_files
    generate_environment_file
    publish_installation
    start_postgres
    wait_for_postgres
    run_migrations
    start_application
    run_healthcheck
    install_operating_system_services
    install_desktop_services
    print_result
}

main "$@"
