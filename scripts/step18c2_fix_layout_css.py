from pathlib import Path
import re

p = Path("backend/app/static/styles.css")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C2_WORKSPACE_GRID"

new_block = "\n".join([
    "",
    "/* " + marker,
    "   Workspace-first layout (fixed mapping):",
    "   DOM order is: 1) Process (Mermaid), 2) Tools, 3) Notes.",
    "   Desired layout:",
    "     - Process dominates (left)",
    "     - Tools on the right (narrow column)",
    "     - Notes as compact bottom composer under Process",
    "*/",
    ".layout {",
    "  grid-template-columns: 2.85fr minmax(360px, 0.90fr);",
    "  grid-template-rows: minmax(520px, 1fr) auto;",
    "  grid-template-areas: \"process tools\" \"notes tools\";",
    "  align-items: stretch;",
    "}",
    "",
    "/* Process panel (1st) */",
    ".layout > .panel:nth-child(1) { grid-area: process; min-height: 520px; }",
    "",
    "/* Tools panel (2nd) */",
    ".layout > .panel:nth-child(2) { grid-area: tools; min-height: 520px; }",
    "",
    "/* Notes panel (3rd) becomes composer */",
    ".layout > .panel:nth-child(3) { grid-area: notes; min-height: 0; }",
    ".layout > .panel:nth-child(3) textarea#notes {",
    "  flex: none;",
    "  height: 150px;",
    "  min-height: 150px;",
    "  max-height: 190px;",
    "}",
    ".layout > .panel:nth-child(3) .hint { font-size: 12px; opacity: .85; }",
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
    "    min-height: auto;",
    "  }",
    "  .layout > .panel:nth-child(3) textarea#notes { height: 180px; min-height: 180px; }",
    "}",
    "",
])

if marker not in s:
    raise SystemExit("marker STEP18C2_WORKSPACE_GRID not found in styles.css; apply Step18C-2 first")

# replace from marker comment to end of file (or next STEP marker)
start = s.find("/* " + marker)
if start == -1:
    raise SystemExit("marker comment not found")

# find next marker after start
m = re.search(r"^/\*\s+STEP\d+", s[start+1:], re.M)
if m:
    end = start + 1 + m.start()
else:
    end = len(s)

s2 = s[:start].rstrip() + new_block + "\n" + s[end:].lstrip()
p.write_text(s2, encoding="utf-8")
print("ok: replaced STEP18C2_WORKSPACE_GRID block")
