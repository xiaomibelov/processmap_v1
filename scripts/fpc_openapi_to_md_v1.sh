#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 1) Locate OpenAPI JSON
OPENAPI_PATH="${OPENAPI_PATH:-}"

if [ -z "${OPENAPI_PATH}" ]; then
  # Try latest from your convention
  LAST="$(ls -1dt "$HOME"/fpc_api_routes_*/openapi.json 2>/dev/null | head -n1 || true)"
  if [ -n "${LAST}" ]; then
    OPENAPI_PATH="${LAST}"
  fi
fi

# fallback locations (if you keep openapi.json in repo somewhere)
if [ -z "${OPENAPI_PATH}" ]; then
  for p in \
    "./openapi.json" \
    "./backend/openapi.json" \
    "./artifacts/openapi.json" \
    ; do
    if [ -f "$p" ]; then OPENAPI_PATH="$p"; break; fi
  done
fi

if [ -z "${OPENAPI_PATH}" ] || [ ! -f "${OPENAPI_PATH}" ]; then
  echo "FAIL: OPENAPI_PATH not found."
  echo "Set it explicitly, e.g.:"
  echo "  OPENAPI_PATH=\"$HOME/fpc_api_routes_2026-02-13_150733/openapi.json\" $0"
  exit 2
fi

OUT_DIR="${OUT_DIR:-$HOME/fpc_api_reference_$(date +%F_%H%M%S)}"
mkdir -p "$OUT_DIR"

echo "OPENAPI_PATH=$OPENAPI_PATH"
echo "OUT_DIR=$OUT_DIR"

# 2) Write generator python (no heredoc)
PY="$OUT_DIR/_gen_openapi_reference.py"
cat > "$PY" <<'PY'
import json, sys, os
from typing import Any, Dict, List, Tuple, Optional

OPENAPI_PATH = sys.argv[1]
OUT_MD = sys.argv[2]

def jload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def resolve_ref(doc: Dict[str, Any], ref: str) -> Any:
    # supports only local refs: "#/components/schemas/X"
    if not ref.startswith("#/"):
        return {"$ref": ref}
    cur: Any = doc
    for part in ref[2:].split("/"):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return {"$ref": ref}
    return cur

def type_str(s: Dict[str, Any]) -> str:
    if not isinstance(s, dict):
        return "unknown"
    if "$ref" in s:
        return f"ref({s['$ref'].split('/')[-1]})"
    if "oneOf" in s:
        return "oneOf(" + ", ".join(type_str(x) for x in s.get("oneOf", [])[:4]) + ("…" if len(s.get("oneOf", []))>4 else "") + ")"
    if "anyOf" in s:
        return "anyOf(" + ", ".join(type_str(x) for x in s.get("anyOf", [])[:4]) + ("…" if len(s.get("anyOf", []))>4 else "") + ")"
    if "allOf" in s:
        return "allOf(" + ", ".join(type_str(x) for x in s.get("allOf", [])[:4]) + ("…" if len(s.get("allOf", []))>4 else "") + ")"
    t = s.get("type")
    if t == "array":
        it = s.get("items", {})
        return f"array[{type_str(it)}]"
    if t:
        fmt = s.get("format")
        return f"{t}({fmt})" if fmt else str(t)
    # sometimes schema is implicit object
    if "properties" in s:
        return "object"
    return "unknown"

