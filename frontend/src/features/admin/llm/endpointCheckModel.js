// Чистая логика панели «Проверка эндпоинтов»: сводка, бейдж, фильтры,
// подписи диффа, пустые состояния фильтров. Модуль dependency-free (без импортов),
// тестируется через node --test без vite/node_modules. Видимость по праву живёт в
// adminUtils.canOpenOrgSettings (как у кнопки «API Docs») и гейтится в
// AdminApp/AdminLlmPage — сюда не дублируется.

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value || "").trim();
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : Math.round(fallback || 0);
}

export const ENDPOINT_CHECK_FILTER_ALL = "all";
export const ENDPOINT_CHECK_FILTER_NEW = "new";
export const ENDPOINT_CHECK_FILTER_FAILING = "failing";
export const ENDPOINT_CHECK_FILTER_FIXED = "fixed";
export const ENDPOINT_CHECK_DEFAULT_FILTER = ENDPOINT_CHECK_FILTER_NEW;

export const ENDPOINT_CHECK_POLL_INTERVAL_MS = 7000;

const DIFF_LABELS = {
  new_error: "новая ошибка",
  new_domain_error: "новая доменная ошибка",
  still_failing: "всё ещё падает",
  still_domain_error: "доменная ошибка",
  fixed: "починилось",
  domain_fixed: "починилось (доменная)",
  ok: "ok",
  new_endpoint: "новый эндпоинт",
};

// Видимость панели = право кнопки «API Docs»: canOpenOrgSettings в
// adminUtils.js; гейт — AdminApp (canOpenApiDocs) → AdminLlmPage.

export function endpointCheckDiffGroup(diffStatusRaw) {
  const s = toText(diffStatusRaw).toLowerCase();
  if (s === "new_error" || s === "new_domain_error") return "new";
  if (s === "still_failing" || s === "still_domain_error") return "failing";
  if (s === "fixed" || s === "domain_fixed") return "fixed";
  if (s === "ok") return "ok";
  return "other"; // new_endpoint и неизвестные статусы
}

export function endpointCheckDiffLabel(diffStatusRaw) {
  const s = toText(diffStatusRaw).toLowerCase();
  return DIFF_LABELS[s] || toText(diffStatusRaw) || "—";
}

export function filterEndpointCheckResults(resultsRaw, filterRaw = ENDPOINT_CHECK_DEFAULT_FILTER) {
  const rows = asArray(resultsRaw);
  const filter = toText(filterRaw).toLowerCase() || ENDPOINT_CHECK_DEFAULT_FILTER;
  if (filter === ENDPOINT_CHECK_FILTER_ALL) return rows;
  return rows.filter((row) => {
    const group = endpointCheckDiffGroup(row?.diff_status);
    if (filter === ENDPOINT_CHECK_FILTER_NEW) return group === "new";
    if (filter === ENDPOINT_CHECK_FILTER_FAILING) return group === "new" || group === "failing";
    if (filter === ENDPOINT_CHECK_FILTER_FIXED) return group === "fixed";
    return true;
  });
}

export function countEndpointCheckFilter(resultsRaw, filterRaw) {
  return filterEndpointCheckResults(resultsRaw, filterRaw).length;
}

// Пустое состояние таблицы результатов: если активный фильтр не даёт строк,
// предлагаем переключиться на «Все» и показываем осмысленное сообщение.
export function getEndpointCheckEmptyFilterState(resultsRaw, filterRaw) {
  const rows = asArray(resultsRaw);
  const filter = toText(filterRaw).toLowerCase() || ENDPOINT_CHECK_DEFAULT_FILTER;
  if (rows.length === 0) {
    return { isEmpty: true, messageKey: "noResults", suggestAll: false };
  }
  const filtered = filterEndpointCheckResults(rows, filter);
  if (filtered.length === 0) {
    if (filter === ENDPOINT_CHECK_FILTER_NEW) {
      return { isEmpty: true, messageKey: "noNewErrors", suggestAll: true };
    }
    return { isEmpty: true, messageKey: "noFilterRows", suggestAll: true };
  }
  return { isEmpty: false, messageKey: "", suggestAll: false };
}

