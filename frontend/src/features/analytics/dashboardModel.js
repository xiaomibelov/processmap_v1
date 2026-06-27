export function sessionAnalyticsToCards(analytics = {}) {
  const timing = analytics.timing || {};
  const actions = analytics.actions || {};
  const handoffs = analytics.handoffs || {};
  const coverage = analytics.coverage || {};

  const cards = [
    {
      title: "Длительность",
      value: `${timing.total_duration_min ?? 0} мин`,
      subtitle:
        timing.critical_path_min != null
          ? `Крит. путь: ${timing.critical_path_min} мин`
          : "Крит. путь: N/A",
      tone: "default",
      testId: "metric-duration",
    },
    {
      title: "Действий",
      value: String(actions.total ?? 0),
      subtitle: "Всего шагов",
      tone: "default",
      testId: "metric-actions",
    },
    {
      title: "Передач между ролями",
      value: String(handoffs.count ?? 0),
      subtitle: "Handoffs",
      tone: handoffs.count > 5 ? "warning" : "default",
      testId: "metric-handoffs",
    },
    {
      title: "Открытые вопросы",
      value: String(coverage.open_questions ?? 0),
      subtitle:
        coverage.critical_questions > 0
          ? `Критических: ${coverage.critical_questions}`
          : "",
      tone: coverage.critical_questions > 0 ? "danger" : "default",
      testId: "metric-questions",
    },
  ];

  return cards;
}

export function sessionAnalyticsToBarChartItems(analytics = {}) {
  const actions = analytics.actions || {};
  const byRole = actions.by_role || {};

  const items = Object.entries(byRole).map(([label, value]) => ({
    label,
    value: Number(value || 0),
    max: Math.max(...Object.values(byRole).map((v) => Number(v || 0)), 1),
  }));

  return items;
}

export function normalizeProjectAnalyticsCards(data = {}) {
  const sessionsCount = Number(data.sessions_count ?? 0);
  const totalActions = Number(data.total_actions ?? 0);
  const avgDuration = Number(data.avg_duration_min ?? 0);
  const totalCritical = Number(data.total_critical_questions ?? 0);

  return [
    {
      title: "Сессий",
      value: String(sessionsCount),
      tone: "default",
      testId: "metric-project-sessions",
    },
    {
      title: "Всего действий",
      value: String(totalActions),
      tone: "default",
      testId: "metric-project-actions",
    },
    {
      title: "Средняя длительность",
      value: `${avgDuration.toFixed(1)} мин`,
      tone: "default",
      testId: "metric-project-duration",
    },
    {
      title: "Критических вопросов",
      value: String(totalCritical),
      tone: totalCritical > 0 ? "warning" : "default",
      testId: "metric-project-critical",
    },
  ];
}

export function normalizeWorkspaceAnalyticsCards(data = {}) {
  const projectsCount = Number(data.projects_count ?? 0);
  const sessionsCount = Number(data.sessions_count ?? 0);
  const totalActions = Number(data.total_actions ?? 0);
  const avgDuration = Number(data.avg_duration_min ?? 0);

  return [
    {
      title: "Проектов",
      value: String(projectsCount),
      tone: "default",
      testId: "metric-workspace-projects",
    },
    {
      title: "Сессий",
      value: String(sessionsCount),
      tone: "default",
      testId: "metric-workspace-sessions",
    },
    {
      title: "Всего действий",
      value: String(totalActions),
      tone: "default",
      testId: "metric-workspace-actions",
    },
    {
      title: "Средняя длительность",
      value: `${avgDuration.toFixed(1)} мин`,
      tone: "default",
      testId: "metric-workspace-duration",
    },
  ];
}


export function sessionAnalyticsToBarChartItemsBySection(analytics = {}) {
  const actions = analytics.actions || {};
  const bySection = actions.by_section || {};

  const items = Object.entries(bySection).map(([label, value]) => ({
    label,
    value: Number(value || 0),
    max: Math.max(...Object.values(bySection).map((v) => Number(v || 0)), 1),
  }));

  return items;
}
export function computeBarChartMax(items = []) {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => Number(i.value || 0)), 1);
}

const STATUS_LABELS = {
  completed: "Выполнено",
  active: "Активно",
  pending: "Ожидает",
  failed: "Сбой",
};

const BPMN_LABELS = {
  task: "Задачи",
  gateway: "Шлюзы",
  event: "События",
  subprocess: "Подпроцессы",
};

export function dashboardDataToKpiCards(kpi = {}) {
  return [
    { title: "Всего сессий", value: String(kpi.total_sessions ?? 0), testId: "kpi-total-sessions", tone: "blue" },
    { title: "Всего задач", value: String(kpi.total_tasks ?? 0), testId: "kpi-total-tasks", tone: "teal" },
    { title: "Активно сейчас", value: String(kpi.active_now ?? 0), testId: "kpi-active-now", tone: "success" },
    {
      title: "Средняя длительность",
      value: `${kpi.avg_session_duration_min ?? 0} мин`,
      testId: "kpi-avg-duration",
      tone: "warning",
    },
    {
      title: "Уникальных процессов",
      value: String(kpi.unique_processes ?? 0),
      testId: "kpi-unique-processes",
      tone: "slate",
    },
  ];
}

export function dashboardDataToTaskStatusItems(data = {}) {
  const statuses = data.task_statuses || {};
  return Object.entries(STATUS_LABELS)
    .map(([key, label], idx) => ({
      label,
      value: Number(statuses[key] || 0),
      color: null,
      order: idx,
    }))
    .filter((i) => i.value > 0)
    .map((i, idx) => ({ ...i, color: defaultChartColor(idx) }));
}

export function dashboardDataToBpmnElementItems(data = {}) {
  const types = data.bpmn_element_types || {};
  return Object.entries(BPMN_LABELS)
    .map(([key, label], idx) => ({
      label,
      value: Number(types[key] || 0),
      color: null,
      order: idx,
    }))
    .filter((i) => i.value > 0)
    .map((i, idx) => ({ ...i, color: defaultChartColor(idx) }));
}

export function dashboardDataToSessionTrendItems(data = {}) {
  const points = data.session_trend?.points || [];
  return points.map((p, idx) => ({
    label: p.period ? String(p.period).slice(5) : `${idx}`,
    value: Number(p.sessions || 0),
    color: defaultChartColor(idx),
  }));
}

export function dashboardDataToProcessDurationItems(data = {}) {
  const list = data.process_duration || [];
  return list.map((p, idx) => ({
    label: String(p.process_title || "—"),
    value: Number(p.avg_duration_min || 0),
    sessions_count: Number(p.sessions_count || 0),
    color: defaultChartColor(idx),
  }));
}

export function hasActivityHeatmapData(data = {}) {
  const h = data.activity_heatmap;
  if (!h) return false;
  return (h.by_hour || []).some((v) => v > 0) || (h.by_weekday || []).some((v) => v > 0);
}

function defaultChartColor(idx) {
  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
    "#64748b",
  ];
  return colors[idx % colors.length];
}
