import re
from pathlib import Path

path = Path("backend/app/main.py")
s = path.read_text(encoding="utf-8")

# Preconditions: we expect FastAPI app exists and sessions/projects routes exist
if "/api/projects" not in s or "/api/sessions" not in s:
    raise SystemExit("FAIL: main.py does not contain /api/projects or /api/sessions routes (unexpected layout)")

# Ensure required imports exist
need_imports = [
    ("import os", "import os"),
    ("from pathlib import Path", "from pathlib import Path"),
]
for needle, line in need_imports:
    if needle not in s:
        # Insert near top after existing imports block (best-effort)
        m = re.search(r"^(from __future__.*\n)?(import .*?\n|from .*?\n)+", s, re.M)
        if m:
            block = m.group(0)
            if line not in block:
                block2 = block + line + "\n"
                s = s.replace(block, block2, 1)

# Helper deletion block (idempotent)
helper_marker = "# == delete helpers (projects/sessions) =="
if helper_marker not in s:
    # Insert after workspace base dir definitions if present; else after imports.
    insert_after = None
    candidates = [
        r"WORKSPACE_DIR\s*=\s*.*\n",
        r"WORKSPACE\s*=\s*.*\n",
        r"BASE_DIR\s*=\s*.*\n",
    ]
    for pat in candidates:
        m = re.search(pat, s)
        if m:
            insert_after = m.end()
            break
    if insert_after is None:
        m = re.search(r"^(from __future__.*\n)?(import .*?\n|from .*?\n)+\n", s, re.M)
        insert_after = m.end() if m else 0

    helper = f"""
{helper_marker}
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
    # canonical location
    out: list[Path] = []
    base = _ws_path("sessions")
    if base.exists() and base.is_dir():
        out.extend(sorted(base.glob("*.json")))
    # some builds may keep sessions under workspace root or other folders; keep this conservative
    return out

def _delete_session_files(session_id: str) -> int:
    deleted = 0
    # canonical file name
    p = _ws_path("sessions", f"{session_id}.json")
    if _safe_unlink(p):
        deleted += 1
    # in case there are other naming patterns, also scan canonical sessions dir for id match
    for fp in _iter_session_files():
        if fp.name == f"{session_id}.json":
            continue
        try:
            txt = fp.read_text(encoding="utf-8")
        except Exception:
            continue
        # cheap check first
        if f'"id":"{session_id}"' not in txt and f'"id": "{session_id}"' not in txt:
            continue
        # parse and validate id
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
    p = _ws_path("projects", f"{project_id}.json")
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

"""
    s = s[:insert_after] + helper + s[insert_after:]

# Add endpoints if not present
delete_project_sig = '"/api/projects/{project_id}"'
delete_session_sig = '"/api/sessions/{session_id}"'

has_delete_project = re.search(r"@app\.delete\(\s*\"/api/projects/\{project_id\}\"", s) is not None
has_delete_session = re.search(r"@app\.delete\(\s*\"/api/sessions/\{session_id\}\"", s) is not None

# Find a good insertion point: after PUT/PATCH project/session routes
proj_anchor = None
m = re.search(r"@app\.(patch|put)\(\s*\"/api/projects/\{project_id\}\"[^\n]*\)\s*\n(?:async\s+def|def)\s+\w+\(", s)
if m:
    # insert after the whole function body of the last project patch/put (best-effort by next decorator)
    after = s.find("\n@app.", m.end())
    proj_anchor = after if after != -1 else len(s)

sess_anchor = None
m2 = re.search(r"@app\.(patch|put)\(\s*\"/api/sessions/\{session_id\}\"[^\n]*\)\s*\n(?:async\s+def|def)\s+\w+\(", s)
if m2:
    after2 = s.find("\n@app.", m2.end())
    sess_anchor = after2 if after2 != -1 else len(s)

if proj_anchor is None or sess_anchor is None:
    # fallback: append near end
    proj_anchor = len(s)
    sess_anchor = len(s)

# We want project delete near project routes; session delete near session routes.
if not has_delete_project:
    block = """
@app.delete("/api/projects/{project_id}", summary="Delete Project", tags=["projects"])
def delete_project(project_id: str):
    # Delete project file + all sessions linked by project_id (best-effort).
    deleted_sessions = _delete_sessions_by_project(project_id)
    deleted_project = _delete_project_files(project_id)

    if deleted_project == 0 and not deleted_sessions:
        raise HTTPException(status_code=404, detail="project not found")

    return {
        "project_id": project_id,
        "deleted_project": bool(deleted_project),
        "deleted_sessions": deleted_sessions,
    }

"""
    s = s[:proj_anchor] + block + s[proj_anchor:]

if not has_delete_session:
    block2 = """
@app.delete("/api/sessions/{session_id}", summary="Delete Session", tags=["sessions"])
def delete_session(session_id: str):
    deleted = _delete_session_files(session_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session_id": session_id, "deleted_files": deleted}

"""
    # sess_anchor may have shifted after project insertion; recompute by searching projects delete insertion
    insert_at = s.find("@app.get(\"/api/settings/llm\"")
    if insert_at == -1:
        insert_at = len(s)
    s = s[:insert_at] + block2 + s[insert_at:]

path.write_text(s, encoding="utf-8")
print("OK: delete endpoints added (or already present)")
