"""Сбор контекста промпта на операцию: фрагмент спеки ($ref-резолв), образцы
тестов того же тега, доступные фикстуры, непокрытые варианты."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
LIVE_SPEC_JSON = REPO_ROOT / "build" / "openapi-live.json"
TESTS_DIR = BACKEND_DIR / "tests"

_SPEC_CACHE: Optional[Dict[str, Any]] = None
_MAX_FRAGMENT_CHARS = 12000
_REF_DEPTH = 6


def load_spec() -> Dict[str, Any]:
    global _SPEC_CACHE
    if _SPEC_CACHE is None:
        _SPEC_CACHE = json.loads(LIVE_SPEC_JSON.read_text(encoding="utf-8"))
    return _SPEC_CACHE


def _resolve_refs(node: Any, components: Dict[str, Any], depth: int = 0, seen: frozenset = frozenset()) -> Any:
    """Резолвит локальные $ref (#/components/...), глубина и циклы ограничены."""
    if depth > _REF_DEPTH:
        return node
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/components/"):
            if ref in seen:
                return {"description": f"(recursive {ref})"}
            parts = ref[len("#/components/"):].split("/")
            target: Any = components
            for part in parts:
                target = (target or {}).get(part)
                if target is None:
                    return node
            merged = {k: v for k, v in node.items() if k != "$ref"}
            resolved = _resolve_refs(target, components, depth + 1, seen | {ref})
            if isinstance(resolved, dict) and merged:
                resolved = {**resolved, **merged}
            return resolved
        return {k: _resolve_refs(v, components, depth, seen) for k, v in node.items()}
    if isinstance(node, list):
        return [_resolve_refs(v, components, depth, seen) for v in node]
    return node


def operation_fragment(method: str, path: str) -> Dict[str, Any]:
    """Фрагмент спеки на операцию с резолвленными $ref, ужатый до лимита."""
    spec = load_spec()
    raw = (spec.get("paths", {}).get(path) or {}).get(method.lower())
    if raw is None:
        raise KeyError(f"операция не найдена в спеке: {method} {path}")
    resolved = _resolve_refs(raw, spec.get("components") or {})
    # components сами не тащим — всё нужное уже разрешено инлайн
    fragment = {path: {method.lower(): resolved}}
    text = json.dumps(fragment, ensure_ascii=False, indent=1)
    if len(text) > _MAX_FRAGMENT_CHARS:
        # ужимаем: выкидываем examples и description'ы второго уровня
        def _strip(n: Any) -> Any:
            if isinstance(n, dict):
                return {k: _strip(v) for k, v in n.items() if k not in {"examples", "example"}}
            if isinstance(n, list):
                return [_strip(v) for v in n]
            return n

        text = json.dumps({path: {method.lower(): _strip(resolved)}}, ensure_ascii=False, indent=1)
    return {"yaml_like": text, "operation_id": raw.get("operationId", "")}


# --- образцы тестов того же тега ------------------------------------------------

_TAG_HINTS = {
    "notes": ["note", "thread"],
    "note-threads": ["note", "thread"],
    "templates": ["template"],
    "process-templates": ["process_template", "template"],
}


def find_sample_tests(tag: str, path: str, max_samples: int = 2, max_chars: int = 6000) -> List[Tuple[str, str]]:
    """1–2 существующих теста того же тега как образец стиля.

    Эвристика: файлы tests/test_*<hint>*.py по тегу; иначе — по сегменту path.
    Берём класс + setUp и 1-2 тестовых метода, ужатые до max_chars.
    """
    hints = list(_TAG_HINTS.get(tag, []))
    seg = path.strip("/").split("/")[1:2]
    hints += [s.replace("_", "-") for s in seg] + seg
    scored: List[Tuple[int, Path]] = []
    for f in sorted(TESTS_DIR.glob("test_*.py")):
        if "llm_generated" in f.parts or "contract" in f.parts:
            continue
        name = f.name.lower()
        score = sum(1 for h in hints if h and h.replace("-", "_") in name)
        if score:
            scored.append((score, f))
    scored.sort(key=lambda t: -t[0])
    samples: List[Tuple[str, str]] = []
    budget = max_chars
    for _score, f in scored[:max_samples]:
        text = f.read_text(encoding="utf-8")
        # setUp + первые тестовые методы
        head = text[: budget // 2]
        samples.append((str(f.relative_to(BACKEND_DIR)), head))
        budget -= len(head)
        if budget <= 0:
            break
    return samples


def fixtures_brief() -> str:
    """Какие фикстуры/хелперы доступны (из conftest + устоявшиеся паттерны)."""
    return (
        "Авто-фикстуры (подключать НЕ надо, работают сами):\n"
        "- tests/conftest.py::isolate_process_db — каждому тесту свежая on-disk SQLite "
        "(PROCESS_DB_PATH выставлен до импорта app). БД чистая на старте теста.\n\n"
        "ТОЧНЫЕ сигнатуры хелперов (не выдумывай другие):\n"
        "- create_user(email: str, password: str) -> dict — user['id'] это str:\n"
        "    from app.auth import create_user, create_access_token\n"
        "    user = create_user('test@example.com', 'password'); uid = str(user['id'])\n"
        "- create_access_token(uid) -> str — headers={'Authorization': f'Bearer {create_access_token(uid)}'}\n"
        "- create_org_record(name: str, created_by: str, org_id: str) — ОБЯЗАТЕЛЬНЫ все 3 аргумента:\n"
        "    from app.storage import create_org_record\n"
        "    create_org_record('Test Org', created_by=uid, org_id='org_test_1')\n"
        "- upsert_org_membership(org_id: str, user_id: str, role: str) — роль 'owner':\n"
        "    from app.storage import upsert_org_membership\n"
        "    upsert_org_membership('org_test_1', uid, 'owner')\n"
        "- project_repo.create_project(name: str, user_id: str, org_id: str) -> str (project_id),\n"
        "  вызывать ТОЛЬКО внутри storage-scope:\n"
        "    from app.storage import push_storage_request_scope, pop_storage_request_scope\n"
        "    from app.repositories import project_repo\n"
        "    scope = push_storage_request_scope(user_id=uid, is_admin=False, org_id=org_id)\n"
        "    try: project_id = project_repo.create_project('P', user_id=uid, org_id=org_id)\n"
        "    finally: pop_storage_request_scope(scope)\n"
        "- BPMN-сессия: get_storage().create(title='S', user_id=uid, org_id=org_id, project_id=project_id) -> session_id\n"
        "  (project_id можно опустить: get_storage().create(title='S', user_id=uid, org_id=org_id))\n"
        "- Workspace и папка (для folder_id/workspace_id):\n"
        "    from app.storage import create_workspace_record, create_workspace_folder\n"
        "    ws = create_workspace_record(org_id, 'WS', created_by=uid); workspace_id = str(ws['id'])\n"
        "    folder = create_workspace_folder(org_id, workspace_id, 'Folder', user_id=uid)\n"
        "    folder_id = str(folder['id'])"
    )


CANONICAL_EXAMPLE = '''\
# Канонический образец рабочего теста (стиль, который ОБЯЗАТЕЛЬНО проходит):
import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.main import app
from app.storage import create_org_record, upsert_org_membership


@pytest.mark.llm_generated
def test_example_endpoint_returns_200():
    user = create_user("llm_gen_example@local", "password")
    uid = str(user["id"])
    org_id = "org_llm_gen_example"
    create_org_record("LLM Gen Org", created_by=uid, org_id=org_id)
    upsert_org_membership(org_id, uid, "owner")
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    client = TestClient(app)

    response = client.get("/api/health", headers=headers)

    assert response.status_code == 200
    assert response.json()  # тело не пустое
'''
