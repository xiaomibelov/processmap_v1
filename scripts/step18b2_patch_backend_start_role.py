from __future__ import annotations

import re
from pathlib import Path

def patch_models() -> None:
    p = Path("backend/app/models.py")
    s = p.read_text(encoding="utf-8")

    if re.search(r"\bstart_role\s*:\s*Optional\[str\]", s):
        print("models.py: start_role already present")
        return

    pat = r"(class\s+Session\(BaseModel\):\n(?:.*\n)*?\s*roles:\s*List\[str\]\s*=\s*Field\(default_factory=list\)\n)"
    m = re.search(pat, s)
    if not m:
        raise SystemExit("models.py: could not find Session.roles field to insert start_role after")

    insert = m.group(1) + "    start_role: Optional[str] = None\n"
    s2 = s[:m.start(1)] + insert + s[m.end(1):]
    p.write_text(s2, encoding="utf-8")
    print("models.py: inserted start_role")

def patch_mermaid() -> None:
    p = Path("backend/app/exporters/mermaid.py")
    s = p.read_text(encoding="utf-8")

    if not re.search(r"def render_mermaid\([^\)]*start_role", s):
        s = re.sub(
            r"def render_mermaid\(\s*nodes:\s*List\[Node\],\s*edges:\s*List\[Edge\],\s*roles:\s*Optional\[List\[str\]\]\s*=\s*None,\s*mode:\s*str\s*=\s*\"lanes\"\s*\)\s*->\s*str:",
            "def render_mermaid(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]] = None, start_role: Optional[str] = None, mode: str = \"lanes\") -> str:",
            s,
            count=1,
        )

    # Replace the early-return block to support empty lanes
    s = re.sub(
        r"def render_mermaid\([^\)]*\)\s*->\s*str:\n\s*if not nodes:\n\s*return _PLACEHOLDER_MERMAID\n",
        "def render_mermaid(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]] = None, start_role: Optional[str] = None, mode: str = \"lanes\") -> str:\n"
        "    mode = (mode or \"lanes\").strip().lower()\n"
        "    if mode not in (\"lanes\", \"simple\"):\n"
        "        mode = \"lanes\"\n"
        "    if not nodes:\n"
        "        if mode == \"lanes\" and roles:\n"
        "            return _render_lanes([], [], roles, start_role)\n"
        "        return _PLACEHOLDER_MERMAID\n",
        s,
        count=1,
    )

    s = re.sub(
        r"return _render_lanes\(nodes,\s*edges,\s*roles\)",
        "return _render_lanes(nodes, edges, roles, start_role)",
        s,
        count=1,
    )

    if re.search(r"def _render_lanes\(nodes: List\[Node\], edges: List\[Edge\], roles: Optional\[List\[str\]\]\) -> str:", s):
        s = re.sub(
            r"def _render_lanes\(nodes: List\[Node\], edges: List\[Edge\], roles: Optional\[List\[str\]\]\) -> str:",
            "def _render_lanes(nodes: List[Node], edges: List[Edge], roles: Optional[List[str]], start_role: Optional[str]) -> str:",
            s,
            count=1,
        )

    s = s.replace('lines.append("flowchart TD")', 'lines.append("flowchart LR")', 1)

    if 'subgraph pool_1["Процесс"]' not in s:
        anchor = 'lines.append(\\'  classDef ok fill:#f7f7f7,stroke:#c9c9c9;\\')\\n'
        if anchor not in s:
            raise SystemExit("mermaid.py: could not find classDef ok anchor to insert pool wrapper")
        s = s.replace(
            anchor,
            anchor
            + "\\n    lines.append('  subgraph pool_1[\\\"Процесс\\\"]')\\n"
            + "    lines.append('    direction LR')\\n",
            1,
        )

        # Insert pool end after lane loop by replacing the first occurrence of "for e in edges:"
        s = s.replace("    for e in edges:", "    lines.append('  end')\\n\\n    for e in edges:", 1)

    # Mark start lane label
    if "label = _esc(r)" in s and "• START" not in s:
        s = s.replace(
            "        label = _esc(r)",
            "        label = _esc(r)\\n        if start_role and r == start_role:\\n            label = f\\\"{label} • START\\\"",
            1,
        )

    # Nest lane subgraphs one level deeper (inside pool)
    s = s.replace('lines.append(f\\'  subgraph {lane_id}[\\"{label}\\"]\\')', 'lines.append(f\\'    subgraph {lane_id}[\\"{label}\\"]\\')', 1)
    s = s.replace('lines.append("    direction TB")', 'lines.append("      direction TB")', 1)
    s = s.replace('lines.append(f"    {_node_def(n)}")', 'lines.append(f"      {_node_def(n)}")', 1)
    s = s.replace('lines.append("  end")', 'lines.append("    end")', 1)

    p.write_text(s, encoding="utf-8")
    print("mermaid.py: patched pool/lanes + start_role + empty lanes")

