from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
from urllib.parse import quote

import requests

from ..exporters.bpmn import export_session_to_bpmn_xml
from ..models import Session
from ..storage import (
    get_org_git_mirror_config,
    get_project_storage,
    increment_and_get_next_version,
)
from .org_workspace import evaluate_org_git_mirror_config

_BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
_INTERVIEW_KEY = "git_mirror_publish"

_STATE_NOT_ATTEMPTED = "not_attempted"
_STATE_SKIPPED_DISABLED = "skipped_disabled"
_STATE_SKIPPED_INVALID = "skipped_invalid_config"
_STATE_PENDING = "pending"
_STATE_SYNCED = "synced"
_STATE_FAILED = "failed"

_PRIMARY_BPMN_TYPES = {
    "process",
    "participant",
    "lane",
    "task",
    "userTask",
    "serviceTask",
    "scriptTask",
    "manualTask",
    "businessRuleTask",
    "receiveTask",
    "sendTask",
    "subProcess",
    "callActivity",
}


class PublishGitMirrorError(RuntimeError):
    def __init__(self, message: str, *, code: str = "mirror_error") -> None:
        super().__init__(message)
        self.code = str(code or "mirror_error")


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(fallback)


def _now_ts() -> int:
    return int(time.time())


def _to_iso(ts: int) -> str:
    safe = max(0, int(ts or 0))
    dt = datetime.fromtimestamp(safe, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(str(text or "").encode("utf-8")).hexdigest()


def _safe_segment(value: Any, fallback: str) -> str:
    text = _as_text(value)
    if not text:
        return fallback
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", text)


def _normalize_base_path(value: Any) -> str:
    src = _as_text(value).replace("\\", "/")
    src = re.sub(r"/+", "/", src).strip("/")
    return src


def _split_tag(tag: Any) -> Tuple[str, str]:
    text = str(tag or "")
    if text.startswith("{") and "}" in text:
        ns, local = text[1:].split("}", 1)
        return ns, local
    return "", text


def _attr_key(key: str) -> str:
    ns, local = _split_tag(key)
    if not ns:
        return local
    return f"{ns}::{local}"


def _extract_extension_properties(elem: ET.Element) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    ext = None
    for child in list(elem):
        _, local = _split_tag(child.tag)
        if local == "extensionElements":
            ext = child
            break
    if ext is None:
        return out

    camunda_props: Dict[str, str] = {}
    raw_items: List[Dict[str, Any]] = []
    for child in ext.iter():
        if child is ext:
            continue
        ns, local = _split_tag(child.tag)
        attrs = {str(_attr_key(k)): str(v) for k, v in dict(child.attrib).items()}
        if local == "property":
            name = _as_text(attrs.get("name") or child.attrib.get("name"))
            value = _as_text(attrs.get("value") or child.attrib.get("value"))
            if name:
                camunda_props[name] = value
        raw_items.append(
            {
                "type": local,
                "namespace": ns,
                "attributes": attrs,
            }
        )
    if camunda_props:
        out["camunda_properties"] = camunda_props
    if raw_items:
        out["raw"] = raw_items
    return out


def _build_properties_snapshot(xml_text: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "schema_version": "publish_properties_v1",
        "structure": {
            "generated_at": _to_iso(_now_ts()),
            "source": "bpmn_xml",
            "element_count": 0,
        },
        "elements": [],
    }
    xml = str(xml_text or "")
    if not xml.strip():
        result["structure"]["parse"] = "empty_xml"
        return result
    try:
        root = ET.fromstring(xml)
    except Exception as exc:
        result["structure"]["parse"] = "invalid_xml"
        result["structure"]["parse_error"] = str(exc)
        return result

    entries: List[Dict[str, Any]] = []

    def walk(node: ET.Element, lineage: List[Dict[str, str]]) -> None:
        if not isinstance(node.tag, str):
            for child in list(node):
                walk(child, lineage)
            return

        ns, local = _split_tag(node.tag)
        next_lineage = lineage
        node_id = _as_text(node.attrib.get("id"))

        if ns == _BPMN_NS and node_id:
            attrs = {
                _attr_key(k): str(v)
                for k, v in dict(node.attrib).items()
                if _attr_key(k) != "id" and _as_text(v)
            }
            doc_text = ""
            for child in list(node):
                child_ns, child_local = _split_tag(child.tag)
                if child_ns == _BPMN_NS and child_local == "documentation":
                    doc_text = _as_text("".join(child.itertext()))
                    if doc_text:
                        attrs["documentation"] = doc_text
                        break
            ext_props = _extract_extension_properties(node)
            name = _as_text(node.attrib.get("name"))
            include = (
                local in _PRIMARY_BPMN_TYPES
                or bool(name)
                or bool(attrs)
                or bool(ext_props)
            )
            if include:
                parent_id = _as_text(lineage[-1].get("id")) if lineage else ""
                parent_type = _as_text(lineage[-1].get("type")) if lineage else ""
                path_ids = [item.get("id") for item in lineage if _as_text(item.get("id"))]
                path_ids.append(node_id)
                entries.append(
                    {
                        "id": node_id,
                        "type": local,
                        "name": name or None,
                        "parent_id": parent_id or None,
                        "parent_type": parent_type or None,
                        "path": "/".join(path_ids),
                        "properties": attrs,
                        "extension_properties": ext_props,
                    }
                )
            next_lineage = [*lineage, {"id": node_id, "type": local}]

        for child in list(node):
            walk(child, next_lineage)

    walk(root, [])
    result["elements"] = entries
    result["structure"]["element_count"] = len(entries)
    return result


def _default_publish_state() -> Dict[str, Any]:
    return {
        "schema_version": "git_mirror_publish_v1",
        "mirror_state": _STATE_NOT_ATTEMPTED,
        "last_attempt_at": 0,
        "last_error": None,
        "identity": {},
        "current_bpmn": {},
        "git": {},
    }


def _read_publish_state(interview_raw: Any) -> Dict[str, Any]:
    interview = interview_raw if isinstance(interview_raw, dict) else {}
    state = interview.get(_INTERVIEW_KEY)
    if not isinstance(state, dict):
        return _default_publish_state()
    out = _default_publish_state()
    out.update(copy.deepcopy(state))
    return out


def _update_publish_state(
    previous: Dict[str, Any],
    *,
    state: str,
    now_ts: int,
    identity: Dict[str, Any],
    git_meta: Dict[str, Any],
    current_bpmn: Dict[str, Any] | None = None,
    error: str = "",
) -> Dict[str, Any]:
    out = _default_publish_state()
    out.update(copy.deepcopy(previous or {}))
    out["schema_version"] = "git_mirror_publish_v1"
    out["mirror_state"] = state
    out["last_attempt_at"] = now_ts
    out["last_error"] = _as_text(error) or None
    out["identity"] = copy.deepcopy(identity or {})
    out["git"] = copy.deepcopy(git_meta or {})
    if isinstance(current_bpmn, dict) and current_bpmn:
        out["current_bpmn"] = copy.deepcopy(current_bpmn)
    elif not isinstance(out.get("current_bpmn"), dict):
        out["current_bpmn"] = {}
    return out


def _resolve_workspace_id(project_id: str, org_id: str) -> str:
    pid = _as_text(project_id)
    if not pid:
        return "workspace_unknown"
    try:
        proj = get_project_storage().load(pid, org_id=org_id, is_admin=True)
    except Exception:
        proj = None
    workspace_id = _as_text(getattr(proj, "workspace_id", "") if proj is not None else "")
    return workspace_id or "workspace_unknown"


def _resolve_xml_for_publish(sess: Session) -> str:
    xml = str(getattr(sess, "bpmn_xml", "") or "")
    if xml.strip():
        return xml
    if len(getattr(sess, "nodes", []) or []) <= 0 and len(getattr(sess, "edges", []) or []) <= 0:
        return ""
    return export_session_to_bpmn_xml(sess)


def _assemble_publish_artifacts(
    sess: Session,
    *,
    org_id: str,
    user_id: str,
    provider: str,
    repository: str,
    branch: str,
    base_path: str,
    version_number: int,
    now_ts: int,
) -> Dict[str, Any]:
    xml = _resolve_xml_for_publish(sess)
    if not xml.strip():
        raise PublishGitMirrorError("BPMN XML is empty, publish mirror cannot proceed.", code="empty_bpmn_xml")

    session_id = _safe_segment(getattr(sess, "id", ""), "session_unknown")
    project_id = _safe_segment(getattr(sess, "project_id", ""), "project_unknown")
    workspace_id = _safe_segment(_resolve_workspace_id(getattr(sess, "project_id", ""), org_id), "workspace_unknown")
    org_segment = _safe_segment(org_id, "org_unknown")

    identity = {
        "org_id": org_segment,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "session_id": session_id,
    }

    version_number = max(1, int(version_number or 1))
    version_id = f"v{version_number:03d}"
    version_file = f"versions/{version_id}.bpmn"
    published_at = _to_iso(now_ts)
    xml_sha256 = _sha256_hex(xml)
    graph_fingerprint = _as_text(getattr(sess, "bpmn_graph_fingerprint", "")) or _sha256_hex(xml)[:16]

    repo_root_parts = []
    norm_base = _normalize_base_path(base_path)
    if norm_base:
        repo_root_parts.append(norm_base)
    repo_root_parts.extend(
        [
            f"orgs/{org_segment}",
            f"workspaces/{workspace_id}",
            f"projects/{project_id}",
            f"sessions/{session_id}",
        ]
    )
    repo_root = "/".join(repo_root_parts)

    bpmn_meta = getattr(sess, "bpmn_meta", {})
    if not isinstance(bpmn_meta, dict):
        bpmn_meta = {}

    properties_payload = _build_properties_snapshot(xml)
    robot_meta_payload = {
        "schema_version": "robot_meta_snapshot_v1",
        "session_id": session_id,
        "by_element_id": copy.deepcopy(bpmn_meta.get("robot_meta_by_element_id", {})),
    }
    node_red_payload = {
        "schema_version": "node_red_snapshot_v1",
        "session_id": session_id,
        "node_path_meta": copy.deepcopy(bpmn_meta.get("node_path_meta", {})),
        "execution_plans": copy.deepcopy(bpmn_meta.get("execution_plans", [])),
    }

    manifest_payload = {
        "schema_version": "processmap_publish_manifest_v1",
        "artifact_type": "processmap_published_session",
        "identity": identity,
        "current_bpmn": {
            "version_id": version_id,
            "version_number": version_number,
            "file": version_file,
            "published_at": published_at,
            "published_by_user_id": _as_text(user_id) or None,
            "xml_sha256": xml_sha256,
            "bpmn_graph_fingerprint": graph_fingerprint,
        },
        "sidecars": {
            "manifest": "manifest.json",
            "properties": "properties.json",
            "robot_meta": "robot_meta.json",
            "node_red": "node_red.json",
        },
        "git": {
            "provider": provider,
            "repository": repository,
            "branch": branch,
            "repo_path": repo_root,
            "commit_sha": "",
        },
    }

    files = {
        f"{repo_root}/{version_file}": xml,
        f"{repo_root}/manifest.json": json.dumps(manifest_payload, ensure_ascii=False, indent=2),
        f"{repo_root}/properties.json": json.dumps(properties_payload, ensure_ascii=False, indent=2),
        f"{repo_root}/robot_meta.json": json.dumps(robot_meta_payload, ensure_ascii=False, indent=2),
        f"{repo_root}/node_red.json": json.dumps(node_red_payload, ensure_ascii=False, indent=2),
    }

    return {
        "identity": identity,
        "repo_root": repo_root,
        "manifest": manifest_payload,
        "current_bpmn": manifest_payload.get("current_bpmn", {}),
        "files": files,
    }


def _request_json(
    method: str,
    url: str,
    *,
    headers: Dict[str, str],
    params: Dict[str, Any] | None = None,
    payload: Dict[str, Any] | None = None,
    timeout_sec: int = 25,
) -> Tuple[int, Any, str]:
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        params=params,
        json=payload,
        timeout=timeout_sec,
    )
    text = str(response.text or "")
    data: Any = None
    if text.strip():
        try:
            data = response.json()
        except Exception:
            data = None
    return int(response.status_code), data, text


