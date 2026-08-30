"""Automated generator that splits backend/app/storage.py into domain modules.

Run from repository root:
    python tools/split_storage_domains.py

The script is idempotent: it removes backend/app/domains/storage/<domain>/ dirs
before regenerating them, then rewrites backend/app/storage.py as a thin facade.
"""
from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
STORAGE_PATH = REPO_ROOT / "backend" / "app" / "storage.py"
MAP_PATH = REPO_ROOT / ".planning" / "contours" / "fix" / "storage-domain-split" / "entity_domain_map.json"
TARGET_ROOT = REPO_ROOT / "backend" / "app" / "domains" / "storage"

# Domains expected by the decomposition plan.
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

# Top-level constants that must live in compat and be re-exported.
COMPAT_CONSTANTS = frozenset({"_BPMN_ACTIVITY_TAGS", "_USER_FACING_BPMN_VERSION_ACTIONS"})

# Classes that stay in storage.py as facades.
# Use a tuple with a deterministic order so re-runs are byte-identical.
FACADE_CLASSES = ("Storage", "ProjectStorage")

# Functions that instantiate the facade classes and therefore must remain in
# storage.py to avoid circular imports from domain modules back into storage.py.
FACADE_DEPENDENT_FUNCTIONS = ("get_storage", "get_project_storage")

# Domains that are expected to become separate services in the next contour.
# Their code is allowed to stay inside the storage monolith for now, but direct
# imports involving them are documented as [MISPLACED] rather than rewritten.
MISPLACED_DOMAINS = frozenset({"ai", "org_auth", "notes"})


def read_storage_source() -> Tuple[List[str], ast.Module]:
    """Read the canonical storage.py source from git HEAD.

    Reading from HEAD makes the generator idempotent: re-running it after it has
    already rewritten backend/app/storage.py still uses the original monolithic
    source as input.
    """
    try:
        text = subprocess.check_output(
            ["git", "show", "HEAD:backend/app/storage.py"],
            cwd=REPO_ROOT,
            text=True,
        )
    except subprocess.CalledProcessError:
        text = STORAGE_PATH.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    tree = ast.parse(text, filename=str(STORAGE_PATH))
    return lines, tree


def source_for_node(node: ast.AST, lines: List[str]) -> str:
    """Return source text for a node, including leading decorators.

    Relative imports are rewritten to absolute so they keep the same meaning
    when the code is moved from app/storage.py into app/domains/storage/*.
    """
    start = node.lineno
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        for dec in getattr(node, "decorator_list", []):
            start = min(start, dec.lineno)
    end = node.end_lineno
    # lines is 0-indexed, lineno is 1-indexed.
    source = "".join(lines[start - 1 : end])
    return _relative_to_absolute_import(source)


def build_top_level_index(tree: ast.Module) -> Dict[str, ast.AST]:
    """Map top-level defined names to their AST nodes."""
    index: Dict[str, ast.AST] = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            index[node.name] = node
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    index[target.id] = node
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            index[node.target.id] = node
    return index


def load_entity_domain_map() -> List[Dict[str, Any]]:
    return json.loads(MAP_PATH.read_text(encoding="utf-8"))


def map_entities(
    tree: ast.Module, entity_map: List[Dict[str, Any]]
) -> Tuple[Dict[str, str], Dict[Tuple[str, str], str], Dict[str, ast.AST]]:
    """Return (name_to_domain, method_to_domain, top_level_nodes)."""
    top_level = build_top_level_index(tree)
    name_to_domain: Dict[str, str] = {}
    method_to_domain: Dict[Tuple[str, str], str] = {}

    for entry in entity_map:
        name = entry["name"]
        domain = entry["domain"]
        start = entry["start"]
        end = entry["end"]

        # Determine whether this is a class method by checking if its range is
        # fully inside a class body.
        parent_class = None
        for cls_name, cls_node in top_level.items():
            if isinstance(cls_node, ast.ClassDef):
                if cls_node.lineno <= start and end <= cls_node.end_lineno:
                    parent_class = cls_name
                    break

        if parent_class:
            method_to_domain[(parent_class, name)] = domain
        else:
            name_to_domain[name] = domain

    # Constants and the logger not in the JSON map default to compat.
    for name, node in top_level.items():
        if isinstance(node, (ast.Assign, ast.AnnAssign)) and name not in name_to_domain:
            name_to_domain[name] = "compat"

    return name_to_domain, method_to_domain, top_level


