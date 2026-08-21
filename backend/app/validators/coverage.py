from __future__ import annotations

import re
from typing import List, Optional, Dict, Any

from ..models import Node, Question


HEAT_VERBS = ("включ", "нагр", "кип", "довести до кип", "варить", "подогр", "томить", "обжар", "пассиров")
TRANSFER_VERBS = ("перел", "слить", "налить", "долить", "перемест", "перелож")
MARKING_WORDS = ("маркир", "этикет", "наклей", "стикер")
LOSS_WORDS = ("списан", "списание", "потер", "брак", "утилиз")
WASH_WORDS = ("помыть", "мойка", "протереть", "санобработ", "дезинфек")


def _needs_heat_params(title: str) -> bool:
    t = (title or "").lower()
    return any(v in t for v in HEAT_VERBS)


def _needs_disposition(node: Node) -> bool:
    if node.type in ("decision", "fork", "join"):
        return False
    return not bool(node.disposition)


def _needs_actor(node: Node) -> bool:
    if node.type in ("join",):
        return False
    return not bool(node.actor_role)


def _needs_equipment(node: Node) -> bool:
    t = (node.title or "").lower()
    touches = _needs_heat_params(node.title) or any(w in t for w in TRANSFER_VERBS) or any(w in t for w in MARKING_WORDS)
    if node.type in ("loss_event", "decision", "fork", "join", "timer", "message"):
        return False
    if touches:
        return len(node.equipment) == 0
    return False


def _is_loss(node: Node) -> bool:
    t = (node.title or "").lower()
    return node.type == "loss_event" or any(w in t for w in LOSS_WORDS)


def _is_marking(node: Node) -> bool:
    t = (node.title or "").lower()
    return any(w in t for w in MARKING_WORDS)


def _is_wash(node: Node) -> bool:
    t = (node.title or "").lower()
    return any(w in t for w in WASH_WORDS)


