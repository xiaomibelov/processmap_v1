"""fix/rag-retrieval-p0-pack-v1: list_turns обязан отдавать ПОСЛЕДНИЕ N ходов
в хронологическом порядке (баг agent-history-last-n: ASC + LIMIT отдавал
первые N ходов, агент «помнил» начало диалога и забывал свежие реплики).
"""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from memory.memory_store import append_turn, list_turns


def _seed(session_id: str, user_id: str, org_id: str, n: int) -> None:
    for i in range(n):
        append_turn(
            session_id=session_id,
            user_id=user_id,
            org_id=org_id,
            role="user" if i % 2 == 0 else "assistant",
            content_json={"text": f"turn-{i:03d}"},
        )


def test_list_turns_returns_last_n_in_chronological_order():
    sid = f"sess-{uuid.uuid4().hex}"
    uid = f"user-{uuid.uuid4().hex}"
    _seed(sid, uid, "org_default", 60)

    turns = list_turns(sid, uid, "org_default", limit=50)

    texts = [str((t.content or {}).get("text") or "") for t in turns]
    assert len(turns) == 50
    # Последние 50 из 60: ходы 010..059, старые (000..009) отсутствуют.
    assert "turn-000" not in texts
    assert "turn-009" not in texts
    assert texts[0] == "turn-010"
    assert texts[-1] == "turn-059"
    # Хронологический порядок сохранён.
    assert texts == [f"turn-{i:03d}" for i in range(10, 60)]


def test_list_turns_under_limit_returns_all_chronological():
    sid = f"sess-{uuid.uuid4().hex}"
    uid = f"user-{uuid.uuid4().hex}"
    _seed(sid, uid, "org_default", 5)

    turns = list_turns(sid, uid, "org_default", limit=50)

    texts = [str((t.content or {}).get("text") or "") for t in turns]
    assert texts == [f"turn-{i:03d}" for i in range(5)]
