set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TS="$(date +%F_%H%M%S)"
BR="feat/frontend-r2-layout-like-bpmn-v1"
TAG_START="cp/foodproc_frontend_r2_start_${TS}"
TAG_DONE="cp/foodproc_frontend_r2_done_${TS}"
ZIP_DIR="artifacts"
ZIP_PATH="${ZIP_DIR}/foodproc_frontend_r2_${TS}.zip"

echo
echo "== checkpoint tag (start) =="
git tag -a "$TAG_START" -m "checkpoint: frontend R2 start (${TS})" >/dev/null 2>&1 || true
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
echo "== ensure dirs =="
mkdir -p frontend/src/components/process frontend/src/styles

echo
echo "== write styles (light UI like reference) =="
cat > frontend/src/styles/app.css <<'EOF'
:root {
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  color-scheme: light;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; background: #eef2f6; }
#root { height: 100%; }

.shell {
  height: 100%;
  display: grid;
  grid-template-rows: 56px 1fr auto;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  color: #fff;
  background: linear-gradient(180deg, #1f5ea8, #194e8b);
  border-bottom: 1px solid rgba(0,0,0,0.12);
}

.topbar .brand {
  font-weight: 700;
  letter-spacing: 0.2px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar .brandBadge {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(255,255,255,0.16);
  border: 1px solid rgba(255,255,255,0.22);
}

.topbar .spacer { flex: 1; }

.iconBtn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  color: #fff;
  cursor: pointer;
}

.iconBtn:disabled { opacity: 0.55; cursor: not-allowed; }

.workspace {
  padding: 12px;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 12px;
  min-height: 0;
}

.panel {
  background: #fff;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.06);
  overflow: hidden;
  min-height: 0;
}

.panelHead {
  padding: 12px 12px;
  font-weight: 700;
  color: #0f172a;
  border-bottom: 1px solid rgba(16,24,40,0.08);
  background: linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.00));
}

.panelBody {
  padding: 12px;
  color: #0f172a;
  min-height: 0;
}

.muted { color: rgba(15,23,42,0.70); }
.small { font-size: 12px; }
.hr { height: 1px; background: rgba(16,24,40,0.08); margin: 12px 0; }

.primaryBtn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 12px;
  border-radius: 10px;
  border: 1px solid rgba(14,74,152,0.25);
  background: linear-gradient(180deg, #2b6cbf, #1f5ea8);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.primaryBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.list {
  display: grid;
  gap: 10px;
}

.listItemTitle {
  font-weight: 700;
  margin-bottom: 6px;
}

.bullets {
  margin: 0;
  padding-left: 18px;
  color: rgba(15,23,42,0.78);
}

.bullets li { margin: 6px 0; }

.processPanel {
  display: grid;
  grid-template-rows: 44px 1fr;
  min-height: 0;
}

.processHead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
  color: #0f172a;
  background: linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.00));
}

.processHead .title { font-weight: 800; }
.processHead .spacer { flex: 1; }

.btn {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  color: #0f172a;
  cursor: pointer;
}

.btn:disabled { opacity: 0.55; cursor: not-allowed; }

.processCanvas {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}

.lanesBg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    repeating-linear-gradient(
      to bottom,
      rgba(16,24,40,0.06),
      rgba(16,24,40,0.06) 2px,
      rgba(255,255,255,0) 2px,
      rgba(255,255,255,0) 88px
    );
}

.laneLabel {
  position: absolute;
  left: 10px;
  padding: 6px 8px;
  font-weight: 700;
  font-size: 12px;
  color: rgba(15,23,42,0.75);
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 8px;
}

.mockNode {
  position: absolute;
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid rgba(60,110,180,0.55);
  background: #fff;
  color: #0f172a;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.08);
}

.mockCircle {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  border: 2px solid rgba(16,24,40,0.18);
  box-shadow: 0 1px 2px rgba(16,24,40,0.08);
}

