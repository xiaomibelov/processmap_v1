import json
import re

MAX_CHARS = 1500
OVERLAP_CHARS = 200

_BPMN_TYPE_RU = {
    "Task": "задача",
    "SubProcess": "подпроцесс",
    "Process": "процесс",
}

_BPMN_TYPE_FORMS = {
    "Task": ["задача", "задачи"],
    "SubProcess": ["подпроцесс", "подпроцессы"],
    "Process": ["процесс", "процессы"],
}

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


def _extract_bpmn_element_attrs(element_text: str, tag: str) -> dict:
    def _attr(name: str):
        m = re.search(rf'\b{re.escape(name)}=["\']([^"\']*)["\']', element_text)
        if not m:
            return None
        val = m.group(1).strip()
        return val if val else None

    result = {
        "element_id": _attr("id"),
        "element_name": _attr("name"),
        "element_type": tag,
    }
    sr = _attr("sourceRef")
    tr = _attr("targetRef")
    if sr is not None:
        result["source_ref"] = sr
    if tr is not None:
        result["target_ref"] = tr
    return result


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
            attrs = _extract_bpmn_element_attrs(element_text, tag)
            chunk_meta = {
                **metadata,
                "element_tag": tag,
                "element_index": i,
                "element_id": attrs.get("element_id"),
                "element_name": attrs.get("element_name"),
                "element_type": attrs.get("element_type"),
            }
            if "source_ref" in attrs:
                chunk_meta["source_ref"] = attrs["source_ref"]
            if "target_ref" in attrs:
                chunk_meta["target_ref"] = attrs["target_ref"]
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
        for field in (
            "action_type",
            "product_name",
            "product_group",
            "action_stage",
            "stage",
            "step_label",
            "step",
            "action_method",
            "method",
            "action_object",
            "action_object_category",
            "role",
        ):
            val = action.get(field)
            if val:
                parts.append(f"{field}: {val}")
        chunk_text = " | ".join(parts) if parts else json.dumps(action, ensure_ascii=False)
        if not chunk_text.strip():
            continue
        chunk_meta = {
            **metadata,
            "action_id": action.get("id", metadata.get("action_id", "")),
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


def _join_nonempty(parts: list[str], sep: str = "\n") -> str:
    return sep.join(p for p in parts if p)


def chunk_property_dictionary(rows: list[dict], metadata: dict | None = None) -> list[dict]:
    """Chunk process/org property dictionary metadata into one chunk per property."""
    metadata = metadata or {}
    chunks = []
    for i, row in enumerate(rows):
        row = dict(row) if row else {}
        is_org = bool(row.get("operation_key") or row.get("property_key"))
        lines = []
        if is_org:
            lines.append(f"Свойство операции {row.get('operation_key', '')}: {row.get('property_label', '')} ({row.get('property_key', '')})")
            if row.get("input_mode"):
                lines.append(f"Режим ввода: {row['input_mode']}")
            lines.append(f"Обязательное: {bool(row.get('required'))}")
            lines.append(f"Пользовательское значение разрешено: {bool(row.get('allow_custom_value'))}")
            options = row.get("options") or []
            if options:
                option_values = [str(o.get("option_value") if isinstance(o, dict) else o) for o in options]
                lines.append(f"Допустимые значения: {', '.join(option_values)}")
            chunk_meta = {
                **metadata,
                "source_type": "property_dictionary",
                "source_id": str(row.get("operation_key") or metadata.get("source_id") or "org"),
                "property_key": str(row.get("property_key") or ""),
                "input_mode": str(row.get("input_mode") or ""),
            }
        else:
            lines.append(f"Свойство: {row.get('display_name', '')} ({row.get('id', '')})")
            if row.get("property_type"):
                lines.append(f"Тип: {row['property_type']}")
            applicable_to = row.get("applicable_to")
            if applicable_to:
                ru_names = [_BPMN_TYPE_RU.get(str(x), str(x)) for x in applicable_to]
                lines.append(
                    f"Применимо к: {', '.join(str(x) for x in applicable_to)} "
                    f"({', '.join(ru_names)})"
                )
                forms = [
                    form
                    for x in applicable_to
                    for form in _BPMN_TYPE_FORMS.get(str(x), [str(x)])
                ]
                lines.append(f"Для элементов: {', '.join(forms)}")
            if row.get("category"):
                lines.append(f"Категория: {row['category']}")
            lines.append(f"Редактируемое: {bool(row.get('editable'))}")
            if row.get("inheritance"):
                lines.append(f"Наследование: {row['inheritance']}")
            value_range = row.get("value_range")
            if value_range:
                lines.append(f"Допустимые значения: {json.dumps(value_range, ensure_ascii=False)}")
            validation_rules = row.get("validation_rules")
            if validation_rules:
                lines.append(f"Правила валидации: {json.dumps(validation_rules, ensure_ascii=False)}")
            if row.get("default_value") is not None:
                lines.append(f"Значение по умолчанию: {row['default_value']}")
            visible_in = row.get("visible_in")
            if visible_in:
                lines.append(f"Где отображается: {', '.join(str(x) for x in visible_in)}")
            chunk_meta = {
                **metadata,
                "source_type": "property_dictionary",
                "source_id": str(row.get("source") or metadata.get("source_id") or "system"),
                "property_key": str(row.get("id") or ""),
                "property_type": str(row.get("property_type") or ""),
                "category": str(row.get("category") or ""),
            }
        chunk_text = _join_nonempty(lines)
        if not chunk_text.strip():
            continue
        chunks.append({
            "chunk_index": len(chunks),
            "chunk_text": chunk_text,
            "token_count": _approx_tokens(chunk_text),
            "metadata_json": json.dumps({**chunk_meta, "property_index": i}),
        })
    return chunks


def chunk_operation_catalog(operations: list[dict], metadata: dict | None = None) -> list[dict]:
    """Chunk operation catalog entries into one chunk per operation."""
    metadata = metadata or {}
    chunks = []
    for i, op in enumerate(operations):
        op = dict(op) if op else {}
        lines = []
        lines.append(f"Операция: {op.get('name', '')} ({op.get('code', '')})")
        if op.get("name_ru"):
            lines.append(f"Русское название: {op['name_ru']}")
        if op.get("category"):
            lines.append(f"Категория: {op['category']}")
        parameter_schema = op.get("parameter_schema")
        if parameter_schema:
            lines.append(f"Параметры: {json.dumps(parameter_schema, ensure_ascii=False)}")
        allowed_outputs = op.get("allowed_outputs")
        if allowed_outputs:
            lines.append(f"Возможные результаты: {json.dumps(allowed_outputs, ensure_ascii=False)}")
        execution_contract = op.get("execution_contract") or {}
        if execution_contract.get("preconditions"):
            lines.append(f"Предусловия: {json.dumps(execution_contract['preconditions'], ensure_ascii=False)}")
        if execution_contract.get("postconditions"):
            lines.append(f"Постусловия: {json.dumps(execution_contract['postconditions'], ensure_ascii=False)}")
        if execution_contract.get("checks"):
            lines.append(f"Проверки: {json.dumps(execution_contract['checks'], ensure_ascii=False)}")
        resource_requirements = op.get("resource_requirements") or {}
        if resource_requirements.get("equipment"):
            lines.append(f"Требуемое оборудование: {json.dumps(resource_requirements['equipment'], ensure_ascii=False)}")
        if resource_requirements.get("containers"):
            lines.append(f"Требуемые контейнеры: {json.dumps(resource_requirements['containers'], ensure_ascii=False)}")
        if resource_requirements.get("time_estimate_sec") is not None:
            lines.append(f"Время выполнения: {resource_requirements['time_estimate_sec']}")
        chunk_text = _join_nonempty(lines)
        if not chunk_text.strip():
            continue
        chunk_meta = {
            **metadata,
            "source_type": "operation_catalog",
            "source_id": "operation_catalog",
            "operation_code": str(op.get("code") or ""),
            "category": str(op.get("category") or ""),
        }
        chunks.append({
            "chunk_index": len(chunks),
            "chunk_text": chunk_text,
            "token_count": _approx_tokens(chunk_text),
            "metadata_json": json.dumps({**chunk_meta, "operation_index": i}),
        })
    return chunks


def chunk_glossary(glossary: dict, metadata: dict | None = None) -> list[dict]:
    """Chunk glossary entries (equipment/resources/units) into one chunk per term."""
    metadata = metadata or {}
    chunks = []
    for kind in ("equipment", "resources", "units"):
        items = glossary.get(kind) or []
        if not isinstance(items, list):
            continue
        for i, item in enumerate(items):
            item = dict(item) if item else {}
            title = str(item.get("title") or "").strip()
            canon = str(item.get("canon") or "").strip()
            aliases = item.get("aliases") or []
            if not title and not canon:
                continue
            lines = []
            lines.append(f"Термин: {title or canon} ({canon or 'unknown'})")
            lines.append(f"Категория: {kind}")
            if aliases:
                lines.append(f"Синонимы: {', '.join(str(a) for a in aliases)}")
            chunk_text = _join_nonempty(lines)
            if not chunk_text.strip():
                continue
            chunk_meta = {
                **metadata,
                "source_type": "glossary",
                "source_id": "glossary",
                "term_canon": canon,
                "term_kind": kind,
            }
            chunks.append({
                "chunk_index": len(chunks),
                "chunk_text": chunk_text,
                "token_count": _approx_tokens(chunk_text),
                "metadata_json": json.dumps({**chunk_meta, "term_index": i}),
            })
    return chunks
