from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import AuditModel


class CashClosing(AuditModel):
    """
    Cierre de caja semanal (sábado a viernes).

    Desde los puntos 21 + 22, la diferencia compara lo contado contra el
    efectivo físico esperado: expected_total + saldo de caja chica.

    Cubre los 4 métodos de pago (efectivo, tarjeta, transferencia,
    otro — ver PaymentMethod en apps.core.models), no solo efectivo:
    el negocio concilia efectivo contado + vouchers del datafono +
    comprobantes de transferencia contra lo registrado en el sistema,
    todo junto. Se crea una sola vez por semana: expected_total (y su
    desglose por método, expected_cash/expected_card/
    expected_transfer/expected_other) se calcula y se guarda ("se
    fija") en el momento del cierre, a partir de las ventas y
    servicios confirmados/entregados en ese rango de fechas. No se
    recalcula después aunque esas ventas o servicios se editen más
    tarde — un cierre ya hecho es un registro histórico.
    created_by/created_at (de AuditModel) son quién y cuándo se hizo
    el cierre; no existe edición posterior.
    """

    week_start = models.DateField(
        unique=True,
        help_text="Sábado de inicio de la semana que cubre este cierre.",
    )

    week_end = models.DateField(
        help_text="Viernes de cierre (week_start + 6 días).",
    )

    expected_total = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text=(
            "Total esperado según ventas y servicios confirmados/entregados "
            "esa semana, sumando los 4 métodos de pago. Calculado y fijado "
            "al momento del cierre."
        ),
    )

    expected_cash = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Desglose de expected_total: solo lo pagado en efectivo.",
    )

    expected_card = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Desglose de expected_total: solo lo pagado con tarjeta.",
    )

    expected_transfer = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Desglose de expected_total: solo lo pagado por transferencia.",
    )

    expected_other = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Desglose de expected_total: otros métodos de pago.",
    )

    # Punto 18. Lo cobrado de impuestos está dentro de expected_total
    # (es dinero que entró), pero no es del negocio: se le debe a
    # Hacienda. Se fija al cerrar, igual que el resto. El ingreso del
    # negocio es expected_total − expected_tax (no se guarda: se deriva).
    expected_tax = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        help_text=(
            "Impuestos cobrados esa semana (ventas y servicios), incluidos "
            "en expected_total. No son ingreso del negocio."
        ),
    )

    expected_discount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        help_text=(
            "Descuentos dados esa semana. Informativo: ya están restados "
            "de expected_total."
        ),
    )

    # Caja chica (puntos 21 + 22). El fondo de la semana se hereda del
    # cierre anterior (next_petty_cash_opening) o, la primera vez, se
    # escribe al cerrar. Saldo = fondo − salidas y efectivo físico
    # esperado = expected_total + saldo se derivan (CashClosingSerializer).
    petty_cash_opening = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Fondo de caja chica al inicio de la semana.",
    )

    petty_cash_outflows = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Suma de las salidas de caja chica de la semana.",
    )

    next_petty_cash_opening = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        default=0,
        validators=[MinValueValidator(Decimal("0"))],
        help_text="Fondo de caja chica con el que arranca la semana siguiente.",
    )

    counted_total = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
        help_text=(
            "Total contado/verificado físicamente al hacer el cierre "
            "(efectivo + vouchers de tarjeta + comprobantes de transferencia "
            "+ otros, todo junto en un solo monto)."
        ),
    )

    difference = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        help_text="counted_total menos expected_total.",
    )

    difference_reason = models.TextField(
        blank=True,
        help_text="Obligatorio cuando difference no es cero.",
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "cash_closings"
        verbose_name = "Cierre de caja"
        verbose_name_plural = "Cierres de caja"
        ordering = ["-week_start"]

    def __str__(self):
        return f"Cierre {self.week_start:%Y-%m-%d} — {self.week_end:%Y-%m-%d}"


class PettyCashMovement(AuditModel):
    """
    Salida de caja chica (puntos 21 + 22): un gasto pagado con el fondo
    de la semana. Solo salidas, sin entradas ni reposiciones: el fondo se
    define en cada cierre. Pertenece a la semana de caja de su fecha y no
    se puede registrar ni borrar si esa semana ya está cerrada.
    """

    date = models.DateField()

    amount = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    reason = models.CharField(max_length=255)

    class Meta:
        db_table = "cash_petty_cash_movements"
        verbose_name = "Salida de caja chica"
        verbose_name_plural = "Salidas de caja chica"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.date:%Y-%m-%d} {self.reason} ({self.amount})"