.mockStart { background: #45b04b; border-color: rgba(18,91,29,0.35); color: #0b2b10; }
.mockEnd { background: #d64848; border-color: rgba(111,19,19,0.35); color: #2b0b0b; }

.arrow {
  position: absolute;
  height: 2px;
  background: rgba(16,24,40,0.55);
}

.arrow:after {
  content: "";
  position: absolute;
  right: -6px;
  top: -4px;
  width: 0; height: 0;
  border-left: 8px solid rgba(16,24,40,0.55);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

.copilotOverlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.copilotCard {
  pointer-events: auto;
  width: 320px;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.10);
  background: #fff;
  box-shadow: 0 6px 18px rgba(16,24,40,0.12);
  overflow: hidden;
}

.copilotHead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: linear-gradient(180deg, #2b6cbf, #1f5ea8);
  color: #fff;
  font-weight: 800;
}

.copilotHead .spacer { flex: 1; }

.copilotBody {
  padding: 10px 12px;
  display: grid;
  gap: 10px;
  color: #0f172a;
}

.qRow {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 10px;
  align-items: start;
  font-size: 13px;
  color: rgba(15,23,42,0.88);
}

.qDot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid rgba(60,110,180,0.55);
  margin-top: 2px;
}

.linkRow {
  padding-top: 6px;
  border-top: 1px solid rgba(16,24,40,0.08);
  color: #1f5ea8;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.bottomDock {
  margin: 0 12px 12px 12px;
  background: #fff;
  border: 1px solid rgba(16,24,40,0.10);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(16,24,40,0.06);
  overflow: hidden;
}

.dockHead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(16,24,40,0.08);
  background: linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.00));
}

.dockHead .spacer { flex: 1; }

.dockBody {
  padding: 10px 12px;
  display: grid;
  gap: 10px;
}

.textarea {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  resize: vertical;
  border-radius: 10px;
  border: 1px solid rgba(16,24,40,0.12);
  background: #fff;
  color: #0f172a;
  padding: 10px 12px;
  outline: none;
}

.inputRow {
  display: flex;
  gap: 10px;
  align-items: center;
}
EOF

echo
echo "== write components: NotesPanel =="
cat > frontend/src/components/NotesPanel.jsx <<'EOF'
export default function NotesPanel({ locked }) {
  return (
    <div className="panel">
      <div className="panelHead">Заметки с производства</div>

      <div className="panelBody">
        <div className="list">
          <div>
            <div className="listItemTitle">1. Подготовка ингредиентов</div>
            <ul className="bullets">
              <li>Нарезать овощи</li>
              <li>Взвесить мясо</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">2. Готовка в горячем цехе</div>
            <ul className="bullets">
              <li>Обжарить на сковороде</li>
              <li>Довести до готовности</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">3. Упаковка блюда</div>
            <ul className="bullets">
              <li>Упаковать в контейнер</li>
              <li>Герметично запечатать</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">4. Контроль качества</div>
            <ul className="bullets">
              <li>Проверить температуру</li>
              <li>Визуальный осмотр</li>
            </ul>
          </div>

          <div>
            <div className="listItemTitle">5. Отправка на доставку</div>
          </div>
        </div>

        <div className="hr" />

        <button className="primaryBtn" disabled={locked}>
          Сгенерировать процесс
        </button>

        {locked ? (
          <div className="small muted" style={{ marginTop: 10 }}>
            Actors-first: сначала роли и start_role (на следующем шаге сделаем экран).
          </div>
        ) : null}
      </div>
    </div>
  );
}
EOF

echo
echo "== write components: Copilot overlay/cards (inside ProcessStage) =="
cat > frontend/src/components/process/CopilotCard.jsx <<'EOF'
export default function CopilotCard({ title, questions }) {
  return (
    <div className="copilotCard">
      <div className="copilotHead">
        <div>{title}</div>
        <div className="spacer" />
        <div style={{ opacity: 0.9 }}>▾</div>
      </div>

      <div className="copilotBody">
        {questions.map((q) => (
          <div className="qRow" key={q}>
            <div className="qDot" />
            <div>{q}</div>
          </div>
        ))}

        <div className="linkRow">＋ Добавить исключение</div>
      </div>
    </div>
  );
}
EOF

cat > frontend/src/components/process/CopilotOverlay.jsx <<'EOF'
import CopilotCard from "./CopilotCard";

