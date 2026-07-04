#!/usr/bin/env bash

# Reinicia de forma controlada el entorno productivo.
#
# Este script reutiliza los procedimientos validados de detención y arranque.
#
# El reinicio:
# - conserva los datos y volúmenes;
# - no construye imágenes;
# - no descarga imágenes;
# - no ejecuta migraciones;
# - espera a que todos los servicios vuelvan a estar saludables.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

readonly SCRIPT_DIR

main() {
    printf '[INFO] Iniciando reinicio controlado del entorno productivo...\n'

    "${SCRIPT_DIR}/stop.sh"

    printf '[INFO] Los servicios fueron detenidos correctamente.\n'
    printf '[INFO] Iniciando nuevamente el entorno productivo...\n'

    "${SCRIPT_DIR}/start.sh"

    printf '[OK] Reinicio productivo completado correctamente.\n'
}

main "$@"