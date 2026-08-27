#!/usr/bin/env python3
"""Дамп ЖИВОЙ OpenAPI-спеки приложения в файл (YAML/JSON).

Спека генерируется кодом и отдаётся защищённым эндпоинтом /api/openapi.json
(bearer + право уровня админки). Скрипт поднимает app in-process на временной
SQLite, сидит org_owner и забирает спеку через TestClient — ровно так же, как
это делает contract-suite и как сделал бы клиент с токеном.

Использование:
    python scripts/dump_openapi.py                       # build/openapi-live.yaml
    python scripts/dump_openapi.py --out docs/openapi.yaml
    python scripts/dump_openapi.py --format json --out build/openapi-live.json

Назначение: baseline для drift-check в CI (oasdiff), вход для
scripts/api_coverage_report.py, регенерация коммит-снапшота docs/openapi.yaml.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(REPO_ROOT / "build" / "openapi-live.yaml"))
    parser.add_argument("--format", choices=["yaml", "json"], default=None,
                        help="По умолчанию — по расширению --out (иначе yaml).")
    args = parser.parse_args()

    out_path = Path(args.out)
    fmt = args.format or ("json" if out_path.suffix == ".json" else "yaml")

    # Временная БД ДО импорта app; backend/ в sys.path для `import app.*`.
    db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    db.close()
    os.environ["PROCESS_DB_PATH"] = db.name
    sys.path.insert(0, str(BACKEND_DIR))

    from app.auth import create_access_token, create_user
    from app.storage import create_org_record, upsert_org_membership

    user = create_user("openapi_dump@local", "password")
    create_org_record("OpenAPI Dump Org", created_by=str(user["id"]), org_id="org_openapi_dump")
    upsert_org_membership("org_openapi_dump", str(user["id"]), "owner")
    token = create_access_token(str(user["id"]))

    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.api_docs_ru import build_ru_openapi

    response = TestClient(app).get("/api/openapi.json", headers={"Authorization": f"Bearer {token}"})
    if response.status_code != 200:
        print(f"ERROR: /api/openapi.json вернул {response.status_code}: {response.text[:300]}", file=sys.stderr)
        return 1
    raw_spec = response.json()
    spec = build_ru_openapi(raw_spec)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "json":
        out_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    else:
        import yaml

        out_path.write_text(yaml.safe_dump(spec, allow_unicode=True, sort_keys=True), encoding="utf-8")

    operations = sum(
        1
        for item in spec["paths"].values()
        for method in item
        if method in ("get", "post", "put", "patch", "delete", "head", "options")
    )
    print(f"OK: {len(spec['paths'])} paths / {operations} operations → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
