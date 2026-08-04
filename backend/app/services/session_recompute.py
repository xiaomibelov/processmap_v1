"""Session recompute pipeline extracted from _legacy_main (PR-pre)."""

from ..models import Session
from ..normalizer import load_seed_glossary, normalize_nodes
from ..resources import build_resources_report
from ..validators.coverage import build_questions
from ..validators.disposition import build_disposition_questions
from ..validators.loss import build_loss_questions
from ..exporters.mermaid import render_mermaid
from ..analytics import compute_analytics
from ..startup.static_mounts import GLOSSARY_SEED


def _merge_question_states(old_questions, new_questions):
    old_by_id = {q.id: q for q in (old_questions or [])}

    merged = []
    for q in new_questions:
        old = old_by_id.get(q.id)
        if old:
            q.status = old.status
            q.answer = old.answer
        q.orphaned = False
        merged.append(q)

    seen_ids = {q.id for q in merged}

    orphans = []
    for old in (old_questions or []):
        if old.id in seen_ids:
            continue
        if old.status != "answered":
            continue
        keep = old.model_copy(deep=True)
        keep.orphaned = True
        orphans.append(keep)

    merged.extend(orphans[:300])
    return merged[:900]


def _recompute_session(s: Session) -> Session:
    seed = load_seed_glossary(GLOSSARY_SEED)
    s.normalized = normalize_nodes(s.nodes, seed)

    resources_report, conflict_questions = build_resources_report(s.nodes, s.edges)
    s.resources = resources_report

    base_questions = build_questions(s.nodes, roles=s.roles)
    disp_questions = build_disposition_questions(s.nodes)
    loss_questions = build_loss_questions(s.nodes)

    new_questions = base_questions + conflict_questions + disp_questions + loss_questions

    keep_llm = [q for q in (s.questions or []) if (getattr(q, 'id', '') or '').startswith('llm_')]
    new_questions = new_questions + keep_llm

    seen = set()
    dedup = []
    for q in new_questions:
        qid = getattr(q, 'id', None)
        if not qid or qid in seen:
            continue
        seen.add(qid)
        dedup.append(q)
    new_questions = dedup

    s.questions = _merge_question_states(s.questions, new_questions)

    s.mermaid_simple = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="simple")
    s.mermaid_lanes = render_mermaid(s.nodes, s.edges, roles=s.roles, mode="lanes")
    s.mermaid = s.mermaid_lanes


    s.analytics = compute_analytics(s)

    s.version += 1
    return s
