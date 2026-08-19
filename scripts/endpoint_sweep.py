#!/usr/bin/env python3
"""Этап 0 контура feature/endpoint-regression-scanner: одноразовый прогон
всех read-only (GET) эндпоинтов ЖИВОГО приложения.

Источники правды (как в contract-контуре, backend/tests/contract/):
- спека — живая: GET {base_url}/api/openapi.json с Bearer-токеном;
- исключения — backend/tests/contract/exclusions.yaml:
  * method_policy.allowed_methods=[GET] — сканируем только GET;
  * skip_operations — не сканируем (SSE-стрим, внешние сетевые вызовы);
    записи с reason «sqlite-env: ...» — ограничение тестового окружения,
    на проде (postgres) таблицы есть, поэтому такие GET сканируем с пометкой;
  * domain_error_envelope_operations — 200 {"ok": false}/{"error": ...}
    считается ДОМЕННОЙ ошибкой, а не HTTP-ошибкой;
  * spec_gap_status_operations — статусы-пометки (ожидаемые доменные 4xx).
- реальные id — тем же набором имён, что seeded_path_params/seeded_query_params
  в contract_support.py:get_context() (session_id, org_id, project_id, user_id,
  scope, scope_id, folder_id, workspace_id), но значения обнаруживаются
  read-only запросами к живому API (list-эндпоинты, /api/auth/me).

READ-ONLY: только GET, concurrency <= 2, таймаут на запрос, общий бюджет.
Никаких мутаций. Токен берётся из env, никуда не пишется и не печатается.

Использование:
    ENDPOINT_SWEEP_TOKEN=<admin-jwt> \
    python3 scripts/endpoint_sweep.py --base-url https://processmap.ru \
        [--timeout 20] [--budget 900] [--out build/endpoint_sweep.json]
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXCLUSIONS = REPO_ROOT / "backend" / "tests" / "contract" / "exclusions.yaml"

BODY_CAPTURE_LIMIT = 2000

# TLS: на macOS system python часто без CA-сертификатов (certifi не установлен).
# Порядок: certifi → системный контекст → unverified (с предупреждением).
def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    ctx = ssl.create_default_context()
    # probe: если системных CA нет, get_ca_certs() пуст — тогда fallback.
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    return ctx


_SSL_CTX = _ssl_context()
_SSL_FALLBACK_WARNED = False

# Статические значения, аналогичные seeded_*_params из contract_support.py.
STATIC_PARAMS = {"scope": "session"}

# Обнаружение реальных id: param -> список кандидатов (path, [json-пути]).
# {workspace_id} в path кандидата подставляется из уже найденных значений.
DISCOVERY: Dict[str, List[Tuple[str, List[str]]]] = {
    "user_id": [("/api/auth/me", ["id", "user.id", "user_id"])],
    "org_id": [("/api/auth/me", ["active_org_id", "activeOrgId", "org_id", "orgs[0].id", "org.id"])],
    "workspace_id": [("/api/workspaces", ["[0].id", "items[0].id", "workspaces[0].id"])],
    "project_id": [("/api/projects", ["[0].id", "items[0].id", "projects[0].id"])],
    "session_id": [("/api/sessions", ["[0].id", "items[0].id", "sessions[0].id"])],
    "folder_id": [("/api/workspaces/{workspace_id}/folders", ["[0].id", "items[0].id", "folders[0].id"])],
}
# scope_id = session_id (как в seeded_path_params).
ALIASES = {"scope_id": "session_id"}

# Query-параметры, которые подставляем (seeded_query_params).
QUERY_PARAM_NAMES = {"workspace_id", "scope", "scope_id", "org_id"}


def http_get(url: str, token: Optional[str], timeout: float, max_bytes: int = BODY_CAPTURE_LIMIT * 4) -> Tuple[int, float, bytes, str]:
    """GET-запрос. Возвращает (status, latency_ms, body, error_kind).

    error_kind: "" | "timeout" | "conn_error". HTTP-статус любой, включая 4xx/5xx.
    Тело обрезается до max_bytes.
    """
    global _SSL_CTX, _SSL_FALLBACK_WARNED
    req = urllib.request.Request(url, method="GET")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    started = time.monotonic()
    try:
        try:
            ctx = _SSL_CTX
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                body = resp.read(max_bytes)
                return resp.status, (time.monotonic() - started) * 1000, body, ""
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", None)
            if isinstance(reason, ssl.SSLCertVerificationError):
                # Нет CA в системном python (macOS) — fallback без верификации.
                if not _SSL_FALLBACK_WARNED:
                    print("ПРЕДУПРЕЖДЕНИЕ: CA-сертификаты недоступны, TLS-верификация отключена для этого прогона.", file=sys.stderr)
                    _SSL_FALLBACK_WARNED = True
                _SSL_CTX = ssl._create_unverified_context()
                with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as resp:
                    body = resp.read(max_bytes)
                    return resp.status, (time.monotonic() - started) * 1000, body, ""
            raise
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read(max_bytes)
        except Exception:
            body = b""
        return exc.code, (time.monotonic() - started) * 1000, body, ""
    except TimeoutError:
        return 0, (time.monotonic() - started) * 1000, b"", "timeout"
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", None)
        if isinstance(reason, TimeoutError) or (reason and "timed out" in str(reason)):
            return 0, (time.monotonic() - started) * 1000, b"", "timeout"
        return 0, (time.monotonic() - started) * 1000, str(exc)[:500].encode(), "conn_error"
    except (ssl.SSLError, OSError) as exc:
        return 0, (time.monotonic() - started) * 1000, str(exc)[:500].encode(), "conn_error"


def dig(obj: Any, path: str) -> Any:
    """Достаёт значение по пути вида 'a.b[0].c'. None, если пути нет."""
    cur = obj
    for part in path.split("."):
        if cur is None:
            return None
        if part.endswith("]") and "[" in part:
            name, idx = part[:-1].split("[", 1)
            if name:
                cur = cur.get(name) if isinstance(cur, dict) else None
            try:
                cur = cur[int(idx)] if isinstance(cur, list) and len(cur) > int(idx) else None
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def load_exclusions(path: Path) -> Dict[str, Any]:
    import yaml  # PyYAML (есть в backend-окружении)

    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def exclusion_ids(exclusions: Dict[str, Any], key: str) -> List[str]:
    return [entry["id"] for entry in exclusions.get(key) or []]


def exclusion_reasons(exclusions: Dict[str, Any], key: str) -> Dict[str, str]:
    return {entry["id"]: entry.get("reason", "") for entry in exclusions.get(key) or []}


def spec_gap_status_map(exclusions: Dict[str, Any]) -> Dict[str, set]:
    out: Dict[str, set] = {}
    for entry in exclusions.get("spec_gap_status_operations") or []:
        out[entry["id"]] = {int(s) for s in entry.get("statuses") or []}
    return out


def iter_get_operations(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Все GET-операции спеки с объединёнными path/operation parameters."""
    ops = []
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        path_params = path_item.get("parameters") or []
        op = path_item.get("get")
        if not isinstance(op, dict):
            continue
        params = list(path_params) + list(op.get("parameters") or [])
        ops.append(
            {
                "operation_id": op.get("operationId") or f"get_{path}",
                "method": "GET",
                "path": path,
                "tags": op.get("tags") or [],
                "deprecated": bool(op.get("deprecated")),
                "parameters": params,
            }
        )
    ops.sort(key=lambda o: (o["path"], o["operation_id"]))
    return ops


