"""
PDF de reportes (puntos 2 + 27): el mismo banner y colores de la
proforma, el título del reporte con sus filtros, una secuencia de
bloques (tablas, listas de montos, texto) y, al final, un recuadro
"Revisado por / Fecha / Observaciones" para llenar a mano. Cada página
lleva el banner y el pie "Página X de Y"; las tablas largas repiten su
encabezado al pasar de página.

Una columna `writable` sale vacía, con una línea para anotar (por
ejemplo "Cantidad a pedir" en Bajo mínimo).

Lo usan los reportes (apps.core.views.report_pdfs), Movimientos y el
cierre de caja. No toca _build_itemized_document_pdf, que es de la
proforma y las facturas.
"""

from dataclasses import dataclass
from io import BytesIO

from django.http import FileResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from .pdf import (
    PROFORMA_BANNER_HEIGHT,
    PROFORMA_BRAND_BLUE,
    PROFORMA_BRAND_BLUE_SOFT,
    PROFORMA_MUTED_TEXT,
    PROFORMA_PAGE_MARGIN,
    PROFORMA_ROW_ALT,
    _draw_document_banner,
    _format_money,
)

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = PROFORMA_PAGE_MARGIN
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
CONTENT_TOP = PAGE_HEIGHT - PROFORMA_BANNER_HEIGHT - 10 * mm
# Debajo de esta altura va el pie (nota y número de página).
CONTENT_BOTTOM = 20 * mm

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_SIZE = 8.5

ROW_HEIGHT = 6.5 * mm
# Las tablas con una columna para escribir a mano llevan filas más
# altas: en 6.5 mm no cabe un número escrito con lapicero.
WRITABLE_ROW_HEIGHT = 8.5 * mm
HEADER_HEIGHT = 7.5 * mm
BLOCK_TITLE_HEIGHT = 7 * mm
CELL_PADDING = 2 * mm
BLOCK_GAP = 7 * mm
KEY_VALUES_WIDTH = 140 * mm
KEY_VALUES_LINE_HEIGHT = 6 * mm
TEXT_LINE_HEIGHT = 4.6 * mm
SIGNATURE_BOX_HEIGHT = 30 * mm

LINE_COLOR = colors.HexColor("#c9d4dc")

FOOTER_NOTE = "Laboratorio de Inyección Castro Solís · Documento interno"


@dataclass(frozen=True)
class Column:
    label: str
    # Peso relativo: el ancho real se reparte entre las columnas.
    width: float
    align: str = "left"
    # Columna vacía, con una línea para anotar a mano (punto 27).
    writable: bool = False


@dataclass(frozen=True)
class GroupRow:
    """Fila de encabezado de grupo dentro de una tabla (p. ej. una ubicación)."""

    label: str
    detail: str = ""


@dataclass(frozen=True)
class Table:
    columns: tuple
    # Cada fila es una tupla de textos (uno por columna) o un GroupRow.
    rows: list
    title: str = ""
    totals: tuple | None = None
    empty_message: str = "No hay datos para los filtros indicados."


@dataclass(frozen=True)
class KeyValues:
    # (etiqueta, valor) o (etiqueta, valor, True) para destacar la fila.
    rows: list
    title: str = ""


@dataclass(frozen=True)
class TextBlock:
    text: str
    title: str = ""


def build_report_pdf(*, title, blocks, subtitle_lines=(), banner_title="REPORTE"):
    buffer = BytesIO()

    generated_at = timezone.localtime(timezone.now())

    pdf = _NumberedCanvas(buffer, pagesize=letter, generated_at=generated_at)

    writer = _ReportWriter(
        pdf,
        banner_title=banner_title,
        generated_at=generated_at,
    )

    writer.heading(title, subtitle_lines)

    for block in blocks:
        writer.block(block)

    writer.signature_box()

    pdf.showPage()
    pdf.save()

    buffer.seek(0)
    return buffer


def report_pdf_response(buffer, filename):
    return FileResponse(
        buffer,
        as_attachment=True,
        filename=filename,
        content_type="application/pdf",
    )


def format_amount(value):
    """Monto en una celda de tabla: sin "CRC", que va en el subtítulo."""

    return _format_money(value)


def format_crc(value):
    return f"CRC {_format_money(value)}"


def format_date(value):
    return value.strftime("%d/%m/%Y")


def format_datetime(value):
    return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")


def format_date_range(date_from, date_to):
    if date_from and date_to:
        return f"Del {format_date(date_from)} al {format_date(date_to)}"

    if date_from:
        return f"Desde el {format_date(date_from)}"

    if date_to:
        return f"Hasta el {format_date(date_to)}"

    return "Todas las fechas"


