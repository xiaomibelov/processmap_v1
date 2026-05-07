from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from ..storage import (
    activate_ai_prompt_version,
    archive_ai_prompt_version,
    count_ai_prompt_versions,
    create_ai_prompt_draft,
    get_active_ai_prompt_version,
    get_ai_prompt_version,
    list_ai_prompt_versions,
)


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def create_prompt_draft(
    *,
    module_id: str,
    version: str,
    template: str,
    variables_schema: Dict[str, Any] | None = None,
    output_schema: Dict[str, Any] | None = None,
    created_by: str = "",
    scope_level: str = "global",
    scope_id: str = "",
    prompt_id: str = "",
) -> Dict[str, Any]:
    return create_ai_prompt_draft(
        module_id=_as_text(module_id),
        version=_as_text(version),
        template=str(template or ""),
        variables_schema=variables_schema if isinstance(variables_schema, dict) else {},
        output_schema=output_schema if isinstance(output_schema, dict) else {},
        created_by=_as_text(created_by),
        scope_level=_as_text(scope_level) or "global",
        scope_id=_as_text(scope_id),
        prompt_id=_as_text(prompt_id) or None,
    )


def list_prompt_versions(
    *,
    module_id: str = "",
    status: str = "",
    scope_level: str = "",
    scope_id: str = "",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    lim = max(1, min(int(limit or 50), 200))
    off = max(0, int(offset or 0))
    common = {
        "module_id": _as_text(module_id) or None,
        "status": _as_text(status) or None,
        "scope_level": _as_text(scope_level) or None,
        "scope_id": _as_text(scope_id) or None,
    }
    total = count_ai_prompt_versions(**common)
    items = list_ai_prompt_versions(**common, limit=lim, offset=off)
    return {
        "ok": True,
        "items": items,
        "count": int(total),
        "page": {"limit": lim, "offset": off, "total": int(total), "has_more": off + len(items) < int(total)},
    }


def get_prompt_detail(prompt_id: str) -> Dict[str, Any] | None:
    return get_ai_prompt_version(_as_text(prompt_id))


def get_active_prompt(
    *,
    module_id: str,
    scope_level: str = "global",
    scope_id: str = "",
) -> Dict[str, Any] | None:
    return get_active_ai_prompt_version(
        module_id=_as_text(module_id),
        scope_level=_as_text(scope_level) or "global",
        scope_id=_as_text(scope_id),
    )


def activate_prompt_version(prompt_id: str, *, actor_user_id: str = "") -> Dict[str, Any]:
    return activate_ai_prompt_version(_as_text(prompt_id), actor_user_id=_as_text(actor_user_id))


def archive_prompt_version(prompt_id: str, *, actor_user_id: str = "") -> Dict[str, Any]:
    return archive_ai_prompt_version(_as_text(prompt_id), actor_user_id=_as_text(actor_user_id))


@dataclass(frozen=True)
class PromptSeed:
    prompt_id: str
    module_id: str
    version: str
    template: str
    status: str = "active"
    variables_schema: Dict[str, Any] = field(default_factory=dict)
    output_schema: Dict[str, Any] = field(default_factory=dict)


def _object_schema(properties: Dict[str, Any] | None = None, required: list[str] | None = None) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": properties or {},
        "required": required or [],
        "additionalProperties": True,
    }


