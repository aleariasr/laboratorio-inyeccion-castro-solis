#!/usr/bin/env bash

# Corre la migración completa de datos legacy DBF (proveedores, productos
# y compras) contra la base de datos de PRODUCCIÓN, en un solo comando.
#
# Uso:
#
#   ./scripts/migrate-legacy-dbf.sh <carpeta-con-los-dbf>
#
# <carpeta-con-los-dbf> debe tener esta forma (la misma que entregó el
# cliente):
#
#   carpeta/
#     INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF   <- copia "raíz"
#     bases1/
#       INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF <- copia "bases1" (principal)
#
# Si corrés esto en la app de escritorio Windows, la carpeta tiene que
# estar en un lugar visible desde WSL2 — por ejemplo copiala al disco
# C: y usá una ruta como /mnt/c/Users/<usuario>/invent.
#
# Qué hace, en orden:
#   1. Valida que estén los 8 archivos .DBF esperados.
#   2. Pide confirmación explícita (esto escribe datos reales de negocio).
#   3. Crea un respaldo completo de la base de datos ANTES de tocar nada
#      (scripts/backup.sh manual).
#   4. Copia los .DBF dentro del contenedor backend (no hace falta
#      montarlos de antemano).
#   5. Extracción + fusión de ambas copias (migrate_legacy_extract).
#   6. Validación (migrate_legacy_validate) — solo documenta inconsistencias.
#   7. Importación real (migrate_legacy_import) — usa los services reales
#      del sistema (confirm_purchase, adjust_stock), nunca inserta stock a
#      mano. Es idempotente: si el paso 6 o 7 fallan a mitad de camino,
#      podés volver a correr este mismo script sin duplicar nada.
#   8. Reporte final (migrate_legacy_report).
#
# Ver docs/dbf-migration-closure.md para el detalle completo de qué hace
# cada paso, qué se decidió sobre los datos legacy y por qué.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

LEGACY_ROOT_DIR="${1:-}"
CONTAINER_LEGACY_DIR="/tmp/lics-legacy-migration-$(utc_timestamp)"
readonly CONTAINER_LEGACY_DIR

usage() {
    cat <<'EOF'
Uso: ./scripts/migrate-legacy-dbf.sh <carpeta-con-los-dbf>

La carpeta debe tener esta forma (la misma que entregó el cliente):

  carpeta/
    INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF   <- copia "raíz"
    bases1/
      INVEN01.DBF  INVEN03.DBF  INVEN05.DBF  INVEN08.DBF <- copia "bases1"

Ver docs/dbf-migration-closure.md para el detalle completo.
EOF
}

validate_arguments() {
    if [[ -z "${LEGACY_ROOT_DIR}" ]]; then
        usage
        die "Falta la carpeta con los archivos DBF."
    fi

    if [[ ! -d "${LEGACY_ROOT_DIR}" ]]; then
        die "No existe la carpeta: ${LEGACY_ROOT_DIR}"
    fi

    if [[ ! -d "${LEGACY_ROOT_DIR}/bases1" ]]; then
        usage
        die "No existe ${LEGACY_ROOT_DIR}/bases1 — revisá la forma esperada de la carpeta."
    fi

    local filename
    for filename in INVEN01.DBF INVEN03.DBF INVEN05.DBF INVEN08.DBF; do
        require_file "${LEGACY_ROOT_DIR}/${filename}"
        require_file "${LEGACY_ROOT_DIR}/bases1/${filename}"
    done

    log_ok "Los 8 archivos DBF esperados están presentes."
}

confirm_before_writing_production_data() {
    log_warning "Esto va a IMPORTAR datos reales (proveedores, productos, compras y movimientos de stock) a la base de datos de PRODUCCIÓN."
    log_warning "Antes de tocar nada se va a crear un respaldo completo."
    printf '\n'
    read -r -p "¿Confirmás que querés continuar? Escribí 'si' para continuar: " confirmation
    printf '\n'

    if [[ "${confirmation}" != "si" ]]; then
        die "Cancelado por el usuario."
    fi
}

copy_dbf_files_into_backend() {
    log_info "Copiando archivos DBF dentro del contenedor backend..."

    compose exec --no-TTY backend mkdir -p "${CONTAINER_LEGACY_DIR}"
    compose cp "${LEGACY_ROOT_DIR}/bases1" "backend:${CONTAINER_LEGACY_DIR}/bases1"
    compose cp "${LEGACY_ROOT_DIR}" "backend:${CONTAINER_LEGACY_DIR}/raiz"

    log_ok "Archivos copiados."
}

cleanup_container_files() {
    compose exec --no-TTY backend rm -rf "${CONTAINER_LEGACY_DIR}" >/dev/null 2>&1 || true
}

run_migration_pipeline() {
    log_info "Paso 1/4: extracción y fusión de ambas copias..."
    compose exec backend python src/manage.py migrate_legacy_extract \
        --bases1 "${CONTAINER_LEGACY_DIR}/bases1" \
        --root "${CONTAINER_LEGACY_DIR}/raiz"

    log_info "Paso 2/4: validación (documenta inconsistencias, no toca datos de negocio)..."
    compose exec backend python src/manage.py migrate_legacy_validate

    log_info "Paso 3/4: importación real (proveedores, productos, compras, stock)..."
    compose exec backend python src/manage.py migrate_legacy_import

    log_info "Paso 4/4: reporte final..."
    compose exec backend python src/manage.py migrate_legacy_report
}

main() {
    validate_arguments

    log_info "Validando entorno productivo..."
    validate_runtime
    wait_for_service backend 60
    wait_for_service postgres 60

    confirm_before_writing_production_data

    log_info "Creando respaldo de la base de datos antes de migrar..."
    "${SCRIPT_DIR}/backup.sh" manual

    copy_dbf_files_into_backend
    trap cleanup_container_files EXIT

    run_migration_pipeline

    printf '\n'
    log_ok "Migración legacy DBF completa. Revisá el reporte de arriba."
    log_info "Si algo salió mal a mitad de camino, correr este mismo script de nuevo es seguro: no duplica lo ya importado."
    log_info "Detalle completo de qué se decidió y por qué: docs/dbf-migration-closure.md"
}

main "$@"
