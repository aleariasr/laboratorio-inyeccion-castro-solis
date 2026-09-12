"""
Regresiones del comando que agrupa productos equivalentes a partir de
REFPIE_03 (ver docs/dbf-migration-closure.md y §3.6 del modelo).

Cada test cubre un caso real encontrado en los datos del cliente, no un
escenario inventado:

- el par con prefijo (G3S6 / KG3S6), que es el patrón dominante;
- el equivalente que quedó en SINUB y el otro sí está ubicado;
- el grupo repartido en dos ubicaciones reales distintas;
- la nota de texto libre ("TORNECA", que es un proveedor) que NO debe
  pegar productos entre sí;
- la referencia que sí apunta a un código existente pero a una pieza
  que no tiene nada que ver;
- la cadena A->B->C, que forma un grupo de 3 y queda excluida por
  defecto porque en los datos reales ese encadenamiento une piezas
  distintas.
"""

import io

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.inventory.models import Product, StorageLocation, VariantKind
from apps.legacy_migration.models import (
    LegacyRecordMap,
    LegacyStagingRecord,
    MigrationRun,
    SourceTable,
)

PIEZAS = [
    # (código, nombre legacy, referencia, stock, precio de venta)
    ("G3S6", "PUNTA C.R. TOYOTA PRADO 2013 A127", "", 5, 85000.0),
    ("KG3S6", "PUNTA C.R. TOYOTA PRADO 2013 A127", "G3S6", 8, 90000.0),
    ("BASE-1", "CAMISA VALVULA PERKINS 354 B200", "", 3, 4000.0),
    ("SINREF-1", "CAMISA VALVULA PERKINS 354", "BASE-1", 1, 4500.0),
    ("SPLIT-A", "DISCO LEVAS MAZDA 2 PINES B209", "", 10, 50000.0),
    ("SPLIT-B", "DISCO LEVAS MAZDA 2 PINES B211", "SPLIT-A", 4, 50000.0),
    ("FREE-1", "TORNILLO ALLEN TAPA GOB C310", "TORNECA", 19, 500.0),
    ("FREE-2", "TORNILLO ALLEN TAPA GOB C310", "TORNECA", 38, 500.0),
    ("DIFF-1", "PISTON AVANCE BOMBA VE D155", "", 2, 30000.0),
    ("DIFF-2", "COPA INYECTOR GASOLINA DELPHI E240", "DIFF-1", 6, 1300.0),
    ("CHAIN-A", "SET EMPAQUE BOMBA PE B300", "", 7, 25000.0),
    ("CHAIN-B", "SET EMPAQUE BOMBA PE B300", "CHAIN-A", 2, 25000.0),
    ("CHAIN-C", "SET EMPAQUE BOMBA PE B300", "CHAIN-B", 9, 25000.0),
]


