"""Единая сборка metadata для rag_chunks (feature/rag-schema-layer-indexing-v1).

Все write-paths (celery-таски, endpoint'ы) делегируют сборку metadata этому
helper'у, чтобы схема metadata_json была одной. Источник истины по process_layer —
sessions.process_layer на момент индексации (не payload запроса).
"""
from __future__ import annotations

import logging
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

PROCESS_LAYER_VALUES = ("as_is", "to_be")
DEFAULT_PROCESS_LAYER = "as_is"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _read(obj: Any, key: str, default: Any = "") -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def normalize_process_layer(value: Any) -> str:
    layer = _clean(value) or DEFAULT_PROCESS_LAYER
    if layer not in PROCESS_LAYER_VALUES:
        logger.warning("rag metadata: unknown process_layer %r, fallback to %r", layer, DEFAULT_PROCESS_LAYER)
        layer = DEFAULT_PROCESS_LAYER
    return layer


def build_chunk_metadata(
    *,
    source_type: str,
    source_id: str,
    session: Any = None,
    projection_digest: Optional[str] = None,
    diagram_state_version: Optional[int] = None,
    extra: Optional[dict] = None,
) -> dict:
    """Собрать metadata_json чанка.

    session: ORM-Session / mapping с полями id/title/process_layer/type. Для
    не-сессионных источников (словари, каталоги, glossary) session не передаётся —
    process_layer в metadata не пишется, фильтр по слою их не вернёт.
    """
    metadata: dict = {
        "source_type": _clean(source_type),
        "source_id": _clean(source_id),
    }
    if session is not None:
        sid = _clean(_read(session, "id"))
        if sid:
            metadata["session_id"] = sid
        title = _clean(_read(session, "title"))
        if title:
            metadata["session_title"] = title
        session_type = _clean(_read(session, "type"))
        if session_type:
            metadata["session_type"] = session_type
        metadata["process_layer"] = normalize_process_layer(_read(session, "process_layer", DEFAULT_PROCESS_LAYER))
    if projection_digest:
        metadata["projection_digest"] = str(projection_digest)
    if diagram_state_version is not None:
        try:
            metadata["diagram_state_version"] = int(diagram_state_version)
        except (TypeError, ValueError):
            pass
    if extra:
        metadata.update(extra)
    return metadata
