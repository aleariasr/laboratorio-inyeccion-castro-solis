#!/usr/bin/env bash

# Inicia el entorno productivo usando exclusivamente imágenes locales.
#
# Este script:
# - valida Docker y Docker Compose;
# - valida el archivo de entorno;
# - valida la configuración productiva;
# - comprueba que todas las imágenes existen localmente;
# - inicia los servicios sin construir ni descargar imágenes;
# - espera a que todos los healthchecks sean satisfactorios.
#
# Este script no:
# - ejecuta migraciones;
# - construye imágenes;
# - descarga imágenes;
# - elimina contenedores;
# - elimina volúmenes;
# - modifica la base de datos.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

START_TIMEOUT_SECONDS="${LICS_START_TIMEOUT_SECONDS:-180}"

on_error() {
    local exit_code="$?"

    log_error "El arranque productivo no terminó correctamente."

    log_info "Estado actual de los servicios:"
    compose ps || true

    log_info "Últimos logs disponibles:"
    compose logs --tail=50 postgres backend frontend nginx || true

    exit "${exit_code}"
}

trap on_error ERR

main() {
    log_info "Validando entorno productivo..."
    validate_runtime

    log_info "Validando imágenes locales..."
    validate_required_images

    log_info "Versión configurada: $(installed_version)"
    log_info "URL configurada: $(application_url)"

    log_info "Iniciando servicios sin build y sin descargas..."

    compose up \
        --detach \
        --no-build \
        --pull never

    log_info "Esperando healthchecks..."

    if ! wait_for_all_services "${START_TIMEOUT_SECONDS}"; then
        return 1
    fi

    log_ok "Todos los servicios productivos están saludables."
    log_ok "Aplicación disponible en: $(application_url)"

    compose ps
}

main "$@"