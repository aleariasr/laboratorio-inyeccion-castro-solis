#!/usr/bin/env bash

# Revierte LICS a una instalación anterior usando un respaldo pre-update.
#
# Uso:
#
#   sudo ./scripts/rollback.sh /opt/lics.previous.<timestamp> /opt/lics/backups/<backup-pre-update>
#
# Este script:
# - valida la instalación actual;
# - valida la instalación anterior;
# - valida el respaldo;
# - exige que la versión anterior coincida con la versión del respaldo;
# - crea un respaldo preventivo pre-restore del estado actual;
# - detiene la instalación actual;
# - restaura la aplicación anterior;
# - preserva el historial de respaldos;
# - restaura la base de datos desde el respaldo pre-update;
# - inicia el sistema;
# - ejecuta healthcheck final.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

PREVIOUS_INSTALLATION="${1:-}"
ROLLBACK_BACKUP="${2:-}"

CURRENT_INSTALL_ROOT="${PROJECT_ROOT}"
FAILED_INSTALL_ROOT=""
BACKUP_FILE=""
BACKUP_METADATA_FILE=""

CURRENT_VERSION=""
PREVIOUS_VERSION=""
BACKUP_VERSION=""
DATABASE_NAME=""
DATABASE_USER=""

ROLLBACK_STARTED=0
APP_SWITCHED=0
DB_RESTORE_STARTED=0
DB_RESTORE_COMPLETED=0

metadata_value() {
    local key="$1"

    awk -v expected_key="${key}" '
        index($0, expected_key "=") == 1 {
            sub(/^[^=]*=/, "")
            print
            exit
        }
    ' "${BACKUP_METADATA_FILE}"
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

failure_handler() {
    local exit_code="$?"

    printf '\n' >&2
    log_error "El rollback no terminó correctamente."

    if (( DB_RESTORE_STARTED == 1 )) && (( DB_RESTORE_COMPLETED == 0 )); then
        log_error "La base pudo quedar incompleta."
        log_error "No inicie el sistema sin revisar la base de datos."
    fi

    if (( APP_SWITCHED == 1 )); then
        log_error "La aplicación ya fue cambiada a la instalación anterior."
        log_error "Instalación fallida conservada en:"
        log_error "  ${FAILED_INSTALL_ROOT}"
    fi

    exit "${exit_code}"
}

trap failure_handler ERR

require_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        die "Debe ejecutar rollback.sh con sudo."
    fi
}

validate_arguments() {
    if [[ -z "${PREVIOUS_INSTALLATION}" ]]; then
        die "Debe indicar la instalación anterior."
    fi

    if [[ -z "${ROLLBACK_BACKUP}" ]]; then
        die "Debe indicar el respaldo pre-update."
    fi

    if [[ ! -d "${PREVIOUS_INSTALLATION}" ]]; then
        die "No existe la instalación anterior: ${PREVIOUS_INSTALLATION}"
    fi

    if [[ ! -d "${ROLLBACK_BACKUP}" ]]; then
        die "No existe el respaldo: ${ROLLBACK_BACKUP}"
    fi

    PREVIOUS_INSTALLATION="$(
        cd "${PREVIOUS_INSTALLATION}" \
            && pwd
    )"

    ROLLBACK_BACKUP="$(
        cd "${ROLLBACK_BACKUP}" \
            && pwd
    )"

    BACKUP_FILE="${ROLLBACK_BACKUP}/database.dump"
    BACKUP_METADATA_FILE="${ROLLBACK_BACKUP}/metadata.txt"

    require_file "${BACKUP_FILE}"
    require_file "${BACKUP_METADATA_FILE}"
}

validate_installations() {
    require_file "${CURRENT_INSTALL_ROOT}/infra/docker/.env.prod"
    require_file "${PREVIOUS_INSTALLATION}/infra/docker/.env.prod"

    if [[ ! -x "${CURRENT_INSTALL_ROOT}/scripts/backup.sh" ]]; then
        die "No existe backup.sh ejecutable en la instalación actual."
    fi

    if [[ ! -x "${CURRENT_INSTALL_ROOT}/scripts/stop.sh" ]]; then
        die "No existe stop.sh ejecutable en la instalación actual."
    fi

    if [[ ! -x "${PREVIOUS_INSTALLATION}/scripts/start.sh" ]]; then
        die "No existe start.sh ejecutable en la instalación anterior."
    fi

    if [[ ! -x "${PREVIOUS_INSTALLATION}/scripts/healthcheck.sh" ]]; then
        die "No existe healthcheck.sh ejecutable en la instalación anterior."
    fi
}

