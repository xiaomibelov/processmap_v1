from __future__ import annotations
import ast
import json
import re
from pathlib import Path
from collections import defaultdict

REPO = Path("/opt/processmap-test")
APP = REPO / "backend" / "app"
OUT = REPO / ".planning" / "contours" / "audit" / "microservices-migration" / "reports"

# Directory-based service mapping. Order matters: first match wins.
SERVICE_RULES: list[tuple[str, list[str]]] = [
    ("agents", [
        "ai/",
        "routers/product_actions_ai.py",
    ]),
    ("analytics", [
        "analytics.py",
        "analytics_cache.py",
        "analytics_read_model.py",
        "metrics.py",
        "routers/analytics.py",
        "routers/project_analytics.py",
        "services/analytics_authz.py",
        "save_services/analytics_aggregator/",
        "schemas/analytics.py",
    ]),
    ("notifications", [
        "error_events/",
        "routers/error_events.py",
        "alert_rules.py",
    ]),
    ("discussions", [
        "routers/notes.py",
    ]),
    ("search", [
        "rag/",
        "routers/rag.py",
        "knowledge/",
    ]),
    ("canvas-engine", [
        "clipboard/",
        "exporters/bpmn.py",
        "exporters/mermaid.py",
        "routers/clipboard.py",
        "camunda_meta_utils.py",
        "services/bpmn_navigation.py",
        "overlay_cache.py",
    ]),
    ("sessions", [
        "routers/sessions.py",
        "routers/sessions_new.py",
        "services/session_service.py",
        "session_status.py",
        "utils/session_helpers.py",
        "repositories/session_repo.py",
        "cache/session_cache.py",
        "save_services/status_service/",
    ]),
    ("rbac", [
        "auth.py",
        "routers/auth.py",
        "services/auth_service.py",
        "services/org_service.py",
        "services/org_invites.py",
        "services/org_workspace.py",
        "utils/auth_helpers.py",
        "utils/authz.py",
        "routers/org.py",
        "routers/org_invites.py",
        "routers/org_listing.py",
        "routers/org_members.py",
        "routers/org_property_dictionary.py",
        "repositories/org_repo.py",
    ]),
    ("assets", [
        "exporters/yaml_export.py",
        "routers/templates.py",
        "services/publish_git_mirror.py",
    ]),
    ("process-core", [
        "routers/projects.py",
        "routers/process_properties_registry.py",
        "routers/auto_pass.py",
        "routers/explorer.py",
        "routers/product_actions_registry.py",
        "routers/reference_resolver.py",
        "routers/reports.py",
        "services/project_service.py",
        "save_services/property_save/",
        "repositories/project_repo.py",
        "validators/",
        "normalizer.py",
        "auto_pass_engine.py",
        "auto_pass_jobs.py",
        "auto_pass_telemetry.py",
        "rtiers.py",
        "glossary.py",
        "resources.py",
    ]),
    ("shared/core", [
        "main.py",
        "startup/",
        "settings.py",
        "db/",
        "celery_app.py",
        "tasks.py",
        "routers/__init__.py",
        "routers/_shared.py",
        "routers/admin.py",
        "routers/system.py",
        "routers/version.py",
        "routers/feature_flags.py",
        "services/runtime_meta.py",
    ]),
    ("shared/models", [
        "models.py",
        "schemas/",
        "error_events/schema.py",
    ]),
    ("shared/storage", [
        "storage.py",
        "repositories/",
    ]),
    ("shared/redis", [
        "redis_client.py",
        "redis_cache.py",
        "redis_lock.py",
    ]),
    ("shared/utils", [
        "utils/",
    ]),
    ("shared/legacy", [
        "_legacy_main.py",
        "legacy/",
    ]),
]


def service_of_file(rel: str) -> str:
    for svc, rules in SERVICE_RULES:
        for rule in rules:
            if rule.endswith("/"):
                if rel.startswith(rule):
                    return svc
            elif rule.endswith(".py"):
                if rel == rule:
                    return svc
    return "unmapped"


def module_of_file(rel: str) -> str:
    return rel.replace(".py", "").replace("/", ".")


def file_of_module(mod: str) -> str:
    return mod.replace(".", "/") + ".py"


