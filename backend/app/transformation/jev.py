"""Jev (TypeSafe AI) — vendor-изолированный адаптер каскада классификации E3.5.

ADR: Decisions/ADR-Jev-Classifier-for-TO-BE-Transformation.md (условный допуск).
Live-фаза заgated (DPA/доступ к вендору); без ключа/с JEV_MOCK=1 работает
mock-провайдер — весь каскад проходим без сети.

Поведение при любом сбое: возвращает {} — upstream продолжает существующий
путь (локальная LLM → open_question). Никогда не падает.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .jev_state import build_jev_state

# Порог автопринятия Jev-решения без LLM-арбитража (τ_auto, ADR/INTEGRATION).
JEV_AUTO_CONFIDENCE = 0.90

_BREAKER = {"failures": 0, "open_until": 0.0}


class JevUnavailable(RuntimeError):
    """Любой сбой вызова Jev: таймаут, 5xx, DNS, TLS, невалидная схема."""


@dataclass(frozen=True)
class JevChoice:
    rule_id: str
    confidence: float


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name) or default)
    except ValueError:
        return default


def jev_enabled() -> bool:
    """JEV_ENABLED=1 — включить каскад. Default: 0 (off-by-default, ADR)."""
    return os.environ.get("JEV_ENABLED", "0").strip().lower() in {"1", "true", "yes"}


def reset_breaker() -> None:
    _BREAKER["failures"] = 0
    _BREAKER["open_until"] = 0.0


def _breaker_allows() -> bool:
    return time.monotonic() >= _BREAKER["open_until"]


def _record_failure() -> None:
    _BREAKER["failures"] += 1
    if _BREAKER["failures"] >= _env_int("JEV_BREAKER_FAILURES", 3):
        _BREAKER["open_until"] = time.monotonic() + _env_int("JEV_CIRCUIT_BREAKER_MINUTES", 5) * 60.0


class MockJevProvider:
    """Детерминированный mock. responses: {element_id: (rule_id, confidence)}.

    enforce_candidates=True — отбрасывать выбор вне candidates факта
    (моделирует анти-галлюцинацию tie-арбитража на стороне вендора).
    """

    def __init__(self, responses: Optional[Dict[str, Tuple[str, float]]] = None, *, enforce_candidates: bool = False):
        self.responses = dict(responses or {})
        self.enforce_candidates = enforce_candidates
        self.calls = 0

    def __call__(self, states: List[Dict[str, Any]], rules: List[Dict[str, Any]]) -> Dict[str, JevChoice]:
        self.calls += 1
        known = {r["id"] for r in rules}
        out: Dict[str, JevChoice] = {}
        for state in states:
            element = state.get("element") or {}
            element_id = str(element.get("element_id") or "")
            hit = self.responses.get(element_id)
            if not hit:
                continue  # честное «не знаю» → upstream-арбитраж
            rule_id, confidence = hit
            if rule_id not in known:
                continue  # анти-галлюцинация: rule_id ∉ правил
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                continue
            if not 0.0 <= confidence <= 1.0:
                continue
            if self.enforce_candidates:
                candidate_ids = {c.get("rule_id") for c in state.get("candidates") or []}
                if rule_id not in candidate_ids:
                    continue  # выбор вне кандидатов факта
            out[element_id] = JevChoice(rule_id=rule_id, confidence=confidence)
        return out


class HttpJevProvider:
    """Live-провайдер (stdlib urllib, без новых зависимостей).

    Формат запроса/ответа — по signature-контракту INTEGRATION.md контура
    audit/jev-tobe-classifier-v2; pin версии через X-API-Version. Любой сбой
    → JevUnavailable (нет молчаливых fallback'ов внутри адаптера).
    """

    def __init__(self, base_url: str, api_key: str, timeout_ms: int):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_ms = timeout_ms

    def __call__(self, states: List[Dict[str, Any]], rules: List[Dict[str, Any]]) -> Dict[str, JevChoice]:
        body = json.dumps({"items": states}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/v1/choice",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-API-Version": "v1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_ms / 1000.0) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 — любой сбой = недоступность
            raise JevUnavailable(str(exc)) from exc
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise JevUnavailable("invalid response schema")
        known = {r["id"] for r in rules}
        out: Dict[str, JevChoice] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            element_id = str(item.get("element_id") or "")
            rule_id = item.get("rule_id")
            if not element_id or rule_id not in known:
                continue  # анти-галлюцинация: неизвестный rule_id отбрасывается
            try:
                confidence = float(item.get("confidence"))
            except (TypeError, ValueError):
                continue
            if not 0.0 <= confidence <= 1.0:
                continue
            out[element_id] = JevChoice(rule_id=rule_id, confidence=confidence)
        return out


def _default_provider() -> Callable[[List[Dict[str, Any]], List[Dict[str, Any]]], Dict[str, JevChoice]]:
    """Провайдер по умолчанию: mock без ключа или при JEV_MOCK=1, иначе HTTP."""
    if os.environ.get("JEV_MOCK", "0").strip() == "1" or not os.environ.get("JEV_API_KEY"):
        return MockJevProvider()
    return HttpJevProvider(
        base_url=os.environ.get("JEV_BASE_URL", ""),
        api_key=os.environ["JEV_API_KEY"],
        timeout_ms=_env_int("JEV_TIMEOUT_MS", 800),
    )


def match_with_jev(
    facts: List[Dict[str, Any]],
    rules: List[Dict[str, Any]],
    provider: Optional[Callable[[List[Dict[str, Any]], List[Dict[str, Any]]], Dict[str, JevChoice]]] = None,
    tie_candidates: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, JevChoice]:
    """Jev-Choice по нераспознанным задачам. Возвращает {element_id: JevChoice}.

    Любой сбой (таймаут/5xx/DNS/схема/breaker) → {} — caller уходит в
    существующий каскад (локальная LLM → open_question). Никогда не падает.
    Автопринятие решает caller по JEV_AUTO_CONFIDENCE.
    """
    if not jev_enabled() or not facts or not _breaker_allows():
        return {}
    states = [
        build_jev_state(f, rules, candidate_ids=(tie_candidates or {}).get(f["id"]))
        for f in facts
    ]
    call = provider or _default_provider()
    attempts = 1 + _env_int("JEV_MAX_RETRIES", 1)
    for _attempt in range(attempts):
        try:
            result = call(states, rules)
        except Exception:  # noqa: BLE001 — инвариант: каскад не падает
            continue
        _BREAKER["failures"] = 0
        known = {r["id"] for r in rules}
        return {
            element_id: choice
            for element_id, choice in result.items()
            if choice.rule_id in known and 0.0 <= choice.confidence <= 1.0
        }
    _record_failure()
    return {}
