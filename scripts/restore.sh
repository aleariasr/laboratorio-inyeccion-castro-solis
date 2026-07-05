#!/usr/bin/env bash

# Restaura un respaldo validado sobre la base de datos productiva.
#
# Flujo de seguridad:
# 1. valida el entorno y PostgreSQL;
# 2. verifica completamente el respaldo;
# 3. comprueba compatibilidad de base y versión;
# 4. crea un respaldo preventivo pre-restore;
# 5. exige confirmación explícita;
# 6. detiene frontend, backend y Nginx;
# 7. recrea únicamente la base configurada;
# 8. restaura el dump;
# 9. valida migraciones y tablas esenciales;
# 10. inicia el sistema y ejecuta healthcheck.
#
# Uso:
#
#   ./scripts/restore.sh /ruta/al/respaldo
#
# Confirmación esperada:
#
#   RESTORE <nombre_base>
#
# Ejemplo:
#
#   RESTORE lics
#
# Este script no elimina volúmenes ni imágenes.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

BACKUP_DIRECTORY="${1:-}"
DUMP_FILE=""
METADATA_FILE=""

DATABASE_NAME=""
DATABASE_USER=""
BACKUP_DATABASE_NAME=""
BACKUP_APPLICATION_VERSION=""
CURRENT_APPLICATION_VERSION=""

APPLICATION_SERVICES_STOPPED=0
DESTRUCTIVE_PHASE_STARTED=0
RESTORE_COMPLETED=0

metadata_value() {
    local key="$1"

    awk -v expected_key="${key}" '
        index($0, expected_key "=") == 1 {
            sub(/^[^=]*=/, "")
            print
            exit
        }
    ' "${METADATA_FILE}"
}

failure_handler() {
    local exit_code="$?"

    printf '\n' >&2
    log_error "La restauración productiva no terminó correctamente."

    if (( DESTRUCTIVE_PHASE_STARTED == 1 )) \
        && (( RESTORE_COMPLETED == 0 ))
    then
        log_error "La base productiva pudo quedar incompleta."
        log_error "Los servicios de aplicación permanecerán detenidos."
        log_error "No ejecute start.sh hasta revisar la base de datos."
        log_error "Use el respaldo pre-restore para recuperación."

        exit "${exit_code}"
    fi

    if (( APPLICATION_SERVICES_STOPPED == 1 )); then
        log_warning \
            "La base no fue modificada. Intentando recuperar los servicios..."

        if "${SCRIPT_DIR}/start.sh"; then
            log_ok "Los servicios fueron recuperados automáticamente."
        else
            log_error "No fue posible recuperar automáticamente los servicios."
        fi
    fi

    exit "${exit_code}"
}

trap failure_handler ERR

validate_arguments() {
    if [[ -z "${BACKUP_DIRECTORY}" ]]; then
        die "Debe indicar el directorio del respaldo."
    fi

    if [[ ! -d "${BACKUP_DIRECTORY}" ]]; then
        die "No existe el directorio: ${BACKUP_DIRECTORY}"
    fi

    BACKUP_DIRECTORY="$(
        cd "${BACKUP_DIRECTORY}" \
            && pwd
    )"

    DUMP_FILE="${BACKUP_DIRECTORY}/database.dump"
    METADATA_FILE="${BACKUP_DIRECTORY}/metadata.txt"

    require_file "${DUMP_FILE}"
    require_file "${METADATA_FILE}"
}

validate_postgres_health() {
    local status

    status="$(service_health_status postgres)"

    if [[ "${status}" != "healthy" ]]; then
        die "PostgreSQL no está saludable. Estado actual: ${status}"
    fi
}

load_restore_metadata() {
    DATABASE_NAME="$(env_value POSTGRES_DB)"
    DATABASE_USER="$(env_value POSTGRES_USER)"
    CURRENT_APPLICATION_VERSION="$(installed_version)"

    BACKUP_DATABASE_NAME="$(metadata_value database_name)"
    BACKUP_APPLICATION_VERSION="$(metadata_value application_version)"

    if [[ -z "${BACKUP_DATABASE_NAME}" ]]; then
        die "El respaldo no declara database_name."
    fi

    if [[ -z "${BACKUP_APPLICATION_VERSION}" ]]; then
        die "El respaldo no declara application_version."
    fi
}

