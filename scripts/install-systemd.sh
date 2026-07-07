#!/usr/bin/env bash

# Instala el servicio systemd de LICS.
#
# Este script:
# - valida que se ejecute en Linux con systemd;
# - valida que el proyecto esté instalado en /opt/lics;
# - instala la unidad lics.service;
# - recarga systemd;
# - habilita el arranque automático.
#
# Este script no:
# - inicia la aplicación automáticamente;
# - modifica Docker Compose;
# - modifica la base de datos;
# - crea backups;
# - reemplaza archivos productivos fuera de systemd.

set -Eeuo pipefail

SERVICE_NAME="lics.service"
PROJECT_DIR="/opt/lics"
SOURCE_SERVICE_FILE="${PROJECT_DIR}/infra/systemd/${SERVICE_NAME}"
TARGET_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

log_info() {
    printf '[INFO] %s\n' "$*"
}

log_ok() {
    printf '[OK] %s\n' "$*"
}

log_error() {
    printf '[ERROR] %s\n' "$*" >&2
}

die() {
    log_error "$*"
    exit 1
}

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        die "Este script debe ejecutarse con sudo."
    fi
}

require_linux_systemd() {
    if [[ "$(uname -s)" != "Linux" ]]; then
        die "systemd solo se instala en Linux."
    fi

    if ! command -v systemctl >/dev/null 2>&1; then
        die "No se encontró systemctl. Este sistema no parece usar systemd."
    fi

    if [[ ! -d /run/systemd/system ]]; then
        die "systemd no parece estar activo en este sistema."
    fi
}

require_project_layout() {
    if [[ ! -d "${PROJECT_DIR}" ]]; then
        die "No existe ${PROJECT_DIR}. Instale primero el release productivo."
    fi

    if [[ ! -f "${SOURCE_SERVICE_FILE}" ]]; then
        die "No existe la unidad systemd: ${SOURCE_SERVICE_FILE}"
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/start.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/start.sh"
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/stop.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/stop.sh"
    fi
}

install_service() {
    log_info "Instalando ${SERVICE_NAME}..."

    install -m 0644 \
        "${SOURCE_SERVICE_FILE}" \
        "${TARGET_SERVICE_FILE}"

    systemctl daemon-reload
    systemctl enable --now "${SERVICE_NAME}"

    log_ok "Servicio instalado y habilitado: ${SERVICE_NAME}"
}

main() {
    require_root
    require_linux_systemd
    require_project_layout
    install_service

    log_info "El servicio quedó habilitado e iniciado."
    log_info "Para revisar estado:"
    log_info "  sudo systemctl status ${SERVICE_NAME} --no-pager"
}

main "$@"
