# Cierre de etapa: infraestructura productiva base

> Nota histórica: este documento registra el cierre de la infraestructura productiva base. Después de este cierre, el proyecto avanzó y el backend base quedó cerrado en versión `0.2.0-alpha`. El estado funcional actualizado está documentado en [Cierre de backend base](backend-base-closure.md).

## 1. Propósito

Este documento registra el estado alcanzado en la infraestructura del sistema local para una instalación local de producción.

El sistema está diseñado para operar en una computadora dedicada dentro del negocio, sin depender permanentemente de Internet. La aplicación será utilizada desde un navegador Chromium en modo kiosco y se ejecutará localmente mediante Docker Compose.

Esta etapa se concentró exclusivamente en establecer una base técnica segura, repetible y mantenible. No se implementaron procesos de negocio, inventario, ventas, caja ni reportes, porque todavía no se han levantado los requerimientos reales del cliente.

## 2. Arquitectura definida

La arquitectura productiva acordada es:

- Sistema operativo: Linux Mint XFCE o Ubuntu Desktop minimal.
- Arquitectura objetivo: Linux x86_64/amd64.
- Contenedores: Docker Engine y Docker Compose v2.
- Backend: Django con Django REST Framework.
- Servidor de aplicación: Gunicorn.
- Frontend: Next.js en modo standalone.
- Base de datos: PostgreSQL 17.
- Proxy local: Nginx.
- Interfaz final: Chromium en modo kiosco.
- Acceso de soporte: SSH.
- Fuente de verdad: Git y GitHub.
- Producción offline: paquetes versionados transferidos mediante USB.
- Persistencia: volúmenes Docker independientes de los contenedores.
- Respaldo: dump lógico de PostgreSQL con checksums y restauración probada.

## 3. Entornos

Se mantiene separación entre:

### 3.1 Desarrollo

Usado en la computadora de desarrollo.

Características:

- ejecución local para programación;
- posibilidad de reconstruir imágenes;
- herramientas de desarrollo;
- configuración separada;
- no representa el entorno final del cliente.

### 3.2 Staging local

Usado para validar la configuración productiva antes de generar una entrega.

Características:

- imágenes productivas;
- configuración equivalente a producción;
- arquitectura `linux/amd64`;
- healthchecks;
- Nginx como único punto de entrada;
- validación de backup y restore.

### 3.3 Producción

Será instalado en la computadora del negocio.

Características:

- ejecución offline;
- imágenes precargadas desde un paquete USB;
- no realiza builds;
- no realiza pulls;
- no depende de GitHub;
- secretos locales fuera del repositorio;
- inicio automático pendiente de configurar con systemd;
- navegador kiosco pendiente de configurar.

## 4. Servicios productivos

El archivo principal de producción es:

```text
infra/docker/compose.prod.yml
```

El stack incluye cuatro servicios:

### PostgreSQL

Responsable de la persistencia principal del sistema.

Características:

- PostgreSQL 17;
- volumen persistente;
- healthcheck;
- reinicio automático mediante política Docker;
- sin exposición directa a la red externa;
- acceso únicamente desde la red interna de Docker.

### Backend

Aplicación Django ejecutada mediante Gunicorn.

Características:

- configuración de producción;
- usuario no root;
- endpoint de salud;
- archivos estáticos servidos mediante WhiteNoise;
- conexión interna con PostgreSQL;
- imagen versionada;
- healthcheck.

### Frontend

Aplicación Next.js construida en modo standalone.

Características:

- ejecución como usuario no root;
- imagen productiva multietapa;
- healthcheck;
- conexión interna mediante Nginx;
- sin exposición directa al equipo anfitrión.

### Nginx

Único punto de entrada local.

Rutas principales:

- `/` hacia Next.js;
- `/api/` hacia Django;
- `/admin/` hacia Django;
- `/static/` hacia Django;
- `/media/` hacia Django;
- `/nginx-health` para comprobación interna.

El puerto se enlaza únicamente a:

```text
127.0.0.1
```

Esto evita exponer accidentalmente la aplicación a toda la red local.

## 5. Configuración y secretos

La configuración productiva se almacena en:

```text
infra/docker/.env.prod
```

Este archivo:

- no se guarda en Git;
- se genera durante la instalación;
- tiene permisos restrictivos;
- contiene contraseñas y secretos locales;
- se basa en `infra/docker/.env.prod.example`.

