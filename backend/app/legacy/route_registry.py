from __future__ import annotations

from collections.abc import Iterator

from fastapi.routing import APIRoute

from .routes_export import iter_exported_legacy_routes


def iter_legacy_routes() -> Iterator[APIRoute]:
    yield from iter_exported_legacy_routes()


def list_legacy_routes() -> list[APIRoute]:
    return list(iter_legacy_routes())
