from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalyticsDashboardOut(BaseModel):
    scope_type: str
    scope_id: str
    total_duration_min: int = 0
    critical_path_min: Optional[int] = None
    actions_total: int = 0
    actions_by_role: Dict[str, int] = Field(default_factory=dict)
    actions_by_section: Dict[str, int] = Field(default_factory=dict)
    actions_by_type: Dict[str, int] = Field(default_factory=dict)
    handoffs_count: int = 0
    open_questions: int = 0
    critical_questions: int = 0
    sessions_count: int = 0
    projects_count: int = 0
    computed_at: int = 0


class AnalyticsPropertiesQuery(BaseModel):
    scope: str = "session"
    scope_id: str = ""
    page: int = 1
    limit: int = 50
    type_filter: List[str] = Field(default_factory=list)
    category_filter: List[str] = Field(default_factory=list)
    source_filter: List[str] = Field(default_factory=list)


class AnalyticsActionsQuery(BaseModel):
    scope: str = "session"
    scope_id: str = ""
    page: int = 1
    limit: int = 50
    section_filter: List[str] = Field(default_factory=list)
    role_filter: List[str] = Field(default_factory=list)
    type_filter: List[str] = Field(default_factory=list)
