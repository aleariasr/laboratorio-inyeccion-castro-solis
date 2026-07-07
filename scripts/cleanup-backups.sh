#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly SCRIPT_DIR

DAILY_KEEP="${LICS_BACKUP_KEEP_DAILY:-7}"
WEEKLY_KEEP="${LICS_BACKUP_KEEP_WEEKLY:-4}"
PRE_UPDATE_KEEP="${LICS_BACKUP_KEEP_PRE_UPDATE:-5}"
PRE_RESTORE_KEEP="${LICS_BACKUP_KEEP_PRE_RESTORE:-5}"

cleanup_type() {
    local type="$1"
    local keep="$2"

    find "${BACKUP_ROOT}" \
        -maxdepth 1 \
        -type d \
        -name "lics-*-${type}-*" \
        -print \
        | sort -r \
        | awk -v keep="${keep}" 'NR > keep' \
        | while IFS= read -r backup_dir; do
            [[ -n "${backup_dir}" ]] || continue
            log_info "Eliminando respaldo antiguo: ${backup_dir}"
            rm -rf "${backup_dir}"
        done
}

main() {
    validate_runtime
    ensure_private_directory "${BACKUP_ROOT}"

    cleanup_type "daily" "${DAILY_KEEP}"
    cleanup_type "weekly" "${WEEKLY_KEEP}"
    cleanup_type "pre-update" "${PRE_UPDATE_KEEP}"
    cleanup_type "pre-restore" "${PRE_RESTORE_KEEP}"

    log_ok "Limpieza de respaldos completada."
}

main "$@"
