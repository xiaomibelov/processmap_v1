#!/usr/bin/env python3
"""Generate routers/sessions.py from _legacy_main.py session endpoints."""
from __future__ import annotations

import ast
import inspect
import textwrap


def _is_session_path(path: str) -> bool:
    src = str(path or "")
    if src.startswith("/api/projects/{project_id}/sessions"):
        return True
    if not src.startswith("/api/sessions"):
        return False
    return "/reports" not in src


def _is_org_session_path(path: str) -> bool:
    return "/sessions/" in path and path.startswith("/api/orgs/")


def _collect_session_endpoints(source_path: str):
    with open(source_path) as f:
        tree = ast.parse(f.read())

    endpoints = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        for dec in node.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            func = dec.func
            if not isinstance(func, ast.Attribute):
                continue
            if func.attr not in ("get", "post", "put", "patch", "delete"):
                continue
            if not (isinstance(func.value, ast.Name) and func.value.id == "app"):
                continue
            path = ""
            if dec.args and isinstance(dec.args[0], ast.Constant):
                path = dec.args[0].value
            if not (path and (_is_session_path(path) or _is_org_session_path(path))):
                continue
            endpoints.append((node, func.attr, path))
    return endpoints


def _param_name(p: ast.arg) -> str:
    return p.arg


def _annotation_str(ann) -> str | None:
    if ann is None:
        return None
    if isinstance(ann, ast.Name):
        return ann.id
    if isinstance(ann, ast.Constant):
        return repr(ann.value)
    if isinstance(ann, ast.Attribute):
        parts = []
        n = ann
        while isinstance(n, ast.Attribute):
            parts.append(n.attr)
            n = n.value
        if isinstance(n, ast.Name):
            parts.append(n.id)
        return ".".join(reversed(parts))
    if isinstance(ann, ast.Subscript):
        return ast.unparse(ann)
    return None


def _default_str(d) -> str | None:
    if isinstance(d, ast.Constant):
        return repr(d.value)
    if isinstance(d, ast.NameConstant):
        return repr(d.value)
    if isinstance(d, ast.Name):
        return d.id
    return None


def _build_sig(node: ast.FunctionDef) -> str:
    params = []
    defaults_offset = len(node.args.args) - len(node.args.defaults)
    for idx, arg in enumerate(node.args.args):
        name = _param_name(arg)
        ann = _annotation_str(arg.annotation)
        default = None
        if idx >= defaults_offset:
            default = _default_str(node.args.defaults[idx - defaults_offset])
        if ann and default:
            params.append(f"{name}: {ann} = {default}")
        elif ann:
            params.append(f"{name}: {ann}")
        elif default:
            params.append(f"{name}={default}")
        else:
            params.append(name)
    # *args / **kwargs (ignore for now)
    if node.args.kwarg:
        params.append(f"**{node.args.kwarg.arg}")
    return ", ".join(params)


def _generate_router(endpoints, out_path: str):
    lines = [
        "from __future__ import annotations",
        "",
        "from fastapi import APIRouter, Request",
        "from fastapi.responses import JSONResponse",
        "",
        "from ..services import session_service as _svc",
        "",
        "router = APIRouter()",
        "",
    ]

    seen = set()
    for node, method, path in endpoints:
        key = (method.upper(), path)
        if key in seen:
            continue
        seen.add(key)

        fname = node.name
        sig = _build_sig(node)
        # Strip request/response from service call if possible
        # For now: generate a wrapper that calls _svc.<fname>(...)
        lines.append(f"@router.{method.lower()}('{path}')")
        lines.append(f"def {fname}({sig}):")
        # Build call args — pass all positional args except 'request' / 'response'
        call_args = []
        for arg in node.args.args:
            aname = arg.arg
            if aname in ("request", "response", "req", "resp"):
                continue
            call_args.append(aname)
        if call_args:
            lines.append(f"    return _svc.{fname}({', '.join(call_args)})")
        else:
            lines.append(f"    return _svc.{fname}()")
        lines.append("")

    with open(out_path, "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    endpoints = _collect_session_endpoints("backend/app/_legacy_main.py")
    print(f"Found {len(endpoints)} session endpoints")
    _generate_router(endpoints, "backend/app/routers/sessions_new.py")