Secretos principales:

- contraseña de PostgreSQL;
- `DJANGO_SECRET_KEY`;
- versión instalada;
- puerto HTTP local.

Los paquetes de release no incluyen `.env.prod`.

## 6. Versionado

La versión de la aplicación se centraliza en:

```text
VERSION
```

Versión actual:

```text
0.1.0-alpha
```

La versión es utilizada en:

- imágenes de backend;
- imágenes de frontend;
- endpoint de salud;
- backups;
- releases offline;
- validaciones de restauración;
- instalación.

## 7. Scripts operativos

### `scripts/start.sh`

Inicia la instalación productiva existente.

Garantías:

- valida configuración;
- valida Docker;
- valida imágenes locales;
- no construye imágenes;
- no descarga imágenes;
- espera los healthchecks;
- es idempotente.

### `scripts/stop.sh`

Detiene los servicios sin eliminar recursos.

Garantías:

- no ejecuta `docker compose down`;
- no elimina contenedores;
- no elimina redes;
- no elimina imágenes;
- no elimina volúmenes;
- puede ejecutarse más de una vez.

### `scripts/restart.sh`

Ejecuta una detención y un inicio controlados reutilizando los scripts existentes.

### `scripts/status.sh`

Muestra:

- versión;
- URL;
- estado de contenedores;
- estado de salud;
- imagen utilizada;
- fecha de inicio;
- salida de Docker Compose.

No modifica el sistema.

### `scripts/healthcheck.sh`

Comprueba:

- estado de PostgreSQL;
- estado del backend;
- estado del frontend;
- estado de Nginx;
- conexión real con PostgreSQL;
- endpoint de Nginx;
- endpoint del frontend;
- endpoint del backend;
- archivos estáticos;
- versión del backend;
- espacio libre.

Devuelve:

- código `0` cuando todo está saludable;
- código `1` cuando se detecta un fallo.

Fue probado deteniendo deliberadamente el frontend y detectó correctamente el problema.

## 8. Respaldo

### `scripts/backup.sh`

Crea respaldos lógicos mediante `pg_dump` en formato custom.

Cada respaldo contiene:

```text
database.dump
metadata.txt
SHA256SUMS
```

Características:

- directorios con permisos `700`;
- archivos con permisos `600`;
- checksum SHA-256;
- validación con `pg_restore --list`;
- creación temporal antes de publicar el backup;
- eliminación de backups incompletos;
- nombres versionados con fecha UTC.

Tipos soportados:

- `manual`;
- `daily`;
- `weekly`;
- `pre-update`;
- `pre-restore`.

Los backups están excluidos de Git.

## 9. Verificación de respaldos

### `scripts/verify-backup.sh`

Comprueba:

- presencia de archivos;
- legibilidad;
- archivos no vacíos;
- checksums;
- formato de `database.dump`;
- metadatos;
- versión;
- base de datos;
- tamaño declarado;
- checksum declarado.

La detección de corrupción fue probada alterando una copia temporal del dump. El script detectó:

- checksum incorrecto;
- tamaño incorrecto;
- diferencia con el checksum declarado;
- código de salida `1`.

## 10. Restauración de prueba

### `scripts/test-restore.sh`

Restaura un respaldo en una base temporal independiente.

Flujo:

1. valida el respaldo;
2. crea una base con nombre `lics_restore_test_*`;
3. restaura mediante `pg_restore`;
4. comprueba migraciones;
5. comprueba tablas;
6. comprueba tablas esenciales de Django;
7. elimina la base temporal.

Resultado validado:

- 18 migraciones restauradas;
- 10 tablas restauradas;
- tablas esenciales presentes;
- base temporal eliminada;
- base productiva sin modificaciones.

## 11. Restauración productiva

### `scripts/restore.sh`

Permite restaurar un respaldo sobre la base productiva.

Barreras de seguridad:

1. validación del entorno;
2. verificación integral del respaldo;
3. validación del nombre de base;
4. validación de versión;
5. confirmación interactiva desde `/dev/tty`;
6. backup preventivo `pre-restore`;
7. detención de Nginx, frontend y backend;
8. cierre de conexiones activas;
9. recreación únicamente de la base configurada;
10. restauración transaccional;
11. validación de migraciones y tablas;
12. reinicio del sistema;
13. healthcheck final.

