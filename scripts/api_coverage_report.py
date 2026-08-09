#!/usr/bin/env python3
"""Отчёт о покрытии OpenAPI-спеки тестами (аналог swagger-coverage, Этап 2).

Вход:
- факты вызовов: build/api-coverage-output/calls.jsonl
  (пишет pytest --api-coverage, см. backend/tests/coverage_recorder.py):
  {"method", "path" (конкретный, с id), "status", "test"}
- спека: ЖИВАЯ (по умолчанию дамп scripts/dump_openapi.py; можно --spec-url
  для забора с живого сервера, напр. http://localhost:8011/api/openapi.json
  с --spec-token).

По каждой операции: covered / partial / not_covered — по тому, какие из
ЗАДОКУМЕНТИРОВАННЫХ 2xx/4xx статусов реально встречались в вызовах тестов.
Статусы, встреченные вне документации (напр. 500 или незадекларированный 404),
учитываются отдельно (undocumented_statuses) — это сигнал дрейфа контракта.

Выход:
- build/api-coverage-report.html — для людей (таблица операций, %, статусы,
  сводка по тегам);
- build/api-coverage-results.json — машиночитаемый (для агента-генератора
  недостающих тестов).

Запуск:
    cd backend && pytest --api-coverage && cd ..
    python scripts/api_coverage_report.py
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")
SUCCESS_OR_CLIENT_ERROR = re.compile(r"^(2\d\d|4\d\d)$")


def load_spec(args) -> dict:
    if args.spec_url:
        request = urllib.request.Request(args.spec_url)
        if args.spec_token:
            request.add_header("Authorization", f"Bearer {args.spec_token}")
        with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    spec_path = Path(args.spec)
    if not spec_path.exists():
        print(f"ERROR: спека не найдена: {spec_path}\n"
              f"Сгенерируйте из живого приложения: python scripts/dump_openapi.py --format json --out {spec_path}",
              file=sys.stderr)
        raise SystemExit(2)
    text = spec_path.read_text(encoding="utf-8")
    if spec_path.suffix in (".yaml", ".yml"):
        import yaml

        return yaml.safe_load(text)
    return json.loads(text)


def compile_path_templates(spec: dict) -> list:
    """[(method, regex, operation)] — для матчинга конкретных путей на шаблоны."""
    matchers = []
    for path, item in spec.get("paths", {}).items():
        pattern = re.sub(r"\{[^/]+\}", r"[^/]+", path.rstrip("/") or "/")
        regex = re.compile(f"^{pattern}/?$")
        for method, operation in item.items():
            if method in HTTP_METHODS:
                matchers.append((method.upper(), regex, path, operation))
    return matchers


def documented_statuses(operation: dict) -> list:
    """Задокументированные 2xx/4xx (+default как 'default')."""
    result = []
    for code in (operation.get("responses") or {}):
        code = str(code)
        if SUCCESS_OR_CLIENT_ERROR.match(code):
            result.append(code)
        elif code == "default":
            result.append("default")
    return sorted(set(result))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--calls", default=str(REPO_ROOT / "build" / "api-coverage-output" / "calls.jsonl"))
    parser.add_argument("--spec", default=str(REPO_ROOT / "build" / "openapi-live.json"))
    parser.add_argument("--spec-url", default=None, help="Забрать спеку с живого сервера вместо файла")
    parser.add_argument("--spec-token", default=None, help="Bearer-токен для --spec-url")
    parser.add_argument("--out-json", default=str(REPO_ROOT / "build" / "api-coverage-results.json"))
    parser.add_argument("--out-html", default=str(REPO_ROOT / "build" / "api-coverage-report.html"))
    args = parser.parse_args()

    spec = load_spec(args)
    matchers = compile_path_templates(spec)

    # --- читаем факты вызовов ---
    calls_path = Path(args.calls)
    calls = []
    if calls_path.exists():
        for line in calls_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                calls.append(json.loads(line))
    else:
        print(f"WARNING: нет фактов вызовов: {calls_path} (запустите pytest --api-coverage)", file=sys.stderr)

    # --- агрегация по операциям ---
    per_operation = {}
    for method, _regex, path, operation in matchers:
        key = (method, path)
        per_operation[key] = {
            "method": method,
            "path": path,
            "operation_id": operation.get("operationId"),
            "tags": operation.get("tags") or ["untagged"],
            "documented_statuses": documented_statuses(operation),
            "seen_statuses": set(),
            "undocumented_statuses": set(),
            "calls": 0,
            "tests": set(),
        }

    unmatched = []
    for call in calls:
        concrete = call["path"].rstrip("/") or "/"
        hit = None
        for method, regex, path, _operation in matchers:
            if method == call["method"].upper() and regex.match(concrete):
                hit = (method, path)
                break
        if hit is None:
            unmatched.append(call)
            continue
        bucket = per_operation[hit]
        status = str(call["status"])
        bucket["calls"] += 1
        if call.get("test"):
            bucket["tests"].add(call["test"])
        documented = set(bucket["documented_statuses"])
        status_class = f"{status[0]}xx"
        class_match = any(code != "default" and code[0] == status[0] for code in documented)
        if status in documented or "default" in documented or class_match:
            bucket["seen_statuses"].add(status)
        else:
            bucket["undocumented_statuses"].add(status)

    # --- классификация ---
    operations_out = []
    counts = {"covered": 0, "partial": 0, "not_covered": 0}
    by_tag = defaultdict(lambda: {"total": 0, "covered": 0, "partial": 0, "not_covered": 0})
    for key in sorted(per_operation, key=lambda k: (k[1], k[0])):
        bucket = per_operation[key]
        documented_2xx_4xx = [c for c in bucket["documented_statuses"] if c != "default"]
        seen_documented = sorted(set(bucket["seen_statuses"]) & set(documented_2xx_4xx))
        if bucket["calls"] == 0:
            status = "not_covered"
        elif documented_2xx_4xx and len(seen_documented) == len(documented_2xx_4xx):
            status = "covered"
        elif not documented_2xx_4xx:  # документирован только default/5xx — считаем по факту успешных вызовов
            status = "covered" if any(s.startswith("2") for s in bucket["seen_statuses"]) else "partial"
        else:
            status = "partial"
        counts[status] += 1
        for tag in bucket["tags"]:
            by_tag[tag]["total"] += 1
            by_tag[tag][status] += 1
        operations_out.append({
            "method": bucket["method"],
            "path": bucket["path"],
            "operation_id": bucket["operation_id"],
            "tags": bucket["tags"],
            "status": status,
            "documented_statuses": bucket["documented_statuses"],
            "seen_statuses": sorted(bucket["seen_statuses"]),
            "undocumented_statuses": sorted(bucket["undocumented_statuses"]),
            "calls": bucket["calls"],
            "tests": len(bucket["tests"]),
        })

    total = len(operations_out)
    percent = round(100.0 * counts["covered"] / total, 1) if total else 0.0
    exercised = counts["covered"] + counts["partial"]
    percent_exercised = round(100.0 * exercised / total, 1) if total else 0.0

    results = {
        "summary": {
            "operations_total": total,
            "covered": counts["covered"],
            "partial": counts["partial"],
            "not_covered": counts["not_covered"],
            "percent_covered": percent,
            "percent_exercised": percent_exercised,
            "calls_recorded": len(calls),
            "calls_unmatched": len(unmatched),
        },
        "by_tag": {
            tag: {
                **stats,
                "percent_covered": round(100.0 * stats["covered"] / stats["total"], 1) if stats["total"] else 0.0,
            }
            for tag, stats in sorted(by_tag.items())
        },
        "operations": operations_out,
        "unmatched_calls": unmatched[:200],
    }

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    Path(args.out_html).write_text(render_html(results), encoding="utf-8")

    print(f"Покрытие: {counts['covered']}/{total} covered ({percent}%), "
          f"partial={counts['partial']}, not_covered={counts['not_covered']} "
          f"(exercised {percent_exercised}%), вызовов: {len(calls)}, вне спеки: {len(unmatched)}")
    print(f"JSON: {out_json}\nHTML: {args.out_html}")
    return 0


def render_html(results: dict) -> str:
    summary = results["summary"]
    rows = []
    for operation in results["operations"]:
        badge = {"covered": "#2da44e", "partial": "#bf8700", "not_covered": "#cf222e"}[operation["status"]]
        rows.append(
            "<tr>"
            f"<td><code>{operation['method']}</code></td>"
            f"<td><code>{html.escape(operation['path'])}</code></td>"
            f"<td>{html.escape(', '.join(operation['tags']))}</td>"
            f"<td style='color:{badge};font-weight:600'>{operation['status']}</td>"
            f"<td>{html.escape(', '.join(operation['documented_statuses']) or '—')}</td>"
            f"<td>{html.escape(', '.join(operation['seen_statuses']) or '—')}</td>"
            f"<td>{html.escape(', '.join(operation['undocumented_statuses']) or '—')}</td>"
            f"<td>{operation['calls']}</td><td>{operation['tests']}</td>"
            "</tr>"
        )
    tag_rows = []
    for tag, stats in results["by_tag"].items():
        tag_rows.append(
            f"<tr><td>{html.escape(tag)}</td><td>{stats['total']}</td><td>{stats['covered']}</td>"
            f"<td>{stats['partial']}</td><td>{stats['not_covered']}</td><td>{stats['percent_covered']}%</td></tr>"
        )
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>API coverage report</title>
<style>
body {{ font-family: -apple-system, sans-serif; margin: 24px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
th, td {{ border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; }}
th {{ background: #f6f8fa; position: sticky; top: 0; }}
h1 {{ font-size: 20px; }} h2 {{ font-size: 16px; margin-top: 32px; }}
.summary span {{ margin-right: 16px; font-weight: 600; }}
</style></head><body>
<h1>Покрытие OpenAPI-спеки тестами</h1>
<p class="summary">
<span>Операций: {summary['operations_total']}</span>
<span style="color:#2da44e">covered: {summary['covered']} ({summary['percent_covered']}%)</span>
<span style="color:#bf8700">partial: {summary['partial']}</span>
<span style="color:#cf222e">not covered: {summary['not_covered']}</span>
<span>вызовов записано: {summary['calls_recorded']}</span>
<span>вне спеки: {summary['calls_unmatched']}</span>
</p>
<h2>Сводка по тегам</h2>
<table><tr><th>Тег</th><th>Операций</th><th>covered</th><th>partial</th><th>not covered</th><th>%</th></tr>
{''.join(tag_rows)}</table>
<h2>Операции</h2>
<table><tr><th>Метод</th><th>Путь</th><th>Теги</th><th>Статус</th><th>Документированные 2xx/4xx</th>
<th>Встречались (док.)</th><th>Вне документации</th><th>Вызовов</th><th>Тестов</th></tr>
{''.join(rows)}</table>
</body></html>"""


if __name__ == "__main__":
    raise SystemExit(main())
