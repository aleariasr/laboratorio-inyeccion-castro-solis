"""
Encuentra y corrige compras y costos en dólares con un tipo de cambio que
no es real (auditoría de compras en dólares, 2026-11-07, P9).

Antes de la corrección el formulario de compra dejaba el tipo de cambio en
1 al cambiar la moneda a dólares, y el backend lo aceptaba: un repuesto de
US$10 quedaba con precio de venta ₡10. La migración 0030 no puede saber
cuál era el tipo de cambio bueno, así que estos casos se corrigen aquí:

    # Lista lo que está mal (no cambia nada)
    python manage.py fix_purchase_exchange_rate

    # Muestra qué cambiaría en una compra (no cambia nada)
    python manage.py fix_purchase_exchange_rate --purchase 12 --rate 515.20

    # Lo aplica
    python manage.py fix_purchase_exchange_rate --purchase 12 --rate 515.20 --apply

Al corregir una compra:
- se le pone el tipo de cambio indicado (en una compra en colones, 1);
- sus costos en dólares con tipo de cambio inválido toman el mismo valor,
  salvo que se indique otro con --cost ID=TIPO;
- sus costos en colones quedan con 1;
- si tenía costos aplicados (y no está anulada), se recalculan con el
  mismo margen, así que el precio sugerido de sus productos queda bien.
  Funciona también en compras confirmadas: es la única vía para
  corregirlas, porque la pantalla ya no las deja editar.
"""

from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.inventory.exchange_rates import (
    CRC_EXCHANGE_RATE,
    USD_EXCHANGE_RATE_MAX,
    USD_EXCHANGE_RATE_MIN,
    is_valid_usd_exchange_rate,
)
from apps.inventory.models import (
    Currency,
    ImportCost,
    Purchase,
    PurchaseStatus,
)
from apps.inventory.selectors import effective_sale_price
from apps.inventory.services.costs import (
    CALCULABLE_STATUSES,
    calculate_purchase_costs,
)


def _parse_rate(value, label):
    try:
        rate = Decimal(value)
    except (InvalidOperation, TypeError):
        raise CommandError(f"{label}: «{value}» no es un número.")

    if not is_valid_usd_exchange_rate(rate):
        raise CommandError(
            f"{label}: el tipo de cambio debe estar entre "
            f"{USD_EXCHANGE_RATE_MIN} y {USD_EXCHANGE_RATE_MAX} "
            "colones por dólar."
        )

    return rate


def _invalid_usd_rate_q(prefix=""):
    return Q(**{f"{prefix}currency": Currency.USD}) & (
        Q(**{f"{prefix}exchange_rate__lt": USD_EXCHANGE_RATE_MIN})
        | Q(**{f"{prefix}exchange_rate__gt": USD_EXCHANGE_RATE_MAX})
    )


