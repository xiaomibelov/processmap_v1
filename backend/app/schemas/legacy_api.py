from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class AuthLoginIn(BaseModel):
    email: str = Field(examples=["admin@local"])
    password: str = Field(examples=["admin"])


class AuthTokenOut(BaseModel):
    access_token: str = Field(examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])
    token_type: str = "bearer"

    model_config = ConfigDict(
        json_schema_extra={"example": {"access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "token_type": "bearer"}}
    )


class AuthMeOut(BaseModel):
    id: str = Field(examples=["user_123"])
    email: str = Field(examples=["admin@local"])
    is_admin: bool = False
    role: str = ""
    active_org_id: str = ""
    default_org_id: str = ""
    orgs: List[Dict[str, Any]] = []
    groups: List[Dict[str, Any]] = []

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "user_123",
                "email": "admin@local",
                "is_admin": True,
                "active_org_id": "org_default",
                "default_org_id": "org_default",
                "orgs": [{"id": "org_default", "name": "Default"}],
                "groups": [],
            }
        }
    )


class OrgCreateIn(BaseModel):
    name: str
    id: Optional[str] = None


class OrgPatchIn(BaseModel):
    name: str


class OrgGitMirrorPatchIn(BaseModel):
    git_mirror_enabled: Optional[bool] = None
    git_provider: Optional[str] = None
    git_repository: Optional[str] = None
    git_branch: Optional[str] = None
    git_base_path: Optional[str] = None


class ProjectMemberUpsertIn(BaseModel):
    user_id: str
    role: str


class ProjectMemberPatchIn(BaseModel):
    role: str


class OrgMemberPatchIn(BaseModel):
    role: str


class OrgInviteCreateIn(BaseModel):
    email: str
    full_name: Optional[str] = ""
    job_title: Optional[str] = ""
    role: Optional[str] = "viewer"
    ttl_days: Optional[int] = 7
    regenerate: Optional[bool] = False
    permissions: Optional[Dict[str, bool]] = Field(default_factory=dict)
    model_config = ConfigDict(extra="allow")


class OrgInviteAcceptIn(BaseModel):
    token: str


class InvitePreviewIn(BaseModel):
    token: Optional[str] = None
    invite_key: Optional[str] = None
    key: Optional[str] = None


class InviteActivateIn(BaseModel):
    token: Optional[str] = None
    invite_key: Optional[str] = None
    key: Optional[str] = None
    password: str
    password_confirm: Optional[str] = None


class CreateSessionIn(BaseModel):
    title: str = Field(examples=["New process"])
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    ai_prep_questions: Optional[List[Dict[str, Any]]] = None
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "title": "New process",
                "roles": ["operator", "qa"],
                "start_role": "operator",
                "ai_prep_questions": [{"text": "What is the first step?"}],
            }
        },
    )


class UpdateSessionIn(BaseModel):
    title: Optional[str] = Field(default=None, examples=["Updated title"])
    status: Optional[str] = Field(default=None, examples=["draft"])
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    notes: Optional[Any] = None
    notes_by_element: Optional[Any] = None
    interview: Optional[Any] = None
    nodes: Optional[Any] = None
    edges: Optional[Any] = None
    questions: Optional[Any] = None
    bpmn_meta: Optional[Any] = None
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[2])
    base_bpmn_xml_version: Optional[int] = Field(default=None, examples=[1])
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "title": "Updated process title",
                "status": "draft",
                "base_diagram_state_version": 2,
                "base_bpmn_xml_version": 1,
            }
        },
    )


class SessionPresenceTouchIn(BaseModel):
    client_id: str
    surface: Optional[str] = "process_stage"
    # Soft-lock (feature/async-save-pipeline-step2, API.md §4): advisory-only,
    # никаких проверок на write-путях. Пустая строка = снятие.
    editing_element_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("editingElementId", "editing_element_id"),
    )

    @field_validator("editing_element_id")
    @classmethod
    def _validate_editing_element_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if len(text) > 64:
            raise ValueError("editingElementId must be at most 64 chars")
        if not re.fullmatch(r"[A-Za-z0-9_:\-.]+", text):
            raise ValueError("editingElementId must be a valid bpmn element id")
        return text

    model_config = ConfigDict(extra="allow")


ALLOWED_PROJECT_SESSION_MODES = ("quick_skeleton", "deep_audit")


