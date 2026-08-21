import { useMemo, useState } from "react";

export default function NodeCopilotCard({
  nodeId,
  title,
  roles,
  meta,
  questions,
  onClose,
  onSetRole,
  onAddQuestion,
  busy,
}) {
  const [q, setQ] = useState("");

  const roleLabel = useMemo(() => {
    const id = meta?.actor_role || "";
    const r = (roles || []).find((x) => x.role_id === id);
    return r ? r.label : "";
  }, [meta, roles]);

  const openCount = useMemo(() => {
    return (questions || []).filter((x) => x.status !== "answered" && x.status !== "skipped").length;
  }, [questions]);

  return (
    <div className="panel nodeCard" data-selected="true">
      <div className="node" data-status={openCount > 0 ? "warn" : "ok"}>
        <div className="nodeTop">
          <div style={{ minWidth: 0 }}>
            <div className="nodeTitle" title={title || nodeId}>
              {title || "Шаг процесса"}
            </div>
            <div className="nodeSub">
              <span className="muted">node_id:</span>{" "}
              <span style={{ fontWeight: 800 }}>{nodeId}</span>
              {roleLabel ? (
                <>
                  {" "}
                  · <span className="muted">роль:</span>{" "}
                  <span style={{ fontWeight: 800 }}>{roleLabel}</span>
                </>
              ) : null}
            </div>
          </div>

          <button className="iconBtn" onClick={onClose} title="Закрыть">
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Исполнитель (lane)
          </div>

          <select
            className="input"
            value={meta?.actor_role || ""}
            onChange={(e) => onSetRole?.(e.target.value)}
            disabled={busy}
          >
            <option value="">— выбери роль —</option>
            {(roles || []).map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>
            AI-вопросы (привязаны к узлу)
          </div>

          {(questions || []).length === 0 ? (
            <div className="small muted">Пока вопросов нет. Добавь 1–2 “первых” вопроса.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(questions || []).slice(0, 12).map((x) => (
                <span
                  key={x.id}
                  className="pill"
                  data-priority={x.priority === "high" ? "high" : "normal"}
                  title={x.text}
                >
                  {x.text}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Напр.: Какая температура? Допуск? Что делаем при отклонении?"
              disabled={busy}
            />
            <button
              className="btn"
              disabled={busy || !q.trim()}
              onClick={() => {
                const t = q.trim();
                if (!t) return;
                onAddQuestion?.(t);
                setQ("");
              }}
            >
              Добавить
            </button>
          </div>

          <div className="dod" style={{ marginTop: 12 }}>
            <div className="dot warn" />
            <div className="kpi">
              Open: <span style={{ fontWeight: 900 }}>{openCount}</span>
            </div>
            <div className="kpi muted">
              Подсказка: заполняй “критерий готово”, “допуски”, “исключения”, “данные”.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