def existing_ai_prompt_seeds() -> list[PromptSeed]:
    from .deepseek_client import NOTES_EXTRACTION_SYSTEM_PROMPT
    from .deepseek_questions import (
        _LLM_QUESTION_POLICY_PROMPT,
        _PATH_REPORT_PROMPT_TEMPLATE_V1,
        _PATH_REPORT_PROMPT_TEMPLATE_V2,
        _SESSION_TITLE_PROMPT_TEMPLATE,
    )
    from .product_actions_suggest import PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE

    questions_input = _object_schema(
        {
            "bpmn_xml": {"type": "string"},
            "parsed_bpmn_json": {"type": "object"},
            "memory": {"type": "object"},
            "constraints": {"type": "object"},
        }
    )
    questions_output = _object_schema(
        {
            "start_context": {"type": "object"},
            "questions": {"type": "array"},
            "coverage": {"type": "object"},
        }
    )
    prep_input = _object_schema(
        {
            "title": {"type": "string"},
            "min_questions": {"type": "integer"},
            "max_questions": {"type": "integer"},
        },
        required=["title"],
    )
    prep_output = _object_schema({"title": {"type": "string"}, "questions": {"type": "array"}, "count": {"type": "integer"}})
    path_input = _object_schema({"payload": {"type": "object"}})
    path_output = _object_schema(
        {
            "title": {"type": "string"},
            "summary": {"type": "array"},
            "kpis": {"type": "object"},
            "recommendations": {"type": "array"},
            "missing_data": {"type": "array"},
            "report_markdown": {"type": "string"},
        }
    )
    notes_input = _object_schema({"notes": {"type": "string"}}, required=["notes"])
    notes_output = _object_schema({"nodes": {"type": "array"}, "edges": {"type": "array"}, "roles": {"type": "array"}})
    product_actions_input = _object_schema(
        {
            "session": {"type": "object"},
            "steps": {"type": "array"},
            "nodes": {"type": "array"},
            "edges": {"type": "array"},
            "roles": {"type": "array"},
            "existing_product_actions": {"type": "array"},
        }
    )
    product_actions_output = _object_schema(
        {
            "suggestions": {"type": "array"},
            "warnings": {"type": "array"},
        }
    )

    return [
        PromptSeed(
            prompt_id="seed_ai_questions_session_v1",
            module_id="ai.questions.session",
            version="v1",
            template=_LLM_QUESTION_POLICY_PROMPT,
            variables_schema=questions_input,
            output_schema=questions_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_questions_element_v1",
            module_id="ai.questions.element",
            version="v1",
            template=_LLM_QUESTION_POLICY_PROMPT,
            variables_schema=questions_input,
            output_schema=questions_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_questions_prep_v1",
            module_id="ai.questions.prep",
            version="v1",
            template=_SESSION_TITLE_PROMPT_TEMPLATE,
            variables_schema=prep_input,
            output_schema=prep_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_path_report_v1",
            module_id="ai.path_report",
            version="v1",
            template=_PATH_REPORT_PROMPT_TEMPLATE_V1,
            status="archived",
            variables_schema=path_input,
            output_schema=path_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_path_report_v2",
            module_id="ai.path_report",
            version="v2",
            template=_PATH_REPORT_PROMPT_TEMPLATE_V2,
            variables_schema=path_input,
            output_schema=path_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_process_extract_from_notes_v1",
            module_id="ai.process.extract_from_notes",
            version="v1",
            template=NOTES_EXTRACTION_SYSTEM_PROMPT,
            variables_schema=notes_input,
            output_schema=notes_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_product_actions_suggest_v1",
            module_id="ai.product_actions.suggest",
            version="v1",
            template=PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE,
            status="archived",
            variables_schema=product_actions_input,
            output_schema=product_actions_output,
        ),
        PromptSeed(
            prompt_id="seed_ai_product_actions_suggest_v2",
            module_id="ai.product_actions.suggest",
            version="v2",
            template=PRODUCT_ACTIONS_SUGGEST_PROMPT_TEMPLATE,
            variables_schema=product_actions_input,
            output_schema=product_actions_output,
        ),
    ]


def seed_existing_ai_prompts(*, actor_user_id: str = "migrated_seed") -> Dict[str, Any]:
    created: list[str] = []
    activated: list[str] = []
    archived: list[str] = []
    skipped: list[str] = []

    for seed in existing_ai_prompt_seeds():
        item = get_prompt_detail(seed.prompt_id)
        if not item:
            item = create_prompt_draft(
                prompt_id=seed.prompt_id,
                module_id=seed.module_id,
                version=seed.version,
                template=seed.template,
                variables_schema=seed.variables_schema,
                output_schema=seed.output_schema,
                created_by=actor_user_id,
            )
            created.append(seed.prompt_id)

        if seed.status == "active":
            active = get_active_prompt(module_id=seed.module_id)
            if not active:
                activate_prompt_version(seed.prompt_id, actor_user_id=actor_user_id)
                activated.append(seed.prompt_id)
            else:
                skipped.append(seed.prompt_id)
            continue

        if seed.status == "archived" and str(item.get("status") or "") != "archived":
            archive_prompt_version(seed.prompt_id, actor_user_id=actor_user_id)
            archived.append(seed.prompt_id)
            continue

        skipped.append(seed.prompt_id)

    return {
        "ok": True,
        "created": created,
        "activated": activated,
        "archived": archived,
        "skipped": skipped,
        "count": len(existing_ai_prompt_seeds()),
    }