def collect_files() -> list[Path]:
    return sorted(p for p in APP.rglob("*.py") if "__pycache__" not in p.parts)


def resolve_import(node: ast.AST, package: str, file_mod: str) -> list[str]:
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
        elif module.startswith("backend.app."):
            base = module[len("backend.app."):]
        elif module == "backend.app":
            base = ""
        elif level:
            parts = [p for p in package.split(".") if p]
            # go up level-1 times
            if parts:
                parts = parts[:max(0, len(parts) - level + 1)]
            if module:
                parts.append(module)
            base = ".".join(parts)
        else:
            return []
        base = base.strip(".")
        if base:
            out.append(base)
        for alias in node.names:
            if alias.name == "*":
                continue
            if base:
                out.append(f"{base}.{alias.name}")
            else:
                out.append(alias.name)
    return [o.strip(".") for o in out if o.strip(".")]


def build_graph(files: list[Path]):
    all_mods: set[str] = set()
    file_mods: dict[str, str] = {}
    for path in files:
        rel = str(path.relative_to(APP))
        mod = module_of_file(rel)
        file_mods[rel] = mod
        all_mods.add(mod)

    forward: dict[str, set[str]] = defaultdict(set)
    import_examples: dict[tuple[str, str], list[str]] = defaultdict(list)
    for path in files:
        rel = str(path.relative_to(APP))
        mod = module_of_file(rel)
        package = ".".join(mod.split(".")[:-1])
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as e:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                for target in resolve_import(node, package, mod):
                    raw = target
                    parts = target.split(".")
                    for i in range(len(parts), 0, -1):
                        cand = ".".join(parts[:i])
                        if cand in all_mods:
                            if cand != mod:
                                forward[mod].add(cand)
                                import_examples[(mod, cand)].append(ast.unparse(node))
                            break
    return {k: sorted(v) for k, v in forward.items()}, file_mods, import_examples


def tarjan_scc(graph: dict[str, list[str]]) -> list[list[str]]:
    index_counter = [0]
    stack: list[str] = []
    lowlinks: dict[str, int] = {}
    index: dict[str, int] = {}
    on_stack: dict[str, bool] = {}
    result: list[list[str]] = []

    def strongconnect(v: str):
        index[v] = index_counter[0]
        lowlinks[v] = index_counter[0]
        index_counter[0] += 1
        stack.append(v)
        on_stack[v] = True
        for w in graph.get(v, []):
            if w not in index:
                strongconnect(w)
                lowlinks[v] = min(lowlinks[v], lowlinks[w])
            elif on_stack.get(w, False):
                lowlinks[v] = min(lowlinks[v], index[w])
        if lowlinks[v] == index[v]:
            component = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                component.append(w)
                if w == v:
                    break
            if len(component) > 1:
                result.append(component)
    for v in graph:
        if v not in index:
            strongconnect(v)
    return result


