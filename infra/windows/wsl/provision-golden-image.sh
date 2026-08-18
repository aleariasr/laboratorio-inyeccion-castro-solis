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
    # A proposito NO se salta si /opt/lics ya existe: reconstruir la imagen
    # dorada reutilizando una distro lics-build ya aprovisionada (en vez de
    # una fresca) es un caso real de uso, y antes esto dejaba silenciosamente
    # la version vieja de la app sin actualizar. cp -a sobreescribe los
    # archivos del release sin tocar lo que el release no incluye -- en
    # particular no toca infra/docker/.env.prod (el release solo trae
    # .env.prod.example; .env.prod es generado localmente por
    # generate_env_file, que ya tiene su propio chequeo de "no regenerar si
    # ya existe" mas abajo) ni los volumenes de Docker.
    log_info "Sincronizando aplicación en /opt/lics..."
    mkdir -p /opt/lics
    cp -a "${RELEASE_DIR}/app/." /opt/lics/
    chmod 750 /opt/lics/scripts/*.sh /opt/lics/scripts/lib/common.sh

    log_ok "Aplicación sincronizada (no se tocó .env.prod ni datos de PostgreSQL)."
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

create_initial_admin() {
    # No hay auto-registro en LICS a proposito (ver docs de seguridad): la
    # primera cuenta siempre fue un paso manual documentado. Esto lo
    # automatiza generando un administrador con contraseña aleatoria en
    # cada build de la imagen dorada, en vez de una contraseña fija
    # (evita el antipatron clasico de "admin/admin" en todas las
    # instalaciones). La contraseña queda en un archivo protegido dentro de
    # la propia imagen y tambien impresa en este log -- debe cambiarse en
    # el primer inicio de sesion. Idempotente: si el archivo ya existe, no
    # se crea otro administrador (ni se pisa la contraseña ya entregada).
    local compose_file="/opt/lics/infra/docker/compose.prod.yml"
    local env_file="/opt/lics/infra/docker/.env.prod"
    local creds_file="/opt/lics/ADMIN_CREDENTIALS_INICIALES.txt"
    local admin_password

    if [[ -f "${creds_file}" ]]; then
        log_ok "Ya existe un administrador inicial generado (${creds_file}), no se crea otro."
        return
    fi

    log_info "Creando administrador inicial..."

    admin_password="$(openssl rand -base64 24)"

    # "VAR=valor docker compose run ..." NO alcanza: eso exporta la variable
    # para el proceso "docker compose" en sí (el cliente CLI), no para el
    # contenedor que ese comando lanza -- "docker compose run" no reenvía
    # automáticamente el entorno del shell que lo invoca hacia adentro del
    # contenedor salvo que compose.prod.yml lo declare explícitamente en
    # "environment:" (no es el caso acá). Confirmado en validación real:
    # sin "-e", Django ni se entera de que existen esas variables y falla
    # con "You must use --username with --noinput." Con "-e VAR=valor" sí
    # quedan seteadas dentro del contenedor.
    docker compose --env-file "${env_file}" -f "${compose_file}" run --rm --no-deps \
        -e DJANGO_SUPERUSER_USERNAME=admin \
        -e DJANGO_SUPERUSER_EMAIL=admin@localhost \
        -e DJANGO_SUPERUSER_PASSWORD="${admin_password}" \
        backend \
        python src/manage.py createsuperuser --noinput

    cat > "${creds_file}" <<EOF
LICS - Administrador inicial, generado automáticamente al construir esta
imagen dorada.

Usuario: admin
Contraseña: ${admin_password}

IMPORTANTE: cambiar esta contraseña en el primer inicio de sesión (dentro
de la app), o crear un usuario administrador propio y desactivar este.
Todas las instalaciones hechas desde esta MISMA imagen dorada comparten
esta contraseña hasta que se cambie -- cada build nueva genera una
contraseña distinta.

Este archivo solo lo puede leer root. Para volver a verlo:
  wsl -d lics-wsl -- sudo cat /opt/lics/ADMIN_CREDENTIALS_INICIALES.txt
EOF
    chmod 600 "${creds_file}"

    log_ok "Administrador inicial creado."
    log_info "=================================================================="
    log_info " USUARIO INICIAL: admin"
    log_info " CONTRASEÑA INICIAL: ${admin_password}"
    log_info " Guardada tambien en ${creds_file} (0600, solo root)."
    log_info " CAMBIARLA en el primer inicio de sesion."
    log_info "=================================================================="
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
    create_initial_admin
    install_systemd_units
    disable_wsl_pro_service
    validate_start_and_health

    log_ok "Aprovisionamiento completado. build-golden-image.ps1 continúa con el export."
}

main "$@"
