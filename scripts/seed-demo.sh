#!/usr/bin/env bash

# Llena la base de datos de DESARROLLO con datos de demostración
# (productos, compras, ventas, clientes, servicios, conteos y cierres
# de caja de unas 10 semanas) para tomar capturas del sistema.
#
# Uso:
#
#   ./scripts/seed-demo.sh            # base vacía: genera todo
#   ./scripts/seed-demo.sh --reset    # borra los datos de negocio y regenera
#   ./scripts/seed-demo.sh --reset --yes   # igual, sin pedir confirmación
#
# Requiere el entorno de desarrollo levantado (make up). Aplica las
# migraciones pendientes (no hace nada si ya están al día) y luego corre
# el comando `seed_demo_data`, que se niega a ejecutarse si DEBUG=False,
# así que no puede tocar producción.
#
# Los datos son ficticios. Al terminar imprime los usuarios demo y su
# contraseña. No borra usuarios existentes.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/infra/docker/compose.yml"

log_info() { printf '[INFO] %s\n' "$*"; }
log_ok() { printf '[OK] %s\n' "$*"; }
die() {
    printf '[ERROR] %s\n' "$*" >&2
    exit 1
}

command -v docker >/dev/null 2>&1 || die "Docker no está instalado o no está en el PATH."
[[ -f "${COMPOSE_FILE}" ]] || die "No se encontró ${COMPOSE_FILE}."

compose() {
    docker compose -f "${COMPOSE_FILE}" "$@"
}

if ! compose ps --status running --services 2>/dev/null | grep -qx backend; then
    die "El servicio 'backend' no está corriendo. Levantá el entorno primero con: make up"
fi

log_info "Aplicando migraciones pendientes (no hace nada si ya están al día)..."
compose exec backend python src/manage.py migrate --noinput

log_info "Generando datos de demostración..."
compose exec backend python src/manage.py seed_demo_data "$@"

printf '\n'
log_ok "Listo. Abrí el frontend e iniciá sesión con demo.admin para tomar las capturas."
