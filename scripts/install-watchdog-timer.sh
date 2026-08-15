#!/usr/bin/env bash

# Instala el timer de autocuracion de LICS.
#
# Este script:
# - valida que se ejecute en Linux con systemd;
# - valida que el proyecto esté instalado en /opt/lics;
# - instala lics-watchdog.service y lics-watchdog.timer;
# - recarga systemd;
# - habilita el timer.
#
# Por que existe: el daemon de Docker (docker.service) a veces se reinicia
# por su cuenta dentro de WSL2 (causa todavia no confirmada). Cuando eso
# pasa, algunos contenedores con dependencias (como nginx, que espera a que
# backend y frontend esten saludables) no vuelven solos, porque ese
# reinicio crudo del daemon no respeta el "depends_on" de Docker Compose.
# Este timer corre start.sh cada 2 minutos, que si o si pasa por
# `docker compose up`, respetando ese orden, y reconcilia cualquier
# servicio que se haya quedado caido sin intervencion manual.

set -Eeuo pipefail

SERVICE_NAME="lics-watchdog.service"
TIMER_NAME="lics-watchdog.timer"
PROJECT_DIR="/opt/lics"

SOURCE_SERVICE_FILE="${PROJECT_DIR}/infra/systemd/${SERVICE_NAME}"
SOURCE_TIMER_FILE="${PROJECT_DIR}/infra/systemd/${TIMER_NAME}"

TARGET_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
TARGET_TIMER_FILE="/etc/systemd/system/${TIMER_NAME}"

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

    if [[ ! -f "${SOURCE_TIMER_FILE}" ]]; then
        die "No existe la unidad systemd: ${SOURCE_TIMER_FILE}"
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/start.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/start.sh"
    fi
}

install_units() {
    log_info "Instalando ${SERVICE_NAME} y ${TIMER_NAME}..."

    install -m 0644 "${SOURCE_SERVICE_FILE}" "${TARGET_SERVICE_FILE}"
    install -m 0644 "${SOURCE_TIMER_FILE}" "${TARGET_TIMER_FILE}"

    systemctl daemon-reload
    systemctl enable --now "${TIMER_NAME}"

    log_ok "Timer instalado y habilitado: ${TIMER_NAME}"
}

main() {
    require_root
    require_linux_systemd
    require_project_layout
    install_units

    log_info "El timer quedó habilitado e iniciado."
    log_info "Para ver próximas ejecuciones:"
    log_info "  systemctl list-timers ${TIMER_NAME} --no-pager"
}

main "$@"
