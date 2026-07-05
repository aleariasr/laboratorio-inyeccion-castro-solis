#!/usr/bin/env bash

# Detiene de forma controlada el entorno productivo.
#
# Este script:
# - valida Docker y la configuración productiva;
# - detiene los servicios existentes;
# - conserva contenedores, redes, imágenes y volúmenes;
# - comprueba que ningún servicio siga en ejecución.
#
# Este script no:
# - ejecuta docker compose down;
# - elimina contenedores;
# - elimina redes;
# - elimina imágenes;
# - elimina volúmenes;
# - modifica la base de datos.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

STOP_TIMEOUT_SECONDS="${LICS_STOP_TIMEOUT_SECONDS:-60}"

service_runtime_status() {
    local service="$1"
    local container_id

    container_id="$(
        compose ps \
            --all \
            --quiet \
            "${service}"
    )"

    if [[ -z "${container_id}" ]]; then
        printf 'missing\n'
        return
    fi

    docker inspect \
        --format '{{.State.Status}}' \
        "${container_id}"
}

wait_for_service_stopped() {
    local service="$1"
    local timeout_seconds="${2:-60}"
    local start_time
    local current_time
    local elapsed
    local status

    start_time="$(date +%s)"

    while true; do
        status="$(service_runtime_status "${service}")"

        case "${status}" in
            exited|dead|missing)
                log_ok "Servicio detenido: ${service}"
                return 0
                ;;
        esac

        current_time="$(date +%s)"
        elapsed=$((current_time - start_time))

        if (( elapsed >= timeout_seconds )); then
            log_error \
                "El servicio ${service} no se detuvo en ${timeout_seconds} segundos. Estado: ${status}"
            return 1
        fi

        sleep 1
    done
}

main() {
    local service

    log_info "Validando entorno productivo..."
    validate_runtime

    log_info "Deteniendo servicios sin eliminar recursos..."

    compose stop \
        --timeout "${STOP_TIMEOUT_SECONDS}"

    for service in nginx frontend backend postgres; do
        wait_for_service_stopped \
            "${service}" \
            "${STOP_TIMEOUT_SECONDS}"
    done

    log_ok "Todos los servicios productivos están detenidos."
    log_ok "Los volúmenes y datos persistentes se conservaron."

    compose ps --all
}

main "$@"