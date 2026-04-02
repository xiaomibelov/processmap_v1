from pathlib import Path

p = Path("backend/app/exporters/mermaid.py")
s = p.read_text(encoding="utf-8", errors="replace")

before = s

repls = [
    ('== \\"lanes\\"', '== "lanes"'),
    ('== \\"roles\\"', '== "roles"'),
    ('mode == \\"lanes\\"', 'mode == "lanes"'),
    ('mode == \\"roles\\"', 'mode == "roles"'),
    ('\\"lanes\\"', '"lanes"'),
    ('\\"roles\\"', '"roles"'),
]

changed = False
for a, b in repls:
    if a in s:
        s = s.replace(a, b)
        changed = True

if not changed:
    raise SystemExit("no patterns matched; mermaid.py did not contain escaped quotes")

p.write_text(s, encoding="utf-8")
print("ok: patched mermaid.py")
