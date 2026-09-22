from celery import Celery
from celery.schedules import crontab

app = Celery("processmap", broker="redis://redis:6379/1", backend="redis://redis:6379/2")

app.conf.beat_schedule = {
    "analytics-nightly-refresh": {
        # Канонические имена (processmap.*): строковые имена beat не зависят от
        # import-контекста воркера (app.* vs backend.app.*).
        "task": "processmap.analytics.refresh_all_workspaces_analytics_task",
        "schedule": crontab(hour=4, minute=30),
        "options": {"queue": "celery"},
    },
    "rag-index-nightly-refresh": {
        "task": "processmap.rag.index_queued_sessions_bpmn_xml",
        "schedule": crontab(hour=4, minute=30),
        "options": {"queue": "celery"},
    },
    "agent-analysis-nightly-refresh": {
        "task": "processmap.agent_analysis.nightly_refresh_task",
        "schedule": crontab(hour=4, minute=40),
        "options": {"queue": "celery"},
    },
    "session-applied-ops-cleanup": {
        # feature/async-save-pipeline-step1: retention session_applied_ops, TTL 30 дней.
        "task": "processmap.session_applied_ops.cleanup_task",
        "schedule": crontab(hour=5, minute=10),
        "options": {"queue": "celery"},
    },
    "canvas-telemetry-aggregate": {
        # feature/canvas-telemetry-feed: raw → витрина canvas_event_read, каждые 5 мин.
        "task": "processmap.canvas_telemetry.aggregate_task",
        "schedule": crontab(minute="*/5"),
        "options": {"queue": "celery"},
    },
    "canvas-telemetry-cleanup": {
        # retention canvas_event_raw, TTL 14 дней.
        "task": "processmap.canvas_telemetry.cleanup_task",
        "schedule": crontab(hour=5, minute=20),
        "options": {"queue": "celery"},
    },
}
app.conf.timezone = "Europe/Moscow"

# Import task modules so workers discover them
from . import tasks  # noqa: E402
from .save_services.canvas_telemetry_aggregator import tasks as canvas_telemetry_tasks  # noqa: F401,E402
from . import rag_tasks  # noqa: F401,E402
from .agent_analysis import tasks as agent_analysis_tasks  # noqa: F401,E402
from .save_services.analytics_aggregator import tasks as analytics_tasks  # noqa: F401,E402
from .save_services.audit_publisher import tasks as audit_tasks  # noqa: F401,E402

# Wire app-provided stubs overlay_cache для worker-контекста
# (fix/overlay-render-notimplemented). Без этого render_overlay_task падал с
# NotImplementedError: stubs заменялись только при импорте _legacy_main, которого
# в воркере нет. Явный вызов, а не side-effect-on-import.
from . import overlay_wiring  # noqa: E402

overlay_wiring.wire()
