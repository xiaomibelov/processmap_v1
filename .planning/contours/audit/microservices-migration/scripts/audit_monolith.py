from __future__ import annotations
import ast
import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict, deque

REPO = Path("/opt/processmap-test")
APP = REPO / "backend" / "app"
OUT = REPO / ".planning" / "contours" / "audit" / "microservices-migration" / "reports"

SERVICE_PATTERNS: list[tuple[str, list[str]]] = [
    ("process-core", [
        "routers/sessions.py", "routers/sessions_new.py", "services/session_service.py",
        "services/bpmn_navigation.py", "routers/process_properties_registry.py",
        "validators/coverage.py", "validators/disposition.py", "validators/loss.py",
        "normalizer.py", "auto_pass_engine.py", "auto_pass_jobs.py", "auto_pass_telemetry.py",
        "session_status.py", "rtiers.py", "glossary.py", "resources.py", "exporters/yaml_export.py",
    ]),
    ("canvas-engine", [
        "exporters/bpmn.py", "exporters/mermaid.py", "clipboard/*.py",
        "routers/clipboard.py", "services/bpmn_navigation.py",
    ]),
    ("analytics", [
        "analytics.py", "routers/analytics.py", "routers/project_analytics.py",
        "services/analytics_authz.py",
    ]),
    ("discussions", [
        "routers/notes.py",
    ]),
    ("rbac", [
        "auth.py", "routers/auth.py", "services/auth_service.py", "services/org_service.py",
        "services/org_invites.py", "services/org_workspace.py", "utils/auth_helpers.py",
        "utils/authz.py", "routers/org.py", "routers/org_invites.py", "routers/org_listing.py",
        "routers/org_members.py", "routers/org_property_dictionary.py",
    ]),
    ("sessions", [
        "routers/sessions.py", "routers/sessions_new.py", "services/session_service.py",
        "session_status.py", "utils/session_helpers.py",
    ]),
    ("assets", [
        "storage.py", "exporters/*.py", "templates?", "routers/templates.py",
    ]),
    ("search", [
        "rag/*.py", "routers/rag.py",
    ]),
    ("notifications", [
        "error_events/*.py", "routers/error_events.py",
    ]),
    ("agents", [
        "ai/*.py", "routers/product_actions_ai.py",
    ]),
]

SHARED_PATTERNS: list[tuple[str, list[str]]] = [
    ("shared/core", ["main.py", "startup/*.py", "settings.py", "db/*.py"]),
    ("shared/models", ["models.py", "schemas/*.py", "error_events/schema.py"]),
    ("shared/storage", ["storage.py"]),
    ("shared/redis", ["redis_client.py", "redis_cache.py", "redis_lock.py"]),
    ("shared/utils", ["utils/*.py"]),
    ("shared/legacy", ["_legacy_main.py", "legacy/*.py", "utils/legacy_normalization.py"]),
]


def match_pattern(rel_path: str, pat: str) -> bool:
    if pat.endswith("/*.py"):
        prefix = pat[:-5]
        return rel_path.startswith(prefix + "/") and rel_path.endswith(".py")
    if pat.endswith("?"):
        p = pat[:-1]
        return rel_path == p or rel_path.startswith(p)
    return rel_path == pat


def module_of_file(rel_path: str) -> str:
    # routers/sessions.py -> routers.sessions
    return rel_path.replace(".py", "").replace("/", ".")


def file_of_module(mod: str) -> str:
    return mod.replace(".", "/") + ".py"


def service_of_file(rel_path: str) -> str | None:
    for svc, pats in SERVICE_PATTERNS:
        for p in pats:
            if match_pattern(rel_path, p):
                return svc
    for svc, pats in SHARED_PATTERNS:
        for p in pats:
            if match_pattern(rel_path, p):
                return svc
    return None


def collect_files() -> list[Path]:
    return sorted(p for p in APP.rglob("*.py") if "__pycache__" not in p.parts)


def resolve_import(node: ast.Import | ast.ImportFrom, package: str) -> list[str]:
    out: list[str] = []
    if isinstance(node, ast.Import):
        for alias in node.names:
            name = alias.name
            if name.startswith("app."):
                out.append(name[4:])
            elif name == "app":
                out.append("")
    elif isinstance(node, ast.ImportFrom):
        level = node.level
        module = node.module or ""
        if module.startswith("app."):
            base = module[4:]
        elif level:
            parts = package.split(".")
            if not parts or parts == [""]:
                base_parts = []
            else:
                base_parts = parts[:-1] if parts[-1] else parts
            base_parts = base_parts[: len(base_parts) - level + 1] if level > 0 else base_parts
            if module:
                base_parts.append(module)
            base = ".".join(base_parts)
        elif module.startswith("backend.app"):
            base = module[len("backend.app."):]
        elif module == "backend.app":
            base = ""
        else:
            return []
        # store the module being imported from
        out.append(base)
        # also add each imported name as submodule if it looks like one
        for alias in node.names:
            if alias.name[0].isupper():
                continue
            if base:
                out.append(f"{base}.{alias.name}")
            else:
                out.append(alias.name)
    return out