def build_questions(nodes: List[Node], roles: Optional[List[str]] = None) -> List[Question]:
    qs: List[Question] = []

    role_opts = []
    seen_roles = set()
    for r in roles or []:
        rr = (r or "").strip()
        if not rr:
            continue
        if rr in seen_roles:
            continue
        seen_roles.add(rr)
        role_opts.append(rr)

    def add(qid: str, node_id: str, issue_type: str, question: str, options=None, target=None) -> None:
        qs.append(
            Question(
                id=qid,
                node_id=node_id,
                issue_type=issue_type,
                question=question,
                options=options or [],
                target=target,
            )
        )

    for n in nodes:
        norm = (n.parameters or {}).get("_norm") or {}
        unknown_terms = norm.get("unknown_terms") or []
        if unknown_terms:
            add(
                f"cov_norm_unknown_{n.id}",
                n.id,
                "AMBIG",
                "Нормализатор: найдены неизвестные термины. Что это за объект/ресурс/оборудование? Приведи каноническое название/ID.",
                options=[],
                target={"field": "parameters.notes", "mode": "append", "transform": "text"},
            )

        if n.type == "timer":
            if n.duration_min is None:
                add(
                    f"cov_timer_duration_{n.id}",
                    n.id,
                    "CRITICAL",
                    "Таймер: сколько минут/часов ждать? Укажи длительность (мин).",
                    options=[],
                    target={"field": "duration_min", "mode": "set", "transform": "minutes"},
                )
            if _needs_actor(n):
                add(
                    f"cov_timer_actor_{n.id}",
                    n.id,
                    "MISSING",
                    "Кто отвечает за таймер/контроль? (actor_role)",
                    options=role_opts,
                    target={"field": "actor_role", "mode": "set", "transform": "role"},
                )
            continue

        if n.type == "message":
            if not n.recipient_role:
                add(
                    f"cov_message_recipient_{n.id}",
                    n.id,
                    "MISSING",
                    "Сообщение: кому адресовано? (recipient_role)",
                    options=role_opts,
                    target={"field": "recipient_role", "mode": "set", "transform": "role"},
                )
            add(
                f"cov_message_text_{n.id}",
                n.id,
                "VARIANT",
                "Сообщение: что именно спросить/сообщить (текст/формулировка)?",
                options=[],
                target={"field": "parameters.message_text", "mode": "set", "transform": "text"},
            )
            continue

        if _needs_actor(n):
            add(
                f"cov_actor_{n.id}",
                n.id,
                "MISSING",
                "Кто выполняет этот шаг? (actor_role)",
                options=role_opts,
                target={"field": "actor_role", "mode": "set", "transform": "role"},
            )

        if _needs_equipment(n):
            add(
                f"cov_equipment_{n.id}",
                n.id,
                "MISSING",
                "Какое оборудование/инвентарь задействовано? (ID или название)",
                options=[],
                target={"field": "equipment", "mode": "merge", "transform": "equipment_list"},
            )

        if _needs_heat_params(n.title) and not (n.parameters or {}).get("heat"):
            add(
                f"cov_heat_{n.id}",
                n.id,
                "CRITICAL",
                "Нагрев/варка: какой режим/уровень (1–9), целевая температура/признак, время, критерий готовности?",
                options=[],
                target={"field": "parameters.heat", "mode": "set", "transform": "text"},
            )

        if _needs_disposition(n):
            add(
                f"cov_disposition_{n.id}",
                n.id,
                "CRITICAL",
                "После шага: куда девается продукт и инвентарь (остается/мойка/хранение/утилизация) + кто это делает?",
                options=[],
                target={"field": "disposition.note", "mode": "set", "transform": "text"},
            )

        t = (n.title or "").lower()

        if n.type == "decision":
            add(
                f"cov_decision_conditions_{n.id}",
                n.id,
                "VARIANT",
                "Условие: какие ветки? Перечисли варианты 'если X → Y' (порог/признак/критерий).",
                options=[],
                target={"field": "parameters.decision_conditions", "mode": "set", "transform": "text"},
            )

        if re.search(r"\bсильн(ый|о)\b|\bсредн(ий|е)\b|\bмедленн(о|ый)\b", t):
            add(
                f"cov_fire_scale_{n.id}",
                n.id,
                "AMBIG",
                "Огонь/темп размыто. Какая шкала на вашей плите (1–9) и какое значение?",
                options=[],
                target={"field": "parameters.fire_scale", "mode": "set", "transform": "text"},
            )

        if _is_loss(n):
            add(
                f"cov_loss_context_{n.id}",
                n.id,
                "LOSS",
                "Списание/потери: если есть нюансы (почему/кто/как обнаружили/что дальше) — допиши контекст.",
                options=[],
                target={"field": "parameters.loss_context", "mode": "set", "transform": "text"},
            )

        if _is_marking(n):
            add(
                f"cov_marking_who_{n.id}",
                n.id,
                "VARIANT",
                "Маркировка: кто делает (только бригадир?) и сколько времени на единицу/партию?",
                options=[],
                target={"field": "parameters.marking.who", "mode": "set", "transform": "text"},
            )
            add(
                f"cov_marking_what_{n.id}",
                n.id,
                "VARIANT",
                "Маркировка: что на этикетке (дата/время/партия/срок/ответственный), чем печатают, где хранят?",
                options=[],
                target={"field": "parameters.marking.what", "mode": "set", "transform": "text"},
            )

        if _is_wash(n):
            add(
                f"cov_wash_how_{n.id}",
                n.id,
                "VARIANT",
                "Мойка/санобработка: чем моем (средство), сколько времени, где сушим/храним, кто контролирует?",
                options=[],
                target={"field": "parameters.wash.how", "mode": "set", "transform": "text"},
            )
            add(
                f"cov_wash_exception_{n.id}",
                n.id,
                "VARIANT",
                "Мойка: что делаем, если нет места/очередь/оборудование занято?",
                options=[],
                target={"field": "parameters.wash.exception", "mode": "set", "transform": "text"},
            )

        if "масса" in t or "взвес" in t or "взвеш" in t:
            add(
                f"cov_weight_control_{n.id}",
                n.id,
                "VARIANT",
                "Контроль массы: целевой вес/допуск? Что делаем если больше/меньше (долив/уварка/списание)?",
                options=[],
                target={"field": "parameters.weight_control", "mode": "set", "transform": "text"},
            )

        if "раствор" in t or "растворил" in t:
            add(
                f"cov_dissolve_check_{n.id}",
                n.id,
                "VARIANT",
                "Растворение: как проверяем, что растворилось? Что делаем, если нет (мешать/температура/время)?",
                options=[],
                target={"field": "parameters.dissolve_check", "mode": "set", "transform": "text"},
            )

    return qs
