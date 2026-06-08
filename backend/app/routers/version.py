import os
from fastapi import APIRouter

router = APIRouter()


@router.get("/version")
def version():
    return {
        "commit": os.getenv("BUILD_ID", "unknown"),
        "buildTime": os.getenv("BUILD_TIME", "unknown"),
        "containerId": os.uname().nodename,
        "branch": os.getenv("BUILD_BRANCH", "unknown"),
        "env": os.getenv("BUILD_ENV", "prod"),
    }