validate_restore_target() {
    if [[ "${DATABASE_NAME}" == "postgres" ]] \
        || [[ "${DATABASE_NAME}" == "template0" ]] \
        || [[ "${DATABASE_NAME}" == "template1" ]]
    then
        die "El nombre de la base configurada no es seguro para restauración: ${DATABASE_NAME}"
    fi

    if [[ ! "${DATABASE_NAME}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        die "El nombre de base configurado contiene caracteres no permitidos."
    fi

    if [[ "${BACKUP_DATABASE_NAME}" != "${DATABASE_NAME}" ]]; then
        die \
            "El respaldo pertenece a ${BACKUP_DATABASE_NAME}, pero producción usa ${DATABASE_NAME}."
    fi

    if [[ "${BACKUP_APPLICATION_VERSION}" != "${CURRENT_APPLICATION_VERSION}" ]]; then
        if [[ "${LICS_ALLOW_VERSION_MISMATCH:-0}" != "1" ]]; then
            die \
                "La versión del respaldo (${BACKUP_APPLICATION_VERSION}) no coincide con la versión instalada (${CURRENT_APPLICATION_VERSION})."
        fi

        log_warning \
            "Se permitió explícitamente restaurar un respaldo de otra versión."
    fi
}

create_pre_restore_backup() {
    log_info "Creando respaldo preventivo antes de modificar producción..."

    "${SCRIPT_DIR}/backup.sh" pre-restore

    log_ok "Respaldo preventivo completado."
}

request_confirmation() {
    local expected_confirmation
    local entered_confirmation

    expected_confirmation="RESTORE ${DATABASE_NAME}"

    printf '\n'
    printf 'ADVERTENCIA: OPERACIÓN DESTRUCTIVA\n'
    printf '=================================\n'
    printf 'Base que será reemplazada: %s\n' "${DATABASE_NAME}"
    printf 'Respaldo seleccionado:    %s\n' "${BACKUP_DIRECTORY}"
    printf 'Versión del respaldo:     %s\n' "${BACKUP_APPLICATION_VERSION}"
    printf 'Versión instalada:        %s\n' "${CURRENT_APPLICATION_VERSION}"
    printf '\n'
    printf 'Antes de modificar la base se creará un respaldo preventivo.\n'
    printf 'Para continuar escriba exactamente:\n'
    printf '\n'
    printf '  %s\n' "${expected_confirmation}"
    printf '\n'
    printf '> '

    if [[ ! -r /dev/tty ]]; then
        log_error "La restauración requiere una terminal interactiva."
        exit 1
    fi

    if ! IFS= read -r entered_confirmation < /dev/tty; then
        log_error "No fue posible leer la confirmación."
        exit 1
    fi

    if [[ "${entered_confirmation}" != "${expected_confirmation}" ]]; then
        log_warning "Restauración cancelada. No se modificó la base productiva."
        exit 1
    fi

    log_ok "Confirmación productiva aceptada."
}

stop_application_services() {
    log_info "Deteniendo Nginx, frontend y backend..."

    compose stop \
        --timeout "${LICS_STOP_TIMEOUT_SECONDS:-60}" \
        nginx \
        frontend \
        backend

    APPLICATION_SERVICES_STOPPED=1

    log_ok "Servicios de aplicación detenidos."
}

terminate_database_connections() {
    log_info "Cerrando conexiones activas con la base productiva..."

    # DATABASE_NAME ya fue validado para aceptar únicamente letras,
    # números y guiones bajos antes de llegar a esta función.
    compose exec \
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

    log_ok "Conexiones activas cerradas."
}

recreate_database() {
    DESTRUCTIVE_PHASE_STARTED=1

    log_info "Eliminando únicamente la base productiva configurada..."

    compose exec \
        --no-TTY \
        postgres \
        dropdb \
        --username="${DATABASE_USER}" \
        --force \
        --if-exists \
        "${DATABASE_NAME}"

    log_info "Creando nuevamente la base productiva..."

    compose exec \
        --no-TTY \
        postgres \
        createdb \
        --username="${DATABASE_USER}" \
        --owner="${DATABASE_USER}" \
        --encoding=UTF8 \
        "${DATABASE_NAME}"

    log_ok "Base productiva recreada."
}

restore_database() {
    log_info "Restaurando el respaldo sobre la base productiva..."

    compose exec \
        --no-TTY \
        postgres \
        pg_restore \
        --username="${DATABASE_USER}" \
        --dbname="${DATABASE_NAME}" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        < "${DUMP_FILE}"

    log_ok "pg_restore terminó correctamente."
}

query_production_scalar() {
    local sql="$1"

    compose exec \
        --no-TTY \
        postgres \
        psql \
        --username="${DATABASE_USER}" \
        --dbname="${DATABASE_NAME}" \
        --tuples-only \
        --no-align \
        --command="${sql}" \
        | tr -d '[:space:]'
}

validate_restored_production() {
    local migration_count
    local table_count
    local required_table_count

    log_info "Validando la base productiva restaurada..."

    migration_count="$(
        query_production_scalar \
            'SELECT COUNT(*) FROM django_migrations;'
    )"

    if [[ ! "${migration_count}" =~ ^[0-9]+$ ]] \
        || (( migration_count < 1 ))
    then
        die "La restauración no contiene migraciones válidas."
    fi

    log_ok "Migraciones restauradas: ${migration_count}"

    table_count="$(
        query_production_scalar \
            "SELECT COUNT(*)
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_type = 'BASE TABLE';"
    )"

    if [[ ! "${table_count}" =~ ^[0-9]+$ ]] \
        || (( table_count < 1 ))
    then
        die "La restauración no contiene tablas válidas."
    fi

    log_ok "Tablas restauradas: ${table_count}"

    required_table_count="$(
        query_production_scalar \
            "SELECT COUNT(*)
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name IN (
                   'django_migrations',
                   'django_content_type',
                   'auth_user',
                   'django_session'
               );"
    )"

    if [[ "${required_table_count}" != "4" ]]; then
        die "Faltan tablas esenciales de Django después de restaurar."
    fi

    log_ok "Las tablas esenciales de Django están presentes."

    RESTORE_COMPLETED=1
}

