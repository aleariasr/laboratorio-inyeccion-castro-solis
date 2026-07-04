# Backups y restauración

## Estado

Los scripts definitivos todavía no están implementados.

No debe considerarse el sistema listo para producción hasta completar y probar este proceso.

## Estrategia

Los respaldos de PostgreSQL serán respaldos lógicos creados con:

```text
pg_dump
```

No se respaldará la base de datos copiando directamente los archivos internos del volumen mientras PostgreSQL está activo.

## Requisitos del backup

Cada respaldo deberá incluir:

- fecha y hora;
- versión de la aplicación;
- archivo comprimido;
- checksum;
- resultado de validación;
- registro en logs.

## Retención inicial propuesta

- 7 respaldos diarios;
- 4 respaldos semanales;
- respaldos manuales antes de actualizaciones;
- copia periódica en un medio externo.

La política final debe acordarse con el cliente.

## Restauración

Toda restauración deberá:

1. detener operaciones;
2. validar el archivo;
3. crear un respaldo preventivo del estado actual;
4. restaurar en una base controlada;
5. ejecutar verificaciones;
6. registrar el resultado;
7. reanudar el servicio únicamente si todas las validaciones pasan.

## Regla crítica

Un backup no se considera válido hasta que haya sido restaurado exitosamente en una prueba controlada.
