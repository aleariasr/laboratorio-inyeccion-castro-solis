from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128

from apps.core.money import DiscountType, compute_document_amounts
from apps.customers.selectors import service_amounts
from apps.inventory.selectors import effective_sale_price
from apps.sales.selectors import sale_amounts


def build_product_labels_pdf(*, products):
    buffer = BytesIO()

    pdf = canvas.Canvas(
        buffer,
        pagesize=letter,
    )

    page_width, page_height = letter

    label_width = 95 * mm
    label_height = 45 * mm
    margin_x = 10 * mm
    margin_y = 12 * mm
    gap_x = 5 * mm
    gap_y = 6 * mm

    columns = 2
    x_positions = [
        margin_x,
        margin_x + label_width + gap_x,
    ]

    y = page_height - margin_y - label_height
    column = 0

    for product in products:
        x = x_positions[column]

        draw_product_label(
            pdf=pdf,
            product=product,
            x=x,
            y=y,
            width=label_width,
            height=label_height,
        )

        column += 1

        if column >= columns:
            column = 0
            y -= label_height + gap_y

        if y < margin_y:
            pdf.showPage()
            y = page_height - margin_y - label_height
            column = 0

    pdf.save()

    buffer.seek(0)
    return buffer


def draw_product_label(
    *,
    pdf,
    product,
    x,
    y,
    width,
    height,
):
    location_code = product.storage_location.code

    pdf.rect(
        x,
        y,
        width,
        height,
    )

    padding = 5 * mm
    text_x = x + padding
    current_y = y + height - padding - 6

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(
        text_x,
        current_y,
        location_code,
    )

    current_y -= 14

    barcode = code128.Code128(
        location_code,
        barHeight=10 * mm,
        barWidth=0.45 * mm,
        humanReadable=False,
    )

    barcode.drawOn(
        pdf,
        text_x,
        current_y - 8,
    )

    current_y -= 19

    pdf.setFont("Helvetica", 7)
    pdf.drawString(
        text_x,
        current_y,
        location_code,
    )

    current_y -= 11

    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(
        text_x,
        current_y,
        product.standard_code,
    )

    current_y -= 12

    pdf.setFont("Helvetica", 9)
    pdf.drawString(
        text_x,
        current_y,
        _truncate(product.name, 42),
    )

    if product.description:
        current_y -= 11
        pdf.setFont("Helvetica", 8)
        pdf.drawString(
            text_x,
            current_y,
            _truncate(product.description, 55),
        )


# Ancho para el nombre de una línea de proforma o factura: desde la
# columna del nombre hasta antes del precio más largo que cabe.
DOCUMENT_LINE_NAME_WIDTH = 105 * mm
DOCUMENT_LINE_FONT_SIZE = 9


def _fit_width(text, max_width, font="Helvetica", size=DOCUMENT_LINE_FONT_SIZE):
    if stringWidth(text, font, size) <= max_width:
        return text

    while text and stringWidth(f"{text}...", font, size) > max_width:
        text = text[:-1]

    return f"{text.rstrip()}..."


def _document_line_name(product, quantity=1):
    """
    Texto de una línea de proforma o factura: "Nombre (cód. X) × 3". El
    código propio (punto 16) y la cantidad siempre se ven completos; si
    no cabe, se recorta solo el nombre.
    """

    suffix = ""

    if product.own_code:
        suffix += f" (cód. {product.own_code})"

    if quantity != 1:
        suffix += f" × {quantity}"

    name_width = DOCUMENT_LINE_NAME_WIDTH - stringWidth(
        suffix,
        "Helvetica",
        DOCUMENT_LINE_FONT_SIZE,
    )

    return f"{_fit_width(product.name, name_width)}{suffix}"


def _truncate(value, max_length):
    value = str(value).strip()

    if len(value) <= max_length:
        return value

    return f"{value[: max_length - 3]}..."


PROFORMA_PAGE_MARGIN = 20 * mm
PROFORMA_ROW_HEIGHT = 7 * mm
# Deja lugar de sobra debajo de la última fila para la barra de total
# (10mm) y el pie de página (posición fija, ver el final de
# build_proforma_pdf) sin que se encimen, incluso en el peor caso en
# que la última fila cae justo en este límite.
PROFORMA_BOTTOM_MARGIN = 40 * mm
PROFORMA_BANNER_HEIGHT = 32 * mm
PROFORMA_TABLE_HEADER_HEIGHT = 8 * mm

