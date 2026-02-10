from pathlib import Path
import re

p = Path("backend/app/static/app.js")
s = p.read_text(encoding="utf-8", errors="replace")

marker = "STEP18C3D_MERMAID_AUTOFIT"
if marker not in s:
    raise SystemExit("marker STEP18C3D_MERMAID_AUTOFIT not found in app.js; apply Step18C-3d first")

# Tune defaults inside the existing block (do not duplicate code)
s2 = s

# pad default -> 96
s2, n1 = re.subn(
    r"(var\s+pad\s*=\s*typeof\s+opts\.pad\s*===\s*'number'\s*\?\s*opts\.pad\s*:\s*)(\d+)(;)",
    r"\g<1>96\3",
    s2,
    count=1
)

# maxScale default -> 0.62
s2, n2 = re.subn(
    r"(var\s+maxScale\s*=\s*typeof\s+opts\.maxScale\s*===\s*'number'\s*\?\s*opts\.maxScale\s*:\s*)([0-9.]+)(;)",
    r"\g<1>0.62\3",
    s2,
    count=1
)

# schedule() call fitMermaid() -> fitMermaid({pad:96,maxScale:0.62})
# we do a conservative replace inside the schedule timer body
s2, n3 = re.subn(
    r"(setTimeout\(function\(\)\{\s*\n\s*try\s*\{\s*)fitMermaid\(\)(\s*;\s*\}\s*catch\(e\)\s*\{\s*\}\s*\n\s*\}\s*,\s*60\s*\)\s*;)",
    r"\g<1>fitMermaid({pad: 96, maxScale: 0.62})\2",
    s2,
    count=1
)

# Add a small note + global override hook (optional) right after defaults, only once
marker2 = "STEP18C3E_TUNED_DEFAULTS"
if marker2 not in s2:
    insert_pat = r"(var\s+maxScale\s*=.*?;\s*\n)"
    m = re.search(insert_pat, s2)
    if m:
        ins = "\n      // " + marker2 + "\n      // You can override at runtime: window.fpcMermaidFitCfg = {pad: 120, maxScale: 0.55}; window.fpcFitMermaid(window.fpcMermaidFitCfg);\n"
        s2 = s2[:m.end()] + ins + s2[m.end():]

if (n1 + n2) == 0:
    raise SystemExit("did not patch defaults (pad/maxScale). The block layout may differ.")

p.write_text(s2, encoding="utf-8")
print("ok: tuned mermaid autofit defaults (pad=96, maxScale=0.62)")
print("replacements:", {"pad": n1, "maxScale": n2, "schedule": n3})
