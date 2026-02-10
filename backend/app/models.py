from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


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


class Session(BaseModel):
    id: str
    title: str
    roles: List[str] = Field(default_factory=list)
    notes: str = ""
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)
    questions: List[Question] = Field(default_factory=list)
    mermaid: str = ""
    mermaid_simple: str = ""
    mermaid_lanes: str = ""
    normalized: Dict[str, Any] = Field(default_factory=dict)
    resources: Dict[str, Any] = Field(default_factory=dict)
    version: int = 0
