#!/usr/bin/env bash

# Verifica la salud completa del entorno productivo.
#
# Comprueba:
# - Docker y Docker Compose;
# - configuración productiva;
# - existencia y salud de los cuatro servicios;
# - conectividad real con PostgreSQL;
# - endpoint de Nginx;
# - frontend;
# - backend y versión reportada;
# - archivos estáticos de Django;
# - espacio disponible en disco.
#
# Devuelve:
# - 0 si todas las comprobaciones pasan;
# - 1 si se detecta uno o más fallos.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

FAILURES=0
WARNINGS=0

check_ok() {
    printf '[OK] %s\n' "$*"
}

check_warning() {
    printf '[ADVERTENCIA] %s\n' "$*" >&2
    WARNINGS=$((WARNINGS + 1))
}

check_failed() {
    printf '[FALLO] %s\n' "$*" >&2
    FAILURES=$((FAILURES + 1))
}

check_service() {
    local service="$1"
    local status

    status="$(service_health_status "${service}")"

    if [[ "${status}" == "healthy" ]]; then
        check_ok "Servicio saludable: ${service}"
    else
        check_failed "Servicio ${service} en estado: ${status}"
    fi
}

check_postgres_connection() {
    if compose exec \
        --no-TTY \
        postgres \
        pg_isready \
        -U "$(env_value POSTGRES_USER)" \
        -d "$(env_value POSTGRES_DB)" \
        >/dev/null 2>&1
    then
        check_ok "PostgreSQL acepta conexiones."
    else
        check_failed "PostgreSQL no acepta conexiones."
    fi
}

check_http_endpoint() {
    local description="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local actual_status

    actual_status="$(
        curl \
            --silent \
            --show-error \
            --output /dev/null \
            --write-out '%{http_code}' \
            --max-time 10 \
            "${url}" \
            2>/dev/null || true
    )"

    if [[ "${actual_status}" == "${expected_status}" ]]; then
        check_ok "${description}: HTTP ${actual_status}"
    else
        check_failed \
            "${description}: se esperaba HTTP ${expected_status}, se obtuvo ${actual_status:-sin respuesta}"
    fi
}

check_backend_version() {
    local url
    local response
    local expected_version

    url="$(application_url)/api/health/"
    expected_version="$(installed_version)"

    response="$(
        curl \
            --fail \
            --silent \
            --show-error \
            --max-time 10 \
            "${url}" \
            2>/dev/null || true
    )"

    if [[ -z "${response}" ]]; then
        check_failed "No se pudo consultar la versión del backend."
        return
    fi

    if printf '%s' "${response}" \
        | grep -Fq "\"version\": \"${expected_version}\""
    then
        check_ok "Backend reporta la versión esperada: ${expected_version}"
    else
        check_failed \
            "La versión reportada por el backend no coincide con ${expected_version}"
    fi
}

check_disk_space() {
    local available_kb
    local minimum_kb
    local available_mb

    minimum_kb="${LICS_MIN_FREE_DISK_KB:-1048576}"

    available_kb="$(
        df -Pk "${PROJECT_ROOT}" \
            | awk 'NR == 2 {print $4}'
    )"

    if [[ ! "${available_kb}" =~ ^[0-9]+$ ]]; then
        check_warning "No fue posible determinar el espacio libre en disco."
        return
    fi

    available_mb=$((available_kb / 1024))

    if (( available_kb >= minimum_kb )); then
        check_ok "Espacio libre disponible: ${available_mb} MB"
    else
        check_failed \
            "Espacio libre insuficiente: ${available_mb} MB disponibles"
    fi
}

main() {
    local base_url
    local service

    printf 'Comprobación de salud del sistema\n'
    printf '=================================\n'

    if ! validate_runtime; then
        check_failed "La validación básica del entorno falló."
        return 1
    fi

    require_command curl

    base_url="$(application_url)"

    printf 'Versión esperada: %s\n' "$(installed_version)"
    printf 'URL: %s\n' "${base_url}"
    printf '\n'

    for service in postgres backend frontend nginx; do
        check_service "${service}"
    done

    check_postgres_connection

    check_http_endpoint \
        "Nginx" \
        "${base_url}/nginx-health" \
        "200"

    check_http_endpoint \
        "Frontend" \
        "${base_url}/" \
        "200"

    check_http_endpoint \
        "Backend" \
        "${base_url}/api/health/" \
        "200"

    check_http_endpoint \
        "Archivos estáticos de Django" \
        "${base_url}/static/admin/css/base.css" \
        "200"

    check_backend_version
    check_disk_space

    printf '\n'
    printf 'Fallos:       %s\n' "${FAILURES}"
    printf 'Advertencias: %s\n' "${WARNINGS}"

    if (( FAILURES > 0 )); then
        printf '[FALLO] El sistema no está completamente saludable.\n' >&2
        return 1
    fi

    printf '[OK] El sistema está completamente saludable.\n'
}

main "$@"