def merge_allOf(doc: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    if "allOf" not in schema:
        return schema
    out: Dict[str, Any] = {}
    req: List[str] = []
    props: Dict[str, Any] = {}
    for part in schema.get("allOf", []):
        if isinstance(part, dict) and "$ref" in part:
            part = resolve_ref(doc, part["$ref"])
        if not isinstance(part, dict):
            continue
        part = merge_allOf(doc, part)
        req.extend(part.get("required", []) or [])
        props.update(part.get("properties", {}) or {})
        # keep title/description if present
        for k in ("title", "description", "type"):
            if k in part and k not in out:
                out[k] = part[k]
    out["type"] = out.get("type") or "object"
    if props:
        out["properties"] = props
    if req:
        out["required"] = sorted(list(set(req)))
    return out

def schema_brief(doc: Dict[str, Any], schema: Any, depth: int = 0) -> Tuple[str, List[str]]:
    """
    Returns: (headline, lines)
    headline: a short type string
    lines: bullet lines for top-level fields
    """
    if not isinstance(schema, dict):
        return ("unknown", [])
    if "$ref" in schema:
        resolved = resolve_ref(doc, schema["$ref"])
        name = schema["$ref"].split("/")[-1]
        if isinstance(resolved, dict):
            resolved = merge_allOf(doc, resolved)
        head, lines = schema_brief(doc, resolved, depth=depth)
        # prefer showing ref name in headline
        return (f"{name}: {head}", lines)

    schema = merge_allOf(doc, schema)

    head = type_str(schema)
    lines: List[str] = []

    # object properties (top-level only)
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    if isinstance(props, dict) and props:
        for k in sorted(props.keys()):
            v = props[k]
            if isinstance(v, dict) and "$ref" in v:
                vtype = f"ref({v['$ref'].split('/')[-1]})"
            else:
                vtype = type_str(v if isinstance(v, dict) else {})
            req = " required" if k in required else ""
            desc = ""
            if isinstance(v, dict) and v.get("description"):
                d = str(v["description"]).strip().replace("\n", " ")
                if len(d) > 140:
                    d = d[:137] + "..."
                desc = f" — {d}"
            lines.append(f"- `{k}`: `{vtype}`{req}{desc}")

    # array items brief
    if schema.get("type") == "array":
        it = schema.get("items", {})
        it_head = type_str(it if isinstance(it, dict) else {})
        if isinstance(it, dict) and "$ref" in it:
            it_head = f"ref({it['$ref'].split('/')[-1]})"
        lines.append(f"- items: `{it_head}`")

    return (head, lines)

def pick_json_schema(doc: Dict[str, Any], content: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # prefer application/json
    if not isinstance(content, dict):
        return None
    if "application/json" in content and isinstance(content["application/json"], dict):
        return content["application/json"].get("schema")
    # else take first schema present
    for _, v in content.items():
        if isinstance(v, dict) and "schema" in v and isinstance(v["schema"], dict):
            return v["schema"]
    return None

def md(s: str) -> str:
    return s.replace("\r", "").strip()

doc = jload(OPENAPI_PATH)

paths = doc.get("paths") or {}
title = (doc.get("info") or {}).get("title") or "API Reference"
version = (doc.get("info") or {}).get("version") or ""

out: List[str] = []
out.append(f"# {title}")
if version:
    out.append(f"_OpenAPI version: `{version}`_")
out.append("")
out.append(f"_Source: `{OPENAPI_PATH}`_")
out.append("")

# sort paths for stable output
def method_order(m: str) -> int:
    return {"get":1,"post":2,"put":3,"patch":4,"delete":5}.get(m.lower(), 99)

for path in sorted(paths.keys()):
    item = paths[path]
    if not isinstance(item, dict):
        continue

    for method in sorted(item.keys(), key=method_order):
        op = item.get(method)
        if method.lower() not in ("get","post","put","patch","delete","options","head"):
            continue
        if not isinstance(op, dict):
            continue

        summary = op.get("summary") or op.get("operationId") or ""
        out.append(f"## {method.upper()} `{path}`")
        if summary:
            out.append(md(summary))
        out.append("")

        # Request
        rb = op.get("requestBody")
        if isinstance(rb, dict):
            content = rb.get("content") or {}
            schema = pick_json_schema(doc, content) or None
            if schema:
                head, lines = schema_brief(doc, schema)
                out.append("### Request body")
                out.append(f"Schema: `{head}`")
                if lines:
                    out.extend(lines)
                else:
                    out.append("- (no top-level fields detected)")
                out.append("")
            else:
                out.append("### Request body")
                out.append("- (requestBody present, but schema not found)")
                out.append("")
        else:
            out.append("### Request body")
            out.append("- none")
            out.append("")

        # Responses
        out.append("### Responses")
        responses = op.get("responses") or {}
        if isinstance(responses, dict) and responses:
            # show common responses first
            def resp_key_order(k: str) -> Tuple[int, str]:
                try:
                    return (0, f"{int(k):03d}")
                except:
                    return (1, k)
            for code in sorted(responses.keys(), key=resp_key_order):
                resp = responses[code]
                if not isinstance(resp, dict):
                    continue
                desc = md(resp.get("description") or "")
                content = resp.get("content") or {}
                schema = pick_json_schema(doc, content) if isinstance(content, dict) else None
                if schema:
                    head, lines = schema_brief(doc, schema)
                    out.append(f"- **{code}** — {desc if desc else 'OK'}; schema: `{head}`")
                    # keep it short: max 12 fields
                    if lines:
                        for ln in lines[:12]:
                            out.append(f"  {ln}")
                        if len(lines) > 12:
                            out.append("  - …")
                else:
                    # no schema
                    out.append(f"- **{code}** — {desc if desc else 'OK'}; schema: `none`")
            out.append("")
        else:
            out.append("- (no responses in spec)")
            out.append("")

with open(OUT_MD, "w", encoding="utf-8") as f:
    f.write("\n".join(out).rstrip() + "\n")

print(f"OK: wrote {OUT_MD}")
PY

OUT_MD="$OUT_DIR/api_reference.md"
python3 "$PY" "$OPENAPI_PATH" "$OUT_MD"

echo
echo "== result =="
echo "$OUT_MD"
echo
echo "== preview (first 120 lines) =="
sed -n '1,120p' "$OUT_MD" || true
