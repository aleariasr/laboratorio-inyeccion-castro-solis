# Proceso de actualización

## Objetivo

Permitir actualizaciones offline mediante paquetes versionados transportados por USB.

## Flujo requerido

1. Validar versión instalada.
2. Validar integridad del paquete.
3. Verificar espacio disponible.
4. Crear backup obligatorio.
5. Cargar las nuevas imágenes.
6. Ejecutar migraciones.
7. Levantar los servicios.
8. Esperar healthchecks.
9. Confirmar la actualización.
10. Ejecutar rollback automático o asistido si falla.

## Restricciones

- No copiar archivos manualmente sobre una instalación activa.
- No ejecutar migraciones sin backup.
- No reutilizar paquetes sin versión.
- No modificar el `.env` automáticamente sin validación.
- No eliminar la versión anterior hasta confirmar la nueva.

## Versionado

Las versiones usarán SemVer:

```text
MAJOR.MINOR.PATCH
```

Ejemplo:

```text
1.2.3
```
