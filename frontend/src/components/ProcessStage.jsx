import { useEffect, useMemo, useRef, useState } from "react";
import BpmnStage from "./process/BpmnStage";
import { apiRecompute } from "../lib/api";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

function shortErr(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

export default function ProcessStage({ sessionId, locked, draft, reloadKey }) {
  const sid = String(sessionId || "");
  const bpmnRef = useRef(null);

  const [tab, setTab] = useState("diagram"); // diagram|xml|editor
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");

  useEffect(() => {
    setTab("diagram");
    setGenBusy(false);
    setGenErr("");
  }, [sid]);

  const hasSession = !!sid;
  const isLocal = isLocalSessionId(sid);
  const canEdit = hasSession && !isLocal;
  const canGenerate = hasSession && !isLocal && !locked && !genBusy;

  const title = useMemo(() => {
    if (!sid) return "Процесс";
    return `BPMN · ${sid}`;
  }, [sid]);

  async function doGenerate() {
    if (!canGenerate) return;

    setGenErr("");
    setGenBusy(true);

    try {
      setTab("diagram");
      const r = await apiRecompute(sid);
      if (!r.ok) {
        setGenErr(shortErr(r.error || `recompute failed (${r.status})`));
        return;
      }

      await Promise.resolve(bpmnRef.current?.resetBackend?.());
      await Promise.resolve(bpmnRef.current?.fit?.());
    } catch (e) {
      setGenErr(shortErr(e?.message || e));
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="processShell">
      <div className="processHeader">
        <div className="processHeaderLeft">
          <div className="paneTitle">Процесс</div>
          <div className="muted">{title}</div>
        </div>

        <div className="processHeaderRight">
          <button className="primaryBtn smallBtn genBtn" onClick={doGenerate} disabled={!canGenerate} title={isLocal ? "recompute доступен только для API-сессий" : locked ? "Сначала настрой акторов" : "recompute → подтянуть BPMN → fit"}>
            {genBusy ? "Генерация…" : "Сгенерировать процесс"}
          </button>

          {genErr ? <span className="badge err">{genErr}</span> : null}

          {tab === "editor" ? (
            <div className="bpmnTopActions">
              <button className="secondaryBtn smallBtn" onClick={() => bpmnRef.current?.seedFromActors?.()} title="Создать pool + lanes из акторов">
                Seed
              </button>
              <button className="primaryBtn smallBtn" onClick={() => bpmnRef.current?.saveLocal?.()} title="Сохранить XML локально">
                Save
              </button>
              <button className="secondaryBtn smallBtn" onClick={() => bpmnRef.current?.resetBackend?.()} title="Перезагрузить XML с бэка">
                Reset
              </button>
              <button className="secondaryBtn smallBtn" onClick={() => bpmnRef.current?.clearLocal?.()} title="Удалить локальную версию и вернуться к бэку">
                Clear
              </button>
            </div>
          ) : null}

          <div className="seg">
            <button className={"segBtn " + (tab === "diagram" ? "on" : "")} onClick={() => setTab("diagram")}>
              Diagram
            </button>
            <button className={"segBtn " + (tab === "xml" ? "on" : "")} onClick={() => setTab("xml")}>
              XML
            </button>
            <button
              className={"segBtn " + (tab === "editor" ? "on" : "")}
              onClick={() => setTab("editor")}
              disabled={!canEdit || !!locked}
              title={!canEdit ? "Editor доступен только для API-сессий" : locked ? "Сначала настрой акторов" : "Редактировать BPMN"}
            >
              Edit
            </button>
          </div>

          <div className="iconBtns">
            <button className="iconBtn" onClick={() => bpmnRef.current?.zoomOut?.()} title="Zoom out">
              –
            </button>
            <button className="iconBtn" onClick={() => bpmnRef.current?.fit?.()} title="Fit">
              ↔
            </button>
            <button className="iconBtn" onClick={() => bpmnRef.current?.zoomIn?.()} title="Zoom in">
              +
            </button>
            <button className="iconBtn" onClick={() => {}} title="AI (later)">
              ✦ AI
            </button>
          </div>
        </div>
      </div>

      <div className="processBody">
        {!hasSession ? (
          <div className="muted" style={{ padding: 14 }}>
            Выбери сессию, затем нажми «Сгенерировать процесс».
          </div>
        ) : (
          <BpmnStage
            ref={bpmnRef}
            sessionId={sid}
            view={tab === "editor" ? "editor" : tab === "xml" ? "xml" : "diagram"}
            draft={draft}
            reloadKey={reloadKey}
          />
        )}
      </div>
    </div>
  );
}
