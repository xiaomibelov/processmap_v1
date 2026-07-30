// UX1/U3 — главный экран технолога «Мои процессы».
// Список процессов с шагом воркфлоу (та же логика computeProgress), статусом
// версии, пилотом, датой изменения. Клик → экран текущего шага процесса.
import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/apiCore";
import { t, tf } from "../i18n";
import { WORKFLOW_STEPS, computeProgress } from "../workflow/WorkflowBar";
import WorkflowBar from "../workflow/WorkflowBar";
import "./Home.css";

function fmtDate(value) {
  if (!value) return "—";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function TechnologistHome() {
  const [templates, setTemplates] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    Promise.all([
      apiRequest("/api/process-templates?limit=100"),
      apiRequest("/api/recipes?limit=100"),
      apiRequest("/api/sku-bindings"),
    ]).then(([tpl, rcp, bnd]) => {
      if (canceled) return;
      setTemplates(tpl?.ok && Array.isArray(tpl.data) ? tpl.data : []);
      setRecipes(rcp?.ok && Array.isArray(rcp.data) ? rcp.data : []);
      setBindings(bnd?.ok && Array.isArray(bnd.data) ? bnd.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { canceled = true; };
  }, []);

  function stepForTemplate(tpl) {
    const tplRecipes = recipes.filter((r) => String(r.template_id) === String(tpl.id));
    const tplBindings = bindings.filter((b) => tplRecipes.some((r) => String(r.id) === String(b.recipe_id)));
    const progress = computeProgress({ templates: [tpl], recipes: tplRecipes, bindings: tplBindings });
    const idx = WORKFLOW_STEPS.findIndex((s) => !progress[s.id]);
    const doneIdx = idx === -1 ? WORKFLOW_STEPS.length - 1 : Math.max(0, idx - 1);
    return { step: WORKFLOW_STEPS[doneIdx], number: doneIdx + 1 };
  }

  function hrefForStep(tpl, stepId) {
    const id = encodeURIComponent(String(tpl.id));
    switch (stepId) {
      case "import": return "/app";
      case "transform": return "/technologist/transform";
      case "constructor": return "/app";
      case "recipe": return `/technologist/recipes?template=${id}`;
      case "check": return "/app";
      case "publish": return `/technologist/recipes?template=${id}`;
      case "pilot": return "/technologist/pilots";
      default: return `/technologist/constructor?template=${id}`;
    }
  }

  function pilotFor(tpl) {
    const tplRecipes = recipes.filter((r) => String(r.template_id) === String(tpl.id));
    const b = bindings.find((x) => tplRecipes.some((r) => String(r.id) === String(x.recipe_id)));
    return b ? t(`status.${String(b.status)}`) : "—";
  }

  return (
    <div className="tech-home">
      <WorkflowBar current="" />
      <div className="tech-home__head">
        <h1>{t("wf.home.title")}</h1>
        <a className="tech-home__new" data-testid="home-new-process" href="/app">
          {t("wf.home.new")}
        </a>
      </div>

      {loading ? <div className="tech-home__hint">{t("ctor.loading")}</div> : null}
      {!loading && templates.length === 0 ? (
        <div className="tech-home__empty" data-testid="home-empty">
          <p>{t("wf.home.empty")}</p>
          <a className="tech-home__new" href="/app">{t("wf.home.new")}</a>
        </div>
      ) : null}

      {templates.length > 0 ? (
        <table className="tech-home__table" data-testid="home-table">
          <thead>
            <tr>
              <th>{t("wf.home.name")}</th>
              <th>{t("wf.home.step")}</th>
              <th>{t("wf.home.status")}</th>
              <th>{t("wf.home.pilot")}</th>
              <th>{t("wf.home.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => {
              const { step, number } = stepForTemplate(tpl);
              return (
                <tr key={String(tpl.id)}>
                  <td>
                    <a data-testid={`home-row-${tpl.id}`} href={hrefForStep(tpl, step.id)}>
                      {String(tpl.name || "—")}
                    </a>
                  </td>
                  <td>
                    <span className={`tech-home__step tech-home__step--${step.id}`}>
                      {t(`wf.step.${step.id}`)} · {tf("wf.home.stepOf", { n: number })}
                    </span>
                  </td>
                  <td>{t(`status.${String(tpl.status || "draft")}`)} · v{String(tpl.version || "")}</td>
                  <td>{pilotFor(tpl)}</td>
                  <td>{fmtDate(tpl.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
