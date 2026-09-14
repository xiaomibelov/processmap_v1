"""E2 (agent-rag-retrieval-citations-v1): RAG-подмешивание в free-answer/schema_overview
и cite-контракт (SourceRef, маркеры [Sn], guard против выдуманных цитат).

Гейты: G1 (кросс-сессионная цитата с корректным source_id), G3 (hit-путь
schema_overview без LLM и без RAG), G4 (degrade без выдуманных цитат).
"""
from __future__ import annotations

import json
import os
import sys
from types import SimpleNamespace
from unittest import mock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from memory.citations import (
    CITATION_INSTRUCTION_MARKER,
    build_source_refs,
    parse_citations,
)
from memory.prompt_builder import PromptBuilder
from schemas import AgentChatIn, AgentChatOut, SourceRef


@pytest.fixture
def admin_user(seed):
    uid = seed.make_user(is_admin=True)
    return {"id": uid, "token": seed.make_token(uid)}


@pytest.fixture
def admin_token(admin_user):
    return admin_user["token"]


@pytest.fixture
def session_with_steps(seed, admin_user):
    return seed.make_session(org_id=seed.DEFAULT_ORG, owner_user_id=admin_user["id"])


@pytest.fixture
def mock_projection():
    with mock.patch("runners.monolith_client.get_projection") as m:
        m.return_value = {
            "ok": True,
            "projection": {
                "steps": [
                    {"id": "step_1", "type": "step", "name_ru": "Step 1", "duration": None, "role": ""},
                    {"id": "step_2", "type": "step", "name_ru": "Step 2", "duration": None, "role": ""},
                ],
                "edges": [{"from": "step_1", "to": "step_2"}],
                "meta": {"session_id": "", "rev": 1, "nodes_count": 2, "schema": 1},
            },
            "projection_digest": "d" * 32,
            "rev": 1,
        }
        yield m


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def _complete_result(text: str):
    return {
        "ok": True,
        "status": "ok",
        "text": text,
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        "provider_id": "p1",
        "model": "m",
        "prompt_version": 1,
        "fallback": False,
        "cached": False,
    }


def _rag_result_b():
    """Чанк из ДРУГОЙ сессии org (сценарий гейта G1)."""
    return {
        "ok": True,
        "results": [
            {
                "chunk_id": "chunk_b_1",
                "score": 1.5,
                "chunk_text": "В сессии B заявку оформляет оператор после приёмки.",
                "source_type": "bpmn_xml",
                "source_id": "sess_b",
                "metadata": {
                    "source_type": "bpmn_xml",
                    "source_id": "sess_b",
                    "session_id": "sess_b",
                    "session_title": "Сессия B: оформление заявки",
                    "element_id": "elem_b_1",
                    "element_name": "Оформить заявку",
                },
            },
        ],
    }


