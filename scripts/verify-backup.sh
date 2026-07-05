#!/usr/bin/env bash

# Verifica la integridad y estructura de un respaldo existente.
#
# Comprueba:
# - existencia del directorio;
# - existencia de database.dump, metadata.txt y SHA256SUMS;
# - permisos de lectura;
# - checksums SHA-256;
# - estructura del dump mediante pg_restore --list;
# - coherencia básica de los metadatos;
# - coincidencia entre checksum declarado y checksum real.
#
# Uso:
#
#   ./scripts/verify-backup.sh /ruta/al/respaldo
#
# Devuelve:
# - 0 si el respaldo pasa todas las verificaciones;
# - 1 si detecta cualquier fallo.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

BACKUP_DIRECTORY="${1:-}"

DUMP_FILE=""
METADATA_FILE=""
CHECKSUM_FILE=""

FAILURES=0
WARNINGS=0

verify_ok() {
    printf '[OK] %s\n' "$*"
}

verify_warning() {
    printf '[ADVERTENCIA] %s\n' "$*" >&2
    WARNINGS=$((WARNINGS + 1))
}

verify_failed() {
    printf '[FALLO] %s\n' "$*" >&2
    FAILURES=$((FAILURES + 1))
}

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

validate_arguments() {
    if [[ -z "${BACKUP_DIRECTORY}" ]]; then
        die "Debe indicar el directorio del respaldo."
    fi

    if [[ ! -d "${BACKUP_DIRECTORY}" ]]; then
        die "No existe el directorio de respaldo: ${BACKUP_DIRECTORY}"
    fi

    BACKUP_DIRECTORY="$(
        cd "${BACKUP_DIRECTORY}" \
            && pwd
    )"

    DUMP_FILE="${BACKUP_DIRECTORY}/database.dump"
    METADATA_FILE="${BACKUP_DIRECTORY}/metadata.txt"
    CHECKSUM_FILE="${BACKUP_DIRECTORY}/SHA256SUMS"
}

check_required_files() {
    local file

    for file in \
        "${DUMP_FILE}" \
        "${METADATA_FILE}" \
        "${CHECKSUM_FILE}"
    do
        if [[ ! -f "${file}" ]]; then
            verify_failed "Falta el archivo requerido: ${file}"
            continue
        fi

        if [[ ! -r "${file}" ]]; then
            verify_failed "No se puede leer el archivo: ${file}"
            continue
        fi

        if [[ ! -s "${file}" ]]; then
            verify_failed "El archivo está vacío: ${file}"
            continue
        fi

        verify_ok "Archivo presente y legible: $(basename "${file}")"
    done
}

check_checksums() {
    local checksum_output
    local checksum_status=0

    if (( FAILURES > 0 )); then
        verify_failed "No se pueden validar checksums porque faltan archivos."
        return
    fi

    if command -v sha256sum >/dev/null 2>&1; then
        checksum_output="$(
            cd "${BACKUP_DIRECTORY}" \
                && sha256sum --check SHA256SUMS 2>&1
        )" || checksum_status=$?
    elif command -v shasum >/dev/null 2>&1; then
        checksum_output="$(
            cd "${BACKUP_DIRECTORY}" \
                && shasum -a 256 --check SHA256SUMS 2>&1
        )" || checksum_status=$?
    else
        verify_failed "No se encontró sha256sum ni shasum."
        return
    fi

    printf '%s\n' "${checksum_output}"

    if (( checksum_status == 0 )); then
        verify_ok "Todos los checksums coinciden."
    else
        verify_failed "Uno o más checksums no coinciden."
    fi
}

check_dump_structure() {
    if [[ ! -s "${DUMP_FILE}" ]]; then
        verify_failed "No se puede validar la estructura del dump."
        return
    fi

    if compose exec \
        --no-TTY \
        postgres \
        pg_restore \
        --list \
        < "${DUMP_FILE}" \
        > /dev/null
    then
        verify_ok "pg_restore reconoció correctamente el dump."
    else
        verify_failed "pg_restore no pudo leer el dump."
    fi
}

check_metadata() {
    local backup_name
    local backup_type
    local created_at
    local application_version
    local database_name
    local dump_format
    local declared_checksum
    local actual_checksum
    local declared_size
    local actual_size

    if [[ ! -s "${METADATA_FILE}" ]]; then
        verify_failed "No se pueden validar los metadatos."
        return
    fi

    backup_name="$(metadata_value backup_name)"
    backup_type="$(metadata_value backup_type)"
    created_at="$(metadata_value created_at_utc)"
    application_version="$(metadata_value application_version)"
    database_name="$(metadata_value database_name)"
    dump_format="$(metadata_value dump_format)"
    declared_checksum="$(metadata_value dump_sha256)"
    declared_size="$(metadata_value dump_size_bytes)"

    if [[ -n "${backup_name}" ]]; then
        verify_ok "Nombre del respaldo: ${backup_name}"
    else
        verify_failed "Falta backup_name en metadata.txt."
    fi

    case "${backup_type}" in
        manual|daily|weekly|pre-update|pre-restore)
            verify_ok "Tipo de respaldo válido: ${backup_type}"
            ;;
        *)
            verify_failed "Tipo de respaldo inválido: ${backup_type:-vacío}"
            ;;
    esac

    if [[ "${created_at}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
        verify_ok "Fecha UTC válida: ${created_at}"
    else
        verify_failed "Fecha UTC inválida: ${created_at:-vacía}"
    fi

    if [[ -n "${application_version}" ]]; then
        verify_ok "Versión registrada: ${application_version}"
    else
        verify_failed "Falta application_version en metadata.txt."
    fi

    if [[ -n "${database_name}" ]]; then
        verify_ok "Base registrada: ${database_name}"
    else
        verify_failed "Falta database_name en metadata.txt."
    fi

    if [[ "${dump_format}" == "custom" ]]; then
        verify_ok "Formato de dump válido: custom"
    else
        verify_failed "Formato de dump inesperado: ${dump_format:-vacío}"
    fi

    actual_checksum="$(sha256_file "${DUMP_FILE}")"

    if [[ "${declared_checksum}" == "${actual_checksum}" ]]; then
        verify_ok "Checksum declarado coincide con database.dump."
    else
        verify_failed "El checksum declarado no coincide con database.dump."
    fi

    actual_size="$(
        wc -c < "${DUMP_FILE}" \
            | tr -d '[:space:]'
    )"

    if [[ "${declared_size}" == "${actual_size}" ]]; then
        verify_ok "Tamaño declarado coincide con database.dump."
    else
        verify_failed \
            "El tamaño declarado (${declared_size:-vacío}) no coincide con el tamaño real (${actual_size})."
    fi
}

main() {
    printf 'Verificación de respaldo\n'
    printf '========================\n'

    validate_runtime
    require_command awk
    require_command wc
    require_command tr

    validate_arguments

    printf 'Ruta: %s\n' "${BACKUP_DIRECTORY}"
    printf '\n'

    check_required_files
    check_checksums
    check_dump_structure
    check_metadata

    printf '\n'
    printf 'Fallos:       %s\n' "${FAILURES}"
    printf 'Advertencias: %s\n' "${WARNINGS}"

    if (( FAILURES > 0 )); then
        printf '[FALLO] El respaldo no pasó la verificación.\n' >&2
        return 1
    fi

    printf '[OK] El respaldo pasó todas las verificaciones.\n'
}

main "$@"