#!/usr/bin/env bash

# Muestra el estado operativo del entorno productivo.
#
# Este script:
# - valida Docker y la configuración;
# - muestra versión y URL configuradas;
# - muestra estado, salud, imagen y tiempo de ejecución;
# - no revela secretos;
# - no modifica contenedores ni datos.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

container_id_all() {
    local service="$1"

    compose ps \
        --all \
        --quiet \
        "${service}"
}

container_runtime_status() {
    local container_id="$1"

    docker inspect \
        --format '{{.State.Status}}' \
        "${container_id}"
}

container_health_status() {
    local container_id="$1"

    docker inspect \
        --format '{{if ne .State.Status "running"}}n/a{{else if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' \
        "${container_id}"
}

container_image() {
    local container_id="$1"

    docker inspect \
        --format '{{.Config.Image}}' \
        "${container_id}"
}

container_started_at() {
    local container_id="$1"

    docker inspect \
        --format '{{.State.StartedAt}}' \
        "${container_id}"
}

print_service_status() {
    local service="$1"
    local container_id
    local runtime_status
    local health_status
    local image
    local started_at

    container_id="$(container_id_all "${service}")"

    if [[ -z "${container_id}" ]]; then
        printf '%-10s %-10s %-10s %-35s %s\n' \
            "${service}" \
            "missing" \
            "n/a" \
            "n/a" \
            "n/a"
        return
    fi

    runtime_status="$(container_runtime_status "${container_id}")"
    health_status="$(container_health_status "${container_id}")"
    image="$(container_image "${container_id}")"
    started_at="$(container_started_at "${container_id}")"

    printf '%-10s %-10s %-10s %-35s %s\n' \
        "${service}" \
        "${runtime_status}" \
        "${health_status}" \
        "${image}" \
        "${started_at}"
}

main() {
    local service

    validate_runtime

    printf '\n'
    printf 'Laboratorio de Inyección Castro Solís\n'
    printf '======================================\n'
    printf 'Versión: %s\n' "$(installed_version)"
    printf 'URL:     %s\n' "$(application_url)"
    printf '\n'

    printf '%-10s %-10s %-10s %-35s %s\n' \
        "SERVICIO" \
        "ESTADO" \
        "SALUD" \
        "IMAGEN" \
        "INICIADO"

    printf '%-10s %-10s %-10s %-35s %s\n' \
        "--------" \
        "------" \
        "-----" \
        "------" \
        "-------"

    for service in postgres backend frontend nginx; do
        print_service_status "${service}"
    done

    printf '\n'
    compose ps --all
}

main "$@"