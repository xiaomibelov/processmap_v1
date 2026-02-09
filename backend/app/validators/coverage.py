from __future__ import annotations
import re
from typing import List
from ..models import Node, Question
HEAT_VERBS = ("включ", "нагр", "кип", "довести до кип", "варить", "подогр", "томить")
TRANSFER_VERBS = ("перел", "слить", "налить", "долить", "перемест")
MARKING_WORDS = ("маркир", "этикет", "наклей")
LOSS_WORDS = ("списан", "списание", "потер", "брак")
def _needs_heat_params(title: str) -> bool:
    t = title.lower()
    return any(v in t for v in HEAT_VERBS)
def _needs_disposition(node: Node) -> bool:
    return not bool(node.disposition)
def _needs_actor(node: Node) -> bool:
    return not bool(node.actor_role)
def _needs_equipment(node: Node) -> bool:
    t = node.title.lower()
    touches = _needs_heat_params(node.title) or any(w in t for w in TRANSFER_VERBS) or any(w in t for w in MARKING_WORDS)
    if node.type in ("loss_event", "decision"):
        return False
    if touches:
        return len(node.equipment) == 0
    return False
def _is_loss(node: Node) -> bool:
    t = node.title.lower()
    return node.type == "loss_event" or any(w in t for w in LOSS_WORDS)
def build_questions(nodes: List[Node]) -> List[Question]:
    qs: List[Question] = []
    qidx = 1
    def add(node_id: str, issue_type: str, question: str, options=None) -> None:
        nonlocal qidx
        qid = f"q{qidx}"
        qidx += 1
        qs.append(Question(id=qid, node_id=node_id, issue_type=issue_type, question=question, options=options or []))
    for n in nodes:
        if _needs_actor(n):
            add(n.id, "MISSING", "Кто выполняет этот шаг? (роль: cook_1 / cook_2 / brigadir)")
        if _needs_equipment(n):
            add(n.id, "MISSING", "Какое оборудование/инвентарь задействовано? (ID из каталога кухни)")
        if _needs_heat_params(n.title) and not n.parameters:
            add(n.id, "CRITICAL", "Для нагрева/варки нужны параметры: режим/уровень, время, критерий готовности. Какие значения?")
        if _needs_disposition(n):
            add(n.id, "CRITICAL", "Что происходит ПОСЛЕ шага? Куда девается продукт/кастрюля/сковорода/инвентарь (мойка/остается/хранение)?")
        t = n.title.lower()
        if "если" in t or "иначе" in t or "?" in t:
            add(n.id, "VARIANT", "Какие условия ветвления? Перечисли варианты 'если X → Y' (порог/признак/критерий).")
        if re.search(r"\bсильн(ый|о)\b|\bсредн(ий|е)\b|\bмедленн(о|ый)\b", t):
            add(n.id, "AMBIG", "Фраза про огонь/темп размыта. Какая шкала/температура/мощность на конкретной плите?")
        if _is_loss(n):
            add(n.id, "LOSS", "Списание/потери: какая причина (температура/срок/контаминация/маркировка/лишний объём/брак) и как обнаружили?", options=["температура","срок","контаминация","маркировка","лишний объём","брак","другое"])
        if any(w in t for w in MARKING_WORDS):
            add(n.id, "VARIANT", "Маркировка: кто делает (только бригадир?) и сколько времени на единицу/партию?")
        if "масса" in t or "взвес" in t:
            add(n.id, "VARIANT", "Контроль массы: какой целевой вес/допуск? Что делаем если больше/меньше?")
        if "раствор" in t:
            add(n.id, "VARIANT", "Как проверяем, что растворилось? Что делаем, если нет? (время/темп/мешать)")
    return qs
