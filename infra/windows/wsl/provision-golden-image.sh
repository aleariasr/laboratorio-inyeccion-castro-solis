#!/usr/bin/env bash

# Aprovisiona, sin ninguna interacción humana, la distro WSL2 que se va a
# exportar como imagen dorada de LICS: instala Docker Engine, copia un
# release offline ya compilado, carga las imágenes, genera .env.prod, corre
# migraciones, instala lics.service y lics-backup.timer (SIN modificarlos) y
# valida start.sh/healthcheck.sh tal cual están.
#
# Corre como root (no crea un usuario operativo separado: esta distro es un
# "appliance" de un solo propósito, no una estación de trabajo interactiva).
# Lo invoca build-golden-image.ps1 automáticamente; también se puede correr
# a mano dentro de la distro:
#
#   sudo bash provision-golden-image.sh /ruta/al/release/lics-<version>-linux-amd64
#
# Requiere que systemd ya esté activo en la distro (build-golden-image.ps1
# ya se encarga de eso antes de llamar a este script).

set -Eeuo pipefail

RELEASE_DIR="${1:-}"

log_info() { printf '[INFO] %s\n' "$*"; }
log_ok() { printf '[OK] %s\n' "$*"; }
log_error() { printf '[ERROR] %s\n' "$*" >&2; }
die() { log_error "$*"; exit 1; }

require_root() {
    [[ "$(id -u)" -eq 0 ]] || die "Este script debe correr como root (sudo bash $0 ...)."
}

require_systemd_active() {
    [[ -d /run/systemd/system ]] || die "systemd no está activo en esta distro todavía."
    log_ok "systemd está activo."
}

require_release_dir() {
    [[ -n "${RELEASE_DIR}" ]] || die "Uso: $0 /ruta/al/release/lics-<version>-linux-amd64"
    [[ -d "${RELEASE_DIR}/app" ]] || die "No existe ${RELEASE_DIR}/app. ¿Es un release válido de build-offline-release.sh?"
    [[ -d "${RELEASE_DIR}/images" ]] || die "No existe ${RELEASE_DIR}/images."
    log_ok "Release encontrado: ${RELEASE_DIR}"
}

install_docker_engine() {
    # Ojo: "command -v docker" solo no alcanza. Si esta maquina Windows tiene
    # Docker Desktop instalado, puede inyectar un "docker" que en realidad
    # es un stub (o el binario de Windows reenviado por WSL) que imprime
    # "activate the WSL integration in Docker Desktop settings" en vez de
    # funcionar — command -v lo encuentra igual, y esta función daba por
    # buena una instalación que no existía. dpkg -s docker-ce solo da true
    # si el paquete real de Docker Engine quedó instalado por este mismo
    # script dentro de esta distro.
    if dpkg -s docker-ce >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
        log_ok "Docker Engine ya está instalado (docker-ce), se omite instalación."
        return
    fi

    log_info "Instalando Docker Engine (no Docker Desktop) dentro de la distro..."

    export DEBIAN_FRONTEND=noninteractive

    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable --now docker

    log_ok "Docker Engine instalado y habilitado como servicio systemd."
}