def norm_project_session_mode(mode: str | None) -> str | None:
    if mode is None:
        return None
    normalized = str(mode).strip().lower()
    if not normalized:
        return None
    aliases = {
        "quick": "quick_skeleton",
        "qs": "quick_skeleton",
        "skeleton": "quick_skeleton",
        "deep": "deep_audit",
        "da": "deep_audit",
        "audit": "deep_audit",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in ALLOWED_PROJECT_SESSION_MODES:
        return None
    return normalized


class NotesIn(BaseModel):
    notes: str = Field(examples=["Initial process notes"])
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[2])
    base_bpmn_xml_version: Optional[int] = Field(default=None, examples=[1])
    rev: Optional[int] = Field(default=None, examples=[1])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "notes": "Initial process notes",
                "base_diagram_state_version": 2,
                "base_bpmn_xml_version": 1,
                "rev": 1,
            }
        }
    )


class NotesExtractionPreviewIn(BaseModel):
    notes: str
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None
    options: Optional[Dict[str, Any]] = None


class NotesExtractionApplyIn(BaseModel):
    notes: Optional[str] = None
    input_hash: Optional[str] = None
    draft_id: Optional[str] = None
    source: Optional[str] = None
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    nodes: Optional[Any] = None
    edges: Optional[Any] = None
    questions: Optional[Any] = None
    apply_notes: Optional[bool] = False
    apply_roles: Optional[bool] = False
    apply_nodes_edges: Optional[bool] = False
    apply_questions: Optional[bool] = False
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None
    options: Optional[Dict[str, Any]] = None


class AnswerIn(BaseModel):
    question_id: str
    answer: str
    node_id: Optional[str] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


class NodePatchIn(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: Optional[List[str]] = None
    duration_min: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    disposition: Optional[Dict[str, Any]] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


class CreateNodeIn(BaseModel):
    id: Optional[str] = None
    title: str
    type: str = "step"
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: Optional[List[str]] = None
    duration_min: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    disposition: Optional[Dict[str, Any]] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


class CreateEdgeIn(BaseModel):
    from_id: str
    to_id: str
    when: Optional[str] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


class GlossaryAddIn(BaseModel):
    kind: str
    term: str
    canon: Optional[str] = None
    title: Optional[str] = None


class LlmSettingsIn(BaseModel):
    api_key: str = ""
    base_url: str = ""


class LlmVerifyIn(BaseModel):
    api_key: str = ""
    base_url: str = ""


class AiQuestionsIn(BaseModel):
    limit: int = 10
    mode: str = "strict"
    reset: bool = False
    node_id: Optional[str] = None
    step_id: Optional[str] = None


class SessionTitleQuestionsIn(BaseModel):
    title: str
    prompt: str = ""
    min_questions: int = 15
    max_questions: int = 20
    project_id: str = ""
    options: Optional[Dict[str, Any]] = None


class BpmnXmlIn(BaseModel):
    xml: str = Field(default="", examples=["<?xml version=\"1.0\"?>..."])
    bpmn_meta: Optional[Dict[str, Any]] = None
    source_action: Optional[str] = Field(default=None, examples=["manual_save"])
    import_note: Optional[str] = Field(default=None, examples=["Imported from Camunda"])
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[2])
    base_bpmn_xml_version: Optional[int] = Field(default=None, examples=[1])
    rev: Optional[int] = Field(default=None, examples=[1])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><bpmn:definitions>...</bpmn:definitions>",
                "source_action": "manual_save",
                "base_diagram_state_version": 2,
            }
        }
    )


class SessionOperationsIn(BaseModel):
    """Батч diagram-ops для POST /api/sessions/{id}/operations.

    Валидация payload per type — серверный applier (ops_applier), который
    отдаёт типизированные ошибки (opId/type/reason) → 422. Здесь — только
    границы батча и обязательность opId/type (API.md §2).
    """

    baseVersion: Optional[int] = Field(default=None, examples=[42])
    operations: List[Dict[str, Any]] = Field(default_factory=list)

    @field_validator("operations")
    @classmethod
    def _validate_operations(cls, value: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not isinstance(value, list):
            raise ValueError("operations must be a list")
        if not 1 <= len(value) <= 200:
            raise ValueError("operations must contain 1..200 items")
        for index, op in enumerate(value):
            if not isinstance(op, dict):
                raise ValueError(f"operations[{index}] must be an object")
            op_id = str(op.get("opId") or "").strip()
            op_type = str(op.get("type") or "").strip()
            if not op_id:
                raise ValueError(f"operations[{index}].opId is required")
            if not op_type:
                raise ValueError(f"operations[{index}].type is required")
            op["opId"] = op_id
            op["type"] = op_type
        # Дубликат opId внутри батча — невалидный payload клиента: иначе
        # integrity error на INSERT session_applied_ops маппится в 409
        # SESSION_WRITE_CONFLICT вместо честного 422 (review NIT-3).
        seen_op_ids = set()
        for op in value:
            op_id = str(op.get("opId") or "").strip()
            if op_id in seen_op_ids:
                raise ValueError(f"duplicate opId in operations: {op_id}")
            seen_op_ids.add(op_id)
        return value

    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "baseVersion": 42,
                "operations": [
                    {
                        "opId": "8f6b2c4e-0000-4000-8000-000000000001",
                        "type": "element.updateProperties",
                        "elementId": "Activity_1",
                        "properties": {"name": "Новое имя"},
                    }
                ],
            }
        },
    )


