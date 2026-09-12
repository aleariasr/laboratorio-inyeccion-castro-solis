"""
Agrupa productos equivalentes detectados en REFPIE_03 (INVEN03) bajo un
mismo "código universal" (`standard_code`), según §3.6 del modelo de
datos, y preserva en `description` el valor crudo de la referencia
legacy de todo producto que la tenga, agrupe o no.

No crea, no borra y no modifica precios, costos, stock, movimientos ni
ubicaciones: solo reescribe `standard_code`, `variant_kind` y
`description` en filas Product que ya existen.

Fuente: LegacyStagingRecord (INVEN03) de una MigrationRun. No lee
archivos .DBF ni depende de rutas del sistema de archivos.

Reversible: LegacyRecordMap ya guarda (INVEN03, CODPIE_03) -> Product,
así que el código original de cada fila nunca se pierde y --rollback lo
devuelve sin necesidad de guardar estado nuevo.

Tope de tamaño de grupo: por defecto solo se aplican los grupos de 2.
Los grupos más grandes se forman por encadenamiento (A equivale a B, B
equivale a C) y en los datos reales del cliente ese encadenamiento une
piezas distintas — un rodillo suelto con un juego de rodillos, una punta
con una válvula. Se reportan pero NO se aplican; requieren criterio
humano. Ver --max-group-size.
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

# Líneas de description administradas por este comando. Se reescriben y
# se borran solo por prefijo, para no pisar nunca lo que haya escrito una
# persona en el resto del campo.
SHARED_CODE_PREFIX = "Código universal compartido: "
LEGACY_CODE_PREFIX = "Código legacy: "
RAW_REFERENCE_PREFIX = "Referencia legacy: "
OWN_LOCATION_PREFIX = "Ubicación propia: "

MANAGED_PREFIXES = (
    SHARED_CODE_PREFIX,
    LEGACY_CODE_PREFIX,
    RAW_REFERENCE_PREFIX,
    OWN_LOCATION_PREFIX,
)

DEFAULT_THRESHOLD = 0.55
DEFAULT_MAX_GROUP_SIZE = 2

# Un REFPIE_03 solo se acepta como clave de agrupación compartida si
# tiene forma de código: al menos un dígito, sin espacios. Sin esto,
# notas de texto libre como "TORNECA" (que es un proveedor) pegan
# productos sin relación dentro de un mismo grupo.
CODE_SHAPE = re.compile(r"^(?=.*\d)[A-Z0-9][A-Z0-9./-]{2,}$")


def is_code_shaped(value):
    return bool(CODE_SHAPE.match(value.upper()))


def location_code(product):
    if not product.storage_location_id:
        return None
    return product.storage_location.code


def real_locations(products):
    """
    Ubicaciones físicas de verdad del grupo. SINUB no cuenta: no es un
    estante, es la marca de "sin ubicar" que puso la migración anterior
    a los productos cuyo nombre legacy no traía ubicación detectable.
    """
    return sorted(
        {
            code
            for code in (location_code(product) for product in products)
            if code and code != SINUB_CODE
        }
    )


def unmanaged_lines(description):
    return [
        line
        for line in (description or "").splitlines()
        if not line.startswith(MANAGED_PREFIXES)
    ]


def has_managed_lines(description):
    return any(
        line.startswith(MANAGED_PREFIXES)
        for line in (description or "").splitlines()
    )


def shared_code_note(canonical, members):
    """
    Texto que deja constancia, en el propio producto, de qué se hizo:
    bajo qué código universal quedó agrupado y con qué otros códigos
    comparte esa familia. Determinista (miembros ordenados).
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
    raw_reference=None,
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
    if raw_reference:
        managed.append(f"{RAW_REFERENCE_PREFIX}{raw_reference}")
    if location_note:
        managed.append(f"{OWN_LOCATION_PREFIX}{location_note}")
    return "\n".join(managed + unmanaged_lines(description)).strip()


def without_notes(description):
    return "\n".join(unmanaged_lines(description)).strip()


