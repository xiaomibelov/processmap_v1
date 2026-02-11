from __future__ import annotations

from pathlib import Path

FUT = "from __future__ import annotations"

def find_docstring_end(lines: list[str], start_i: int) -> int:
    # naive but safe enough: detect module docstring if first statement is ''' or """
    s = lines[start_i].lstrip()
    if not (s.startswith('"""') or s.startswith("'''")):
        return start_i
    q = s[:3]
    # single-line docstring
    if s.count(q) >= 2 and s.strip() != q:
        return start_i + 1
    # multi-line: scan until closing triple quote
    i = start_i + 1
    while i < len(lines):
        if q in lines[i]:
            return i + 1
        i += 1
    return start_i

def main() -> None:
    p = Path("backend/app/main.py")
    if not p.exists():
        raise SystemExit("backend/app/main.py not found")

    raw = p.read_text(encoding="utf-8", errors="replace").splitlines(True)

    # remove all occurrences of FUT (anywhere)
    kept = [ln for ln in raw if ln.strip() != FUT]

    # figure insertion point: after shebang/encoding/comments + optional module docstring
    i = 0
    if i < len(kept) and kept[i].startswith("#!"):
        i += 1
    if i < len(kept) and "coding" in kept[i] and kept[i].lstrip().startswith("#"):
        i += 1

    # allow leading blanks/comments
    while i < len(kept) and (kept[i].strip() == "" or kept[i].lstrip().startswith("#")):
        i += 1

    # module docstring if present
    i = find_docstring_end(kept, i)

    # also skip following blank lines
    while i < len(kept) and kept[i].strip() == "":
        i += 1

    out = kept[:i] + [FUT + "\n\n"] + kept[i:]
    p.write_text("".join(out).rstrip() + "\n", encoding="utf-8")
    print("OK: placed '__future__ import annotations' at module top in backend/app/main.py")

if __name__ == "__main__":
    main()