def patch_main() -> None:
    p = Path("backend/app/main.py")
    s = p.read_text(encoding="utf-8")

    if "class CreateSessionIn" in s and "start_role" not in s.split("class CreateSessionIn",1)[1].split("class",1)[0]:
        s = re.sub(
            r"(class CreateSessionIn\\(BaseModel\\):\\n\\s*title:\\s*str\\n\\s*roles:\\s*Optional\\[List\\[str\\]\\]\\s*=\\s*None\\n)",
            r"\\1    start_role: Optional[str] = None\\n",
            s,
            count=1,
        )

    if "def _recompute_session" in s and "s.start_role" not in s.split("def _recompute_session",1)[1].split("@app.",1)[0]:
        s = re.sub(
            r"(def _recompute_session\\(s: Session\\) -> Session:\\n)",
            r"\\1    if not getattr(s, 'start_role', None) and s.roles:\\n        s.start_role = s.roles[0]\\n\\n",
            s,
            count=1,
        )

    s = s.replace(
        'render_mermaid(s.nodes, s.edges, roles=s.roles, mode="simple")',
        'render_mermaid(s.nodes, s.edges, roles=s.roles, start_role=getattr(s, "start_role", None), mode="simple")',
    )
    s = s.replace(
        'render_mermaid(s.nodes, s.edges, roles=s.roles, mode="lanes")',
        'render_mermaid(s.nodes, s.edges, roles=s.roles, start_role=getattr(s, "start_role", None), mode="lanes")',
    )

    if '@app.post("/api/sessions")' in s and "start_role = (inp.start_role" not in s:
        s = re.sub(
            r"(roles\\s*=\\s*inp\\.roles\\s*or\\s*\\[[^\\]]+\\]\\n)",
            r"\\1    start_role = (inp.start_role or (roles[0] if roles else None))\\n",
            s,
            count=1,
        )
        s = re.sub(
            r"Session\\(id=sid,\\s*title=inp\\.title,\\s*roles=roles,\\s*version=1\\)",
            "Session(id=sid, title=inp.title, roles=roles, start_role=start_role, version=1)",
            s,
            count=1,
        )

    # Patch endpoint: if exists, do nothing (JS fallback works). If absent, add minimal PATCH.
    if '@app.patch("/api/sessions/' not in s:
        ins_point = s.find('@app.post("/api/sessions/{session_id}/recompute")')
        if ins_point == -1:
            raise SystemExit("main.py: could not find insertion point for patch endpoint")

        block_lines = [
            "",
            "class PatchSessionIn(BaseModel):",
            "    title: Optional[str] = None",
            "    roles: Optional[List[str]] = None",
            "    start_role: Optional[str] = None",
            "",
            "",
            "@app.patch(\"/api/sessions/{session_id}\")",
            "def patch_session(session_id: str, inp: PatchSessionIn) -> Dict[str, Any]:",
            "    st = get_storage()",
            "    s = st.load(session_id)",
            "    if not s:",
            "        return {\"error\": \"not found\"}",
            "    if inp.title is not None:",
            "        s.title = inp.title",
            "    if inp.roles is not None:",
            "        s.roles = [r for r in inp.roles if r]",
            "        seen = set()",
            "        s.roles = [r for r in s.roles if not (r in seen or seen.add(r))]",
            "        if s.roles and (not getattr(s, \"start_role\", None) or getattr(s, \"start_role\", None) not in s.roles):",
            "            s.start_role = s.roles[0]",
            "    if inp.start_role is not None:",
            "        s.start_role = inp.start_role",
            "        if s.roles and s.start_role not in s.roles:",
            "            s.roles = s.roles + [s.start_role]",
            "    s = _recompute_session(s)",
            "    st.save(s)",
            "    return s.model_dump()",
            "",
        ]
        block = "\n".join(block_lines)
        s = s[:ins_point] + block + "\n" + s[ins_point:]

    p.write_text(s, encoding="utf-8")
    print("main.py: patched start_role + mermaid pass-through + PATCH (if missing)")

def main() -> None:
    patch_models()
    patch_mermaid()
    patch_main()

if __name__ == "__main__":
    main()

