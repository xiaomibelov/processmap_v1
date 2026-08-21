from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Literal, Tuple

import yaml


GlossaryKind = Literal["equipment", "resources", "units"]

_KIND_MAP = {
    "equipment": "equipment",
    "equip": "equipment",
    "eq": "equipment",
    "resource": "resources",
    "resources": "resources",
    "res": "resources",
    "unit": "units",
    "units": "units",
    "u": "units",
}


_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def normalize_kind(kind: str) -> GlossaryKind:
    k = (kind or "").strip().lower()
    k = _KIND_MAP.get(k, k)
    if k not in ("equipment", "resources", "units"):
        raise ValueError("invalid kind")
    return k  # type: ignore[return-value]


def slugify_canon(term: str) -> str:
    t = (term or "").strip().lower()
    out = []
    for ch in t:
        if "a" <= ch <= "z" or "0" <= ch <= "9" or ch == "_":
            out.append(ch)
            continue
        if ch in _CYR:
            out.append(_CYR[ch])
            continue
        if ch in (" ", "-", "—", ".", ",", ":", ";", "/", "\\", "(", ")", "[", "]", "{", "}", "+", "="):
            out.append("_")
            continue
    s = "".join(out)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        s = "term"
    if re.match(r"^\d", s):
        s = "t_" + s
    return s


def load_glossary(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"version": 1, "equipment": [], "resources": [], "units": []}
    obj = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        return {"version": 1, "equipment": [], "resources": [], "units": []}
    obj.setdefault("version", 1)
    obj.setdefault("equipment", [])
    obj.setdefault("resources", [])
    obj.setdefault("units", [])
    return obj


def save_glossary(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(obj, allow_unicode=True, sort_keys=False), encoding="utf-8")


def upsert_term(path: Path, kind: GlossaryKind, term: str, canon: str, title: str) -> Dict[str, Any]:
    term_clean = (term or "").strip()
    if not term_clean:
        raise ValueError("empty term")

    canon_clean = (canon or "").strip()
    if not canon_clean:
        canon_clean = slugify_canon(term_clean)

    title_clean = (title or "").strip() or term_clean

    obj = load_glossary(path)
    items = obj.get(kind) or []
    if not isinstance(items, list):
        items = []
    obj[kind] = items

    found = None
    for it in items:
        if isinstance(it, dict) and (it.get("canon") or "").strip() == canon_clean:
            found = it
            break

    if not found:
        found = {"canon": canon_clean, "title": title_clean, "aliases": []}
        items.append(found)

    if not found.get("title"):
        found["title"] = title_clean

    aliases = found.get("aliases") or []
    if not isinstance(aliases, list):
        aliases = []
    found["aliases"] = aliases

    if term_clean not in aliases:
        aliases.append(term_clean)

    save_glossary(path, obj)
    return {"ok": True, "kind": kind, "canon": canon_clean, "title": title_clean, "term": term_clean}
