"""HTTP-клиент embedding-sidecar (rag-embedder).

Контракт sidecar: POST /embed {"texts": [...], "input_type": "query"|"passage"}
-> {"embeddings": [[float...]], "model_id": "local-e5-small", "dimensions": 384}.

Любой сбой (connect, timeout, битый payload) -> None: вызывающий код деградирует
на keyword-only. Дополнительно — короткий cooldown после серии неудач, чтобы
упавший sidecar не добавлял таймаут к каждому поиску.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from array import array
from typing import Any, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "http://rag-embedder:8000"
# Раздельные таймауты путей (fix/rag-embedder-onnx-latency-v1), читаются из env
# на каждый вызов (ops-переопределение без редеплоя кода):
# - query (request-path поиска): быстрый fail -> деградация на keyword-only.
#   На CPU-сайдкаре int8-ONNX query ~50-150ms; 5s — с запасом на прогрев/контенд.
# - passage (celery-батч индексации): чанки эмбеддятся пачками, на CPU int8
#   батч 16 ~1-2s, но при больших батчах/контенде допустимы десятки секунд.
# Замеры: raghybrid-ab (apple-silicon docker VM), BENCHMARK.md контура
# fix/rag-embedder-onnx-latency-v1.
QUERY_TIMEOUT_DEFAULT_SECONDS = 5.0
PASSAGE_TIMEOUT_DEFAULT_SECONDS = 60.0
FAILURE_COOLDOWN_SECONDS = 30.0


def _query_timeout_seconds() -> float:
    return float(os.environ.get("EMBEDDINGS_QUERY_TIMEOUT_SECONDS", QUERY_TIMEOUT_DEFAULT_SECONDS))


def _passage_timeout_seconds() -> float:
    return float(os.environ.get("EMBEDDINGS_PASSAGE_TIMEOUT_SECONDS", PASSAGE_TIMEOUT_DEFAULT_SECONDS))

_state_lock = threading.Lock()
_failures = 0
_cooldown_until = 0.0

QueryEmbedding = Tuple[list, str, int]


def _base_url() -> str:
    return os.environ.get("EMBEDDINGS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _in_cooldown() -> bool:
    with _state_lock:
        return time.monotonic() < _cooldown_until


def _record_success() -> None:
    global _failures, _cooldown_until
    with _state_lock:
        _failures = 0
        _cooldown_until = 0.0


def _record_failure() -> None:
    global _failures, _cooldown_until
    with _state_lock:
        _failures += 1
        if _failures >= 3:
            _cooldown_until = time.monotonic() + FAILURE_COOLDOWN_SECONDS


def _post_embed(texts: list, input_type: str, timeout_seconds: float) -> Optional[QueryEmbedding]:
    texts = [str(t) for t in (texts or []) if str(t or "").strip()]
    if not texts:
        return None
    if _in_cooldown():
        logger.warning("rag-embedder skipped (%s): failure cooldown active", input_type)
        return None
    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.post(
                f"{_base_url()}/embed",
                json={"texts": texts, "input_type": input_type},
            )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ValueError("bad embeddings payload")
        model_id = str(data.get("model_id") or "")
        dimensions = int(data.get("dimensions") or 0)
        _record_success()
        return (embeddings, model_id, dimensions)
    except Exception as exc:
        logger.warning("rag-embedder unavailable (input_type=%s): %s", input_type, exc)
        _record_failure()
        return None


def get_query_embedding(text: str) -> Optional[QueryEmbedding]:
    """Request-path поиска: короткий таймаут, fail-fast -> keyword-only."""
    return _post_embed([text], "query", _query_timeout_seconds())


def get_embeddings_for_texts(texts: list) -> Optional[QueryEmbedding]:
    """Celery-батч индексации: длинный таймаут под пачки чанков."""
    return _post_embed(list(texts or []), "passage", _passage_timeout_seconds())


_prefetch_pool = None
_prefetch_pool_lock = threading.Lock()


def prefetch_query_embedding(text: str):
    """Запускает query-эмбеддинг в фоновом треде, пока идёт BM25-полка.

    Поисковый запрос обычно медленнее BM25-ранжирования на малом корпусе; при
    последовательном вызове их latencies складываются (×2 у hybrid-режима).
    Префетч складывает max() вместо sum(). Любая ошибка/таймаут внутри future
    обрабатывается вызывающим кодом как деградация на keyword-only.

    Возвращает Future (result() -> Optional[QueryEmbedding]) либо None при
    невозможности запустить пул.
    """
    global _prefetch_pool
    try:
        with _prefetch_pool_lock:
            if _prefetch_pool is None:
                from concurrent.futures import ThreadPoolExecutor

                _prefetch_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rag-embed-prefetch")
        return _prefetch_pool.submit(get_query_embedding, text)
    except Exception as exc:  # pragma: no cover - оборонительная ветка
        logger.warning("rag-embedder prefetch unavailable: %s", exc)
        return None


def encode_vector(values: Any) -> bytes:
    """[float] -> float32 little-endian bytes для rag_embeddings.vector_data (array('f'), без numpy)."""
    return array("f", [float(v) for v in (values or [])]).tobytes()