def extract_tables() -> list[str]:
    text = (APP / "storage.py").read_text(encoding="utf-8")
    return sorted(set(re.findall(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)", text, re.I)))


def table_usage(tables: list[str], files: list[Path], file_service: dict[str, str]) -> dict[str, dict]:
    usage: dict[str, set[str]] = defaultdict(set)
    file_text: dict[str, str] = {}
    for path in files:
        rel = str(path.relative_to(APP))
        file_text[rel] = path.read_text(encoding="utf-8")
    for path in files:
        rel = str(path.relative_to(APP))
        text = file_text[rel]
        for t in tables:
            # Require SQL-ish context to reduce false positives from variable names
            if re.search(rf"(?i)(?:from|into|update|join|table|values|delete|set|where|and|or)\s+{re.escape(t)}\b", text):
                usage[t].add(rel)
    result = {}
    for t in tables:
        files_using = sorted(usage[t])
        services = sorted(set(file_service.get(f, "unmapped") for f in files_using))
        result[t] = {"files": files_using, "services": services, "shared": len(services) > 1}
    return result


def extract_schema_classes() -> dict[str, str]:
    classes: dict[str, str] = {}
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
                    classes[node.name] = str(path.relative_to(APP))
    return classes


def schema_usage(classes: dict[str, str], files: list[Path], file_service: dict[str, str]) -> dict[str, dict]:
    usage: dict[str, set[str]] = defaultdict(set)
    file_text: dict[str, str] = {}
    for path in files:
        rel = str(path.relative_to(APP))
        file_text[rel] = path.read_text(encoding="utf-8")
    for path in files:
        rel = str(path.relative_to(APP))
        text = file_text[rel]
        for name in classes:
            if re.search(rf"\b{re.escape(name)}\b", text):
                usage[name].add(rel)
    result = {}
    for name, def_file in classes.items():
        files_using = sorted(usage[name])
        services = sorted(set(file_service.get(f, "unmapped") for f in files_using))
        result[name] = {"defined_in": def_file, "files": files_using, "services": services, "shared": len(services) > 1}
    return result


def event_usage(files: list[Path], file_service: dict[str, str]) -> dict[str, list[str]]:
    markers = [
        "redis_client", "redis_cache", "redis_lock", "publish", "subscribe",
        "background", "BackgroundTask", "enqueue", "emit", "event", "websocket",
        "psubscribe", "xadd", "xread", "pubsub", "celery", "apply_async",
    ]
    usage: dict[str, set[str]] = defaultdict(set)
    for path in files:
        rel = str(path.relative_to(APP))
        text = path.read_text(encoding="utf-8")
        for m in markers:
            if re.search(rf"\b{re.escape(m)}\b", text, re.I):
                usage[m].add(rel)
    return {m: sorted(v) for m, v in usage.items() if v}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = collect_files()
    file_service: dict[str, str] = {str(p.relative_to(APP)): service_of_file(str(p.relative_to(APP))) for p in files}

    forward, file_mods, import_examples = build_graph(files)
    sccs = tarjan_scc(forward)

    tables = extract_tables()
    tusage = table_usage(tables, files, file_service)

    classes = extract_schema_classes()
    susage = schema_usage(classes, files, file_service)

    eusage = event_usage(files, file_service)

    # aggregate matrices
    services = sorted(set(file_service.values()))
    import_matrix: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    shared_db_matrix: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    shared_model_matrix: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    for mod, targets in forward.items():
        rel = file_of_module(mod)
        src = file_service.get(rel, "unmapped")
        for tgt in targets:
            tgt_rel = file_of_module(tgt)
            dst = file_service.get(tgt_rel, "unmapped")
            if src != dst:
                import_matrix[src][dst].add(f"{rel} → {tgt}")

    for t, info in tusage.items():
        svcs = info["services"]
        for i, s1 in enumerate(svcs):
            for s2 in svcs[i+1:]:
                if s1 != s2:
                    shared_db_matrix[s1][s2].add(t)
                    shared_db_matrix[s2][s1].add(t)

    for name, info in susage.items():
        svcs = info["services"]
        for i, s1 in enumerate(svcs):
            for s2 in svcs[i+1:]:
                if s1 != s2:
                    shared_model_matrix[s1][s2].add(name)
                    shared_model_matrix[s2][s1].add(name)

    service_module_counts = defaultdict(int)
    for rel, svc in file_service.items():
        service_module_counts[svc] += 1

    result = {
        "files_audited": len(files),
        "service_module_counts": dict(service_module_counts),
        "file_service": file_service,
        "forward_imports": forward,
        "circular_import_sccs": sorted([sorted(c) for c in sccs]),
        "tables": {t: {"services": info["services"], "files": info["files"], "shared": info["shared"]} for t, info in tusage.items()},
        "schemas": {name: {"defined_in": info["defined_in"], "services": info["services"], "shared": info["shared"]} for name, info in susage.items()},
        "event_markers": eusage,
        "matrix_import": {src: {dst: sorted(v) for dst, v in tgts.items()} for src, tgts in import_matrix.items()},
        "matrix_shared_db": {src: {dst: sorted(v) for dst, v in tgts.items()} for src, tgts in shared_db_matrix.items()},
        "matrix_shared_model": {src: {dst: sorted(v) for dst, v in tgts.items()} for src, tgts in shared_model_matrix.items()},
    }

    json_path = OUT / "audit_raw_v2.json"
    json_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {json_path}")


if __name__ == "__main__":
    main()