def _require_token(env_name: str, provider: str) -> str:
    token = _as_text(os.getenv(env_name, ""))
    if token:
        return token
    raise PublishGitMirrorError(
        f"{provider} token is not configured in server environment.",
        code=f"missing_{provider}_token",
    )


def _github_commit_files(
    *,
    repository: str,
    branch: str,
    files: Dict[str, str],
    commit_message: str,
) -> str:
    token = _require_token("GIT_MIRROR_GITHUB_TOKEN", "github")
    base_url = _as_text(os.getenv("GIT_MIRROR_GITHUB_API_BASE", "https://api.github.com")).rstrip("/")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    }

    status, data, body = _request_json(
        "GET",
        f"{base_url}/repos/{repository}/git/ref/heads/{branch}",
        headers=headers,
    )
    if status != 200 or not isinstance(data, dict):
        raise PublishGitMirrorError(
            f"GitHub branch lookup failed ({status}): {body[:240]}",
            code="github_branch_lookup_failed",
        )
    base_commit_sha = _as_text(((data.get("object") or {}) if isinstance(data, dict) else {}).get("sha"))
    if not base_commit_sha:
        raise PublishGitMirrorError("GitHub branch head sha is empty.", code="github_branch_head_missing")

    status, commit_data, body = _request_json(
        "GET",
        f"{base_url}/repos/{repository}/git/commits/{base_commit_sha}",
        headers=headers,
    )
    if status != 200 or not isinstance(commit_data, dict):
        raise PublishGitMirrorError(
            f"GitHub commit load failed ({status}): {body[:240]}",
            code="github_head_commit_load_failed",
        )
    base_tree_sha = _as_text(((commit_data.get("tree") or {}) if isinstance(commit_data, dict) else {}).get("sha"))
    if not base_tree_sha:
        raise PublishGitMirrorError("GitHub base tree sha is empty.", code="github_base_tree_missing")

    tree_entries: List[Dict[str, Any]] = []
    for path, content in sorted(files.items()):
        status, blob_data, body = _request_json(
            "POST",
            f"{base_url}/repos/{repository}/git/blobs",
            headers=headers,
            payload={"content": str(content or ""), "encoding": "utf-8"},
        )
        if status not in (200, 201) or not isinstance(blob_data, dict):
            raise PublishGitMirrorError(
                f"GitHub blob create failed ({status}) for {path}: {body[:240]}",
                code="github_blob_create_failed",
            )
        blob_sha = _as_text(blob_data.get("sha"))
        if not blob_sha:
            raise PublishGitMirrorError(
                f"GitHub blob sha is empty for {path}.",
                code="github_blob_sha_missing",
            )
        tree_entries.append(
            {
                "path": path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_sha,
            }
        )

    status, tree_data, body = _request_json(
        "POST",
        f"{base_url}/repos/{repository}/git/trees",
        headers=headers,
        payload={
            "base_tree": base_tree_sha,
            "tree": tree_entries,
        },
    )
    if status not in (200, 201) or not isinstance(tree_data, dict):
        raise PublishGitMirrorError(
            f"GitHub tree create failed ({status}): {body[:240]}",
            code="github_tree_create_failed",
        )
    tree_sha = _as_text(tree_data.get("sha"))
    if not tree_sha:
        raise PublishGitMirrorError("GitHub tree sha is empty.", code="github_tree_sha_missing")

    status, new_commit_data, body = _request_json(
        "POST",
        f"{base_url}/repos/{repository}/git/commits",
        headers=headers,
        payload={
            "message": commit_message,
            "tree": tree_sha,
            "parents": [base_commit_sha],
        },
    )
    if status not in (200, 201) or not isinstance(new_commit_data, dict):
        raise PublishGitMirrorError(
            f"GitHub commit create failed ({status}): {body[:240]}",
            code="github_commit_create_failed",
        )
    commit_sha = _as_text(new_commit_data.get("sha"))
    if not commit_sha:
        raise PublishGitMirrorError("GitHub commit sha is empty.", code="github_commit_sha_missing")

    status, _, body = _request_json(
        "PATCH",
        f"{base_url}/repos/{repository}/git/refs/heads/{branch}",
        headers=headers,
        payload={"sha": commit_sha, "force": False},
    )
    if status not in (200, 201):
        raise PublishGitMirrorError(
            f"GitHub branch update failed ({status}): {body[:240]}",
            code="github_branch_update_failed",
        )
    return commit_sha


