"""Golden-byte snapshot for registry exports (run with repo venv python)."""
import json, sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[4] / "backend"
GOLDEN = Path(__file__).resolve().parent / "golden"
sys.path.insert(0, str(BACKEND))


def load(name, rel):
    return __import__(rel, fromlist=["*"])


def main():
    GOLDEN.mkdir(exist_ok=True)
    summary = {}
    targets = [
        ("ppr", "app.routers.process_properties_registry", "_EXPORT_COLUMNS"),
        ("par", "app.routers.product_actions_registry", "_EXPORT_COLUMNS"),
    ]
    for key, rel, cols_attr in targets:
        mod = load(f"golden_{key}", rel)
        columns = getattr(mod, cols_attr)
        row = {c: f"v_{c}" for c in columns}
        row[columns[0]] = 'weird;value"with\nlines'
        rows = [row, {c: "" for c in columns}]
        import inspect as _inspect
        _n = len(_inspect.signature(mod._csv_bytes).parameters)
        csv_b = mod._csv_bytes(rows, columns) if _n > 1 else mod._csv_bytes(rows)
        xlsx_b = mod._xlsx_bytes(rows, columns) if _n > 1 else mod._xlsx_bytes(rows)
        (GOLDEN / f"{key}_export.csv").write_bytes(csv_b)
        (GOLDEN / f"{key}_export.xlsx").write_bytes(xlsx_b)
        (GOLDEN / f"{key}_columns.json").write_text(json.dumps(columns, ensure_ascii=False, indent=2))
        summary[key] = {
            "columns": len(columns),
            "csv_sha256": __import__("hashlib").sha256(csv_b).hexdigest(),
            "xlsx_sha256": __import__("hashlib").sha256(xlsx_b).hexdigest(),
            "filename_workspace_csv": mod._export_filename("workspace", "csv"),
        }
    (GOLDEN / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
