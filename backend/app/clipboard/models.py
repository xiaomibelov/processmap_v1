from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


CLIPBOARD_SCHEMA_VERSION = "pm_bpmn_task_clipboard_v1"
CLIPBOARD_ITEM_TYPE = "bpmn_task"


class ClipboardTaskContext(BaseModel):
    source_session_id: str
    source_element_id: str
    source_org_id: str = ""


class ClipboardTaskMetadata(BaseModel):
    copied_by_user_id: str
    copied_at: int


class ClipboardTaskElement(BaseModel):
    element_type: str
    name: str = ""
    documentation: str = ""
    bpmn_attributes: Dict[str, Any] = Field(default_factory=dict)
    extension_elements: Dict[str, Any] = Field(default_factory=dict)
    session_node: Optional[Dict[str, Any]] = None
    task_local_state: Dict[str, Any] = Field(default_factory=dict)


class ClipboardTaskPayload(BaseModel):
    schema_version: Literal["pm_bpmn_task_clipboard_v1"] = CLIPBOARD_SCHEMA_VERSION
    clipboard_item_type: Literal["bpmn_task"] = CLIPBOARD_ITEM_TYPE
    context: ClipboardTaskContext
    metadata: ClipboardTaskMetadata
    element: ClipboardTaskElement


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