# Mismos colores de marca que usa el frontend (ver
# frontend/src/app/globals.css: --color-brand-blue y
# --color-primary-soft), para que el PDF se vea como una extensión
# del banner de la aplicación en vez de un documento genérico.
PROFORMA_BRAND_BLUE = colors.HexColor("#075184")
PROFORMA_BRAND_BLUE_SOFT = colors.HexColor("#eaf3f8")
PROFORMA_ROW_ALT = colors.HexColor("#f5f8fa")
PROFORMA_MUTED_TEXT = colors.HexColor("#5b6b76")


def _document_columns(page_width):
    return (
        PROFORMA_PAGE_MARGIN + 3 * mm,
        PROFORMA_PAGE_MARGIN + 32 * mm,
        page_width - PROFORMA_PAGE_MARGIN - 3 * mm,
    )


def _draw_document_banner(pdf, page_width, page_height, *, title, generated_at):
    pdf.setFillColor(PROFORMA_BRAND_BLUE)
    pdf.rect(
        0,
        page_height - PROFORMA_BANNER_HEIGHT,
        page_width,
        PROFORMA_BANNER_HEIGHT,
        stroke=0,
        fill=1,
    )

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(
        PROFORMA_PAGE_MARGIN,
        page_height - 13 * mm,
        "LABORATORIO DE INYECCIÓN",
    )

    pdf.setFont("Helvetica-Bold", 21)
    pdf.drawString(
        PROFORMA_PAGE_MARGIN,
        page_height - 23 * mm,
        "CASTRO SOLÍS",
    )

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawRightString(
        page_width - PROFORMA_PAGE_MARGIN,
        page_height - 15 * mm,
        title,
    )

    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(
        page_width - PROFORMA_PAGE_MARGIN,
        page_height - 22 * mm,
        generated_at.strftime("%d/%m/%Y %H:%M"),
    )

    pdf.setFillColor(colors.black)


def _draw_customer_info_box(pdf, page_width, top_y, *, content_width, customer):
    box_rows = [("Cliente", customer.display_name)]

    if customer.identification:
        box_rows.append(("Identificación", customer.identification))

    if customer.phone:
        box_rows.append(("Teléfono", customer.phone))

    if customer.email:
        box_rows.append(("Correo", customer.email))

    box_height = len(box_rows) * 5.6 * mm + 4 * mm

    pdf.setFillColor(PROFORMA_BRAND_BLUE_SOFT)
    pdf.roundRect(
        PROFORMA_PAGE_MARGIN,
        top_y - box_height,
        content_width,
        box_height,
        2.5 * mm,
        stroke=0,
        fill=1,
    )

    inner_y = top_y - 6.5 * mm

    for label, value in box_rows:
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.drawString(PROFORMA_PAGE_MARGIN + 5 * mm, inner_y, f"{label}:")

        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(colors.black)
        pdf.drawString(
            PROFORMA_PAGE_MARGIN + 35 * mm,
            inner_y,
            _truncate(value, 70),
        )

        inner_y -= 5.6 * mm

    pdf.setFillColor(colors.black)

    return top_y - box_height - 9 * mm


def _draw_document_footer(pdf, page_width, *, note):
    pdf.setFillColor(PROFORMA_MUTED_TEXT)
    pdf.setFont("Helvetica-Oblique", 7.5)
    pdf.drawCentredString(
        page_width / 2,
        PROFORMA_PAGE_MARGIN / 2,
        note,
    )
    pdf.setFillColor(colors.black)


