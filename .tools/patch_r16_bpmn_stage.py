from pathlib import Path

p = Path("frontend/src/components/process/BpmnStage.jsx")
if not p.exists():
    raise SystemExit("BpmnStage.jsx not found at frontend/src/components/process/BpmnStage.jsx")

s = p.read_text(encoding="utf-8")

old = '<div ref={hostRef} style={{ height: "100%", background: "transparent" }} />'
new = '<div ref={hostRef} className="bpmnHost" style={{ height: "100%" }} />'

if old in s:
    s = s.replace(old, new)
else:
    s2 = s
    s2 = s2.replace('ref={hostRef} style={{ height: "100%", background: "transparent" }}',
                    'ref={hostRef} className="bpmnHost" style={{ height: "100%" }}')
    if s2 == s:
        s2 = s2.replace('ref={hostRef}', 'ref={hostRef} className="bpmnHost"', 1)
    s = s2

p.write_text(s, encoding="utf-8")
print("patched:", p)
