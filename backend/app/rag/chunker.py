import json
import re

MAX_CHARS = 1500
OVERLAP_CHARS = 200

_BPMN_ELEMENT_RE = re.compile(
    r"(<(?:bpmn:|semantic:)?(?:task|userTask|serviceTask|manualTask|sendTask|receiveTask|"
    r"scriptTask|businessRuleTask|callActivity|subProcess|transaction|adHocSubProcess|"
    r"sequenceFlow|messageFlow|dataInputAssociation|dataOutputAssociation|"
    r"startEvent|endEvent|intermediateCatchEvent|intermediateThrowEvent|boundaryEvent|"
    r"exclusiveGateway|inclusiveGateway|parallelGateway|eventBasedGateway|complexGateway|"
    r"lane|laneSet|participant|collaboration|process|dataObject|dataStore|"
    r"flowElement|flowNode)[^>]*(?:/>|>.*?</[^>]+>))",
    re.DOTALL | re.IGNORECASE,
)


def _approx_tokens(text: str) -> int:
    return len(text.split())


def _split_by_max_chars(text: str, max_chars: int = MAX_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start = end - overlap
        if start >= len(text):
            break
    return [c for c in chunks if c.strip()]


def chunk_bpmn_xml(xml: str, metadata: dict | None = None) -> list[dict]:
    metadata = metadata or {}
    chunks = []

    matches = list(_BPMN_ELEMENT_RE.finditer(xml))
    if matches:
        for i, m in enumerate(matches):
            element_text = m.group(0).strip()
            if not element_text:
                continue
            tag_match = re.match(r"<(?:bpmn:|semantic:)?(\w+)", element_text)
            tag = tag_match.group(1) if tag_match else "element"
            chunk_meta = {**metadata, "element_tag": tag, "element_index": i}
            for j, part in enumerate(_split_by_max_chars(element_text)):
                if not part.strip():
                    continue
                chunks.append({
                    "chunk_index": len(chunks),
                    "chunk_text": part,
                    "token_count": _approx_tokens(part),
                    "metadata_json": json.dumps({**chunk_meta, "part": j}),
                })
    else:
        for part in _split_by_max_chars(xml):
            if not part.strip():
                continue
            chunks.append({
                "chunk_index": len(chunks),
                "chunk_text": part,
                "token_count": _approx_tokens(part),
                "metadata_json": json.dumps({**metadata, "fallback": True}),
            })

    return chunks


def chunk_product_actions(actions: list[dict], metadata: dict | None = None) -> list[dict]:
    metadata = metadata or {}
    chunks = []
    for i, action in enumerate(actions):
        parts = []
        for field in ("action_type", "product_name", "product_group", "stage", "step", "method", "role"):
            val = action.get(field)
            if val:
                parts.append(f"{field}: {val}")
        chunk_text = " | ".join(parts) if parts else json.dumps(action, ensure_ascii=False)
        if not chunk_text.strip():
            continue
        chunk_meta = {
            **metadata,
            "step_id": action.get("step_id", ""),
            "action_type": action.get("action_type", ""),
            "product_name": action.get("product_name", ""),
            "action_index": i,
        }
        chunks.append({
            "chunk_index": len(chunks),
            "chunk_text": chunk_text,
            "token_count": _approx_tokens(chunk_text),
            "metadata_json": json.dumps(chunk_meta),
        })
    return chunks


def chunk_text(text: str, metadata: dict | None = None) -> list[dict]:
    metadata = metadata or {}
    paragraphs = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()] if text.strip() else []

    chunks = []
    for para in paragraphs:
        for part in _split_by_max_chars(para):
            if not part.strip():
                continue
            chunks.append({
                "chunk_index": len(chunks),
                "chunk_text": part,
                "token_count": _approx_tokens(part),
                "metadata_json": json.dumps(metadata),
            })
    return chunks