def _build_itemized_document_pdf(
    *,
    title,
    footer_note,
    rows,
    customer=None,
    price_missing_label="Sin precio definido",
    summary=None,
):
    """
    Documento genérico de una tabla Código/Producto/Precio + total,
    con el mismo banner y colores de marca — lo usan tanto la
    proforma como la factura de venta. `rows` es una lista de
    (código, nombre, precio_o_None).

    `summary` (opcional, punto 19): DocumentAmountsSummary con los
    montos del documento. Si trae descuento o impuesto, se pintan
    Subtotal / Descuento / Impuesto sobre la barra del total, omitiendo
    los que valen cero, y el TOTAL es el del resumen. Sin summary el
    documento queda igual que antes.
    """
    buffer = BytesIO()

    pdf = canvas.Canvas(buffer, pagesize=letter)

    page_width, page_height = letter

    content_width = page_width - 2 * PROFORMA_PAGE_MARGIN

    column_code_x, column_name_x, column_price_x = _document_columns(page_width)

    generated_at = timezone.localtime(timezone.now())

    def draw_banner():
        _draw_document_banner(
            pdf, page_width, page_height, title=title, generated_at=generated_at,
        )

    def draw_table_header(top_y):
        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.rect(
            PROFORMA_PAGE_MARGIN,
            top_y - PROFORMA_TABLE_HEADER_HEIGHT,
            content_width,
            PROFORMA_TABLE_HEADER_HEIGHT,
            stroke=0,
            fill=1,
        )

        text_y = top_y - PROFORMA_TABLE_HEADER_HEIGHT + 2.6 * mm
        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(column_code_x, text_y, "CÓDIGO")
        pdf.drawString(column_name_x, text_y, "PRODUCTO")
        pdf.drawRightString(column_price_x, text_y, "PRECIO")

        pdf.setFillColor(colors.black)

        return top_y - PROFORMA_TABLE_HEADER_HEIGHT - 5 * mm

    draw_banner()

    y = page_height - PROFORMA_BANNER_HEIGHT - 12 * mm

    if customer is not None:
        y = _draw_customer_info_box(
            pdf, page_width, y, content_width=content_width, customer=customer,
        )

    y = draw_table_header(y)
    pdf.setFont("Helvetica", 9)

    total = Decimal("0")

    for index, (code, name, price) in enumerate(rows):
        if y < PROFORMA_BOTTOM_MARGIN:
            pdf.showPage()
            draw_banner()
            y = page_height - PROFORMA_BANNER_HEIGHT - 12 * mm
            y = draw_table_header(y)
            pdf.setFont("Helvetica", 9)

        if index % 2 == 1:
            pdf.setFillColor(PROFORMA_ROW_ALT)
            pdf.rect(
                PROFORMA_PAGE_MARGIN,
                y - 2 * mm,
                content_width,
                PROFORMA_ROW_HEIGHT,
                stroke=0,
                fill=1,
            )
            pdf.setFillColor(colors.black)

        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(column_code_x, y, code)

        pdf.setFont("Helvetica", 9)
        pdf.drawString(column_name_x, y, _fit_width(name, DOCUMENT_LINE_NAME_WIDTH))

        if price is not None:
            pdf.drawRightString(column_price_x, y, f"CRC {_format_money(price)}")
            total += price
        else:
            pdf.setFillColor(PROFORMA_MUTED_TEXT)
            pdf.drawRightString(column_price_x, y, price_missing_label)
            pdf.setFillColor(colors.black)

        y -= PROFORMA_ROW_HEIGHT

    y -= 3 * mm

    if summary is not None:
        total = summary.amounts.total
        summary_lines = summary.lines()

        if summary_lines:
            summary_height = len(summary_lines) * 5 * mm + 2 * mm

            if y - summary_height < PROFORMA_BOTTOM_MARGIN:
                pdf.showPage()
                draw_banner()
                y = page_height - PROFORMA_BANNER_HEIGHT - 12 * mm

            pdf.setFont("Helvetica", 9)

            for label, amount_text in summary_lines:
                pdf.setFillColor(PROFORMA_MUTED_TEXT)
                pdf.drawString(column_name_x, y, label)
                pdf.setFillColor(colors.black)
                pdf.drawRightString(column_price_x, y, amount_text)
                y -= 5 * mm

            y -= 2 * mm

    total_bar_height = 10 * mm
    pdf.setFillColor(PROFORMA_BRAND_BLUE)
    pdf.rect(
        PROFORMA_PAGE_MARGIN,
        y - total_bar_height,
        content_width,
        total_bar_height,
        stroke=0,
        fill=1,
    )

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(
        column_price_x,
        y - total_bar_height + 3.2 * mm,
        f"TOTAL: CRC {_format_money(total)}",
    )
    pdf.setFillColor(colors.black)

    _draw_document_footer(pdf, page_width, note=footer_note)

    pdf.save()

    buffer.seek(0)
    return buffer


def build_proforma_pdf(
    *,
    items,
    customer=None,
    discount_type=DiscountType.AMOUNT,
    discount_value=Decimal("0"),
    tax_percentage=Decimal("0"),
):
    """
    items: lista de (producto, cantidad). Mismo formato de línea que la
    factura de venta: "Nombre × 3" y el importe de la línea. Un producto
    sin precio sale como "Sin precio definido" y no suma al total.

    Descuento e impuesto al documento (punto 15), con el mismo cálculo y
    el mismo resumen que la factura de venta. Lanza DocumentAmountsError
    si el descuento supera el subtotal de las líneas con precio.
    """

    rows = []

    for product, quantity in items:
        unit_price = effective_sale_price(product)

        rows.append(
            (
                product.standard_code,
                _document_line_name(product, quantity),
                unit_price * quantity if unit_price is not None else None,
            )
        )

    subtotal = sum(
        (amount for _code, _name, amount in rows if amount is not None),
        Decimal("0"),
    )

    return _build_itemized_document_pdf(
        title="PROFORMA",
        footer_note="Proforma generada automáticamente. Precios sujetos a cambio sin previo aviso.",
        rows=rows,
        customer=customer,
        summary=DocumentAmountsSummary(
            amounts=compute_document_amounts(
                subtotal,
                discount_type,
                discount_value,
                tax_percentage,
            ),
            tax_percentage=tax_percentage,
            discount_percentage=(
                discount_value
                if discount_type == DiscountType.PERCENT
                else None
            ),
        ),
    )


