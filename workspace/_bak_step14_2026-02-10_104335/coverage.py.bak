from __future__ import annotations

import re
from typing import List

from ..models import Node, Question


HEAT_VERBS = ("включ", "нагр", "кип", "довести до кип", "варить", "подогр", "томить", "обжар", "пассиров")
TRANSFER_VERBS = ("перел", "слить", "налить", "долить", "перемест", "перелож")
MARKING_WORDS = ("маркир", "этикет", "наклей", "стикер")
LOSS_WORDS = ("списан", "списание", "потер", "брак", "утилиз")
WASH_WORDS = ("помыть", "мойка", "протереть", "санобработ", "дезинфек")


def _needs_heat_params(title: str) -> bool:
    t = title.lower()
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
    t = node.title.lower()
    touches = _needs_heat_params(node.title) or any(w in t for w in TRANSFER_VERBS) or any(w in t for w in MARKING_WORDS)
    if node.type in ("loss_event", "decision", "fork", "join", "timer", "message"):
        return False
    if touches:
        return len(node.equipment) == 0
    return False


def _is_loss(node: Node) -> bool:
    t = node.title.lower()
    return node.type == "loss_event" or any(w in t for w in LOSS_WORDS)


def _is_marking(node: Node) -> bool:
    t = node.title.lower()
    return any(w in t for w in MARKING_WORDS)


def _is_wash(node: Node) -> bool:
    t = node.title.lower()
    return any(w in t for w in WASH_WORDS)


def build_questions(nodes: List[Node]) -> List[Question]:
    qs: List[Question] = []
    qidx = 1

    def add(node_id: str, issue_type: str, question: str, options=None) -> None:
        nonlocal qidx
        qid = f"q{qidx}"
        qidx += 1
        qs.append(Question(id=qid, node_id=node_id, issue_type=issue_type, question=question, options=options or []))

    for n in nodes:
        norm = (n.parameters or {}).get("_norm") or {}
        unknown_terms = norm.get("unknown_terms") or []
        if unknown_terms:
            add(
                n.id,
                "AMBIG",
                "Нормализатор: найдены неизвестные термины. Что это за объект/ресурс/оборудование? Приведи каноническое название/ID.",
                options=[],
            )

        if n.type == "timer":
            if n.duration_min is None:
                add(n.id, "CRITICAL", "Таймер: сколько минут/часов ждать? Укажи длительность (мин).")
            if _needs_actor(n):
                add(n.id, "MISSING", "Кто отвечает за таймер/контроль? (роль: cook_1 / cook_2 / brigadir)")
            continue

        if n.type == "message":
            if not n.recipient_role:
                add(n.id, "MISSING", "Сообщение: кому адресовано? (recipient_role: brigadir/technolog/...)")
            add(n.id, "VARIANT", "Сообщение: что именно спросить/сообщить (текст/формулировка)?")
            continue

        if _needs_actor(n):
            add(n.id, "MISSING", "Кто выполняет этот шаг? (роль: cook_1 / cook_2 / brigadir)")

        if _needs_equipment(n):
            add(n.id, "MISSING", "Какое оборудование/инвентарь задействовано? (ID или название)")

        if _needs_heat_params(n.title) and not n.parameters.get("heat"):
            add(
                n.id,
                "CRITICAL",
                "Нагрев/варка: какой режим/уровень (1–9), целевая температура/признак, время, критерий готовности?",
            )

        if _needs_disposition(n):
            add(
                n.id,
                "CRITICAL",
                "После шага: куда девается продукт и инвентарь (остается/мойка/хранение/утилизация) + кто это делает?",
            )

        t = n.title.lower()

        if n.type == "decision":
            add(n.id, "VARIANT", "Условие: какие ветки? Перечисли варианты 'если X → Y' (порог/признак/критерий).")

        if re.search(r"\bсильн(ый|о)\b|\bсредн(ий|е)\b|\bмедленн(о|ый)\b", t):
            add(n.id, "AMBIG", "Огонь/темп размыто. Какая шкала на вашей плите (1–9) и какое значение?")

        if _is_loss(n):
            add(
                n.id,
                "LOSS",
                "Списание/потери: причина (температура/срок/контаминация/маркировка/лишний объём/брак), как обнаружили, кто подтверждает, что дальше делаем?",
                options=["температура", "срок", "контаминация", "маркировка", "лишний объём", "брак", "другое"],
            )

        if _is_marking(n):
            add(n.id, "VARIANT", "Маркировка: кто делает (только бригадир?) и сколько времени на единицу/партию?")
            add(n.id, "VARIANT", "Маркировка: что на этикетке (дата/время/партия/срок/ответственный), чем печатают, где хранят?")

        if _is_wash(n):
            add(n.id, "VARIANT", "Мойка/санобработка: чем моем (средство), сколько времени, где сушим/храним, кто контролирует?")
            add(n.id, "VARIANT", "Мойка: что делаем, если нет места/очередь/оборудование занято?")

        if "масса" in t or "взвес" in t or "взвеш" in t:
            add(n.id, "VARIANT", "Контроль массы: целевой вес/допуск? Что делаем если больше/меньше (долив/уварка/списание)?")

        if "раствор" in t or "растворил" in t:
            add(n.id, "VARIANT", "Растворение: как проверяем, что растворилось? Что делаем, если нет (мешать/температура/время)?")

    return qs
