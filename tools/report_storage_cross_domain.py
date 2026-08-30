"""Generate CROSS_DOMAIN_TX.md and MISPLACED.md for the storage domain split.

Run from repository root:
    python tools/report_storage_cross_domain.py
"""
from __future__ import annotations

import ast
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
STORAGE_ROOT = REPO_ROOT / "backend" / "app" / "domains" / "storage"
OUT_DIR = REPO_ROOT / ".planning" / "contours" / "fix" / "storage-domain-split"

DOMAINS = [
    "compat",
    "platform",
    "dictionaries",
    "utils",
    "org_auth",
    "project",
    "explorer",
    "templates_legacy",
    "audit_telemetry",
    "ai",
    "canvas_session",
    "notes",
]

# Domains expected to become separate services in the next contour.
MISPLACED_DOMAINS = {"ai", "org_auth", "notes"}

READ_NAME_PATTERNS = (
    r"^(get_|list_|count_|search_)",
    r"^(read_|lookup_)",
    r"_row_to_",
    r"_row_value$",
    r"_json_loads$",
    r"_normalize_",
    r"_build_",
    r"_apply_",
    r"_org_clause$",
    r"_owner_clause$",
    r"_default_",
    r"SESSION_PRESENCE_TTL_SECONDS$",
    r"_BACKFILL_",
    r"_PROPERTY_METADATA_",
    r"_REFERENCE_",
    r"_is_integrity_error$",
    r"_diagram_truth_payload_hash$",
    r"_count_bpmn_activities$",
    r"_note_",
    r"_personal_",
    r"_attention_",
    r"_notes_aggregate",
    r"_auth_user_profiles",
    r"_template_",
)


def is_read_name(name: str) -> bool:
    return any(re.search(pat, name) for pat in READ_NAME_PATTERNS)


def classify_import(importing_domain: str, source_domain: str) -> str:
    if source_domain == "compat" or importing_domain == "compat":
        return "INTERNAL"
    if source_domain in MISPLACED_DOMAINS or importing_domain in MISPLACED_DOMAINS:
        return "MISPLACED"
    return "FACADE"


def parse_repository(domain: str) -> tuple[dict[str, str], ast.Module]:
    path = STORAGE_ROOT / domain / "repository.py"
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    imports: dict[str, str] = {}  # local alias -> source domain
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            m = re.match(r"^(?:\.\.)?(\w+)(?:\.repository)?$", module)
            if not m:
                continue
            source_domain = m.group(1)
            if source_domain not in DOMAINS:
                continue
            for alias in node.names:
                imports[alias.asname or alias.name] = source_domain
    return imports, tree


def find_with_connect_functions(tree: ast.Module) -> list[tuple[str, ast.FunctionDef | ast.AsyncFunctionDef]]:
    result = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if _contains_with_connect(node):
                result.append((node.name, node))
    return result


def _contains_with_connect(node: ast.AST) -> bool:
    for child in ast.walk(node):
        if isinstance(child, ast.With):
            for item in child.items:
                if isinstance(item.context_expr, ast.Call):
                    func = item.context_expr.func
                    if isinstance(func, ast.Name) and func.id == "_connect":
                        return True
    return False


def collect_cross_domain_uses(
    func: ast.FunctionDef | ast.AsyncFunctionDef, imports: dict[str, str], own_domain: str
) -> dict[str, set[tuple[str, str, int]]]:
    """Return {source_domain: {(local_name, mode, line)}} for cross-domain names used inside with _connect()."""
    result: dict[str, set[tuple[str, str, int]]] = defaultdict(set)
    for with_node in ast.walk(func):
        if not isinstance(with_node, ast.With):
            continue
        for item in with_node.items:
            if not isinstance(item.context_expr, ast.Call):
                continue
            func_call = item.context_expr.func
            if isinstance(func_call, ast.Name) and func_call.id == "_connect":
                _walk_for_uses(with_node.body, imports, own_domain, result)
    return result


def _walk_for_uses(
    body: list[ast.stmt],
    imports: dict[str, str],
    own_domain: str,
    result: dict[str, set[tuple[str, str, int]]],
) -> None:
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            name = node.id
            source_domain = imports.get(name)
            if not source_domain or source_domain == own_domain:
                continue
            mode = "read" if is_read_name(name) else "write"
            result[source_domain].add((name, mode, node.lineno))


def generate_cross_domain_tx() -> str:
    lines = ["# Cross-domain DB transactions inside storage domains", ""]
    lines.append("Source of truth: functions whose body contains `with _connect()` and which reference names imported from another domain.")
    lines.append("")
    total = 0
    for domain in DOMAINS:
        imports, tree = parse_repository(domain)
        funcs = find_with_connect_functions(tree)
        if not funcs:
            continue
        lines.append(f"## {domain}")
        lines.append("")
        for func_name, func_node in funcs:
            uses = collect_cross_domain_uses(func_node, imports, domain)
            if not uses:
                continue
            total += 1
            path = STORAGE_ROOT / domain / "repository.py"
            lines.append(f"### `{func_name}` @ `{domain}/repository.py:{func_node.lineno}`")
            lines.append("")
            for source_domain in sorted(uses.keys()):
                entries = sorted(uses[source_domain])
                reads = [e for e in entries if e[1] == "read"]
                writes = [e for e in entries if e[1] == "write"]
                parts = []
                if reads:
                    names = ", ".join(f"`{e[0]}`" for e in reads)
                    parts.append(f"read [{names}]")
                if writes:
                    names = ", ".join(f"`{e[0]}`" for e in writes)
                    parts.append(f"write [{names}]")
                lines.append(f"- **{source_domain}**: {'; '.join(parts)}")
            lines.append("")
    lines.append(f"**Total functions with cross-domain DB transactions: {total}**")
    return "\n".join(lines)


def generate_misplaced() -> str:
    lines = ["# MISPLACED cross-domain imports", "", "Cross-domain imports where at least one side belongs to a domain slated to become a separate service (`ai`, `org_auth`, `notes`). These imports are intentionally left in place; they are input for the next contour (`feature/extract-storage-service`).", ""]
    table = []
    for domain in DOMAINS:
        imports, _ = parse_repository(domain)
        path = STORAGE_ROOT / domain / "repository.py"
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            m = re.match(r"^from (?:\.\.)?(\w+)(?:\.repository)? import", line.strip())
            if not m:
                continue
            source_domain = m.group(1)
            if source_domain == domain:
                continue
            classification = classify_import(domain, source_domain)
            if classification == "MISPLACED":
                table.append((domain, source_domain, line.strip(), f"{domain}/repository.py:{line_no}"))
    lines.append("| Importing domain | Source domain | Import line | Location |")
    lines.append("|------------------|---------------|-------------|----------|")
    for importing, source, import_line, location in sorted(table):
        lines.append(f"| {importing} | {source} | `{import_line}` | `{location}` |")
    lines.append("")
    lines.append(f"**Total MISPLACED imports: {len(table)}**")
    return "\n".join(lines)


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "CROSS_DOMAIN_TX.md").write_text(generate_cross_domain_tx(), encoding="utf-8")
    (OUT_DIR / "MISPLACED.md").write_text(generate_misplaced(), encoding="utf-8")
    print(f"Wrote {OUT_DIR / 'CROSS_DOMAIN_TX.md'}")
    print(f"Wrote {OUT_DIR / 'MISPLACED.md'}")
