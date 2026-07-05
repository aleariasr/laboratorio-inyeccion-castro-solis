#!/usr/bin/env bash

# Restaura un respaldo en una base temporal separada y valida el resultado.
#
# Este script:
# - verifica primero el respaldo;
# - crea una base temporal con nombre controlado;
# - restaura el dump usando pg_restore;
# - comprueba tablas y migraciones;
# - elimina únicamente la base temporal al finalizar.
#
# No modifica ni elimina la base productiva configurada en POSTGRES_DB.
#
# Uso:
#
#   ./scripts/test-restore.sh /ruta/al/respaldo

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

BACKUP_DIRECTORY="${1:-}"
DUMP_FILE=""
PRODUCTION_DATABASE=""
DATABASE_USER=""
TEST_DATABASE=""
TEST_DATABASE_CREATED=0

cleanup() {
    local exit_code="$?"

    if (( TEST_DATABASE_CREATED == 1 )); then
        log_info "Eliminando base temporal: ${TEST_DATABASE}"

        if compose exec \
            --no-TTY \
            postgres \
            dropdb \
            --username="${DATABASE_USER}" \
            --force \
            --if-exists \
            "${TEST_DATABASE}"
        then
            log_ok "Base temporal eliminada."
        else
            log_error \
                "No fue posible eliminar automáticamente la base temporal: ${TEST_DATABASE}"
        fi
    fi

    exit "${exit_code}"
}

trap cleanup EXIT

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

    require_file "${DUMP_FILE}"
}

validate_postgres() {
    local status

    status="$(service_health_status postgres)"

    if [[ "${status}" != "healthy" ]]; then
        die "PostgreSQL no está saludable. Estado: ${status}"
    fi
}

build_test_database_name() {
    local timestamp

    timestamp="$(date -u '+%Y%m%d%H%M%S')"

    PRODUCTION_DATABASE="$(env_value POSTGRES_DB)"
    DATABASE_USER="$(env_value POSTGRES_USER)"
    TEST_DATABASE="lics_restore_test_${timestamp}_$$"

    if [[ "${TEST_DATABASE}" == "${PRODUCTION_DATABASE}" ]]; then
        die "El nombre temporal coincide con la base productiva."
    fi

    if [[ ! "${TEST_DATABASE}" =~ ^lics_restore_test_[0-9]+_[0-9]+$ ]]; then
        die "El nombre generado para la base temporal no es seguro."
    fi
}

create_test_database() {
    log_info "Creando base temporal: ${TEST_DATABASE}"

    compose exec \
        --no-TTY \
        postgres \
        createdb \
        --username="${DATABASE_USER}" \
        --encoding=UTF8 \
        "${TEST_DATABASE}"

    TEST_DATABASE_CREATED=1

    log_ok "Base temporal creada."
}

restore_dump() {
    log_info "Restaurando respaldo en la base temporal..."

    compose exec \
        --no-TTY \
        postgres \
        pg_restore \
        --username="${DATABASE_USER}" \
        --dbname="${TEST_DATABASE}" \
        --exit-on-error \
        --single-transaction \
        --no-owner \
        --no-privileges \
        < "${DUMP_FILE}"

    log_ok "pg_restore finalizó correctamente."
}

query_scalar() {
    local sql="$1"

    compose exec \
        --no-TTY \
        postgres \
        psql \
        --username="${DATABASE_USER}" \
        --dbname="${TEST_DATABASE}" \
        --tuples-only \
        --no-align \
        --command="${sql}" \
        | tr -d '[:space:]'
}

validate_restored_database() {
    local migration_count
    local table_count
    local required_table_count

    log_info "Validando la base restaurada..."

    migration_count="$(
        query_scalar \
            'SELECT COUNT(*) FROM django_migrations;'
    )"

    if [[ ! "${migration_count}" =~ ^[0-9]+$ ]] \
        || (( migration_count < 1 ))
    then
        die "La base restaurada no contiene migraciones válidas."
    fi

    log_ok "Migraciones restauradas: ${migration_count}"

    table_count="$(
        query_scalar \
            "SELECT COUNT(*)
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_type = 'BASE TABLE';"
    )"

    if [[ ! "${table_count}" =~ ^[0-9]+$ ]] \
        || (( table_count < 1 ))
    then
        die "La base restaurada no contiene tablas."
    fi

    log_ok "Tablas restauradas: ${table_count}"

    required_table_count="$(
        query_scalar \
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
        die "Faltan tablas esenciales de Django en la restauración."
    fi

    log_ok "Las tablas esenciales de Django están presentes."

    compose exec \
        --no-TTY \
        postgres \
        psql \
        --username="${DATABASE_USER}" \
        --dbname="${TEST_DATABASE}" \
        --command='SELECT current_database(), current_user;'

    log_ok "La base temporal restaurada pasó las verificaciones."
}

main() {
    printf 'Prueba controlada de restauración\n'
    printf '=================================\n'

    validate_runtime
    require_command tr

    validate_arguments
    validate_postgres
    build_test_database_name

    printf 'Respaldo:       %s\n' "${BACKUP_DIRECTORY}"
    printf 'Base productiva: %s\n' "${PRODUCTION_DATABASE}"
    printf 'Base temporal:   %s\n' "${TEST_DATABASE}"
    printf '\n'

    log_info "Verificando el respaldo antes de restaurar..."
    "${SCRIPT_DIR}/verify-backup.sh" "${BACKUP_DIRECTORY}"

    create_test_database
    restore_dump
    validate_restored_database

    printf '\n'
    printf '[OK] La restauración de prueba terminó correctamente.\n'
    printf '[OK] La base productiva no fue modificada.\n'
}

main "$@"