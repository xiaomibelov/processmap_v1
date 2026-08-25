from celery import Celery
from celery.schedules import crontab

app = Celery("processmap", broker="redis://redis:6379/1", backend="redis://redis:6379/2")

app.conf.beat_schedule = {
    "analytics-nightly-refresh": {
        "task": "app.save_services.analytics_aggregator.tasks.refresh_all_workspaces_analytics_task",
        "schedule": crontab(hour=4, minute=30),
        "options": {"queue": "celery"},
    },
    "rag-index-nightly-refresh": {
        "task": "app.rag_tasks.index_queued_sessions_bpmn_xml",
        "schedule": crontab(hour=4, minute=30),
        "options": {"queue": "celery"},
    },
}
app.conf.timezone = "Europe/Moscow"

# Import task modules so workers discover them
from . import tasks  # noqa: E402
from . import rag_tasks  # noqa: F401,E402
from .save_services.analytics_aggregator import tasks as analytics_tasks  # noqa: F401,E402
