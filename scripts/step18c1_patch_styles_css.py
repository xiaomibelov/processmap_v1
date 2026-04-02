from pathlib import Path
import re

p = Path("backend/app/static/styles.css")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C1_DIAGRAM_FIRST"
target_cols = "minmax(280px, 0.80fr) 2.20fr minmax(320px, 0.90fr)"

pat = re.compile(r"(\.layout\s*\{.*?grid-template-columns\s*:\s*)([^;]+)(;)", re.S)
m = pat.search(s)
if m:
    s = pat.sub(r"\1" + target_cols + r"\3", s, count=1)

if marker not in s:
    override_lines = [
        "",
        "/* " + marker,
        "   Make Mermaid panel dominant; shrink notes input.",
        "*/",
        ".layout { grid-template-columns: " + target_cols + "; }",
        "",
        ".layout > .panel:first-child textarea#notes {",
        "  flex: none;",
        "  height: 220px;",
        "  min-height: 220px;",
        "}",
        "",
        ".layout > .panel:first-child .hint {",
        "  font-size: 12px;",
        "  opacity: .85;",
        "}",
        "",
        "@media (max-width: 1200px) {",
        "  .layout { grid-template-columns: 1fr; }",
        "  .panel { min-height: auto; }",
        "}",
        "",
    ]
    s = s.rstrip() + "\n" + "\n".join(override_lines)

p.write_text(s, encoding="utf-8")
print("ok: patched styles.css")