def test_idempotent_replay_returns_sources(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """Повтор с тем же client_turn_id возвращает тот же ответ вместе с sources."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = _rag_result_b()
        fake_complete.return_value = _complete_result("Заявку оформляет оператор [S1].")
        c = TestClient(app)
        body = {"message": "кто оформляет заявку?", "client_turn_id": "ct-123"}
        r1 = c.post(f"/sessions/{session_with_steps}/agent/chat", headers=_auth(admin_token), json=body)
        assert fake_complete.call_count == 1
        r2 = c.post(f"/sessions/{session_with_steps}/agent/chat", headers=_auth(admin_token), json=body)
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["message"] == r1.json()["message"]
    sources2 = body2.get("sources") or []
    assert [s["source_id"] for s in sources2] == ["chunk_b_1"]


# ---------------------------------------------------------------------------
# Модуль citations: unit-контракт
# ---------------------------------------------------------------------------

def test_build_source_refs_maps_chunk_fields():
    refs = build_source_refs(list(_rag_result_b()["results"]))
    assert len(refs) == 1
    ref = refs[0]
    assert ref["source_id"] == "chunk_b_1"
    assert ref["source_type"] == "bpmn_xml"
    assert ref["session_id"] == "sess_b"
    assert ref["session_title"] == "Сессия B: оформление заявки"
    assert ref["element_id"] == "elem_b_1"
    assert ref["element_name"] == "Оформить заявку"
    assert ref["process_layer"] is None  # нет в metadata на main — допустимо
    assert ref["snippet"].startswith("В сессии B")
    assert ref["score"] == 1.5


def test_build_source_refs_snippet_truncated():
    long_text = "x" * 500
    refs = build_source_refs([{"chunk_id": "c1", "chunk_text": long_text, "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}}])
    assert len(refs[0]["snippet"]) <= 200


def test_parse_citations_strips_markers_and_keeps_used():
    refs = build_source_refs([
        {"chunk_id": "c1", "chunk_text": "текст один", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
        {"chunk_id": "c2", "chunk_text": "текст два", "source_type": "bpmn_xml", "source_id": "s2", "metadata": {}},
    ])
    clean, used = parse_citations("Ответ со ссылкой [S2] и [S1].", refs)
    assert "[S2]" not in clean and "[S1]" not in clean
    assert "Ответ со ссылкой" in clean
    assert [r["source_id"] for r in used] == ["c2", "c1"]  # порядок первого появления


def test_parse_citations_drops_out_of_range_markers():
    """G4: маркер вне переданного диапазона — вырезается, в sources не попадает."""
    refs = build_source_refs([
        {"chunk_id": "c1", "chunk_text": "текст", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
    ])
    clean, used = parse_citations("Ответ [S1] и выдуманный [S99].", refs)
    assert "[S99]" not in clean
    assert "[S1]" not in clean
    assert [r["source_id"] for r in used] == ["c1"]


def test_parse_citations_drops_multidigit_out_of_range_markers():
    """[S12345] — вне любого диапазона: вырезается, а не остаётся в тексте."""
    refs = build_source_refs([
        {"chunk_id": "c1", "chunk_text": "т", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
    ])
    clean, used = parse_citations("Ответ [S12345] конец.", refs)
    assert "[S12345]" not in clean
    assert clean == "Ответ  конец." or clean == "Ответ конец."
    assert used == []


def test_parse_citations_preserves_line_indentation():
    """Схлопывание пробелов не должно ломать индентацию markdown/кода."""
    refs = build_source_refs([
        {"chunk_id": "c1", "chunk_text": "т", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
    ])
    text = "Ввод:\n\n    код с отступом\n    ещё строка [S1]\n\nКонец."
    clean, _ = parse_citations(text, refs)
    assert "    код с отступом" in clean
    assert "    ещё строка" in clean
    assert "[S1]" not in clean


def test_build_source_refs_dedupes_chunk_ids():
    results = [
        {"chunk_id": "c1", "chunk_text": "а", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
        {"chunk_id": "c1", "chunk_text": "а дубль", "source_type": "bpmn_xml", "source_id": "s1", "metadata": {}},
        {"chunk_id": "c2", "chunk_text": "б", "source_type": "bpmn_xml", "source_id": "s2", "metadata": {}},
    ]
    refs = build_source_refs(results)
    assert [r["source_id"] for r in refs] == ["c1", "c2"]


def test_marker_stripper_handles_split_deltas():
    """SSE-фильтр: маркер, разорванный между дельтами, не попадает в токены."""
    from memory.citations import MarkerStripper

    stripper = MarkerStripper()
    out = stripper.feed("Ответ [S")
    out += stripper.feed("1] продолжение [S2")
    out += stripper.feed("2] хвост")
    out += stripper.flush()
    assert "[S" not in out and "]" not in out.replace("конец", "")
    assert "Ответ" in out and "продолжение" in out and "хвост" in out


# ---------------------------------------------------------------------------
# Cite-контракт схемы
# ---------------------------------------------------------------------------

def test_agent_chat_out_sources_schema_roundtrip():
    out = AgentChatOut(
        ok=True,
        status="ok",
        error="",
        message="Ответ",
        sources=[
            SourceRef(
                source_id="chunk_b_1",
                source_type="bpmn_xml",
                session_id="sess_b",
                session_title="Сессия B",
                snippet="фрагмент",
            )
        ],
        projection_digest="d" * 32,
    )
    payload = json.loads(out.model_dump_json())
    assert payload["sources"][0]["source_id"] == "chunk_b_1"
    assert payload["sources"][0]["session_id"] == "sess_b"
    assert payload["sources"][0]["process_layer"] is None


def test_agent_chat_out_sources_default_none():
    out = AgentChatOut(ok=True, status="ok", error="", message="x")
    assert out.sources is None
    assert json.loads(out.model_dump_json())["sources"] is None


# ---------------------------------------------------------------------------
# G1: free-answer с кросс-сессионной цитатой
# ---------------------------------------------------------------------------

def test_free_answer_branch_with_rag_citations(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """G1: вопрос в сессии A, отрывок из сессии B → ответ содержит цитату с source_id чанка B."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = _rag_result_b()
        fake_complete.return_value = _complete_result("Заявку оформляет оператор [S1].")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "кто оформляет заявку в процессе приёмки?"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert "[S1]" not in body["message"]
    sources = body.get("sources") or []
    assert len(sources) >= 1, "G1: ответ free-answer не содержит цитат"
    assert sources[0]["source_id"] == "chunk_b_1"
    assert sources[0]["session_id"] == "sess_b"
    # Промпт модели получил отрывки с нумерацией и инструкцией цитировать
    sent_prompt = fake_complete.call_args.kwargs["payload"]["input"]
    assert "[S1]" in sent_prompt
    assert CITATION_INSTRUCTION_MARKER in sent_prompt
    assert "Оформить заявку" in sent_prompt


def test_free_answer_no_hallucinated_citations(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """G4: модель процитировала несуществующий источник — маркер вырезан, в sources не попал."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = _rag_result_b()
        fake_complete.return_value = _complete_result("Так говорит [S1], а ещё [S42] якобы.")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "кто оформляет заявку?"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "[S42]" not in body["message"]
    sources = body.get("sources") or []
    assert [s["source_id"] for s in sources] == ["chunk_b_1"]


def test_free_answer_empty_rag_degrades_without_citations(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """G4: пустой корпус → ответ как раньше, без выдуманных цитат."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {"ok": True, "results": []}
        fake_complete.return_value = _complete_result("Свободный ответ без источников.")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "привет"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "Свободный ответ без источников."
    assert not body.get("sources")
    sent_prompt = fake_complete.call_args.kwargs["payload"]["input"]
    assert CITATION_INSTRUCTION_MARKER not in sent_prompt
    assert "[S1]" not in sent_prompt


def test_free_answer_rag_error_degrades(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """G4: поиск недоступен (MonolithError) → free-answer отвечает без источников."""
    mock_route_intent_smalltalk.return_value = "smalltalk"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.side_effect = RuntimeError("monolith down")
        fake_complete.return_value = _complete_result("Ответ несмотря на недоступный поиск.")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "привет"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["message"] == "Ответ несмотря на недоступный поиск."
    assert not body.get("sources")


# ---------------------------------------------------------------------------
# doc_qa / structured_fact_qa: единый cite-контракт
# ---------------------------------------------------------------------------

def test_doc_qa_citations_contract(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "doc_qa"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {
            "ok": True,
            "results": [
                {"chunk_id": "c_doc_1", "score": 0.9, "chunk_text": "Отрывок документации",
                 "source_type": "bpmn_xml", "source_id": session_with_steps,
                 "metadata": {"session_id": session_with_steps, "session_title": "Текущая"}},
            ],
        }
        fake_complete.return_value = _complete_result("По документации [S1]: так.")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "как оформить заявку"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "doc_qa"
    sources = body.get("sources") or []
    assert [s["source_id"] for s in sources] == ["c_doc_1"]
    sent_prompt = fake_complete.call_args.kwargs["payload"]["input"]
    assert CITATION_INSTRUCTION_MARKER in sent_prompt


def test_structured_fact_qa_citations_contract(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "structured_fact_qa"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag:
        fake_rag.return_value = {
            "ok": True,
            "results": [
                {"chunk_id": "c_fact_1", "score": 0.7, "chunk_text": "Свойство X допускает значения 1..5",
                 "source_type": "property_dictionary", "source_id": "propdict",
                 "metadata": {"source_type": "property_dictionary"}},
            ],
        }
        fake_complete.return_value = _complete_result("Значения 1..5 [S1].")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "какие значения допускает свойство X?"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "structured_fact_qa"
    sources = body.get("sources") or []
    assert [s["source_id"] for s in sources] == ["c_fact_1"]
    assert sources[0]["source_type"] == "property_dictionary"


# ---------------------------------------------------------------------------
# schema_overview: miss-путь с RAG, hit-путь не тронут
# ---------------------------------------------------------------------------

def test_schema_overview_cold_includes_rag_citations(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    mock_route_intent_smalltalk.return_value = "schema_overview"
    with mock.patch("memory.chat.complete") as fake_complete, mock.patch("memory.chat.search_rag") as fake_rag, \
         mock.patch("memory.chat.schedule_memory_update"):
        fake_rag.return_value = _rag_result_b()
        fake_complete.return_value = _complete_result("Краткое описание [S1] схемы.")
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "расскажи про схему"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["action"] == "schema_overview"
    sources = body.get("sources") or []
    assert len(sources) >= 1
    # miss-путь ищет по текущей сессии
    assert fake_rag.call_args.args[1] == session_with_steps
    assert fake_rag.call_args.kwargs.get("source_type") == "bpmn_xml"


def test_schema_overview_hit_path_performs_no_rag(admin_token, session_with_steps, mock_projection, mock_route_intent_smalltalk):
    """G3: warm-hit — ни одного RAG-вызова (0-LLM путь не деградирует)."""
    from memory.schema_memory import save_schema_memory

    save_schema_memory(session_with_steps, "org_default", "Тёплое summary", [], [], "d" * 32)
    mock_route_intent_smalltalk.return_value = "schema_overview"
    with mock.patch("memory.chat.search_rag") as fake_rag:
        c = TestClient(app)
        r = c.post(
            f"/sessions/{session_with_steps}/agent/chat",
            headers=_auth(admin_token),
            json={"message": "расскажи про схему"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "Тёплое summary"
    assert body["usage"].get("cached") is True
    fake_rag.assert_not_called()


# ---------------------------------------------------------------------------
# Prompt-уровень
# ---------------------------------------------------------------------------

def _ctx(projection_steps=None):
    steps = projection_steps or [{"id": "step_1", "type": "step", "name_ru": "S1", "duration": None, "role": ""}]
    return SimpleNamespace(
        session=SimpleNamespace(project_id="p1"),
        projection={"steps": steps, "edges": [], "meta": {"schema": 1, "rev": 1}},
        digest="d" * 32,
        history=[],
    )


def test_prompt_builder_free_answer_includes_rag_excerpts():
    payload = AgentChatIn(message="вопрос")
    rag_results = [
        {"chunk_id": "c1", "chunk_text": "текст отрывка", "source_type": "bpmn_xml",
         "source_id": "s1", "metadata": {"session_title": "Сессия 1"}},
    ]
    kwargs = PromptBuilder.build("smalltalk", _ctx(), payload, rag_results=rag_results)
    prompt = kwargs["payload"]["input"]
    assert "[S1]" in prompt
    assert CITATION_INSTRUCTION_MARKER in prompt
    assert "текст отрывка" in prompt
    assert "Сессия 1" in prompt


def test_prompt_builder_free_answer_without_rag_has_no_instruction():
    payload = AgentChatIn(message="вопрос")
    kwargs = PromptBuilder.build("smalltalk", _ctx(), payload, rag_results=[])
    prompt = kwargs["payload"]["input"]
    assert CITATION_INSTRUCTION_MARKER not in prompt
    assert "[S1]" not in prompt


def test_prompt_builder_schema_overview_includes_rag_on_miss():
    payload = AgentChatIn(message="расскажи про схему")
    rag_results = [
        {"chunk_id": "c1", "chunk_text": "контекст чанка", "source_type": "bpmn_xml",
         "source_id": "s1", "metadata": {"element_id": "e1", "element_name": "Узел 1"}},
    ]
    kwargs = PromptBuilder.build("schema_overview", _ctx(), payload, rag_results=rag_results)
    prompt = kwargs["payload"]["input"]
    assert "контекст чанка" in prompt


def test_trim_compact_projection_with_rag_many_nodes():
    """100-node fallback не ломается при rag_chunks: бюджет проекции соблюдён."""
    steps = [{"id": f"n{i}", "type": "task", "name_ru": f"Узел {i}", "duration": i, "role": "r"} for i in range(150)]
    ctx = _ctx(projection_steps=steps)
    payload = AgentChatIn(message="вопрос")
    rag_chunks = [
        {"chunk_id": f"c{i}", "chunk_text": "x" * 100, "metadata": {"element_id": f"n{i}"}}
        for i in range(5)
    ]
    builder = PromptBuilder()
    assembly = builder.build_processman_prompt(ctx, payload, rag_chunks=rag_chunks)
    from memory.prompt_builder import estimate_tokens

    assert estimate_tokens(assembly.compact_projection_text) <= builder.config.max_projection_tokens
    assert "Сообщение пользователя" in assembly.user_prompt


def test_rag_trim_ladder_respects_total_budget():
    """G2: при малом общем бюджете RAG-блок деградирует по лестнице, промпт в бюджете."""
    from memory.prompt_builder import PromptBudgetConfig, estimate_tokens

    ctx = _ctx()
    payload = AgentChatIn(message="вопрос")
    rag_results = [
        {"chunk_id": f"c{i}", "chunk_text": "y" * 400, "source_type": "bpmn_xml",
         "source_id": f"s{i}", "metadata": {"session_title": f"Сессия {i}"}}
        for i in range(4)
    ]
    # Бюджета хватает только на заголовки: блок либо titles-only, либо отключён,
    # но общий промпт обязан уложиться в max_total_prompt_tokens.
    config = PromptBudgetConfig(max_total_prompt_tokens=220)
    builder = PromptBuilder(config=config)
    assembly = builder.build_processman_prompt(ctx, payload, rag_chunks=rag_results)
    assert assembly.estimated_prompt_tokens <= config.max_total_prompt_tokens
    assert len(assembly.rag_refs) <= 4
    if assembly.rag_refs:
        # Если блок есть — это titles-only (отрывки не влезли бы в бюджет).
        assert "y" * 50 not in assembly.user_prompt