class MigrateLegacyEquivalencesTests(TestCase):
    def setUp(self):
        self.run = MigrationRun.objects.create()

        for code, name, ref, stock, price in PIEZAS:
            LegacyStagingRecord.objects.create(
                run=self.run,
                source_table=SourceTable.INVEN03,
                source_origin="bases1",
                source_key=code,
                raw_data={
                    "CODPIE_03": code,
                    "NOMPIE_03": name,
                    "REFPIE_03": ref,
                    "STOCK_03": stock,
                    "PREVEN_03": price,
                    "CANMIN_03": 0,
                },
            )
            LegacyStagingRecord.objects.create(
                run=self.run,
                source_table=SourceTable.INVEN08,
                source_origin="bases1",
                source_key=code,
                raw_data={"CODPIE_08": code, "STOCK_08": stock},
            )

        call_command("migrate_legacy_import", run=self.run.pk, stdout=io.StringIO())

    # ------------------------------------------------------------------
    # Utilidades
    # ------------------------------------------------------------------

    def _run(self, **options):
        call_command(
            "migrate_legacy_equivalences",
            run=self.run.pk,
            stdout=io.StringIO(),
            stderr=io.StringIO(),
            **options,
        )

    def _by_legacy_code(self, legacy_code):
        """
        Después de agrupar, standard_code ya no es el código legacy, así
        que se resuelve por LegacyRecordMap, que es justamente la traza
        que hace posible el rollback.
        """
        mapping = LegacyRecordMap.objects.get(
            source_table=SourceTable.INVEN03,
            source_key=legacy_code,
            target_model="inventory.Product",
        )
        return Product.objects.get(pk=mapping.target_id)

    def _snapshot(self):
        return {
            product.pk: (
                product.standard_code,
                product.variant_kind,
                product.description,
                product.storage_location_id,
                product.custom_sale_price,
            )
            for product in Product.objects.all()
        }

    # ------------------------------------------------------------------
    # Agrupación
    # ------------------------------------------------------------------

    def test_agrupa_el_par_con_prefijo_bajo_el_codigo_mas_corto(self):
        self._run()

        family = Product.objects.filter(standard_code="G3S6").order_by("variant_kind")
        self.assertEqual(family.count(), 2)

        canonical = family.get(variant_kind=VariantKind.ORIGINAL)
        variant = family.get(variant_kind=VariantKind.OTHER)

        self.assertIn("Código legacy: G3S6", canonical.description)
        self.assertIn("Código legacy: KG3S6", variant.description)
        for product in (canonical, variant):
            self.assertIn(
                "Código universal compartido: G3S6", product.description
            )

    def test_no_agrupa_por_una_nota_de_texto_libre(self):
        self._run()

        # Nombres idénticos y misma referencia: lo único que los separa
        # es que "TORNECA" no tiene forma de código. Es un proveedor.
        codes = set(
            Product.objects
            .filter(name="TORNILLO ALLEN TAPA GOB")
            .values_list("standard_code", flat=True)
        )
        self.assertEqual(codes, {"FREE-1", "FREE-2"})

    def test_no_agrupa_cuando_los_nombres_no_se_parecen(self):
        self._run()

        self.assertEqual(Product.objects.filter(standard_code="DIFF-1").count(), 1)
        self.assertEqual(Product.objects.filter(standard_code="DIFF-2").count(), 1)

    # ------------------------------------------------------------------
    # Ubicaciones
    # ------------------------------------------------------------------

    def test_el_producto_en_sinub_recibe_la_pista_de_donde_buscarlo(self):
        self._run()

        sin_ubicar = self._by_legacy_code("SINREF-1")
        self.assertEqual(sin_ubicar.storage_location.code, "SINUB")
        self.assertIn(
            "SINUB (sin ubicar) — su equivalente BASE-1 está en B200; "
            "candidato a ubicar ahí.",
            sin_ubicar.description,
        )

        # El que sí está ubicado no recibe nota de ubicación: el grupo
        # tiene una sola ubicación real, no hay nada que advertir.
        ubicado = self._by_legacy_code("BASE-1")
        self.assertNotIn("Ubicación propia:", ubicado.description)

    def test_el_grupo_repartido_avisa_y_cada_uno_conserva_su_ubicacion(self):
        self._run()

        primero = self._by_legacy_code("SPLIT-A")
        segundo = self._by_legacy_code("SPLIT-B")

        self.assertEqual(primero.storage_location.code, "B209")
        self.assertEqual(segundo.storage_location.code, "B211")

        for product in (primero, segundo):
            self.assertIn(
                "repartido en varias ubicaciones reales (B209, B211)",
                product.description,
            )

    def test_el_grupo_en_una_sola_ubicacion_no_lleva_nota(self):
        self._run()

        for legacy_code in ("G3S6", "KG3S6"):
            self.assertNotIn(
                "Ubicación propia:", self._by_legacy_code(legacy_code).description
            )

    # ------------------------------------------------------------------
    # Idempotencia, dry-run y rollback
    # ------------------------------------------------------------------

    def test_correrlo_dos_veces_deja_el_mismo_estado(self):
        self._run()
        after_first = self._snapshot()

        self._run()
        self.assertEqual(self._snapshot(), after_first)

    def test_dry_run_no_escribe_nada(self):
        before = self._snapshot()
        self._run(dry_run=True)
        self.assertEqual(self._snapshot(), before)

    def test_rollback_devuelve_el_estado_exacto(self):
        before = self._snapshot()

        self._run()
        self.assertNotEqual(self._snapshot(), before)

        self._run(rollback=True)
        self.assertEqual(self._snapshot(), before)

    def test_rollback_es_idempotente(self):
        self._run()
        self._run(rollback=True)
        after_rollback = self._snapshot()

        self._run(rollback=True)
        self.assertEqual(self._snapshot(), after_rollback)

    # ------------------------------------------------------------------
    # Lo que no se toca
    # ------------------------------------------------------------------

    def test_no_crea_ni_borra_productos_ni_toca_precio_ni_ubicacion(self):
        before = {
            product.pk: (
                product.storage_location_id,
                product.custom_sale_price,
                product.name,
                product.minimum_stock,
            )
            for product in Product.objects.all()
        }

        self._run()

        after = {
            product.pk: (
                product.storage_location_id,
                product.custom_sale_price,
                product.name,
                product.minimum_stock,
            )
            for product in Product.objects.all()
        }
        self.assertEqual(after, before)

    def test_respeta_la_descripcion_escrita_a_mano(self):
        product = Product.objects.get(standard_code="KG3S6")
        product.description = "Ojo: el cliente lo pide como repuesto de garantía."
        product.save()

        self._run()
        product.refresh_from_db()
        self.assertIn("Ojo: el cliente lo pide", product.description)
        self.assertIn("Código legacy: KG3S6", product.description)

        self._run(rollback=True)
        product.refresh_from_db()
        self.assertEqual(
            product.description,
            "Ojo: el cliente lo pide como repuesto de garantía.",
        )

    def test_aborta_sin_escribir_si_el_codigo_canonico_ya_esta_tomado(self):
        StorageLocation.objects.get_or_create(code="Z999")
        Product.objects.create(
            standard_code="G3S6",
            name="PRODUCTO AJENO CREADO A MANO",
            storage_location=StorageLocation.objects.get(code="Z999"),
        )

        before = self._snapshot()

        with self.assertRaises(CommandError):
            self._run()

        self.assertEqual(self._snapshot(), before)

    # ------------------------------------------------------------------
    # Referencia cruda: nada del legacy se pierde
    # ------------------------------------------------------------------

    def test_guarda_la_referencia_cruda_de_los_que_no_agrupan(self):
        self._run()

        # "TORNECA" es un proveedor, no agrupa nada, pero el dato queda.
        libre = self._by_legacy_code("FREE-1")
        self.assertEqual(libre.standard_code, "FREE-1")
        self.assertEqual(libre.variant_kind, VariantKind.ORIGINAL)
        self.assertIn("Referencia legacy: TORNECA", libre.description)
        self.assertNotIn("Código universal compartido:", libre.description)

        # Referencia a un código que existe pero es otra pieza.
        distinto = self._by_legacy_code("DIFF-2")
        self.assertEqual(distinto.standard_code, "DIFF-2")
        self.assertIn("Referencia legacy: DIFF-1", distinto.description)

    def test_los_agrupados_tambien_conservan_su_referencia_cruda(self):
        self._run()

        variante = self._by_legacy_code("KG3S6")
        self.assertIn("Código universal compartido: G3S6", variante.description)
        self.assertIn("Referencia legacy: G3S6", variante.description)

    def test_no_toca_productos_sin_referencia(self):
        sin_referencia = self._by_legacy_code("G3S6")
        sin_referencia.description = ""
        sin_referencia.save()

        solitario = self._by_legacy_code("DIFF-1")
        antes = (solitario.standard_code, solitario.description)

        self._run()

        solitario.refresh_from_db()
        self.assertEqual((solitario.standard_code, solitario.description), antes)

    # ------------------------------------------------------------------
    # Tope de tamaño de grupo
    # ------------------------------------------------------------------

    def test_excluye_los_grupos_encadenados_por_defecto(self):
        self._run()

        for legacy_code in ("CHAIN-A", "CHAIN-B", "CHAIN-C"):
            product = self._by_legacy_code(legacy_code)
            self.assertEqual(
                product.standard_code,
                legacy_code,
                "un grupo de 3 no debe aplicarse con el tope por defecto",
            )
            self.assertNotIn(
                "Código universal compartido:", product.description
            )

        # Pero la referencia cruda sí se guarda igual.
        self.assertIn(
            "Referencia legacy: CHAIN-A",
            self._by_legacy_code("CHAIN-B").description,
        )

    def test_max_group_size_mayor_si_los_agrupa(self):
        self._run(max_group_size=3)

        family = Product.objects.filter(standard_code="CHAIN-A")
        self.assertEqual(family.count(), 3)
        self.assertEqual(
            family.filter(variant_kind=VariantKind.ORIGINAL).count(), 1
        )

    def test_max_group_size_cero_desactiva_el_tope(self):
        self._run(max_group_size=0)
        self.assertEqual(Product.objects.filter(standard_code="CHAIN-A").count(), 3)

    def test_el_rollback_limpia_tambien_la_referencia_cruda(self):
        before = self._snapshot()

        self._run()
        self.assertNotEqual(self._snapshot(), before)

        self._run(rollback=True)
        self.assertEqual(self._snapshot(), before)
