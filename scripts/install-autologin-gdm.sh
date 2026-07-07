#!/usr/bin/env bash

set -Eeuo pipefail

KIOSK_USER="${LICS_KIOSK_USER:-lics}"
GDM_CUSTOM_CONF="/etc/gdm3/custom.conf"

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

require_user() {
    id "${KIOSK_USER}" >/dev/null 2>&1 \
        || die "No existe el usuario kiosk: ${KIOSK_USER}"
}

require_gdm() {
    [[ -d /etc/gdm3 ]] \
        || die "No se encontró /etc/gdm3. Este script soporta Ubuntu Desktop con GDM."

    command -v gdm3 >/dev/null 2>&1 \
        || die "No se encontró gdm3."
}

backup_config() {
    if [[ -f "${GDM_CUSTOM_CONF}" ]]; then
        cp -a "${GDM_CUSTOM_CONF}" "${GDM_CUSTOM_CONF}.bak.$(date -u '+%Y%m%dT%H%M%SZ')"
    fi
}

write_config() {
    mkdir -p /etc/gdm3

    cat > "${GDM_CUSTOM_CONF}" <<EOF
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=${KIOSK_USER}

[security]

[xdmcp]

[chooser]

[debug]
EOF

    chmod 0644 "${GDM_CUSTOM_CONF}"

    log_ok "Autologin configurado para usuario: ${KIOSK_USER}"
}

main() {
    require_root
    require_user
    require_gdm
    backup_config
    write_config

    log_info "El autologin aplicará después de reiniciar."
}

main "$@"
