#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import re
from pathlib import Path

MAIN = Path("backend/app/main.py")

def fail(msg: str) -> None:
    raise SystemExit(msg)

def read() -> str:
    if not MAIN.exists():
        fail("FAIL: backend/app/main.py not found")
    return MAIN.read_text(encoding="utf-8")

def write(s: str) -> None:
    MAIN.write_text(s, encoding="utf-8")

def has_delete_routes(s: str) -> tuple[bool, bool]:
    has_proj = re.search(r'@app\.delete\(\s*"/api/projects/\{project_id\}"', s) is not None
    has_sess = re.search(r'@app\.delete\(\s*"/api/sessions/\{session_id\}"', s) is not None
    return has_proj, has_sess

def ensure_helpers(s: str) -> str:
    marker = "# == delete helpers (projects/sessions) =="
    if marker in s:
        return s

    insert_after = None
    for pat in [r"WORKSPACE_DIR\s*=\s*.*\n", r"WORKSPACE\s*=\s*.*\n", r"BASE_DIR\s*=\s*.*\n"]:
        m = re.search(pat, s)
        if m:
            insert_after = m.end()
            break
    if insert_after is None:
        m = re.search(r"^(from __future__.*\n)?(import .*?\n|from .*?\n)+\n", s, re.M)
        insert_after = m.end() if m else 0

    helper = """
# == delete helpers (projects/sessions) ==
def _ws_path(*parts: str) -> Path:
    # workspace is mounted to /app/workspace in docker; on host it is ./workspace
    return Path("workspace").joinpath(*parts)

def _safe_unlink(p: Path) -> bool:
    try:
        if p.exists():
            p.unlink()
            return True
    except Exception:
        return False
    return False

def _iter_session_files() -> list[Path]:
    out: list[Path] = []
    base = _ws_path("sessions")
    if base.exists() and base.is_dir():
        out.extend(sorted(base.glob("*.json")))
    return out

def _delete_session_files(session_id: str) -> int:
    deleted = 0
    p = _ws_path("sessions", str(session_id) + ".json")
    if _safe_unlink(p):
        deleted += 1

    for fp in _iter_session_files():
        if fp.name == str(session_id) + ".json":
            continue
        try:
            txt = fp.read_text(encoding="utf-8")
        except Exception:
            continue
        if ('"id":"%s"' % session_id) not in txt and ('"id": "%s"' % session_id) not in txt:
            continue
        try:
            import json
            d = json.loads(txt)
        except Exception:
            continue
        if isinstance(d, dict) and str(d.get("id")) == str(session_id):
            if _safe_unlink(fp):
                deleted += 1
    return deleted

def _delete_project_files(project_id: str) -> int:
    deleted = 0
    p = _ws_path("projects", str(project_id) + ".json")
    if _safe_unlink(p):
        deleted += 1
    return deleted

def _delete_sessions_by_project(project_id: str) -> list[str]:
    deleted_ids: list[str] = []
    for fp in _iter_session_files():
        try:
            import json
            d = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        if str(d.get("project_id")) != str(project_id):
            continue
        sid = d.get("id")
        if sid is None:
            continue
        sid = str(sid)
        _delete_session_files(sid)
        deleted_ids.append(sid)
    return deleted_ids
""".lstrip("\n")

    return s[:insert_after] + "\n" + helper + "\n" + s[insert_after:]

def insert_endpoints(s: str) -> str:
    block = """
@app.delete("/api/projects/{project_id}")
def delete_project_api(project_id: str):
    deleted_sessions = _delete_sessions_by_project(project_id)
    deleted_projects = _delete_project_files(project_id)
    if deleted_projects == 0:
        return {"ok": False, "error": "project_not_found", "project_id": str(project_id), "deleted_sessions": deleted_sessions}
    return {"ok": True, "project_id": str(project_id), "deleted_sessions": deleted_sessions}

@app.delete("/api/sessions/{session_id}")
def delete_session_api(session_id: str):
    deleted = _delete_session_files(session_id)
    if deleted == 0:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    return {"ok": True, "session_id": str(session_id), "deleted_files": deleted}
""".lstrip("\n")

    has_proj, has_sess = has_delete_routes(s)
    if has_proj and has_sess:
        return s

    # Insert near other session/project handlers if possible; else append at end.
    anchors = [
        r'@app\.(patch|put)\(\s*"/api/sessions/\{session_id\}"[^\n]*\)\s*\n(?:async\s+def|def)\s+\w+\(',
        r'@app\.(patch|put)\(\s*"/api/projects/\{project_id\}"[^\n]*\)\s*\n(?:async\s+def|def)\s+\w+\(',
    ]
    insert_at = None
    for pat in anchors:
        m = re.search(pat, s)
        if m:
            nxt = s.find("\n@app.", m.end())
            insert_at = nxt if nxt != -1 else len(s)
            break
    if insert_at is None:
        insert_at = len(s)

    return s[:insert_at] + "\n" + block + "\n" + s[insert_at:]

def main() -> None:
    s = read()
    if "/api/projects" not in s or "/api/sessions" not in s:
        fail("FAIL: main.py does not look like expected FastAPI file (missing /api/projects or /api/sessions strings)")

    before = s
    s = ensure_helpers(s)
    s = insert_endpoints(s)

    if s != before:
        write(s)
        print("OK: patched backend/app/main.py (helpers + DELETE endpoints)")
    else:
        print("OK: already up-to-date (no changes)")

if __name__ == "__main__":
    main()