def required_query_without_mapping(op: Dict[str, Any]) -> List[str]:
    missing = []
    for p in op["parameters"]:
        if p.get("in") == "query" and p.get("required") and p.get("name") not in QUERY_PARAM_NAMES:
            missing.append(p.get("name"))
    return missing


def path_param_names(op: Dict[str, Any]) -> List[str]:
    names = [p.get("name") for p in op["parameters"] if p.get("in") == "path"]
    if not names:  # fallback: извлечь из самого path
        import re

        names = re.findall(r"{([^}]+)}", op["path"])
    return [n for n in names if n]


def classify(
    op_id: str,
    status: int,
    err_kind: str,
    body: bytes,
    llm_envelope_ids: set,
    gap_map: Dict[str, set],
) -> Tuple[str, str]:
    """-> (category, note). category: ok|http_error|domain_error|timeout|conn_error."""
    note = ""
    if err_kind:
        return err_kind, ""
    if status in gap_map.get(op_id, set()):
        note = f"spec_gap status {status} (ожидаемый доменный, см. exclusions.yaml)"
    if status == 200 and op_id in llm_envelope_ids:
        try:
            parsed = json.loads(body.decode("utf-8", "replace"))
        except Exception:
            parsed = None
        if isinstance(parsed, dict) and (parsed.get("ok") is False or "error" in parsed):
            return "domain_error", f"LLM-конверт: {parsed.get('error') or parsed.get('message')}"
    if 200 <= status < 300:
        return "ok", note
    if 300 <= status < 400:
        return "ok", (note + "; " if note else "") + f"redirect {status}"
    return "http_error", note


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only sweep GET-эндпоинтов живого приложения.")
    parser.add_argument("--base-url", required=True, help="Например https://processmap.ru")
    parser.add_argument("--timeout", type=float, default=20.0, help="Таймаут на запрос, сек")
    parser.add_argument("--budget", type=float, default=900.0, help="Общий бюджет времени, сек")
    parser.add_argument("--out", default=None, help="Путь JSON-отчёта (по умолчанию build/endpoint_sweep_<ts>.json)")
    parser.add_argument("--exclusions", default=str(DEFAULT_EXCLUSIONS), help="Путь к exclusions.yaml")
    args = parser.parse_args()

    token = os.environ.get("ENDPOINT_SWEEP_TOKEN", "").strip()
    if not token:
        print("ОШИБКА: задайте admin JWT в env ENDPOINT_SWEEP_TOKEN.", file=sys.stderr)
        return 2
    base = args.base_url.rstrip("/")

    exclusions = load_exclusions(Path(args.exclusions))
    allowed_methods = set((exclusions.get("method_policy") or {}).get("allowed_methods") or ["GET"])
    if allowed_methods != {"GET"}:
        print(f"ПРЕДУПРЕЖДЕНИЕ: allowed_methods={allowed_methods}, сканируем только GET.")
    skip_reasons = exclusion_reasons(exclusions, "skip_operations")
    llm_envelope_ids = set(exclusion_ids(exclusions, "domain_error_envelope_operations"))
    gap_map = spec_gap_status_map(exclusions)

    run_started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    t0 = time.monotonic()

    # --- /version (публичный) ---
    version_status, _, version_body, _ = http_get(f"{base}/version", None, args.timeout)
    version: Dict[str, Any] = {}
    if version_status == 200:
        try:
            version = json.loads(version_body.decode("utf-8", "replace"))
        except Exception:
            version = {}

    # --- живая спека ---
    spec_status, _, spec_body, spec_err = http_get(f"{base}/api/openapi.json", token, args.timeout, max_bytes=16 * 1024 * 1024)
    if spec_status != 200:
        print(
            f"ОШИБКА: GET /api/openapi.json -> {spec_status or spec_err}. "
            "Проверьте токен (нужно право как у кнопки «API Docs»).",
            file=sys.stderr,
        )
        return 2
    spec = json.loads(spec_body.decode("utf-8", "replace"))

    # --- обнаружение реальных id ---
    context: Dict[str, str] = dict(STATIC_PARAMS)
    discovery_report: Dict[str, Any] = {}
    for name, candidates in DISCOVERY.items():
        found = None
        for cand_path, json_paths in candidates:
            url_path = cand_path
            for k, v in context.items():  # подстановка уже найденных (workspace_id и т.п.)
                url_path = url_path.replace("{" + k + "}", str(v))
            if "{" in url_path:
                continue
            status, _, body, err = http_get(f"{base}{url_path}", token, args.timeout)
            if status != 200:
                continue
            try:
                payload = json.loads(body.decode("utf-8", "replace"))
            except Exception:
                continue
            for jp in json_paths:
                value = dig(payload, jp)
                if value not in (None, ""):
                    found = str(value)
                    discovery_report[name] = {"value": found, "via": f"GET {cand_path} -> {jp}"}
                    break
            if found:
                break
        if found:
            context[name] = found
        else:
            discovery_report[name] = {"value": None, "via": " / ".join(p for p, _ in candidates)}
    for alias, target in ALIASES.items():
        if target in context:
            context[alias] = context[target]

    # --- план прогона ---
    get_ops = iter_get_operations(spec)
    plan: List[Dict[str, Any]] = []
    blind_zone: List[Dict[str, str]] = []

    # Не-GET операции — слепая зона (мутации).
    for path, path_item in (spec.get("paths") or {}).items():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method in ("parameters", "get") or not isinstance(op, dict):
                continue
            op_id = op.get("operationId") or f"{method}_{path}"
            reason = "мутация, вне сканирования (method_policy: только GET)"
            if op_id in skip_reasons:
                reason = f"skip_operations: {skip_reasons[op_id]}"
            blind_zone.append({"operation_id": op_id, "method": method.upper(), "path": path, "reason": reason})

    for op in get_ops:
        op_id = op["operation_id"]
        if op_id in skip_reasons:
            reason = skip_reasons[op_id]
            if not reason.startswith("sqlite-env"):
                blind_zone.append({"operation_id": op_id, "method": "GET", "path": op["path"], "reason": f"skip_operations: {reason}"})
                continue
            # Ограничение тестового sqlite-окружения; на проде postgres — сканируем,
            # но проверки unresolved path/query ниже по-прежнему обязательны.
            op["_note"] = "в contract-suite исключён (sqlite-env); на проде сканируется"
        unresolved = [n for n in path_param_names(op) if n not in context]
        if unresolved:
            blind_zone.append(
                {
                    "operation_id": op_id,
                    "method": "GET",
                    "path": op["path"],
                    "reason": f"нет маппинга реальных id для path-параметров: {', '.join(unresolved)}",
                }
            )
            continue
        missing_query = required_query_without_mapping(op)
        if missing_query:
            blind_zone.append(
                {
                    "operation_id": op_id,
                    "method": "GET",
                    "path": op["path"],
                    "reason": f"обязательные query-параметры без маппинга: {', '.join(missing_query)}",
                }
            )
            continue
        plan.append(op)

    # --- прогон ---
    results: List[Dict[str, Any]] = []

    def run_one(op: Dict[str, Any]) -> Dict[str, Any]:
        url_path = op["path"]
        for name in path_param_names(op):
            url_path = url_path.replace("{" + name + "}", urllib.parse.quote(str(context[name]), safe=""))
        query = {}
        for p in op["parameters"]:
            if p.get("in") == "query" and p.get("name") in QUERY_PARAM_NAMES and p["name"] in context:
                query[p["name"]] = context[p["name"]]
        url = f"{base}{url_path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        status, latency_ms, body, err_kind = http_get(url, token, args.timeout)
        category, note = classify(op["operation_id"], status, err_kind, body, llm_envelope_ids, gap_map)
        if op.get("_note"):
            note = (note + "; " if note else "") + op["_note"]
        return {
            "operation_id": op["operation_id"],
            "method": "GET",
            "path": op["path"],
            "url": url,
            "http_status": status,
            "category": category,
            "latency_ms": round(latency_ms, 1),
            "note": note,
            "body": body.decode("utf-8", "replace")[:BODY_CAPTURE_LIMIT] if category == "http_error" and status >= 500 else "",
        }

    deadline = t0 + args.budget
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {}
        for op in plan:
            if time.monotonic() > deadline:
                blind_zone.append(
                    {
                        "operation_id": op["operation_id"],
                        "method": "GET",
                        "path": op["path"],
                        "reason": "исчерпан общий бюджет времени прогона",
                    }
                )
                continue
            futures[pool.submit(run_one, op)] = op
        for fut in concurrent.futures.as_completed(futures):
            results.append(fut.result())
            r = results[-1]
            mark = {"ok": ".", "domain_error": "D", "timeout": "T", "conn_error": "C"}.get(r["category"], "!")
            print(mark, end="", flush=True)
    print()

    results.sort(key=lambda r: (r["path"], r["operation_id"]))
    duration = time.monotonic() - t0

    counts: Dict[str, int] = {}
    for r in results:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    server_errors = [r for r in results if r["http_status"] >= 500]
    client_errors = [r for r in results if r["category"] == "http_error" and r["http_status"] < 500]

    # --- терминальный вывод ---
    print("=" * 100)
    print(f"SWEEP {base}  ·  started {run_started}  ·  duration {duration:.1f}s")
    if version:
        print(f"version: commit={version.get('commit')} branch={version.get('branch')} env={version.get('env')} buildTime={version.get('buildTime')}")
    print(f"spec: {len(spec.get('paths') or {})} paths · GET-операций: {len(get_ops)} · в прогоне: {len(plan)} · слепая зона: {len(blind_zone)}")
    print("resolved ids: " + ", ".join(f"{k}={v}" for k, v in sorted(context.items())))
    print("-" * 100)
    print(
        f"ИТОГ: {counts.get('ok', 0)} ok / {counts.get('http_error', 0)} HTTP-ошибок "
        f"(из них 5xx: {len(server_errors)}) / {counts.get('domain_error', 0)} доменных / "
        f"{counts.get('timeout', 0)} таймаутов / {counts.get('conn_error', 0)} conn-ошибок"
    )
    print("-" * 100)

    def row(r: Dict[str, Any]) -> str:
        note = f"  # {r['note']}" if r["note"] else ""
        return f"{r['category']:<12} {str(r['http_status']):<5} {r['latency_ms']:>8.0f}ms  {r['method']} {r['path']}{note}"

    if server_errors:
        print("\n!!! 5xx (с телом ответа):")
        for r in server_errors:
            print(row(r))
            print("    body: " + (r["body"][:BODY_CAPTURE_LIMIT] or "<пусто>"))
    if client_errors:
        print("\n4xx (HTTP-ошибки, не 5xx):")
        for r in client_errors:
            print(row(r))
    for cat, title in (("domain_error", "Доменные ошибки (LLM-конверты 200 {ok:false})"), ("timeout", "Таймауты"), ("conn_error", "Ошибки соединения")):
        subset = [r for r in results if r["category"] == cat]
        if subset:
            print(f"\n{title}:")
            for r in subset:
                print(row(r))

    print("\nПолная таблица (эндпоинт -> статус, latency):")
    for r in results:
        print(row(r))

    print("\nСлепая зона (не покрыто прогоном — проверить руками):")
    for b in sorted(blind_zone, key=lambda x: (x["path"], x["method"])):
        print(f"  {b['method']:<7} {b['path']:<60} {b['reason']}")

    # --- JSON-отчёт ---
    report = {
        "tool": "endpoint_sweep (stage 0, feature/endpoint-regression-scanner)",
        "base_url": base,
        "started_at": run_started,
        "duration_s": round(duration, 1),
        "version": version,
        "resolved_ids": context,
        "discovery": discovery_report,
        "counts": {
            "ok": counts.get("ok", 0),
            "http_error": counts.get("http_error", 0),
            "http_error_5xx": len(server_errors),
            "domain_error": counts.get("domain_error", 0),
            "timeout": counts.get("timeout", 0),
            "conn_error": counts.get("conn_error", 0),
            "scanned": len(results),
            "blind_zone": len(blind_zone),
        },
        "results": results,
        "blind_zone": sorted(blind_zone, key=lambda x: (x["path"], x["method"])),
    }
    out_path = Path(args.out) if args.out else REPO_ROOT / "build" / f"endpoint_sweep_{time.strftime('%Y%m%d_%H%M%S', time.gmtime())}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nJSON-отчёт: {out_path}")
    return 1 if server_errors else 0


if __name__ == "__main__":
    sys.exit(main())