class DocumentAmountsSummary:
    """
    Montos de un documento para el PDF: el resultado de
    compute_document_amounts más los porcentajes, para rotular
    "Descuento (10 %)" e "Impuesto (13 %)".
    """

    def __init__(self, *, amounts, tax_percentage, discount_percentage=None):
        self.amounts = amounts
        self.tax_percentage = tax_percentage
        self.discount_percentage = discount_percentage

    def lines(self):
        has_discount = self.amounts.discount_amount > 0
        has_tax = self.amounts.tax_amount > 0

        if not has_discount and not has_tax:
            return []

        lines = [("Subtotal", f"CRC {_format_money(self.amounts.subtotal)}")]

        if has_discount:
            label = (
                f"Descuento ({_format_percentage(self.discount_percentage)} %)"
                if self.discount_percentage is not None
                else "Descuento"
            )
            lines.append(
                (label, f"- CRC {_format_money(self.amounts.discount_amount)}")
            )

        if has_tax:
            lines.append(
                (
                    f"Impuesto ({_format_percentage(self.tax_percentage)} %)",
                    f"CRC {_format_money(self.amounts.tax_amount)}",
                )
            )

        return lines


def _format_percentage(value):
    # 13.00 → "13", 12.50 → "12.5"
    text = f"{Decimal(value):f}"

    return text.rstrip("0").rstrip(".") if "." in text else text


def build_sale_invoice_pdf(*, sale):
    rows = []

    for item in sale.items.select_related("product").all():
        rows.append(
            (
                item.product.standard_code,
                _document_line_name(item.product, item.quantity),
                item.unit_price * item.quantity,
            )
        )

    customer = sale.customer

    return _build_itemized_document_pdf(
        title="FACTURA",
        footer_note=(
            "Comprobante interno de la empresa, sin validez fiscal ante el "
            "Ministerio de Hacienda."
        ),
        rows=rows,
        customer=customer,
        summary=DocumentAmountsSummary(
            amounts=sale_amounts(sale),
            tax_percentage=sale.tax_percentage,
            discount_percentage=(
                sale.discount_value
                if sale.discount_type == DiscountType.PERCENT
                else None
            ),
        ),
    )


