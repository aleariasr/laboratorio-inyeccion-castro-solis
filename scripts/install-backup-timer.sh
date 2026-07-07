#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="/opt/lics"

SERVICE_NAME="lics-backup.service"
TIMER_NAME="lics-backup.timer"

SOURCE_SERVICE_FILE="${PROJECT_DIR}/infra/systemd/${SERVICE_NAME}"
SOURCE_TIMER_FILE="${PROJECT_DIR}/infra/systemd/${TIMER_NAME}"

TARGET_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
TARGET_TIMER_FILE="/etc/systemd/system/${TIMER_NAME}"

TIMER_ON_CALENDAR="${LICS_BACKUP_TIMER_ON_CALENDAR:-*-*-* 03:00:00}"

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

require_systemd() {
    command -v systemctl >/dev/null 2>&1 \
        || die "No se encontró systemctl."

    [[ -d /run/systemd/system ]] \
        || die "systemd no parece estar activo."
}

require_project_layout() {
    [[ -d "${PROJECT_DIR}" ]] \
        || die "No existe ${PROJECT_DIR}."

    [[ -f "${SOURCE_SERVICE_FILE}" ]] \
        || die "No existe ${SOURCE_SERVICE_FILE}."

    [[ -f "${SOURCE_TIMER_FILE}" ]] \
        || die "No existe ${SOURCE_TIMER_FILE}."

    [[ -x "${PROJECT_DIR}/scripts/backup.sh" ]] \
        || die "No existe o no es ejecutable backup.sh."

    [[ -x "${PROJECT_DIR}/scripts/cleanup-backups.sh" ]] \
        || die "No existe o no es ejecutable cleanup-backups.sh."
}

install_units() {
    install -m 0644 "${SOURCE_SERVICE_FILE}" "${TARGET_SERVICE_FILE}"

    sed "s|^OnCalendar=.*|OnCalendar=${TIMER_ON_CALENDAR}|" \
        "${SOURCE_TIMER_FILE}" \
        > "${TARGET_TIMER_FILE}"

    chmod 0644 "${TARGET_TIMER_FILE}"

    systemctl daemon-reload
    systemctl enable "${TIMER_NAME}"

    log_ok "Timer instalado y habilitado: ${TIMER_NAME}"
    log_info "Calendario configurado: ${TIMER_ON_CALENDAR}"
}

main() {
    require_root
    require_systemd
    require_project_layout
    install_units

    log_info "Para iniciar el timer ahora:"
    log_info "  sudo systemctl start ${TIMER_NAME}"
    log_info "Para ver próximas ejecuciones:"
    log_info "  systemctl list-timers ${TIMER_NAME} --no-pager"
}

main "$@"