class NameCollector(ast.NodeVisitor):
    """Collect module-level names referenced by a subtree, excluding locals."""

    def __init__(self, module_names: Set[str]):
        self.module_names = module_names
        self.used: Set[str] = set()
        self.local_stack: List[Set[str]] = [set()]

    def push(self, names: Set[str]):
        self.local_stack.append(self.local_stack[-1] | names)

    def pop(self):
        self.local_stack.pop()

    def is_local(self, name: str) -> bool:
        return name in self.local_stack[-1]

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, ast.Load):
            if node.id in self.module_names and not self.is_local(node.id):
                self.used.add(node.id)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._visit_function(node)

    def _visit_function(self, node):
        # Add function name to outer scope so inner references don't count.
        self.local_stack[-1].add(node.name)
        args = node.args
        local_names = set()
        for arg in args.posonlyargs + args.args + args.kwonlyargs:
            local_names.add(arg.arg)
        if args.vararg:
            local_names.add(args.vararg.arg)
        if args.kwarg:
            local_names.add(args.kwarg.arg)
        # Defaults and annotations may reference module names; visit them in outer scope.
        for default in args.defaults + args.kw_defaults:
            if default:
                self.visit(default)
        # Add parameters as locals before visiting body.
        self.push(local_names)
        for stmt in node.body:
            self.visit(stmt)
        for decorator in node.decorator_list:
            self.visit(decorator)
        self.pop()

    def visit_ClassDef(self, node: ast.ClassDef):
        self.local_stack[-1].add(node.name)
        self.push(set())
        for base in node.bases:
            self.visit(base)
        for keyword in node.keywords:
            self.visit(keyword)
        for stmt in node.body:
            self.visit(stmt)
        self.pop()

    def visit_Lambda(self, node: ast.Lambda):
        args = node.args
        local_names = set()
        for arg in args.posonlyargs + args.args + args.kwonlyargs:
            local_names.add(arg.arg)
        if args.vararg:
            local_names.add(args.vararg.arg)
        if args.kwarg:
            local_names.add(args.kwarg.arg)
        for default in args.defaults + args.kw_defaults:
            if default:
                self.visit(default)
        self.push(local_names)
        self.visit(node.body)
        self.pop()

    def visit_ListComp(self, node):
        self._visit_comp(node)

    def visit_SetComp(self, node):
        self._visit_comp(node)

    def visit_DictComp(self, node):
        self._visit_comp(node)

    def visit_GeneratorExp(self, node):
        self._visit_comp(node)

    def _visit_comp(self, node):
        # Simplification: add comprehension targets as locals and visit everything.
        self.push(set())
        for generator in node.generators:
            self._add_target_names(generator.target)
            self.visit(generator.iter)
            for if_clause in generator.ifs:
                self.visit(if_clause)
        if isinstance(node, ast.DictComp):
            self.visit(node.key)
            self.visit(node.value)
        else:
            self.visit(node.elt)
        self.pop()

    def _add_target_names(self, target: ast.AST):
        if isinstance(target, ast.Name):
            self.local_stack[-1].add(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for elt in target.elts:
                self._add_target_names(elt)

    def visit_Assign(self, node: ast.Assign):
        self.visit(node.value)
        for target in node.targets:
            self._add_target_names(target)

    def visit_AnnAssign(self, node: ast.AnnAssign):
        if node.value:
            self.visit(node.value)
        self.visit(node.annotation)
        self._add_target_names(node.target)

    def visit_AugAssign(self, node: ast.AugAssign):
        self.visit(node.value)
        self._add_target_names(node.target)

    def visit_For(self, node: ast.For):
        self.visit(node.iter)
        self.push(set())
        self._add_target_names(node.target)
        for stmt in node.body + node.orelse:
            self.visit(stmt)
        self.pop()

    def visit_AsyncFor(self, node: ast.AsyncFor):
        self.visit_For(node)

    def visit_With(self, node: ast.With):
        pushed = 0
        for item in node.items:
            self.visit(item.context_expr)
            if item.optional_vars:
                self.push(set())
                pushed += 1
                self._add_target_names(item.optional_vars)
        for stmt in node.body:
            self.visit(stmt)
        for _ in range(pushed):
            self.pop()

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        self.push(set())
        if node.name:
            self.local_stack[-1].add(node.name)
        for stmt in node.body:
            self.visit(stmt)
        self.pop()


def collect_used_names(node: ast.AST, module_names: Set[str]) -> Set[str]:
    collector = NameCollector(module_names)
    collector.visit(node)
    return collector.used


def _relative_to_absolute_import(source: str) -> str:
    """Convert 'from .X import ...' used in app.storage.py into 'from app.X import ...'.

    Domain modules live under app.domains.storage.<domain>, so the same relative
    import would resolve to the wrong package. Absolute imports keep the same
    meaning as in the original storage.py.
    """
    # Replace any relative import anchored at the app package. The original
    # storage.py is at app/storage.py, so 'from .X' means 'from app.X'.
    return source.replace("from .", "from app.")


def get_original_header(lines: List[str], tree: ast.Module) -> str:
    """Return the header block (imports, psycopg try/except, module docstring, logger)."""
    parts = []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            src = source_for_node(node, lines)
            # Imports copied into domain modules must resolve from app.domains.storage.*.
            parts.append(_relative_to_absolute_import(src))
        elif isinstance(node, ast.Try):
            # Include the psycopg optional import try/except block.
            parts.append(source_for_node(node, lines))
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            # Module-level docstring.
            parts.append(source_for_node(node, lines))
        elif isinstance(node, ast.Assign) and all(isinstance(t, ast.Name) and t.id == "logger" for t in node.targets):
            # logger assignment is part of header.
            parts.append(source_for_node(node, lines))
        else:
            break
    header = "".join(parts)
    # Strip any existing __future__ import; we add our own.
    lines_out = []
    for line in header.splitlines(keepends=True):
        if line.strip().startswith("from __future__ import annotations"):
            continue
        lines_out.append(line)
    return "".join(lines_out)


def get_import_header(original_header: str) -> str:
    """Build file header with future annotations + original imports."""
    lines = ["from __future__ import annotations\n", "\n"]
    if original_header:
        lines.append(original_header)
        if not original_header.endswith("\n"):
            lines.append("\n")
    lines.append("\n")
    return "".join(lines)


def format_bottom_imports(file_imports: List[str]) -> str:
    """Return cross-domain imports placed at the bottom of a module.

    Placing them after all definitions breaks simple circular imports between
    domain repository modules while keeping the generated files valid.
    """
    if not file_imports:
        return ""
    return "\n\n" + "\n".join(f"{imp}" for imp in sorted(set(file_imports))) + "\n"


def format_call_args(args: ast.arguments) -> str:
    """Format arguments for a function call preserving signature shape."""
    parts = []
    positional = [a.arg for a in args.posonlyargs + args.args]
    vararg = args.vararg.arg if args.vararg else None
    kwonly = [a.arg for a in args.kwonlyargs]
    kwarg = args.kwarg.arg if args.kwarg else None

    parts.extend(positional)
    if vararg:
        parts.append(f"*{vararg}")
    for name in kwonly:
        parts.append(f"{name}={name}")
    if kwarg:
        parts.append(f"**{kwarg}")

    return ", ".join(parts)


def rewrite_method_as_facade(method: ast.FunctionDef, domain_func_name: str, domain: str, lines: List[str]) -> str:
    """Return a method definition that delegates to a domain function."""
    source = source_for_node(method, lines)
    src_lines = source.splitlines(keepends=True)

    # Rebuild decorators from source.
    dec_lines = []
    for dec in method.decorator_list:
        dec_src = source_for_node(dec, lines).strip()
        dec_lines.append(f"@{dec_src}\n")

    # Find the line index of the 'def ' keyword within the extracted source.
    sig_line_idx = 0
    for i, line in enumerate(src_lines):
        stripped = line.lstrip()
        if stripped.startswith("def "):
            sig_line_idx = i
            break

    # Signature spans from 'def ' line up to (but not including) the first body statement.
    first_body_lineno = method.body[0].lineno
    body_start_idx = first_body_lineno - method.lineno
    signature_lines = src_lines[sig_line_idx:body_start_idx]

    after_sig = src_lines[body_start_idx:]

    # Extract docstring if present.
    docstring = ""
    if after_sig:
        first_body = after_sig[0].lstrip()
        if first_body.startswith(('"""', "'''")):
            quote = '"""' if '"""' in first_body else "'''"
            if first_body.count(quote) >= 2:
                docstring = after_sig[0].rstrip() + "\n"
            else:
                doc_lines = [after_sig[0]]
                for j in range(1, len(after_sig)):
                    doc_lines.append(after_sig[j])
                    if quote in after_sig[j]:
                        break
                docstring = "".join(doc_lines).rstrip() + "\n"

    indent = "        "
    call_args = format_call_args(method.args)
    # Private facade targets are imported directly into storage.py, so call them
    # by name rather than via the domain module object.
    delegation = f"{indent}return {domain_func_name}({call_args})\n"

    out_lines = list(dec_lines)
    out_lines.extend(signature_lines)
    if docstring:
        out_lines.append(docstring + "\n")
    out_lines.append(delegation)
    return "".join(out_lines)


def extract_method_to_function(
    cls_node: ast.ClassDef, method: ast.FunctionDef, func_name: str, lines: List[str]
) -> str:
    """Return a standalone function source extracted from a class method."""
    source = source_for_node(method, lines)
    src_lines = source.splitlines(keepends=True)

    # Compute the indentation of the method inside the class body.
    method_indent = None
    for line in src_lines:
        stripped = line.lstrip()
        if stripped.startswith("def ") or stripped.startswith("@"):
            method_indent = len(line) - len(line.lstrip())
            break

    # Replace method name with new function name, keep `self` parameter,
    # and dedent so the function becomes a module-level definition.
    for i, line in enumerate(src_lines):
        stripped = line.lstrip()
        if stripped.startswith("def "):
            prefix = line[: line.index("def ") + 4]
            rest = line[line.index("def ") + 4 :]
            # rest starts with method.name + '('.
            rest = func_name + rest[len(method.name) :]
            src_lines[i] = prefix + rest
            break

    if method_indent:
        dedented = []
        for line in src_lines:
            if line.strip() and line.startswith(" " * method_indent):
                dedented.append(line[method_indent:])
            else:
                dedented.append(line)
        src_lines = dedented

    return "".join(src_lines)


def class_methods(cls_node: ast.ClassDef) -> List[ast.FunctionDef]:
    return [n for n in cls_node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]


def _classify_import(domain: str, source_domain: str) -> str:
    """Classify a cross-domain import for the decomposition boundary rules.

    - INTERNAL: low-level compat primitives shared inside the future storage service.
    - MISPLACED: one of the domains is slated to become a separate service.
    - FACADE: both domains stay inside storage service, so call through public facade.
    """
    if source_domain == "compat" or domain == "compat":
        return "INTERNAL"
    if source_domain in MISPLACED_DOMAINS or domain in MISPLACED_DOMAINS:
        return "MISPLACED"
    return "FACADE"


def _public_alias(name: str) -> str:
    """Public facade alias for a private helper.

    Private names lose their leading underscore; public names stay unchanged.
    """
    return name[1:] if name.startswith("_") else name


def _apply_rename(source: str, rename_map: Dict[str, str]) -> str:
    """Rename identifiers inside a source block using whole-word matching.

    Longest names are replaced first to avoid partial replacements.
    """
    for old_name, new_name in sorted(rename_map.items(), key=lambda kv: -len(kv[0])):
        source = re.sub(rf"\b{re.escape(old_name)}\b", new_name, source)
    return source


def generate(
    target_root: Path | None = None,
    storage_path: Path | None = None,
) -> None:
    target_root = target_root or TARGET_ROOT
    storage_path = storage_path or STORAGE_PATH

    lines, tree = read_storage_source()
    entity_map = load_entity_domain_map()
    name_to_domain, method_to_domain, top_level = map_entities(tree, entity_map)

    module_names = set(top_level.keys())

    # Determine domain for each top-level entity in deterministic source order.
    domain_entities: Dict[str, List[ast.AST]] = defaultdict(list)
    facade_dependent_nodes: Dict[str, ast.AST] = {}
    for name in sorted(top_level.keys()):
        node = top_level[name]
        if name in FACADE_CLASSES:
            continue
        if name in FACADE_DEPENDENT_FUNCTIONS:
            facade_dependent_nodes[name] = node
            continue
        domain = name_to_domain.get(name)
        if not domain:
            domain = "compat"
            name_to_domain[name] = domain
        domain_entities[domain].append(node)

    # Storage/ProjectStorage methods become standalone functions in their domains.
    facade_method_funcs: Dict[str, Dict[Tuple[str, str], str]] = defaultdict(dict)
    for cls_name in FACADE_CLASSES:
        cls_node = top_level[cls_name]
        for method in class_methods(cls_node):
            domain = method_to_domain.get((cls_name, method.name), "compat")
            func_name = f"_{cls_name.lower()}_{method.name}"
            facade_method_funcs[domain][(cls_name, method.name)] = func_name

    # Collect used names per domain (entities + extracted method functions).
    domain_used: Dict[str, Set[str]] = defaultdict(set)
    for domain in sorted(domain_entities.keys()):
        for node in domain_entities[domain]:
            used = collect_used_names(node, module_names)
            domain_used[domain].update(used)
    for domain in sorted(facade_method_funcs.keys()):
        for (cls_name, method_name) in sorted(facade_method_funcs[domain].keys()):
            cls_node = top_level[cls_name]
            method = next(m for m in class_methods(cls_node) if m.name == method_name)
            used = collect_used_names(method, module_names)
            domain_used[domain].update(used)

    # Build imports per domain. Constants must be imported at the top (they may be
    # used in default arguments/annotations); functions/classes can be imported at
    # the bottom to break circular imports between repository modules.
    top_imports: Dict[str, List[str]] = defaultdict(list)
    bottom_imports: Dict[str, List[str]] = defaultdict(list)
    # facade_aliases[source_domain][original_name] = public_alias_name
    facade_aliases: Dict[str, Dict[str, str]] = defaultdict(dict)
    for domain in sorted(domain_used.keys()):
        for name in sorted(domain_used[domain]):
            source_domain = name_to_domain.get(name)
            if not source_domain or source_domain == domain:
                continue
            target_node = top_level.get(name)
            is_constant = isinstance(target_node, (ast.Assign, ast.AnnAssign))
            classification = _classify_import(domain, source_domain)
            if classification == "FACADE" and not is_constant:
                public_name = _public_alias(name)
                facade_aliases[source_domain][name] = public_name
                bottom_imports[domain].append(f"from ..{source_domain} import {public_name}")
            else:
                import_line = f"from ..{source_domain}.repository import {name}"
                if is_constant:
                    top_imports[domain].append(import_line)
                else:
                    bottom_imports[domain].append(import_line)

    original_header = get_original_header(lines, tree)

    # Idempotency: wipe target domain dirs.
    if target_root.exists():
        shutil.rmtree(target_root)
    target_root.mkdir(parents=True, exist_ok=True)

    # Build per-domain rename maps for facade imports, keyed by IMPORTING domain.
    # The source domain keeps its original name; only importing domains that
    # actually receive a facade-style import rename their usages.
    domain_rename_maps: Dict[str, Dict[str, str]] = defaultdict(dict)
    for domain in sorted(domain_used.keys()):
        for name in sorted(domain_used[domain]):
            source_domain = name_to_domain.get(name)
            if not source_domain or source_domain == domain:
                continue
            target_node = top_level.get(name)
            is_constant = isinstance(target_node, (ast.Assign, ast.AnnAssign))
            if _classify_import(domain, source_domain) == "FACADE" and not is_constant:
                domain_rename_maps[domain][name] = _public_alias(name)

    # Write domain repository.py files.
    for domain in DOMAINS:
        domain_dir = target_root / domain
        domain_dir.mkdir(parents=True, exist_ok=True)
        repo_path = domain_dir / "repository.py"

        rename_map = domain_rename_maps.get(domain, {})
        domain_top_imports = top_imports.get(domain, [])
        domain_bottom_imports = bottom_imports.get(domain, [])
        header = get_import_header(original_header)
        extra_top = "\n".join(f"{imp}" for imp in sorted(set(domain_top_imports)))
        if extra_top:
            header = header.rstrip() + "\n" + extra_top + "\n\n"
        bottom_imports_text = format_bottom_imports(sorted(set(domain_bottom_imports)))

        body_parts = []
        for node in domain_entities.get(domain, []):
            body_parts.append(_apply_rename(source_for_node(node, lines), rename_map))
            body_parts.append("\n\n")

        # Add extracted facade method functions.
        for (cls_name, method_name) in sorted(facade_method_funcs.get(domain, {}).keys()):
            cls_node = top_level[cls_name]
            method = next(m for m in class_methods(cls_node) if m.name == method_name)
            func_name = facade_method_funcs[domain][(cls_name, method_name)]
            body_parts.append(
                _apply_rename(extract_method_to_function(cls_node, method, func_name, lines), rename_map)
            )
            body_parts.append("\n\n")

        repo_path.write_text(header + "".join(body_parts).rstrip() + bottom_imports_text, encoding="utf-8")

    # Write domain __init__.py files.
    for domain in DOMAINS:
        domain_dir = target_root / domain
        public_names: List[str] = []
        for node in domain_entities.get(domain, []):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if not node.name.startswith("_"):
                    public_names.append(node.name)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                target = node.targets[0] if isinstance(node, ast.Assign) else node.target
                if isinstance(target, ast.Name) and not target.id.startswith("_"):
                    public_names.append(target.id)

        alias_imports = sorted(
            f"{old_name} as {new_name}"
            for old_name, new_name in facade_aliases.get(domain, {}).items()
            if old_name != new_name
        )
        all_imports = sorted(set(public_names)) + alias_imports

        init_lines = ["from __future__ import annotations\n\n"]
        if all_imports:
            init_lines.append(f"from .repository import {', '.join(all_imports)}\n")
        init_path = domain_dir / "__init__.py"
        init_path.write_text("".join(init_lines), encoding="utf-8")

    # Write storage/domains/storage/__init__.py exposing all domains.
    root_init_lines = ["from __future__ import annotations\n\n"]
    for domain in DOMAINS:
        root_init_lines.append(f"from . import {domain}\n")
    (target_root / "__init__.py").write_text("".join(root_init_lines), encoding="utf-8")

    # Rewrite storage.py as facade.
    rewrite_storage_facade(
        lines,
        tree,
        top_level,
        name_to_domain,
        facade_dependent_nodes,
        original_header,
        storage_path=storage_path,
    )


def rewrite_storage_facade(
    lines: List[str],
    tree: ast.Module,
    top_level: Dict[str, ast.AST],
    name_to_domain: Dict[str, str],
    facade_dependent_nodes: Dict[str, ast.AST],
    original_header: str,
    storage_path: Path | None = None,
):
    """Overwrite backend/app/storage.py with a thin facade."""
    storage_path = storage_path or STORAGE_PATH
    # Re-export all top-level names originally defined in storage.py for backward
    # compatibility. Public names come from the domain package; private names are
    # imported directly from the domain repository module. Facade-dependent
    # functions are defined in storage.py itself and are not re-imported.
    public_names_by_domain: Dict[str, List[str]] = defaultdict(list)
    private_names_by_domain: Dict[str, List[str]] = defaultdict(list)
    for name in sorted(top_level.keys()):
        node = top_level[name]
        if name in FACADE_CLASSES or name in FACADE_DEPENDENT_FUNCTIONS:
            continue
        domain = name_to_domain.get(name, "compat")
        if name.startswith("_"):
            private_names_by_domain[domain].append(name)
        else:
            public_names_by_domain[domain].append(name)

    # Imports of public names from domain packages.
    public_import_lines = []
    for domain in DOMAINS:
        names = sorted(public_names_by_domain.get(domain, []))
        if names:
            public_import_lines.append(f"from app.domains.storage.{domain} import {', '.join(names)}")

    # Imports of private names from domain repository modules.
    private_reexport_lines = []
    for domain in DOMAINS:
        names = sorted(private_names_by_domain.get(domain, []))
        if names:
            private_reexport_lines.append(
                f"from app.domains.storage.{domain}.repository import {', '.join(names)}"
            )

    class_sources = [_build_facade_classes()]

    # Functions that instantiate the facade classes remain in storage.py.
    dependent_sources = [source_for_node(node, lines) for node in facade_dependent_nodes.values()]

    new_source = (
        "from __future__ import annotations\n\n"
        + original_header
        + "\n"
        + "\n".join(public_import_lines + private_reexport_lines)
        + "\n\n"
        + "import app.domains.storage.compat.repository as _compat_repo\n\n"
        + "\n\n".join(class_sources + dependent_sources)
        + "\n"
    )

    storage_path.write_text(new_source, encoding="utf-8")


def _build_facade_classes() -> str:
    """Return thin Storage/ProjectStorage facades with dynamically attached methods."""
    return '''def _attach_compat_methods(cls, prefix: str, skip: str) -> None:
    for _name in dir(_compat_repo):
        if _name.startswith(prefix):
            _method = _name[len(prefix):]
            if _method != skip:
                setattr(cls, _method, getattr(_compat_repo, _name))


@dataclass
class Storage:
    base_dir: Path
    def __post_init__(self) -> None:
        return _compat_repo._storage___post_init__(self)


_attach_compat_methods(Storage, "_storage_", "__post_init__")


class ProjectStorage:
    def __init__(self, root: Path) -> None:
        return _compat_repo._projectstorage___init__(self, root)


_attach_compat_methods(ProjectStorage, "_projectstorage_", "__init__")
'''


if __name__ == "__main__":
    generate()
    print(f"Generated domain modules under {TARGET_ROOT}")
    print(f"Rewrote facade at {STORAGE_PATH}")
