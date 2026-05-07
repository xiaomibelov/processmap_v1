from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class AuthLoginIn(BaseModel):
    email: str
    password: str


class AuthTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthMeOut(BaseModel):
    id: str
    email: str
    is_admin: bool = False
    active_org_id: str = ""
    default_org_id: str = ""
    orgs: List[Dict[str, Any]] = []


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
    title: str
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    ai_prep_questions: Optional[List[Dict[str, Any]]] = None
    model_config = ConfigDict(extra="allow")


class UpdateSessionIn(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    roles: Optional[Any] = None
    start_role: Optional[str] = None
    notes: Optional[Any] = None
    notes_by_element: Optional[Any] = None
    interview: Optional[Any] = None
    nodes: Optional[Any] = None
    edges: Optional[Any] = None
    questions: Optional[Any] = None
    bpmn_meta: Optional[Any] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class SessionPresenceTouchIn(BaseModel):
    client_id: str
    surface: Optional[str] = "process_stage"
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
    notes: str
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


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
    xml: str = ""
    bpmn_meta: Optional[Dict[str, Any]] = None
    source_action: Optional[str] = None
    import_note: Optional[str] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None


class BpmnMetaPatchIn(BaseModel):
    flowId: Optional[str] = None
    happy: Optional[bool] = None
    tier: Optional[str] = None
    rtier: Optional[str] = None
    updates: Optional[List[Dict[str, Any]]] = None
    flow_meta: Optional[Dict[str, Any]] = None
    node_id: Optional[str] = None
    paths: Optional[List[str]] = None
    sequence_key: Optional[str] = None
    source: Optional[str] = None
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
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class InferRtiersIn(BaseModel):
    scopeStartId: Optional[str] = None
    successEndIds: Optional[List[str]] = None
    failEndIds: Optional[List[str]] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class BpmnRestoreIn(BaseModel):
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None
    model_config = ConfigDict(extra="allow")


class CreatePathReportVersionIn(BaseModel):
    steps_hash: str
    request_payload_json: Dict[str, Any]
    prompt_template_version: str = "v2"
    model_config = ConfigDict(extra="allow")


class OrgReportBuildIn(CreatePathReportVersionIn):
    path_id: str
