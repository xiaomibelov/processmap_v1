import os
import tempfile
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.schemas.legacy_api import BpmnXmlIn
from app.startup.app_factory import create_app
import app._legacy_main as legacy_main
import app.storage as storage_module
from app.storage import (
    create_org_record,
    get_storage,
    list_session_children,
    upsert_org_membership,
    upsert_project_membership,
)


class _DummyRequest:
    def __init__(self, user, active_org_id):
        self.state = SimpleNamespace(auth_user=user, active_org_id=active_org_id)
        self.headers = {}


def _bpmn_with_subprocesses(ids):
    subs = "".join(f'<subProcess id="{sid}" name="Sub {sid}" />' for sid in ids)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="ns">'
        '<process id="p1">'
        '<startEvent id="start"/>'
        + subs
        + '<endEvent id="end"/>'
        '</process>'
        '</definitions>'
    )


def _headers(token, org_id):
    return {"Authorization": f"Bearer {token}", "X-Active-Org-Id": org_id}


def test_create_subprocesses_load_all_post_and_get_return_200():
    old_process_storage_dir = os.environ.get("PROCESS_STORAGE_DIR")
    old_project_storage_dir = os.environ.get("PROJECT_STORAGE_DIR")
    old_db_path = os.environ.get("PROCESS_DB_PATH")
    old_db_backend = os.environ.get("FPC_DB_BACKEND")
    old_database_url = os.environ.get("DATABASE_URL")
    temp_dir = tempfile.TemporaryDirectory()
    try:
        os.environ["PROCESS_STORAGE_DIR"] = os.path.join(temp_dir.name, "sessions")
        os.environ["PROJECT_STORAGE_DIR"] = os.path.join(temp_dir.name, "projects")
        os.environ["PROCESS_DB_PATH"] = os.path.join(temp_dir.name, "processmap.sqlite3")
        os.environ["FPC_DB_BACKEND"] = "sqlite"
        os.environ.pop("DATABASE_URL", None)
        os.environ.setdefault("JWT_SECRET", "test-secret")
        os.environ.setdefault("JWT_ISSUER", "test-issuer")
        os.environ.setdefault("JWT_AUDIENCE", "test-audience")

        from app.db.config import get_db_runtime_config

        get_db_runtime_config.cache_clear()
        storage_module._SCHEMA_READY = False
        storage_module._SCHEMA_DB_FILE = ""
        storage_module._PG_POOL = None

        client = TestClient(create_app())
        storage = get_storage()
        org_id = "org_create_subprocesses_regression"
        project_id = "proj_create_subprocesses_regression"
        owner = create_user("owner_create_subprocesses_regression@local", "password")
        editor = create_user("editor_create_subprocesses_regression@local", "password")
        create_org_record("Create Subprocess Regression", created_by=str(owner["id"]), org_id=org_id)
        upsert_org_membership(org_id, str(editor["id"]), "editor")
        upsert_project_membership(org_id, project_id, str(editor["id"]), "editor")
        sid = storage.create(
            title="root",
            user_id=str(owner["id"]),
            org_id=org_id,
            project_id=project_id,
        )
        legacy_main.session_bpmn_save(
            sid,
            BpmnXmlIn(xml=_bpmn_with_subprocesses([f"sub_{i}" for i in range(12)]), bpmn_meta={}),
            request=_DummyRequest(editor, org_id),
        )

        token = create_access_token(str(editor["id"]))
        post_response = client.post(
            f"/api/sessions/{sid}/create-subprocesses?load_all=true",
            headers=_headers(token, org_id),
        )
        assert post_response.status_code == 200
        assert post_response.json()["total"] == 12
        assert post_response.json()["has_more"] is False

        second_sid = storage.create(
            title="root get",
            user_id=str(owner["id"]),
            org_id=org_id,
            project_id=project_id,
        )
        legacy_main.session_bpmn_save(
            second_sid,
            BpmnXmlIn(xml=_bpmn_with_subprocesses([f"get_sub_{i}" for i in range(12)]), bpmn_meta={}),
            request=_DummyRequest(editor, org_id),
        )
        get_response = client.get(
            f"/api/sessions/{second_sid}/create-subprocesses?load_all=true",
            headers=_headers(token, org_id),
        )
        assert get_response.status_code == 200
        assert get_response.json()["created"] == 12
        assert get_response.json()["total"] == 12
        assert get_response.json()["has_more"] is False
        assert len(list_session_children(org_id, project_id, second_sid, user_id=str(editor["id"]))) == 12
    finally:
        temp_dir.cleanup()
        if old_process_storage_dir is None:
            os.environ.pop("PROCESS_STORAGE_DIR", None)
        else:
            os.environ["PROCESS_STORAGE_DIR"] = old_process_storage_dir
        if old_project_storage_dir is None:
            os.environ.pop("PROJECT_STORAGE_DIR", None)
        else:
            os.environ["PROJECT_STORAGE_DIR"] = old_project_storage_dir
        if old_db_path is None:
            os.environ.pop("PROCESS_DB_PATH", None)
        else:
            os.environ["PROCESS_DB_PATH"] = old_db_path
        if old_db_backend is None:
            os.environ.pop("FPC_DB_BACKEND", None)
        else:
            os.environ["FPC_DB_BACKEND"] = old_db_backend
        if old_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old_database_url
