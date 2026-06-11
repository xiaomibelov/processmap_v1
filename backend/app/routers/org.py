from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Request

from ..models import CreateProjectIn, UpdateProjectIn
from ..schemas.legacy_api import (
    CreateSessionIn,
    OrgGitMirrorPatchIn,
    OrgMemberPatchIn,
    OrgPatchIn,
    ProjectMemberPatchIn,
    ProjectMemberUpsertIn,
)
from ..services import org_service as _svc

router = APIRouter()


@router.patch("/api/orgs/{org_id}")
def patch_org_endpoint(org_id: str, inp: OrgPatchIn, request: Request) -> Dict[str, Any]:
    return _svc.patch_org(org_id, inp, request)


@router.get("/api/orgs/{org_id}/git-mirror")
def get_org_git_mirror_endpoint(org_id: str, request: Request) -> Dict[str, Any]:
    return _svc.get_org_git_mirror(org_id, request)


@router.patch("/api/orgs/{org_id}/git-mirror")
def patch_org_git_mirror_endpoint(org_id: str, inp: OrgGitMirrorPatchIn, request: Request) -> Dict[str, Any]:
    return _svc.patch_org_git_mirror(org_id, inp, request)


@router.post("/api/orgs/{org_id}/git-mirror/validate")
def validate_org_git_mirror_endpoint(org_id: str, inp: OrgGitMirrorPatchIn, request: Request) -> Dict[str, Any]:
    return _svc.validate_org_git_mirror(org_id, inp, request)


@router.patch("/api/orgs/{org_id}/members/{user_id}")
def patch_org_member_endpoint(org_id: str, user_id: str, inp: OrgMemberPatchIn, request: Request):
    return _svc.patch_org_member(org_id, user_id, inp, request)


@router.get("/api/orgs/{org_id}/projects")
def list_org_projects(org_id: str, request: Request) -> List[Dict[str, Any]]:
    return _svc.list_org_projects(org_id, request)


@router.post("/api/orgs/{org_id}/projects")
def create_org_project(org_id: str, inp: CreateProjectIn, request: Request) -> Dict[str, Any]:
    return _svc.create_org_project(org_id, inp, request)


@router.get("/api/orgs/{org_id}/projects/{project_id}")
def get_org_project(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    return _svc.get_org_project(org_id, project_id, request)


@router.get("/api/orgs/{org_id}/projects/{project_id}/sessions")
def list_org_project_sessions(org_id: str, project_id: str, request: Request, mode: str | None = None, view: str | None = None) -> List[Dict[str, Any]]:
    return _svc.list_org_project_sessions(org_id, project_id, request, mode, view)


@router.post("/api/orgs/{org_id}/projects/{project_id}/sessions")
def create_org_project_session(org_id: str, project_id: str, inp: CreateSessionIn, request: Request, mode: str | None = None):
    return _svc.create_org_project_session(org_id, project_id, inp, request, mode)


@router.get("/api/orgs/{org_id}/projects/{project_id}/members")
def list_org_project_members(org_id: str, project_id: str, request: Request) -> Dict[str, Any]:
    return _svc.list_org_project_members(org_id, project_id, request)


@router.post("/api/orgs/{org_id}/projects/{project_id}/members")
def create_org_project_member(org_id: str, project_id: str, inp: ProjectMemberUpsertIn, request: Request):
    return _svc.create_org_project_member(org_id, project_id, inp, request)


@router.patch("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")
def patch_org_project_member(org_id: str, project_id: str, user_id: str, inp: ProjectMemberPatchIn, request: Request):
    return _svc.patch_org_project_member(org_id, project_id, user_id, inp, request)


@router.delete("/api/orgs/{org_id}/projects/{project_id}/members/{user_id}")
def delete_org_project_member(org_id: str, project_id: str, user_id: str, request: Request):
    return _svc.delete_org_project_member(org_id, project_id, user_id, request)


@router.get("/api/orgs/{org_id}/audit")
def list_org_audit_endpoint(
    org_id: str,
    request: Request,
    limit: int = 100,
    action: str = "",
    project_id: str = "",
    session_id: str = "",
    status: str = "",
):
    return _svc.list_org_audit(org_id, request, limit, action, project_id, session_id, status)


@router.post("/api/orgs/{org_id}/audit/cleanup")
def cleanup_org_audit_endpoint(org_id: str, request: Request, retention_days: int = 0):
    return _svc.cleanup_org_audit(org_id, request, retention_days)


@router.get("/api/enterprise/workspace")
def get_enterprise_workspace(request: Request):
    return _svc.get_enterprise_workspace(request)
