from pathlib import Path

p = Path("backend/app/static/styles.css")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C3C_MERMAID_SCALE_FIX"
if marker in s:
    print("styles.css already contains marker; nothing to do")
else:
    block = "\n".join([
        "",
        "/* " + marker,
        "   Fix Mermaid becoming overly zoomed-in.",
        "   We keep Process panel full-width, but do NOT force SVG to width:100% (which upscales small diagrams).",
        "   Instead: max-width:100% + width:auto, and enable scrolling/panning inside the diagram viewport.",
        "*/",
        ".layout > .panel:has(#mermaid) #mermaid {",
        "  overflow: auto !important;",
        "}",
        "",
        ".layout > .panel:has(#mermaid) #mermaid svg {",
        "  width: auto !important;",
        "  max-width: 100% !important;",
        "  height: auto !important;",
        "}",
        "",
        "/* Keep the diagram visually centered when it is smaller than the viewport */",
        ".layout > .panel:has(#mermaid) #mermaid {",
        "  display: flex !important;",
        "  justify-content: center !important;",
        "  align-items: flex-start !important;",
        "}",
        "",
    ])
    s = s.rstrip() + "\n" + block + "\n"
    p.write_text(s, encoding="utf-8")
    print("ok: appended STEP18C3C block to styles.css")
