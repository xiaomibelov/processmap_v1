// UX1/U1.2 — статус-бар воркфлоу технолога (7 шагов).
// Состояние шагов выводится из РЕАЛЬНЫХ данных API (шаблоны/рецепты/привязки),
// не из локального состояния страницы.
import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/apiCore";
import { t } from "../i18n";
import "./WorkflowBar.css";

export const WORKFLOW_STEPS = [
  { id: "import", path: "/technologist/import-bpmn" },
  { id: "transform", path: "/technologist/transform" },
  { id: "constructor", path: "/technologist/constructor" },
  { id: "recipe", path: "/technologist/recipes" },
  { id: "check", path: "/technologist/constructor?check=1" },
  { id: "publish", path: "/technologist/recipes" },
  { id: "pilot", path: "/technologist/pilots" },
];

// вычисление прогресса из данных — экспортируется для «Моих процессов» (U3)
export function computeProgress({ templates, recipes, bindings }) {
  const hasTemplate = templates.length > 0;
  const hasRecipe = recipes.length > 0;
  const hasPublished = templates.some((x) => x.status === "published")
    || recipes.some((x) => x.status === "published");
  const hasPilot = bindings.some((b) => ["pilot", "active"].includes(String(b.status)));
  return {
    import: hasTemplate,
    transform: hasTemplate,
    constructor: hasTemplate,
    recipe: hasRecipe,
    check: hasPublished,
    publish: hasPublished,
    pilot: hasPilot,
  };
}

export default function WorkflowBar({ current }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let canceled = false;
    Promise.all([
      apiRequest("/api/process-templates?limit=100"),
      apiRequest("/api/recipes?limit=100"),
      apiRequest("/api/sku-bindings"),
    ]).then(([tpl, rcp, bnd]) => {
      if (canceled) return;
      const templates = tpl?.ok && Array.isArray(tpl.data) ? tpl.data : [];
      const recipes = rcp?.ok && Array.isArray(rcp.data) ? rcp.data : [];
      const bindings = bnd?.ok && Array.isArray(bnd.data) ? bnd.data : [];
      setProgress(computeProgress({ templates, recipes, bindings }));
    }).catch(() => {});
    return () => { canceled = true; };
  }, []);

  const firstTodo = WORKFLOW_STEPS.find((s) => progress && !progress[s.id])?.id;

  return (
    <nav className="wfbar" data-testid="workflow-bar" aria-label={t("wf.aria")}>
      {WORKFLOW_STEPS.map((step, idx) => {
        const done = Boolean(progress?.[step.id]);
        const isCurrent = step.id === current;
        const isNext = !isCurrent && step.id === firstTodo;
        const cls = [
          "wfbar__step",
          done ? "wfbar__step--done" : "",
          isCurrent ? "wfbar__step--current" : "",
          isNext ? "wfbar__step--next" : "",
        ].filter(Boolean).join(" ");
        return (
          <React.Fragment key={step.id}>
            {idx > 0 ? <span className="wfbar__sep">→</span> : null}
            <a
              className={cls}
              href={step.path}
              data-testid={`wf-step-${step.id}`}
              data-state={done ? "done" : isCurrent ? "current" : "todo"}
            >
              <span className="wfbar__num">{done ? "✓" : idx + 1}</span>
              <span className="wfbar__label">{t(`wf.step.${step.id}`)}</span>
            </a>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
