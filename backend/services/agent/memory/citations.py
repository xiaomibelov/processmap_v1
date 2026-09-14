"""Cite-контракт RAG-источников (контур feature/agent-rag-retrieval-citations-v1).

Превращает сырые результаты /api/rag/search в нумерованные SourceRef для
промпта (маркеры [S1]..[Sn]) и обратно — в список реально процитированных
источников для AgentChatOut/SSE. Гарантия G4: маркер вне переданного
диапазона вырезается из текста и не попадает в sources — агент физически
не может отдать выдуманную цитату, которую мы не подавали в контекст.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

SNIPPET_MAX_CHARS = 200

# Маркер для тестов и наблюдаемости: инструкция цитирования присутствует
# в промпте тогда и только тогда, когда в контекст переданы отрывки.
CITATION_INSTRUCTION_MARKER = "не выдумывай факты и не приводи ссылки на несуществующие источники"

CITATION_INSTRUCTION = (
    "При ответе опирайся на приведённые ниже отрывки документации процессов. "
    "Каждое утверждение, основанное на отрывке, помечай маркером вида [S1], [S2] и т.д. "
    "соответствующим источнику. Если отрывков недостаточно для ответа — прямо скажи об этом, "
    f"{CITATION_INSTRUCTION_MARKER}."
)

_MARKER_RE = re.compile(r"\[S(\d+)\]")
# Хвост, который может оказаться началом незакрытого маркера (для stream-дельт).
_PARTIAL_MARKER_RE = re.compile(r"\[S\d*$")


class MarkerStripper:
    """Инкрементально вырезает маркеры [Sn] из SSE-дельт.

    Маркер может быть разорван между дельтами («[S» + «1]») — carry удерживает
    хвост до закрытия. В stream-текст маркеры не попадают; структурные
    источники клиент получает отдельным `sources`-ивентом.
    """

    def __init__(self) -> None:
        self._carry = ""

    def feed(self, delta: str) -> str:
        buf = self._carry + str(delta or "")
        clean = _MARKER_RE.sub("", buf)
        partial = _PARTIAL_MARKER_RE.search(clean)
        if partial:
            self._carry = clean[partial.start():]
            clean = clean[:partial.start()]
        else:
            self._carry = ""
        return clean

    def flush(self) -> str:
        carry, self._carry = self._carry, ""
        return carry


def chunk_excerpt(result: Dict[str, Any]) -> str:
    """Текст отрывка из результата поиска (контракт /api/rag/search: chunk_text)."""
    return str(result.get("chunk_text") or result.get("chunk") or result.get("text") or "").strip()


def build_source_refs(
    rag_results: List[Dict[str, Any]],
    limit: int = 5,
    snippet_chars: int = SNIPPET_MAX_CHARS,
) -> List[Dict[str, Any]]:
    """Собрать SourceRef из результатов поиска.

    Поля metadata (session_id/session_title/process_layer/element_*) — опциональны:
    отсутствуют на main до мержа E1 (#972) для process_layer, у справочников —
    для сессионных полей.
    """
    refs: List[Dict[str, Any]] = []
    seen_ids: set = set()
    for idx, r in enumerate(list(rag_results or [])[:limit]):
        meta = r.get("metadata") or {}
        chunk_id = str(r.get("chunk_id") or f"rag_{idx + 1}").strip()
        if chunk_id in seen_ids:
            continue  # дедупликация: один chunk_id — один источник
        seen_ids.add(chunk_id)
        source_type = str(r.get("source_type") or meta.get("source_type") or "").strip()
        source_id = str(r.get("source_id") or meta.get("source_id") or "").strip()
        session_id = str(meta.get("session_id") or "").strip()
        if not session_id and source_type == "bpmn_xml":
            # bpmn_xml-чанки: top-level source_id — это id сессии-источника.
            session_id = source_id
        try:
            score = float(r.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        refs.append(
            {
                "source_id": chunk_id,
                "source_type": source_type,
                "session_id": session_id or None,
                "session_title": str(meta.get("session_title") or "").strip() or None,
                "process_layer": str(meta.get("process_layer") or "").strip() or None,
                "element_id": str(meta.get("element_id") or r.get("element_id") or "").strip() or None,
                "element_name": str(meta.get("element_name") or r.get("element_name") or "").strip() or None,
                "snippet": chunk_excerpt(r)[:snippet_chars],
                "score": score,
            }
        )
    return refs


def format_rag_excerpts(refs: List[Dict[str, Any]]) -> str:
    """Отрисовать нумерованные отрывки для промпта: [S1] <заголовок>\\n<текст>."""
    blocks: List[str] = []
    for i, ref in enumerate(refs, start=1):
        title = ref.get("session_title") or ref.get("element_name") or ref.get("source_type") or "источник"
        header = f"[S{i}] {title}"
        if ref.get("element_name") and ref.get("element_name") != title:
            header += f" — {ref['element_name']}"
        blocks.append(f"{header}\n{ref.get('snippet') or ''}".rstrip())
    return "\n\n".join(blocks)


def rag_excerpts_block(refs: List[Dict[str, Any]]) -> str:
    """Полный RAG-блок промпта: инструкция + нумерованные отрывки."""
    if not refs:
        return ""
    return (
        "=== Контекст из документации процессов (источники) ===\n"
        + CITATION_INSTRUCTION
        + "\n\n"
        + format_rag_excerpts(refs)
    )


def source_titles_block(refs: List[Dict[str, Any]]) -> str:
    """Минимальный rung trim-ladder: только заголовки источников без отрывков."""
    lines = []
    for i, ref in enumerate(refs, start=1):
        title = ref.get("session_title") or ref.get("element_name") or ref.get("source_type") or "источник"
        lines.append(f"[S{i}] {title}")
    return "\n".join(lines)


def rag_block_within_budget(
    rag_results: List[Dict[str, Any]],
    budget_tokens: int,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Trim-ladder RAG-блока под оставшийся бюджет промпта (гейт G2).

    Лестница: полные отрывки → top 3 → top 2 со сниппетами 100 символов →
    только заголовки → "" (RAG отключён для этого хода, деградация без ошибки).
    Возвращает (блок, refs выбранной ступени) — refs нужны парсеру цитат:
    модель видит только то, что попало в блок.
    """
    full_refs = build_source_refs(rag_results)
    if not full_refs:
        return "", []

    def _fits(block: str) -> bool:
        return estimate_tokens_local(block) <= budget_tokens

    ladder = [
        (full_refs, rag_excerpts_block(full_refs)),
        (full_refs[:3], rag_excerpts_block(full_refs[:3])),
        (
            build_source_refs(rag_results, limit=2, snippet_chars=100),
            rag_excerpts_block(build_source_refs(rag_results, limit=2, snippet_chars=100)),
        ),
        (full_refs, "=== Источники документации (только заголовки) ===\n" + source_titles_block(full_refs)),
    ]
    for refs, block in ladder:
        if _fits(block):
            return block, refs
    return "", []


def estimate_tokens_local(text: str) -> int:
    # Локальная обёртка, чтобы не тащить prompt_builder в циклический импорт.
    from .prompt_builder import estimate_tokens

    return estimate_tokens(text)


def parse_citations(
    text: str, refs: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]]]:
    """Вырезать маркеры [Sn] из текста и вернуть реально использованные источники.

    Маркеры вне диапазона 1..len(refs) игнорируются (guard G4 против
    выдуманных цитат). Возвращает (очищенный текст, used refs в порядке
    первого появления).
    """
    if not refs:
        return str(text or ""), []

    total = len(refs)
    used_indexes: List[int] = []
    seen = set()

    def _replace(match: re.Match) -> str:
        idx = int(match.group(1))
        if 1 <= idx <= total:
            if idx not in seen:
                seen.add(idx)
                used_indexes.append(idx)
            return ""
        return ""  # выдуманный маркер — вырезаем молча

    clean = _MARKER_RE.sub(_replace, str(text or ""))
    # Схлопываем пробельные хвости на месте вырезанных маркеров, НЕ трогая
    # индентацию строк (markdown/код-блоки ответа).
    clean = re.sub(r"(?<=\S)[ \t]{2,}(?=\S)", " ", clean).strip()
    used = [refs[i - 1] for i in used_indexes]
    return clean, used
