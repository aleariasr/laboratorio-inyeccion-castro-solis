#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="/opt/lics"
SERVICE_NAME="lics-kiosk.service"
SOURCE_SERVICE_FILE="${PROJECT_DIR}/infra/systemd/${SERVICE_NAME}"

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

require_command() {
    local command_name="$1"

    command -v "${command_name}" >/dev/null 2>&1 \
        || die "Falta el comando requerido: ${command_name}"
}

require_user_context() {
    if [[ "$(id -u)" -eq 0 ]]; then
        die "Este script debe ejecutarse como el usuario gráfico, no con sudo."
    fi
}

require_graphical_environment() {
    if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
        die "No se detectó sesión gráfica. Ejecute esto desde el escritorio del usuario kiosk."
    fi
}

require_project_layout() {
    [[ -d "${PROJECT_DIR}" ]] \
        || die "No existe ${PROJECT_DIR}."

    [[ -f "${SOURCE_SERVICE_FILE}" ]] \
        || die "No existe ${SOURCE_SERVICE_FILE}."

    [[ -x "${PROJECT_DIR}/scripts/wait-for-lics.sh" ]] \
        || die "No existe o no es ejecutable wait-for-lics.sh."

    [[ -x "${PROJECT_DIR}/scripts/start-kiosk.sh" ]] \
        || die "No existe o no es ejecutable start-kiosk.sh."
}

require_browser() {
    if command -v chromium >/dev/null 2>&1; then
        return
    fi

    if command -v chromium-browser >/dev/null 2>&1; then
        return
    fi

    if command -v google-chrome >/dev/null 2>&1; then
        return
    fi

    die "Instale Chromium antes de activar el modo kiosco."
}

install_user_service() {
    local user_systemd_dir

    user_systemd_dir="${HOME}/.config/systemd/user"

    mkdir -p "${user_systemd_dir}"

    install -m 0644 \
        "${SOURCE_SERVICE_FILE}" \
        "${user_systemd_dir}/${SERVICE_NAME}"

    systemctl --user daemon-reload
    systemctl --user enable --now "${SERVICE_NAME}"

    log_ok "Servicio kiosk instalado y activo para el usuario: $(id -un)"
}

main() {
    require_user_context
    require_graphical_environment
    require_command systemctl
    require_command install
    require_project_layout
    require_browser
    install_user_service

    log_info "Estado:"
    log_info "  systemctl --user status ${SERVICE_NAME} --no-pager"
}

main "$@"
