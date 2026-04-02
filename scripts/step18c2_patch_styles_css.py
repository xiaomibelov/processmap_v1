from pathlib import Path

p = Path("backend/app/static/styles.css")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C2_WORKSPACE_GRID"
if marker in s:
    print("styles.css already contains marker; nothing to do")
else:
    block = "\n".join([
        "",
        "/* " + marker,
        "   Workspace-first layout:",
        "   - Mermaid (process) dominates",
        "   - Notes panel becomes a compact bottom composer",
        "   - Right tools stay visible in a fixed column",
        "*/",
        ".layout {",
        "  grid-template-columns: 2.35fr minmax(360px, 0.95fr);",
        "  grid-template-rows: minmax(460px, 1fr) auto;",
        "  grid-template-areas: \"process tools\" \"notes tools\";",
        "  align-items: stretch;",
        "}",
        "",
        ".layout > .panel:nth-child(1) { grid-area: notes; }",
        ".layout > .panel:nth-child(2) { grid-area: process; }",
        ".layout > .panel:nth-child(3) { grid-area: tools; }",
        "",
        "/* Notes panel becomes composer-like */",
        ".layout > .panel:nth-child(1) {",
        "  min-height: 0;",
        "}",
        ".layout > .panel:nth-child(1) textarea#notes {",
        "  flex: none;",
        "  height: 150px;",
        "  min-height: 150px;",
        "  max-height: 190px;",
        "}",
        ".layout > .panel:nth-child(1) .hint {",
        "  font-size: 12px;",
        "  opacity: .85;",
        "}",
        "",
        "/* Keep Mermaid panel roomy */",
        ".layout > .panel:nth-child(2) {",
        "  min-height: 460px;",
        "}",
        "",
        "@media (max-width: 1200px) {",
        "  .layout {",
        "    grid-template-columns: 1fr;",
        "    grid-template-rows: auto;",
        "    grid-template-areas: none;",
        "  }",
        "  .layout > .panel:nth-child(1),",
        "  .layout > .panel:nth-child(2),",
        "  .layout > .panel:nth-child(3) {",
        "    grid-area: auto;",
        "  }",
        "  .layout > .panel:nth-child(1) textarea#notes {",
        "    height: 180px;",
        "    min-height: 180px;",
        "  }",
        "}",
        "",
    ])
    s = s.rstrip() + "\n" + block + "\n"
    p.write_text(s, encoding="utf-8")
    print("ok: patched styles.css")