load_versions() {
    CURRENT_VERSION="$(installed_version)"
    PREVIOUS_VERSION="$(env_value_from_file "${PREVIOUS_INSTALLATION}/infra/docker/.env.prod" LICS_VERSION)"
    BACKUP_VERSION="$(metadata_value application_version)"
    DATABASE_NAME="$(metadata_value database_name)"
    DATABASE_USER="$(metadata_value database_user)"

    if [[ -z "${PREVIOUS_VERSION}" ]]; then
        die "No se pudo leer LICS_VERSION de la instalación anterior."
    fi

    if [[ -z "${BACKUP_VERSION}" ]]; then
        die "No se pudo leer application_version del respaldo."
    fi

    if [[ "${PREVIOUS_VERSION}" != "${BACKUP_VERSION}" ]]; then
        die "La versión anterior (${PREVIOUS_VERSION}) no coincide con el respaldo (${BACKUP_VERSION})."
    fi

    if [[ -z "${DATABASE_NAME}" ]]; then
        die "El respaldo no declara database_name."
    fi

    if [[ -z "${DATABASE_USER}" ]]; then
        die "El respaldo no declara database_user."
    fi

    log_ok "Versión actual:    ${CURRENT_VERSION}"
    log_ok "Versión rollback:  ${PREVIOUS_VERSION}"
    log_ok "Versión respaldo:  ${BACKUP_VERSION}"
}

