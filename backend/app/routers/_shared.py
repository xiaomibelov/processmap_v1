from __future__ import annotations

from typing import Callable

from fastapi import APIRouter
from fastapi.routing import APIRoute

from .. import _legacy_main

PathPredicate = Callable[[str], bool]


def build_router(predicate: PathPredicate) -> APIRouter:
    router = APIRouter()
    for route in _legacy_main.app.router.routes:
        if not isinstance(route, APIRoute):
            continue
        path = str(route.path or "")
        if predicate(path):
            router.routes.append(route)
    return router