def _fit(text, font, size, width):
    if stringWidth(text, font, size) <= width:
        return text

    while text and stringWidth(f"{text}…", font, size) > width:
        text = text[:-1]

    return f"{text.rstrip()}…"


class _NumberedCanvas(canvas.Canvas):
    """
    Guarda cada página hasta el final para conocer el total y pintar el
    pie "Página X de Y" (receta habitual de reportlab).
    """

    def __init__(self, *args, generated_at, **kwargs):
        super().__init__(*args, **kwargs)
        self._generated_at = generated_at
        self._page_states = []

    def showPage(self):
        self._page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._page_states)

        for number, state in enumerate(self._page_states, start=1):
            self.__dict__.update(state)
            self._draw_footer(number, total)
            canvas.Canvas.showPage(self)

        canvas.Canvas.save(self)

    def _draw_footer(self, number, total):
        self.setStrokeColor(LINE_COLOR)
        self.setLineWidth(0.5)
        self.line(MARGIN, 14 * mm, PAGE_WIDTH - MARGIN, 14 * mm)

        self.setFillColor(PROFORMA_MUTED_TEXT)
        self.setFont(FONT, 7.5)
        self.drawString(
            MARGIN,
            10 * mm,
            f"{FOOTER_NOTE} · Generado el "
            f"{self._generated_at.strftime('%d/%m/%Y %H:%M')}",
        )
        self.drawRightString(
            PAGE_WIDTH - MARGIN,
            10 * mm,
            f"Página {number} de {total}",
        )
        self.setFillColor(colors.black)


