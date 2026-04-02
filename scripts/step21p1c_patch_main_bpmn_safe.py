from __future__ import annotations

from pathlib import Path
import re

path = Path("backend/app/main.py")
s = path.read_text(encoding="utf-8", errors="replace")

# 1) ensure __future__ is first import (after optional shebang/encoding)
lines = s.splitlines()
if any("from __future__ import annotations" in ln for ln in lines):
    lines = [ln for ln in lines if "from __future__ import annotations" not in ln]
    insert_at = 0
    if lines and lines[0].startswith("#!"):
        insert_at = 1
    if insert_at < len(lines) and re.match(r"^#.*coding[:=]", lines[insert_at]):
        insert_at += 1
    lines.insert(insert_at, "from __future__ import annotations")
    s = "\n".join(lines) + "\n"

# 2) ensure Response import exists
if "from fastapi.responses import" in s and "Response" not in s:
    s = re.sub(r"from fastapi\.responses import ([^\n]+)", lambda m: m.group(0) + ", Response", s, count=1)
elif "from fastapi.responses import Response" not in s:
    m = re.search(r"^from fastapi\b.*$", s, flags=re.M)
    if m:
        insert_pos = m.end()
        s = s[:insert_pos] + "\nfrom fastapi.responses import Response" + s[insert_pos:]
    else:
        s = "from fastapi.responses import Response\n" + s

# 3) remove any top-level bpmn exporter import to avoid startup crash
s = re.sub(r"^from \.exporters\.bpmn import .*\n", "", s, flags=re.M)

new_block = """@app.get(\"/api/sessions/{session_id}/bpmn\")
def session_bpmn_export(session_id: str):
    st = get_storage()
    s = st.load(session_id)
    if not s:
        return Response(content=\"not found\", media_type=\"text/plain\", status_code=404)

    from .exporters.bpmn import export_session_to_bpmn_xml

    xml = export_session_to_bpmn_xml(s)

    title = getattr(s, \"title\", None) or getattr(s, \"name\", None) or \"process\"
    title = re.sub(r\"[^a-zA-Z0-9_\\-]+\", \"_\", str(title)).strip(\"_\")
    if not title:
        title = \"process\"
    filename = f\"{title}.bpmn\"
    return Response(
        content=xml,
        media_type=\"application/xml\",
        headers={\"Content-Disposition\": f'attachment; filename=\"{filename}\"'},
    )
"""

endpoint_re = re.compile(
    r"@app\.get\(\"/api/sessions/\{session_id\}/bpmn\"\)\n(?:@.*\n)*def\s+[^\n]+:\n(?:\s+.*\n)+",
    re.M,
)

if endpoint_re.search(s):
    s = endpoint_re.sub(new_block + "\n", s, count=1)
else:
    anchor = "def session_get(session_id: str)"
    idx = s.find(anchor)
    if idx != -1:
        after = s.find("\n@app.", idx)
        if after == -1:
            after = len(s)
        s = s[:after] + "\n\n" + new_block + "\n" + s[after:]
    else:
        s = s.rstrip() + "\n\n" + new_block + "\n"

path.write_text(s, encoding="utf-8")
print("OK: patched backend/app/main.py")
