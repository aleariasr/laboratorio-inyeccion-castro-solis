from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128


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


def _truncate(value, max_length):
    value = str(value).strip()

    if len(value) <= max_length:
        return value

    return f"{value[: max_length - 3]}..."