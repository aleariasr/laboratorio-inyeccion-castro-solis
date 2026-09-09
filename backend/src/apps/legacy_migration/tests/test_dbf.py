import datetime
import os
import struct
import tempfile

from django.test import SimpleTestCase

from apps.legacy_migration.dbf import read_dbf


def _field_descriptor(name: str, ftype: str, length: int, decimals: int = 0) -> bytes:
    name_bytes = name.encode("ascii").ljust(11, b"\x00")
    return name_bytes + ftype.encode("ascii") + b"\x00" * 4 + bytes([length, decimals]) + b"\x00" * 14


def _build_dbf(fields: list[tuple[str, str, int, int]], records: list[bytes]) -> bytes:
    field_descriptors = b"".join(_field_descriptor(*f) for f in fields)
    header_size = 32 + len(field_descriptors) + 1
    record_size = 1 + sum(f[2] for f in fields)

    header = bytearray(32)
    header[0] = 0x03
    struct.pack_into("<I", header, 4, len(records))
    struct.pack_into("<H", header, 8, header_size)
    struct.pack_into("<H", header, 10, record_size)

    body = b"".join(records)
    return bytes(header) + field_descriptors + b"\x0d" + body


class ReadDbfTests(SimpleTestCase):
    def _write_dbf(self, fields, records) -> str:
        content = _build_dbf(fields, records)
        fd, path = tempfile.mkstemp(suffix=".DBF")
        with os.fdopen(fd, "wb") as f:
            f.write(content)
        self.addCleanup(os.unlink, path)
        return path

    def test_reads_active_records_and_skips_deleted(self):
        fields = [("CODE", "C", 5, 0), ("QTY", "N", 3, 0)]
        records = [
            b" " + b"ABC  " + b"  7",   # activo
            b"*" + b"XYZ  " + b"  0",   # borrado (soft-delete)
            b" " + b"DEF12" + b" 42",   # activo
        ]
        path = self._write_dbf(fields, records)

        result = read_dbf(path)

        self.assertEqual(len(result.active), 2)
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(result.blank_filler_count, 0)
        self.assertEqual(result.errors, [])
        self.assertEqual(result.active[0], {"CODE": "ABC", "QTY": 7})
        self.assertEqual(result.active[1], {"CODE": "DEF12", "QTY": 42})

    def test_stray_0x1a_byte_does_not_truncate_the_rest_of_the_file(self):
        """
        Regresión: dbfread (y una primera versión propia de este lector)
        cortaban la lectura en el primer byte 0x1A que encontraban,
        tratándolo como fin de archivo. En los .DBF reales del cliente
        ese byte aparece disperso como relleno de registros nunca
        escritos, con datos reales *después* de él — si un lector se
        detiene ahí, pierde la mayoría del archivo silenciosamente.
        """
        fields = [("CODE", "C", 5, 0), ("QTY", "N", 3, 0)]
        records = [
            b" " + b"ABC  " + b"  7",       # activo
            b"\x1a" + b"\x00" * 8,          # relleno en blanco (0x1A), NO es fin de archivo
            b" " + b"DEF12" + b" 42",       # activo, viene DESPUÉS del 0x1A
        ]
        path = self._write_dbf(fields, records)

        result = read_dbf(path)

        self.assertEqual(result.blank_filler_count, 1)
        self.assertEqual(len(result.active), 2)
        self.assertEqual(result.active[1], {"CODE": "DEF12", "QTY": 42})

    def test_parses_date_and_null_numeric_fields(self):
        fields = [("CODE", "C", 3, 0), ("DATE", "D", 8, 0), ("AMT", "N", 6, 2)]
        records = [
            b" " + b"ABC" + b"20040512" + b"      ",  # AMT en blanco -> None
        ]
        path = self._write_dbf(fields, records)

        result = read_dbf(path)

        self.assertEqual(len(result.active), 1)
        rec = result.active[0]
        self.assertEqual(rec["DATE"], datetime.date(2004, 5, 12))
        self.assertIsNone(rec["AMT"])

    def test_records_with_undecodable_bytes_are_reported_as_errors_not_silently_dropped(self):
        fields = [("QTY", "N", 3, 0)]
        records = [
            b" " + b"\xff\xfe\x00",  # no es un número ascii válido
        ]
        path = self._write_dbf(fields, records)

        result = read_dbf(path)

        self.assertEqual(result.active, [])
        self.assertEqual(len(result.errors), 1)
