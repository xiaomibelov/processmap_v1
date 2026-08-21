import React, { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import { t } from "../i18n";
import "./AuditHistory.css";

// ---------- helpers -----------------------------------------------------------

export function formatTs(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num) || num <= 0) return "—";
  const d = new Date(num * 1000);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function actionLabel(action) {
  const key = `action.${String(action || "")}`;
  const label = t(key);
  return label === key ? String(action || "") : label;
}

export function entityTypeLabel(entityType) {
  const key = `entityType.${String(entityType || "")}`;
  const label = t(key);
  return label === key ? String(entityType || "") : label;
}

// Поимённые diff-строки события: сначала meta.diff_lines, иначе из meta.diff_json.
export function eventDiffLines(event) {
  const meta = event?.meta || {};
  if (Array.isArray(meta.diff_lines) && meta.diff_lines.length) {
    return meta.diff_lines.map(String);
  }
  const diff = meta.diff_json && typeof meta.diff_json === "object" ? meta.diff_json : {};
  return Object.keys(diff)
    .sort()
    .map((field) => {
      const change = diff[field] || {};
      const fmt = (v) => (v === null || v === undefined ? "—" : String(v));
      return `${field}: ${fmt(change.old)} → ${fmt(change.new)}`;
    });
}

// Человекочитаемая строка журнала:
// «target_temp_c: 75 → 80 · technologist@… · 2026-07-29 14:02 · v1.0.1»
export function buildEventLine(event, diffLine) {
  const parts = [];
  if (diffLine) parts.push(diffLine);
  else parts.push(actionLabel(event?.action));
  parts.push(String(event?.actor_display || t("audit.deletedUser")));
  parts.push(formatTs(event?.ts));
  const version = event?.meta?.version;
  if (version) parts.push(`v${version}`);
  return parts.join(" · ");
}

// ---------- component ---------------------------------------------------------

export function AuditHistory({ entityType = "", entityId = "", showFilters = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fAction, setFAction] = useState("");
  const [fActor, setFActor] = useState("");
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fEntityType, setFEntityType] = useState(entityType);
  const [fEntityId, setFEntityId] = useState(entityId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const effType = showFilters ? fEntityType : entityType;
      const effId = showFilters ? fEntityId : entityId;
      if (effType) params.set("entity_type", effType);
      if (effId) params.set("entity_id", effId);
      if (fAction) params.set("action", fAction);
      if (fActor) params.set("actor", fActor);
      if (fDateFrom) params.set("date_from", fDateFrom);
      if (fDateTo) params.set("date_to", fDateTo);
      params.set("limit", "100");
      const r = await apiRequest(`/api/audit-log?${params.toString()}`);
      if (r?.ok && r.data) setItems(Array.isArray(r.data.items) ? r.data.items : []);
      else setError(t("audit.error"));
    } catch (e) {
      setError(t("audit.error"));
    } finally {
      setLoading(false);
    }
  }, [showFilters, entityType, entityId, fEntityType, fEntityId, fAction, fActor, fDateFrom, fDateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="audit-history" data-testid="audit-history">
      {showFilters ? (
        <div className="audit-history__filters" data-testid="audit-filters">
          <label className="audit-history__filter">
            <span>{t("audit.entityType")}</span>
            <select
              data-testid="filter-entity-type"
              value={fEntityType}
              onChange={(e) => setFEntityType(e.target.value)}
            >
              <option value="">{t("audit.all")}</option>
              <option value="recipe">{t("entityType.recipe")}</option>
              <option value="process_template">{t("entityType.process_template")}</option>
            </select>
          </label>
          <label className="audit-history__filter">
            <span>{t("audit.entityId")}</span>
            <input
              type="text"
              data-testid="filter-entity-id"
              value={fEntityId}
              onChange={(e) => setFEntityId(e.target.value)}
              placeholder="uuid…"
            />
          </label>
          <label className="audit-history__filter">
            <span>{t("audit.action")}</span>
            <select
              data-testid="filter-action"
              value={fAction}
              onChange={(e) => setFAction(e.target.value)}
            >
              <option value="">{t("audit.all")}</option>
              <option value="recipe.create">{t("action.recipe.create")}</option>
              <option value="recipe.update">{t("action.recipe.update")}</option>
              <option value="recipe.clone">{t("action.recipe.clone")}</option>
              <option value="publish">{t("action.publish")}</option>
              <option value="new_version">{t("action.new_version")}</option>
              <option value="rollout">{t("action.rollout")}</option>
            </select>
          </label>
          <label className="audit-history__filter">
            <span>{t("audit.actor")}</span>
            <input
              type="text"
              data-testid="filter-actor"
              value={fActor}
              onChange={(e) => setFActor(e.target.value)}
              placeholder="email или id…"
            />
          </label>
          <label className="audit-history__filter">
            <span>{t("audit.dateFrom")}</span>
            <input
              type="date"
              data-testid="filter-date-from"
              value={fDateFrom}
              onChange={(e) => setFDateFrom(e.target.value)}
            />
          </label>
          <label className="audit-history__filter">
            <span>{t("audit.dateTo")}</span>
            <input
              type="date"
              data-testid="filter-date-to"
              value={fDateTo}
              onChange={(e) => setFDateTo(e.target.value)}
            />
          </label>
          <button type="button" className="audit-history__apply" data-testid="filter-apply" onClick={load}>
            {t("audit.apply")}
          </button>
        </div>
      ) : null}

      {loading ? <div className="audit-history__hint">{t("audit.loading")}</div> : null}
      {error ? (
        <div className="audit-history__error" role="alert" data-testid="audit-error">
          {error}
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div className="audit-history__hint" data-testid="audit-empty">
          {t("audit.empty")}
        </div>
      ) : null}

      <ul className="audit-history__list" data-testid="audit-list">
        {items.map((event) => {
          const lines = eventDiffLines(event);
          const rows = lines.length ? lines : [null];
          return (
            <li className="audit-history__event" key={String(event.id)} data-testid={`audit-event-${event.id}`}>
              <div className="audit-history__event-head">
                <span className={`audit-history__action audit-history__action--${String(event.action || "").replace(/[^a-z0-9]/gi, "_")}`}>
                  {actionLabel(event.action)}
                </span>
                {event?.meta?.version ? (
                  <span className="audit-history__version" data-testid={`audit-version-${event.id}`}>
                    v{String(event.meta.version)}
                  </span>
                ) : null}
              </div>
              {rows.map((line, idx) => (
                <div className="audit-history__line" data-testid="audit-line" key={`${event.id}_${idx}`}>
                  {buildEventLine(event, line)}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default AuditHistory;
