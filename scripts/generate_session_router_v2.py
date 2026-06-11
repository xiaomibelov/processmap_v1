#!/usr/bin/env python3
"""Generate routers/sessions.py from _legacy_main.py session endpoints (v2)."""
from __future__ import annotations

import ast
import sys

sys.path.insert(0, "backend")


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


def _build_sig_and_call(node: ast.FunctionDef) -> tuple[str, str]:
    params = []
    call_args = []
    defaults_offset = len(node.args.args) - len(node.args.defaults)
    for idx, arg in enumerate(node.args.args):
        name = arg.arg
        ann = ast.unparse(arg.annotation) if arg.annotation else None
        default = None
        if idx >= defaults_offset:
            default = ast.unparse(node.args.defaults[idx - defaults_offset])

        # Determine FastAPI kind
        is_path = False
        is_query = False
        if arg.annotation:
            ann_str = ast.unparse(arg.annotation)
            if "Path(" in ann_str:
                is_path = True
            elif "Query(" in ann_str:
                is_query = True

        if is_path:
            params.append(f"{name}: {ann}")
        elif is_query:
            params.append(f"{name}: {ann}")
        elif ann and default:
            params.append(f"{name}: {ann} = {default}")
        elif ann:
            params.append(f"{name}: {ann}")
        elif default:
            params.append(f"{name}={default}")
        else:
            params.append(name)
        call_args.append(name)

    if node.args.kwarg:
        params.append(f"**{node.args.kwarg.arg}")
        call_args.append(f"**{node.args.kwarg.arg}")

    sig = ", ".join(params)
    call = ", ".join(call_args)
    return sig, call


def _generate(endpoints, out_path: str):
    lines = [
        "from __future__ import annotations",
        "",
        "from fastapi import APIRouter, Request, Query, Path, HTTPException",
        "from fastapi.responses import JSONResponse",
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
        sig, call = _build_sig_and_call(node)

        lines.append(f"@router.{method.lower()}('{path}')")
        lines.append(f"def {fname}({sig}):")
        lines.append(f"    import backend.app._legacy_main as _lm")
        lines.append(f"    return _lm.{fname}({call})")
        lines.append("")

    with open(out_path, "w") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    endpoints = _collect_session_endpoints("backend/app/_legacy_main.py")
    print(f"Found {len(endpoints)} session endpoints")
    _generate(endpoints, "backend/app/routers/sessions.py")
