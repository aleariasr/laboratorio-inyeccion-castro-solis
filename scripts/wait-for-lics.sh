#!/usr/bin/env bash

set -Eeuo pipefail

URL="${LICS_KIOSK_URL:-http://127.0.0.1:80}"
TIMEOUT_SECONDS="${LICS_KIOSK_WAIT_TIMEOUT_SECONDS:-180}"

start_time="$(date +%s)"

while true; do
    if curl \
        --silent \
        --show-error \
        --output /dev/null \
        --write-out '%{http_code}' \
        --max-time 5 \
        "${URL}/nginx-health" \
        2>/dev/null | grep -qx '200'
    then
        exit 0
    fi

    elapsed="$(($(date +%s) - start_time))"

    if (( elapsed >= TIMEOUT_SECONDS )); then
        printf '[ERROR] LICS no estuvo disponible en %s segundos: %s\n' \
            "${TIMEOUT_SECONDS}" \
            "${URL}" \
            >&2
        exit 1
    fi

    sleep 2
done
