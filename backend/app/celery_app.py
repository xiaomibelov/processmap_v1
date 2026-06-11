from celery import Celery

app = Celery("processmap", broker="redis://redis:6379/1", backend="redis://redis:6379/2")

# Import task modules so workers discover them
from . import tasks  # noqa: E402
