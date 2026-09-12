"""
Agrupa productos equivalentes detectados en REFPIE_03 (INVEN03)
asignándoles un mismo standard_code, según §3.6 del modelo de datos
(varias filas Product comparten "código universal" y representan
variantes distintas de la misma pieza, cada una con su propio precio,
costo y stock).

No crea, no borra y no modifica precios, stock, movimientos ni
ubicaciones: solo reescribe standard_code, variant_kind y description
en filas Product que ya existen.

Fuente: LegacyStagingRecord (INVEN03) de una MigrationRun. No lee
archivos .DBF ni depende de rutas del sistema de archivos.

Reversible: LegacyRecordMap ya guarda (INVEN03, CODPIE_03) -> Product,
así que el código original de cada fila nunca se pierde y --rollback
lo devuelve sin necesidad de guardar estado nuevo.
"""

import difflib
import re
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.inventory.models import Product, VariantKind
from apps.legacy_migration.location import resolve_locations
from apps.legacy_migration.management.commands.migrate_legacy_import import (
    SINUB_CODE,
)
from apps.legacy_migration.models import (
    LegacyRecordMap,
    MigrationRun,
    SourceTable,
)

TARGET_MODEL = "inventory.Product"

# Líneas de description administradas por este comando. Se reescriben
# y se borran solo por prefijo, para no pisar nunca lo que haya escrito
# una persona en el resto del campo.
SHARED_CODE_PREFIX = "Código universal compartido: "
LEGACY_CODE_PREFIX = "Código legacy: "
OWN_LOCATION_PREFIX = "Ubicación propia: "

DEFAULT_THRESHOLD = 0.55

# Un REFPIE_03 solo se acepta como clave de agrupación compartida si
# tiene forma de código: al menos un dígito, sin espacios. Sin esto,
# notas de texto libre como "TORNECA" (que es un proveedor) pegan
# productos sin relación dentro de un mismo grupo.
CODE_SHAPE = re.compile(r"^(?=.*\d)[A-Z0-9][A-Z0-9./-]{2,}$")


def is_code_shaped(value):
    return bool(CODE_SHAPE.match(value.upper()))


def _unmanaged_lines(description):
    return [
        line
        for line in (description or "").splitlines()
        if not line.startswith(SHARED_CODE_PREFIX)
        and not line.startswith(LEGACY_CODE_PREFIX)
        and not line.startswith(OWN_LOCATION_PREFIX)
    ]


def shared_code_note(canonical, members):
    """
    Texto que deja constancia, en el propio producto, de qué se hizo:
    bajo qué código universal quedó agrupado y con qué otros códigos
    comparte esa familia. Determinista (miembros ordenados), para que
    el resultado no cambie entre corridas.
    """
    equivalents = [code for code in sorted(members) if code != canonical]
    note = (
        f"{canonical} — agrupado como variante equivalente a partir de la "
        f"referencia del sistema legacy (REFPIE_03)"
    )
    if equivalents:
        note += f"; comparte código con: {', '.join(equivalents)}"
    return f"{note}."


def with_notes(
    description,
    shared_code_text=None,
    legacy_code=None,
    location_note=None,
):
    """
    Reescribe las líneas administradas conservando el resto del texto.
    Idempotente: aplicarla dos veces con los mismos argumentos deja
    exactamente el mismo resultado.
    """
    managed = []
    if shared_code_text:
        managed.append(f"{SHARED_CODE_PREFIX}{shared_code_text}")
    if legacy_code:
        managed.append(f"{LEGACY_CODE_PREFIX}{legacy_code}")
    if location_note:
        managed.append(f"{OWN_LOCATION_PREFIX}{location_note}")
    return "\n".join(managed + _unmanaged_lines(description)).strip()


def without_notes(description):
    return "\n".join(_unmanaged_lines(description)).strip()


def location_code(product):
    if not product.storage_location_id:
        return None
    return product.storage_location.code


