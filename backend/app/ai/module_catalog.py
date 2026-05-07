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
    has_prompt_registry: bool = False,
    has_execution_log: bool = False,
    has_rate_limits: bool = False,
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
        "has_prompt_registry": bool(has_prompt_registry),
        "has_execution_log": bool(has_execution_log),
        "has_rate_limits": bool(has_rate_limits),
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
            status="active",
            scope=["session"],
            prompt_source="prompt_registry+code_fallback",
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
                "prompt registry is optional and hardcoded prompt remains fallback",
                "still writes existing questions_json/interview.ai_questions/ai_llm_state_json fields",
            ],
            migration_priority="P1",
            has_prompt_registry=True,
            has_execution_log=True,
            has_rate_limits=True,
        ),
        _module(
            module_id="ai.questions.element",
            name="AI-вопросы по элементу BPMN",
            description="Генерация уточняющих вопросов для выбранного BPMN node/Interview step.",
            enabled=True,
            status="active",
            scope=["session"],
            prompt_source="prompt_registry+code_fallback",
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
                "prompt registry is optional and hardcoded prompt remains fallback",
            ],
            migration_priority="P1",
            has_prompt_registry=True,
            has_execution_log=True,
            has_rate_limits=True,
        ),
        _module(
            module_id="ai.questions.prep",
            name="Вопросы по названию сессии",
            description="Генерация стартовых вопросов для первого интервью по названию будущей session.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="prompt_registry+code_fallback",
            writes_domain_state=False,
            review_apply_required=True,
            current_sources=[
                "backend/app/_legacy_main.py",
                "backend/app/ai/deepseek_questions.py",
                "frontend/src/components/SessionFlowModal.jsx",
            ],
            endpoints=["POST /api/llm/session-title/questions"],
            risks=[
                "accepted questions enter session create flow before session-scoped execution trace exists",
            ],
            migration_priority="P1",
            has_prompt_registry=True,
        ),
        _module(
            module_id="ai.process.extract_from_notes",
            name="Разбор заметок в процесс",
            description="Извлечение process graph из заметок через DeepSeek/fallback parser.",
            enabled=True,
            status="legacy",
            scope=["session"],
            prompt_source="prompt_registry_seeded+legacy_code_runtime",
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
                "prompt is seeded but legacy runtime migration is still pending",
            ],
            migration_priority="P2",
            has_prompt_registry=True,
        ),
        _module(
            module_id="ai.path_report",
            name="AI-отчёт по маршруту",
            description="Генерация AI report artifacts по выбранному path/scenario.",
            enabled=True,
            status="active",
            scope=["session"],
            prompt_source="prompt_registry+code_fallback",
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
                "report artifacts live inside interview.report_versions/path_reports",
                "prompt registry is optional and hardcoded path report prompt remains fallback",
            ],
            migration_priority="P1",
            has_prompt_registry=True,
            has_execution_log=True,
            has_rate_limits=True,
        ),
        _module(
            module_id="ai.product_actions.suggest",
            name="Предложения действий с продуктом",
            description="Suggestions-only module for product action candidate rows from BPMN/Interview context.",
            enabled=True,
            status="active",
            scope=["session"],
            prompt_source="prompt_registry+code_fallback",
            writes_domain_state=False,
            review_apply_required=True,
            current_sources=[
                "backend/app/routers/product_actions_ai.py",
                "backend/app/ai/product_actions_suggest.py",
                "frontend/src/components/process/interview/ProductActionsPanel.jsx",
                "PROCESSMAP/PROJECT ATLAS/21_Выгрузка действий с продуктом.md",
            ],
            endpoints=["POST /api/sessions/{session_id}/analysis/product-actions/suggest"],
            risks=[
                "must not auto-write interview.analysis.product_actions",
                "must not mutate BPMN XML",
            ],
            migration_priority="P2",
            has_prompt_registry=True,
            has_execution_log=True,
            has_rate_limits=True,
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
            "prompt_registry_enabled": any(bool(item.get("has_prompt_registry")) for item in modules),
            "execution_log_enabled": any(bool(item.get("has_execution_log")) for item in modules),
            "rate_limits_enabled": any(bool(item.get("has_rate_limits")) for item in modules),
            "admin_managed_provider_settings": False,
        },
    }