def build_service_invoice_pdf(*, service_record, accessories):
    buffer = BytesIO()

    pdf = canvas.Canvas(buffer, pagesize=letter)

    page_width, page_height = letter

    content_width = page_width - 2 * PROFORMA_PAGE_MARGIN

    _, _, column_price_x = _document_columns(page_width)

    generated_at = timezone.localtime(timezone.now())

    _draw_document_banner(
        pdf, page_width, page_height, title="FACTURA", generated_at=generated_at,
    )

    y = page_height - PROFORMA_BANNER_HEIGHT - 12 * mm

    injector = service_record.injector
    customer = injector.customer

    y = _draw_customer_info_box(
        pdf, page_width, y, content_width=content_width, customer=customer,
    )

    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(PROFORMA_BRAND_BLUE)
    pdf.drawString(PROFORMA_PAGE_MARGIN, y, "Inyector:")

    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.black)
    pdf.drawString(
        PROFORMA_PAGE_MARGIN + 35 * mm,
        y,
        injector.injector_number,
    )

    y -= 10 * mm

    # Detalle del cobro (punto 3 + 1B del plan del 2026-10-22): las líneas
    # de cobro y los accesorios, cada uno con su importe. Un accesorio en
    # 0 sale como "Incluido" (así quedaron los de servicios anteriores al
    # cobro por líneas, cuyo precio ya los incluía).
    detail_rows = [
        (
            line.description
            if line.quantity == 1
            else f"{line.description} × {line.quantity}",
            f"CRC {_format_money(line.unit_price * line.quantity)}",
        )
        for line in service_record.charge_lines.all()
    ]

    for accessory in accessories:
        own_code = (
            f" (cód. {accessory.product.own_code})"
            if accessory.product.own_code
            else ""
        )
        quantity = f" × {accessory.quantity}" if accessory.quantity != 1 else ""
        amount = accessory.unit_price * accessory.quantity

        detail_rows.append(
            (
                f"{accessory.product.standard_code} — "
                f"{accessory.product.name}{own_code}{quantity}",
                f"CRC {_format_money(amount)}" if amount > 0 else "Incluido",
            )
        )

    if detail_rows:
        header_height = 8 * mm
        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.rect(
            PROFORMA_PAGE_MARGIN,
            y - header_height,
            content_width,
            header_height,
            stroke=0,
            fill=1,
        )

        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(
            PROFORMA_PAGE_MARGIN + 3 * mm,
            y - header_height + 2.6 * mm,
            "DETALLE",
        )
        pdf.drawRightString(column_price_x, y - header_height + 2.6 * mm, "IMPORTE")
        pdf.setFillColor(colors.black)

        y -= header_height + 5 * mm

        for index, (label, amount_text) in enumerate(detail_rows):
            if y < PROFORMA_BOTTOM_MARGIN:
                pdf.showPage()
                _draw_document_banner(
                    pdf,
                    page_width,
                    page_height,
                    title="FACTURA",
                    generated_at=generated_at,
                )
                y = page_height - PROFORMA_BANNER_HEIGHT - 12 * mm

            if index % 2 == 1:
                pdf.setFillColor(PROFORMA_ROW_ALT)
                pdf.rect(
                    PROFORMA_PAGE_MARGIN,
                    y - 2 * mm,
                    content_width,
                    PROFORMA_ROW_HEIGHT,
                    stroke=0,
                    fill=1,
                )
                pdf.setFillColor(colors.black)

            pdf.setFont("Helvetica", 9)
            pdf.drawString(
                PROFORMA_PAGE_MARGIN + 3 * mm,
                y,
                _fit_width(label, DOCUMENT_LINE_NAME_WIDTH + 20 * mm),
            )
            pdf.drawRightString(column_price_x, y, amount_text)

            y -= PROFORMA_ROW_HEIGHT

        y -= 3 * mm

    # Punto 26: con descuento o impuesto, Subtotal / Descuento /
    # Impuesto van arriba de la barra y la barra muestra lo cobrado.
    amounts = service_amounts(service_record)
    summary_lines = []

    if amounts is not None:
        summary_lines = DocumentAmountsSummary(
            amounts=amounts,
            tax_percentage=service_record.tax_percentage,
            discount_percentage=(
                service_record.discount_value
                if service_record.discount_type == DiscountType.PERCENT
                else None
            ),
        ).lines()

    if summary_lines:
        pdf.setFont("Helvetica", 9)

        for label, amount_text in summary_lines:
            pdf.setFillColor(PROFORMA_MUTED_TEXT)
            pdf.drawString(PROFORMA_PAGE_MARGIN + 3 * mm, y, label)
            pdf.setFillColor(colors.black)
            pdf.drawRightString(column_price_x, y, amount_text)
            y -= 5 * mm

        y -= 3 * mm

    total_bar_height = 12 * mm
    pdf.setFillColor(PROFORMA_BRAND_BLUE)
    pdf.rect(
        PROFORMA_PAGE_MARGIN,
        y - total_bar_height,
        content_width,
        total_bar_height,
        stroke=0,
        fill=1,
    )

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(
        PROFORMA_PAGE_MARGIN + 3 * mm,
        y - total_bar_height + 7 * mm,
        "TOTAL",
    )

    price_text = (
        f"CRC {_format_money(amounts.total)}"
        if amounts is not None
        else "Sin precio definido"
    )

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawRightString(
        column_price_x,
        y - total_bar_height + 4 * mm,
        price_text,
    )

    pdf.setFillColor(colors.black)

    _draw_document_footer(
        pdf,
        page_width,
        note=(
            "Comprobante interno de la empresa, sin validez fiscal ante el "
            "Ministerio de Hacienda."
        ),
    )

    pdf.save()

    buffer.seek(0)
    return buffer


def _format_money(value):
    quantized = Decimal(value).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    sign = "-" if quantized < 0 else ""
    quantized = abs(quantized)

    integer_part, _, decimal_part = f"{quantized:.2f}".partition(".")
    decimal_part = decimal_part.rstrip("0")

    grouped_digits = []

    for index, digit in enumerate(reversed(integer_part)):
        if index and index % 3 == 0:
            grouped_digits.append(" ")

        grouped_digits.append(digit)

    grouped_integer = "".join(reversed(grouped_digits))

    if decimal_part:
        return f"{sign}{grouped_integer}.{decimal_part}"

    return f"{sign}{grouped_integer}"