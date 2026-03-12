from __future__ import annotations

from collections.abc import Iterator

from fastapi.routing import APIRoute

from .. import _legacy_main


def iter_exported_legacy_routes() -> Iterator[APIRoute]:
    yield from _legacy_main.export_legacy_routes()


def list_exported_legacy_routes() -> list[APIRoute]:
    return list(iter_exported_legacy_routes())
