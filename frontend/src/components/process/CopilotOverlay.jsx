import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";

function keyFor(sessionId) {
  return `fpc_copilot_v1:${sessionId || "none"}`;
}

function readLocal(sessionId) {
  try {
    const raw = localStorage.getItem(keyFor(sessionId));
    if (!raw) return { selectedNodeId: "", questionsByNode: {} };
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : { selectedNodeId: "", questionsByNode: {} };
  } catch (_) {
    return { selectedNodeId: "", questionsByNode: {} };
  }
}

function writeLocal(sessionId, v) {
  try {
    localStorage.setItem(keyFor(sessionId), JSON.stringify(v));
  } catch (_) {}
}

export default function CopilotOverlay({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [apiErr, setApiErr] = useState("");
  const [draft, setDraft] = useState(() => readLocal(sessionId));

  useEffect(() => {
    setDraft(readLocal(sessionId));
  }, [sessionId]);

  useEffect(() => {
    writeLocal(sessionId, draft);
  }, [sessionId, draft]);

  const selectedNodeId = draft.selectedNodeId || "";
  const questions = useMemo(() => {
    const by = draft.questionsByNode || {};
    const arr = by[selectedNodeId] || [];
    return Array.isArray(arr) ? arr : [];
  }, [draft, selectedNodeId]);

  useEffect(() => {
    let cancelled = false;

    async function loadNodes() {
      setApiErr("");
      setNodes([]);

      if (!sessionId) return;
      if (String(sessionId).startsWith("local_")) return;

      try {
        const s = await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}`);
        const arr = Array.isArray(s?.nodes) ? s.nodes : [];
        if (!cancelled) setNodes(arr);
      } catch (e) {
        if (!cancelled) setApiErr(String(e?.message || e));
      }
    }

    loadNodes();
    return () => { cancelled = true; };
  }, [sessionId]);

  function addQuestion(text, priority) {
    const q = {
      id: `q_${Date.now()}`,
      text: text.trim(),
      priority: priority || "normal",
      ts: new Date().toISOString(),
    };
    const by = { ...(draft.questionsByNode || {}) };
    const key = selectedNodeId || "__process__";
    const cur = Array.isArray(by[key]) ? by[key] : [];
    by[key] = [...cur, q];
    setDraft({ ...draft, questionsByNode: by });
  }

  const nodeLabel = useMemo(() => {
    const n = nodes.find((x) => String(x?.id) === String(selectedNodeId));
    return n?.title || n?.label || "";
  }, [nodes, selectedNodeId]);

  return (
    <>
      <div className="fab">
        <button className={"btn btnPrimary btnIcon"} title="AI Copilot" onClick={() => setOpen((v) => !v)}>
          ✦
        </button>
      </div>

      {open ? (
        <div className="panel copilotPanel">
          <div className="panelHead">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>AI Copilot</span>
              <span className="statusPill" style={{ padding: "4px 8px" }}>
                <span className={"statusDot " + (sessionId && !String(sessionId).startsWith("local_") ? "ok" : "warn")} />
                <span className="small muted">{sessionId && !String(sessionId).startsWith("local_") ? "API-сессия" : "локально"}</span>
              </span>
            </div>
            <button className="btn btnIcon" onClick={() => setOpen(false)} title="Закрыть">×</button>
          </div>

          <div className="panelBody" style={{ display: "grid", gap: 12 }}>
            <div className="dod">
              <div className="dot info" />
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 900 }}>Интервью: вопросы</div>
                <div className="kpi">Сейчас Copilot не привязан к кликам по BPMN. Следующий шаг — привязка к узлам.</div>
              </div>
            </div>

            <div className="node" data-status="info" data-selected="true">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  {selectedNodeId ? (nodeLabel ? nodeLabel : `Узел: ${selectedNodeId}`) : "Процесс (общие вопросы)"}
                </div>
                <div className="small muted">{selectedNodeId ? "узел" : "процесс"}</div>
              </div>

              <div className="hr" />

              {apiErr ? (
                <div className="small" style={{ color: "var(--warn)" }}>
                  Не удалось загрузить nodes из API: <span className="muted">{apiErr}</span>
                </div>
              ) : null}

              <div className="small muted" style={{ marginBottom: 8 }}>Контекст</div>

              <select
                className="input"
                value={selectedNodeId}
                onChange={(e) => setDraft({ ...draft, selectedNodeId: e.target.value })}
              >
                <option value="">— общий контекст процесса —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title || n.label || n.id}
                  </option>
                ))}
              </select>

              <div className="hr" />

              <div className="small muted" style={{ marginBottom: 8 }}>Вопросы</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {questions.length === 0 ? (
                  <div className="small muted">Пока вопросов нет.</div>
                ) : (
                  questions.slice().reverse().map((q) => (
                    <span key={q.id} className="pill" data-priority={q.priority === "high" ? "high" : "normal"}>
                      {q.text}
                    </span>
                  ))
                )}
              </div>

              <div className="input-row">
                <input
                  className="input"
                  placeholder="Добавить вопрос (например: температура/время/оборудование?)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = e.currentTarget.value;
                      if (v.trim().length) addQuestion(v, "normal");
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <button
                  className="btn btnPrimary"
                  onClick={(e) => {
                    const inp = e.currentTarget.parentElement?.querySelector("input");
                    const v = inp?.value || "";
                    if (v.trim().length) addQuestion(v, "normal");
                    if (inp) inp.value = "";
                  }}
                >
                  Добавить
                </button>
              </div>

              <div className="small muted" style={{ marginTop: 10 }}>
                Подсказка: ввести текст и нажать Enter.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
