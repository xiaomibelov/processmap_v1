#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r11-ru-ui-polish-v1"
TAG_START="cp/foodproc_frontend_r11_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r11_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r11_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R11 start (${TS})" >/dev/null 2>&1 || true
echo "$TAG_START"

echo
echo "== git (before) =="
git status -sb || true
git show -s --format='%ci %h %d %s' || true

echo
echo "== branch =="
git switch -c "$BR" >/dev/null 2>&1 || git switch "$BR" >/dev/null
git status -sb || true

echo
echo "== guard: frontend-only (stash backend changes if any) =="
if git status --porcelain | awk '{print $2}' | grep -q '^backend/'; then
  echo "backend changes detected -> stashing only backend/"
  git stash push -u -m "WIP backend (auto-stash before frontend R11) ${TS}" -- backend >/dev/null 2>&1 || true
else
  echo "no backend changes"
fi

echo
echo "== ensure dirs =="
mkdir -p frontend/src/components/process frontend/src/styles frontend/src/lib .tools

echo
echo "== styles: add RU pills + highlights + topbar sizing =="
APP_CSS="frontend/src/styles/app.css"
if [ ! -f "$APP_CSS" ]; then
  echo "BLOCKER: missing $APP_CSS"
  false
fi

if ! grep -q "R11: RU UI polish" "$APP_CSS"; then
  cat >> "$APP_CSS" <<'EOF'

/* R11: RU UI polish + highlights */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid rgba(16,24,40,0.12);
  background: rgba(255,255,255,0.75);
}
.pillOk { color: #0b6b2f; border-color: rgba(11,107,47,0.22); }
.pillFail { color: #b42318; border-color: rgba(180,35,24,0.22); }

@keyframes fpcPulse {
  0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.35); }
  70% { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
  100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
}

.attention { animation: fpcPulse 2.2s infinite; }
.attentionRing { outline: 3px solid rgba(37,99,235,0.35); outline-offset: 2px; border-radius: 10px; }

.topBarInner {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbarSelect { min-width: 280px; max-width: 520px; }
.topbarIconBtn { padding: 6px 10px; min-width: 40px; }
.topbarNewBtn { padding: 8px 12px; font-weight: 900; width: auto; }
EOF
fi

echo
echo "== TopBar: rewrite (RU + compact + highlights) =="
TOPBAR="frontend/src/components/TopBar.jsx"
cat > "$TOPBAR" <<'EOF'
import React from "react";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

function getSessionId(s) {
  if (!s) return "";
  if (typeof s.session_id === "string") return s.session_id;
  if (typeof s.id === "string") return s.id;
  return "";
}

function getSessionTitle(s) {
  if (!s) return "";
  if (typeof s.title === "string" && s.title.trim()) return s.title.trim();
  const id = getSessionId(s);
  return id ? id : "Без названия";
}

export default function TopBar(props) {
  const apiOk = Boolean(
    (props.api && props.api.ok) ||
      (props.apiStatus && props.apiStatus.ok) ||
      props.apiOk === true
  );

  const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";

  const sessions = Array.isArray(props.sessions)
    ? props.sessions
    : Array.isArray(props.sessionList)
    ? props.sessionList
    : [];

  const onOpenSession =
    props.onOpenSession ||
    props.onSelectSession ||
    props.onOpen ||
    (() => {});

  const onRefreshSessions = props.onRefreshSessions || props.onRefresh || (() => {});

  const onNewApiSession =
    props.onNewApiSession || props.onCreateApiSession || props.onNewApi || (() => {});

  const isLocal = isLocalSessionId(sessionId);

  return (
    <div className="topBar">
      <div className="topBarInner">
        <div className="brand">
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Food Process Copilot</div>
        </div>

        <div
          className={"pill " + (apiOk ? "pillOk" : "pillFail")}
          title={
            apiOk
              ? "API доступно (cookie-сессия; ключ не нужен)"
              : "API недоступно. Проверь backend: http://127.0.0.1:8011/health"
          }
        >
          API: {apiOk ? "ок" : "нет"}
        </div>

        <div className="small" style={{ marginLeft: 6 }}>
          <span className="muted">Сессия:</span>{" "}
          <span style={{ fontWeight: 900 }}>{sessionId || "—"}</span>
        </div>

        <select
          className={"input topbarSelect " + (isLocal ? "attentionRing" : "")}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onOpenSession(id);
          }}
          title="Открыть сессию с сервера"
        >
          <option value="">— открыть сессию —</option>
          {sessions.map((s) => {
            const id = getSessionId(s);
            if (!id) return null;
            const label = getSessionTitle(s);
            return (
              <option key={id} value={id}>
                {label}
              </option>
            );
          })}
        </select>

        <button className="ghostBtn topbarIconBtn" onClick={onRefreshSessions} title="Обновить список сессий">
          ↻
        </button>

        <button
          className={"primaryBtn topbarNewBtn " + (isLocal ? "attention" : "")}
          onClick={onNewApiSession}
          title="Создать новую серверную сессию (для реального workflow)"
        >
          Новая (API)
        </button>
      </div>
    </div>
  );
}
EOF