validate_database_name() {
    if [[ "${DATABASE_NAME}" == "postgres" ]] \
        || [[ "${DATABASE_NAME}" == "template0" ]] \
        || [[ "${DATABASE_NAME}" == "template1" ]]
    then
        die "Nombre de base no permitido para rollback: ${DATABASE_NAME}"
    fi

    if [[ ! "${DATABASE_NAME}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        die "El nombre de base contiene caracteres no permitidos: ${DATABASE_NAME}"
    fi
}

request_confirmation() {
    local expected
    local entered

    expected="ROLLBACK ${PREVIOUS_VERSION}"

    printf '\n'
    printf 'ADVERTENCIA: ROLLBACK PRODUCTIVO\n'
    printf '================================\n'
    printf 'Versión actual:       %s\n' "${CURRENT_VERSION}"
    printf 'Versión destino:      %s\n' "${PREVIOUS_VERSION}"
    printf 'Instalación anterior: %s\n' "${PREVIOUS_INSTALLATION}"
    printf 'Respaldo:             %s\n' "${ROLLBACK_BACKUP}"
    printf 'Base de datos:        %s\n' "${DATABASE_NAME}"
    printf '\n'
    printf 'Para continuar escriba exactamente:\n'
    printf '\n'
    printf '  %s\n' "${expected}"
    printf '\n'
    printf '> '

    if [[ ! -r /dev/tty ]]; then
        die "El rollback requiere una terminal interactiva."
    fi

    if ! IFS= read -r entered < /dev/tty; then
        die "No se pudo leer la confirmación."
    fi

    if [[ "${entered}" != "${expected}" ]]; then
        log_warning "Rollback cancelado. No se modificó el sistema."
        exit 1
    fi

    log_ok "Confirmación aceptada."
}

create_safety_backup() {
    log_info "Creando respaldo preventivo del estado actual..."

    "${CURRENT_INSTALL_ROOT}/scripts/backup.sh" pre-restore

    log_ok "Respaldo preventivo creado."
}

stop_current_application() {
    log_info "Deteniendo instalación actual..."

    "${CURRENT_INSTALL_ROOT}/scripts/stop.sh"

    log_ok "Instalación actual detenida."
}

switch_application() {
    local timestamp

    timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    FAILED_INSTALL_ROOT="${CURRENT_INSTALL_ROOT}.failed.${timestamp}"

    if [[ -e "${FAILED_INSTALL_ROOT}" ]]; then
        die "Ya existe la ruta de instalación fallida: ${FAILED_INSTALL_ROOT}"
    fi

    ROLLBACK_STARTED=1

    log_info "Conservando instalación actual en ${FAILED_INSTALL_ROOT}..."

    mv "${CURRENT_INSTALL_ROOT}" "${FAILED_INSTALL_ROOT}"

    log_info "Restaurando instalación anterior en ${CURRENT_INSTALL_ROOT}..."

    mv "${PREVIOUS_INSTALLATION}" "${CURRENT_INSTALL_ROOT}"

    APP_SWITCHED=1

    if [[ -d "${FAILED_INSTALL_ROOT}/backups" ]]; then
        log_info "Preservando historial de respaldos..."

        rm -rf "${CURRENT_INSTALL_ROOT}/backups"
        mv "${FAILED_INSTALL_ROOT}/backups" "${CURRENT_INSTALL_ROOT}/backups"
        chmod 700 "${CURRENT_INSTALL_ROOT}/backups"

        log_ok "Historial de respaldos preservado."
    fi

    chmod 750 "${CURRENT_INSTALL_ROOT}"
    chmod 600 "${CURRENT_INSTALL_ROOT}/infra/docker/.env.prod"

    log_ok "Aplicación anterior restaurada."
}

compose_rollback() {
    docker compose \
        --env-file "${CURRENT_INSTALL_ROOT}/infra/docker/.env.prod" \
        --file "${CURRENT_INSTALL_ROOT}/infra/docker/compose.prod.yml" \
        "$@"
}

wait_for_postgres() {
    local timeout_seconds=120
    local start_time
    local current_time
    local elapsed
    local container_id
    local status

    start_time="$(date +%s)"

    while true; do
        container_id="$(
            compose_rollback ps \
                --quiet \
                postgres
        )"

        if [[ -n "${container_id}" ]]; then
            status="$(
                docker inspect \
                    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
                    "${container_id}"
            )"

            if [[ "${status}" == "healthy" ]]; then
                log_ok "PostgreSQL está saludable."
                return
            fi

            if [[ "${status}" == "unhealthy" ]] \
                || [[ "${status}" == "exited" ]] \
                || [[ "${status}" == "dead" ]]
            then
                die "PostgreSQL entró en estado ${status}."
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

start_postgres() {
    log_info "Iniciando PostgreSQL para restaurar base..."

    compose_rollback up \
        --detach \
        --no-build \
        --pull never \
        postgres

    wait_for_postgres
}

terminate_database_connections() {
    log_info "Cerrando conexiones activas con la base..."

    compose_rollback exec \
        --no-TTY \
        postgres \
        psql \
        --username="${DATABASE_USER}" \
        --dbname=postgres \
        --set=ON_ERROR_STOP=1 \
        --command="
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '${DATABASE_NAME}'
              AND pid <> pg_backend_pid();
        " \
        > /dev/null

    log_ok "Conexiones cerradas."
}

recreate_database() {
    DB_RESTORE_STARTED=1

    log_info "Recreando base de datos ${DATABASE_NAME}..."

    compose_rollback exec \
        --no-TTY \
        postgres \
        dropdb \
        --username="${DATABASE_USER}" \
        --force \
        --if-exists \
        "${DATABASE_NAME}"

    compose_rollback exec \
        --no-TTY \
        postgres \
        createdb \
        --username="${DATABASE_USER}" \
        --owner="${DATABASE_USER}" \
        --encoding=UTF8 \
        "${DATABASE_NAME}"

    log_ok "Base recreada."
}

restore_database() {
    log_info "Restaurando respaldo pre-update..."

    compose_rollback exec \
        --no-TTY \
        postgres \
        pg_restore \
        --username="${DATABASE_USER}" \
        --dbname="${DATABASE_NAME}" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        < "${BACKUP_FILE}"

    DB_RESTORE_COMPLETED=1

    log_ok "Base restaurada."
}

start_and_validate() {
    log_info "Iniciando sistema restaurado..."

    "${CURRENT_INSTALL_ROOT}/scripts/start.sh"
    "${CURRENT_INSTALL_ROOT}/scripts/healthcheck.sh"

    log_ok "Rollback validado correctamente."
}

print_result() {
    printf '\n'
    printf 'Rollback completado\n'
    printf '===================\n'
    printf 'Versión anterior restaurada: %s\n' "${PREVIOUS_VERSION}"
    printf 'Instalación fallida:         %s\n' "${FAILED_INSTALL_ROOT}"
    printf 'Respaldo usado:              %s\n' "${ROLLBACK_BACKUP}"
    printf '\n'
    printf '[OK] LICS quedó restaurado y saludable.\n'
}

main() {
    printf 'Rollback productivo de LICS\n'
    printf '===========================\n'

    require_root

    require_command awk
    require_command date
    require_command docker
    require_command grep
    require_command mv
    require_command rm
    require_command tr

    validate_runtime
    validate_arguments
    validate_installations

    log_info "Verificando respaldo seleccionado..."
    "${SCRIPT_DIR}/verify-backup.sh" "${ROLLBACK_BACKUP}"

    load_versions
    validate_database_name
    request_confirmation
    create_safety_backup
    stop_current_application
    switch_application
    start_postgres
    terminate_database_connections
    recreate_database
    restore_database
    start_and_validate
    print_result
}

main "$@"
