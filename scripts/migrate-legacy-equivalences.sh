#!/usr/bin/env bash

# Agrupa los productos equivalentes del sistema legacy bajo un mismo
# "código universal" (standard_code), contra la base de datos de
# PRODUCCIÓN, en un solo comando.
#
# Uso:
#
#   ./scripts/migrate-legacy-equivalences.sh
#   ./scripts/migrate-legacy-equivalences.sh --rollback
#
# NO necesita los archivos .DBF ni ninguna ruta: lee el staging que ya
# dejó scripts/migrate-legacy-dbf.sh en la base de datos
# (LegacyStagingRecord). Si el staging no existe, avisa y no hace nada.
#
# Qué hace, en orden:
#   1. Valida el entorno y espera a que backend y postgres estén sanos.
#   2. Corre primero en modo verificación (--dry-run) y muestra el
#      resumen exacto de lo que cambiaría. No escribe nada todavía.
#   3. Si no hay nada pendiente, sale sin tocar nada y sin crear
#      respaldo — volver a correrlo después de una migración exitosa es
#      seguro y barato.
#   4. Pide confirmación explícita.
#   5. Crea un respaldo completo de la base de datos ANTES de escribir
#      una sola fila (scripts/backup.sh manual) y dice dónde quedó.
#   6. Aplica los cambios.
#   7. Vuelve a verificar y exige que queden 0 grupos pendientes.
#
# Qué NO toca, nunca: no crea ni borra productos, no modifica precios,
# costos, stock, movimientos ni ubicaciones. Solo reescribe
# standard_code, variant_kind y description de productos que ya existen.
#
# Todo lo que sale por pantalla queda además en logs/ con timestamp.
#
# Si a la administradora no le convence el resultado, --rollback devuelve
# cada producto a su código legacy original. La traza está en
# LegacyRecordMap, no depende de este script ni del respaldo.
#
# Ver docs/dbf-migration-closure.md para el detalle de la migración
# legacy completa, de la que esto es el último paso.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly PROJECT_DIR

LOG_DIRECTORY="${PROJECT_DIR}/logs"
readonly LOG_DIRECTORY

MODE="apply"
VERIFICATION_OUTPUT=""

usage() {
    cat <<'EOF'
Uso: ./scripts/migrate-legacy-equivalences.sh [--rollback]

Sin argumentos: agrupa los productos equivalentes bajo un mismo código
universal, después de mostrar qué va a cambiar y pedir confirmación.

  --rollback   Deshace la agrupación: devuelve a cada producto el código
               legacy con el que se importó originalmente.
EOF
}

parse_arguments() {
    case "${1:-}" in
        "")
            MODE="apply"
            ;;
        --rollback)
            MODE="rollback"
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            usage
            printf '\n'
            die "Argumento no reconocido: ${1}"
            ;;
    esac

    readonly MODE
}

manage_equivalences() {
    compose exec --no-TTY backend \
        python src/manage.py migrate_legacy_equivalences "$@"
}

# Lee un contador de la línea "RESULTADO ..." que imprime el comando.
# Se usa esa línea y no el texto en prosa justamente para que un cambio
# de redacción no rompa el script.
read_counter() {
    local output="$1"
    local key="$2"
    local value

    value="$(printf '%s\n' "${output}" \
        | sed -n "s/.*${key}=\([0-9][0-9]*\).*/\1/p" \
        | tail -n 1)"

    if [[ -z "${value}" ]]; then
        die "No se encontró '${key}' en la salida del comando. ¿Cambió el formato de la línea RESULTADO?"
    fi

    printf '%s' "${value}"
}

run_verification() {
    local output

    if ! output="$(manage_equivalences --dry-run 2>&1)"; then
        printf '%s\n' "${output}"
        printf '\n'
        die "Falló la verificación. Si dice que no hay MigrationRun o que no hay staging de INVEN03, primero hay que correr ./scripts/migrate-legacy-dbf.sh."
    fi

    printf '%s\n' "${output}"
    VERIFICATION_OUTPUT="${output}"
}

confirm_before_writing_production_data() {
    local pending_groups="$1"
    local pending_products="$2"

    printf '\n'
    log_warning "Esto va a reagrupar ${pending_groups} grupos (${pending_products} productos) en la base de datos de PRODUCCIÓN."
    log_warning "Cambia el código que se ve en pantalla y en las etiquetas de esos productos."
    log_warning "NO se crean ni se borran productos, y no se tocan precios, stock ni ubicaciones."
    log_warning "Antes de escribir una sola fila se va a crear un respaldo completo."
    printf '\n'
    read -r -p "¿Confirmás que querés continuar? Escribí 'si' para continuar: " confirmation
    printf '\n'

    if [[ "${confirmation}" != "si" ]]; then
        die "Cancelado por el usuario."
    fi
}

