import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction

from apps.inventory.exceptions import InventoryError
from apps.inventory.models import (
    Currency,
    Product,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    StorageLocation,
    Supplier,
    SupplierProduct,
)
from apps.inventory.selectors import current_stock
from apps.inventory.services import adjust_stock, confirm_purchase
from apps.legacy_migration.location import resolve_locations
from apps.legacy_migration.models import (
    LegacyRecordMap,
    MigrationIssue,
    MigrationIssueCategory,
    MigrationIssueSeverity,
    MigrationRun,
    SourceTable,
)

SINUB_CODE = "SINUB"
SINUB_DESCRIPTION = "Productos migrados del sistema legacy sin ubicación detectable — pendientes de ubicar físicamente."

BUGGY_YEAR_THRESHOLD = 1950

# Líneas de compra que la validación ya marcó como no importables.
SKIP_CATEGORIES = {
    MigrationIssueCategory.PRODUCTO_HUERFANO,
    MigrationIssueCategory.PROVEEDOR_FALTANTE,
    MigrationIssueCategory.MONTO_INVALIDO,
    MigrationIssueCategory.FECHA_INVALIDA,
}


class Command(BaseCommand):
    help = (
        "Normaliza e importa el staging de una MigrationRun hacia el "
        "modelo real (Supplier, Product, StorageLocation, Purchase, "
        "PurchaseItem, StockMovement), usando los services existentes "
        "y sin bypasear ninguna regla de negocio. Idempotente: se puede "
        "volver a correr sin duplicar lo ya importado."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--run",
            type=int,
            help="ID de la MigrationRun a importar (default: la última).",
        )

    def handle(self, *args, **options):
        run = self._get_run(options.get("run"))

        proveedores_raw = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN01)
        }
        piezas_raw = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN03)
        }
        stock_raw = {
            r.source_key: r.raw_data
            for r in run.staging_records.filter(source_table=SourceTable.INVEN08)
        }
        compras_records = list(run.staging_records.filter(source_table=SourceTable.INVEN05))

        skip_keys = set(
            run.issues.filter(
                source_table=SourceTable.INVEN05,
                category__in=SKIP_CATEGORIES,
            ).values_list("source_key", flat=True)
        )

        with transaction.atomic():
            suppliers = self._import_suppliers(run, proveedores_raw)
            products = self._import_products(run, piezas_raw)

        purchase_summary = self._import_purchases(
            run, suppliers, products, compras_records, skip_keys
        )

        reconciliation_summary = self._reconcile_stock(run, products, stock_raw)

        run.summary = {
            **run.summary,
            "importacion": {
                "proveedores": len(suppliers),
                "productos": len(products),
                **purchase_summary,
                **reconciliation_summary,
            },
        }
        run.save(update_fields=["summary"])

        self.stdout.write(self.style.SUCCESS(f"Importación de MigrationRun #{run.pk} completa."))
        self.stdout.write(str(run.summary["importacion"]))

    def _get_run(self, run_id):
        if run_id:
            try:
                return MigrationRun.objects.get(pk=run_id)
            except MigrationRun.DoesNotExist:
                raise CommandError(f"No existe MigrationRun #{run_id}")
        run = MigrationRun.objects.order_by("-created_at").first()
        if run is None:
            raise CommandError("No hay ninguna MigrationRun. Corré primero migrate_legacy_extract.")
        return run

    # ------------------------------------------------------------------
    # Proveedores
    # ------------------------------------------------------------------

    def _import_suppliers(self, run, proveedores_raw):
        suppliers = {}
        for key, row in proveedores_raw.items():
            suppliers[key] = self._get_or_create_supplier(run, key, row["NOMPRO_01"])
        return suppliers

    def _get_or_create_supplier(self, run, key, name):
        existing_map = LegacyRecordMap.objects.filter(
            source_table=SourceTable.INVEN01,
            source_key=key,
            target_model="inventory.Supplier",
        ).first()
        if existing_map:
            return Supplier.objects.get(pk=existing_map.target_id)

        normalized_name = name.strip().upper()
        supplier = Supplier.objects.filter(name=normalized_name).first()
        if supplier is None:
            supplier = Supplier.objects.create(name=name, created_by=None, updated_by=None)
        else:
            MigrationIssue.objects.create(
                run=run,
                severity=MigrationIssueSeverity.WARNING,
                category=MigrationIssueCategory.CODIGO_DUPLICADO,
                source_table=SourceTable.INVEN01,
                source_key=key,
                message=(
                    f"El proveedor '{name}' ya existe (creado desde otro código legacy "
                    "o ya presente en el sistema) — se reutiliza el mismo Supplier."
                ),
                context={"nombre_normalizado": normalized_name},
            )

        LegacyRecordMap.objects.create(
            run=run,
            source_table=SourceTable.INVEN01,
            source_key=key,
            target_model="inventory.Supplier",
            target_id=supplier.pk,
        )
        return supplier

    # ------------------------------------------------------------------
    # Piezas / productos
    # ------------------------------------------------------------------

    def _import_products(self, run, piezas_raw):
        names_by_key = {key: row["NOMPIE_03"] for key, row in piezas_raw.items()}
        resolutions = resolve_locations(names_by_key)

        sinub, _ = StorageLocation.objects.get_or_create(
            code=SINUB_CODE,
            defaults={"description": SINUB_DESCRIPTION, "created_by": None, "updated_by": None},
        )
        location_cache = {SINUB_CODE: sinub}

        products = {}
        for key, row in piezas_raw.items():
            products[key] = self._get_or_create_product(
                run, key, row, resolutions[key], location_cache
            )
        return products

    def _get_or_create_product(self, run, key, row, resolution, location_cache):
        existing_map = LegacyRecordMap.objects.filter(
            source_table=SourceTable.INVEN03,
            source_key=key,
            target_model="inventory.Product",
        ).first()
        if existing_map:
            return Product.objects.get(pk=existing_map.target_id)

        location_code = resolution.location_code or SINUB_CODE
        location = location_cache.get(location_code)
        if location is None:
            location, _ = StorageLocation.objects.get_or_create(
                code=location_code,
                defaults={"created_by": None, "updated_by": None},
            )
            location_cache[location_code] = location

        sale_price = row.get("PREVEN_03")
        custom_sale_price = (
            Decimal(str(sale_price)) if sale_price and sale_price > 0 else None
        )

        product = Product.objects.create(
            standard_code=row["CODPIE_03"].strip(),
            name=resolution.clean_name[:150],
            storage_location=location,
            minimum_stock=max(int(row.get("CANMIN_03") or 0), 0),
            custom_sale_price=custom_sale_price,
            created_by=None,
            updated_by=None,
        )

        LegacyRecordMap.objects.create(
            run=run,
            source_table=SourceTable.INVEN03,
            source_key=key,
            target_model="inventory.Product",
            target_id=product.pk,
        )
        return product

    # ------------------------------------------------------------------
    # Compras
    # ------------------------------------------------------------------

    def _import_purchases(self, run, suppliers, products, compras_records, skip_keys):
        groups: dict[tuple[str, str], list] = {}
        for record in compras_records:
            row = record.raw_data
            group_key = (str(row["CODPRO_05"]), str(row["NUMFAC_05"]))
            groups.setdefault(group_key, []).append(record)

        purchases_created = 0
        items_created = 0
        purchases_skipped_empty = 0
        lines_skipped = 0
        lines_zero_cost_skipped = 0

        for (codpro, numfac), records in groups.items():
            supplier = suppliers.get(codpro)
            if supplier is None:
                # El proveedor no existe: ya está documentado por cada
                # línea en la validación (PROVEEDOR_FALTANTE).
                lines_skipped += len(records)
                continue

            purchase_group_key = f"{codpro}:{numfac}"
            existing_map = LegacyRecordMap.objects.filter(
                source_table=SourceTable.INVEN05,
                source_key=purchase_group_key,
                target_model="inventory.Purchase",
            ).first()
            if existing_map:
                continue

            valid_records = []
            for record in records:
                if record.source_key in skip_keys:
                    lines_skipped += 1
                    continue
                row = record.raw_data
                if not row.get("PRECOL_05") or row["PRECOL_05"] <= 0:
                    lines_zero_cost_skipped += 1
                    MigrationIssue.objects.create(
                        run=run,
                        severity=MigrationIssueSeverity.WARNING,
                        category=MigrationIssueCategory.MONTO_INVALIDO,
                        source_table=SourceTable.INVEN05,
                        source_key=record.source_key,
                        message=(
                            f"Costo en colones {row.get('PRECOL_05')} — no se puede "
                            "registrar una línea de compra sin costo. Línea descartada."
                        ),
                        context={"precol_05": row.get("PRECOL_05")},
                    )
                    continue
                valid_records.append(record)

            if not valid_records:
                purchases_skipped_empty += 1
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.WARNING,
                    category=MigrationIssueCategory.RELACION_INCOMPLETA,
                    source_table=SourceTable.INVEN05,
                    source_key=purchase_group_key,
                    message=(
                        f"Todas las líneas de la factura {numfac} (proveedor {codpro}) "
                        "fueron descartadas — no se creó ninguna compra."
                    ),
                    context={},
                )
                continue

            try:
                with transaction.atomic():
                    created_items = self._create_purchase_group(
                        run, supplier, purchase_group_key, numfac, valid_records, products
                    )
                purchases_created += 1
                items_created += created_items
            except (InventoryError, IntegrityError) as exc:
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.BLOCKING,
                    category=MigrationIssueCategory.OTRO,
                    source_table=SourceTable.INVEN05,
                    source_key=purchase_group_key,
                    message=f"No se pudo confirmar la compra: {exc}",
                    context={},
                )

        return {
            "compras_creadas": purchases_created,
            "lineas_de_compra_creadas": items_created,
            "compras_sin_lineas_validas": purchases_skipped_empty,
            "lineas_descartadas_por_huerfanas_o_invalidas": lines_skipped,
            "lineas_descartadas_por_costo_cero": lines_zero_cost_skipped,
        }

    def _create_purchase_group(self, run, supplier, purchase_group_key, numfac, valid_records, products):
        first_row = valid_records[0].raw_data
        purchase_date = self._corrected_date(first_row["FECFAC_05"])

        purchase = Purchase.objects.create(
            supplier=supplier,
            invoice_number=str(numfac),
            purchase_date=purchase_date,
            currency=Currency.CRC,
            exchange_rate=Decimal("1"),
            status=PurchaseStatus.DRAFT,
            created_by=None,
            updated_by=None,
        )
        LegacyRecordMap.objects.create(
            run=run,
            source_table=SourceTable.INVEN05,
            source_key=purchase_group_key,
            target_model="inventory.Purchase",
            target_id=purchase.pk,
        )

        # El modelo real solo permite una línea por producto por compra
        # (unique_together purchase+supplier_product), pero el legacy sí
        # permite que la misma pieza aparezca en dos NUMITE_05 distintos
        # dentro de la misma factura. Se fusionan sumando cantidad y
        # promediando el costo unitario ponderado por cantidad, para no
        # perder el costo total real de la factura.
        merged_lines: dict[str, dict] = {}
        for record in valid_records:
            row = record.raw_data
            code = row["CODPIE_05"].strip()
            entry = merged_lines.setdefault(
                code, {"records": [], "quantity": 0, "total_cost": Decimal("0")}
            )
            quantity = int(row["CANFAC_05"])
            unit_cost = Decimal(str(row["PRECOL_05"]))
            entry["records"].append(record)
            entry["quantity"] += quantity
            entry["total_cost"] += quantity * unit_cost

        supplier_product_cache = {}
        created_items = 0
        for code, entry in merged_lines.items():
            if len(entry["records"]) > 1:
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.INFO,
                    category=MigrationIssueCategory.CODIGO_DUPLICADO,
                    source_table=SourceTable.INVEN05,
                    source_key=purchase_group_key,
                    message=(
                        f"La pieza {code} aparece en {len(entry['records'])} líneas "
                        f"distintas de la factura {numfac} — se fusionaron en una sola "
                        "línea sumando cantidades y promediando el costo unitario "
                        "ponderado por cantidad."
                    ),
                    context={"lineas_originales": [r.source_key for r in entry["records"]]},
                )

            product = products[code]
            supplier_product = supplier_product_cache.get(product.pk)
            if supplier_product is None:
                supplier_product, _ = SupplierProduct.objects.get_or_create(
                    supplier=supplier,
                    product=product,
                    defaults={"created_by": None, "updated_by": None},
                )
                supplier_product_cache[product.pk] = supplier_product

            unit_cost = (entry["total_cost"] / entry["quantity"]).quantize(Decimal("0.0001"))

            item = PurchaseItem.objects.create(
                purchase=purchase,
                supplier_product=supplier_product,
                quantity=entry["quantity"],
                unit_cost=unit_cost,
                created_by=None,
                updated_by=None,
            )
            created_items += 1

            for record in entry["records"]:
                LegacyRecordMap.objects.create(
                    run=run,
                    source_table=SourceTable.INVEN05,
                    source_key=record.source_key,
                    target_model="inventory.PurchaseItem",
                    target_id=item.pk,
                )

        confirm_purchase(purchase=purchase, user=None)
        return created_items

    def _corrected_date(self, iso_date: str) -> datetime.date:
        year, month, day = (int(part) for part in iso_date.split("-"))
        if year < BUGGY_YEAR_THRESHOLD:
            year += 100
        return datetime.date(year, month, day)

    # ------------------------------------------------------------------
    # Conciliación final
    # ------------------------------------------------------------------

    def _reconcile_stock(self, run, products, stock_raw):
        adjustments_made = 0
        already_matched = 0
        missing_stock_row = 0

        for key, product in products.items():
            stock_row = stock_raw.get(key)
            if stock_row is None:
                missing_stock_row += 1
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.WARNING,
                    category=MigrationIssueCategory.RELACION_INCOMPLETA,
                    source_table=SourceTable.INVEN03,
                    source_key=key,
                    message="No hay fila de stock (INVEN08) para conciliar este producto. Queda con el stock calculado desde compras.",
                    context={},
                )
                continue

            target = stock_row["STOCK_08"]
            actual = current_stock(product)
            delta = target - actual

            if delta == 0:
                already_matched += 1
                continue

            try:
                adjust_stock(
                    product=product,
                    quantity=delta,
                    user=None,
                    notes=(
                        "Ajuste de conciliación de migración legacy: ventas/salidas "
                        "históricas no reconstruibles (INVEN06 corrupto). Se ajusta al "
                        f"stock real reportado por INVEN08 ({target})."
                    ),
                )
                adjustments_made += 1
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.INFO,
                    category=MigrationIssueCategory.AJUSTE_CONCILIACION,
                    source_table=SourceTable.INVEN08,
                    source_key=key,
                    message=f"Stock ajustado de {actual} a {target} (delta {delta}).",
                    context={"stock_desde_compras": actual, "stock_08": target, "delta": delta},
                )
            except InventoryError as exc:
                MigrationIssue.objects.create(
                    run=run,
                    severity=MigrationIssueSeverity.BLOCKING,
                    category=MigrationIssueCategory.OTRO,
                    source_table=SourceTable.INVEN08,
                    source_key=key,
                    message=f"No se pudo ajustar el stock: {exc}",
                    context={"stock_desde_compras": actual, "stock_08": target},
                )

        return {
            "productos_ajustados": adjustments_made,
            "productos_ya_coincidian": already_matched,
            "productos_sin_fila_de_stock": missing_stock_row,
        }
