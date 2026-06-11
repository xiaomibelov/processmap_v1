from __future__ import annotations

from typing import Any, Dict, List


def list_projects(request=None) -> List[dict]:
    import backend.app._legacy_main as _lm
    return _lm.list_projects(request)


def create_project(inp, request=None) -> dict:
    import backend.app._legacy_main as _lm
    return _lm.create_project(inp, request)


def get_project(project_id: str, request=None) -> dict:
    import backend.app._legacy_main as _lm
    return _lm.get_project(project_id, request)


def patch_project(project_id: str, inp, request=None) -> dict:
    import backend.app._legacy_main as _lm
    return _lm.patch_project(project_id, inp, request)


def put_project(project_id: str, inp, request=None) -> dict:
    import backend.app._legacy_main as _lm
    return _lm.put_project(project_id, inp, request)


def delete_project(project_id: str, request=None):
    import backend.app._legacy_main as _lm
    return _lm.delete_project_api(project_id, request)
