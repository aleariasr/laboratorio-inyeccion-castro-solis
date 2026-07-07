#!/usr/bin/env bash

set -Eeuo pipefail

KIOSK_USER="${LICS_KIOSK_USER:-lics}"
PROJECT_DIR="/opt/lics"

log_info() { printf '[INFO] %s\n' "$*"; }
log_ok() { printf '[OK] %s\n' "$*"; }
log_error() { printf '[ERROR] %s\n' "$*" >&2; }

die() {
    log_error "$*"
    exit 1
}

require_root() {
    [[ "$(id -u)" -eq 0 ]] || die "Debe ejecutarse con sudo."
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Falta el comando requerido: $1"
}

require_project_layout() {
    [[ -d "${PROJECT_DIR}" ]] || die "No existe ${PROJECT_DIR}. Instale LICS primero."
    [[ -x "${PROJECT_DIR}/scripts/install-workstation.sh" ]] || die "Falta install-workstation.sh."
    [[ -x "${PROJECT_DIR}/scripts/install-kiosk.sh" ]] || die "Falta install-kiosk.sh."
    [[ -x "${PROJECT_DIR}/scripts/start-kiosk.sh" ]] || die "Falta start-kiosk.sh."
    [[ -x "${PROJECT_DIR}/scripts/wait-for-lics.sh" ]] || die "Falta wait-for-lics.sh."
}

create_kiosk_user() {
    if id "${KIOSK_USER}" >/dev/null 2>&1; then
        log_ok "Usuario ya existe: ${KIOSK_USER}"
        return
    fi

    log_info "Creando usuario operativo: ${KIOSK_USER}"

    useradd \
        --create-home \
        --shell /bin/bash \
        --user-group \
        "${KIOSK_USER}"

    log_ok "Usuario creado: ${KIOSK_USER}"
}

prepare_user_directories() {
    local home_dir

    home_dir="$(getent passwd "${KIOSK_USER}" | cut -d: -f6)"

    [[ -n "${home_dir}" ]] || die "No se pudo determinar HOME de ${KIOSK_USER}."

    mkdir -p \
        "${home_dir}/.config/systemd/user" \
        "${home_dir}/.config/chromium"

    chown -R "${KIOSK_USER}:${KIOSK_USER}" "${home_dir}/.config"

    log_ok "Directorios del usuario preparados."
}

install_user_kiosk_service() {
    local home_dir
    local target_dir

    home_dir="$(getent passwd "${KIOSK_USER}" | cut -d: -f6)"
    target_dir="${home_dir}/.config/systemd/user"

    install -m 0644 \
        "${PROJECT_DIR}/infra/systemd/lics-kiosk.service" \
        "${target_dir}/lics-kiosk.service"

    chown "${KIOSK_USER}:${KIOSK_USER}" "${target_dir}/lics-kiosk.service"

    log_ok "Servicio kiosk instalado para ${KIOSK_USER}."
}

enable_lingering() {
    loginctl enable-linger "${KIOSK_USER}"
    log_ok "Systemd user lingering habilitado para ${KIOSK_USER}."
}

print_result() {
    printf '\n'
    printf 'Usuario operativo configurado\n'
    printf '=============================\n'
    printf 'Usuario: %s\n' "${KIOSK_USER}"
    printf '\n'
    printf 'Siguiente etapa:\n'
    printf '  configurar autologin para este usuario\n'
    printf '\n'
    printf '[OK] Usuario operativo listo.\n'
}

main() {
    require_root
    require_command useradd
    require_command getent
    require_command cut
    require_command install
    require_command loginctl
    require_project_layout
    create_kiosk_user
    prepare_user_directories
    install_user_kiosk_service
    enable_lingering
    print_result
}

main "$@"
