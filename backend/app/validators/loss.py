from __future__ import annotations

from typing import List, Optional, Dict, Any

from ..models import Node, Question


LOSS_WORDS = ("списан", "списание", "утилиз", "брак", "потер", "пролил", "вылил", "испор", "сгорел")


LOSS_REASON_OPTIONS = [
    "Нарушение технологии",
    "Ошибка персонала",
    "Брак сырья/поставки",
    "Переварили/сгорело/пересол",
    "Нарушение хранения/температуры",
    "Ошибка маркировки/этикетки",
    "Санитарные требования",
    "Другое",
]

RECORDED_IN_OPTIONS = [
    "Бумажный журнал",
    "1C/ERP/учётная система",
    "Таблица/Google Sheets",
    "Внутренний чат/сообщение",
    "Акт/фотофиксация",
    "Не фиксируется",
    "Другое",
]


def _is_loss(n: Node) -> bool:
    if n.type == "loss_event":
        return True
    t = (n.title or "").lower()
    return any(w in t for w in LOSS_WORDS)


def _loss_filled(n: Node) -> bool:
    p = n.parameters or {}
    loss = p.get("loss") or {}
    if not isinstance(loss, dict):
        return False
    ok = True
    ok = ok and bool((loss.get("reason") or "").strip())
    ok = ok and bool((loss.get("volume") or "").strip())
    ok = ok and bool((loss.get("approved_by") or "").strip())
    ok = ok and bool((loss.get("recorded_in") or "").strip())
    return ok


def build_loss_questions(nodes: List[Node]) -> List[Question]:
    out: List[Question] = []
    for n in nodes:
        if not _is_loss(n):
            continue

        p = n.parameters or {}
        loss = p.get("loss") if isinstance(p.get("loss"), dict) else {}
        reason = (loss.get("reason") or "").strip()
        volume = (loss.get("volume") or "").strip()
        approved_by = (loss.get("approved_by") or "").strip()
        recorded_in = (loss.get("recorded_in") or "").strip()
        evidence = (loss.get("evidence") or "").strip()

        if not reason:
            out.append(
                Question(
                    id=f"loss_reason_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Укажи причину (и при необходимости уточни).",
                    options=list(LOSS_REASON_OPTIONS),
                    target={"field": "parameters.loss.reason", "mode": "set", "transform": "text"},
                )
            )

        if not volume:
            out.append(
                Question(
                    id=f"loss_volume_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Сколько списали? (пример: 3 л, 1.5 кг, 2 шт)",
                    options=[],
                    target={"field": "parameters.loss.volume", "mode": "set", "transform": "text"},
                )
            )

        if not approved_by:
            out.append(
                Question(
                    id=f"loss_approved_by_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Кто утвердил списание? (роль/ФИО/должность)",
                    options=[],
                    target={"field": "parameters.loss.approved_by", "mode": "set", "transform": "text"},
                )
            )

        if not recorded_in:
            out.append(
                Question(
                    id=f"loss_recorded_in_{n.id}",
                    node_id=n.id,
                    issue_type="CRITICAL",
                    question=f"Списание/потеря: «{n.title}». Где фиксируется списание?",
                    options=list(RECORDED_IN_OPTIONS),
                    target={"field": "parameters.loss.recorded_in", "mode": "set", "transform": "text"},
                )
            )

        if not evidence:
            out.append(
                Question(
                    id=f"loss_evidence_{n.id}",
                    node_id=n.id,
                    issue_type="MISSING",
                    question=f"Списание/потеря: «{n.title}». Какие доказательства/артефакты есть? (фото/акт/номер записи)",
                    options=[],
                    target={"field": "parameters.loss.evidence", "mode": "set", "transform": "text"},
                )
            )

    return out


def loss_report(nodes: List[Node]) -> dict:
    rows = []
    open_rows = []
    for n in nodes:
        if not _is_loss(n):
            continue
        loss = (n.parameters or {}).get("loss") or {}
        if not isinstance(loss, dict):
            loss = {}
        row = {
            "id": n.id,
            "title": n.title,
            "actor_role": n.actor_role,
            "loss": loss,
        }
        rows.append(row)
        if not _loss_filled(n):
            open_rows.append({"id": n.id, "title": n.title})
    return {"nodes": rows, "open": open_rows, "open_count": len(open_rows)}
