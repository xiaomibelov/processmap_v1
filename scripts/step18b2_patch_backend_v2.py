from __future__ import annotations

import re
from pathlib import Path


def _read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def _write(p: Path, s: str) -> None:
    p.write_text(s, encoding="utf-8")


def patch_models() -> None:
    p = Path("backend/app/models.py")
    s = _read(p)

    if re.search(r"\bstart_role\s*:\s*Optional\[str\]", s):
        print("models.py: start_role already present")
        return

    m = re.search(r"class\s+Session\([^\)]*\):\n", s)
    if not m:
        raise SystemExit("models.py: Session class not found")

    roles_field = re.search(
        r"\n\s*roles\s*:\s*List\[str\]\s*=\s*Field\(default_factory=list\)\s*\n",
        s[m.end() :],
    )
    if roles_field:
        insert_at = m.end() + roles_field.end()
        ins = "    start_role: Optional[str] = None\n"
        s2 = s[:insert_at] + ins + s[insert_at:]
        _write(p, s2)
        print("models.py: inserted start_role after roles")
        return

    insert_at = m.end()
    ins = "    start_role: Optional[str] = None\n"
    s2 = s[:insert_at] + ins + s[insert_at:]
    _write(p, s2)
    print("models.py: inserted start_role at top of Session")


def patch_mermaid() -> None:
    p = Path("backend/app/exporters/mermaid.py")
    s = _read(p)

    sig = re.search(r"^def\s+render_mermaid\(([^\)]*)\)\s*->\s*str:\s*$", s, flags=re.M)
    if not sig:
        raise SystemExit("mermaid.py: render_mermaid() signature not found")

    params = sig.group(1)
    if "start_role" not in params:
        if "mode" in params:
            params2 = re.sub(r"\bmode\s*:\s*str", "start_role=None, mode: str", params, count=1)
        else:
            params2 = params.rstrip() + ", start_role=None"
        s = s[: sig.start(1)] + params2 + s[sig.end(1) :]
        print("mermaid.py: added start_role to render_mermaid signature")

    if "_render_empty_pool_lanes" not in s:
        s += (
            "\n\n"
            "def _render_empty_pool_lanes(roles, start_role):\n"
            "    lines = []\n"
            "    lines.append(\"flowchart LR\")\n"
            "    lines.append(\"  subgraph pool_1[\\\"Процесс\\\"]\")\n"
            "    lines.append(\"    direction LR\")\n"
            "    for r in roles:\n"
            "        label = _esc(r)\n"
            "        if start_role and r == start_role:\n"
            "            label = f\"{label} • START\"\n"
            "        lane_id = _lane_id(r)\n"
            "        lines.append(f\"    subgraph {lane_id}[\\\"{label}\\\"]\")\n"
            "        lines.append(\"      direction TB\")\n"
            "        lines.append(\"    end\")\n"
            "    lines.append(\"  end\")\n"
            "    return \"\\n\".join(lines) + \"\\n\"\n"
        )
        print("mermaid.py: appended _render_empty_pool_lanes helper")

    body_m = re.search(r"def\s+render_mermaid\([^\)]*\)\s*->\s*str:\n", s)
    if not body_m:
        raise SystemExit("mermaid.py: render_mermaid() body not found")

    after = s[body_m.end() :]

    replacement = (
        "\n    if not nodes:\n"
        "        if mode == \\\"lanes\\\" and roles:\n"
        "            return _render_empty_pool_lanes(roles, start_role)\n"
        "        return _PLACEHOLDER_MERMAID\n"
    )

    m_if = re.search(r"\n\s*if\s+not\s+nodes\s*:\n(?:\s+.*\n){1,8}", after)
    if m_if and "_PLACEHOLDER_MERMAID" in m_if.group(0):
        after2 = after[: m_if.start()] + replacement + after[m_if.end() :]
        s = s[: body_m.end()] + after2
        print("mermaid.py: replaced empty-nodes block")
    else:
        inject_point = body_m.end()
        m_mode = re.search(r"\n\s*mode\s*=.*\n", after)
        if m_mode:
            inject_point = body_m.end() + m_mode.end()
        s = s[:inject_point] + replacement + s[inject_point:]
        print("mermaid.py: injected empty-nodes block")

    _write(p, s)


def patch_main() -> None:
    p = Path("backend/app/main.py")
    s = _read(p)

    m = re.search(r"class\s+CreateSessionIn\(BaseModel\):\n(?P<body>(?:\s+.*\n)+?)\n", s)
    if not m:
        raise SystemExit("main.py: CreateSessionIn not found")

    body = m.group("body")
    if "start_role" not in body:
        if re.search(r"\s+roles\s*:\s*Optional\[List\[str\]\]", body):
            body2 = re.sub(
                r"(\s+roles\s*:\s*Optional\[List\[str\]\]\s*=\s*None\n)",
                r"\1    start_role: Optional[str] = None\n",
                body,
                count=1,
            )
        else:
            body2 = body + "    start_role: Optional[str] = None\n"
        s = s[: m.start("body")] + body2 + s[m.end("body") :]
        print("main.py: added CreateSessionIn.start_role")

    s = s.replace(
        'render_mermaid(s.nodes, s.edges, roles=s.roles, mode="lanes")',
        'render_mermaid(s.nodes, s.edges, roles=s.roles, start_role=getattr(s, "start_role", None), mode="lanes")',
    )
    s = s.replace(
        'render_mermaid(s.nodes, s.edges, roles=s.roles, mode="simple")',
        'render_mermaid(s.nodes, s.edges, roles=s.roles, start_role=getattr(s, "start_role", None), mode="simple")',
    )

    if "@app.post(\"/api/sessions\")" in s and "start_role=" not in s.split("@app.post(\"/api/sessions\")", 1)[1].split("@app", 1)[0]:
        s = re.sub(
            r"(roles\s*=\s*inp\.roles\s*or\s*\[[^\]]+\]\n)",
            r"\1    start_role = (inp.start_role or (roles[0] if roles else None))\n",
            s,
            count=1,
        )
        s = re.sub(
            r"Session\(id=(?P<sid>[^,]+),\s*title=inp\.title,\s*roles=roles,\s*version=1\)",
            r"Session(id=\g<sid>, title=inp.title, roles=roles, start_role=start_role, version=1)",
            s,
            count=1,
        )
        print("main.py: stored start_role in Session() on create")

    _write(p, s)


def main() -> None:
    patch_models()
    patch_mermaid()
    patch_main()


if __name__ == "__main__":
    main()
