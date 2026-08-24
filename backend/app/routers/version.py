import os
from fastapi import APIRouter

router = APIRouter()


@router.get("/version")
def version():
    commit = os.getenv("BUILD_ID", "unknown")
    build_time = os.getenv("BUILD_TIME", "unknown")
    return {
        # Новые клиенты (boot guard / appUpdate model) читают commit/buildTime.
        "commit": commit,
        "buildTime": build_time,
        # Алиасы sha/builtAt нужны для закешированных index.html до PR #821/#822:
        # их boot guard ожидает только data.sha и не сработает без этого поля.
        "sha": commit,
        "builtAt": build_time,
        "containerId": os.uname().nodename,
        "branch": os.getenv("BUILD_BRANCH", "unknown"),
        "env": os.getenv("BUILD_ENV", "prod"),
    }
