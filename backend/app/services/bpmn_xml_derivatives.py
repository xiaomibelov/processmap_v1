"""Parse-once производные BPMN XML с LRU-кэшем по sha1(payload).

Контур fix/save-put-parse-once-and-publish-scan-v1 (F1). Аудит
audit/backend-save-put-latency-v1 показал 5-6 полных парсингов одного и того
же XML на каждый PUT /api/sessions/{id}/bpmn (~58ms CPU, 46% handler-CPU).
Этот модуль парсит XML один раз и из одного дерева вычисляет все производные,
которые раньше считались независимыми парсерами:

- flow_meta            (ex _legacy_main._collect_sequence_flow_meta)
- activity_count       (ex _legacy_main._count_bpmn_activities)
- camunda_extensions   (ex camunda_meta_utils.extract_camunda_extensions_from_bpmn_xml)
- subprocess_elements  (ex bpmn_navigation.find_subprocess_elements)
- child_session_element_ids (ex bpmn_navigation.find_child_session_element_ids)
- parseable            (ex session_service._bpmn_xml_parseable)

Кэш LRU (16 записей) по sha1 побайтово равного payload даёт повторное
использование на retry одного PUT идентичного тела.

Паритет поведения: производные функции-обёртки оставлены нетронутыми; при
не-parseable XML значения совпадают с дефолтными ветками обёрток
(пустые структуры / 0 / False). Парсинг — ET.fromstring(raw.encode("utf-8")),
как в extract_camunda_extensions_from_bpmn_xml (str-input ведёт себя
идентично для реальных payload).
"""
from __future__ import annotations

import copy
import hashlib
import threading
import xml.etree.ElementTree as ET
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

_CACHE_MAX_ENTRIES = 16

_EMPTY_FLOW_META: Dict[str, Any] = {
    "flow_ids": set(),
    "node_ids": set(),
    "flow_source_by_id": {},
    "flow_target_by_id": {},
    "outgoing_by_source": {},
    "gateway_mode_by_node": {},
}


@dataclass
class BpmnXmlDerivatives:
    """Производные одного XML, вычисленные из единственного парсинга."""

    sha1: str
    parseable: bool
    flow_meta: Dict[str, Any] = field(default_factory=lambda: copy.deepcopy(_EMPTY_FLOW_META))
    activity_count: int = 0
    camunda_extensions: Dict[str, Any] = field(default_factory=dict)
    subprocess_elements: List[Dict[str, Optional[str]]] = field(default_factory=list)
    child_session_element_ids: List[str] = field(default_factory=list)


_cache: "OrderedDict[str, BpmnXmlDerivatives]" = OrderedDict()
_cache_lock = threading.Lock()


def bpmn_xml_sha1(xml_text: Any) -> str:
    raw = str(xml_text or "")
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _compute(sha: str, xml_text: str) -> BpmnXmlDerivatives:
    # Ленивые импорты: app._legacy_main импортирует полприложения,
    # на этапе загрузки модуля это создало бы циклы.
    from app._legacy_main import (
        _collect_sequence_flow_meta_from_root,
        _count_bpmn_activities_from_root,
    )
    from app.camunda_meta_utils import extract_camunda_extensions_from_root
    from app.services.bpmn_navigation import (
        find_child_session_element_ids_from_root,
        find_subprocess_elements_from_root,
    )

    root: Optional[ET.Element] = None
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except Exception:
        root = None

    if root is None:
        return BpmnXmlDerivatives(sha1=sha, parseable=False)

    return BpmnXmlDerivatives(
        sha1=sha,
        parseable=True,
        flow_meta=_collect_sequence_flow_meta_from_root(root),
        activity_count=_count_bpmn_activities_from_root(root),
        camunda_extensions=extract_camunda_extensions_from_root(root),
        subprocess_elements=find_subprocess_elements_from_root(root),
        child_session_element_ids=find_child_session_element_ids_from_root(root),
    )


def get_bpmn_xml_derivatives(xml_text: Any) -> BpmnXmlDerivatives:
    """Производные XML: один парсинг на уникальный payload + LRU-hit на retry.

    Возвращает экземпляр с копиями структур — мутирование результата
    вызывающим кодом не портит кэш (паритет с «свежими» результатами
    исходных обёрток).
    """
    raw = str(xml_text or "")
    sha = bpmn_xml_sha1(raw)
    with _cache_lock:
        hit = _cache.get(sha)
        if hit is not None:
            _cache.move_to_end(sha)
            snapshot = copy.deepcopy(hit)
            return snapshot
        computed = _compute(sha, raw)
        _cache[sha] = copy.deepcopy(computed)
        while len(_cache) > _CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)
        return computed


def clear_bpmn_xml_derivatives_cache() -> None:
    with _cache_lock:
        _cache.clear()
