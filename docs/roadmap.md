# Roadmap del proyecto

## Principio general

No se implementarán módulos de negocio ni se definirá el modelo de datos definitivo hasta completar la infraestructura técnica y realizar el levantamiento de requerimientos reales del cliente.

---

## Fase 0: documentación y decisiones técnicas

Estado: completada.

Incluye:

- arquitectura acordada;
- plataforma objetivo;
- estrategia offline;
- separación de ambientes;
- criterios de seguridad;
- persistencia;
- estrategia de backup;
- estrategia de actualización.

---

## Fase 1: repositorio y estructura profesional

Estado: completada.

Incluye:

- repositorio GitHub;
- control de versiones;
- branches de trabajo;
- archivos ignorados;
- `VERSION`;
- documentación base;
- Dockerfiles;
- estructura de frontend, backend e infraestructura.

Pendiente administrativo:

- integrar `feat/production-runtime` en `main`;
- aplicar protección básica a `main`;
- trabajar mediante Pull Requests.

---

## Fase 2: runtime productivo con Docker Compose

Estado: completada.

Incluye:

- PostgreSQL;
- Django y Gunicorn;
- Next.js standalone;
- Nginx;
- redes internas;
- volúmenes;
- healthchecks;
- ejecución `linux/amd64`;
- políticas de reinicio;
- logs con rotación;
- usuarios no root donde corresponde.

---

## Fase 3: scripts operativos y recuperación

Estado: parcialmente completada.

Completado:

- `start.sh`;
- `stop.sh`;
- `restart.sh`;
- `status.sh`;
- `healthcheck.sh`;
- `backup.sh`;
- `verify-backup.sh`;
- `test-restore.sh`;
- `restore.sh`;
- backup preventivo;
- restore productivo probado;
- detección de corrupción.

Pendiente:

- backup automático;
- política de retención;
- copia a USB o disco externo;
- prueba de restauración periódica;
- logs propios de scripts;
- alertas locales de fallo.

---

## Fase 4: instalación y configuración del sistema operativo

Estado: en progreso.

Completado:

- preflight;
- release offline;
- imágenes amd64;
- manifiesto;
- checksums;
- instalador inicial;
- generación de secretos.

Pendiente:

1. probar instalación limpia en Linux x86_64;
2. corregir problemas detectados;
3. crear servicio systemd;
4. validar arranque tras reinicio;
5. configurar usuario operativo;
6. configurar Chromium kiosco;
7. configurar recuperación del kiosco;
8. configurar SSH;
9. configurar firewall;
10. desactivar servicios innecesarios;
11. configurar hora y zona horaria;
12. revisar política de actualizaciones del sistema operativo;
13. probar apagado inesperado;
14. documentar recuperación.

---

## Fase 5: actualización offline y rollback

Estado: pendiente.

Debe incluir:

- paquete de actualización versionado;
- validación SHA-256;
- verificación de versión origen y destino;
- backup obligatorio antes de actualizar;
- carga de imágenes nuevas;
- ejecución controlada de migraciones;
- healthcheck posterior;
- rollback de código;
- rollback de imágenes;
- restauración de base cuando corresponda;
- historial local de actualizaciones;
- bloqueo contra downgrade accidental;
- documentación para soporte.

---

## Fase 6: observabilidad y mantenimiento

Estado: pendiente.

Debe incluir:

- logs persistentes;
- rotación de logs;
- consulta simplificada;
- diagnóstico exportable;
- uso de disco;
- uso de memoria;
- estado de volúmenes;
- última fecha de backup;
- versión instalada;
- reporte de salud;
- herramienta de soporte;
- procedimiento de migración a otra computadora.

---

## Fase 7: seguridad de la instalación

Estado: pendiente.

Debe incluir:

- usuario sin privilegios para operación diaria;
- acceso administrativo separado;
- permisos de `/opt/lics`;
- permisos de backups;
- protección de `.env.prod`;
- firewall;
- SSH con llaves;
- bloqueo de contraseña cuando corresponda;
- revisión de puertos;
- copias externas cifradas si se requieren;
- documentación de recuperación de credenciales.

---

## Fase 8: base funcional independiente del negocio

Estado: pendiente.

Puede realizarse antes del levantamiento detallado porque no depende del modelo de negocio final.

Incluye:

- pantalla de inicio;
- login;
- logout;
- recuperación administrativa de acceso;
- usuarios;
- roles;
- permisos;
- configuración básica de empresa;
- pantalla de estado;
- versión instalada;
- auditoría técnica;
- zona horaria;
- moneda configurable;
- preferencias del sistema.

No debe incluir todavía inventario, ventas ni caja.

---

## Fase 9: levantamiento de requerimientos reales

Estado: pendiente.

Actividades:

- observar el trabajo del negocio;
- entrevistar a usuarios;
- documentar procesos actuales;
- identificar documentos utilizados;
- identificar excepciones;
- identificar responsables;
- identificar datos históricos;
- identificar necesidades de impresión;
- identificar reportes;
- identificar dispositivos;
- identificar procesos offline;
- validar terminología utilizada por el cliente;
- priorizar funcionalidades.

Entregables:

- catálogo de procesos;
- actores;
- historias de usuario;
- reglas de negocio;
- casos excepcionales;
- glosario;
- requerimientos funcionales;
- requerimientos no funcionales;
- criterios de aceptación;
- alcance aprobado.

---

## Fase 10: diseño del modelo de datos

Estado: bloqueada hasta completar requerimientos.

Debe incluir:

- entidades reales;
- relaciones;
- restricciones;
- claves;
- auditoría;
- historial;
- estados;
- movimientos;
- estrategia de borrado lógico;
- concurrencia;
- numeraciones;
- migraciones;
- datos iniciales;
- retención.

---

## Fase 11: módulos de negocio

Estado: no iniciado.

Posibles módulos, sujetos a validación:

- inventario;
- entradas y salidas;
- compras;
- ventas;
- caja;
- clientes;
- proveedores;
- productos;
- materiales;
- precios;
- costos;
- reportes.

No se considera aprobada ninguna de estas entidades hasta realizar el levantamiento.

---

## Fase 12: pruebas y entrega controlada

Estado: pendiente.

Incluye:

- pruebas unitarias;
- pruebas de integración;
- pruebas funcionales;
- pruebas de permisos;
- pruebas de carga razonable;
- pruebas de apagón;
- pruebas de corrupción;
- pruebas de backup;
- pruebas de restore;
- pruebas de actualización;
- pruebas de rollback;
- pruebas de migración;
- capacitación;
- manual de usuario;
- manual técnico;
- acta de entrega;
- plan de soporte.