def _gitlab_file_exists(
    *,
    base_url: str,
    project_slug: str,
    branch: str,
    file_path: str,
    headers: Dict[str, str],
) -> bool:
    encoded_project = quote(project_slug, safe="")
    encoded_path = quote(file_path, safe="")
    status, _, _ = _request_json(
        "GET",
        f"{base_url}/projects/{encoded_project}/repository/files/{encoded_path}",
        headers=headers,
        params={"ref": branch},
    )
    if status == 200:
        return True
    if status == 404:
        return False
    raise PublishGitMirrorError(
        f"GitLab file existence check failed ({status}) for {file_path}.",
        code="gitlab_file_lookup_failed",
    )


def _gitlab_commit_files(
    *,
    repository: str,
    branch: str,
    files: Dict[str, str],
    commit_message: str,
) -> str:
    token = _require_token("GIT_MIRROR_GITLAB_TOKEN", "gitlab")
    base_url = _as_text(os.getenv("GIT_MIRROR_GITLAB_API_BASE", "https://gitlab.com/api/v4")).rstrip("/")
    headers = {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
    }
    actions: List[Dict[str, Any]] = []
    for file_path, content in sorted(files.items()):
        exists = _gitlab_file_exists(
            base_url=base_url,
            project_slug=repository,
            branch=branch,
            file_path=file_path,
            headers=headers,
        )
        actions.append(
            {
                "action": "update" if exists else "create",
                "file_path": file_path,
                "content": str(content or ""),
                "encoding": "text",
            }
        )

    encoded_project = quote(repository, safe="")
    status, data, body = _request_json(
        "POST",
        f"{base_url}/projects/{encoded_project}/repository/commits",
        headers=headers,
        payload={
            "branch": branch,
            "commit_message": commit_message,
            "actions": actions,
        },
    )
    if status not in (200, 201) or not isinstance(data, dict):
        raise PublishGitMirrorError(
            f"GitLab commit create failed ({status}): {body[:240]}",
            code="gitlab_commit_create_failed",
        )
    commit_sha = _as_text(data.get("id"))
    if not commit_sha:
        raise PublishGitMirrorError("GitLab commit sha is empty.", code="gitlab_commit_sha_missing")
    return commit_sha


