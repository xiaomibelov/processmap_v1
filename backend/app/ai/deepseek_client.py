from __future__ import annotations
import os, re
from typing import Dict, List, Tuple
import requests
def _stub_extract(notes: str) -> Tuple[List[dict], List[dict], List[str]]:
    lines = [ln.strip() for ln in notes.splitlines() if ln.strip()]
    nodes, edges = [], []
    roles = set()
    last_id = None
    idx = 1
    for ln in lines:
        nid = f"n{idx}"
        idx += 1
        low = ln.lower()
        ntype = "step"
        if "если" in low or "иначе" in low or "?" in low:
            ntype = "decision"
        if "списан" in low or "списание" in low or "потер" in low:
            ntype = "loss_event"
        actor = None
        if "бригадир" in low:
            actor = "brigadir"
        elif "повар 1" in low or "п1" in low:
            actor = "cook_1"
        elif "повар 2" in low or "п2" in low:
            actor = "cook_2"
        if actor:
            roles.add(actor)
        equipment = []
        if re.search(r"\bкот(е|ё)л\b", low):
            equipment.append("kotel_1")
        if "кастрюл" in low:
            equipment.append("pot_1")
        if "вес" in low or "взвес" in low:
            equipment.append("scale_1")
        if "сковород" in low:
            equipment.append("pan_1")
        if "камера" in low and "охлаж" in low:
            equipment.append("blast_chiller_1")
        nodes.append({"id": nid, "type": ntype, "title": ln, "actor_role": actor, "equipment": equipment, "evidence": [ln], "confidence": 0.35})
        if last_id:
            edges.append({"from_id": last_id, "to_id": nid})
        last_id = nid
    if not roles:
        roles = {"cook_1", "cook_2"}
    return nodes, edges, sorted(list(roles))
def extract_process(notes: str) -> Dict:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    if not api_key:
        nodes, edges, roles = _stub_extract(notes)
        return {"nodes": nodes, "edges": edges, "roles": roles}
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Верни только JSON: nodes, edges, roles для пищевого процесса. Ничего не выдумывай. Если нет данных — null/пусто."},
            {"role": "user", "content": notes},
        ],
        "temperature": 0.2,
    }
    url = f"{base_url}/v1/chat/completions"
    r = requests.post(url, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    content = data["choices"][0]["message"]["content"]
    import json
    return json.loads(content)