export default function CopilotOverlay() {
  return (
    <div className="copilotOverlay">
      <div style={{ position: "absolute", right: 18, top: 120 }}>
        <CopilotCard
          title="AI Copilot: Обжарка на сковороде"
          questions={[
            "Какое оборудование используется?",
            "Время и температура готовки?",
            "Какие специи или добавки?",
          ]}
        />
      </div>

      <div style={{ position: "absolute", right: 18, top: 320 }}>
        <CopilotCard
          title="AI Copilot: Упаковка блюда"
          questions={[
            "Тип упаковки?",
            "Какой срок годности?",
            "Методы герметизации?",
            "Правила маркировки?",
          ]}
        />
      </div>

      <div style={{ position: "absolute", right: 18, bottom: 34 }}>
        <CopilotCard
          title="AI Copilot: Проверка качества"
          questions={[
            "Какая критическая температура?",
            "На что обращаем внимание?",
            "Что делать, если не проходит?",
          ]}
        />
      </div>
    </div>
  );
}
EOF

echo
echo "== update ProcessStage: lanes mock + overlay =="
cat > frontend/src/components/ProcessStage.jsx <<'EOF'
import CopilotOverlay from "./process/CopilotOverlay";

export default function ProcessStage() {
  return (
    <div className="panel processPanel">
      <div className="processHead">
        <div className="title">Процесс <span className="muted" style={{ fontWeight: 600 }}>(Workflow)</span></div>
        <div className="spacer" />
        <button className="btn" disabled>−</button>
        <button className="btn" disabled>+</button>
        <button className="btn" disabled>Fit</button>
      </div>

      <div className="processCanvas">
        <div className="lanesBg" />

        <div className="laneLabel" style={{ top: 78 }}>Горячий цех</div>
        <div className="laneLabel" style={{ top: 166 }}>Упаковка</div>
        <div className="laneLabel" style={{ top: 254 }}>Контроль качества</div>
        <div className="laneLabel" style={{ top: 342 }}>Логистика</div>

        <div className="mockCircle mockStart" style={{ position: "absolute", left: 56, top: 78 }}>
          ●
        </div>
        <div className="small muted" style={{ position: "absolute", left: 58, top: 128, fontWeight: 700 }}>
          Старт
        </div>

        <div className="mockNode" style={{ left: 140, top: 66, width: 170 }}>
          Подготовка<br />ингредиентов
        </div>

        <div className="arrow" style={{ left: 108, top: 101, width: 30 }} />

        <div className="arrow" style={{ left: 224, top: 146, width: 2, height: 34, background: "rgba(16,24,40,0.55)" }} />

        <div className="mockNode" style={{ left: 160, top: 150, width: 160 }}>
          Обжарка<br />на сковороде
        </div>

        <div className="arrow" style={{ left: 322, top: 182, width: 52 }} />

        <div className="mockNode" style={{ left: 380, top: 150, width: 150 }}>
          Довести<br />до готовности
        </div>

        <div className="arrow" style={{ left: 450, top: 206, width: 2, height: 52, background: "rgba(16,24,40,0.55)" }} />

        <div className="mockNode" style={{ left: 360, top: 244, width: 160 }}>
          Упаковка<br />блюда
        </div>

        <div className="arrow" style={{ left: 522, top: 276, width: 52 }} />

        <div className="mockNode" style={{ left: 580, top: 244, width: 170 }}>
          Проверка<br />качества
        </div>

        <div className="arrow" style={{ left: 752, top: 276, width: 52 }} />

        <div className="mockNode" style={{ left: 810, top: 244, width: 42, textAlign: "center" }}>
          ◇
        </div>

        <div className="arrow" style={{ left: 828, top: 286, width: 2, height: 78, background: "rgba(16,24,40,0.55)" }} />

        <div className="mockNode" style={{ left: 760, top: 342, width: 170 }}>
          Отправка<br />на доставку
        </div>

        <div className="arrow" style={{ left: 838, top: 396, width: 2, height: 56, background: "rgba(16,24,40,0.55)" }} />

        <div className="mockCircle mockEnd" style={{ position: "absolute", left: 816, top: 450 }}>
          ●
        </div>
        <div className="small muted" style={{ position: "absolute", left: 808, top: 500, fontWeight: 700 }}>
          Финиш
        </div>

        <CopilotOverlay />
      </div>
    </div>
  );
}
EOF