def _commit_publish_artifacts_to_provider(
    *,
    provider: str,
    repository: str,
    branch: str,
    files: Dict[str, str],
    commit_message: str,
) -> str:
    provider_norm = _as_text(provider).lower()
    if provider_norm == "github":
        return _github_commit_files(
            repository=repository,
            branch=branch,
            files=files,
            commit_message=commit_message,
        )
    if provider_norm == "gitlab":
        return _gitlab_commit_files(
            repository=repository,
            branch=branch,
            files=files,
            commit_message=commit_message,
        )
    raise PublishGitMirrorError(
        f"Unsupported git mirror provider: {provider_norm or 'empty'}.",
        code="unsupported_provider",
    )


def execute_git_mirror_publish(
    sess: Session,
    *,
    org_id: str,
    user_id: str = "",
) -> Dict[str, Any]:
    now_ts = _now_ts()
    interview = dict(getattr(sess, "interview", {}) or {})
    previous_state = _read_publish_state(interview)
    current_bpmn_existing = previous_state.get("current_bpmn") if isinstance(previous_state.get("current_bpmn"), dict) else {}

    org_raw = _as_text(org_id)
    org_segment = _safe_segment(org_raw, "org_unknown")
    config_raw = get_org_git_mirror_config(org_raw)
    evaluated = evaluate_org_git_mirror_config(config_raw)

    provider = _as_text(evaluated.get("git_provider"))
    repository = _as_text(evaluated.get("git_repository"))
    branch = _as_text(evaluated.get("git_branch"))
    base_path = _as_text(evaluated.get("git_base_path"))

    git_meta_base = {
        "provider": provider or None,
        "repository": repository or None,
        "branch": branch or None,
        "repo_path": None,
        "commit_sha": None,
    }
    identity_fallback = {
        "org_id": org_segment,
        "workspace_id": "workspace_unknown",
        "project_id": _safe_segment(getattr(sess, "project_id", ""), "project_unknown"),
        "session_id": _safe_segment(getattr(sess, "id", ""), "session_unknown"),
    }

    if not bool(evaluated.get("git_mirror_enabled")):
        state = _update_publish_state(
            previous_state,
            state=_STATE_SKIPPED_DISABLED,
            now_ts=now_ts,
            identity=identity_fallback,
            git_meta=git_meta_base,
            current_bpmn=current_bpmn_existing,
            error="mirror_disabled",
        )
        interview[_INTERVIEW_KEY] = state
        return {"ok": True, "state": _STATE_SKIPPED_DISABLED, "interview": interview, "commit_sha": ""}

    if _as_text(evaluated.get("git_health_status")) != "valid":
        state = _update_publish_state(
            previous_state,
            state=_STATE_SKIPPED_INVALID,
            now_ts=now_ts,
            identity=identity_fallback,
            git_meta=git_meta_base,
            current_bpmn=current_bpmn_existing,
            error=_as_text(evaluated.get("git_health_message")) or "invalid_mirror_config",
        )
        interview[_INTERVIEW_KEY] = state
        return {"ok": True, "state": _STATE_SKIPPED_INVALID, "interview": interview, "commit_sha": ""}

    try:
        next_version_number = increment_and_get_next_version(
            _as_text(getattr(sess, "id", "")),
            org_id=org_raw,
        )
        assembled = _assemble_publish_artifacts(
            sess,
            org_id=org_raw,
            user_id=user_id,
            provider=provider,
            repository=repository,
            branch=branch,
            base_path=base_path,
            version_number=next_version_number,
            now_ts=now_ts,
        )
        files = assembled.get("files") if isinstance(assembled, dict) else {}
        if not isinstance(files, dict) or not files:
            raise PublishGitMirrorError("Publish artifact set is empty.", code="empty_artifact_set")

        commit_message = (
            f"ProcessMap publish {assembled['current_bpmn']['version_id']} "
            f"(org={assembled['identity']['org_id']} "
            f"workspace={assembled['identity']['workspace_id']} "
            f"project={assembled['identity']['project_id']} "
            f"session={assembled['identity']['session_id']})"
        )
        commit_sha = _commit_publish_artifacts_to_provider(
            provider=provider,
            repository=repository,
            branch=branch,
            files=files,
            commit_message=commit_message,
        )
        current_bpmn = copy.deepcopy(assembled.get("current_bpmn") or {})
        git_meta = {
            "provider": provider,
            "repository": repository,
            "branch": branch,
            "repo_path": assembled.get("repo_root"),
            "commit_sha": commit_sha,
        }
        state = _update_publish_state(
            previous_state,
            state=_STATE_SYNCED,
            now_ts=now_ts,
            identity=assembled.get("identity") or identity_fallback,
            git_meta=git_meta,
            current_bpmn=current_bpmn,
            error="",
        )
        interview[_INTERVIEW_KEY] = state
        return {
            "ok": True,
            "state": _STATE_SYNCED,
            "interview": interview,
            "commit_sha": commit_sha,
            "artifacts": {
                "files": sorted(files.keys()),
                "repo_path": assembled.get("repo_root"),
                "version_id": current_bpmn.get("version_id"),
                "version_number": current_bpmn.get("version_number"),
            },
        }
    except Exception as exc:
        code = exc.code if isinstance(exc, PublishGitMirrorError) else "mirror_execution_failed"
        state = _update_publish_state(
            previous_state,
            state=_STATE_FAILED,
            now_ts=now_ts,
            identity=identity_fallback,
            git_meta=git_meta_base,
            current_bpmn=current_bpmn_existing,
            error=f"{code}: {str(exc)}",
        )
        interview[_INTERVIEW_KEY] = state
        return {
            "ok": False,
            "state": _STATE_FAILED,
            "interview": interview,
            "commit_sha": "",
            "error": str(exc),
            "error_code": code,
        }
