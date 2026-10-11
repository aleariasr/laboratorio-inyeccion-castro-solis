"""
Cálculo de montos de un documento (venta, servicio, proforma) con
descuento e impuesto al documento completo (decisión de la auditoría
2026-09-21, sección 3; puntos 15, 19 y 26):

    subtotal  →  − descuento (monto exacto o % del subtotal)
              =  base imponible
              →  + impuesto (% de la base)
              =  total

Todo se redondea a 2 decimales con ROUND_HALF_UP. Es una función pura:
no toca la base de datos, así la usan igual la venta en borrador (en
vivo), la confirmación (montos congelados), la factura y la proforma.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.db import models

CENT = Decimal("0.01")
HUNDRED = Decimal("100")

# IVA de Costa Rica. Ventas y servicios creados desde la API (las
# pantallas) arrancan con este impuesto, editable mientras están
# abiertos. El modelo guarda 0 por defecto: así los registros viejos y
# los que se crean por código no cambian (puntos 19 y 26).
DEFAULT_TAX_PERCENTAGE = Decimal("13.00")


class DiscountType(models.TextChoices):
    AMOUNT = "AMOUNT", "Monto"
    PERCENT = "PERCENT", "Porcentaje"


class DocumentAmountsError(ValueError):
    """Descuento o impuesto inválidos para el subtotal dado."""


@dataclass(frozen=True)
class DocumentAmounts:
    subtotal: Decimal
    discount_amount: Decimal
    taxable_base: Decimal
    tax_amount: Decimal
    total: Decimal


def _round(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def compute_document_amounts(
    subtotal,
    discount_type=DiscountType.AMOUNT,
    discount_value=Decimal("0"),
    tax_percentage=Decimal("0"),
):
    subtotal = _round(subtotal)
    discount_value = Decimal(discount_value)
    tax_percentage = Decimal(tax_percentage)

    if discount_value < 0:
        raise DocumentAmountsError("El descuento no puede ser negativo.")

    if tax_percentage < 0 or tax_percentage > HUNDRED:
        raise DocumentAmountsError("El impuesto debe estar entre 0 y 100 %.")

    if discount_type == DiscountType.PERCENT:
        if discount_value > HUNDRED:
            raise DocumentAmountsError(
                "El descuento en porcentaje no puede superar el 100 %."
            )

        discount_amount = _round(subtotal * discount_value / HUNDRED)
    elif discount_type == DiscountType.AMOUNT:
        discount_amount = _round(discount_value)
    else:
        raise DocumentAmountsError("Tipo de descuento inválido.")

    if discount_amount > subtotal:
        raise DocumentAmountsError(
            "El descuento no puede ser mayor que el subtotal."
        )

    taxable_base = subtotal - discount_amount
    tax_amount = _round(taxable_base * tax_percentage / HUNDRED)

    return DocumentAmounts(
        subtotal=subtotal,
        discount_amount=discount_amount,
        taxable_base=taxable_base,
        tax_amount=tax_amount,
        total=taxable_base + tax_amount,
    )
