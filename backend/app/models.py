from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict


IssueType = Literal["CRITICAL", "MISSING", "VARIANT", "AMBIG", "LOSS"]


class Question(BaseModel):
    id: str
    node_id: str
    issue_type: IssueType
    question: str
    options: List[str] = Field(default_factory=list)
    target: Optional[Dict[str, Any]] = None
    status: Literal["open", "answered", "skipped"] = "open"
    answer: Optional[str] = None
    orphaned: bool = False


class Node(BaseModel):
    id: str
    type: Literal["step", "decision", "fork", "join", "loss_event", "timer", "message"] = "step"
    title: str
    actor_role: Optional[str] = None
    recipient_role: Optional[str] = None
    equipment: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    duration_min: Optional[int] = None
    qc: List[Dict[str, Any]] = Field(default_factory=list)
    exceptions: List[Dict[str, Any]] = Field(default_factory=list)
    disposition: Dict[str, Any] = Field(default_factory=dict)
    evidence: List[str] = Field(default_factory=list)
    confidence: float = 0.0


class Edge(BaseModel):
    from_id: str
    to_id: str
    when: Optional[str] = None


class ReportVersion(BaseModel):
    id: str
    session_id: str
    path_id: str
    version: int
    steps_hash: str
    created_at: int
    status: Literal["running", "ok", "error"] = "running"
    model: str = "deepseek-chat"
    prompt_template_version: str = "v2"
    request_payload_json: Dict[str, Any] = Field(default_factory=dict)
    payload_normalized: Dict[str, Any] = Field(default_factory=dict)
    payload_raw: Any = Field(default_factory=dict)
    report_json: Dict[str, Any] = Field(default_factory=dict)
    raw_json: Dict[str, Any] = Field(default_factory=dict)
    report_markdown: str = ""
    recommendations_json: List[Dict[str, Any]] = Field(default_factory=list)
    missing_data_json: List[Dict[str, Any]] = Field(default_factory=list)
    risks_json: List[Dict[str, Any]] = Field(default_factory=list)
    warnings_json: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None


class Session(BaseModel):
    id: str
    title: str
    roles: List[str] = Field(default_factory=list)
    start_role: Optional[str] = None
    project_id: Optional[str] = None
    mode: Optional[str] = None
    notes: str = ""
    notes_by_element: Dict[str, Any] = Field(default_factory=dict)
    interview: Dict[str, Any] = Field(default_factory=dict)
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)
    questions: List[Question] = Field(default_factory=list)
    mermaid: str = ""
    mermaid_simple: str = ""
    mermaid_lanes: str = ""
    normalized: Dict[str, Any] = Field(default_factory=dict)
    resources: Dict[str, Any] = Field(default_factory=dict)
    analytics: Dict[str, Any] = Field(default_factory=dict)
    ai_llm_state: Dict[str, Any] = Field(default_factory=dict)
    bpmn_xml: str = ""
    bpmn_xml_version: int = 0
    bpmn_graph_fingerprint: str = ""
    bpmn_meta: Dict[str, Any] = Field(default_factory=dict)
    version: int = 0
    owner_user_id: str = ""
    created_at: int = 0
    updated_at: int = 0
# -----------------------------
# Epic #1: Project (process passport)
# -----------------------------

class Project(BaseModel):
    """Top-level container for a production process discovery project.

    For MVP we keep `passport` flexible (dict) so the frontend can iterate without backend migrations.
    """

    id: str
    title: str

    # “Паспорт процесса” (onboarding fields): site_type, language/terms, units, standards, KPI, owner, etc.
    passport: Dict[str, Any] = Field(default_factory=dict)

    created_at: int = 0
    updated_at: int = 0
    version: int = 1
    owner_user_id: str = ""

    model_config = ConfigDict(extra="allow")


class CreateProjectIn(BaseModel):
    title: str
    passport: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class UpdateProjectIn(BaseModel):
    title: str | None = None
    passport: Dict[str, Any] | None = None

    model_config = ConfigDict(extra="allow")


class User(BaseModel):
    id: str
    email: str
    password_hash: str
    is_active: bool = True
    is_admin: bool = False
    created_at: int


class RefreshTokenRecord(BaseModel):
    id: str
    user_id: str
    jti: str
    issued_at: int
    expires_at: int
    revoked_at: Optional[int] = None
    replaced_by_jti: Optional[str] = None
    user_agent: Optional[str] = None
    ip: Optional[str] = None