class Command(BaseCommand):
    help = (
        "Lista y corrige compras y costos en dólares con un tipo de "
        "cambio inválido, y recalcula sus precios sugeridos."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--purchase",
            type=int,
            help="ID de la compra a corregir.",
        )
        parser.add_argument(
            "--rate",
            help="Tipo de cambio correcto de la compra (colones por dólar).",
        )
        parser.add_argument(
            "--cost",
            action="append",
            default=[],
            metavar="ID=TIPO",
            help=(
                "Tipo de cambio de un costo en dólares de la compra, si "
                "no es el mismo de la compra. Se puede repetir."
            ),
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Guarda los cambios. Sin esto solo muestra qué cambiaría.",
        )

    def handle(self, *args, **options):
        if options["purchase"] is None:
            if options["rate"] or options["cost"] or options["apply"]:
                raise CommandError("--rate, --cost y --apply requieren --purchase.")

            self._list_problems()
            return

        self._fix_purchase(options)

    # Listado -----------------------------------------------------------

    def _list_problems(self):
        purchases = (
            Purchase.objects.filter(
                _invalid_usd_rate_q()
                | (Q(currency=Currency.CRC) & ~Q(exchange_rate=CRC_EXCHANGE_RATE))
            )
            .select_related("supplier")
            .order_by("purchase_date", "id")
        )
        costs = (
            ImportCost.objects.filter(
                _invalid_usd_rate_q()
                | (Q(currency=Currency.CRC) & ~Q(exchange_rate=CRC_EXCHANGE_RATE))
            )
            .exclude(purchase__in=purchases)
            .select_related("purchase", "category")
            .order_by("purchase_id", "id")
        )

        if not purchases and not costs:
            self.stdout.write(
                self.style.SUCCESS(
                    "No hay compras ni costos con tipo de cambio inválido."
                )
            )
            return

        if purchases:
            self.stdout.write("Compras con tipo de cambio inválido:")

            for purchase in purchases:
                has_calculation = purchase.product_cost_history.exists()
                self.stdout.write(
                    f"  #{purchase.id}  {purchase.invoice_number}  "
                    f"{purchase.supplier.name}  {purchase.purchase_date}  "
                    f"{purchase.get_status_display()}  "
                    f"{purchase.currency} {purchase.exchange_rate}"
                    f"{'  (con costos aplicados)' if has_calculation else ''}"
                )

        if costs:
            self.stdout.write("Costos con tipo de cambio inválido:")

            for cost in costs:
                self.stdout.write(
                    f"  costo #{cost.id}  compra #{cost.purchase_id} "
                    f"{cost.purchase.invoice_number}  {cost.category.name}  "
                    f"{cost.currency} {cost.amount}  "
                    f"tipo de cambio {cost.exchange_rate}"
                )

        self.stdout.write(
            "\nPara corregir una compra (y sus costos): "
            "fix_purchase_exchange_rate --purchase ID --rate TIPO [--apply]"
        )

    # Corrección --------------------------------------------------------

    def _fix_purchase(self, options):
        try:
            purchase = Purchase.objects.select_related("supplier").get(
                pk=options["purchase"]
            )
        except Purchase.DoesNotExist:
            raise CommandError(f"No existe la compra #{options['purchase']}.")

        if purchase.currency == Currency.USD:
            if not options["rate"]:
                raise CommandError("Una compra en dólares requiere --rate.")

            new_rate = _parse_rate(options["rate"], "--rate")
        else:
            if options["rate"] and Decimal(options["rate"]) != CRC_EXCHANGE_RATE:
                raise CommandError(
                    "La compra está en colones: su tipo de cambio es 1."
                )

            new_rate = CRC_EXCHANGE_RATE

        cost_rates = {}

        for entry in options["cost"]:
            cost_id, _, rate = entry.partition("=")

            try:
                cost_id = int(cost_id)
            except ValueError:
                raise CommandError(f"--cost «{entry}»: se esperaba ID=TIPO.")

            cost_rates[cost_id] = _parse_rate(rate, f"--cost {cost_id}")

        apply = options["apply"]

        with transaction.atomic():
            self._apply_fix(purchase, new_rate, cost_rates)

            if not apply:
                transaction.set_rollback(True)

        if apply:
            self.stdout.write(self.style.SUCCESS("Cambios guardados."))
        else:
            self.stdout.write(
                self.style.WARNING(
                    "No se guardó nada. Para aplicarlo, repetir con --apply."
                )
            )

    def _apply_fix(self, purchase, new_rate, cost_rates):
        purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
        user = purchase.updated_by or purchase.created_by

        self.stdout.write(
            f"Compra #{purchase.id} {purchase.invoice_number} "
            f"({purchase.get_status_display()}, {purchase.currency}): "
            f"tipo de cambio {purchase.exchange_rate} → {new_rate}"
        )

        purchase.exchange_rate = new_rate
        purchase.save(update_fields=["exchange_rate", "updated_at"])

        costs = {cost.id: cost for cost in purchase.import_costs.all()}

        unknown = set(cost_rates) - set(costs)

        if unknown:
            raise CommandError(
                "Estos costos no son de la compra: "
                + ", ".join(str(cost_id) for cost_id in sorted(unknown))
            )

        for cost in costs.values():
            if cost.currency == Currency.CRC:
                target = CRC_EXCHANGE_RATE
            elif cost.id in cost_rates:
                target = cost_rates[cost.id]
            elif not is_valid_usd_exchange_rate(cost.exchange_rate):
                target = new_rate
            else:
                continue

            if cost.exchange_rate != target:
                self.stdout.write(
                    f"  costo #{cost.id} {cost.currency} {cost.amount}: "
                    f"tipo de cambio {cost.exchange_rate} → {target}"
                )
                cost.exchange_rate = target
                cost.save(update_fields=["exchange_rate", "updated_at"])

        histories = list(
            purchase.product_cost_history.select_related("product").order_by("id")
        )

        if not histories:
            self.stdout.write("  Sin costos aplicados: no hay precios que recalcular.")
            return

        if purchase.status not in CALCULABLE_STATUSES:
            self.stdout.write(
                "  Compra anulada: su cálculo no define precios, no se recalcula."
            )
            return

        margin = histories[0].margin_percentage
        before = {
            history.product_id: (
                history.product,
                history.suggested_price,
                effective_sale_price(history.product),
            )
            for history in histories
        }

        new_histories = calculate_purchase_costs(
            purchase=purchase,
            margin_percentage=margin,
            user=user,
        )

        self.stdout.write(f"  Costos recalculados con margen {margin} %:")

        for history in new_histories:
            product, old_suggested, old_effective = before.get(
                history.product_id,
                (history.product, None, None),
            )
            product.refresh_from_db()
            new_effective = effective_sale_price(product)

            self.stdout.write(
                f"    {product.standard_code}: sugerido "
                f"₡{old_suggested} → ₡{history.suggested_price}; "
                f"precio de venta ₡{old_effective} → ₡{new_effective}"
                + (
                    " (precio manual, no cambia)"
                    if product.custom_sale_price is not None
                    else ""
                )
            )

        if purchase.status == PurchaseStatus.DRAFT:
            self.stdout.write(
                "  La compra es un borrador: el precio de venta cambia al confirmarla."
            )
