from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Request

from ..models import CreateProjectIn, UpdateProjectIn
from ..services import project_service as _svc

router = APIRouter()


@router.get("/api/projects")
def list_projects(request: Request = None) -> List[dict]:
    return _svc.list_projects(request)


@router.post("/api/projects")
def create_project(inp: CreateProjectIn, request: Request = None) -> dict:
    return _svc.create_project(inp, request)


@router.get("/api/projects/{project_id}")
def get_project(project_id: str, request: Request = None) -> dict:
    return _svc.get_project(project_id, request)


@router.patch("/api/projects/{project_id}")
def patch_project(project_id: str, inp: UpdateProjectIn, request: Request = None) -> dict:
    return _svc.patch_project(project_id, inp, request)


@router.put("/api/projects/{project_id}")
def put_project(project_id: str, inp: CreateProjectIn, request: Request = None) -> dict:
    return _svc.put_project(project_id, inp, request)


@router.delete("/api/projects/{project_id}")
def delete_project_api(project_id: str, request: Request = None):
    return _svc.delete_project(project_id, request)
