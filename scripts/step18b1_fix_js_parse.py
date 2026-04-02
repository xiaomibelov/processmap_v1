from pathlib import Path

p = Path("backend/app/static/app.js")
s = p.read_text(encoding="utf-8")

old = 'return "flowchart TD\n  A[Нет шагов] --> B[Добавь заметки слева]\n";'
new = 'return `flowchart TD\n  A[Нет шагов] --> B[Добавь заметки слева]\n`;\n'

if old not in s:
    raise SystemExit("pattern not found: expected broken multiline string was not present")

s = s.replace(old, new, 1)
p.write_text(s, encoding="utf-8")
print("ok: patched app.js")