echo
echo "== BpmnStage: safe placeholder + RU strings (no 'no diagram' crash) =="
BPMN_STAGE="frontend/src/components/process/BpmnStage.jsx"
cat > "$BPMN_STAGE" <<'EOF'
import { useEffect, useRef, useState } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";

function isLocalSessionId(id) {
  return typeof id === "string" && id.startsWith("local_");
}

// Минимальная "пустая" диаграмма (не демо процесса): старт → финиш.
// Нужна, чтобы viewer не падал с "no diagram to display".
const EMPTY_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_Empty" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Старт"/>
    <bpmn:endEvent id="EndEvent_1" name="Финиш"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="360" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="360" y="178" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default function BpmnStage({ sessionId }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function importXml(xml) {
    const viewer = viewerRef.current;
    if (!viewer) return;

    try {
      setError("");
      await viewer.importXML(xml || EMPTY_BPMN_XML);
      const canvas = viewer.get("canvas");
      canvas.zoom("fit-viewport");
    } catch (e) {
      setError("Ошибка импорта BPMN. Проверь данные сессии и экспорт.");
    }
  }

  async function loadBpmn() {
    const id = typeof sessionId === "string" ? sessionId : "";

    if (!id) {
      setStatus("Нет активной сессии");
      await importXml(EMPTY_BPMN_XML);
      return;
    }

    if (isLocalSessionId(id)) {
      setStatus("Локальная сессия: BPMN с сервера недоступен. Создай “Новая (API)”.");
      await importXml(EMPTY_BPMN_XML);
      return;
    }

    setStatus("Загрузка BPMN…");

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}/bpmn`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        setStatus("BPMN недоступен");
        await importXml(EMPTY_BPMN_XML);
        return;
      }

      const xml = await res.text();
      setStatus("");
      await importXml(xml || EMPTY_BPMN_XML);
    } catch {
      setStatus("Ошибка сети при загрузке BPMN");
      await importXml(EMPTY_BPMN_XML);
    }
  }

  function zoomIn() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    const z = c.zoom();
    c.zoom(z + 0.2);
  }

  function zoomOut() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    const z = c.zoom();
    c.zoom(Math.max(0.2, z - 0.2));
  }

  function fit() {
    const v = viewerRef.current;
    if (!v) return;
    const c = v.get("canvas");
    c.zoom("fit-viewport");
  }

  useEffect(() => {
    if (!hostRef.current) return;

    viewerRef.current = new NavigatedViewer({ container: hostRef.current });

    loadBpmn();

    const onSaved = () => loadBpmn();
    window.addEventListener("fpc:graph-saved", onSaved);

    return () => {
      window.removeEventListener("fpc:graph-saved", onSaved);
      try {
        viewerRef.current && viewerRef.current.destroy();
      } catch {
        // ignore
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadBpmn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", right: 12, top: 10, zIndex: 5, display: "flex", gap: 8 }}>
        <button className="ghostBtn" onClick={zoomOut} title="Уменьшить">
          −
        </button>
        <button className="ghostBtn" onClick={zoomIn} title="Увеличить">
          +
        </button>
        <button className="ghostBtn" onClick={fit} title="Вписать">
          Вписать
        </button>
      </div>

      <div ref={hostRef} style={{ width: "100%", height: "100%", background: "#fff" }} />

      {status ? (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 6, maxWidth: 520 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Статус</div>
            <div className="small muted">{status}</div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 7, maxWidth: 520 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Ошибка</div>
            <div className="small muted">{error}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
EOF

echo
echo "== api.js: ensure apiSaveSession export exists (fix build error) =="
API_JS="frontend/src/lib/api.js"
if [ ! -f "$API_JS" ]; then
  echo "BLOCKER: missing $API_JS"
  false
fi

if ! grep -q "export async function apiSaveSession" "$API_JS"; then
  cat >> "$API_JS" <<'EOF'

/**
 * R11: save session patch (Graph Editor)
 * Sends partial session shape to backend. Backend may treat as merge/upsert.
 */
export async function apiSaveSession(sessionId, patch) {
  if (!sessionId) throw new Error("sessionId is required");

  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch || {}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`apiSaveSession failed: ${res.status} ${txt}`);
  }

  return res.json();
}
EOF
fi

echo
echo "== patch RU strings in GraphEditorOverlay + misc (safe replace) =="
cat > .tools/r11_ru_patch.py <<'PY'
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch_file(p: Path, pairs):
  if not p.exists():
    return
  s = p.read_text(encoding="utf-8")
  before = s
  for a,b in pairs:
    s = s.replace(a,b)
  if s != before:
    p.write_text(s, encoding="utf-8")

graph = ROOT / "frontend/src/components/process/GraphEditorOverlay.jsx"
pairs = [
  ("Graph editor", "Редактор графа"),
  ("Add node", "Добавить шаг"),
  ("Add edge", "Добавить связь"),
  ("+ Add node", "+ Добавить шаг"),
  ("+ Add edge", "+ Добавить связь"),
  ("Clear graph", "Очистить граф"),
  ("Reload BPMN", "Обновить BPMN"),
  ("status:", "статус:"),
  (">Graph<", ">Граф<"),
  ("from…", "от…"),
  ("to…", "в…"),
  ("label (например: Подготовка ингредиентов)", "название (например: Подготовка ингредиентов)"),
  # minimal type labels if present
  (">step<", ">Шаг<"),
  (">decision<", ">Решение<"),
  (">fork<", ">Развилка<"),
  (">join<", ">Слияние<"),
  (">end<", ">Финиш<"),
]
patch_file(graph, pairs)

proc = ROOT / "frontend/src/components/ProcessStage.jsx"
patch_file(proc, [
  ("BPMN import error", "Ошибка BPMN"),
  ("no diagram to display", "нет диаграммы для отображения"),
  ("Fit", "Вписать"),
])

print("R11 RU patch applied")
PY
python3 .tools/r11_ru_patch.py

echo
echo "== build smoke =="
( cd frontend && npm -s run build )

echo
echo "== diff stat =="
git diff --stat || true

echo
echo "== commit (frontend only) =="
git add -A frontend
git status -sb || true
git commit -m "feat(frontend): RU UI polish + highlights + apiSaveSession + safe BPMN placeholder" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R11 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend -x "frontend/node_modules/*" -x "frontend/dist/*" >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== run dev =="
echo "cd frontend && npm run dev"
echo
echo "rollback:"
echo "git checkout "$TAG_START""
