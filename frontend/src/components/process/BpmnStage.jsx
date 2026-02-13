import { useEffect, useMemo, useState } from "react";
import { apiGetBpmn } from "../../lib/api";

const MAX_TEXT = 200000;

function normText(x) {
  if (x == null) return "";
  const s = typeof x === "string" ? x : String(x);
  if (s.length <= MAX_TEXT) return s;
  return s.slice(0, MAX_TEXT) + "\n<!-- truncated -->\n";
}

export default function BpmnStage({ sessionId, reloadKey = 0, isApi = false }) {
  const [status, setStatus] = useState("idle"); // idle|loading|ok|error
  const [err, setErr] = useState("");
  const [xml, setXml] = useState("");

  const title = useMemo(() => {
    if (!sessionId) return "BPMN: нет sessionId";
    return isApi ? "BPMN: api" : "BPMN: local";
  }, [sessionId, isApi]);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!sessionId) {
        setStatus("idle");
        setErr("");
        setXml("");
        return;
      }

      setStatus("loading");
      setErr("");
      setXml("");

      const r = await apiGetBpmn(sessionId);

      if (!alive) return;

      if (!r.ok) {
        setStatus("error");
        setErr(r.error || `HTTP ${r.status || "?"}`);
        setXml("");
        return;
      }

      const text = normText(r.data || "");
      const trimmed = String(text || "").trim();

      if (!trimmed) {
        setStatus("ok");
        setErr("");
        setXml("");
        return;
      }

      setStatus("ok");
      setErr("");
      setXml(text);
    }

    load();

    return () => {
      alive = false;
    };
  }, [sessionId, reloadKey]);

  return (
    <div className="stage">
      <div className="stageHeader">
        <div className="stageTitle">
          Процесс {isApi ? <span className="badge ok">api</span> : <span className="badge">local</span>}
        </div>
      </div>

      <div className="stageBody">
        <div className="bpmnHeader">
          <div className="bpmnTitle">{title}</div>
          {status === "loading" ? <span className="badge">loading</span> : null}
          {status === "error" ? <span className="badge err">error</span> : null}
          {status === "ok" && !xml ? <span className="badge">пусто</span> : null}
        </div>

        {status === "error" ? (
          <div className="errorBox">
            <div className="errorTitle">BPMN load failed</div>
            <div className="errorText">{err || "unknown error"}</div>
            <div className="hint">
              Ожидаемый эндпоинт для проекта: <code>/api/project-sessions/&lt;id&gt;/bpmn</code> (через Vite proxy).
            </div>
          </div>
        ) : null}

        {!xml ? (
          <div className="hint">
            Навигация: мышь — пан/зум на схеме • ✦ AI — включить вопросы на узлах
          </div>
        ) : (
          <pre className="bpmnText">{xml}</pre>
        )}
      </div>
    </div>
  );
}