def real_locations(products):
    """
    Ubicaciones físicas de verdad del grupo. SINUB no cuenta: no es un
    estante, es la marca de "sin ubicar" que puso la migración anterior
    a los productos cuyo nombre legacy no traía ubicación detectable.
    Tratarla como una ubicación más haría que un grupo perfectamente
    ubicado se reportara como "repartido".
    """
    return sorted(
        {
            code
            for code in (location_code(product) for product in products)
            if code and code != SINUB_CODE
        }
    )


def build_equivalence_groups(piezas_raw, threshold=DEFAULT_THRESHOLD):
    """
    Devuelve ([(codigo_canonico, [codigos_del_grupo])], estadísticas).

    Dos mecanismos de enlace, los dos presentes en el legacy real:

      A) REFPIE_03 de X es igual al CODPIE_03 de Y. Es el 95% de los
         enlaces reales.
      C) dos productos comparten el mismo REFPIE_03 con forma de código
         que no es a su vez un código del catálogo (el "código
         universal" compartido).

    Cada arista se valida por separado comparando el nombre sin la
    ubicación. Validar por arista y no por grupo es lo que evita que el
    cierre transitivo pegue piezas sin relación a través de una cadena.

    El resultado no depende del orden de ejecución: las aristas se
    evalúan de forma independiente, los componentes conexos son los
    mismos sea cual sea el orden de unión, y el canónico se deriva solo
    del conjunto de miembros.

    Canónico, en orden de desempate:
      1. el que más referencias entrantes recibe;
      2. el código más corto (el patrón real es G3S6 / KG3S6,
         105017-1790 / C105017-1790: el prefijo marca la fila derivada);
      3. alfabético.
    """
    codes = {key.strip(): row for key, row in piezas_raw.items()}

    resolutions = resolve_locations(
        {code: row["NOMPIE_03"] for code, row in codes.items()}
    )
    clean_names = {
        code: resolutions[code].clean_name.upper() for code in codes
    }
    refs = {
        code: str(row.get("REFPIE_03") or "").strip()
        for code, row in codes.items()
    }

    edges = []

    for code, ref in refs.items():
        if ref and ref != code and ref in codes:
            edges.append((code, ref))

    shared = defaultdict(list)
    for code, ref in refs.items():
        if ref and ref not in codes and is_code_shaped(ref):
            shared[ref].append(code)
    for members in shared.values():
        if len(members) < 2:
            continue
        members = sorted(members)
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                edges.append((members[i], members[j]))

    parent = {code: code for code in codes}

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    accepted = 0
    for left, right in edges:
        ratio = difflib.SequenceMatcher(
            None, clean_names[left], clean_names[right]
        ).ratio()
        if ratio < threshold:
            continue
        accepted += 1
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_left] = root_right

    components = defaultdict(list)
    for code in codes:
        components[find(code)].append(code)

    inbound = Counter(ref for ref in refs.values() if ref in codes)

    groups = []
    for members in components.values():
        if len(members) < 2:
            continue
        members = sorted(members)
        canonical = sorted(
            members,
            key=lambda code: (-inbound[code], len(code), code),
        )[0]
        groups.append((canonical, members))

    groups.sort(key=lambda group: group[0])

    return groups, {
        "aristas_candidatas": len(edges),
        "aristas_aceptadas": accepted,
        "aristas_descartadas": len(edges) - accepted,
    }


