"""Compact prompt builder for PROCESSMAN chat.

Builds token-cheap prompts by replacing the full JSON projection with:
- schema statistics,
- RAG-retrieved relevant elements,
- selected-step neighborhood,
- capped history + conversation summary,
- stable system/reference prefix.

No DB access here — callers pass loaded context/history/summary.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class PromptBudgetConfig:
    """Token budgets for prompt assembly."""

    max_total_prompt_tokens: int = 4096
    max_projection_tokens: int = 2048
    max_history_tokens: int = 1024
    history_turns_full: int = 6
    rag_top_k: int = 5
    selected_step_radius: int = 1

    @classmethod
    def from_env(cls) -> "PromptBudgetConfig":
        """Load overrides from environment."""
        return cls(
            max_total_prompt_tokens=_int_env("PROCESSMAN_MAX_TOTAL_PROMPT_TOKENS", 4096),
            max_projection_tokens=_int_env("PROCESSMAN_MAX_PROJECTION_TOKENS", 2048),
            max_history_tokens=_int_env("PROCESSMAN_MAX_HISTORY_TOKENS", 1024),
            history_turns_full=_int_env("PROCESSMAN_HISTORY_TURNS_FULL", 6),
            rag_top_k=_int_env("PROCESSMAN_RAG_TOP_K", 5),
            selected_step_radius=_int_env("PROCESSMAN_SELECTED_STEP_RADIUS", 1),
        )


@dataclass
class PromptAssembly:
    """Result of prompt assembly with observability."""

    user_prompt: str
    compact_projection_text: str
    history_text: str
    estimated_prompt_tokens: int
    layer_tokens: Dict[str, int] = field(default_factory=dict)


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except (TypeError, ValueError):
        return default


def estimate_tokens(text: str) -> int:
    """Fast heuristic token estimate (no external dependencies).

    Conservative enough for budget enforcement. Tests may use tiktoken
    for exact counts.
    """
    text = str(text or "")
    if not text:
        return 0
    ascii_chars = sum(1 for ch in text if ord(ch) < 128)
    cyrillic_chars = len(text) - ascii_chars
    return max(1, (ascii_chars + 3) // 4 + (cyrillic_chars + 1) // 2)


def _to_json_text(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)
    except Exception:
        return "{}"


def _as_list(value: Any) -> List[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _step_ids(projection: Dict[str, Any]) -> Set[str]:
    return {str(s.get("id") or "").strip() for s in _as_list(projection.get("steps")) if str(s.get("id") or "").strip()}


def _build_adjacency(edges: List[Dict[str, Any]]) -> Tuple[Dict[str, Set[str]], Dict[str, Set[str]]]:
    predecessors: Dict[str, Set[str]] = {}
    successors: Dict[str, Set[str]] = {}
    for e in edges:
        src = str(e.get("from") or "").strip()
        dst = str(e.get("to") or "").strip()
        if not src or not dst:
            continue
        successors.setdefault(src, set()).add(dst)
        predecessors.setdefault(dst, set()).add(src)
    return predecessors, successors


def _is_pending_edit_turn(turn: Any) -> bool:
    """Identify HITL turns that must never be trimmed."""
    action = str(getattr(turn, "action", None) or "").strip()
    if action == "edit_canvas":
        return True
    payload = getattr(turn, "action_payload", None) or {}
    if isinstance(payload, dict):
        if payload.get("pending_edit_id"):
            return True
        if str(payload.get("status") or "").strip() == "pending_confirmation":
            return True
    return False


def _format_step(step: Dict[str, Any]) -> str:
    sid = str(step.get("id") or "").strip()
    name = str(step.get("name_ru") or "").strip()
    typ = str(step.get("type") or "").strip()
    role = str(step.get("role") or "").strip()
    duration = step.get("duration")
    op_code = str(step.get("operation_code") or "").strip()
    parts = [f"- {sid}"]
    if name:
        parts.append(f'"{name}"')
    if typ:
        parts.append(f"({typ})")
    attrs: List[str] = []
    if role:
        attrs.append(f"role={role}")
    if duration is not None:
        attrs.append(f"duration={duration}")
    if op_code:
        attrs.append(f"op={op_code}")
    if attrs:
        parts.append(", ".join(attrs))
    return " ".join(parts)


def _build_statistics(projection: Dict[str, Any]) -> str:
    steps = _as_list(projection.get("steps"))
    edges = _as_list(projection.get("edges"))

    type_counts: Dict[str, int] = {}
    roles: Set[str] = set()
    op_codes: Set[str] = set()
    for s in steps:
        typ = str(s.get("type") or "unknown").strip()
        type_counts[typ] = type_counts.get(typ, 0) + 1
        role = str(s.get("role") or "").strip()
        if role:
            roles.add(role)
        op = str(s.get("operation_code") or "").strip()
        if op:
            op_codes.add(op)

    type_lines = ", ".join(f"{t}: {c}" for t, c in sorted(type_counts.items(), key=lambda x: -x[1]))
    meta = projection.get("meta") or {}

    lines = [
        f"Всего узлов: {len(steps)}",
        f"  По типам: {type_lines}",
        f"Рёбер: {len(edges)}",
    ]
    if roles:
        lines.append(f"Роли: {sorted(roles)}")
    if op_codes:
        codes = sorted(op_codes)
        if len(codes) > 20:
            lines.append(f"Коды операций: {codes[:20]} ... (всего {len(codes)})")
        else:
            lines.append(f"Коды операций: {codes}")
    lines.append(f"Версия схемы: {int(meta.get('schema') or 1)}, rev: {int(meta.get('rev') or 0)}")
    return "\n".join(lines)


def _select_relevant_step_ids(
    projection: Dict[str, Any],
    selected_step_id: Optional[str],
    rag_chunks: List[Dict[str, Any]],
    config: PromptBudgetConfig,
) -> Set[str]:
    """Pick step ids that deserve full detail in the compact projection."""
    steps = _as_list(projection.get("steps"))
    edges = _as_list(projection.get("edges"))
    all_ids = _step_ids(projection)
    selected = set()

    # RAG-retrieved elements.
    for c in rag_chunks[: config.rag_top_k]:
        meta = c.get("metadata") or {}
        eid = str(meta.get("element_id") or c.get("element_id") or "").strip()
        if eid and eid in all_ids:
            selected.add(eid)

    # Selected-step neighborhood.
    sid = str(selected_step_id or "").strip()
    if sid and sid in all_ids:
        selected.add(sid)
        predecessors, successors = _build_adjacency(edges)
        if config.selected_step_radius >= 1:
            selected.update(predecessors.get(sid, set()) & all_ids)
            selected.update(successors.get(sid, set()) & all_ids)
        if config.selected_step_radius >= 2:
            for p in list(predecessors.get(sid, set()) & all_ids):
                selected.update(predecessors.get(p, set()) & all_ids)
            for s in list(successors.get(sid, set()) & all_ids):
                selected.update(successors.get(s, set()) & all_ids)

    return selected


def _build_compact_projection(
    projection: Dict[str, Any],
    selected_ids: Set[str],
) -> str:
    """Render compact projection text."""
    steps = _as_list(projection.get("steps"))
    edges = _as_list(projection.get("edges"))

    lines = ["=== BPMN-схема (компактная проекция) ===", _build_statistics(projection)]

    if selected_ids:
        by_id = {str(s.get("id") or "").strip(): s for s in steps}
        selected_steps = [by_id[eid] for eid in sorted(selected_ids) if eid in by_id]
        lines.append("")
        lines.append("Детали выбранных / релевантных узлов:")
        for s in selected_steps:
            lines.append(_format_step(s))

        # Edges between selected steps only.
        selected_set = set(selected_ids)
        relevant_edges = [
            e for e in edges if str(e.get("from") or "").strip() in selected_set and str(e.get("to") or "").strip() in selected_set
        ]
        if relevant_edges:
            lines.append("")
            lines.append("Связи между ними:")
            for e in relevant_edges:
                lines.append(f"{e.get('from')} -> {e.get('to')}")

    return "\n".join(lines)


def _trim_compact_projection(
    projection: Dict[str, Any],
    selected_step_id: Optional[str],
    rag_chunks: List[Dict[str, Any]],
    config: PromptBudgetConfig,
) -> str:
    """Build compact projection and trim if it exceeds budget."""
    # Try full config first.
    selected_ids = _select_relevant_step_ids(projection, selected_step_id, rag_chunks, config)
    text = _build_compact_projection(projection, selected_ids)
    if estimate_tokens(text) <= config.max_projection_tokens:
        return text

    # Fallback 1: reduce RAG top_k.
    reduced_config = PromptBudgetConfig(**{**config.__dict__, "rag_top_k": 3})
    selected_ids = _select_relevant_step_ids(projection, selected_step_id, rag_chunks, reduced_config)
    text = _build_compact_projection(projection, selected_ids)
    if estimate_tokens(text) <= config.max_projection_tokens:
        return text

    # Fallback 2: reduce selected-step radius to 0.
    reduced_config = PromptBudgetConfig(**{**config.__dict__, "rag_top_k": 3, "selected_step_radius": 0})
    selected_ids = _select_relevant_step_ids(projection, selected_step_id, rag_chunks, reduced_config)
    text = _build_compact_projection(projection, selected_ids)
    if estimate_tokens(text) <= config.max_projection_tokens:
        return text

    # Fallback 3: drop RAG chunks, keep only selected step (if any).
    selected_ids = {str(selected_step_id or "").strip()} & _step_ids(projection)
    text = _build_compact_projection(projection, selected_ids)
    if estimate_tokens(text) <= config.max_projection_tokens:
        return text

    # Fallback 4: statistics only.
    return "\n".join(["=== BPMN-схема (компактная проекция) ===", _build_statistics(projection)])


def _format_history(
    history: List[Any],
    current_digest: str,
    conversation_summary: Optional[str],
    config: PromptBudgetConfig,
) -> Tuple[str, int]:
    """Format history with hard budget; preserve pending-edit context."""
    if not history:
        return "", 0

    pending_turns = [t for t in history if _is_pending_edit_turn(t)]
    non_pending = [t for t in history if not _is_pending_edit_turn(t)]

    def _turn_text(turn: Any) -> str:
        role_label = "User" if (getattr(turn, "role", None) or "") == "user" else "Assistant"
        content = getattr(turn, "content", None) or {}
        if isinstance(content, dict):
            text = str(content.get("text") or "").strip()
        else:
            text = str(content or "").strip()
        digest = getattr(turn, "projection_digest", None)
        stale_note = ""
        if digest and digest != current_digest:
            stale_note = " (схема с тех пор изменилась)"
        return f"{role_label}{stale_note}: {text}"

    # Always include pending-edit turns verbatim.
    pending_lines = [_turn_text(t) for t in pending_turns if _turn_text(t)]
    pending_text = "\n".join(pending_lines)
    pending_tokens = estimate_tokens(pending_text)

    # Verbatim window for non-pending turns.
    verbatim_turns = non_pending[-config.history_turns_full:] if len(non_pending) > config.history_turns_full else non_pending
    verbatim_lines = [_turn_text(t) for t in verbatim_turns if _turn_text(t)]

    # Trim verbatim window if needed (but keep at least 2 turns).
    available_history_budget = config.max_history_tokens - pending_tokens
    while len(verbatim_lines) > 2 and estimate_tokens("\n".join(verbatim_lines)) > available_history_budget:
        verbatim_lines.pop(0)

    # Truncate individual lines if still over budget.
    while verbatim_lines and estimate_tokens("\n".join(verbatim_lines)) > available_history_budget:
        verbatim_lines = [line[:200] for line in verbatim_lines]
        # If even truncated lines exceed budget, drop oldest.
        if len(verbatim_lines) > 2 and estimate_tokens("\n".join(verbatim_lines)) > available_history_budget:
            verbatim_lines.pop(0)
        else:
            break

    parts: List[str] = []
    older_count = len(non_pending) - len(verbatim_turns)
    if older_count > 0:
        if conversation_summary:
            parts.append(f"Краткое содержание предыдущей части диалога: {conversation_summary.strip()}")
        else:
            parts.append(f"Ранее в диалоге обсуждалась схема из {older_count} сообщений.")

    if verbatim_lines:
        parts.append("\n".join(verbatim_lines))

    if pending_lines:
        parts.append("Неподтверждённые правки схемы:")
        parts.append(pending_text)

    history_text = "\n\n".join(parts)
    return history_text, estimate_tokens(history_text)


class PromptBuilder:
    """Assemble compact prompts for processman_agent."""

    def __init__(self, config: Optional[PromptBudgetConfig] = None):
        self.config = config or PromptBudgetConfig.from_env()

    def build_processman_prompt(
        self,
        ctx: Any,
        payload: Any,
        *,
        rag_chunks: Optional[List[Dict[str, Any]]] = None,
        conversation_summary: Optional[str] = None,
    ) -> PromptAssembly:
        """Build compact user prompt for free-answer / smalltalk / schema_overview fallback."""
        projection_text = _trim_compact_projection(
            ctx.projection,
            payload.selected_step_id,
            rag_chunks or [],
            self.config,
        )
        history_text, history_tokens = _format_history(
            ctx.history,
            ctx.digest,
            conversation_summary,
            self.config,
        )

        parts = [projection_text]
        if history_text:
            parts.append("=== История диалога ===")
            parts.append(history_text)
        selected = str(payload.selected_step_id or "").strip()
        if selected:
            parts.append(f"Выбранный шаг: {selected}")
        parts.append(f"Сообщение пользователя: {payload.message}")

        user_prompt = "\n\n".join(parts)

        layer_tokens = {
            "projection": estimate_tokens(projection_text),
            "history": history_tokens,
            "user": estimate_tokens(f"Выбранный шаг: {selected}\n\nСообщение пользователя: {payload.message}" if selected else f"Сообщение пользователя: {payload.message}"),
        }
        total = sum(layer_tokens.values())

        return PromptAssembly(
            user_prompt=user_prompt,
            compact_projection_text=projection_text,
            history_text=history_text,
            estimated_prompt_tokens=total,
            layer_tokens=layer_tokens,
        )

    def build_schema_overview_prompt(
        self,
        ctx: Any,
        *,
        rag_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> PromptAssembly:
        """Build compact prompt for cold schema_overview generation."""
        projection_text = _trim_compact_projection(
            ctx.projection,
            selected_step_id=None,
            rag_chunks=rag_chunks or [],
            config=self.config,
        )
        parts = [
            "Кратко опиши BPMN-схему ниже на русском языке. Не более 400 токенов. Схема:\n\n"
            + projection_text,
        ]
        user_prompt = "\n\n".join(parts)
        layer_tokens = {
            "projection": estimate_tokens(projection_text),
            "history": 0,
            "user": estimate_tokens(user_prompt) - estimate_tokens(projection_text),
        }
        return PromptAssembly(
            user_prompt=user_prompt,
            compact_projection_text=projection_text,
            history_text="",
            estimated_prompt_tokens=sum(layer_tokens.values()),
            layer_tokens=layer_tokens,
        )
