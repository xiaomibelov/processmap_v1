// WS1.7 — пилот в панели рабочего места: создание в 1 клик (дефолтные
// критерии 20/0/2%, как в UX1) + карточка прогресса + список привязок шаблона.
import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/apiCore";
import { t } from "../i18n";
import { PilotCard } from "../pilots/Pilots";

export default function PilotPanel({ templateId, templateStatus, onPilotCreated }) {
  const [recipes, setRecipes] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [kitchensById, setKitchensById] = useState({});
  const [metrics, setMetrics] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiRequest("/api/kitchens").then((r) => {
      const map = {};
      (r?.ok && Array.isArray(r.data) ? r.data : []).forEach((k) => { map[String(k.id)] = k; });
      setKitchensById(map);
    }).catch(() => {});
  }, []);

  function reload() {
    if (!templateId) return;
    apiRequest("/api/recipes?limit=100").then((r) => {
      const list = (r?.ok && Array.isArray(r.data) ? r.data : [])
        .filter((x) => String(x.template_id) === String(templateId));
      setRecipes(list);
      apiRequest("/api/sku-bindings").then((rb) => {
        const all = rb?.ok && Array.isArray(rb.data) ? rb.data : [];
        setBindings(all.filter((b) => list.some((x) => String(x.id) === String(b.recipe_id))));
      }).catch(() => {});
    }).catch(() => {});
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [templateId]);

  const selected = bindings.find((b) => String(b.id) === String(selectedId)) || bindings[0] || null;

  useEffect(() => {
    if (!selected || selected.status !== "pilot") { setMetrics(null); return undefined; }
    let canceled = false;
    apiRequest(`/api/sku-bindings/${encodeURIComponent(selected.id)}/pilot-metrics`).then((r) => {
      if (!canceled) setMetrics(r?.ok ? r.data : null);
    }).catch(() => {});
    return () => { canceled = true; };
  }, [selected]);

  async function handleCreatePilot() {
    setBusy(true); setError(""); setNotice("");
    try {
      // свежие данные (панель могла только что смонтироваться — state ещё пуст)
      const rr = await apiRequest("/api/recipes?limit=100");
      const fresh = (rr?.ok && Array.isArray(rr.data) ? rr.data : [])
        .filter((x) => String(x.template_id) === String(templateId));
      const published = fresh.find((r) => r.status === "published");
      if (!published) { setError(t("ws.pilotNoRecipe")); return; }
      let kitchenMap = kitchensById;
      if (Object.keys(kitchenMap).length === 0) {
        const kr = await apiRequest("/api/kitchens");
        (kr?.ok && Array.isArray(kr.data) ? kr.data : []).forEach((k) => { kitchenMap = { ...kitchenMap, [String(k.id)]: k }; });
        setKitchensById(kitchenMap);
      }
      const firstKitchen = Object.values(kitchenMap)[0];
      if (!firstKitchen) { setError(t("pilots.noKitchens")); return; }
      const br = await apiRequest("/api/sku-bindings", {
        method: "POST",
        body: {
          recipe_id: String(published.id),
          recipe_version: String(published.template_version || ""),
          kitchen_ids: [String(firstKitchen.id)],
        },
      });
      if (!br?.ok || !br.data?.id) { setError(JSON.stringify(br?.data?.detail || br?.error)); return; }
      const sp = await apiRequest(`/api/sku-bindings/${encodeURIComponent(br.data.id)}/start-pilot`, {
        method: "POST",
        body: {
          pilot_kitchen_id: String(firstKitchen.id),
          criteria: { min_orders: 20, max_critical_errors: 0, max_defect_rate_pct: 2 },
        },
      });
      if (!sp?.ok) { setError(JSON.stringify(sp?.data?.detail || sp?.error)); return; }
      setNotice(t("pilots.createPilotHint"));
      setSelectedId(String(br.data.id));
      reload();
      if (typeof onPilotCreated === "function") onPilotCreated();
    } finally { setBusy(false); }
  }

  async function handleRollout(binding) {
    setBusy(true); setError("");
    try {
      const allKitchenIds = Object.keys(kitchensById);
      const resp = await apiRequest(`/api/sku-bindings/${encodeURIComponent(binding.id)}/rollout`, {
        method: "POST",
        body: { kitchen_ids: allKitchenIds },
      });
      if (!resp?.ok) {
        const detail = resp?.data?.detail;
        setError(Array.isArray(detail?.unmet) ? detail.unmet.join("; ") : String(detail?.message || "rollout failed"));
      } else reload();
    } finally { setBusy(false); }
  }

  if (!templateId) return <div className="ctor-hint">{t("ws.recipeNoTemplate")}</div>;

  return (
    <div className="ws-pilot" data-testid="panel-pilot">
      <h3>{t("wf.step.pilot")}</h3>
      {templateStatus !== "published" ? (
        <div className="ctor-hint">{t("ws.pilotNeedsPublish")}</div>
      ) : null}
      <button
        type="button"
        className="ctor-btn ctor-btn--primary"
        data-testid="pilot-create"
        disabled={busy || templateStatus !== "published"}
        title={t("pilots.createPilotHint")}
        onClick={handleCreatePilot}
      >
        {t("wf.nextPilot")}
      </button>
      {error ? <div className="ctor-hint ctor-hint--error" data-testid="pilot-error">{error}</div> : null}
      {notice ? <div className="ctor__notice">{notice}</div> : null}

      {bindings.length > 0 ? (
        <label className="ctor-field">
          <span className="ctor-field-label">{t("pilots.list")}</span>
          <select data-testid="pilot-switch" value={selected?.id || ""} onChange={(e) => setSelectedId(e.target.value)}>
            {bindings.map((b) => (
              <option key={String(b.id)} value={String(b.id)}>
                {String(b.recipe_id).slice(0, 8)}… · {t(`status.${String(b.status)}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selected ? (
        <PilotCard
          binding={selected}
          metrics={metrics}
          kitchensById={kitchensById}
          busy={busy}
          onRollout={handleRollout}
        />
      ) : (
        <div className="ctor-hint">{t("pilots.empty")}</div>
      )}
    </div>
  );
}
