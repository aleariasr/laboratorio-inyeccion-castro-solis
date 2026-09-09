"""
Lector de archivos .DBF (dBase III / FoxPro sin memo) para la migración
legacy. No usamos una librería externa: se probó con `dbfread` sobre los
archivos reales del cliente y cuenta mal los registros en varios de
ellos (corta la lectura en el primer byte 0x1A que encuentra, tratándolo
como fin de archivo, cuando en realidad estos archivos lo usan disperso
como relleno de registros nunca escritos).

Este lector trata un byte 0x1A como "este único registro está vacío/sin
escribir" y sigue leyendo el resto del archivo — el fin real solo se
asume al llegar al final físico del área de registros (según el tamaño
de registro declarado en el header).
"""

from __future__ import annotations

import datetime
import struct
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DbfField:
    name: str
    type: str
    length: int
    decimals: int


@dataclass
class DbfReadResult:
    fields: list[DbfField]
    numrecords_header: int
    n_slots: int
    active: list[dict]
    deleted_count: int
    blank_filler_count: int
    errors: list[tuple[int, str]] = field(default_factory=list)


def read_dbf(path: str | Path, encoding: str = "cp850") -> DbfReadResult:
    path = Path(path)
    with path.open("rb") as f:
        header = f.read(32)
        numrecords = struct.unpack("<I", header[4:8])[0]
        header_size = struct.unpack("<H", header[8:10])[0]
        record_size = struct.unpack("<H", header[10:12])[0]

        fields: list[DbfField] = []
        f.seek(32)
        while True:
            fd = f.read(32)
            if fd[0:1] == b"\x0d" or len(fd) < 32:
                break
            name = fd[0:11].split(b"\x00")[0].decode("ascii", "replace")
            fields.append(
                DbfField(
                    name=name,
                    type=chr(fd[11]),
                    length=fd[16],
                    decimals=fd[17],
                )
            )

        f.seek(header_size)
        raw = f.read()

    n_slots = len(raw) // record_size
    active: list[dict] = []
    deleted_count = 0
    blank_filler_count = 0
    errors: list[tuple[int, str]] = []

    for i in range(n_slots):
        chunk = raw[i * record_size : (i + 1) * record_size]
        flag = chunk[0:1]

        if flag == b"\x1a":
            blank_filler_count += 1
            continue
        if flag == b"*":
            deleted_count += 1
            continue
        if flag != b" ":
            errors.append((i, "bad_flag"))
            continue

        offset = 1
        record: dict = {}
        record_ok = True
        for fld in fields:
            raw_val = chunk[offset : offset + fld.length]
            offset += fld.length
            try:
                record[fld.name] = _parse_field(fld, raw_val, encoding)
            except (UnicodeDecodeError, ValueError) as exc:
                errors.append((i, f"field_error:{fld.name}:{exc}"))
                record_ok = False
                break
        if record_ok:
            active.append(record)

    return DbfReadResult(
        fields=fields,
        numrecords_header=numrecords,
        n_slots=n_slots,
        active=active,
        deleted_count=deleted_count,
        blank_filler_count=blank_filler_count,
        errors=errors,
    )


def _parse_field(fld: DbfField, raw_val: bytes, encoding: str):
    if fld.type == "C":
        return raw_val.decode(encoding, errors="strict").rstrip()
    if fld.type == "N":
        text = raw_val.decode("ascii", errors="strict").strip()
        if text == "":
            return None
        return float(text) if fld.decimals else int(text)
    if fld.type == "D":
        text = raw_val.decode("ascii", errors="strict").strip()
        if text == "":
            return None
        return datetime.date(int(text[0:4]), int(text[4:6]), int(text[6:8]))
    if fld.type == "L":
        return raw_val.decode("ascii", errors="replace")
    return raw_val
