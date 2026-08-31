"""Measure agent prompt tokens before/after prompt-stack compression.

This is a temporary measurement script, not product code.
Usage:
    python scripts/measure_prompt_tokens.py --before
    python scripts/measure_prompt_tokens.py --after

Requires: tiktoken (install: pip install tiktoken)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

try:
    import tiktoken
except ImportError as exc:  # pragma: no cover
    print(f"tiktoken not installed: {exc}", file=sys.stderr)
    sys.exit(1)

ENCODING_NAME = "cl100k_base"


@dataclass
class AgentTurn:
    role: str
    content: Dict[str, Any] = field(default_factory=dict)
    action: Optional[str] = None
    action_payload: Dict[str, Any] = field(default_factory=dict)
    projection_digest: Optional[str] = None


@dataclass
class AgentContext:
    projection: Dict[str, Any]
    digest: str
    history: List[AgentTurn]


@dataclass
class AgentChatIn:
    message: str = ""
    selected_step_id: Optional[str] = None


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


def _build_user_prompt(ctx: AgentContext, payload: AgentChatIn) -> str:
    """Current implementation from memory/chat.py:228 (baseline)."""
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
    selected = str(payload.selected_step_id or "").strip()
    if selected:
        parts.append(f"Выбранный шаг: {selected}")
    parts.append(f"Сообщение пользователя: {payload.message}")
    return "\n\n".join(parts)


def _count_tokens(text: str) -> int:
    enc = tiktoken.get_encoding(ENCODING_NAME)
    return len(enc.encode(text))


def _generate_large_schema_300_nodes() -> Dict[str, Any]:
    steps: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    type_counts = {
        "task": 120,
        "userTask": 80,
        "exclusiveGateway": 30,
        "parallelGateway": 15,
        "intermediateCatchEvent": 25,
        "startEvent": 20,
        "endEvent": 10,
    }

    roles = ["технолог", "повар", "упаковщик", "контролёр"]
    op_codes = [f"оп_{i:03d}" for i in range(1, 51)]

    idx = 0
    prev_id: Optional[str] = None
    for node_type, count in type_counts.items():
        for _ in range(count):
            idx += 1
            step_id = f"step_{idx:04d}"
            name = f"Шаг {idx} — операция по обработке продукта типа {node_type}"
            role = roles[idx % len(roles)]
            step: Dict[str, Any] = {
                "id": step_id,
                "type": node_type,
                "name_ru": name,
                "duration": 5 + (idx % 20),
                "role": role,
            }
            if node_type in {"task", "userTask"}:
                step["operation_code"] = op_codes[idx % len(op_codes)]
            steps.append(step)

            if prev_id is not None:
                edges.append({"from": prev_id, "to": step_id})
            # Add occasional branching every 50 nodes to reach 340 edges.
            if idx > 1 and idx % 50 == 0 and prev_id is not None:
                branch_target = f"step_{idx - 10:04d}"
                edges.append({"from": prev_id, "to": branch_target})
            prev_id = step_id

    # Ensure target edge count ~340.
    while len(edges) < 340 and prev_id is not None:
        edges.append({"from": f"step_{(idx - 10) % 300 + 1:04d}", "to": prev_id})

    return {
        "steps": steps,
        "edges": edges[:340],
        "meta": {
            "session_id": "measurement_session_1",
            "rev": 42,
            "nodes_count": len(steps),
            "schema": 1,
        },
    }


def _generate_history(num_turns: int = 50) -> List[AgentTurn]:
    """Generate num_turns total (user + assistant pairs)."""
    history: List[AgentTurn] = []
    pairs = num_turns // 2
    for i in range(1, pairs + 1):
        history.append(
            AgentTurn(
                role="user",
                content={"text": f"Вопрос пользователя номер {i} по схеме процесса?"},
                projection_digest="digest_measurement",
            )
        )
        history.append(
            AgentTurn(
                role="assistant",
                content={"text": f"Ответ ассистента на вопрос {i}. Кратко и по делу."},
                projection_digest="digest_measurement",
            )
        )
    return history


def _measure_before() -> Dict[str, Any]:
    projection = _generate_large_schema_300_nodes()
    history = _generate_history(50)
    ctx = AgentContext(projection=projection, digest="digest_measurement", history=history)
    payload = AgentChatIn(message="расскажи про эту схему", selected_step_id="step_0050")

    prompt = _build_user_prompt(ctx, payload)
    total_tokens = _count_tokens(prompt)

    projection_text = _to_json_text(projection)
    history_text = _format_history_for_prompt(history, ctx.digest)

    projection_tokens = _count_tokens(projection_text)
    history_tokens = _count_tokens(history_text)
    user_message_tokens = _count_tokens(payload.message)

    return {
        "fixture": "large_schema_300_nodes",
        "mode": "before",
        "prompt_tokens_total": total_tokens,
        "prompt_tokens_projection": projection_tokens,
        "prompt_tokens_history": history_tokens,
        "prompt_tokens_user": user_message_tokens,
        "projection_nodes": len(projection["steps"]),
        "projection_edges": len(projection["edges"]),
        "history_turns": len(history),
    }


def _generate_rag_chunks() -> List[Dict[str, Any]]:
    """Mock RAG chunks for the prod-like measurement."""
    return [
        {
            "element_id": "step_0050",
            "element_name": "Шаг 50 — операция по обработке продукта типа userTask",
            "chunk_text": "Подробное описание шага 50: мойка и первичная обработка сырья перед нарезкой.",
            "metadata": {"element_id": "step_0050", "element_name": "Шаг 50"},
        },
        {
            "element_id": "step_0051",
            "element_name": "Шаг 51 — операция по обработке продукта типа task",
            "chunk_text": "Подробное описание шага 51: сортировка и контроль качества.",
            "metadata": {"element_id": "step_0051", "element_name": "Шаг 51"},
        },
        {
            "element_id": "step_0049",
            "element_name": "Шаг 49 — операция по обработке продукта типа userTask",
            "chunk_text": "Подготовительный шаг 49: разморозка и визуальный осмотр.",
            "metadata": {"element_id": "step_0049", "element_name": "Шаг 49"},
        },
    ]


def _measure_after(*, prod_like: bool = False) -> Dict[str, Any]:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend", "services", "agent"))
    from memory.prompt_builder import PromptBuilder

    projection = _generate_large_schema_300_nodes()
    history = _generate_history(50)

    if prod_like:
        # Inject a pending-edit turn that must never be trimmed.
        history.append(
            AgentTurn(
                role="assistant",
                content={"text": "Предлагаю добавить операцию контроля качества после шага 50."},
                action="edit_canvas",
                projection_digest="digest_measurement",
            )
        )

    ctx = AgentContext(projection=projection, digest="digest_measurement", history=history)
    payload = AgentChatIn(message="расскажи про эту схему", selected_step_id="step_0050")

    builder = PromptBuilder()
    rag_chunks = _generate_rag_chunks() if prod_like else []
    assembly = builder.build_processman_prompt(ctx, payload, rag_chunks=rag_chunks)
    prompt = assembly.user_prompt
    total_tokens = _count_tokens(prompt)

    return {
        "fixture": "large_schema_300_nodes",
        "mode": "after-prod-like" if prod_like else "after",
        "rag_included": bool(rag_chunks),
        "rag_chunk_count": len(rag_chunks),
        "pending_edit_included": prod_like,
        "history_turns": len(history),
        "prompt_tokens_total": total_tokens,
        "prompt_tokens_projection": _count_tokens(assembly.compact_projection_text),
        "prompt_tokens_history": _count_tokens(assembly.history_text),
        "prompt_tokens_user": _count_tokens(f"Выбранный шаг: {payload.selected_step_id}\n\nСообщение пользователя: {payload.message}"),
        "estimated_prompt_tokens": assembly.estimated_prompt_tokens,
        "layer_tokens": assembly.layer_tokens,
        "projection_nodes": len(projection["steps"]),
        "projection_edges": len(projection["edges"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure prompt tokens for agent compression contour")
    parser.add_argument("--before", action="store_true", help="Measure baseline (current code)")
    parser.add_argument("--after", action="store_true", help="Measure after PromptBuilder (history + selected step, no RAG, no pending edit)")
    parser.add_argument("--after-prod-like", action="store_true", help="Measure after PromptBuilder with mock RAG chunks and pending-edit context")
    args = parser.parse_args()

    if args.before:
        result = _measure_before()
    elif args.after:
        result = _measure_after()
    elif args.after_prod_like:
        result = _measure_after(prod_like=True)
    else:
        parser.print_help()
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
