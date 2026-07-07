#!/usr/bin/env bash

set -Eeuo pipefail

URL="${LICS_KIOSK_URL:-http://127.0.0.1:80}"

find_chromium() {
    if command -v chromium >/dev/null 2>&1; then
        printf 'chromium\n'
        return
    fi

    if command -v chromium-browser >/dev/null 2>&1; then
        printf 'chromium-browser\n'
        return
    fi

    if command -v google-chrome >/dev/null 2>&1; then
        printf 'google-chrome\n'
        return
    fi

    printf '[ERROR] No se encontró Chromium ni Google Chrome.\n' >&2
    exit 1
}

BROWSER="$(find_chromium)"

exec "${BROWSER}" \
    --kiosk \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --overscroll-history-navigation=0 \
    "${URL}"