confirm_before_rollback() {
    local products="$1"

    printf '\n'
    log_warning "Esto va a DESHACER la agrupación de ${products} productos en PRODUCCIÓN."
    log_warning "Cada uno vuelve a su código legacy original y se le limpian las notas."
    log_warning "Los productos que alguien haya cambiado a mano después no se tocan."
    log_warning "Antes de escribir una sola fila se va a crear un respaldo completo."
    printf '\n'
    read -r -p "¿Confirmás que querés revertir? Escribí 'si' para continuar: " confirmation
    printf '\n'

    if [[ "${confirmation}" != "si" ]]; then
        die "Cancelado por el usuario."
    fi
}

create_backup() {
    printf '\n'
    log_info "Creando respaldo de la base de datos antes de escribir..."
    "${SCRIPT_DIR}/backup.sh" manual
}

do_apply() {
    local output pending_groups pending_products

    log_info "Paso 1/3: verificación, sin escribir nada..."
    run_verification
    output="${VERIFICATION_OUTPUT}"

    pending_groups="$(read_counter "${output}" "grupos_pendientes")"
    pending_products="$(read_counter "${output}" "productos_pendientes")"

    if [[ "${pending_groups}" -eq 0 ]]; then
        printf '\n'
        log_ok "No hay nada pendiente: los grupos de equivalencia ya están aplicados."
        log_info "No se creó respaldo ni se tocó la base de datos."
        return 0
    fi

    confirm_before_writing_production_data "${pending_groups}" "${pending_products}"

    create_backup

    printf '\n'
    log_info "Paso 2/3: aplicando la agrupación..."
    manage_equivalences

    printf '\n'
    log_info "Paso 3/3: verificando que no quede nada pendiente..."
    run_verification
    output="${VERIFICATION_OUTPUT}"

    pending_groups="$(read_counter "${output}" "grupos_pendientes")"
    if [[ "${pending_groups}" -ne 0 ]]; then
        die "Quedaron ${pending_groups} grupos pendientes después de aplicar. Revisá la salida de arriba antes de volver a correrlo."
    fi

    printf '\n'
    log_ok "Agrupación completa y verificada: 0 grupos pendientes."
    log_info "Si a la administradora no le convence, se deshace con: ./scripts/migrate-legacy-equivalences.sh --rollback"
}

do_rollback() {
    local output products

    log_info "Paso 1/3: verificación, sin escribir nada..."
    if ! output="$(manage_equivalences --rollback --dry-run 2>&1)"; then
        printf '%s\n' "${output}"
        printf '\n'
        die "Falló la verificación del rollback."
    fi
    printf '%s\n' "${output}"

    products="$(read_counter "${output}" "productos_a_revertir")"

    if [[ "${products}" -eq 0 ]]; then
        printf '\n'
        log_ok "No hay nada que revertir."
        log_info "No se creó respaldo ni se tocó la base de datos."
        return 0
    fi

    confirm_before_rollback "${products}"

    create_backup

    printf '\n'
    log_info "Paso 2/3: revirtiendo..."
    manage_equivalences --rollback

    printf '\n'
    log_info "Paso 3/3: verificando que no quede nada por revertir..."
    if ! output="$(manage_equivalences --rollback --dry-run 2>&1)"; then
        printf '%s\n' "${output}"
        die "Falló la verificación final del rollback."
    fi
    printf '%s\n' "${output}"

    products="$(read_counter "${output}" "productos_a_revertir")"
    if [[ "${products}" -ne 0 ]]; then
        die "Quedaron ${products} productos sin revertir. Revisá la salida de arriba."
    fi

    printf '\n'
    log_ok "Rollback completo y verificado."
}

main() {
    log_info "Validando entorno productivo..."
    validate_runtime
    wait_for_service backend 60
    wait_for_service postgres 60

    if [[ "${MODE}" == "rollback" ]]; then
        do_rollback
    else
        do_apply
    fi

    printf '\n'
    log_info "Log completo de esta corrida: ${LOG_FILE}"
}

parse_arguments "$@"

mkdir -p "${LOG_DIRECTORY}"

LOG_FILE="${LOG_DIRECTORY}/migrate-legacy-equivalences-$(utc_timestamp).log"
readonly LOG_FILE

main 2>&1 | tee -a "${LOG_FILE}"
