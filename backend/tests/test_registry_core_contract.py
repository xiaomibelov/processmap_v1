"""Контрактный тест контура refactor/registry-core-v1.

Фиксирует byte-совместимость экспорта реестров (PPR/PAR) с golden-файлами
и то, что оба роутера построены на app.services.registry_core.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPO_ROOT / ".planning" / "contours" / "refactor" / "registry-core-v1" / "golden"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_zip_sha(data: bytes) -> str:
    """sha256 по канонической сериализации zip: имена записей в порядке +
    несжатые байты + compress_type (без zip-метаданных времени)."""
    import zipfile

    digest = hashlib.sha256()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            digest.update(info.filename.encode("utf-8"))
            digest.update(str(info.compress_type).encode("ascii"))
            digest.update(archive.read(info.filename))
    return digest.hexdigest()


def _load_golden(name: str):
    return json.loads((GOLDEN_DIR / name).read_text(encoding="utf-8"))


def _rows_from_golden_csv(golden_csv: Path, columns):
    text = golden_csv.read_bytes().decode("utf-8-sig")
    parsed = list(csv.reader(io.StringIO(text), delimiter=";", quotechar='"'))
    if not parsed:
        raise AssertionError("empty golden csv")
    if list(parsed[0]) != list(columns):
        raise AssertionError(f"golden csv header mismatch: {parsed[0]} != {columns}")
    return [dict(zip(columns, row)) for row in parsed[1:]]


class RegistryCoreContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.routers import process_properties_registry as ppr_mod
        from app.routers import product_actions_registry as par_mod
        from app.services import registry_core

        cls.ppr = ppr_mod
        cls.par = par_mod
        cls.registry_core = registry_core
        cls.summary = _load_golden("summary.json")

    def test_configs_match_golden_columns(self):
        for module, golden_name in ((self.ppr, "ppr"), (self.par, "par")):
            golden_columns = _load_golden(f"{golden_name}_columns.json")
            config = module._REGISTRY_CORE_CONFIG
            self.assertEqual(list(config.export_columns), list(golden_columns))
            self.assertEqual(list(module._EXPORT_COLUMNS), list(golden_columns))

    def test_export_bytes_match_golden(self):
        for module, golden_name in ((self.ppr, "ppr"), (self.par, "par")):
            config = module._REGISTRY_CORE_CONFIG
            columns = _load_golden(f"{golden_name}_columns.json")
            rows = _rows_from_golden_csv(GOLDEN_DIR / f"{golden_name}_export.csv", columns)
            with self.subTest(registry=golden_name, kind="csv"):
                got = self.registry_core.csv_bytes(columns, rows)
                self.assertEqual(
                    _sha256(got),
                    self.summary[golden_name]["csv_sha256"],
                    "csv bytes diverged from golden",
                )
            with self.subTest(registry=golden_name, kind="xlsx"):
                # zip-метаданные (date_time записей) в golden вшиты моментом
                # генерации, поэтому сравниваем канонический контент архива:
                # порядок имён записей + несжатые байты каждой записи.
                got = self.registry_core.xlsx_bytes(config, rows)
                self.assertEqual(
                    _canonical_zip_sha(got),
                    _canonical_zip_sha((GOLDEN_DIR / f"{golden_name}_export.xlsx").read_bytes()),
                    "xlsx archive content diverged from golden",
                )
                # golden самосогласован с summary.json по сырым байтам.
                self.assertEqual(
                    _sha256((GOLDEN_DIR / f"{golden_name}_export.xlsx").read_bytes()),
                    self.summary[golden_name]["xlsx_sha256"],
                )

    def test_export_filename_matches_golden(self):
        for module, golden_name in ((self.ppr, "ppr"), (self.par, "par")):
            config = module._REGISTRY_CORE_CONFIG
            expected = self.summary[golden_name]["filename_workspace_csv"]
            self.assertTrue(
                expected.startswith(f"{config.filename_prefix}-workspace-"),
                f"golden filename prefix diverged: {expected}",
            )
            for ext in ("csv", "xlsx"):
                filename = self.registry_core.export_filename(config, "workspace", ext)
                self.assertTrue(
                    re.fullmatch(rf"{config.filename_prefix}-workspace-\d{{8}}-\d{{4}}\.{ext}", filename),
                    f"unexpected filename shape: {filename}",
                )

    def test_routers_are_thin_adapters_over_registry_core(self):
        for module in (self.ppr, self.par):
            for fn_name in (
                "query",
                "export_csv",
                "export_xlsx",
            ):
                fn = getattr(module, self._endpoint_attr(module, fn_name))
                self.assertEqual(
                    fn.__module__,
                    "app.services.registry_core",
                    f"{module.__name__}.{fn_name} endpoint must be built by registry_core",
                )

    @staticmethod
    def _endpoint_attr(module, kind: str) -> str:
        base = (
            "process_properties_registry"
            if "properties" in module.__name__
            else "product_actions_registry"
        )
        if kind == "query":
            return f"query_{base}"
        verb, ext = kind.split("_", 1)
        return f"{verb}_{base}_{ext}"

    def test_config_xlsx_params(self):
        ppr_cfg = self.ppr._REGISTRY_CORE_CONFIG
        par_cfg = self.par._REGISTRY_CORE_CONFIG
        self.assertEqual(ppr_cfg.xlsx_sheet_name, "Process properties")
        self.assertEqual(par_cfg.xlsx_sheet_name, "Product actions")
        self.assertEqual(len(ppr_cfg.xlsx_column_widths), 16)
        self.assertEqual(len(par_cfg.xlsx_column_widths), 22)
        self.assertEqual(ppr_cfg.filename_prefix, "process-properties")
        self.assertEqual(par_cfg.filename_prefix, "product-actions")
