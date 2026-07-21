from dataclasses import dataclass
from io import BytesIO
from typing import Callable, TypeVar

from reportlab.graphics.barcode import code128
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from apps.inventory.models import (
    Product,
    StorageLocation,
)


MAX_LABELS_PER_DOCUMENT = 200

PAGE_WIDTH, PAGE_HEIGHT = A4

PAGE_MARGIN_X = 8 * mm
PAGE_MARGIN_Y = 8 * mm

LABEL_COLUMNS = 3
LABEL_ROWS = 7

LABEL_GAP_X = 3 * mm
LABEL_GAP_Y = 3 * mm

LABEL_WIDTH = (
    PAGE_WIDTH
    - (PAGE_MARGIN_X * 2)
    - (
        LABEL_GAP_X
        * (LABEL_COLUMNS - 1)
    )
) / LABEL_COLUMNS

LABEL_HEIGHT = (
    PAGE_HEIGHT
    - (PAGE_MARGIN_Y * 2)
    - (
        LABEL_GAP_Y
        * (LABEL_ROWS - 1)
    )
) / LABEL_ROWS

LABELS_PER_PAGE = (
    LABEL_COLUMNS
    * LABEL_ROWS
)

LABEL_PADDING_X = 4 * mm

LABEL_CONTENT_WIDTH = (
    LABEL_WIDTH
    - (LABEL_PADDING_X * 2)
)


@dataclass(frozen=True)
class ProductLabel:
    product_id: int
    standard_code: str
    product_name: str
    location_code: str


@dataclass(frozen=True)
class LocationLabel:
    location_id: int
    location_code: str


LabelType = TypeVar("LabelType")


def build_product_labels(
    products: list[Product],
) -> list[ProductLabel]:
    return [
        ProductLabel(
            product_id=product.id,
            standard_code=product.standard_code,
            product_name=(
                product.name
                or product.description
                or "Sin descripción"
            ),
            location_code=(
                product.storage_location.code
                if product.storage_location
                else "SIN UBICACIÓN"
            ),
        )
        for product in products
    ]


def build_location_labels(
    locations: list[StorageLocation],
) -> list[LocationLabel]:
    return [
        LocationLabel(
            location_id=location.id,
            location_code=location.code,
        )
        for location in locations
    ]


def generate_product_labels_pdf(
    labels: list[ProductLabel],
) -> BytesIO:
    return _generate_labels_pdf(
        labels=labels,
        draw_label=_draw_product_label,
    )


def generate_location_labels_pdf(
    labels: list[LocationLabel],
) -> BytesIO:
    return _generate_labels_pdf(
        labels=labels,
        draw_label=_draw_location_label,
    )


def _generate_labels_pdf(
    *,
    labels: list[LabelType],
    draw_label: Callable[
        [
            Canvas,
            LabelType,
            float,
            float,
        ],
        None,
    ],
) -> BytesIO:
    buffer = BytesIO()

    pdf = Canvas(
        buffer,
        pagesize=A4,
    )

    for index, label in enumerate(labels):
        position_on_page = (
            index
            % LABELS_PER_PAGE
        )

        if (
            index > 0
            and position_on_page == 0
        ):
            pdf.showPage()

        row = (
            position_on_page
            // LABEL_COLUMNS
        )

        column = (
            position_on_page
            % LABEL_COLUMNS
        )

        x = (
            PAGE_MARGIN_X
            + column
            * (
                LABEL_WIDTH
                + LABEL_GAP_X
            )
        )

        y = (
            PAGE_HEIGHT
            - PAGE_MARGIN_Y
            - LABEL_HEIGHT
            - row
            * (
                LABEL_HEIGHT
                + LABEL_GAP_Y
            )
        )

        draw_label(
            pdf,
            label,
            x,
            y,
        )

    pdf.save()
    buffer.seek(0)

    return buffer


