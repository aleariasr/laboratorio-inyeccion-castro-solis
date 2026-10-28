"""
Datos de demostración para DESARROLLO.

Llena el sistema con ~10 semanas de actividad de un laboratorio de
inyectores diésel: catálogo con variantes original/genérico, compras
con costos de importación, ventas, servicios técnicos en todos los
estados, conteos físicos y cierres de caja semanales.

Todo se crea a través de los servicios reales del dominio
(confirm_purchase, confirm_sale, add_service_accessory, ...), así que
el stock, el kardex y los cierres de caja salen coherentes. Los
eventos se ejecutan en orden cronológico y después se les reescribe la
fecha de creación para que reportes y dashboard muestren historia real.

Los datos son ficticios (nombres, cédulas, teléfonos y correos
inventados). Ver scripts/seed-demo.sh para correrlo.
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.cash.models import CashClosing
from apps.cash.selectors import expected_totals_by_method
from apps.cash.services import create_cash_closing
from apps.core.models import PaymentMethod
from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.customers.models import (
    Customer,
    CustomerType,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    ServiceType,
)
from apps.customers.services.customer import (
    register_customer,
    register_injector,
)
from apps.customers.services.service_accessory import add_service_accessory
from apps.customers.services.service_record import (
    cancel_service,
    deliver_service,
    mark_ready,
    receive_injector,
    start_service,
)
from apps.customers.services.service_charges import add_charge_line
from apps.inventory.models import (
    Currency,
    ImportCost,
    ImportCostCategory,
    InventoryCount,
    InventoryCountItem,
    Product,
    ProductCostHistory,
    Purchase,
    PurchaseItem,
    StockMovement,
    StorageLocation,
    Supplier,
    SupplierProduct,
    VariantKind,
)
from apps.inventory.selectors import current_stock
from apps.inventory.selectors.pricing import effective_sale_price
from apps.inventory.services.costs import calculate_purchase_costs
from apps.inventory.services.inventory_count import (
    approve_inventory_count,
    cancel_inventory_count,
)
from apps.inventory.services.purchases import (
    cancel_purchase,
    confirm_purchase,
)
from apps.inventory.services.stock import adjust_stock, initial_inventory
from apps.sales.exceptions import SalesError
from apps.sales.models import Sale, SaleItem, SaleStatus
from apps.sales.services.sale import cancel_sale, confirm_sale

DEMO_PASSWORD = "Demo2026!"

HISTORY_DAYS = 80

DEMO_USERS = [
    ("demo.admin", "Mariana", "Solís Castro", ROLE_ADMIN, True),
    ("demo.inventario", "Esteban", "Rojas Vega", ROLE_INVENTORY, False),
    ("demo.ventas", "Daniela", "Mora Chaves", ROLE_SALES, False),
    ("demo.servicios", "Andrés", "Castro Jiménez", ROLE_CUSTOMERS, False),
    ("demo.lectura", "Paola", "Araya Quesada", ROLE_READ_ONLY, False),
]

LOCATIONS = [
    ("A01", "Estante A, nivel 1 — Toberas Bosch"),
    ("A02", "Estante A, nivel 2 — Toberas Denso y Siemens"),
    ("A03", "Estante A, nivel 3 — Toberas varias"),
    ("B01", "Estante B, nivel 1 — Válvulas de control"),
    ("B02", "Estante B, nivel 2 — Solenoides"),
    ("C01", "Estante C, nivel 1 — Kits de reparación"),
    ("C02", "Estante C, nivel 2 — Empaques y sellos"),
    ("D01", "Estante D, nivel 1 — Componentes internos"),
    ("D02", "Estante D, nivel 2 — Resortes y shims"),
    ("E01", "Estante E, nivel 1 — Sensores y reguladores"),
    ("E02", "Estante E, nivel 2 — Bombas de alta presión"),
    ("F01", "Estante F — Consumibles de taller"),
    ("VITRINA", "Vitrina de mostrador — alta rotación"),
]

# Familias con variante ORIGINAL y GENERIC bajo el mismo código universal.
# (código, nombre, ubicación, mínimo original, costo USD original,
#  proveedor del original)
FAMILIES = [
    ("DLLA150P1022", "Tobera Bosch DLLA150P1022", "A01", 4, "38.50", "BOSCH"),
    ("DLLA148P1524", "Tobera Bosch DLLA148P1524", "A01", 4, "36.00", "BOSCH"),
    ("105015-4410", "Tobera Denso 105015-4410", "A02", 3, "41.20", "DENSO"),
    ("DSLA143P5498", "Tobera Bosch DSLA143P5498", "A03", 3, "29.75", "BOSCH"),
    ("F00RJ02130", "Válvula de control CRI Bosch F00RJ02130", "B01", 4, "24.90", "BOSCH"),
    ("9308-621C", "Solenoide Delphi 9308-621C", "B02", 3, "52.00", "DELPHI"),
    ("0281002698", "Sensor de presión de riel 0281002698", "E01", 3, "64.30", "BOSCH"),
    ("F00VP01005", "Kit de reparación inyector CRI F00VP01005", "C01", 5, "18.40", "BOSCH"),
]

# Productos sin variante. (código, nombre, ubicación, mínimo,
#  costo USD (o CRC si el proveedor es local), proveedor, es_pieza_pequeña)
SINGLES = [
    ("M0011P155", "Tobera Siemens M0011P155", "A02", 3, "33.10", "DELPHI", False),
    ("DLLA155P1493", "Tobera Bosch DLLA155P1493", "A03", 3, "31.80", "BOSCH", False),
    ("095000-5471", "Válvula de control Denso 095000-5471", "B01", 3, "27.60", "DENSO", False),
    ("EJBR04701D", "Solenoide Delphi EJBR04701D", "B02", 2, "58.90", "DELPHI", False),
    ("DRV-CP1", "Regulador de presión DRV bomba CP1", "E01", 2, "45.00", "BOSCH", False),
    ("CP1-REP", "Kit de reparación bomba de alta presión CP1", "E02", 2, "96.00", "BOSCH", False),
    ("SENS-TC", "Sensor de temperatura de combustible", "E01", 3, "11.50", "GUANGZHOU", False),
    ("CIL-2KD", "Conector eléctrico inyector CRI (par)", "VITRINA", 6, "3.20", "GUANGZHOU", True),
    ("OR-125x20", "O-ring 12.5x2.0 (paquete x50)", "C02", 6, "6200", "AUTOTEC", True),
    ("ARA-CU-1520", "Arandela de cobre 15x20 (paquete x100)", "C02", 6, "7800", "AUTOTEC", True),
    ("SELLO-TEF", "Sello de teflón de cámara (x20)", "C02", 5, "9500", "AUTOTEC", True),
    ("MALLA-ENT", "Filtro de malla de entrada (x50)", "C02", 4, "11200", "AUTOTEC", True),
    ("ANILLO-RET", "Anillo de retención de inyector (x25)", "C02", 4, "8400", "AUTOTEC", True),
    ("RES-AGU15", "Resorte de aguja 1.5 mm", "D02", 8, "1.40", "GUANGZHOU", True),
    ("AGU-STD", "Aguja de inyector estándar", "D01", 6, "4.80", "GUANGZHOU", True),
    ("PIS-CTRL", "Pistón de control", "D01", 5, "5.60", "GUANGZHOU", True),
    ("SHIM-KIT", "Kit de shims de ajuste 1.00–1.50 mm", "D02", 3, "14.20", "GUANGZHOU", True),
    ("PLACA-ORI", "Placa de orificio de válvula", "D01", 6, "3.90", "GUANGZHOU", True),
    ("LIQ-ULTRA", "Líquido de limpieza ultrasónica (galón)", "F01", 3, "22400", "QUIMICOS", True),
    ("ACE-ISO4113", "Aceite de calibración ISO 4113 (galón)", "F01", 3, "31500", "QUIMICOS", True),
    ("FIL-BANCO", "Filtro de combustible para banco de pruebas", "F01", 4, "6800", "AUTOTEC", True),
    ("CAB-ADAP", "Cable adaptador banco de pruebas CRI", "F01", 2, "13500", "AUTOTEC", False),
]

SUPPLIERS = {
    "BOSCH": dict(
        name="Bosch Diesel Import Panamá",
        contact_name="Ricardo Almanza",
        phone="+507 6400-1188",
        email="ventas@boschdiesel-import.example",
        country="Panamá",
        notes="Originales Bosch con factura de zona libre. Despacho en 8–10 días.",
        currency=Currency.USD,
    ),
    "DELPHI": dict(
        name="Delphi-Tech Miami",
        contact_name="Sandra Whitfield",
        phone="+1 305-555-0142",
        email="orders@delphitech-miami.example",
        country="Estados Unidos",
        notes="Solenoides y toberas Delphi/Siemens. Courier aéreo.",
        currency=Currency.USD,
    ),
    "DENSO": dict(
        name="Asia Denso Parts Co.",
        contact_name="Kenji Morita",
        phone="+81 3-5555-0190",
        email="export@asiadenso-parts.example",
        country="Japón",
        notes="Piezas Denso originales. Embarque marítimo, 25–35 días.",
        currency=Currency.USD,
    ),
    "GUANGZHOU": dict(
        name="Guangzhou Diesel Parts Ltd.",
        contact_name="Li Wei",
        phone="+86 20-5555-0177",
        email="sales@gzdieselparts.example",
        country="China",
        notes="Genéricos y componentes internos. Mínimo de pedido USD 300.",
        currency=Currency.USD,
    ),
    "AUTOTEC": dict(
        name="Repuestos Autotec Costa Rica",
        contact_name="Luis Fernando Salas",
        phone="+506 2222-4410",
        email="ventas@autotec-cr.example",
        country="Costa Rica",
        notes="Empaques, sellos y filtros. Entrega el mismo día en San José.",
        currency=Currency.CRC,
    ),
    "QUIMICOS": dict(
        name="Químicos Industriales del Valle",
        contact_name="Karla Jiménez",
        phone="+506 2440-8812",
        email="pedidos@quimicosvalle.example",
        country="Costa Rica",
        notes="Líquidos de limpieza y aceites de calibración.",
        currency=Currency.CRC,
    ),
}

IMPORT_COST_CATEGORIES = [
    ("Flete internacional", "Transporte aéreo o marítimo hasta Costa Rica."),
    ("Seguro de carga", "Póliza de transporte de la mercadería."),
    ("Impuestos aduanales", "Derechos de importación y valor agregado."),
    ("Agente aduanal", "Honorarios del agente que tramita la importación."),
    ("Transporte local", "Traslado desde la aduana hasta el laboratorio."),
]

CUSTOMERS = [
    (CustomerType.COMPANY, "Taller Diesel Los Ángeles S.A.", "3-101-482915", "2236-4410", "tallerlosangeles@correo.example"),
    (CustomerType.COMPANY, "Transportes Pacífico Central S.A.", "3-101-390127", "2661-3380", "flota@transpacifico.example"),
    (CustomerType.COMPANY, "Agroservicios La Zona Norte", "3-102-716604", "2460-1175", "compras@agrozn.example"),
    (CustomerType.COMPANY, "Mecánica Automotriz Rojas y Hnos.", "3-102-558301", "2279-9042", ""),
    (CustomerType.COMPANY, "Constructora Cordillera S.A.", "3-101-612844", "2290-7733", "mantenimiento@cordillera.example"),
    (CustomerType.PERSON, "Juan Carlos Vargas Mora", "1-0845-0123", "8814-2290", ""),
    (CustomerType.PERSON, "María Fernanda Solano Brenes", "2-0611-0457", "8702-3341", "mfsolano@correo.example"),
    (CustomerType.PERSON, "Luis Diego Chaves Araya", "1-1102-0588", "8365-7710", ""),
    (CustomerType.PERSON, "Rodrigo Esquivel Padilla", "5-0390-0214", "8991-1067", ""),
    (CustomerType.PERSON, "Gabriela Montero Retana", "1-0977-0662", "8620-4418", "gmontero@correo.example"),
    (CustomerType.PERSON, "Carlos Alberto Umaña Zúñiga", "3-0455-0391", "8473-9026", ""),
    (CustomerType.PERSON, "Silvia Elena Villalobos Cruz", "4-0198-0733", "8588-3052", ""),
    (CustomerType.PERSON, "Marco Antonio Herrera Sandí", "1-1234-0509", "8310-6684", ""),
    (CustomerType.COMPANY, "Buses Turrialba Express S.A.", "3-101-275590", "2556-1148", "taller@busesturrialba.example"),
]

INJECTORS = [
    ("0445110376", "Bosch CRI2 — Toyota Hilux 3.0 D-4D"),
    ("0445110250", "Bosch CRI2 — Hyundai Santa Fe 2.2 CRDi"),
    ("095000-5471", "Denso — Toyota Hilux 2KD-FTV"),
    ("0445110183", "Bosch CRI1 — Mitsubishi L200 2.5"),
    ("0445120007", "Bosch CRIN1 — Camión Hino 300"),
    ("0445110126", "Bosch CRI1 — Kia Sorento 2.5 CRDi"),
    ("23670-30050", "Denso — Toyota Land Cruiser 1KD"),
    ("0445110259", "Bosch CRI2 — Nissan Frontier 2.5 dCi"),
    ("EJBR04701D", "Delphi — Renault Master 2.5 dCi"),
    ("0445120123", "Bosch CRIN2 — Cabezal Freightliner"),
    ("095000-6070", "Denso — Isuzu D-Max 3.0"),
    ("0445110110", "Bosch CRI1 — Peugeot Boxer 2.2 HDi"),
]

SERVICE_TYPES = [
    ("Limpieza ultrasónica", "Limpieza en baño ultrasónico con prueba posterior.", (12000, 22000)),
    ("Revisión y diagnóstico en banco", "Medición de caudal, retorno y pulverización.", (9000, 16000)),
    ("Calibración y prueba de caudal", "Ajuste de shims y verificación en banco.", (18000, 32000)),
    ("Cambio de tobera", "Reemplazo de tobera y calibración final.", (35000, 58000)),
    ("Reparación completa CRI", "Desarme total, cambio de internos y calibración.", (60000, 95000)),
    ("Cambio de solenoide", "Reemplazo de solenoide y prueba eléctrica.", (42000, 70000)),
]

NOTES_BEFORE = [
    "Cliente reporta humo negro y pérdida de potencia en subidas.",
    "Arranque difícil en frío, ralentí inestable.",
    "Consumo elevado de combustible y golpeteo en ralentí.",
    "Falla intermitente, luz de motor encendida (código P0201).",
    "Retorno excesivo en banco según otro taller; pide segunda revisión.",
    "Se recibe con el cuerpo golpeado; cliente indica caída durante desmontaje.",
    "Mantenimiento preventivo, 120 000 km desde el último servicio.",
    "",
]

NOTES_AFTER = [
    "Limpieza completa y cambio de sellos. Prueba de caudal dentro de rango.",
    "Se reemplazó la tobera. Pulverización uniforme en las 4 pruebas.",
    "Calibrado con shims; retorno normalizado.",
    "Se cambió solenoide y arandelas. Resistencia dentro de especificación.",
    "Reparación completa; se recomienda revisar filtro de combustible del vehículo.",
    "",
]

SALE_NOTES = [
    "",
    "",
    "",
    "Cliente retira en mostrador.",
    "Entrega coordinada por mensajería.",
    "Pago confirmado por SINPE Móvil.",
    "Descuento por compra al por mayor.",
]

PAYMENT_WEIGHTS = [
    (PaymentMethod.CASH, 40),
    (PaymentMethod.CARD, 30),
    (PaymentMethod.TRANSFER, 25),
    (PaymentMethod.OTHER, 5),
]

SATURDAY = 5


def _round_to(value, step):
    return (Decimal(value) / Decimal(step)).quantize(Decimal("1")) * Decimal(step)


class Command(BaseCommand):
    help = (
        "Genera datos de demostración para desarrollo (productos, compras, "
        "ventas, servicios, conteos y cierres de caja)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help=(
                "Borra primero TODOS los datos de negocio (productos, "
                "compras, ventas, clientes, servicios, caja). No borra "
                "usuarios."
            ),
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="No pedir confirmación al usar --reset.",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=2026,
            help="Semilla del generador aleatorio (default: 2026).",
        )

    # ------------------------------------------------------------------
    # Flujo principal
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "Este comando es solo para desarrollo (DEBUG=False). "
                "No se ejecuta contra producción."
            )

        self.rng = random.Random(options["seed"])
        self.now = timezone.localtime()
        self._post_stamp = []
        self.today = timezone.localdate()

        if options["reset"]:
            self._confirm_reset(options["yes"])
            self._reset_business_data()
        elif Product.objects.exists() or Customer.objects.exists():
            raise CommandError(
                "Ya hay datos de negocio en la base. Para regenerar todo "
                "desde cero usá --reset (borra productos, compras, ventas, "
                "clientes, servicios y caja)."
            )

        call_command("setup_roles", verbosity=0)

        self._create_users()
        self._create_catalog()
        self._create_customers()
        self._create_service_types()

        events = []
        events += self._plan_purchases()
        events += self._plan_sales()
        events += self._plan_services()
        events += self._plan_inventory_activity()

        events.sort(key=lambda event: event[0])

        self.stdout.write(f"Ejecutando {len(events)} eventos en orden cronológico...")

        for when, label, action in events:
            self._run_event(when, action)

        self._create_cash_closings()
        self._print_summary()

    # ------------------------------------------------------------------
    # Utilidades de tiempo y estampado
    # ------------------------------------------------------------------

    def _at(self, day_offset, hour=None, minute=None):
        """Fecha/hora aware, `day_offset` días atrás desde hoy."""
        day = self.today - timedelta(days=day_offset)
        hour = self.rng.randint(8, 17) if hour is None else hour
        minute = self.rng.randint(0, 59) if minute is None else minute
        moment = timezone.make_aware(datetime.combine(day, time(hour, minute)))
        return min(moment, self.now - timedelta(minutes=1))

    def _run_event(self, when, action):
        last_movement = (
            StockMovement.objects.order_by("-id").values_list("id", flat=True).first()
            or 0
        )
        self._post_stamp = []
        action(when)
        StockMovement.objects.filter(id__gt=last_movement).update(
            created_at=when,
            updated_at=when,
        )
        # Reescrituras que deben ganarle al estampado general (p. ej. la
        # reversión de una venta anulada, que ocurre un día después).
        for hook in self._post_stamp:
            hook()

    @staticmethod
    def _stamp(queryset_or_obj, **fields):
        """Reescribe campos auto_now sin disparar save()."""
        model = queryset_or_obj.__class__
        if hasattr(queryset_or_obj, "update"):
            queryset_or_obj.update(**fields)
        else:
            model.objects.filter(pk=queryset_or_obj.pk).update(**fields)

    def _weighted_payment(self):
        methods, weights = zip(*PAYMENT_WEIGHTS)
        return self.rng.choices(methods, weights=weights)[0]

    # ------------------------------------------------------------------
    # Reset
    # ------------------------------------------------------------------

    def _confirm_reset(self, assume_yes):
        if assume_yes:
            return

        answer = input(
            "Esto BORRA productos, compras, ventas, clientes, servicios, "
            "conteos y cierres de caja de la base de desarrollo.\n"
            "Escribí 'si' para continuar: "
        )

        if answer.strip().lower() != "si":
            raise CommandError("Cancelado.")

    @transaction.atomic
    def _reset_business_data(self):
        self.stdout.write("Borrando datos de negocio existentes...")

        StockMovement.objects.filter(reverses_movement__isnull=False).delete()
        StockMovement.objects.all().delete()
        InjectorServiceAccessory.objects.all().delete()
        InjectorServiceRecord.objects.all().delete()
        Injector.objects.all().delete()
        SaleItem.objects.all().delete()
        Sale.objects.all().delete()
        Customer.objects.all().delete()
        ServiceType.objects.all().delete()
        CashClosing.objects.all().delete()
        InventoryCountItem.objects.all().delete()
        InventoryCount.objects.all().delete()
        ProductCostHistory.objects.all().delete()
        ImportCost.objects.all().delete()
        ImportCostCategory.objects.all().delete()
        PurchaseItem.objects.all().delete()
        Purchase.objects.all().delete()
        SupplierProduct.objects.all().delete()
        Supplier.objects.all().delete()
        Product.objects.all().delete()
        StorageLocation.objects.all().delete()

    # ------------------------------------------------------------------
    # Usuarios
    # ------------------------------------------------------------------

    def _create_users(self):
        self.users = {}

        for username, first, last, role, is_admin in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(
                    first_name=first,
                    last_name=last,
                    email=f"{username}@lics.example",
                    is_staff=is_admin,
                    is_superuser=is_admin,
                ),
            )

            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()

            user.groups.set([Group.objects.get(name=role)])
            self.users[role] = user

        self.admin = self.users[ROLE_ADMIN]

    # ------------------------------------------------------------------
    # Catálogo: ubicaciones, productos, proveedores, costos
    # ------------------------------------------------------------------

    def _create_catalog(self):
        admin = self.admin
        inventory_user = self.users[ROLE_INVENTORY]

        self.locations = {}
        for code, description in LOCATIONS:
            self.locations[code] = StorageLocation.objects.create(
                code=code,
                description=description,
                created_by=inventory_user,
                updated_by=inventory_user,
            )

        self.suppliers = {}
        for key, data in SUPPLIERS.items():
            data = dict(data)
            data.pop("currency")
            self.suppliers[key] = Supplier.objects.create(
                created_by=inventory_user,
                updated_by=inventory_user,
                **data,
            )

        self.import_categories = {}
        for name, description in IMPORT_COST_CATEGORIES:
            self.import_categories[name] = ImportCostCategory.objects.create(
                name=name,
                description=description,
                created_by=admin,
                updated_by=admin,
            )

        # (producto, proveedor_key, costo en la moneda del proveedor, es_pieza_pequeña)
        self.catalog = []

        for code, name, loc, minimum, usd, supplier_key in FAMILIES:
            original = self._make_product(
                code, f"{name} (original)", loc, minimum, VariantKind.ORIGINAL,
                "Pieza original de fábrica.",
            )
            self._link(original, supplier_key, Decimal(usd), preferred=True)

            generic = self._make_product(
                code, f"{name} (genérica)", loc, minimum * 2, VariantKind.GENERIC,
                "Equivalente genérica, misma aplicación que la original.",
            )
            generic_cost = (Decimal(usd) * Decimal("0.38")).quantize(Decimal("0.01"))
            self._link(generic, "GUANGZHOU", generic_cost, preferred=True)

            self.catalog.append((original, supplier_key, Decimal(usd), False))
            self.catalog.append((generic, "GUANGZHOU", generic_cost, False))

        for code, name, loc, minimum, cost, supplier_key, small in SINGLES:
            product = self._make_product(code, name, loc, minimum, VariantKind.ORIGINAL, "")
            self._link(product, supplier_key, Decimal(cost), preferred=True)
            self.catalog.append((product, supplier_key, Decimal(cost), small))

        # Productos sin precio manual todavía; el precio sale de las compras.
        self.small_parts = [
            product for product, _, _, small in self.catalog if small
        ]

    def _make_product(self, code, name, loc, minimum, kind, description):
        return Product.objects.create(
            standard_code=code,
            variant_kind=kind,
            name=name,
            description=description,
            storage_location=self.locations[loc],
            minimum_stock=minimum,
            created_by=self.users[ROLE_INVENTORY],
            updated_by=self.users[ROLE_INVENTORY],
        )

    def _link(self, product, supplier_key, cost, preferred):
        manufacturers = {
            "BOSCH": "Bosch",
            "DELPHI": "Delphi",
            "DENSO": "Denso",
            "GUANGZHOU": "",
            "AUTOTEC": "",
            "QUIMICOS": "",
        }
        SupplierProduct.objects.create(
            supplier=self.suppliers[supplier_key],
            product=product,
            manufacturer=manufacturers[supplier_key],
            preferred_supplier=preferred,
            created_by=self.users[ROLE_INVENTORY],
            updated_by=self.users[ROLE_INVENTORY],
        )

    # ------------------------------------------------------------------
    # Clientes, inyectores y tipos de servicio
    # ------------------------------------------------------------------

    def _create_customers(self):
        user = self.users[ROLE_CUSTOMERS]
        self.customers = []
        self.customer_injectors = {}

        for kind, name, ident, phone, email in CUSTOMERS:
            customer = register_customer(
                customer_type=kind,
                display_name=name,
                identification=ident,
                phone=phone,
                email=email,
                notes=(
                    "Cliente frecuente, factura a crédito de 15 días."
                    if kind == CustomerType.COMPANY
                    else ""
                ),
                user=user,
            )
            self._stamp(customer, created_at=self._at(self.rng.randint(70, 90)))

            wanted = 3 if kind == CustomerType.COMPANY else self.rng.randint(1, 2)
            injectors = []

            for number, description in self.rng.sample(INJECTORS, wanted):
                injectors.append(
                    register_injector(
                        customer=customer,
                        injector_number=number,
                        description=description,
                        notes="",
                        user=user,
                    )
                )

            self.customers.append(customer)
            self.customer_injectors[customer.id] = injectors

    def _create_service_types(self):
        user = self.users[ROLE_CUSTOMERS]
        self.service_types = []

        for name, description, price_range in SERVICE_TYPES:
            service_type = ServiceType.objects.create(
                name=name,
                description=description,
                default_labor_price=_round_to(sum(price_range) // 2, 500),
                created_by=user,
                updated_by=user,
            )
            self.service_types.append((service_type, price_range))

    # ------------------------------------------------------------------
    # Planificación de eventos
    # ------------------------------------------------------------------

    def _plan_purchases(self):
        events = []

        by_supplier = {}
        for product, supplier_key, cost, _ in self.catalog:
            by_supplier.setdefault(supplier_key, []).append((product, cost))

        invoice_counter = 400

        for supplier_key, entries in by_supplier.items():
            currency = SUPPLIERS[supplier_key]["currency"]
            self.rng.shuffle(entries)
            chunk_size = 9 if currency == Currency.USD else 7
            chunks = [
                entries[i:i + chunk_size] for i in range(0, len(entries), chunk_size)
            ]

            for index, chunk in enumerate(chunks):
                invoice_counter += self.rng.randint(3, 40)
                day_offset = (
                    self.rng.randint(66, HISTORY_DAYS)
                    if index == 0
                    else self.rng.randint(8, 40)
                )
                when = self._at(day_offset, hour=self.rng.randint(8, 11))
                events.append(
                    (
                        when,
                        "compra",
                        self._purchase_action(
                            supplier_key, chunk, currency, f"FAC-{invoice_counter:05d}"
                        ),
                    )
                )

        # Una compra anulada (confirmada y luego revertida) al inicio.
        events.append(
            (
                self._at(HISTORY_DAYS - 2, hour=9),
                "compra anulada",
                self._cancelled_purchase_action(),
            )
        )

        # Dos borradores recientes para el dashboard.
        for offset, supplier_key in ((1, "BOSCH"), (0, "AUTOTEC")):
            events.append(
                (
                    self._at(offset, hour=8),
                    "compra borrador",
                    self._draft_purchase_action(supplier_key),
                )
            )

        # Inventario inicial de algunas piezas pequeñas, antes de todo.
        events.append(
            (self._at(HISTORY_DAYS + 5, hour=7), "inicial", self._initial_inventory_action())
        )

        return events

    def _initial_inventory_action(self):
        def action(when):
            for product in self.rng.sample(self.small_parts, 6):
                if not product.stock_movements.exists():
                    initial_inventory(
                        product=product,
                        quantity=self.rng.randint(8, 25),
                        user=self.users[ROLE_INVENTORY],
                        notes="Inventario inicial al arrancar el sistema.",
                    )

        return action

    def _purchase_action(self, supplier_key, chunk, currency, invoice):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            exchange_rate = (
                Decimal(self.rng.randint(50200, 52400)) / Decimal(100)
                if currency == Currency.USD
                else Decimal("1")
            )

            purchase = Purchase.objects.create(
                supplier=self.suppliers[supplier_key],
                invoice_number=invoice,
                purchase_date=when.date(),
                currency=currency,
                exchange_rate=exchange_rate,
                notes=self.rng.choice(
                    ["", "", "Pedido mensual de reposición.", "Incluye reposición de piezas con stock bajo."]
                ),
                created_by=user,
                updated_by=user,
            )
            self._stamp(purchase, created_at=when, updated_at=when)

            for product, cost in chunk:
                supplier_product = SupplierProduct.objects.get(
                    supplier=self.suppliers[supplier_key], product=product
                )
                is_small = product in self.small_parts
                is_generic = product.variant_kind == VariantKind.GENERIC
                quantity = (
                    self.rng.randint(15, 40)
                    if is_small
                    else self.rng.randint(12, 30)
                    if is_generic
                    else self.rng.randint(6, 14)
                )
                PurchaseItem.objects.create(
                    purchase=purchase,
                    supplier_product=supplier_product,
                    quantity=quantity,
                    unit_cost=cost,
                    created_by=user,
                    updated_by=user,
                )

            if currency == Currency.USD:
                self._add_import_costs(purchase, user)

            confirm_purchase(purchase=purchase, user=user)
            self._stamp(
                Purchase.objects.filter(pk=purchase.pk),
                confirmed_at=when + timedelta(minutes=20),
                updated_at=when,
            )

            histories = calculate_purchase_costs(
                purchase=purchase,
                margin_percentage=Decimal(self.rng.choice([35, 40, 45, 50, 55])),
                user=user,
            )
            ProductCostHistory.objects.filter(
                id__in=[history.id for history in histories]
            ).update(calculated_at=when + timedelta(minutes=25), created_at=when)

            self._price_products_manually(purchase)

        return action

    def _add_import_costs(self, purchase, user):
        names = ["Flete internacional", "Seguro de carga", "Impuestos aduanales"]
        if self.rng.random() < 0.7:
            names += ["Agente aduanal", "Transporte local"]

        for name in names:
            in_colones = name in ("Agente aduanal", "Transporte local")
            amount = (
                Decimal(self.rng.randint(22000, 65000))
                if in_colones
                else Decimal(self.rng.randint(60, 380))
            )
            ImportCost.objects.create(
                purchase=purchase,
                category=self.import_categories[name],
                description=f"{name} — factura {purchase.invoice_number}",
                amount=amount,
                currency=Currency.CRC if in_colones else Currency.USD,
                exchange_rate=purchase.exchange_rate,
                created_by=user,
                updated_by=user,
            )

    def _price_products_manually(self, purchase):
        """
        Fija un precio redondeado a mano en ~60 % de los productos de la
        compra (como hace el negocio); el resto queda con el sugerido.
        """
        for item in purchase.items.select_related("supplier_product__product"):
            product = item.supplier_product.product

            if product.custom_sale_price is not None:
                continue

            if self.rng.random() > 0.6:
                continue

            suggested = effective_sale_price(product)

            if suggested:
                product.custom_sale_price = max(_round_to(suggested, 500), Decimal("500"))
                product.save(update_fields=["custom_sale_price", "updated_at"])

    def _cancelled_purchase_action(self):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            product, _, _, _ = next(
                entry for entry in self.catalog if entry[1] == "AUTOTEC"
            )
            supplier_product = SupplierProduct.objects.get(
                supplier=self.suppliers["AUTOTEC"], product=product
            )

            purchase = Purchase.objects.create(
                supplier=self.suppliers["AUTOTEC"],
                invoice_number="FAC-00391",
                purchase_date=when.date(),
                currency=Currency.CRC,
                exchange_rate=Decimal("1"),
                created_by=user,
                updated_by=user,
            )
            PurchaseItem.objects.create(
                purchase=purchase,
                supplier_product=supplier_product,
                quantity=10,
                unit_cost=Decimal("6900"),
                created_by=user,
                updated_by=user,
            )
            confirm_purchase(purchase=purchase, user=user)
            cancel_purchase(
                purchase=purchase,
                user=user,
                reason="El proveedor facturó con precios desactualizados; se anula y se reemite.",
            )
            self._stamp(
                Purchase.objects.filter(pk=purchase.pk),
                created_at=when,
                confirmed_at=when,
                cancelled_at=when + timedelta(hours=3),
                updated_at=when,
            )

        return action

    def _draft_purchase_action(self, supplier_key):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            currency = SUPPLIERS[supplier_key]["currency"]
            candidates = [
                (product, cost)
                for product, key, cost, _ in self.catalog
                if key == supplier_key
            ]

            purchase = Purchase.objects.create(
                supplier=self.suppliers[supplier_key],
                invoice_number=f"BORR-{self.rng.randint(100, 999)}",
                purchase_date=when.date(),
                currency=currency,
                exchange_rate=(
                    Decimal("514.80") if currency == Currency.USD else Decimal("1")
                ),
                notes="Pedido en preparación, falta confirmar cantidades.",
                created_by=user,
                updated_by=user,
            )
            self._stamp(purchase, created_at=when, updated_at=when)

            for product, cost in self.rng.sample(candidates, min(4, len(candidates))):
                PurchaseItem.objects.create(
                    purchase=purchase,
                    supplier_product=SupplierProduct.objects.get(
                        supplier=self.suppliers[supplier_key], product=product
                    ),
                    quantity=self.rng.randint(5, 20),
                    unit_cost=cost,
                    created_by=user,
                    updated_by=user,
                )

        return action

    # -- Ventas ---------------------------------------------------------

    def _plan_sales(self):
        events = []

        for _ in range(48):
            day_offset = int(self.rng.triangular(0, HISTORY_DAYS - 8, 20))
            when = self._at(day_offset)
            events.append((when, "venta", self._sale_action(confirm=True)))

        for offset in (0, 1, 2):
            events.append(
                (self._at(offset, hour=self.rng.randint(9, 13)), "venta borrador", self._sale_action(confirm=False))
            )

        for offset in (30, 14):
            events.append(
                (self._at(offset), "venta anulada", self._sale_action(confirm=True, cancel=True))
            )

        return events

    def _sale_action(self, confirm, cancel=False):
        def action(when):
            user = self.users[ROLE_SALES]
            sellable = []

            # Instancias frescas: custom_sale_price puede haber cambiado
            # en la base después de armar el catálogo.
            for product in Product.objects.filter(is_active=True):
                stock = current_stock(product)
                price = effective_sale_price(product)
                if stock > 1 and price:
                    sellable.append((product, stock, price))

            if not sellable:
                return

            customer = (
                self.rng.choice(self.customers) if self.rng.random() < 0.75 else None
            )

            sale = Sale.objects.create(
                customer=customer,
                sale_date=when.date(),
                currency="CRC",
                exchange_rate=Decimal("1"),
                payment_method=self._weighted_payment(),
                notes=self.rng.choice(SALE_NOTES),
                created_by=user,
                updated_by=user,
            )
            self._stamp(sale, created_at=when, updated_at=when)

            line_count = self.rng.choice([1, 1, 2, 2, 3, 4])

            for product, stock, price in self.rng.sample(
                sellable, min(line_count, len(sellable))
            ):
                quantity = self.rng.randint(1, min(3, stock - 1))
                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    quantity=quantity,
                    unit_price=max(_round_to(price, 50), Decimal("50")),
                    created_by=user,
                    updated_by=user,
                )

            if not confirm:
                return

            try:
                confirm_sale(sale=sale, user=user)
            except SalesError:
                return

            self._stamp(
                Sale.objects.filter(pk=sale.pk),
                confirmed_at=when + timedelta(minutes=5),
                updated_at=when,
            )

            if cancel:
                last_movement = (
                    StockMovement.objects.order_by("-id")
                    .values_list("id", flat=True)
                    .first()
                )
                cancel_sale(
                    sale=sale,
                    user=self.admin,
                    reason=self.rng.choice(
                        [
                            "El cliente devolvió la pieza: no era compatible con su inyector.",
                            "Venta duplicada por error de digitación.",
                            "Cliente canceló el pedido antes de retirarlo.",
                        ]
                    ),
                )
                reversal_time = min(
                    when + timedelta(hours=26), self.now - timedelta(minutes=1)
                )

                def restamp():
                    StockMovement.objects.filter(id__gt=last_movement).update(
                        created_at=reversal_time, updated_at=reversal_time
                    )
                    Sale.objects.filter(pk=sale.pk).update(
                        cancelled_at=reversal_time, updated_at=reversal_time
                    )

                self._post_stamp.append(restamp)

        return action

    # -- Servicios --------------------------------------------------------

    def _plan_services(self):
        events = []

        # (cantidad, estado final, rango de días desde que se recibió hasta hoy)
        plan = (
            [("DELIVERED", (3, HISTORY_DAYS - 6))] * 26
            + [("READY", (2, 6))] * 4
            + [("IN_PROGRESS", (1, 4))] * 4
            + [("RECEIVED", (0, 2))] * 3
            + [("CANCELLED", (25, 40))]
        )

        for final_status, (low, high) in plan:
            received_offset = self.rng.randint(low, high)
            when = self._at(received_offset, hour=self.rng.randint(8, 11))
            events.append(
                (
                    when + timedelta(hours=self.rng.randint(2, 8)),
                    "servicio",
                    self._service_action(final_status, when),
                )
            )

        return events

    def _service_action(self, final_status, received_at):
        def action(when):
            user = self.users[ROLE_CUSTOMERS]
            customer = self.rng.choice(self.customers)
            injector = self.rng.choice(self.customer_injectors[customer.id])
            service_type, (price_low, price_high) = self.rng.choice(self.service_types)

            record = receive_injector(
                injector=injector, received_at=received_at, user=user
            )
            self._stamp(record, created_at=received_at, updated_at=received_at)

            record = InjectorServiceRecord.objects.get(pk=record.pk)
            record.service_type = service_type
            record.notes_before = self.rng.choice(NOTES_BEFORE)
            record.payment_method = self._weighted_payment()

            if final_status in ("RECEIVED", "CANCELLED"):
                record.save()
                if final_status == "CANCELLED":
                    record.observations = "Cliente decidió no reparar: el costo superaba el de un inyector nuevo."
                    record.save(update_fields=["observations"])
                    cancel_service(service_record=record, user=user)
                self._stamp(
                    InjectorServiceRecord.objects.filter(pk=record.pk), updated_at=when
                )
                return

            record.resistance = Decimal(self.rng.randint(280, 1250)) / 1000
            record.leakage = Decimal(self.rng.randint(4000, 38000)) / 1000
            record.inductance = Decimal(self.rng.randint(120, 540)) / 1000
            record.isolation = Decimal(self.rng.randint(55000, 99000)) / 1000

            if final_status != "IN_PROGRESS":
                record.notes_after = self.rng.choice(NOTES_AFTER)

            record.save()

            # El precio es la suma de las líneas de cobro y los accesorios
            # (punto 3 + 1B del plan del 2026-10-22).
            if final_status != "IN_PROGRESS":
                add_charge_line(
                    service_record=record,
                    service_type=service_type,
                    description="Mano de obra",
                    quantity=1,
                    unit_price=_round_to(
                        self.rng.randint(price_low, price_high), 500
                    ),
                    user=self.users[ROLE_ADMIN],
                )

            self._add_accessories(record, user)

            start_service(service_record=record, user=user)

            if final_status in ("READY", "DELIVERED"):
                mark_ready(service_record=record, user=user)

            delivered_at = None

            if final_status == "DELIVERED":
                delivered_at = min(
                    received_at + timedelta(days=self.rng.randint(1, 5), hours=3),
                    self.now - timedelta(minutes=1),
                )
                deliver_service(
                    service_record=record, delivered_at=delivered_at, user=user
                )

            self._stamp(
                InjectorServiceRecord.objects.filter(pk=record.pk),
                updated_at=delivered_at or when,
            )

        return action

    def _add_accessories(self, record, user):
        usable = [
            product
            for product in self.small_parts
            if current_stock(product) >= 3
        ]

        if not usable:
            return

        for product in self.rng.sample(usable, min(self.rng.randint(0, 3), len(usable))):
            add_service_accessory(
                service_record=record,
                product=product,
                quantity=self.rng.randint(1, 3),
                notes="",
                user=user,
            )

    # -- Conteos y ajustes ---------------------------------------------------

    def _plan_inventory_activity(self):
        return [
            (self._at(48, hour=15), "conteo anulado", self._cancelled_count_action()),
            (self._at(9, hour=16), "conteo aprobado", self._approved_count_action()),
            (self._at(1, hour=15), "conteo borrador", self._draft_count_action()),
            (self._at(1, hour=17), "ajustes de merma", self._wastage_action()),
        ]

    def _count_items(self, count, products, user, force_differences=0):
        differences_left = force_differences

        for product in products:
            stock = current_stock(product)
            counted = stock

            if differences_left > 0 and stock >= 6:
                counted = max(0, stock + self.rng.choice([-3, -2, -1, 1, 2]))
                differences_left -= 1

            InventoryCountItem.objects.create(
                inventory_count=count,
                product=product,
                counted_quantity=counted,
                created_by=user,
                updated_by=user,
            )

    def _approved_count_action(self):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            count = InventoryCount.objects.create(
                reference=f"CF-{when:%Y%m%d}-01",
                count_date=when.date(),
                notes="Conteo mensual de estantes A, B y C.",
                created_by=user,
                updated_by=user,
            )
            products = [
                product for product, _, _, _ in self.catalog
                if product.storage_location.code[0] in "ABC" and current_stock(product) > 0
            ][:12]
            self._count_items(count, products, user, force_differences=4)
            approve_inventory_count(inventory_count=count, user=user)
            self._stamp(
                InventoryCount.objects.filter(pk=count.pk),
                created_at=when - timedelta(hours=2),
                updated_at=when,
            )

        return action

    def _draft_count_action(self):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            count = InventoryCount.objects.create(
                reference=f"CF-{when:%Y%m%d}-02",
                count_date=when.date(),
                notes="Conteo en curso de consumibles y piezas pequeñas.",
                created_by=user,
                updated_by=user,
            )
            products = [p for p in self.small_parts if current_stock(p) > 0][:8]
            self._count_items(count, products, user, force_differences=3)
            self._stamp(
                InventoryCount.objects.filter(pk=count.pk),
                created_at=when,
                updated_at=when,
            )

        return action

    def _cancelled_count_action(self):
        def action(when):
            user = self.users[ROLE_INVENTORY]
            count = InventoryCount.objects.create(
                reference=f"CF-{when:%Y%m%d}-00",
                count_date=when.date(),
                notes="Conteo abandonado: se reinició con otro alcance.",
                created_by=user,
                updated_by=user,
            )
            products = [p for p, _, _, _ in self.catalog if current_stock(p) > 0][:3]
            self._count_items(count, products, user)
            cancel_inventory_count(inventory_count=count, user=user)
            self._stamp(
                InventoryCount.objects.filter(pk=count.pk),
                created_at=when,
                updated_at=when,
            )

        return action

    def _wastage_action(self):
        """
        Deja varios productos bajo su mínimo (y uno en cero) para que el
        dashboard y la alerta de stock bajo tengan qué mostrar.
        """

        def action(when):
            user = self.users[ROLE_INVENTORY]
            candidates = [
                product
                for product, _, _, _ in self.catalog
                if product.minimum_stock >= 3 and current_stock(product) > 0
            ]
            self.rng.shuffle(candidates)

            for index, product in enumerate(candidates[:6]):
                stock = current_stock(product)
                target = 0 if index == 0 else max(product.minimum_stock - 1, 0)
                reduction = stock - target

                if reduction > 0:
                    adjust_stock(
                        product=product,
                        quantity=-reduction,
                        user=user,
                        notes="Ajuste por merma y piezas dañadas en banco de pruebas.",
                    )

        return action

    # ------------------------------------------------------------------
    # Cierres de caja
    # ------------------------------------------------------------------

    def _create_cash_closings(self):
        """
        Cierra todas las semanas (sábado a viernes) ya terminadas salvo la
        más reciente, que queda pendiente para que el dashboard muestre
        el aviso "falta cerrar caja" y se pueda capturar /cash/new.
        """
        days_since_friday = (self.today.weekday() - 4) % 7
        last_friday = self.today - timedelta(days=days_since_friday)
        pending_start = last_friday - timedelta(days=6)

        first_start = self.today - timedelta(days=HISTORY_DAYS + 8)
        first_start -= timedelta(days=(first_start.weekday() - SATURDAY) % 7)

        week_start = first_start
        user = self.admin
        index = 0

        while week_start < pending_start:
            week_end = week_start + timedelta(days=6)
            expected = sum(expected_totals_by_method(week_start, week_end).values())

            if expected > 0:
                index += 1
                counted = expected
                reason = ""

                # Una de cada 4 semanas cuadra con una pequeña diferencia.
                if index % 4 == 0:
                    counted = expected - Decimal(self.rng.choice([500, 1000, 2500]))
                    reason = "Faltante de vuelto en caja chica; se repone con cargo al turno."

                closing = create_cash_closing(
                    week_start=week_start,
                    counted_total=counted,
                    difference_reason=reason,
                    notes="Cierre semanal revisado con recibos y vouchers.",
                    user=user,
                )
                closed_at = timezone.make_aware(
                    datetime.combine(week_end + timedelta(days=1), time(9, 30))
                )
                self._stamp(
                    CashClosing.objects.filter(pk=closing.pk),
                    created_at=min(closed_at, self.now),
                    updated_at=min(closed_at, self.now),
                )

            week_start += timedelta(days=7)

    # ------------------------------------------------------------------
    # Resumen
    # ------------------------------------------------------------------

    def _print_summary(self):
        low = sum(
            1
            for product, _, _, _ in self.catalog
            if current_stock(product) < product.minimum_stock
        )

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Datos de demostración listos."))
        self.stdout.write(f"  Productos:        {Product.objects.count()} ({low} bajo mínimo)")
        self.stdout.write(f"  Ubicaciones:      {StorageLocation.objects.count()}")
        self.stdout.write(f"  Proveedores:      {Supplier.objects.count()}")
        self.stdout.write(f"  Compras:          {Purchase.objects.count()}")
        self.stdout.write(f"  Ventas:           {Sale.objects.count()}")
        self.stdout.write(f"  Clientes:         {Customer.objects.count()}")
        self.stdout.write(f"  Servicios:        {InjectorServiceRecord.objects.count()}")
        self.stdout.write(f"  Movimientos:      {StockMovement.objects.count()}")
        self.stdout.write(f"  Conteos físicos:  {InventoryCount.objects.count()}")
        self.stdout.write(f"  Cierres de caja:  {CashClosing.objects.count()}")
        self.stdout.write("")
        self.stdout.write("Usuarios (todos con la misma contraseña):")

        for username, _, _, role, _ in DEMO_USERS:
            self.stdout.write(f"  {username:<18} rol {role}")

        self.stdout.write(f"  Contraseña: {DEMO_PASSWORD}")
