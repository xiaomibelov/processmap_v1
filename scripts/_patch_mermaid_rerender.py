from __future__ import annotations

import re
from pathlib import Path

p = Path("backend/app/static/app.js")
s = p.read_text(encoding="utf-8")

orig = s

def ensure_placeholder_in_mermaid_code_for_session(src: str) -> str:
    if 'if (!s.nodes || !s.nodes.length)' in src:
        return src
    pat = re.compile(r'(function\s+mermaidCodeForSession\s*\(\s*s\s*\)\s*\{\s*\n\s*const\s+v\s*=\s*getView\(\)\s*;\s*\n)', re.M)
    m = pat.search(src)
    if not m:
        raise RuntimeError("pattern not found: mermaidCodeForSession header")
    insert = m.group(1) + '  if (!s || !s.nodes || !s.nodes.length) return "flowchart TD\\n  A[Нет шагов] --> B[Добавь заметки слева]\\n";\n'
    return src[:m.start(1)] + insert + src[m.end(1):]

def ensure_remove_data_processed(src: str) -> str:
    if 'm.removeAttribute("data-processed")' in src or "m.removeAttribute('data-processed')" in src:
        return src
    pat = re.compile(r'(function\s+renderMermaid\s*\(\s*code\s*\)\s*\{\s*\n\s*const\s+m\s*=\s*el\("mermaid"\)\s*;\s*\n)', re.M)
    m = pat.search(src)
    if not m:
        raise RuntimeError("pattern not found: renderMermaid header")
    insert = m.group(1) + '  m.removeAttribute("data-processed");\n'
    return src[:m.start(1)] + insert + src[m.end(1):]

def ensure_run_on_node_and_catch(src: str) -> str:
    if "mermaid.run({ nodes: [m] })" in src or "mermaid.run({nodes:[m]})" in src:
        return src

    src2 = src.replace('mermaid.run({ querySelector: ".mermaid" });', 'try { mermaid.run({ nodes: [m] }); } catch (e) { console.error(e); }')
    if src2 != src:
        return src2

    pat = re.compile(r'\n\s*mermaid\.run\s*\(\s*\{\s*querySelector\s*:\s*["\']\.mermaid["\']\s*\}\s*\)\s*;\s*', re.M)
    if pat.search(src):
        return pat.sub('\n  try { mermaid.run({ nodes: [m] }); } catch (e) { console.error(e); }\n', src, count=1)

    raise RuntimeError("pattern not found: mermaid.run querySelector")

s = ensure_placeholder_in_mermaid_code_for_session(s)
s = ensure_remove_data_processed(s)
s = ensure_run_on_node_and_catch(s)

if s == orig:
    print("no changes")
else:
    p.write_text(s, encoding="utf-8")
    print("patched", p)
