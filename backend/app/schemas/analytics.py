from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AnalyticsDashboardKpiOut(BaseModel):
    total_sessions: int = 0
    total_tasks: int = 0
    active_now: int = 0
    avg_session_duration_min: int = 0
    unique_processes: int = 0


class AnalyticsDashboardTaskStatusesOut(BaseModel):
    completed: int = 0
    active: int = 0
    failed: int = 0
    pending: int = 0


class AnalyticsDashboardTrendPointOut(BaseModel):
    period: str
    sessions: int = 0


class AnalyticsDashboardSessionTrendOut(BaseModel):
    granularity: str = "day"
    points: List[AnalyticsDashboardTrendPointOut] = Field(default_factory=list)


class AnalyticsDashboardProcessDurationOut(BaseModel):
    process_title: str
    avg_duration_min: int = 0
    sessions_count: int = 0


class AnalyticsDashboardActivityHeatmapOut(BaseModel):
    by_hour: List[int] = Field(default_factory=lambda: [0] * 24)
    by_weekday: List[int] = Field(default_factory=lambda: [0] * 7)


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
    kpi: AnalyticsDashboardKpiOut = Field(default_factory=AnalyticsDashboardKpiOut)
    task_statuses: AnalyticsDashboardTaskStatusesOut = Field(default_factory=AnalyticsDashboardTaskStatusesOut)
    session_trend: AnalyticsDashboardSessionTrendOut = Field(default_factory=AnalyticsDashboardSessionTrendOut)
    bpmn_element_types: Dict[str, int] = Field(default_factory=dict)
    process_duration: List[AnalyticsDashboardProcessDurationOut] = Field(default_factory=list)
    activity_heatmap: AnalyticsDashboardActivityHeatmapOut = Field(default_factory=AnalyticsDashboardActivityHeatmapOut)


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