class BpmnVersionCreateIn(BaseModel):
    source_action: Optional[str] = Field(default="agent_edit", examples=["agent_edit"])
    import_note: Optional[str] = Field(default=None, examples=["Snapshot before agent edit"])


class BpmnMetaPatchIn(BaseModel):
    flowId: Optional[str] = Field(default=None, examples=["Flow_1"])
    happy: Optional[bool] = None
    tier: Optional[str] = Field(default=None, examples=["high"])
    rtier: Optional[str] = None
    updates: Optional[List[Dict[str, Any]]] = None
    flow_meta: Optional[Dict[str, Any]] = None
    node_id: Optional[str] = Field(default=None, examples=["Task_1"])
    paths: Optional[List[str]] = None
    sequence_key: Optional[str] = None
    source: Optional[str] = Field(default=None, examples=["ui"])
    node_updates: Optional[List[Dict[str, Any]]] = None
    node_path_meta: Optional[Dict[str, Any]] = None
    robot_element_id: Optional[str] = None
    robot_meta: Optional[Dict[str, Any]] = None
    remove_robot_meta: Optional[bool] = None
    robot_updates: Optional[List[Dict[str, Any]]] = None
    robot_meta_by_element_id: Optional[Dict[str, Any]] = None
    hybrid_layer_by_element_id: Optional[Dict[str, Any]] = None
    hybrid_v2: Optional[Dict[str, Any]] = None
    drawio: Optional[Dict[str, Any]] = None
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[2])
    base_bpmn_xml_version: Optional[int] = Field(default=None, examples=[1])
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "flowId": "Flow_1",
                "happy": True,
                "tier": "high",
                "node_id": "Task_1",
                "source": "ui",
                "base_diagram_state_version": 2,
            }
        },
    )


class StatusPatchIn(BaseModel):
    status: str = Field(examples=["published"])
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[2])
    reason: Optional[str] = Field(default=None, examples=["Approved for publication"])
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "status": "published",
                "base_diagram_state_version": 2,
                "reason": "Approved for publication",
            }
        },
    )


class InferRtiersIn(BaseModel):
    scopeStartId: Optional[str] = None
    successEndIds: Optional[List[str]] = None
    failEndIds: Optional[List[str]] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class BpmnRestoreIn(BaseModel):
    base_diagram_state_version: Optional[int] = Field(default=None, examples=[1])
    base_bpmn_xml_version: Optional[int] = Field(default=None, examples=[0])
    rev: Optional[int] = Field(default=None, examples=[1])
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "base_diagram_state_version": 1,
                "base_bpmn_xml_version": 0,
                "rev": 1,
            }
        },
    )


class CreatePathReportVersionIn(BaseModel):
    steps_hash: str
    request_payload_json: Dict[str, Any]
    prompt_template_version: str = "v2"
    model_config = ConfigDict(extra="allow")


class OrgReportBuildIn(CreatePathReportVersionIn):
    path_id: str


class SubprocessNavigateOut(BaseModel):
    subprocess_session_id: str
    subprocess_title: str = "Без названия"
    target_element_id: Optional[str] = None
    breadcrumbs: List[Dict[str, Any]] = []
    bpmn_xml: Optional[str] = None


class SubprocessReturnOut(BaseModel):
    parent_session_id: str
    element_id_in_parent: str


class SessionAssigneeOut(BaseModel):
    user_id: str
    email: str = ""
    full_name: str = ""
    job_title: str = ""
    display_name: str = ""


class SessionAssigneesReplaceIn(BaseModel):
    user_ids: List[str] = Field(default_factory=list)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "user_ids": ["user_1", "user_2"],
            }
        }
    )