export function buildEndpointCheckSummary(lastRunRaw) {
  const run = asObject(lastRunRaw);
  const empty = {
    hasRun: false,
    id: "",
    ok: 0,
    scanned: 0,
    newErrors: 0,
    stillFailing: 0,
    fixed: 0,
    newEndpoints: 0,
    trigger: "",
    triggerLabel: "",
    commitShort: "",
    branch: "",
    env: "",
    hasNewErrors: false,
    startedAt: null,
    finishedAt: null,
  };
  if (!toText(run.id)) return empty;
  const counts = asObject(run.counts);
  const diff = asObject(run.diff);
  const version = asObject(run.version);
  const trigger = toText(run.trigger).toLowerCase();
  const newErrors = toInt(diff.new_error, 0) + toInt(diff.new_domain_error, 0);
  return {
    hasRun: true,
    id: toText(run.id),
    ok: toInt(counts.ok, 0),
    scanned: toInt(counts.scanned, 0),
    newErrors,
    stillFailing: toInt(diff.still_failing, 0) + toInt(diff.still_domain_error, 0),
    fixed: toInt(diff.fixed, 0) + toInt(diff.domain_fixed, 0),
    newEndpoints: toInt(diff.new_endpoint, 0),
    trigger,
    triggerLabel: trigger === "deploy" ? "деплой" : trigger === "manual" ? "вручную" : trigger,
    commitShort: toText(version.commit).slice(0, 8),
    branch: toText(version.branch),
    env: toText(version.env),
    hasNewErrors: newErrors > 0,
    startedAt: run.started_at ?? null,
    finishedAt: run.finished_at ?? null,
  };
}

// Покрытие прогона: not_scanned (мутации — только счётчик и operationId)
// и blind_zone (GET-операции вне прогона: skip-исключения, unresolved id).
// Форма — как в ответе GET /api/admin/endpoint-check/runs/{run_id}.
export function buildNotScannedSummary(detailRaw) {
  const detail = asObject(detailRaw);
  const notScanned = asObject(detail.not_scanned);
  const mutationsCount = toInt(notScanned.count, 0);
  const mutationOperationIds = asArray(notScanned.operation_ids).map(toText).filter(Boolean);
  const blindZone = asArray(detail.blind_zone)
    .map((row) => {
      const item = asObject(row);
      return {
        operationId: toText(item.operation_id),
        method: toText(item.method).toUpperCase(),
        path: toText(item.path),
        reason: toText(item.reason),
      };
    })
    .filter((row) => row.operationId || row.path);
  return {
    mutationsCount,
    mutationOperationIds,
    blindZone,
    hasAny: mutationsCount > 0 || blindZone.length > 0,
  };
}

// «статус был → стал» по diff_status и текущему http_status.
export function formatEndpointCheckTransition(rowRaw) {  const row = asObject(rowRaw);
  const status = toText(row.http_status) || "—";
  const group = endpointCheckDiffGroup(row.diff_status);
  if (group === "new") return `ok → ${status}`;
  if (group === "failing") return `ошибка → ${status}`;
  if (group === "fixed") return `ошибка → ${status === "—" ? "ok" : status}`;
  if (toText(row.diff_status).toLowerCase() === "new_endpoint") return `— → ${status}`;
  return status;
}

// started_at/finished_at могут прийти как epoch (сек/мс) или ISO-строка.
export function formatEndpointCheckTs(value) {
  if (value === null || value === undefined || value === "") return "—";
  let date = null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    let num = Number(text);
    if (!Number.isFinite(num) || num <= 0) return "—";
    if (num < 1e12) num *= 1000; // секунды → мс
    date = new Date(num);
  } else {
    date = new Date(text);
  }
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
