from __future__ import annotations
from pathlib import Path
import re

def ensure_import_optional(text: str) -> str:
    if "from typing import" in text and "Optional" in text:
        return text
    if "from typing import" in text:
        return re.sub(r"from typing import ([^\n]+)", lambda m: m.group(0) if "Optional" in m.group(0) else m.group(0) + ", Optional", text, count=1)
    if "import typing" in text or "typing." in text:
        return "from typing import Optional\n" + text
    return "from typing import Optional\n" + text

def patch_models():
    p = Path("backend/app/models.py")
    s = p.read_text(encoding="utf-8", errors="replace")
    if "start_role" in s:
        return False, "models.py: start_role already present"
    s2 = ensure_import_optional(s)

    m = re.search(r"^class\s+Session\b.*?:\s*$", s2, re.M)
    if not m:
        raise RuntimeError("models.py: cannot find class Session")
    start = m.end()

    # find roles field inside Session block
    # naive block: until next class at column 0
    nxt = re.search(r"^class\s+\w+\b.*?:\s*$", s2[start:], re.M)
    end = start + (nxt.start() if nxt else len(s2) - start)
    block = s2[start:end]

    # insert after roles field if exists, else near top of block
    ins = "    start_role: Optional[str] = None\n"
    if re.search(r"^\s+roles\s*:\s*", block, re.M):
        block2 = re.sub(r"(^\s+roles\s*:\s*[^\n]*\n)", r"\1" + ins, block, count=1, flags=re.M)
    else:
        block2 = ins + block

    out = s2[:start] + block2 + s2[end:]
    p.write_text(out, encoding="utf-8")
    return True, "models.py: inserted Session.start_role"

def patch_mermaid():
    p = Path("backend/app/exporters/mermaid.py")
    s = p.read_text(encoding="utf-8", errors="replace")

    changed = False

    # 1) ensure render_mermaid signature has start_role
    sig = re.search(r"def\s+render_mermaid\s*\((.*?)\)\s*:", s, re.S)
    if not sig:
        raise RuntimeError("mermaid.py: cannot find render_mermaid signature")

    if "start_role" not in sig.group(1):
        args = sig.group(1).rstrip()
        # add start_role near roles if possible, else append
        if "roles" in args:
            args2 = re.sub(r"(roles\s*=\s*[^,\n\)]*)", r"\1, start_role=None", args, count=1)
        else:
            args2 = args + ", start_role=None"
        s = s[:sig.start(1)] + args2 + s[sig.end(1):]
        changed = True

    # 2) add helper _lane_key if absent
    if "_lane_key(" not in s:
        helper = """
def _lane_key(role: str) -> str:
    x = (role or "").strip().lower()
    x = re.sub(r"[^a-z0-9_]+", "_", x)
    x = re.sub(r"_+", "_", x).strip("_")
    return x or "role"
"""
        # ensure re imported
        if "import re" not in s:
            s = "import re\n" + s
            changed = True
        # put helper after imports
        mimp = re.search(r"^(?:import[^\n]+\n|from[^\n]+\n)+", s, re.M)
        if mimp:
            s = s[:mimp.end()] + helper + s[mimp.end():]
        else:
            s = helper + s
        changed = True

    # 3) ensure roles-only lanes rendering when nodes empty
    marker = "STEP18B2_V3_LANES_ONLY"
    if marker not in s:
        inject = f"""
    # {marker}
    if roles and (not nodes or len(nodes) == 0):
        lines = []
        lines.append("flowchart LR")
        lines.append('subgraph pool_1["Процесс"]')
        lines.append("  direction LR")
        for r in roles:
            rk = _lane_key(r)
            title = r
            if start_role and r == start_role:
                title = f"{r} • START"
            lines.append(f'  subgraph lane_{'{'}rk{'}'}["{ '{' }title{'}' }"]')
            lines.append("    direction TB")
            # placeholder so Mermaid draws empty lane
            lines.append(f"    lane_{'{'}rk{'}'}__p(( ))")
            lines.append("  end")
        lines.append("end")
        # hide placeholder circles visually
        lines.append("classDef _laneph fill:transparent,stroke:transparent,color:transparent;")
        for r in roles:
            rk = _lane_key(r)
            lines.append(f"class lane_{'{'}rk{'}'}__p _laneph;")
        return "\\n".join(lines) + "\\n"
"""
        # insert near top of render_mermaid body: after docstring / first lines
        # Find function body start line after signature
        fn = re.search(r"(def\s+render_mermaid\s*\(.*?\)\s*:)", s, re.S)
        if not fn:
            raise RuntimeError("mermaid.py: cannot locate render_mermaid def")
        body_start = fn.end()
        # insert after first newline
        nl = s.find("\n", body_start)
        if nl == -1:
            raise RuntimeError("mermaid.py: unexpected render_mermaid layout")
        s = s[:nl+1] + inject + s[nl+1:]
        changed = True

    p.write_text(s, encoding="utf-8")
    return changed, "mermaid.py: patched (signature + lanes-only)"

def patch_main():
    p = Path("backend/app/main.py")
    s = p.read_text(encoding="utf-8", errors="replace")
    changed = False

    # ensure Session(...) includes start_role if session is constructed via Session(
    if "start_role" not in s:
        # try to add start_role extraction in create session endpoint
        # look for roles extraction line
        if re.search(r"roles\s*=\s*.*data\.get\(\"roles\"", s):
            s = re.sub(
                r"(roles\s*=\s*.*data\.get\(\"roles\".*\)\s*\n)",
                r"\1    start_role = data.get(\"start_role\")\n",
                s,
                count=1
            )
            changed = True
        # when creating Session(... roles=roles ...)
        if re.search(r"Session\([^\)]*roles\s*=\s*roles", s, re.S):
            s = re.sub(r"(Session\([^\)]*roles\s*=\s*roles)([,\)])", r"\1, start_role=start_role\2", s, count=1, flags=re.S)
            changed = True

    # ensure recompute passes start_role to render_mermaid
    if "render_mermaid(" in s and "start_role=" not in s:
        s = re.sub(r"(render_mermaid\([^\)]*)(\))", r"\1, start_role=session.start_role\2", s, count=1, flags=re.S)
        changed = True

    p.write_text(s, encoding="utf-8")
    return changed, "main.py: patched (best-effort)"

def main():
    ch1, m1 = patch_models()
    ch2, m2 = patch_mermaid()
    ch3, m3 = patch_main()
    print(m1)
    print(m2)
    print(m3)
    print("changed:", ch1 or ch2 or ch3)

if __name__ == "__main__":
    main()
