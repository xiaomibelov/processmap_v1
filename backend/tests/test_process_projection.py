"""LLM1 — тесты сериализатора проекции процесса (app.ai.process_projection).

Критерии PLAN.md:
- проекция из ui_model сессии (НЕ сырой BPMN-XML), стабильный md5;
- экономия №1: размер проекции ≤ 4KB на эталонной схеме;
- digest не зависит от session_id/rev (неизменная схема = тот же кэш-ключ).

Чистые unit-тесты без БД. Запуск из корня репо:
python -m pytest backend/tests/test_process_projection.py -q
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from backend.app.ai.process_projection import (  # noqa: E402
    PROJECTION_SCHEMA_VERSION,
    build_process_projection,
    projection_digest,
    projection_size_bytes,
)
from backend.app.models import Edge, Node, Session  # noqa: E402


def _reference_session(session_id: str = "sess_ref", version: int = 3) -> Session:
    """Эталонная схема ~20 шагов (мойка/приготовление) — репрезентативный размер."""
    nodes = [
        Node(id=f"step_{i:02d}", type="step", title=f"Шаг {i}: операция номер {i}",
             actor_role="technologist" if i % 2 else "operator",
             duration_min=5 + i,
             parameters={"operation_code": "move"} if i % 3 == 0 else {})
        for i in range(1, 21)
    ]
    edges = [Edge(from_id=f"step_{i:02d}", to_id=f"step_{i + 1:02d}") for i in range(1, 20)]
    return Session(id=session_id, title="Эталон", nodes=nodes, edges=edges, version=version)


def test_projection_shape():
    proj = build_process_projection(_reference_session())
    assert set(proj.keys()) == {"steps", "edges", "meta"}
    assert proj["meta"] == {
        "session_id": "sess_ref", "rev": 3, "nodes_count": 20,
        "schema": PROJECTION_SCHEMA_VERSION,
    }
    step = proj["steps"][0]  # i=1 → без operation_code
    assert set(step.keys()) == {"id", "type", "name_ru", "duration", "role"}
    # operation_code присутствует, когда задан (i=3)
    assert proj["steps"][2]["operation_code"] == "move"
    assert proj["edges"][0] == {"from": "step_01", "to": "step_02"}


def test_projection_digest_stable():
    a = build_process_projection(_reference_session())
    b = build_process_projection(_reference_session())
    assert projection_digest(a) == projection_digest(b)
    assert len(projection_digest(a)) == 32  # md5 hex


def test_projection_digest_ignores_session_id_and_rev():
    """Неизменная схема → тот же digest (критерий «повтор = 0 токенов»)."""
    a = build_process_projection(_reference_session(session_id="sess_a", version=1))
    b = build_process_projection(_reference_session(session_id="sess_b", version=99))
    assert projection_digest(a) == projection_digest(b)


def test_projection_digest_changes_with_graph():
    a = build_process_projection(_reference_session())
    changed = _reference_session()
    changed.nodes[0].title = "Другое название"
    b = build_process_projection(changed)
    assert projection_digest(a) != projection_digest(b)


def test_projection_size_within_4kb():
    """Экономия №1: ≤ 4KB на эталонной схеме из 20 шагов."""
    proj = build_process_projection(_reference_session())
    size = projection_size_bytes(proj)
    assert size <= 4096, f"проекция {size} байт > 4KB"


def test_projection_empty_session():
    proj = build_process_projection(Session(id="empty", title="Пустая"))
    assert proj["steps"] == [] and proj["edges"] == []
    assert proj["meta"]["nodes_count"] == 0
    assert projection_digest(proj)  # digest считается и для пустой схемы