install_application() {
    if [[ -d /opt/lics ]]; then
        log_info "/opt/lics ya existe, se omite copia (borralo primero si querés reinstalar limpio)."
        return
    fi

    log_info "Copiando aplicación a /opt/lics..."
    mkdir -p /opt/lics
    cp -a "${RELEASE_DIR}/app/." /opt/lics/
    chmod 750 /opt/lics/scripts/*.sh /opt/lics/scripts/lib/common.sh

    log_ok "Aplicación copiada."
}

load_images() {
    local archive
    local count=0

    log_info "Cargando imágenes Docker offline..."

    for archive in "${RELEASE_DIR}"/images/*.tar; do
        [[ -e "${archive}" ]] || continue
        docker image load --input "${archive}"
        count=$((count + 1))
    done

    if (( count != 4 )); then
        die "Se esperaban 4 imágenes .tar y se cargaron ${count}."
    fi

    log_ok "4 imágenes cargadas."
}

generate_env_file() {
    local env_file="/opt/lics/infra/docker/.env.prod"
    local version

    if [[ -f "${env_file}" ]]; then
        log_ok ".env.prod ya existe, no se regenera."
        return
    fi

    version="$(tr -d '[:space:]' < /opt/lics/VERSION)"

    cp /opt/lics/infra/docker/.env.prod.example "${env_file}"

    sed -i "s|^LICS_VERSION=.*|LICS_VERSION=${version}|" "${env_file}"
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" "${env_file}"
    sed -i "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(openssl rand -hex 32)|" "${env_file}"

    chmod 600 "${env_file}"

    if grep -q 'REEMPLAZAR_' "${env_file}"; then
        die "${env_file} todavía contiene valores REEMPLAZAR_. Revisalo a mano."
    fi

    log_ok ".env.prod generado (versión ${version})."
}

run_initial_migrations() {
    local compose_file="/opt/lics/infra/docker/compose.prod.yml"
    local env_file="/opt/lics/infra/docker/.env.prod"
    local status=""

    if docker compose --env-file "${env_file}" -f "${compose_file}" exec -T postgres true 2>/dev/null; then
        log_ok "PostgreSQL ya estaba iniciado, se omite inicialización."
        return
    fi

    log_info "Iniciando PostgreSQL para migraciones iniciales..."
    docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-build --pull never postgres

    log_info "Esperando a que PostgreSQL esté saludable..."
    for _ in $(seq 1 60); do
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            "$(docker compose --env-file "${env_file}" -f "${compose_file}" ps -q postgres)" 2>/dev/null || true)"
        [[ "${status}" == "healthy" ]] && break
        sleep 2
    done
    [[ "${status}" == "healthy" ]] || die "PostgreSQL no quedó saludable a tiempo."

    log_info "Ejecutando migraciones..."
    docker compose --env-file "${env_file}" -f "${compose_file}" run --rm --no-deps backend \
        python src/manage.py migrate --noinput

    log_info "Creando roles base..."
    docker compose --env-file "${env_file}" -f "${compose_file}" run --rm --no-deps backend \
        python src/manage.py setup_roles

    log_ok "Migraciones iniciales completadas."
}

install_systemd_units() {
    log_info "Instalando lics.service, lics-backup.timer y lics-watchdog.timer (sin modificar)..."

    /opt/lics/scripts/install-systemd.sh
    /opt/lics/scripts/install-backup-timer.sh
    /opt/lics/scripts/install-watchdog-timer.sh

    log_ok "Unidades systemd instaladas y habilitadas."
}

disable_wsl_pro_service() {
    # wsl-pro.service (agente de Ubuntu Pro) viene habilitado por defecto en
    # las imagenes de Ubuntu para WSL y no lo usa LICS para nada. En una
    # maquina real entro en crash-loop cada ~2 segundos porque no puede
    # invocar interop hacia Windows (con appendWindowsPath=false en
    # wsl.conf), generando ruido constante en el journal. Se enmascara
    # siempre: es idempotente y no tiene efecto si el servicio ya no existe
    # en una imagen base futura.
    if ! command -v systemctl >/dev/null 2>&1; then
        return
    fi

    log_info "Deshabilitando wsl-pro.service (no lo usa LICS, causaba crash-loop)..."
    systemctl disable --now wsl-pro.service >/dev/null 2>&1 || true
    systemctl mask wsl-pro.service >/dev/null 2>&1 || true
    log_ok "wsl-pro.service enmascarado."
}

validate_start_and_health() {
    log_info "Validando start.sh tal cual está, sin modificaciones..."
    /opt/lics/scripts/start.sh

    log_info "Validando healthcheck.sh tal cual está..."
    /opt/lics/scripts/healthcheck.sh

    log_ok "start.sh y healthcheck.sh funcionan sin cambios dentro de WSL2."
}

main() {
    require_root
    require_systemd_active
    require_release_dir

    install_docker_engine
    install_application
    load_images
    generate_env_file
    run_initial_migrations
    install_systemd_units
    disable_wsl_pro_service
    validate_start_and_health

    log_ok "Aprovisionamiento completado. build-golden-image.ps1 continúa con el export."
}

main "$@"