def _draw_product_label(
    pdf: Canvas,
    label: ProductLabel,
    x: float,
    y: float,
) -> None:
    center_x = (
        x
        + LABEL_WIDTH / 2
    )

    _draw_label_border(
        pdf=pdf,
        x=x,
        y=y,
    )

    location_text = _fit_text(
        text=label.location_code,
        font_name="Helvetica-Bold",
        font_size=9,
        maximum_width=LABEL_CONTENT_WIDTH,
    )

    pdf.setFont(
        "Helvetica-Bold",
        9,
    )

    pdf.drawCentredString(
        center_x,
        y + LABEL_HEIGHT - 5.5 * mm,
        f"Ubicación: {location_text}",
    )

    standard_code_text = _fit_text(
        text=label.standard_code,
        font_name="Helvetica-Bold",
        font_size=11,
        maximum_width=LABEL_CONTENT_WIDTH,
    )

    pdf.setFont(
        "Helvetica-Bold",
        11,
    )

    pdf.drawCentredString(
        center_x,
        y + LABEL_HEIGHT - 11 * mm,
        standard_code_text,
    )

    product_name_text = _fit_text(
        text=label.product_name,
        font_name="Helvetica",
        font_size=7,
        maximum_width=LABEL_CONTENT_WIDTH,
    )

    pdf.setFont(
        "Helvetica",
        7,
    )

    pdf.drawCentredString(
        center_x,
        y + LABEL_HEIGHT - 15.5 * mm,
        product_name_text,
    )

    barcode = _build_barcode(
        value=label.standard_code,
        maximum_width=LABEL_CONTENT_WIDTH,
        bar_height=8.5 * mm,
    )

    barcode_x = (
        center_x
        - barcode.width / 2
    )

    barcode.drawOn(
        pdf,
        barcode_x,
        y + 6.5 * mm,
    )

    barcode_text = _fit_text(
        text=label.standard_code,
        font_name="Helvetica-Bold",
        font_size=6.5,
        maximum_width=LABEL_CONTENT_WIDTH,
    )

    pdf.setFont(
        "Helvetica-Bold",
        6.5,
    )

    pdf.drawCentredString(
        center_x,
        y + 3.2 * mm,
        barcode_text,
    )


def _draw_location_label(
    pdf: Canvas,
    label: LocationLabel,
    x: float,
    y: float,
) -> None:
    center_x = (
        x
        + LABEL_WIDTH / 2
    )

    _draw_label_border(
        pdf=pdf,
        x=x,
        y=y,
    )

    location_text = _fit_text(
        text=label.location_code,
        font_name="Helvetica-Bold",
        font_size=20,
        maximum_width=LABEL_CONTENT_WIDTH,
    )

    pdf.setFont(
        "Helvetica-Bold",
        20,
    )

    pdf.drawCentredString(
        center_x,
        y + LABEL_HEIGHT - 9 * mm,
        location_text,
    )

    barcode = _build_barcode(
        value=label.location_code,
        maximum_width=LABEL_CONTENT_WIDTH,
        bar_height=11 * mm,
    )

    barcode_x = (
        center_x
        - barcode.width / 2
    )

    barcode.drawOn(
        pdf,
        barcode_x,
        y + 7.5 * mm,
    )

    pdf.setFont(
        "Helvetica-Bold",
        8,
    )

    pdf.drawCentredString(
        center_x,
        y + 3.5 * mm,
        location_text,
    )


def _draw_label_border(
    *,
    pdf: Canvas,
    x: float,
    y: float,
) -> None:
    pdf.setLineWidth(0.45)

    pdf.roundRect(
        x,
        y,
        LABEL_WIDTH,
        LABEL_HEIGHT,
        2 * mm,
        stroke=1,
        fill=0,
    )


def _build_barcode(
    *,
    value: str,
    maximum_width: float,
    bar_height: float,
) -> code128.Code128:
    bar_width = 0.32 * mm

    barcode = code128.Code128(
        value,
        barHeight=bar_height,
        barWidth=bar_width,
        humanReadable=False,
    )

    if barcode.width <= maximum_width:
        return barcode

    adjusted_bar_width = (
        bar_width
        * maximum_width
        / barcode.width
    )

    return code128.Code128(
        value,
        barHeight=bar_height,
        barWidth=adjusted_bar_width,
        humanReadable=False,
    )


def _fit_text(
    *,
    text: str,
    font_name: str,
    font_size: float,
    maximum_width: float,
) -> str:
    normalized_text = " ".join(
        str(text).split(),
    )

    if (
        stringWidth(
            normalized_text,
            font_name,
            font_size,
        )
        <= maximum_width
    ):
        return normalized_text

    ellipsis = "..."

    available_width = (
        maximum_width
        - stringWidth(
            ellipsis,
            font_name,
            font_size,
        )
    )

    shortened_text = normalized_text

    while (
        shortened_text
        and stringWidth(
            shortened_text,
            font_name,
            font_size,
        )
        > available_width
    ):
        shortened_text = (
            shortened_text[:-1]
        )

    return (
        shortened_text.rstrip()
        + ellipsis
    )
