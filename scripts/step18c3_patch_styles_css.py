from pathlib import Path

p = Path("backend/app/static/styles.css")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C3_PROCESS_FULLWIDTH"
if marker in s:
    print("styles.css already contains marker; nothing to do")
else:
    block = "\n".join([
        "",
        "/* " + marker,
        "   Put Process (Mermaid) on top, full width.",
        "   Move everything else to bottom row.",
        "   Uses :has() to bind panels by content (Chrome OK).",
        "*/",
        ".layout {",
        "  grid-template-columns: 1.65fr 1.00fr;",
        "  grid-template-rows: minmax(580px, 1fr) auto;",
        "  grid-template-areas: \"process process\" \"notes tools\";",
        "  align-items: stretch;",
        "}",
        "",
        ".layout > .panel:has(#mermaid) {",
        "  grid-area: process;",
        "  min-height: 580px;",
        "}",
        ".layout > .panel:has(textarea#notes) {",
        "  grid-area: notes;",
        "  min-height: 0;",
        "}",
        ".layout > .panel:not(:has(#mermaid)):not(:has(textarea#notes)) {",
        "  grid-area: tools;",
        "  min-height: 0;",
        "}",
        "",
        ".layout > .panel:has(#mermaid) #mermaid {",
        "  width: 100%;",
        "  min-height: 520px;",
        "}",
        "",
        ".layout > .panel:has(textarea#notes) textarea#notes {",
        "  flex: none;",
        "  height: 160px;",
        "  min-height: 160px;",
        "  max-height: 220px;",
        "}",
        "",
        "@media (max-width: 1200px) {",
        "  .layout {",
        "    grid-template-columns: 1fr;",
        "    grid-template-rows: auto;",
        "    grid-template-areas: \"process\" \"notes\" \"tools\";",
        "  }",
        "  .layout > .panel:has(#mermaid) { min-height: 520px; }",
        "}",
        "",
    ])
    s = s.rstrip() + "\n" + block + "\n"
    p.write_text(s, encoding="utf-8")
    print("ok: appended STEP18C3 block to styles.css")
