from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

from ..settings import DEFAULT_DEEPSEEK_BASE_URL, load_llm_settings


def _settings_file_exists() -> bool:
    storage_dir = Path(os.environ.get("PROCESS_STORAGE_DIR", "workspace/.session_store"))
    return (storage_dir / "_llm_settings.json").exists()


def _settings_source() -> str:
    sources: List[str] = []
    if (os.environ.get("DEEPSEEK_API_KEY") or "").strip() or (os.environ.get("DEEPSEEK_BASE_URL") or "").strip():
        sources.append("env")
    if _settings_file_exists():
        sources.append("settings_file")
    return "+".join(sources) if sources else "default"


def ai_provider_settings_summary() -> Dict[str, Any]:
    settings = load_llm_settings()
    return {
        "provider": "DeepSeek",
        "provider_id": "deepseek",
        "has_api_key": bool(str(settings.get("api_key") or "").strip()),
        "base_url": str(settings.get("base_url") or DEFAULT_DEEPSEEK_BASE_URL).strip().rstrip("/"),
        "source": _settings_source(),
        "verify_supported": True,
        "admin_managed": False,
    }


def _module(
    *,
    module_id: str,
    name: str,
    description: str,
    enabled: bool,
    status: str,
    scope: List[str],
    prompt_source: str,
    writes_domain_state: bool,
    review_apply_required: bool,
    current_sources: List[str],
    endpoints: List[str],
    risks: List[str],
    migration_priority: str,
) -> Dict[str, Any]:
    return {
        "module_id": module_id,
        "name": name,
        "description": description,
        "enabled": bool(enabled),
        "status": status,
        "scope": list(scope),
        "provider": "deepseek",
        "model": "deepseek-chat",
        "prompt_source": prompt_source,
        "has_prompt_registry": False,
        "has_execution_log": False,
        "has_rate_limits": False,
        "writes_domain_state": bool(writes_domain_state),
        "review_apply_required": bool(review_apply_required),
        "current_sources": list(current_sources),
        "endpoints": list(endpoints),
        "risks": list(risks),
        "migration_priority": migration_priority,
    }


def ai_module_catalog() -> List[Dict[str, Any]]:
    return [
        _module(
            module_id="ai.questions.session",
            name="AI-вопросы по процессу",
            description="Генерация AI-вопросов по session/BPMN для анализа процесса.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="code_seeded",
            writes_domain_state=True,
            review_apply_required=False,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_questions.py",
                "frontend/src/components/process/InterviewStage.jsx",
                "frontend/src/components/process/interview/TimelineTable.jsx",
            ],
            endpoints=["POST /api/sessions/{session_id}/ai/questions"],
            risks=[
                "prompt is code-only",
                "writes questions_json/interview.ai_questions/ai_llm_state_json outside unified runtime",
            ],
            migration_priority="P1",
        ),
        _module(
            module_id="ai.questions.element",
            name="AI-вопросы по элементу BPMN",
            description="Генерация уточняющих вопросов для выбранного BPMN node/Interview step.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="code_seeded",
            writes_domain_state=True,
            review_apply_required=False,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_questions.py",
                "frontend/src/components/sidebar/AIQuestionsSection.jsx",
                "frontend/src/components/process/NodeCopilotCard.jsx",
            ],
            endpoints=["POST /api/sessions/{session_id}/ai/questions"],
            risks=[
                "element binding normalization is spread across UI and backend",
                "no durable execution log",
            ],
            migration_priority="P1",
        ),
        _module(
            module_id="ai.questions.prep",
            name="Вопросы по названию сессии",
            description="Генерация стартовых вопросов для первого интервью по названию будущей session.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="code_seeded",
            writes_domain_state=False,
            review_apply_required=True,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_questions.py",
                "frontend/src/components/SessionFlowModal.jsx",
            ],
            endpoints=["POST /api/llm/session-title/questions"],
            risks=[
                "frontend can send prompt text",
                "accepted questions enter session create flow without prompt version trace",
            ],
            migration_priority="P1",
        ),
        _module(
            module_id="ai.process.extract_from_notes",
            name="Разбор заметок в процесс",
            description="Извлечение process graph из заметок через DeepSeek/fallback parser.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="code_seeded",
            writes_domain_state=True,
            review_apply_required=True,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_client.py",
                "frontend/src/components/NotesPanel.jsx",
            ],
            endpoints=["POST /api/sessions/{session_id}/notes"],
            risks=[
                "current path can auto-apply extracted/fallback graph",
                "needs preview-first migration",
            ],
            migration_priority="P2",
        ),
        _module(
            module_id="ai.path_report",
            name="AI-отчёт по маршруту",
            description="Генерация AI report artifacts по выбранному path/scenario.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="code_seeded",
            writes_domain_state=True,
            review_apply_required=False,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_questions.py",
                "frontend/src/components/process/interview/InterviewPathsView.jsx",
            ],
            endpoints=[
                "POST /api/sessions/{session_id}/paths/{path_id}/reports",
                "GET /api/sessions/{session_id}/paths/{path_id}/reports",
                "GET /api/reports/{report_id}",
            ],
            risks=[
                "background job is outside unified AI execution log/rate limits",
                "report artifacts live inside interview.report_versions/path_reports",
            ],
            migration_priority="P1",
        ),
        _module(
            module_id="ai.product_actions.suggest",
            name="Предложения действий с продуктом",
            description="Future suggestions-only module for product action candidate rows.",
            enabled=False,
            status="future",
            scope=["workspace", "project", "session"],
            prompt_source="future_registry",
            writes_domain_state=False,
            review_apply_required=True,
            current_sources=[
                "docs/specs/ai-module-architecture-and-admin-prompt-registry-v1.md",
                "PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md",
            ],
            endpoints=[],
            risks=[
                "must not auto-write interview.analysis.product_actions",
                "must not mutate BPMN XML",
            ],
            migration_priority="P2",
        ),
        _module(
            module_id="ai.doc.summarize",
            name="DOC summary",
            description="Future/optional DOC summarization module; current DOC/DOD mostly consume existing AI artifacts.",
            enabled=False,
            status="future",
            scope=["session"],
            prompt_source="future_registry",
            writes_domain_state=False,
            review_apply_required=True,
            current_sources=[
                "frontend/src/components/process/DocStage.jsx",
                "frontend/src/features/process/dod/buildDodReadinessV1.js",
            ],
            endpoints=[],
            risks=[
                "scope creep if built before runtime/prompt governance",
                "DOC/DOD should remain consumers until a module is explicitly designed",
            ],
            migration_priority="P3",
        ),
    ]


def ai_module_catalog_payload() -> Dict[str, Any]:
    modules = ai_module_catalog()
    return {
        "ok": True,
        "modules": modules,
        "provider_settings": ai_provider_settings_summary(),
        "summary": {
            "modules_total": len(modules),
            "legacy": sum(1 for item in modules if item.get("status") == "legacy"),
            "future": sum(1 for item in modules if item.get("status") == "future"),
            "active": sum(1 for item in modules if item.get("status") == "active"),
            "disabled": sum(1 for item in modules if item.get("status") == "disabled"),
            "enabled": sum(1 for item in modules if bool(item.get("enabled"))),
            "prompt_registry_enabled": False,
            "execution_log_enabled": False,
            "rate_limits_enabled": False,
            "admin_managed_provider_settings": False,
        },
    }
