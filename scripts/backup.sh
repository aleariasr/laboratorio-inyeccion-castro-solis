#!/usr/bin/env bash

# Crea un respaldo lógico verificable de PostgreSQL.
#
# El respaldo:
# - usa pg_dump en formato custom;
# - no detiene PostgreSQL;
# - no copia directamente el volumen;
# - incluye metadatos;
# - incluye checksums SHA-256;
# - valida el archivo con pg_restore --list;
# - se crea primero en un directorio temporal;
# - solo se publica como respaldo completo si todas las validaciones pasan.
#
# Uso:
#
#   ./scripts/backup.sh
#   ./scripts/backup.sh manual
#   ./scripts/backup.sh pre-update
#
# Tipos permitidos:
# - manual
# - daily
# - weekly
# - pre-update
# - pre-restore

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

BACKUP_TYPE="${1:-manual}"

TIMESTAMP=""
VERSION=""
DATABASE_NAME=""
DATABASE_USER=""
BACKUP_NAME=""
TEMP_DIRECTORY=""
FINAL_DIRECTORY=""
DUMP_FILE=""
METADATA_FILE=""
CHECKSUM_FILE=""

cleanup_on_error() {
    local exit_code="$?"

    if [[ -n "${TEMP_DIRECTORY}" && -d "${TEMP_DIRECTORY}" ]]; then
        log_warning "Eliminando respaldo temporal incompleto."
        rm -rf "${TEMP_DIRECTORY}"
    fi

    log_error "El respaldo no terminó correctamente."
    exit "${exit_code}"
}

trap cleanup_on_error ERR

validate_backup_type() {
    case "${BACKUP_TYPE}" in
        manual|daily|weekly|pre-update|pre-restore)
            ;;
        *)
            die "Tipo de respaldo no válido: ${BACKUP_TYPE}"
            ;;
    esac
}

validate_postgres_health() {
    local status

    status="$(service_health_status postgres)"

    if [[ "${status}" != "healthy" ]]; then
        die "PostgreSQL no está saludable. Estado actual: ${status}"
    fi
}

create_backup_paths() {
    TIMESTAMP="$(utc_timestamp)"
    VERSION="$(installed_version)"
    DATABASE_NAME="$(env_value POSTGRES_DB)"
    DATABASE_USER="$(env_value POSTGRES_USER)"

    BACKUP_NAME="lics-${VERSION}-${BACKUP_TYPE}-${TIMESTAMP}"
    TEMP_DIRECTORY="${BACKUP_ROOT}/.${BACKUP_NAME}.tmp"
    FINAL_DIRECTORY="${BACKUP_ROOT}/${BACKUP_NAME}"

    DUMP_FILE="${TEMP_DIRECTORY}/database.dump"
    METADATA_FILE="${TEMP_DIRECTORY}/metadata.txt"
    CHECKSUM_FILE="${TEMP_DIRECTORY}/SHA256SUMS"

    if [[ -e "${TEMP_DIRECTORY}" || -e "${FINAL_DIRECTORY}" ]]; then
        die "Ya existe una ruta de respaldo con el nombre ${BACKUP_NAME}"
    fi

    mkdir -p "${TEMP_DIRECTORY}"
    chmod 700 "${TEMP_DIRECTORY}"
}

create_database_dump() {
    log_info "Creando respaldo lógico de PostgreSQL..."

    compose exec \
        --no-TTY \
        postgres \
        pg_dump \
        --username="${DATABASE_USER}" \
        --dbname="${DATABASE_NAME}" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        > "${DUMP_FILE}"

    chmod 600 "${DUMP_FILE}"

    if [[ ! -s "${DUMP_FILE}" ]]; then
        die "El archivo de respaldo fue creado vacío."
    fi

    log_ok "Archivo de base de datos creado."
}

validate_database_dump() {
    log_info "Validando estructura interna del respaldo..."

    if compose exec \
        --no-TTY \
        postgres \
        pg_restore \
        --list \
        < "${DUMP_FILE}" \
        > /dev/null
    then
        log_ok "pg_restore reconoció correctamente el respaldo."
    else
        die "pg_restore no pudo validar el archivo de respaldo."
    fi
}

write_metadata() {
    local dump_size
    local postgres_version
    local dump_checksum

    dump_size="$(
        wc -c < "${DUMP_FILE}" \
            | tr -d '[:space:]'
    )"

    postgres_version="$(
        compose exec \
            --no-TTY \
            postgres \
            psql \
            --username="${DATABASE_USER}" \
            --dbname="${DATABASE_NAME}" \
            --tuples-only \
            --no-align \
            --command='SHOW server_version;' \
            | tr -d '\r'
    )"

    dump_checksum="$(sha256_file "${DUMP_FILE}")"

    {
        printf 'backup_name=%s\n' "${BACKUP_NAME}"
        printf 'backup_type=%s\n' "${BACKUP_TYPE}"
        printf 'created_at_utc=%s\n' "${TIMESTAMP}"
        printf 'application_version=%s\n' "${VERSION}"
        printf 'database_name=%s\n' "${DATABASE_NAME}"
        printf 'database_user=%s\n' "${DATABASE_USER}"
        printf 'postgres_version=%s\n' "${postgres_version}"
        printf 'dump_format=custom\n'
        printf 'dump_file=database.dump\n'
        printf 'dump_size_bytes=%s\n' "${dump_size}"
        printf 'dump_sha256=%s\n' "${dump_checksum}"
        printf 'validation=pg_restore_list_ok\n'
    } > "${METADATA_FILE}"

    chmod 600 "${METADATA_FILE}"

    log_ok "Metadatos del respaldo creados."
}

write_checksums() {
    local dump_checksum
    local metadata_checksum

    dump_checksum="$(sha256_file "${DUMP_FILE}")"
    metadata_checksum="$(sha256_file "${METADATA_FILE}")"

    {
        printf '%s  database.dump\n' "${dump_checksum}"
        printf '%s  metadata.txt\n' "${metadata_checksum}"
    } > "${CHECKSUM_FILE}"

    chmod 600 "${CHECKSUM_FILE}"

    log_ok "Checksums SHA-256 creados."
}

publish_backup() {
    mv "${TEMP_DIRECTORY}" "${FINAL_DIRECTORY}"
    TEMP_DIRECTORY=""

    chmod 700 "${FINAL_DIRECTORY}"
    chmod 600 \
        "${FINAL_DIRECTORY}/database.dump" \
        "${FINAL_DIRECTORY}/metadata.txt" \
        "${FINAL_DIRECTORY}/SHA256SUMS"

    log_ok "Respaldo publicado correctamente."
}

main() {
    validate_backup_type

    log_info "Validando entorno productivo..."
    validate_runtime
    require_command awk
    require_command wc
    require_command tr

    ensure_private_directory "${BACKUP_ROOT}"
    validate_postgres_health
    create_backup_paths

    log_info "Tipo de respaldo: ${BACKUP_TYPE}"
    log_info "Versión de aplicación: $(installed_version)"

    create_database_dump
    validate_database_dump
    write_metadata
    write_checksums
    publish_backup

    printf '\n'
    printf 'Respaldo completado\n'
    printf '===================\n'
    printf 'Nombre: %s\n' "${BACKUP_NAME}"
    printf 'Ruta:   %s\n' "${FINAL_DIRECTORY}"
    printf '\n'

    find "${FINAL_DIRECTORY}" \
        -maxdepth 1 \
        -type f \
        -exec ls -lh {} \;
}

main "$@"