start_and_validate_application() {
    log_info "Iniciando nuevamente el sistema..."

    "${SCRIPT_DIR}/start.sh"

    log_info "Ejecutando comprobación integral de salud..."

    "${SCRIPT_DIR}/healthcheck.sh"

    log_ok "El sistema restaurado está saludable."
}

main() {
    printf 'Restauración productiva\n'
    printf '=======================\n'

    validate_runtime
    require_command awk
    require_command tr

    validate_arguments
    validate_postgres_health

    log_info "Verificando integridad del respaldo..."
    "${SCRIPT_DIR}/verify-backup.sh" "${BACKUP_DIRECTORY}"

    load_restore_metadata
    validate_restore_target

    printf '\n'
    printf 'Base productiva:       %s\n' "${DATABASE_NAME}"
    printf 'Versión instalada:     %s\n' "${CURRENT_APPLICATION_VERSION}"
    printf 'Versión del respaldo:  %s\n' "${BACKUP_APPLICATION_VERSION}"
    printf 'Directorio de respaldo: %s\n' "${BACKUP_DIRECTORY}"
    printf '\n'

    request_confirmation
    create_pre_restore_backup
    stop_application_services
    terminate_database_connections
    recreate_database
    restore_database
    validate_restored_production
    start_and_validate_application

    printf '\n'
    printf 'Restauración completada\n'
    printf '=======================\n'
    printf '[OK] Base restaurada: %s\n' "${DATABASE_NAME}"
    printf '[OK] El sistema volvió a quedar saludable.\n'
}

main "$@"