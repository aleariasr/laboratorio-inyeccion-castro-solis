# LICS

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?logo=django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/DRF-3.16-A30000)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-Frontend-000000?logo=nextdotjs&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-Proxy-009639?logo=nginx&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-Offline%20Production-FCC624?logo=linux&logoColor=black)
![ReportLab](https://img.shields.io/badge/PDF-ReportLab-red)

Sistema de gestión empresarial local diseñado para operar completamente offline en una computadora dedicada.

LICS está orientado a producción real, no a prototipo académico. Las decisiones técnicas priorizan estabilidad, mantenibilidad, seguridad, respaldo de datos, recuperación ante fallos, soporte técnico y operación local sin conexión permanente a Internet.

---

# Estado del proyecto

Versión actual:

    0.2.0-alpha

Estado actual:

    Backend base cerrado.
    Infraestructura productiva base implementada.
    Frontend operativo pendiente.
    Validación con flujos reales pendiente.

El backend base ya incluye autenticación, usuarios, roles, permisos por módulo, inventario, compras, costos, ventas, clientes, inyectores, búsqueda universal, reportes JSON, endpoint administrativo de estado y generación inicial de documentos PDF con códigos de barras reales.

Documento principal de cierre:

- [Cierre de backend base](docs/backend-base-closure.md)

---

# Resumen funcional implementado

## Infraestructura

- Arquitectura basada en Docker Compose.
- Base de datos PostgreSQL 17.
- Backend desarrollado con Django y Django REST Framework.
- Backend productivo ejecutado mediante Gunicorn.
- Frontend desarrollado con Next.js.
- Frontend productivo preparado en modo standalone.
- Proxy inverso mediante Nginx.
- Configuración separada para desarrollo y producción.
- Instalación offline mediante paquetes versionados.
- Verificación de integridad mediante SHA-256.
- Healthchecks para los servicios principales.
- Scripts de instalación, inicio, parada, reinicio, estado, respaldo, restauración, actualización y rollback.
- Generación automatizada de secretos durante la instalación inicial.
- Backups verificables.
- Backups automáticos mediante systemd timer.
- Política básica de retención local.
- Restauración de prueba.
- Restauración productiva controlada.
- Actualización offline automatizada.
- Rollback productivo validado.
- Generación de paquetes offline.
- Imágenes Docker orientadas a `linux/amd64`.
- Arranque automático preparado mediante systemd.
- Modo kiosco preparado para estaciones gráficas Linux.

## Backend operativo

- Login, logout y usuario actual.
- Administración básica de usuarios.
- Roles base del sistema.
- Permisos por módulo.
- Usuario de solo lectura.
- Endpoint administrativo de estado.
- Ubicaciones físicas.
- Productos.
- Referencias o códigos alternos de producto.
- Proveedores.
- Referencias proveedor-producto.
- Compras.
- Confirmación y anulación de compras.
- Costos de importación.
- Resumen de costos por compra.
- Historial de costos append-only.
- Ventas.
- Confirmación y anulación de ventas.
- Validación de stock suficiente.
- Clientes.
- Inyectores.
- Accesorios de inyectores.
- Conteo físico.
- Ajustes auditables de inventario.
- Búsqueda universal.
- Reportes JSON.
- Documentos PDF iniciales.
- Etiquetas PDF con código de barras Code128 real.

---

# Arquitectura general

    Usuario
      |
      v
    Chromium en modo kiosco
      |
      v
    http://localhost
      |
      v
    Nginx
      |
      +--> Next.js
      |
      +--> Django REST Framework
              |
              v
          PostgreSQL

Todos los componentes se ejecutan como servicios independientes mediante Docker Compose.

En producción, solamente Nginx publica un puerto hacia el equipo anfitrión. PostgreSQL, backend y frontend permanecen dentro de la red interna de Docker.

Documentación relacionada:

- [Arquitectura del sistema](docs/architecture.md)
- [Estructura de instalación en producción](docs/production-layout.md)
- [Despliegue](docs/deployment.md)

---

# Tecnologías principales

| Área | Tecnología |
|---|---|
| Sistema operativo objetivo | Linux Mint XFCE / Ubuntu Desktop minimal |
| Contenedores | Docker Engine + Docker Compose |
| Backend | Python, Django, Django REST Framework |
| Servidor backend | Gunicorn |
| Frontend | Next.js, React, TypeScript |
| Base de datos | PostgreSQL 17 |
| Proxy local | Nginx |
| Documentos PDF | ReportLab |
| Interfaz final | Chromium en modo kiosco |
| Soporte técnico | SSH |
| Versionado | Git y GitHub |
| Distribución | Paquetes offline por USB |

---

# Arquitectura del repositorio

    backend/
        Código fuente del backend Django.

    frontend/
        Aplicación web desarrollada con Next.js.

    infra/
        Configuración de Docker, Nginx y componentes de infraestructura.

    scripts/
        Automatización de instalación, operación, respaldo, restauración, actualización y soporte.

    docs/
        Documentación técnica y operativa del proyecto.

    VERSION
        Versión actual del proyecto.

    CHANGELOG.md
        Historial de cambios.

---

# Entornos

## Desarrollo

El entorno de desarrollo está diseñado para ejecutarse desde una estación de trabajo compatible con Docker.

Requisitos:

- Docker Engine o Docker Desktop.
- Docker Compose.
- Git.
- Make.

Configuración inicial:

    cp infra/docker/.env.example infra/docker/.env

Inicio:

    make up

Administración:

    make ps
    make logs
    make restart
    make check
    make migrate
    make makemigrations
    make shell
    make test

## Producción

El entorno de producción está orientado a equipos Linux x86_64 utilizando un paquete offline previamente generado.

El proceso productivo utiliza:

- imágenes Docker versionadas;
- instalación automatizada;
- generación automática de secretos;
- configuración independiente de desarrollo;
- validaciones previas de instalación;
- comprobaciones automáticas de salud;
- respaldos automáticos;
- restauración controlada;
- actualización offline;
- rollback.

La instalación productiva no depende del repositorio Git ni de acceso a Internet para operar.

---

# Endpoints principales

## Sistema

    GET /api/health/
    GET /api/system/status/

## Cuentas

    POST /api/accounts/login/
    POST /api/accounts/logout/
    GET /api/accounts/me/
    GET /api/accounts/users/
    POST /api/accounts/users/
    GET /api/accounts/users/{id}/
    PATCH /api/accounts/users/{id}/

## Inventario y compras

    GET /api/inventory/locations/
    GET /api/inventory/products/
    GET /api/inventory/product-references/
    GET /api/inventory/suppliers/
    GET /api/inventory/supplier-products/
    GET /api/inventory/purchases/
    POST /api/inventory/purchases/{id}/confirm/
    POST /api/inventory/purchases/{id}/cancel/
    POST /api/inventory/purchases/{id}/calculate-costs/
    GET /api/inventory/purchases/{id}/cost-summary/
    GET /api/inventory/purchase-items/
    GET /api/inventory/import-cost-categories/
    GET /api/inventory/import-costs/
    GET /api/inventory/product-cost-history/
    GET /api/inventory/inventory-counts/
    POST /api/inventory/inventory-counts/{id}/approve/

## Ventas

    GET /api/sales/sales/
    POST /api/sales/sales/
    POST /api/sales/sales/{id}/confirm/
    POST /api/sales/sales/{id}/cancel/
    GET /api/sales/sale-items/
    POST /api/sales/sale-items/

## Clientes e inyectores

    GET /api/customers/customers/
    GET /api/customers/injectors/
    GET /api/customers/service-records/
    POST /api/customers/service-records/{id}/start/
    POST /api/customers/service-records/{id}/mark-ready/
    POST /api/customers/service-records/{id}/deliver/
    POST /api/customers/service-records/{id}/cancel/
    GET /api/customers/accessories/
    GET /api/customers/service-accessories/

## Búsqueda, reportes y documentos

    GET /api/search/?q=texto
    GET /api/reports/low-stock-products/
    GET /api/reports/stock-by-location/
    GET /api/reports/product-movements/?product=<id>
    GET /api/reports/purchases-by-supplier/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/sales-by-date/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/reports/top-selling-products/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    GET /api/documents/product-labels/?product=<id>&product=<id>

---

# Documentación

Índice general:

- [Índice de documentación](docs/index.md)

Documentos de estado:

- [Cierre de backend base](docs/backend-base-closure.md)
- [Cierre de infraestructura productiva base](docs/infrastructure-stage-closure.md)
- [Lista de preparación para producción](docs/production-readiness-checklist.md)
- [Roadmap](docs/roadmap.md)

Documentos técnicos:

- [Arquitectura del sistema](docs/architecture.md)
- [Modelo de datos](docs/data-model.md)
- [Dominio de inventario](docs/domain/inventory.md)
- [Estructura de instalación en producción](docs/production-layout.md)

Documentos operativos:

- [Desarrollo](docs/development.md)
- [Despliegue](docs/deployment.md)
- [Backups y restauración](docs/backup-restore.md)
- [Proceso de actualización](docs/update-process.md)
- [Seguridad](docs/security.md)
- [Solución de problemas](docs/troubleshooting.md)

---

# Estado de validación

Validación técnica del backend base:

    Django check: OK
    Migraciones pendientes: no
    Tests backend: 226 OK
    Build backend Docker: OK

El backend base queda cerrado como `0.2.0-alpha`.

---

# Pendientes principales

No se recomienda seguir agregando backend por adelantado sin validación real. Las siguientes fases recomendadas son:

1. Frontend operativo mínimo.
2. Validación de flujos reales con pantallas.
3. Ajustes del modelo según uso real.
4. Documentos PDF adicionales.
5. Migración DBF legacy con archivos reales.
6. Caja y procesos financieros si el levantamiento lo confirma.
7. Validación final sobre la estación gráfica objetivo.

---

# Filosofía de desarrollo

LICS debe mantenerse como software de producción real.

Reglas principales:

- No guardar secretos, contraseñas ni archivos `.env` en Git.
- No modificar producción sin respaldo previo.
- No editar stock directamente.
- No borrar físicamente operaciones críticas.
- No implementar funcionalidades por suposición.
- Documentar cambios importantes.
- Mantener separación clara entre desarrollo, staging local y producción.
- Validar recuperación ante fallos.
- Priorizar estabilidad sobre rapidez.
- Mantener scripts críticos idempotentes o con validación previa de estado.
- Usar PostgreSQL como base de datos de producción.
- Tratar cada actualización productiva como una operación crítica.

Este enfoque busca reducir el riesgo operativo y facilitar la evolución del sistema a largo plazo.