echo
echo "== update TopBar (match reference feel) =="
cat > frontend/src/components/TopBar.jsx <<'EOF'
export default function TopBar({ sessionId, onNewSession, onOpenSession }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandBadge" />
        <div>Food Process Copilot</div>
      </div>

      <div className="spacer" />

      <div style={{ fontWeight: 700, opacity: 0.95 }}>
        Session: <span style={{ fontWeight: 800 }}>{sessionId || "—"}</span>
      </div>

      <button className="iconBtn" title="Help" disabled>?</button>
      <button className="iconBtn" title="Notes" disabled>💬</button>
      <button className="iconBtn" title="User" disabled>👤</button>

      <button className="iconBtn" title="Open session" onClick={onOpenSession} disabled>⤓</button>
      <button className="iconBtn" title="New session" onClick={onNewSession} disabled>＋</button>
    </div>
  );
}
EOF

echo
echo "== update BottomDock (light) =="
cat > frontend/src/components/BottomDock.jsx <<'EOF'
export default function BottomDock({ locked }) {
  return (
    <div className="bottomDock">
      <div className="dockHead">
        <div style={{ fontWeight: 800, color: "#0f172a" }}>Сообщения / Заметки</div>
        <div className="spacer" />
        <button className="btn" disabled>Expand</button>
      </div>

      <div className="dockBody">
        <div className="small muted">
          В этом доке будет чат/заметки интервью. На текущем шаге input намеренно блокируется, пока не пройден Actors-first.
        </div>

        <div className="inputRow">
          <textarea
            className="textarea"
            placeholder={locked ? "Сначала заполните Actors (roles + start_role)..." : "Введите сообщение..."}
            disabled={locked}
          />
          <button className="btn" disabled={locked}>Отправить</button>
        </div>
      </div>
    </div>
  );
}
EOF

echo
echo "== update AppShell (left notes + process center, copilot overlays inside) =="
cat > frontend/src/components/AppShell.jsx <<'EOF'
import TopBar from "./TopBar";
import NotesPanel from "./NotesPanel";
import ProcessStage from "./ProcessStage";
import BottomDock from "./BottomDock";

export default function AppShell({ sessionId, locked }) {
  return (
    <div className="shell">
      <TopBar sessionId={sessionId} onNewSession={() => {}} onOpenSession={() => {}} />

      <div className="workspace">
        <NotesPanel locked={locked} />
        <ProcessStage />
      </div>

      <BottomDock locked={locked} />
    </div>
  );
}
EOF

echo
echo "== update main.jsx to keep app.css path =="
cat > frontend/src/main.jsx <<'EOF'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

echo
echo "== ensure App.jsx imports unchanged (no routing yet) =="
cat > frontend/src/App.jsx <<'EOF'
import { useMemo } from "react";
import AppShell from "./components/AppShell";
import { readJson } from "./lib/storage";

const LS_KEY = "fp_copilot_draft_v0";

export default function App() {
  const draft = useMemo(() => readJson(LS_KEY, null), []);
  const sessionId = draft?.session_id || "";
  const hasActors =
    Array.isArray(draft?.roles) &&
    draft.roles.length > 0 &&
    typeof draft?.start_role === "string" &&
    draft.start_role.length > 0;

  return <AppShell sessionId={sessionId} locked={!hasActors} />;
}
EOF

echo
echo "== optional: frontend build smoke =="
( cd frontend && npm -s run build >/dev/null )

echo
echo "== git add/commit =="
git add -A
git status -sb || true
git commit -m "feat(frontend): layout like BPMN (left notes + process canvas) + copilot overlays inside stage (R2)" >/dev/null 2>&1 || true

echo
echo "== checkpoint tag (done) =="
git tag -a "$TAG_DONE" -m "checkpoint: frontend R2 done (${TS})" >/dev/null 2>&1 || true
echo "$TAG_DONE"

echo
echo "== zip artifact =="
mkdir -p "$ZIP_DIR"
zip -r "$ZIP_PATH" frontend >/dev/null
ls -la "$ZIP_PATH" || true

echo
echo "== summary =="
echo "branch: $BR"
echo "start_tag: $TAG_START"
echo "done_tag:  $TAG_DONE"
echo "zip: $ZIP_PATH"
echo
echo "run dev:"
echo "  cd frontend && npm run dev"
