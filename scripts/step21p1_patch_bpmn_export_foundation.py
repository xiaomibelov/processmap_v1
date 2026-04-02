from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "backend/app/main.py"
MODELS = ROOT / "backend/app/models.py"


def patch_models() -> None:
    if not MODELS.exists():
        return
    s = MODELS.read_text(encoding="utf-8")

    m = re.search(r"(?ms)^class Session\\b.*?:\\n(.*?)(?=^class \\w|\\Z)", s)
    if not m:
        print("models.py: Session class not found (skip)")
        return

    block = s[m.start():m.end()]

    # normalize any broken/escaped bpmn_xml line within Session block
    def _fix_line(match: re.Match) -> str:
        return "    bpmn_xml: str = \"\""

    block2 = re.sub(r"(?m)^\\s*bpmn_xml:\\s*str\\s*=.*$", _fix_line, block)

    if "bpmn_xml:" not in block2:
        # insert after mermaid if present, else after session_id
        if re.search(r"(?m)^\\s*mermaid:\\s*str\\s*=", block2):
            block2 = re.sub(
                r"(?m)^(\\s*mermaid:\\s*str\\s*=\\s*\\\"\\\"\\s*)$",
                r"\\1\\n    bpmn_xml: str = \"\"",
                block2,
                count=1,
            )
        elif re.search(r"(?m)^\\s*session_id:\\s*str\\s*=", block2):
            block2 = re.sub(
                r"(?m)^(\\s*session_id:\\s*str\\s*=\\s*\\\"\\\"\\s*)$",
                r"\\1\\n    bpmn_xml: str = \"\"",
                block2,
                count=1,
            )

    s2 = s[:m.start()] + block2 + s[m.end():]
    if s2 != s:
        MODELS.write_text(s2, encoding="utf-8")
        print("models.py: patched Session.bpmn_xml")
    else:
        print("models.py: no changes")


def patch_main() -> None:
    p = MAIN
    if not p.exists():
        raise SystemExit("main.py not found")

    s = p.read_text(encoding="utf-8")
    changed = False

    imp = "from .exporters.bpmn import render_bpmn_xml"
    if imp not in s:
        # place after mermaid exporter import if possible
        s2 = re.sub(
            r"(?m)^(from \\.exporters\\.mermaid import render_mermaid.*)$",
            r"\\1\n" + imp,
            s,
            count=1,
        )
        if s2 == s:
            s2 = imp + "\n" + s
        s = s2
        changed = True
        print("main.py: added bpmn exporter import")

    # add endpoint /api/sessions/{session_id}/bpmn
    if "/api/sessions/{session_id}/bpmn" not in s:
        insert_before = '@app.post("/api/sessions/{session_id}/export")'
        if insert_before in s:
            endpoint = (
                '\n\n@app.get("/api/sessions/{session_id}/bpmn")\n'
                "def api_get_bpmn(session_id: str):\n"
                "    s = get_session(session_id)\n"
                "    xml = render_bpmn_xml(s)\n"
                '    return Response(content=xml, media_type="application/xml")\n'
            )
            s = s.replace(insert_before, endpoint + "\n" + insert_before, 1)
            changed = True
            print("main.py: added /bpmn endpoint")
        else:
            print("main.py: WARNING: cannot find export endpoint anchor, skip /bpmn endpoint")

    # add process.bpmn to export
    if 'process.bpmn' not in s:
        pat = r'(?m)^(\\s*\\(out_dir / \"process\\.mmd\"\\)\\.write_text\\(.*\\)\\s*)$'
        m = re.search(pat, s)
        if m:
            add = '\n    (out_dir / "process.bpmn").write_text(render_bpmn_xml(s), encoding="utf-8")'
            s = s[:m.end()] + add + s[m.end():]
            changed = True
            print("main.py: added process.bpmn to export")
        else:
            print("main.py: WARNING: cannot find process.mmd write_text, skip adding process.bpmn")

    if changed:
        p.write_text(s, encoding="utf-8")
    else:
        print("main.py: no changes")


def main() -> None:
    patch_models()
    patch_main()


if __name__ == "__main__":
    main()