def build_import_graph(files: list[Path]) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    # forward[file] = set(internal modules it imports)
    forward: dict[str, set[str]] = defaultdict(set)
    forward_raw: dict[str, set[str]] = defaultdict(set)
    for path in files:
        rel = str(path.relative_to(APP))
        mod = module_of_file(rel)
        package = ".".join(mod.split(".")[:-1])
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as e:
            print(f"SKIP syntax {rel}: {e}", file=sys.stderr)
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                for target in resolve_import(node, package):
                    target = target.strip(".")
                    if target:
                        forward_raw[mod].add(target)
                        # normalize to existing module or parent
                        parts = target.split(".")
                        for i in range(len(parts), 0, -1):
                            candidate = ".".join(parts[:i])
                            cand_path = APP / file_of_module(candidate)
                            if cand_path.exists():
                                forward[mod].add(candidate)
                                break
    return dict(forward), dict(forward_raw)


def find_cycles(forward: dict[str, set[str]]) -> list[list[str]]:
    # simple DFS for cycles up to some length
    cycles: set[tuple[str, ...]] = set()
    nodes = sorted(forward.keys())
    for start in nodes:
        stack = [(start, [start])]
        while stack:
            node, path = stack.pop()
            for nxt in forward.get(node, set()):
                if nxt == start and len(path) > 1:
                    cyc = tuple(path)
                    cycles.add(cyc)
                elif nxt not in path and len(path) < 7:
                    stack.append((nxt, path + [nxt]))
    return [list(c) for c in cycles]


def extract_tables() -> list[str]:
    text = (APP / "storage.py").read_text(encoding="utf-8")
    return sorted(set(re.findall(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)", text, re.I)))


def table_usage(tables: list[str], files: list[Path]) -> dict[str, list[str]]:
    usage: dict[str, list[str]] = defaultdict(list)
    stopwords = {"id", "name", "title", "status", "type", "data", "value", "key", "org", "project"}
    for path in files:
        rel = str(path.relative_to(APP))
        text = path.read_text(encoding="utf-8")
        for t in tables:
            if t in stopwords:
                continue
            if re.search(rf"\b{re.escape(t)}\b", text):
                usage[t].append(rel)
    return {k: sorted(set(v)) for k, v in usage.items()}


def extract_schema_classes() -> dict[str, Path]:
    classes: dict[str, Path] = {}
    for path in APP.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                bases = [ast.unparse(b) for b in node.bases]
                if any("BaseModel" in b or "ClipboardElementBase" in b for b in bases):
                    classes[node.name] = path
    return classes


def schema_usage(classes: dict[str, str], files: list[Path]) -> dict[str, list[str]]:
    usage: dict[str, list[str]] = defaultdict(list)
    for path in files:
        rel = str(path.relative_to(APP))
        text = path.read_text(encoding="utf-8")
        for name in classes:
            if re.search(rf"\b{re.escape(name)}\b", text):
                usage[name].append(rel)
    return {k: sorted(set(v)) for k, v in usage.items()}


def event_usage(files: list[Path]) -> dict[str, list[str]]:
    markers = [
        "redis_client", "redis_cache", "redis_lock", "publish", "subscribe",
        "background", "BackgroundTask", "enqueue", "emit", "event", "websocket",
        "psubscribe", "xadd", "xread", "pubsub",
    ]
    usage: dict[str, list[str]] = defaultdict(list)
    for path in files:
        rel = str(path.relative_to(APP))
        text = path.read_text(encoding="utf-8")
        for m in markers:
            if re.search(rf"\b{re.escape(m)}\b", text, re.I):
                usage[m].append(rel)
    return {k: sorted(set(v)) for k, v in usage.items()}


def aggregate_service_matrix(forward: dict[str, set[str]], files: list[Path]) -> dict:
    file_to_service: dict[str, str] = {}
    service_modules: dict[str, set[str]] = defaultdict(set)
    for path in files:
        rel = str(path.relative_to(APP))
        svc = service_of_file(rel)
        if svc is None:
            svc = "unmapped"
        file_to_service[rel] = svc
        mod = module_of_file(rel)
        service_modules[svc].add(mod)

    matrix: dict[str, dict[str, dict[str, set[str]]]] = defaultdict(lambda: defaultdict(lambda: {"import": set(), "shared_db": set(), "shared_model": set(), "event": set()}))
    for mod, targets in forward.items():
        rel = file_of_module(mod)
        src_svc = file_to_service.get(rel, "unmapped")
        for tgt in targets:
            tgt_rel = file_of_module(tgt)
            tgt_svc = file_to_service.get(tgt_rel, "unmapped")
            if src_svc != tgt_svc:
                matrix[src_svc][tgt_svc]["import"].add(f"{rel} -> {tgt}")

    # service sizes
    sizes = {svc: len(mods) for svc, mods in service_modules.items()}
    return dict(matrix), dict(service_modules), sizes


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files = collect_files()
    forward, forward_raw = build_import_graph(files)
    cycles = find_cycles(forward)
    tables = extract_tables()
    tusage = table_usage(tables, files)
    schemas = extract_schema_classes()
    susage = schema_usage(schemas, files)
    eusage = event_usage(files)
    matrix, service_modules, sizes = aggregate_service_matrix(forward, files)

    result = {
        "files_audited": len(files),
        "service_module_counts": sizes,
        "circular_imports": cycles,
        "tables": tables,
        "table_usage": {t: v for t, v in tusage.items() if len(v) > 1 or t in ("sessions", "projects", "users", "orgs")},
        "schemas": list(schemas.keys()),
        "schema_usage": {s: v for s, v in susage.items() if len(v) > 1},
        "event_markers": {m: v for m, v in eusage.items() if v},
        "matrix": {src: {tgt: {k: sorted(v) for k, v in cells.items()} for tgt, cells in tgts.items()} for src, tgts in matrix.items()},
    }
    json_path = OUT / "audit_raw.json"
    json_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()
