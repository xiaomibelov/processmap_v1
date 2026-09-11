"""Единая точка wiring'а app-provided stubs overlay_cache.

Контур fix/overlay-render-notimplemented: stubs overlay_cache monkeypatch'атся
при импорте _legacy_main (API-процесс), но celery-worker _legacy_main не
импортирует → render_overlay_task падал с NotImplementedError (~240 раз/сутки
на prod). Этот модуль — каноническая реализация wiring'а: его вызывают и
_legacy_main (API), и celery_app (worker).

Зависимости (_legacy_load_session_scoped, _overlay_interview_annotations_on_bpmn_xml,
_compute_overlays_json в _legacy_main; _collect_interview_comments в exporters.bpmn)
импортируются ЛЕНИВО внутри тел функций: импорт god-module _legacy_main на
уровне модуля подтянул бы routes/tasks side-effects в воркер.
"""
from __future__ import annotations

from typing import Any

from . import overlay_cache as _oc_mod


def _wired_fetch_session_bpmn(sid: str, request: Any = None) -> str:
    from ._legacy_main import _legacy_load_session_scoped

    s = _legacy_load_session_scoped(sid, request)[0]
    return str(getattr(s, "bpmn_xml", "") or "")


def _wired_fetch_annotations(sid: str, request: Any = None) -> list:
    from ._legacy_main import _legacy_load_session_scoped
    from .exporters.bpmn import _collect_interview_comments

    s = _legacy_load_session_scoped(sid, request)[0]
    model = s.model_dump() if hasattr(s, "model_dump") else {}
    return _collect_interview_comments(model, model.get("nodes") or [])


def _wired_compute_overlays_json(sid: str, request: Any = None) -> list[dict[str, Any]]:
    from ._legacy_main import _compute_overlays_json, _legacy_load_session_scoped

    s = _legacy_load_session_scoped(sid, request)[0]
    if not s:
        return []
    xml = str(getattr(s, "bpmn_xml", "") or "")
    if not xml:
        return []
    return _compute_overlays_json(s, xml)


def _wired_render_overlay_xml(sid: str, bpmn_xml: str, request: Any = None) -> str:
    from ._legacy_main import (
        _legacy_load_session_scoped,
        _overlay_interview_annotations_on_bpmn_xml,
    )

    s = _legacy_load_session_scoped(sid, request)[0]
    if not s:
        return bpmn_xml
    return _overlay_interview_annotations_on_bpmn_xml(s, bpmn_xml)


def wire() -> None:
    """Заменить четыре app-provided stub'а overlay_cache на wired-реализации."""
    _oc_mod.fetch_session_bpmn = _wired_fetch_session_bpmn
    _oc_mod.fetch_annotations = _wired_fetch_annotations
    _oc_mod.compute_overlays_json = _wired_compute_overlays_json
    _oc_mod.render_overlay_xml = _wired_render_overlay_xml
