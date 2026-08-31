"""PromptBuilder — centralizes prompt text + model_class selection for PROCESSMAN.

Contour feature/agent-model-routing-optimization-v1:
- keeps response logic unchanged;
- decides model_class per intent (cheap vs primary);
- returns kwargs for gateway.complete() so chat.py stays thin.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .context import AgentContext
from .memory_store import AgentTurn


MAX_TOKENS = 1200
SMALLTALK_MAX_TOKENS = 400
SCHEMA_OVERVIEW_MAX_TOKENS = 400


def _to_json_text(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _format_history_for_prompt(history: List[AgentTurn], current_digest: str) -> str:
    lines: List[str] = []
    for turn in history:
        role_label = "User" if turn.role == "user" else "Assistant"
        text = str((turn.content or {}).get("text") or "")
        if not text:
            continue
        stale_note = ""
        if turn.projection_digest and turn.projection_digest != current_digest:
            stale_note = " (схема с тех пор изменилась)"
        lines.append(f"{role_label}{stale_note}: {text}")
    return "\n".join(lines)


def _build_user_prompt(ctx: AgentContext, payload: Any) -> str:
    projection_text = _to_json_text(ctx.projection)
    history_text = _format_history_for_prompt(ctx.history, ctx.digest)
    parts = [
        "=== BPMN-схема ===",
        projection_text,
    ]
    rag_chunks = list((ctx.projection or {}).get("rag_context_chunks") or [])
    if rag_chunks:
        chunk_lines = []
        for c in rag_chunks[:5]:
            eid = str(c.get("element_id") or "").strip()
            name = str(c.get("element_name") or "").strip()
            text = str(c.get("chunk_text") or "").strip()
            header = f"{name} ({eid})" if (name and eid) else (name or eid or "chunk")
            chunk_lines.append(f"{header}: {text}")
        parts.append("=== Дополнительный контекст из BPMN/RAG ===")
        parts.append("\n".join(chunk_lines))
    if history_text:
        parts.append("=== История диалога ===")
        parts.append(history_text)
    selected = str(getattr(payload, "selected_step_id", None) or "").strip()
    if selected:
        parts.append(f"Выбранный шаг: {selected}")
    parts.append(f"Сообщение пользователя: {payload.message}")
    return "\n\n".join(parts)


def _step_ids(projection: Dict[str, Any]) -> set:
    return {str(s.get("id") or "").strip() for s in (projection.get("steps") or []) if str(s.get("id") or "").strip()}


class PromptBuilder:
    """Build prompt payload + model_class for a given intent.

    Does NOT change response logic — only decides which model_class to ask
    the gateway for and prepares the prompt text.
    """

    @classmethod
    def build(
        cls,
        intent: str,
        ctx: AgentContext,
        payload: Any,
        *,
        rag_results: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Return kwargs for gateway.complete() for the given intent.

        Returned dict contains: {"model_class": str, "payload": dict, "max_tokens": int}.
        """
        if intent == "schema_overview":
            return cls._schema_overview(ctx)
        if intent == "doc_qa":
            return cls._doc_qa(ctx, payload, rag_results or [])
        if intent == "smalltalk":
            return cls._free_answer(ctx, payload, model_class="cheap")
        if intent == "doc_qa_fallback":
            # doc_qa without RAG falls back to free-answer with full projection.
            return cls._free_answer(ctx, payload, model_class="primary")
        # Conservative default for any unknown intent: primary.
        return cls._free_answer(ctx, payload, model_class="primary")

    @classmethod
    def _schema_overview(cls, ctx: AgentContext) -> Dict[str, Any]:
        parts = [
            "Кратко опиши BPMN-схему ниже на русском языке. "
            "Не более 400 токенов. Схема:\n\n"
            f"{_to_json_text(ctx.projection)}",
        ]
        rag_chunks = list((ctx.projection or {}).get("rag_context_chunks") or [])
        if rag_chunks:
            parts.append("Дополнительный контекст из BPMN/RAG:\n")
            for c in rag_chunks[:5]:
                eid = str(c.get("element_id") or "").strip()
                name = str(c.get("element_name") or "").strip()
                text = str(c.get("chunk_text") or "").strip()
                header = f"{name} ({eid})" if (name and eid) else (name or eid or "chunk")
                parts.append(f"{header}: {text}")
        prompt_text = "\n\n".join(parts)
        return {"model_class": "cheap", "payload": {"input": prompt_text}, "max_tokens": SCHEMA_OVERVIEW_MAX_TOKENS}

    @classmethod
    def _doc_qa(cls, ctx: AgentContext, payload: Any, rag_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not rag_results:
            # Should be handled by caller, but keep safe fallback.
            return cls._free_answer(ctx, payload, model_class="primary")
        chunks_text = "\n---\n".join(
            str(r.get("chunk") or r.get("text") or "").strip() for r in rag_results[:5]
        )
        prompt_text = (
            "Ответь на вопрос пользователя на основе предоставленных отрывков документации. "
            "Отвечай на русском языке. Если ответа нет в отрывках, скажи об этом.\n\n"
            f"Отрывки:\n{chunks_text}\n\n"
            f"Вопрос: {payload.message}"
        )
        return {"model_class": "cheap", "payload": {"input": prompt_text}, "max_tokens": MAX_TOKENS}

    @classmethod
    def _free_answer(cls, ctx: AgentContext, payload: Any, *, model_class: str) -> Dict[str, Any]:
        user_prompt_text = _build_user_prompt(ctx, payload)
        max_tokens = SMALLTALK_MAX_TOKENS if not _step_ids(ctx.projection) else MAX_TOKENS
        return {"model_class": model_class, "payload": {"input": user_prompt_text}, "max_tokens": max_tokens}