La restauración productiva fue probada creando una tabla temporal después del backup. Tras restaurar:

- la tabla temporal desapareció;
- las 18 migraciones permanecieron;
- las 10 tablas esperadas fueron restauradas;
- todos los servicios quedaron saludables;
- el script devolvió código `0`.

También se comprobó que una confirmación incorrecta cancela la restauración sin modificar producción.

## 12. Imágenes productivas

Imágenes actuales:

```text
lics-backend:0.1.0-alpha
lics-frontend:0.1.0-alpha
nginx:1.28-alpine
postgres:17-alpine
```

Las cuatro variantes fueron validadas como:

```text
linux/amd64
```

Esto permite construir el release desde una Mac ARM y ejecutarlo posteriormente en una computadora x86_64.

## 13. Release offline

### `scripts/build-offline-release.sh`

Genera un paquete para entrega mediante USB.

Salida actual:

```text
release/lics-0.1.0-alpha-linux-amd64/
```

Contenido:

```text
app/
images/
manifest.txt
SHA256SUMS
VERSION
```

El paquete incluye:

- código versionado;
- instalador;
- scripts operativos;
- cuatro imágenes Docker exportadas;
- manifiesto;
- commit de Git;
- versión;
- plataforma objetivo;
- checksums de todos los archivos.

Tamaño aproximado de la versión actual:

```text
446 MB
```

El paquete:

- no contiene secretos;
- no contiene `.env.prod`;
- no contiene backups;
- no contiene dumps;
- está excluido del repositorio;
- fue verificado completamente mediante SHA-256.

## 14. Preflight de instalación

### `scripts/install-preflight.sh`

Evalúa si una computadora puede recibir el sistema.

Comprueba:

- Linux;
- arquitectura x86_64;
- systemd;
- memoria RAM;
- espacio libre;
- Docker CLI;
- Docker daemon;
- Docker Compose v2;
- comandos del sistema;
- archivos requeridos;
- versión;
- imágenes cargadas o archivos `.tar`;
- existencia de una instalación anterior.

El preflight fue probado en macOS y rechazó correctamente:

- Darwin;
- arquitectura ARM;
- ausencia de systemd;
- ausencia de `/proc/meminfo`.

## 15. Instalador offline

### `scripts/install.sh`

El instalador está incluido en el paquete release.

Comando previsto:

```bash
sudo ./app/scripts/install.sh
```

Flujo:

1. requiere privilegios administrativos;
2. verifica estructura del paquete;
3. verifica todos los checksums;
4. ejecuta el preflight;
5. comprueba que `/opt/lics` no exista;
6. carga las cuatro imágenes desde archivos `.tar`;
7. valida arquitectura `linux/amd64`;
8. copia la aplicación temporalmente;
9. genera secretos mediante OpenSSL;
10. crea `.env.prod`;
11. publica la instalación en `/opt/lics`;
12. inicia PostgreSQL;
13. espera su healthcheck;
14. ejecuta migraciones;
15. inicia el stack completo;
16. ejecuta el healthcheck final.

Estado actual:

El instalador offline fue probado correctamente en Ubuntu Server 26.04 LTS x86_64 sobre hardware real, usando un paquete offline versionado.

## 16. Pruebas realizadas

Se comprobaron exitosamente:

- build productivo de backend;
- build productivo de frontend;
- ejecución de imágenes amd64 en Mac ARM;
- healthchecks de cuatro servicios;
- rutas de Nginx;
- endpoint del backend;
- frontend HTTP 200;
- archivos estáticos HTTP 200;
- persistencia de PostgreSQL;
- reinicio controlado;
- detención idempotente;
- recuperación del frontend;
- detección de servicio detenido;
- creación de backup;
- verificación de backup;
- detección de corrupción;
- restauración temporal;
- eliminación de base temporal;
- cancelación de restore;
- backup preventivo;
- restore productivo;
- recuperación posterior;
- generación del paquete offline;
- checksum completo del release;
- ausencia de secretos en el release.

## 17. Riesgos y limitaciones actuales

Todavía no se debe entregar el sistema al cliente porque faltan:

- prueba del instalador en Linux x86_64 limpio;
- configuración de systemd;
- recuperación automática después de reiniciar el equipo;
- configuración de Chromium kiosco;
- configuración del usuario del sistema;
- SSH para soporte;
- firewall;
- backups automáticos;
- rotación y retención de backups;
- copia externa de backups;
- actualización offline;
- rollback de actualización;
- validación de paquetes de actualización;
- logs operativos;
- documentación de instalación;
- documentación de soporte;
- prueba de apagado inesperado;
- prueba de migración a otra computadora;
- levantamiento de requerimientos reales;
- autenticación y roles;
- funcionalidades de negocio.

## 18. Decisiones pendientes de requerimientos

No se definirán todavía:

- productos;
- materiales;
- inventario;
- existencias;
- entradas y salidas;
- ventas;
- facturación;
- clientes;
- proveedores;
- caja;
- cierres;
- cuentas por cobrar;
- reportes;
- unidades de medida;
- lotes;
- costos;
- precios;
- descuentos;
- impuestos;
- anulaciones;
- auditoría funcional.

Estas decisiones deben surgir del levantamiento de procesos reales del cliente.

## 19. Criterio de cierre de esta etapa

La etapa de infraestructura base se considera implementada en desarrollo y staging local.

Se considera pendiente de aprobación productiva hasta completar:

1. instalación limpia en Linux x86_64;
2. reinicio completo de la computadora;
3. arranque automático;
4. apertura automática del kiosco;
5. backup automático;
6. actualización offline;
7. rollback probado;
8. prueba de recuperación ante fallo.

## 20. Estado general

Estado actual:

```text
Infraestructura Docker:            completada
Operación básica:                  completada
Healthchecks:                      completados
Backup manual:                     completado
Verificación de backup:            completada
Restore de prueba:                 completado
Restore productivo:                completado y probado
Release offline:                   completado
Preflight de instalación:          completado
Instalador offline:                probado en Ubuntu Server 26.04 LTS x86_64
systemd:                           pendiente
Kiosco:                            pendiente
Backup automático:                 pendiente
Actualización offline:             pendiente
Rollback:                          pendiente
Hardening del sistema operativo:   pendiente
Requerimientos del cliente:        pendiente
Modelo de datos:                   pendiente
Módulos de negocio:                no iniciados
```

## Validación en Linux x86_64 real

Fecha de prueba: 2026-07-06 / 2026-07-07 UTC.

Entorno utilizado:

- Host: homeserver.
- Sistema operativo: Ubuntu Server 26.04 LTS.
- Arquitectura: x86_64.
- Docker Engine: 29.6.1.
- Docker Compose: 5.3.0.
- Instalación: `/opt/lics`.
- URL local: `http://127.0.0.1:80`.

Pruebas realizadas:

- verificación SHA-256 del paquete offline;
- ejecución de `install-preflight.sh`;
- instalación offline mediante `install.sh`;
- carga local de imágenes Docker;
- migraciones iniciales de Django;
- arranque de PostgreSQL, backend, frontend y Nginx;
- validación mediante `status.sh`;
- validación mediante `healthcheck.sh`;
- creación de backup manual;
- verificación de backup;
- restauración de prueba en base temporal;
- restauración productiva real con backup preventivo;
- parada controlada mediante `stop.sh`;
- arranque controlado mediante `start.sh`;
- reinicio controlado mediante `restart.sh`.

Resultado:

Todas las pruebas anteriores finalizaron correctamente.

## Estado posterior a este cierre

Después del cierre de infraestructura productiva base, el proyecto avanzó hasta cerrar el backend base en versión `0.2.0-alpha`.

El backend base actual incluye:

- autenticación;
- usuarios;
- roles;
- permisos por módulo;
- estado administrativo del sistema;
- inventario;
- compras;
- costos;
- ventas;
- clientes;
- inyectores;
- búsqueda universal;
- reportes JSON;
- documentos PDF iniciales;
- etiquetas con código de barras Code128 real.

Por lo tanto, este documento debe leerse como un registro histórico de la etapa de infraestructura, no como el estado funcional actual completo del proyecto.

## Documentación relacionada

- [README principal](../README.md)
- [Índice de documentación](index.md)
- [Cierre de backend base](backend-base-closure.md)
- [Roadmap](roadmap.md)
- [Lista de preparación para producción](production-readiness-checklist.md)
- [Despliegue](deployment.md)
