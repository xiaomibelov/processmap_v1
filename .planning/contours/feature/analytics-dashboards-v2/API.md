# API — feature/analytics-dashboards-v2

## 1. Existing Endpoints (reused as-is)

### `GET /api/analytics/dashboard?scope={scope}&scope_id={id}`

Current response envelope:

```json
{
  "success": true,
  "data": {
    "scope_type": "project",
    "scope_id": "proj_123",
    "total_duration_min": 120,
    "critical_path_min": 45,
    "actions_total": 37,
    "actions_by_role": { "Шеф": 20, "Повар": 17 },
    "actions_by_section": { "prep": 10, "cook": 20, "qc": 7 },
    "actions_by_type": { "manual": 30, "auto": 7 },
    "handoffs_count": 4,
    "open_questions": 2,
    "critical_questions": 1,
    "sessions_count": 5,
    "projects_count": 1,
    "computed_at": 1719323456
  },
  "meta": { "scope_type": "project", "scope_id": "proj_123", "computed_at": 1719323456 }
}
```

### `GET /api/analytics/properties/summary?scope={scope}&scope_id={id}`

```json
{
  "success": true,
  "data": {
    "by_family": { "ingredient": 12, "equipment": 8 },
    "by_category": { "product": 15, "process": 5 },
    "by_value_type": { "string": 18, "number": 2 },
    "top_used": [
      { "name": "temperature", "usage_count": 42 },
      ...
    ]
  }
}
```

### `GET /api/analytics/actions/summary?scope={scope}&scope_id={id}`

```json
{
  "success": true,
  "data": {
    "by_role": { "Шеф": 20 },
    "by_section": { "prep": 10 },
    "by_type": { "manual": 30 }
  }
}
```

## 2. Proposed Backend Changes

### 2.1 Extend `GET /api/analytics/dashboard`

Add new top-level sections inside `data`:

```json
{
  "kpi": {
    "total_sessions": 5,
    "total_tasks": 37,
    "active_now": 2,
    "avg_session_duration_min": 24,
    "unique_processes": 1
  },
  "task_statuses": {
    "completed": 20,
    "active": 10,
    "failed": 4,
    "pending": 3
  },
  "session_trend": {
    "granularity": "day",
    "points": [
      { "period": "2026-06-20", "sessions": 1 },
      { "period": "2026-06-21", "sessions": 2 },
      { "period": "2026-06-22", "sessions": 0 },
      { "period": "2026-06-23", "sessions": 2 }
    ]
  },
  "bpmn_element_types": {
    "task": 12,
    "gateway": 4,
    "event": 6,
    "subprocess": 2
  },
  "process_duration": [
    { "process_title": "Процесс A", "avg_duration_min": 35, "sessions_count": 3 },
    { "process_title": "Процесс B", "avg_duration_min": 18, "sessions_count": 2 }
  ],
  "activity_heatmap": {
    "by_hour": [2, 5, 1, 0, 0, 1, 3, 8, 12, 10, 9, 11, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 1, 0],
    "by_weekday": [12, 18, 22, 19, 15, 8, 5]
  }
}
```

### 2.2 Schema Update

`backend/app/schemas/analytics.py`:

```python
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
    # ... existing fields ...
    kpi: AnalyticsDashboardKpiOut = Field(default_factory=AnalyticsDashboardKpiOut)
    task_statuses: AnalyticsDashboardTaskStatusesOut = Field(default_factory=AnalyticsDashboardTaskStatusesOut)
    session_trend: AnalyticsDashboardSessionTrendOut = Field(default_factory=AnalyticsDashboardSessionTrendOut)
    bpmn_element_types: Dict[str, int] = Field(default_factory=dict)
    process_duration: List[AnalyticsDashboardProcessDurationOut] = Field(default_factory=list)
    activity_heatmap: AnalyticsDashboardActivityHeatmapOut = Field(default_factory=AnalyticsDashboardActivityHeatmapOut)
```

### 2.3 Implementation Notes

- `total_tasks` — alias для `actions_total`.
- `active_now` — количество сессий со статусом `in_progress` в текущем scope.
- `avg_session_duration_min` — `total_duration_min / sessions_count` (round).
- `unique_processes` — для workspace: `projects_count`; для project: 1; для session: 0 или 1 (если у сессии есть project_id).
- `task_statuses` — если в analytics snapshot нет статусов задач, можно временно замапить `actions_by_type` или вернуть нули; финальная реализация требует расчёта из `bpmn_meta` / action rows.
- `session_trend` — группировка `sessions.created_at` по дням (для project/workspace) или пустой массив для session.
- `bpmn_element_types` — парсинг `bpmn_xml` сессий (сумма по scope) или чтение уже вычисленного `bpmn_graph_fingerprint`.
- `process_duration` — группировка сессий по `project_id` / `title` с расчётом средней длительности.
- `activity_heatmap` — агрегация по `sessions.updated_at` или `analytics_session_snapshots.computed_at`.

### 2.4 Alternative (if backend extension is rejected)

Add dedicated endpoints:
- `GET /api/analytics/kpi?scope=&scope_id=`
- `GET /api/analytics/task-statuses?scope=&scope_id=`
- `GET /api/analytics/session-trend?scope=&scope_id=&granularity=day`
- `GET /api/analytics/bpmn-element-types?scope=&scope_id=`
- `GET /api/analytics/process-duration?scope=&scope_id=`
- `GET /api/analytics/activity-heatmap?scope=&scope_id=`

Recommended: extend single `/dashboard` endpoint to avoid N+1 запросов с фронта.
