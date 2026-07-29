import React, { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../../lib/apiCore";
import { t, tf } from "../i18n";
import "./Pilots.css";

// ---------- helpers -----------------------------------------------------------

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function statusLabel(status) {
  const key = `status.${String(status || "")}`;
  const label = t(key);
  return label === key ? String(status || "—") : label;
}

function fmtKitchen(kitchensById, id) {
  const kitchen = kitchensById?.[id];
  return kitchen ? kitchen.name : String(id || "—").slice(0, 8);
}

// ---------- pilot card --------------------------------------------------------

export function PilotCard({ binding, metrics, kitchensById, busy, onRollout }) {
  const checks = asArray(metrics?.checks);
  const unmet = asArray(metrics?.unmet);
  const allMet = metrics?.all_met === true;
  const disabledReason = unmet.join("; ");
  return (
    <section className="pilots__card" data-testid="pilot-card">
      <header className="pilots__card-head">
        <h3>{tf("pilots.card", { id: binding?.recipe_id ? `${binding.recipe_id.slice(0, 8)}…` : "—" })}</h3>
        <span className={`pilots__badge pilots__badge--${binding?.status || "draft"}`}>
          {statusLabel(binding?.status)}
        </span>
      </header>
      <div className="pilots__card-row">
        {t("pilots.kitchenLabel")} <b>{fmtKitchen(kitchensById, binding?.pilot_kitchen_id)}</b>
      </div>
      <ul className="pilots__checks">
        {checks.map((check) => (
          <li
            key={check.key}
            className={`pilots__check ${check.met ? "pilots__check--met" : "pilots__check--unmet"}`}
            data-testid={`pilot-check-${check.key}`}
          >
            <span className="pilots__check-label">{check.label}</span>
            <span className="pilots__check-value">{check.text}</span>
            <span className="pilots__check-mark">{check.met ? "✓" : "✗"}</span>
          </li>
        ))}
        {!checks.length && <li className="pilots__check">{t("pilots.noCriteria")}</li>}
      </ul>
      {!allMet && unmet.length > 0 && (
        <div className="pilots__unmet" data-testid="pilot-unmet">
          {unmet.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      )}
      {binding?.status === "pilot" && (
        <button
          type="button"
          className="pilots__rollout"
          data-testid="rollout-button"
          disabled={!allMet || busy}
          title={allMet ? t("pilots.rolloutAll") : disabledReason || t("pilots.criteriaUnmet")}
          onClick={() => onRollout?.(binding)}
        >
          {busy ? t("pilots.rollingOut") : t("pilots.rollout")}
        </button>
      )}
    </section>
  );
}

// ---------- screen ------------------------------------------------------------

export default function Pilots() {
  const [bindings, setBindings] = useState([]);
  const [kitchensById, setKitchensById] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let canceled = false;
    apiRequest("/api/sku-bindings").then((r) => {
      if (canceled) return;
      const list = r?.ok && Array.isArray(r.data) ? r.data : [];
      setBindings(list);
      setSelectedId((prev) => prev || (list[0] ? String(list[0].id) : ""));
    }).catch(() => {});
    apiRequest("/api/kitchens").then((r) => {
      if (canceled) return;
      const map = {};
      asArray(r?.ok ? r.data : []).forEach((k) => {
        map[String(k.id)] = k;
      });
      setKitchensById(map);
    }).catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);

  const selected = useMemo(
    () => bindings.find((b) => String(b.id) === String(selectedId)) || null,
    [bindings, selectedId],
  );

  useEffect(() => {
    if (!selected || selected.status !== "pilot") {
      setMetrics(null);
      return undefined;
    }
    let canceled = false;
    apiRequest(`/api/sku-bindings/${encodeURIComponent(selected.id)}/pilot-metrics`).then((r) => {
      if (!canceled) setMetrics(r?.ok ? r.data : null);
    }).catch(() => {});
    return () => {
      canceled = true;
    };
  }, [selected]);

  const reloadBindings = () => {
    apiRequest("/api/sku-bindings").then((r) => {
      if (r?.ok && Array.isArray(r.data)) setBindings(r.data);
    }).catch(() => {});
  };

  const handleRollout = async (binding) => {
    setBusy(true);
    setError("");
    try {
      const allKitchenIds = Object.keys(kitchensById);
      const resp = await apiRequest(`/api/sku-bindings/${encodeURIComponent(binding.id)}/rollout`, {
        method: "POST",
        body: { kitchen_ids: allKitchenIds },
      });
      if (!resp?.ok) {
        const detail = resp?.data?.detail;
        const reasons = Array.isArray(detail?.unmet) ? detail.unmet.join("; ") : "";
        setError(reasons || detail?.message || t("pilots.rolloutFailed"));
      } else {
        reloadBindings();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pilots" data-testid="pilots-screen">
      <h2 className="pilots__title">{t("pilots.title")}</h2>
      <div className="pilots__main">
        <aside className="pilots__list" data-testid="pilots-list">
          <div className="pilots__list-head">
            <h3>{t("pilots.list")}</h3>
            <span>{bindings.length}</span>
          </div>
          {bindings.map((binding) => (
            <button
              key={binding.id}
              type="button"
              className={`pilots__item ${String(binding.id) === String(selectedId) ? "pilots__item--active" : ""}`}
              data-testid={`binding-item-${binding.id}`}
              onClick={() => setSelectedId(String(binding.id))}
            >
              <span className="pilots__item-recipe">
                {binding.recipe_version ? `v${binding.recipe_version}` : ""} {String(binding.recipe_id || "").slice(0, 8)}…
              </span>
              <span className={`pilots__badge pilots__badge--${binding.status}`} data-testid={`binding-status-${binding.id}`}>
                {statusLabel(binding.status)}
              </span>
            </button>
          ))}
          {!bindings.length && <div className="pilots__empty">{t("pilots.empty")}</div>}
        </aside>
        <div className="pilots__detail">
          {error && <div className="pilots__error" data-testid="pilots-error">{error}</div>}
          {selected ? (
            <PilotCard
              binding={selected}
              metrics={metrics}
              kitchensById={kitchensById}
              busy={busy}
              onRollout={handleRollout}
            />
          ) : (
            <div className="pilots__empty">{t("pilots.selectBinding")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