class _ReportWriter:
    """Pinta los bloques de arriba hacia abajo y pasa de página cuando no caben."""

    def __init__(self, pdf, *, banner_title, generated_at):
        self.pdf = pdf
        self.banner_title = banner_title
        self.generated_at = generated_at
        self.y = CONTENT_TOP
        self._draw_banner()

    def _draw_banner(self):
        _draw_document_banner(
            self.pdf,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            title=self.banner_title,
            generated_at=self.generated_at,
        )
        self.y = CONTENT_TOP

    def _new_page(self):
        self.pdf.showPage()
        self._draw_banner()

    def _ensure(self, height):
        """Pasa de página si `height` no cabe. Devuelve True si pasó."""

        if self.y - height < CONTENT_BOTTOM:
            self._new_page()
            return True

        return False

    def heading(self, title, subtitle_lines):
        pdf = self.pdf

        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.setFont(FONT_BOLD, 15)
        pdf.drawString(MARGIN, self.y - 5 * mm, title)
        self.y -= 9 * mm

        pdf.setFillColor(PROFORMA_MUTED_TEXT)
        pdf.setFont(FONT, 9)

        for line in subtitle_lines:
            for wrapped in simpleSplit(line, FONT, 9, CONTENT_WIDTH):
                pdf.drawString(MARGIN, self.y - 3.2 * mm, wrapped)
                self.y -= TEXT_LINE_HEIGHT

        pdf.setFillColor(colors.black)
        self.y -= BLOCK_GAP - 2 * mm

    def block(self, block):
        if isinstance(block, Table):
            self._table(block)
        elif isinstance(block, KeyValues):
            self._key_values(block)
        elif isinstance(block, TextBlock):
            self._text(block)
        else:
            raise TypeError(f"Bloque de reporte desconocido: {block!r}")

    def _block_title(self, title):
        pdf = self.pdf
        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.setFont(FONT_BOLD, 10.5)
        pdf.drawString(MARGIN, self.y - 4 * mm, title)
        pdf.setFillColor(colors.black)
        self.y -= BLOCK_TITLE_HEIGHT

    # ---- Tablas ---------------------------------------------------------

    def _table(self, table):
        columns = table.columns
        total_weight = sum(column.width for column in columns)
        widths = [CONTENT_WIDTH * column.width / total_weight for column in columns]
        row_height = (
            WRITABLE_ROW_HEIGHT
            if any(column.writable for column in columns)
            else ROW_HEIGHT
        )

        title_height = BLOCK_TITLE_HEIGHT if table.title else 0

        # El título, el encabezado y al menos dos filas van juntos.
        self._ensure(title_height + HEADER_HEIGHT + 2 * row_height)

        if table.title:
            self._block_title(table.title)

        self._table_header(columns, widths)

        if not table.rows:
            self.pdf.setFillColor(PROFORMA_MUTED_TEXT)
            self.pdf.setFont("Helvetica-Oblique", FONT_SIZE)
            self.pdf.drawString(
                MARGIN + CELL_PADDING,
                self._text_baseline(ROW_HEIGHT),
                table.empty_message,
            )
            self.pdf.setFillColor(colors.black)
            self.y -= ROW_HEIGHT

        stripe = 0

        for row in table.rows:
            is_group = isinstance(row, GroupRow)

            # Un grupo no queda solo al pie de la página: va con su
            # primera fila.
            needed = 2 * row_height if is_group else row_height

            if self._ensure(needed):
                if table.title:
                    self._block_title(f"{table.title} (continuación)")

                self._table_header(columns, widths)
                stripe = 0

            if is_group:
                self._group_row(row, row_height)
                stripe = 0
            else:
                if stripe % 2 == 1:
                    self._fill_row(row_height, PROFORMA_ROW_ALT)

                self._cells(
                    columns,
                    widths,
                    row,
                    row_height=row_height,
                    font=FONT,
                    draw_writable_lines=True,
                )
                stripe += 1

            self.y -= row_height

        if table.totals is not None:
            if self._ensure(ROW_HEIGHT + 1 * mm):
                self._table_header(columns, widths)

            self._fill_row(ROW_HEIGHT, PROFORMA_BRAND_BLUE)
            self.pdf.setFillColor(colors.white)
            self._cells(
                columns,
                widths,
                table.totals,
                row_height=ROW_HEIGHT,
                font=FONT_BOLD,
                draw_writable_lines=False,
                color=colors.white,
            )
            self.pdf.setFillColor(colors.black)
            self.y -= ROW_HEIGHT

        self.y -= BLOCK_GAP

    def _table_header(self, columns, widths):
        self._fill_row(HEADER_HEIGHT, PROFORMA_BRAND_BLUE)

        self._cells(
            columns,
            widths,
            [column.label.upper() for column in columns],
            row_height=HEADER_HEIGHT,
            font=FONT_BOLD,
            size=7.5,
            draw_writable_lines=False,
            color=colors.white,
            header=True,
        )

        self.y -= HEADER_HEIGHT

    def _group_row(self, row, row_height):
        pdf = self.pdf

        self._fill_row(row_height, PROFORMA_BRAND_BLUE_SOFT)

        baseline = self._text_baseline(row_height)

        pdf.setFillColor(PROFORMA_BRAND_BLUE)
        pdf.setFont(FONT_BOLD, FONT_SIZE)

        detail_width = (
            stringWidth(row.detail, FONT, FONT_SIZE) + 4 * mm
            if row.detail
            else 0
        )

        pdf.drawString(
            MARGIN + CELL_PADDING,
            baseline,
            _fit(
                row.label,
                FONT_BOLD,
                FONT_SIZE,
                CONTENT_WIDTH - 2 * CELL_PADDING - detail_width,
            ),
        )

        if row.detail:
            pdf.setFont(FONT, FONT_SIZE)
            pdf.drawRightString(
                MARGIN + CONTENT_WIDTH - CELL_PADDING,
                baseline,
                row.detail,
            )

        pdf.setFillColor(colors.black)

    def _fill_row(self, height, color):
        self.pdf.setFillColor(color)
        self.pdf.rect(
            MARGIN,
            self.y - height,
            CONTENT_WIDTH,
            height,
            stroke=0,
            fill=1,
        )
        self.pdf.setFillColor(colors.black)

    def _text_baseline(self, row_height, size=FONT_SIZE):
        # Centro de la fila menos media altura de mayúscula (~0.36 em).
        return self.y - row_height / 2 - size * 0.36

    def _cells(
        self,
        columns,
        widths,
        values,
        *,
        row_height,
        font,
        draw_writable_lines,
        size=FONT_SIZE,
        color=colors.black,
        header=False,
    ):
        pdf = self.pdf
        baseline = self._text_baseline(row_height, size)
        x = MARGIN

        for column, width, value in zip(columns, widths, values):
            if column.writable and not header:
                if draw_writable_lines:
                    pdf.setStrokeColor(LINE_COLOR)
                    pdf.setLineWidth(0.6)
                    line_y = self.y - row_height + 1.8 * mm
                    pdf.line(
                        x + CELL_PADDING,
                        line_y,
                        x + width - CELL_PADDING,
                        line_y,
                    )

                x += width
                continue

            text = _fit(str(value or ""), font, size, width - 2 * CELL_PADDING)

            pdf.setFillColor(color)
            pdf.setFont(font, size)

            if column.align == "right":
                pdf.drawRightString(x + width - CELL_PADDING, baseline, text)
            elif column.align == "center":
                pdf.drawCentredString(x + width / 2, baseline, text)
            else:
                pdf.drawString(x + CELL_PADDING, baseline, text)

            x += width

        pdf.setFillColor(colors.black)

    # ---- Montos y texto -------------------------------------------------

    def _key_values(self, block):
        pdf = self.pdf

        box_height = len(block.rows) * KEY_VALUES_LINE_HEIGHT + 4 * mm
        title_height = BLOCK_TITLE_HEIGHT if block.title else 0

        self._ensure(title_height + box_height)

        if block.title:
            self._block_title(block.title)

        pdf.setFillColor(PROFORMA_BRAND_BLUE_SOFT)
        pdf.roundRect(
            MARGIN,
            self.y - box_height,
            KEY_VALUES_WIDTH,
            box_height,
            2.5 * mm,
            stroke=0,
            fill=1,
        )

        line_top = self.y - 2 * mm

        for row in block.rows:
            label, value = row[0], row[1]
            emphasis = len(row) > 2 and row[2]

            baseline = line_top - KEY_VALUES_LINE_HEIGHT / 2 - 9 * 0.36

            pdf.setFont(FONT_BOLD if emphasis else FONT, 9)
            pdf.setFillColor(colors.black if emphasis else PROFORMA_MUTED_TEXT)
            label_width = (
                KEY_VALUES_WIDTH
                - 12 * mm
                - stringWidth(value, FONT_BOLD, 9)
            )
            pdf.drawString(
                MARGIN + 4 * mm,
                baseline,
                _fit(label, FONT_BOLD, 9, label_width),
            )

            pdf.setFillColor(colors.black)
            pdf.drawRightString(
                MARGIN + KEY_VALUES_WIDTH - 4 * mm,
                baseline,
                value,
            )

            line_top -= KEY_VALUES_LINE_HEIGHT

        pdf.setFillColor(colors.black)
        self.y -= box_height + BLOCK_GAP

    def _text(self, block):
        pdf = self.pdf
        lines = []

        for paragraph in block.text.splitlines() or [""]:
            lines.extend(simpleSplit(paragraph, FONT, 9, CONTENT_WIDTH) or [""])

        title_height = BLOCK_TITLE_HEIGHT if block.title else 0
        self._ensure(title_height + TEXT_LINE_HEIGHT)

        if block.title:
            self._block_title(block.title)

        pdf.setFont(FONT, 9)

        for line in lines:
            if self._ensure(TEXT_LINE_HEIGHT):
                pdf.setFont(FONT, 9)

            pdf.drawString(MARGIN, self.y - 3.2 * mm, line)
            self.y -= TEXT_LINE_HEIGHT

        self.y -= BLOCK_GAP

    # ---- Recuadro para llenar a mano (punto 27) -------------------------

    def signature_box(self):
        pdf = self.pdf

        self._ensure(SIGNATURE_BOX_HEIGHT)

        top = self.y
        left = MARGIN
        right = MARGIN + CONTENT_WIDTH

        pdf.setStrokeColor(LINE_COLOR)
        pdf.setLineWidth(0.8)
        pdf.roundRect(
            left,
            top - SIGNATURE_BOX_HEIGHT,
            CONTENT_WIDTH,
            SIGNATURE_BOX_HEIGHT,
            2.5 * mm,
            stroke=1,
            fill=0,
        )

        def label(x, y, text):
            pdf.setFillColor(PROFORMA_BRAND_BLUE)
            pdf.setFont(FONT_BOLD, 8.5)
            pdf.drawString(x, y, text)
            pdf.setFillColor(colors.black)

        def writing_line(x_start, x_end, y):
            pdf.setStrokeColor(LINE_COLOR)
            pdf.setLineWidth(0.6)
            pdf.line(x_start, y - 0.8 * mm, x_end, y - 0.8 * mm)

        first_y = top - 9 * mm
        label(left + 4 * mm, first_y, "Revisado por:")
        writing_line(left + 28 * mm, left + 108 * mm, first_y)
        label(left + 114 * mm, first_y, "Fecha:")
        writing_line(left + 126 * mm, right - 4 * mm, first_y)

        second_y = top - 18 * mm
        label(left + 4 * mm, second_y, "Observaciones:")
        writing_line(left + 30 * mm, right - 4 * mm, second_y)

        writing_line(left + 4 * mm, right - 4 * mm, top - 26 * mm)

        self.y -= SIGNATURE_BOX_HEIGHT
