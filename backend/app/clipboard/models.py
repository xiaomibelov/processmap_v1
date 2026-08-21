from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


CLIPBOARD_TASK_SCHEMA_VERSION = "pm_bpmn_task_clipboard_v1"
CLIPBOARD_TASK_ITEM_TYPE = "bpmn_task"
CLIPBOARD_SUBPROCESS_SCHEMA_VERSION = "pm_bpmn_subprocess_subtree_clipboard_v2"
CLIPBOARD_SUBPROCESS_ITEM_TYPE = "bpmn_subprocess_subtree"


class ClipboardContext(BaseModel):
    source_session_id: str
    source_element_id: str
    source_org_id: str = ""


class ClipboardMetadata(BaseModel):
    copied_by_user_id: str
    copied_at: int


class ClipboardElementBase(BaseModel):
    element_type: str
    name: str = ""
    documentation: str = ""
    bpmn_attributes: Dict[str, Any] = Field(default_factory=dict)
    extension_elements: Dict[str, Any] = Field(default_factory=dict)
    session_node: Optional[Dict[str, Any]] = None
    task_local_state: Dict[str, Any] = Field(default_factory=dict)
    extra_children: List[Dict[str, Any]] = Field(default_factory=list)


class ClipboardTaskElement(ClipboardElementBase):
    pass


class ClipboardTaskPayload(BaseModel):
    schema_version: Literal["pm_bpmn_task_clipboard_v1"] = CLIPBOARD_TASK_SCHEMA_VERSION
    clipboard_item_type: Literal["bpmn_task"] = CLIPBOARD_TASK_ITEM_TYPE
    context: ClipboardContext
    metadata: ClipboardMetadata
    element: ClipboardTaskElement


class ClipboardDiBounds(BaseModel):
    x: float
    y: float
    width: float
    height: float


class ClipboardDiWaypoint(BaseModel):
    x: float
    y: float


class ClipboardFragmentNode(ClipboardElementBase):
    old_id: str
    parent_old_id: str = ""
    nesting_depth: int = 0
    di_bounds: Optional[ClipboardDiBounds] = None
    di_shape_attributes: Dict[str, Any] = Field(default_factory=dict)


class ClipboardExternalDependency(ClipboardFragmentNode):
    dependency_kind: Literal["external_datastore"] = "external_datastore"


class ClipboardFragmentEdge(BaseModel):
    old_id: str
    edge_type: str = "sequenceFlow"
    parent_old_id: str = ""
    source_old_id: str
    target_old_id: str
    name: str = ""
    bpmn_attributes: Dict[str, Any] = Field(default_factory=dict)
    condition_expression: Union[str, Dict[str, Any]] = ""
    edge_local_state: Dict[str, Any] = Field(default_factory=dict)
    extra_children: List[Dict[str, Any]] = Field(default_factory=list)
    di_waypoints: List[ClipboardDiWaypoint] = Field(default_factory=list)
    di_edge_attributes: Dict[str, Any] = Field(default_factory=dict)


class ClipboardFragment(BaseModel):
    nodes: List[ClipboardFragmentNode] = Field(default_factory=list)
    edges: List[ClipboardFragmentEdge] = Field(default_factory=list)


class ClipboardSubprocessPayload(BaseModel):
    schema_version: Literal["pm_bpmn_subprocess_subtree_clipboard_v2"] = CLIPBOARD_SUBPROCESS_SCHEMA_VERSION
    clipboard_item_type: Literal["bpmn_subprocess_subtree"] = CLIPBOARD_SUBPROCESS_ITEM_TYPE
    context: ClipboardContext
    metadata: ClipboardMetadata
    root: ClipboardFragmentNode
    fragment: ClipboardFragment
    external_dependencies: List[ClipboardExternalDependency] = Field(default_factory=list)


class ClipboardPreview(BaseModel):
    schema_version: str
    clipboard_item_type: str
    element_type: str
    copied_name: str = ""
    source_session_id: str
    source_element_id: str
    copied_at: int
    expires_at: int


class ClipboardCopyResponse(BaseModel):
    ok: bool = True
    clipboard_item_type: str
    element_type: str
    copied_name: str = ""
    expires_at: int
    schema_version: str


class ClipboardReadResponse(BaseModel):
    ok: bool = True
    empty: bool = False
    item: Optional[ClipboardPreview] = None


class ClipboardClearResponse(BaseModel):
    ok: bool = True


class ClipboardPasteResponse(BaseModel):
    ok: bool = True
    clipboard_item_type: str
    target_session_id: str
    pasted_root_element_id: str
    created_node_ids: List[str] = Field(default_factory=list)
    created_edge_ids: List[str] = Field(default_factory=list)
    schema_version: str


ClipboardPayload = Union[ClipboardTaskPayload, ClipboardSubprocessPayload]