class Command(BaseCommand):
    help = (
        "Agrupa productos equivalentes del legacy (REFPIE_03) bajo un "
        "mismo standard_code. No crea ni borra productos, no toca "
        "precios, stock ni ubicaciones. Idempotente y reversible."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--run",
            type=int,
            help="ID de la MigrationRun a usar (default: la última).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Reporta qué haría sin escribir nada.",
        )
        parser.add_argument(
            "--rollback",
            action="store_true",
            help=(
                "Revierte: devuelve a cada producto su código legacy "
                "original y limpia las notas. Solo toca los que siguen "
                "exactamente como los dejó esta migración."
            ),
        )
        parser.add_argument(
            "--threshold",
            type=float,
            default=DEFAULT_THRESHOLD,
            help=(
                "Umbral de parecido de nombre para aceptar una arista "
                f"(default {DEFAULT_THRESHOLD}). Cambiarlo cambia los "
                "grupos, y por lo tanto lo que se considera ya migrado."
            ),
        )

    def handle(self, *args, **options):
        run = self._get_run(options.get("run"))

        piezas_raw = {
            record.source_key: record.raw_data
            for record in run.staging_records.filter(
                source_table=SourceTable.INVEN03,
            )
        }
        if not piezas_raw:
            raise CommandError(
                f"La MigrationRun #{run.pk} no tiene staging de INVEN03."
            )

        groups, edge_stats = build_equivalence_groups(
            piezas_raw, options["threshold"]
        )
        products_by_code = self._load_products()

        self._log_header(run, piezas_raw, groups, edge_stats, products_by_code)

        if options["rollback"]:
            self._rollback(groups, products_by_code, options["dry_run"])
        else:
            self._apply(groups, products_by_code, options["dry_run"])

        self._log_state("DESPUÉS")

    # ------------------------------------------------------------------
    # Carga
    # ------------------------------------------------------------------

    def _get_run(self, run_id):
        if run_id:
            try:
                return MigrationRun.objects.get(pk=run_id)
            except MigrationRun.DoesNotExist:
                raise CommandError(f"No existe la MigrationRun #{run_id}.")
        run = MigrationRun.objects.order_by("-created_at").first()
        if run is None:
            raise CommandError("No hay ninguna MigrationRun registrada.")
        return run

    def _load_products(self):
        """
        código legacy -> Product, vía LegacyRecordMap. Esa tabla es la
        única fuente de verdad de qué fila salió de qué código legacy, y
        es lo que permite revertir sin guardar estado nuevo en ningún
        lado.
        """
        target_ids = dict(
            LegacyRecordMap.objects.filter(
                source_table=SourceTable.INVEN03,
                target_model=TARGET_MODEL,
            ).values_list("source_key", "target_id")
        )
        products = (
            Product.objects
            .select_related("storage_location")
            .in_bulk(list(target_ids.values()))
        )
        return {
            code: products[target_id]
            for code, target_id in target_ids.items()
            if target_id in products
        }

    # ------------------------------------------------------------------
    # Estado deseado
    # ------------------------------------------------------------------

    def _desired_state(self, canonical, members, products):
        """
        Estado final de cada miembro del grupo. Se deriva solo del grupo
        y de la ubicación que ya tiene cada producto, nunca del orden ni
        de corridas anteriores.

        Cada producto del grupo deja constancia en su description de
        qué se hizo: bajo qué código universal quedó, cuál era su código
        legacy propio y, cuando aporta algo, una nota de ubicación — el
        aviso de grupo repartido si hay varias ubicaciones reales, o la
        pista de dónde buscarlo si este producto quedó en SINUB y su
        equivalente sí está ubicado. Todas esas líneas son buscables
        (`views/product.py` incluye description en la búsqueda por `q`).

        Las ubicaciones NO se tocan: si el grupo quedó repartido en
        varias, cada producto se queda donde dice el legacy y solo se
        anota.
        """
        locations = real_locations(products.values())
        split = len(locations) > 1
        shared_note = shared_code_note(canonical, members)

        located_siblings = {
            location: sorted(
                code
                for code in members
                if location_code(products[code]) == location
            )
            for location in locations
        }

        desired = {}
        for code in members:
            product = products[code]
            own_location = location_code(product)

            location_note = None

            if own_location == SINUB_CODE and locations:
                # Pista accionable: la pieza equivalente sí está ubicada,
                # así que es el primer lugar donde ir a buscar esta.
                if len(locations) == 1:
                    location = locations[0]
                    siblings = located_siblings[location]
                    quien = (
                        f"su equivalente {siblings[0]} está"
                        if len(siblings) == 1
                        else f"sus equivalentes {', '.join(siblings)} están"
                    )
                    location_note = (
                        f"{SINUB_CODE} (sin ubicar) — {quien} en {location}; "
                        f"candidato a ubicar ahí."
                    )
                else:
                    location_note = (
                        f"{SINUB_CODE} (sin ubicar) — sus equivalentes están "
                        f"en {', '.join(locations)}; candidatos a revisar."
                    )
            elif split and own_location and own_location != SINUB_CODE:
                location_note = (
                    f"{own_location} — este grupo de equivalentes comparte "
                    f"código pero está repartido en varias ubicaciones "
                    f"reales ({', '.join(locations)})."
                )

            desired[code] = {
                "standard_code": canonical,
                "variant_kind": (
                    VariantKind.ORIGINAL
                    if code == canonical
                    else VariantKind.OTHER
                ),
                "description": with_notes(
                    product.description,
                    shared_code_text=shared_note,
                    legacy_code=code,
                    location_note=location_note,
                ),
            }
        return desired

    @staticmethod
    def _matches(product, want):
        return (
            product.standard_code == want["standard_code"]
            and product.variant_kind == want["variant_kind"]
            and (product.description or "").strip() == want["description"]
        )

    # ------------------------------------------------------------------
    # Plan
    # ------------------------------------------------------------------

    def _plan(self, groups, products_by_code):
        """
        Condición exacta de "este grupo ya fue migrado", para un grupo G
        con canónico K:

            todos los Product mapeados desde los códigos de G ya están
            exactamente en el estado deseado (standard_code == K,
            variant_kind correcto y las líneas administradas de
            description tal cual)

        G, K y el estado deseado salen solo del contenido del staging y
        de la ubicación actual de cada producto, no del orden en que se
        procesaron los grupos antes ni de cuántas veces se corrió el
        comando. Por eso correrlo dos veces seguidas deja el mismo
        estado, y una corrida cortada a la mitad retoma exactamente los
        grupos que faltaban.
        """
        pending, already, incomplete = [], [], []

        for canonical, members in groups:
            missing = [code for code in members if code not in products_by_code]
            if missing:
                incomplete.append((canonical, missing))
                continue

            products = {code: products_by_code[code] for code in members}
            desired = self._desired_state(canonical, members, products)

            if all(
                self._matches(products[code], desired[code]) for code in members
            ):
                already.append(canonical)
                continue

            pending.append((canonical, members, products, desired))

        return pending, already, incomplete

    def _collisions(self, pending):
        """
        Un producto ajeno al grupo que ya use el código canónico lo
        arrastraría a la familia de variantes. Bloquea antes de escribir.
        """
        found = []
        for canonical, _members, products, _desired in pending:
            owned = {product.pk for product in products.values()}
            intruders = list(
                Product.objects
                .filter(standard_code=canonical)
                .exclude(pk__in=owned)
            )
            if intruders:
                found.append((canonical, intruders))
        return found

    # ------------------------------------------------------------------
    # Aplicar / revertir
    # ------------------------------------------------------------------

    def _apply(self, groups, products_by_code, dry_run):
        pending, already, incomplete = self._plan(groups, products_by_code)

        for canonical, missing in incomplete:
            self.stderr.write(
                f"  [saltado] grupo {canonical}: sin Product mapeado para "
                f"{', '.join(missing)}"
            )

        collisions = self._collisions(pending)
        if collisions:
            for canonical, intruders in collisions:
                detail = ", ".join(f"#{p.pk} {p.name}" for p in intruders)
                self.stderr.write(f"  [colisión] {canonical} ya lo usa: {detail}")
            raise CommandError(
                f"{len(collisions)} códigos canónicos ya están en uso por "
                "productos ajenos a su grupo. No se escribió nada."
            )

        changes = sum(
            1
            for _c, members, products, desired in pending
            for code in members
            if not self._matches(products[code], desired[code])
        )
        split_groups = sum(
            1
            for _c, _m, products, _d in pending
            if len(real_locations(products.values())) > 1
        )
        hints = sum(
            1
            for _c, members, products, _d in pending
            if real_locations(products.values())
            for code in members
            if location_code(products[code]) == SINUB_CODE
        )

        self.stdout.write(f"  grupos ya migrados (se saltan): {len(already)}")
        self.stdout.write(f"  grupos a migrar:                {len(pending)}")
        self.stdout.write(f"  productos a actualizar:         {changes}")
        self.stdout.write(
            f"  grupos en varias ubicaciones:   {split_groups}"
        )
        self.stdout.write(
            f"  productos SINUB con pista:      {hints}"
        )
        # Línea estable pensada para que un script la lea sin parsear
        # texto en prosa. No cambiar el formato sin revisar
        # scripts/migrate-legacy-equivalences.sh.
        self.stdout.write(
            f"RESULTADO grupos_pendientes={len(pending)} "
            f"productos_pendientes={changes} "
            f"grupos_ya_migrados={len(already)}"
        )

        for canonical, members, _products, _desired in pending[:10]:
            others = [code for code in members if code != canonical]
            self.stdout.write(f"    {canonical} <- {', '.join(others)}")
        if len(pending) > 10:
            self.stdout.write(f"    ... y {len(pending) - 10} grupos más")

        if dry_run:
            self.stdout.write(
                self.style.WARNING("  DRY RUN: no se escribió nada.")
            )
            return

        with transaction.atomic():
            written = 0
            for _canonical, members, products, desired in pending:
                for code in members:
                    product = products[code]
                    want = desired[code]
                    if self._matches(product, want):
                        continue
                    product.standard_code = want["standard_code"]
                    product.variant_kind = want["variant_kind"]
                    product.description = want["description"]
                    product.save()
                    written += 1

        self.stdout.write(
            self.style.SUCCESS(f"  {written} productos actualizados.")
        )

    def _rollback(self, groups, products_by_code, dry_run):
        """
        Solo revierte lo que sigue tal cual lo dejó esta migración: si
        alguien cambió el código a mano después, ese producto no se toca.
        """
        to_revert = []

        for canonical, members in groups:
            for code in members:
                product = products_by_code.get(code)
                if product is None:
                    continue
                if product.standard_code != canonical:
                    continue

                description = without_notes(product.description)
                if (
                    product.standard_code == code
                    and product.variant_kind == VariantKind.ORIGINAL
                    and (product.description or "").strip() == description
                ):
                    continue

                to_revert.append((product, code, description))

        self.stdout.write(f"  productos a revertir: {len(to_revert)}")
        self.stdout.write(
            f"RESULTADO productos_a_revertir={len(to_revert)}"
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING("  DRY RUN: no se escribió nada.")
            )
            return

        with transaction.atomic():
            for product, code, description in to_revert:
                product.standard_code = code
                product.variant_kind = VariantKind.ORIGINAL
                product.description = description
                product.save()

        self.stdout.write(
            self.style.SUCCESS(f"  {len(to_revert)} productos revertidos.")
        )

    # ------------------------------------------------------------------
    # Log
    # ------------------------------------------------------------------

    def _log_header(self, run, piezas_raw, groups, edge_stats, products_by_code):
        self.stdout.write(f"MigrationRun #{run.pk}")
        self.stdout.write(f"  piezas en staging:      {len(piezas_raw)}")
        self.stdout.write(f"  con Product mapeado:    {len(products_by_code)}")
        self.stdout.write(
            f"  aristas candidatas:     {edge_stats['aristas_candidatas']}"
        )
        self.stdout.write(
            f"  aceptadas por nombre:   {edge_stats['aristas_aceptadas']}"
        )
        self.stdout.write(
            f"  descartadas:            {edge_stats['aristas_descartadas']}"
        )
        self.stdout.write(f"  grupos detectados:      {len(groups)}")
        self.stdout.write(
            f"  productos involucrados: {sum(len(m) for _c, m in groups)}"
        )
        self._log_state("ANTES")

    def _log_state(self, label):
        total = Product.objects.count()
        distinct = Product.objects.values("standard_code").distinct().count()
        variants = (
            Product.objects
            .exclude(variant_kind=VariantKind.ORIGINAL)
            .count()
        )
        self.stdout.write(
            f"  [{label}] productos={total} "
            f"standard_code distintos={distinct} "
            f"variantes no-ORIGINAL={variants}"
        )
