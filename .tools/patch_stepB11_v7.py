#!/usr/bin/env python3
import re
from pathlib import Path

MAIN = Path("backend/app/main.py")

def find_fastapi_instance(src: str) -> str:
    m = re.search(r'(?m)^(\w+)\s*=\s*FastAPI\s*\(', src)
    return m.group(1) if m else "app"

def ensure_fastapi_imports(src: str) -> str:
    # Normalize: from fastapi import FastAPI[, ...]
    m = re.search(r'(?m)^from\s+fastapi\s+import\s+(.+)$', src)
    if not m:
        # Insert after first import block
        lines = src.splitlines()
        ins = 0
        for i,l in enumerate(lines):
            if l.startswith("from ") or l.startswith("import "):
                ins = i+1
            else:
                if i>0 and lines[i-1].startswith(("from ","import ")):
                    break
        lines.insert(ins, "from fastapi import FastAPI, HTTPException, Query")
        return "\n".join(lines) + ("\n" if src.endswith("\n") else "")
    line = m.group(0)
    # If FastAPI already imported, extend; else replace entire import line safely
    if "FastAPI" in line:
        # Build set
        items = [x.strip() for x in m.group(1).split(",")]
        want = ["FastAPI","HTTPException","Query"]
        for w in want:
            if w not in items:
                items.append(w)
        new = "from fastapi import " + ", ".join(items)
        return src[:m.start()] + new + src[m.end():]
    else:
        # Unlikely, but handle
        return src

def replace_function_by_name(src: str, func_name: str, new_block: str) -> str:
    # Find "def func_name(" line
    m = re.search(rf'(?m)^def\s+{re.escape(func_name)}\s*\(', src)
    if not m:
        raise RuntimeError(f"Could not find function {func_name}")
    # Include decorators above
    start = m.start()
    # scan up lines
    lines = src.splitlines(True)
    # map position to line index
    pos = 0
    li = 0
    while li < len(lines) and pos + len(lines[li]) <= start:
        pos += len(lines[li])
        li += 1
    # li is index of def line
    start_li = li
    # include decorators directly above
    j = start_li - 1
    while j >= 0:
        s = lines[j].lstrip()
        if s.startswith("@"):
            start_li = j
            j -= 1
            continue
        if s.strip() == "":
            # allow blank lines between stacked decorators? keep scanning but stop if blank followed by non-decorator
            j -= 1
            continue
        break
    # determine indentation of def line
    def_line = lines[li]
    def_indent = len(def_line) - len(def_line.lstrip(" "))
    # find end of function: next top-level decorator/def with indent <= def_indent
    k = li + 1
    while k < len(lines):
        l = lines[k]
        if l.strip() == "":
            k += 1
            continue
        indent = len(l) - len(l.lstrip(" "))
        if indent <= def_indent and (l.lstrip().startswith("@") or l.lstrip().startswith("def ")):
            break
        k += 1
    end_li = k
    # replace
    before = "".join(lines[:start_li])
    after = "".join(lines[end_li:])
    # Ensure new_block ends with a newline
    if not new_block.endswith("\n"):
        new_block += "\n"
    return before + new_block + after

def main():
    src = MAIN.read_text(encoding="utf-8")
    src = ensure_fastapi_imports(src)
    inst = find_fastapi_instance(src)

    list_block = f'''@{inst}.get("/api/projects/{{project_id}}/sessions")
def list_project_sessions(project_id: str, mode: str | None = None):
    ps = get_project_storage()
    if ps.load(project_id) is None:
        raise HTTPException(status_code=404, detail="project not found")

    st = get_storage()
    out = []
    for item in st.list():
        sess = item
        # allow storage.list() to return ids or dicts defensively
        if isinstance(item, str):
            sess = st.load(item)
        elif isinstance(item, dict):
            try:
                # best-effort parse via pydantic model
                sess = Session.model_validate(item)
            except Exception:
                sess = None
        if sess is None:
            continue

        if getattr(sess, "project_id", None) != project_id:
            continue
        if mode is not None and (getattr(sess, "mode", None) or None) != mode:
            continue
        out.append(_session_api_dump(sess))
    return out
'''

    create_block = f'''@{inst}.post("/api/projects/{{project_id}}/sessions")
def create_project_session(project_id: str, inp: CreateSessionIn, mode: str | None = Query(default=None)):
    ps = get_project_storage()
    if ps.load(project_id) is None:
        raise HTTPException(status_code=404, detail="project not found")

    st = get_storage()
    title = getattr(inp, "title", None) or "process"
    roles = _norm_roles(getattr(inp, "roles", None))
    # prefer storage-native create signature if it supports project_id/mode
    try:
        sid = st.create(title=title, roles=roles, project_id=project_id, mode=mode)
        sess = st.load(sid)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        return _session_api_dump(sess)
    except TypeError:
        # fallback: create base session then attach fields
        sid = st.create(title=title, roles=roles)
        sess = st.load(sid)
        if sess is None:
            raise HTTPException(status_code=500, detail="session not persisted")
        if hasattr(sess, "project_id"):
            sess.project_id = project_id
        if hasattr(sess, "mode"):
            sess.mode = mode
        st.save(sess)
        return _session_api_dump(sess)
'''

    src2 = replace_function_by_name(src, "list_project_sessions", list_block)
    src3 = replace_function_by_name(src2, "create_project_session", create_block)

    MAIN.write_text(src3, encoding="utf-8")
    print("patched:", MAIN)

if __name__ == "__main__":
    main()
