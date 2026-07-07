#!/usr/bin/env bash

# Configura una estación gráfica para usar LICS en modo kiosco.
#
# Este script debe ejecutarse desde una sesión gráfica del usuario final.
#
# Uso:
#
#   ./scripts/install-workstation.sh
#
# No debe ejecutarse con sudo.
#
# Requiere que LICS ya esté instalado en /opt/lics.

set -Eeuo pipefail

PROJECT_DIR="/opt/lics"

log_info() {
    printf '[INFO] %s\n' "$*"
}

log_ok() {
    printf '[OK] %s\n' "$*"
}

log_warning() {
    printf '[ADVERTENCIA] %s\n' "$*" >&2
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
        die "Este script debe ejecutarse como usuario gráfico, no con sudo."
    fi
}

require_linux_systemd() {
    if [[ "$(uname -s)" != "Linux" ]]; then
        die "Este script solo aplica a Linux."
    fi

    require_command systemctl

    if [[ ! -d /run/systemd/system ]]; then
        die "systemd no parece estar activo."
    fi
}

require_graphical_session() {
    if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
        die "No se detectó sesión gráfica."
    fi
}

require_project_layout() {
    if [[ ! -d "${PROJECT_DIR}" ]]; then
        die "No existe ${PROJECT_DIR}. Instale LICS primero."
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/install-kiosk.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/install-kiosk.sh"
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/wait-for-lics.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/wait-for-lics.sh"
    fi

    if [[ ! -x "${PROJECT_DIR}/scripts/start-kiosk.sh" ]]; then
        die "No existe o no es ejecutable: ${PROJECT_DIR}/scripts/start-kiosk.sh"
    fi
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

    die "No se encontró Chromium ni Google Chrome. Instale Chromium antes de continuar."
}

disable_user_idle_features() {
    log_info "Intentando desactivar bloqueo y suspensión del usuario..."

    if command -v xfconf-query >/dev/null 2>&1; then
        xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/presentation-mode -s true 2>/dev/null || true
        xfconf-query -c xfce4-session -p /shutdown/LockScreen -s false 2>/dev/null || true
        log_ok "Preferencias XFCE aplicadas cuando estuvieron disponibles."
        return
    fi

    if command -v gsettings >/dev/null 2>&1; then
        gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true
        gsettings set org.gnome.desktop.screensaver lock-enabled false 2>/dev/null || true
        gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
        gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' 2>/dev/null || true
        log_ok "Preferencias GNOME aplicadas cuando estuvieron disponibles."
        return
    fi

    log_warning "No se encontró xfconf-query ni gsettings. Se omitió configuración de suspensión."
}

install_kiosk_service() {
    log_info "Instalando servicio kiosk del usuario..."

    "${PROJECT_DIR}/scripts/install-kiosk.sh"

    log_ok "Servicio kiosk instalado."
}

print_result() {
    printf '\n'
    printf 'Estación gráfica configurada\n'
    printf '============================\n'
    printf 'Usuario: %s\n' "$(id -un)"
    printf 'Proyecto: %s\n' "${PROJECT_DIR}"
    printf '\n'
    printf 'Comandos útiles:\n'
    printf '  systemctl --user status lics-kiosk.service --no-pager\n'
    printf '  systemctl --user restart lics-kiosk.service\n'
    printf '  systemctl --user stop lics-kiosk.service\n'
    printf '\n'
    printf '[OK] La estación quedó preparada para modo kiosco.\n'
}

main() {
    require_user_context
    require_linux_systemd
    require_graphical_session
    require_project_layout
    require_browser
    disable_user_idle_features
    install_kiosk_service
    print_result
}

main "$@"