def legacy_references(piezas_raw):
    """código legacy -> valor crudo de REFPIE_03 (solo los no vacíos)."""
    references = {}
    for key, row in piezas_raw.items():
        value = str(row.get("REFPIE_03") or "").strip()
        if value:
            references[key.strip()] = value
    return references


def build_equivalence_groups(piezas_raw, threshold=DEFAULT_THRESHOLD):
    """
    Devuelve ([(codigo_canonico, [codigos_del_grupo])], estadísticas).

    Dos mecanismos de enlace, los dos presentes en los datos reales:

      A) REFPIE_03 de X es igual al CODPIE_03 de Y. Es el 95% de los
         enlaces reales.
      C) dos productos comparten el mismo REFPIE_03 con forma de código
         que no es a su vez un código del catálogo.

    Cada arista se valida por separado comparando el nombre sin la
    ubicación. Validar por arista y no por grupo es lo que evita que el
    cierre transitivo pegue piezas sin relación a través de una cadena.
    Aun así el encadenamiento produce grupos grandes poco confiables:
    por eso el comando los excluye por defecto (ver --max-group-size).

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
        "mismo standard_code y preserva la referencia cruda en la "
        "descripción. No crea ni borra productos, no toca precios, "
        "stock ni ubicaciones. Idempotente y reversible."
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
                "original y limpia las notas que escribió este comando. "
                "Solo toca los productos que todavía las conservan."
            ),
        )
        parser.add_argument(
            "--threshold",
            type=float,
            default=DEFAULT_THRESHOLD,
            help=(
                "Umbral de parecido de nombre para aceptar una arista "
                f"(default {DEFAULT_THRESHOLD})."
            ),
        )
        parser.add_argument(
            "--max-group-size",
            type=int,
            default=DEFAULT_MAX_GROUP_SIZE,
            help=(
                "Tamaño máximo de grupo que se aplica (default "
                f"{DEFAULT_MAX_GROUP_SIZE}). Los grupos más grandes se "
                "forman por encadenamiento y no son confiables: se "
                "reportan y se excluyen. 0 desactiva el tope."
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

        max_group_size = options["max_group_size"]
        if max_group_size < 0:
            raise CommandError("--max-group-size no puede ser negativo.")

        all_groups, edge_stats = build_equivalence_groups(
            piezas_raw, options["threshold"]
        )
        if max_group_size:
            groups = [g for g in all_groups if len(g[1]) <= max_group_size]
            oversized = [g for g in all_groups if len(g[1]) > max_group_size]
        else:
            groups, oversized = all_groups, []

        references = legacy_references(piezas_raw)
        products_by_code = self._load_products()

        self._log_header(
            run, piezas_raw, all_groups, groups, oversized,
            edge_stats, references, products_by_code,
        )

        if options["rollback"]:
            self._rollback(products_by_code, options["dry_run"])
        else:
            self._apply(
                groups, oversized, references, products_by_code,
                options["dry_run"],
            )

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
        es lo que permite revertir sin guardar estado nuevo.
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

    def _desired_states(self, groups, references, products_by_code):
        """
        código legacy -> estado final esperado de su Product.

        Cubre dos poblaciones:

        - miembros de un grupo aplicable: cambian de standard_code, de
          variant_kind y reciben las notas del grupo;
        - cualquier otro producto con REFPIE_03 no vacío (incluidos los
          de grupos excluidos por tamaño): NO cambian de código ni de
          variante, y solo reciben la línea con la referencia cruda para
          que ese dato del legacy no se pierda.

        Todo se deriva del staging y de la ubicación actual de cada
        producto, nunca del orden de ejecución ni de corridas previas.
        """
        desired = {}
        grouped = set()

        for canonical, members in groups:
            if any(code not in products_by_code for code in members):
                continue

            products = {code: products_by_code[code] for code in members}
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

            for code in members:
                product = products[code]
                own_location = location_code(product)

                location_note = None
                if own_location == SINUB_CODE and locations:
                    # Pista accionable: la pieza equivalente sí está
                    # ubicada, así que es el primer lugar donde buscar.
                    if len(locations) == 1:
                        location = locations[0]
                        siblings = located_siblings[location]
                        quien = (
                            f"su equivalente {siblings[0]} está"
                            if len(siblings) == 1
                            else f"sus equivalentes {', '.join(siblings)} están"
                        )
                        location_note = (
                            f"{SINUB_CODE} (sin ubicar) — {quien} en "
                            f"{location}; candidato a ubicar ahí."
                        )
                    else:
                        location_note = (
                            f"{SINUB_CODE} (sin ubicar) — sus equivalentes "
                            f"están en {', '.join(locations)}; candidatos a "
                            f"revisar."
                        )
                elif split and own_location and own_location != SINUB_CODE:
                    location_note = (
                        f"{own_location} — este grupo de equivalentes "
                        f"comparte código pero está repartido en varias "
                        f"ubicaciones reales ({', '.join(locations)})."
                    )

                grouped.add(code)
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
                        raw_reference=references.get(code),
                        location_note=location_note,
                    ),
                }

        # A estos NO se les toca standard_code ni variant_kind: se
        # conserva lo que tengan. Consecuencia a tener presente: bajar
        # --max-group-size después de haber aplicado grupos grandes no
        # los desagrupa, porque este comando no le quita el código
        # canónico a nadie. Para volver atrás está --rollback.
        for code, reference in references.items():
            if code in grouped:
                continue
            product = products_by_code.get(code)
            if product is None:
                continue
            desired[code] = {
                "standard_code": product.standard_code,
                "variant_kind": product.variant_kind,
                "description": with_notes(
                    product.description,
                    raw_reference=reference,
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

    def _plan(self, groups, references, products_by_code):
        """
        Condición exacta de "ya aplicado", producto por producto: su
        Product ya está exactamente en el estado deseado (standard_code,
        variant_kind y description). Como el estado deseado se deriva
        solo del staging y de la ubicación actual, la condición es
        estable entre corridas: correr el comando dos veces seguidas
        deja el mismo estado, y una corrida cortada a la mitad retoma
        exactamente lo que faltaba.
        """
        desired = self._desired_states(groups, references, products_by_code)

        pending, done = {}, 0
        for code, want in desired.items():
            product = products_by_code[code]
            if self._matches(product, want):
                done += 1
            else:
                pending[code] = want

        incomplete = [
            (canonical, [c for c in members if c not in products_by_code])
            for canonical, members in groups
            if any(c not in products_by_code for c in members)
        ]

        pending_groups = [
            (canonical, members)
            for canonical, members in groups
            if any(code in pending for code in members)
            and all(code in products_by_code for code in members)
        ]

        return desired, pending, pending_groups, done, incomplete

    def _collisions(self, pending_groups, products_by_code):
        """
        Un producto ajeno al grupo que ya use el código canónico lo
        arrastraría a la familia de variantes. Bloquea antes de escribir.
        """
        found = []
        for canonical, members in pending_groups:
            owned = {products_by_code[code].pk for code in members}
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

    def _apply(self, groups, oversized, references, products_by_code, dry_run):
        desired, pending, pending_groups, done, incomplete = self._plan(
            groups, references, products_by_code
        )

        for canonical, missing in incomplete:
            self.stderr.write(
                f"  [saltado] grupo {canonical}: sin Product mapeado para "
                f"{', '.join(missing)}"
            )

        collisions = self._collisions(pending_groups, products_by_code)
        if collisions:
            for canonical, intruders in collisions:
                detail = ", ".join(f"#{p.pk} {p.name}" for p in intruders)
                self.stderr.write(f"  [colisión] {canonical} ya lo usa: {detail}")
            raise CommandError(
                f"{len(collisions)} códigos canónicos ya están en uso por "
                "productos ajenos a su grupo. No se escribió nada."
            )

        grouped_codes = {
            code for _canonical, members in groups for code in members
        }
        pending_grouped = sum(1 for code in pending if code in grouped_codes)
        pending_reference_only = len(pending) - pending_grouped
        split_groups = sum(
            1
            for _canonical, members in pending_groups
            if len(real_locations(products_by_code[c] for c in members)) > 1
        )
        hints = sum(
            1
            for _canonical, members in pending_groups
            if real_locations(products_by_code[c] for c in members)
            for code in members
            if location_code(products_by_code[code]) == SINUB_CODE
        )

        self.stdout.write(f"  productos ya en estado final:   {done}")
        self.stdout.write(f"  grupos a aplicar:               {len(pending_groups)}")
        self.stdout.write(f"  productos a actualizar:         {len(pending)}")
        self.stdout.write(f"     de esos, por agrupación:     {pending_grouped}")
        self.stdout.write(f"     de esos, solo referencia:    {pending_reference_only}")
        self.stdout.write(f"  grupos en varias ubicaciones:   {split_groups}")
        self.stdout.write(f"  productos SINUB con pista:      {hints}")
        self.stdout.write(
            f"  grupos excluidos por tamaño:    {len(oversized)}"
        )
        # Línea estable pensada para que un script la lea sin parsear
        # texto en prosa. No cambiar el formato sin revisar
        # scripts/migrate-legacy-equivalences.sh.
        self.stdout.write(
            f"RESULTADO grupos_pendientes={len(pending_groups)} "
            f"productos_pendientes={len(pending)} "
            f"grupos_excluidos={len(oversized)}"
        )

        for canonical, members in oversized[:10]:
            others = [code for code in members if code != canonical]
            self.stdout.write(
                f"    [excluido, {len(members)} miembros] {canonical} "
                f"<- {', '.join(others)}"
            )
        if len(oversized) > 10:
            self.stdout.write(
                f"    ... y {len(oversized) - 10} grupos excluidos más"
            )

        for canonical, members in pending_groups[:10]:
            others = [code for code in members if code != canonical]
            self.stdout.write(f"    {canonical} <- {', '.join(others)}")
        if len(pending_groups) > 10:
            self.stdout.write(
                f"    ... y {len(pending_groups) - 10} grupos más"
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING("  DRY RUN: no se escribió nada.")
            )
            return

        with transaction.atomic():
            for code, want in pending.items():
                product = products_by_code[code]
                product.standard_code = want["standard_code"]
                product.variant_kind = want["variant_kind"]
                product.description = want["description"]
                product.save()

        self.stdout.write(
            self.style.SUCCESS(f"  {len(pending)} productos actualizados.")
        )

    def _rollback(self, products_by_code, dry_run):
        """
        Revierte todo lo que escribió este comando, derivándolo solo de
        LegacyRecordMap: cada producto vuelve a su código legacy, a
        ORIGINAL y sin las líneas administradas.

        Solo se toca un producto si su descripción todavía conserva
        alguna de esas líneas. Si una persona las borró o reescribió la
        ficha, se deja como está.
        """
        to_revert = []

        for code, product in products_by_code.items():
            if not has_managed_lines(product.description):
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

    def _log_header(
        self, run, piezas_raw, all_groups, groups, oversized,
        edge_stats, references, products_by_code,
    ):
        self.stdout.write(f"MigrationRun #{run.pk}")
        self.stdout.write(f"  piezas en staging:      {len(piezas_raw)}")
        self.stdout.write(f"  con Product mapeado:    {len(products_by_code)}")
        self.stdout.write(f"  con REFPIE_03 no vacío: {len(references)}")
        self.stdout.write(
            f"  aristas candidatas:     {edge_stats['aristas_candidatas']}"
        )
        self.stdout.write(
            f"  aceptadas por nombre:   {edge_stats['aristas_aceptadas']}"
        )
        self.stdout.write(
            f"  descartadas:            {edge_stats['aristas_descartadas']}"
        )
        self.stdout.write(f"  grupos detectados:      {len(all_groups)}")
        self.stdout.write(f"     aplicables:          {len(groups)}")
        self.stdout.write(f"     excluidos por tamaño:{len(oversized)}")
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
