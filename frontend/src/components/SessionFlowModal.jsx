import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../shared/ui/Modal";
import { apiSessionTitleQuestions } from "../lib/api";
import { createAiInputHash, executeAi } from "../features/ai/aiExecutor";

function toArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function defaultTitle() {
  const now = new Date();
  const ts = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `Сессия ${ts}`;
}

export function sessionFlowDraftStorageKey(projectId) {
  return `fpc_session_flow_ai_draft_v1:${String(projectId || "")}`;
}

function normalizeAiQuestion(it, idx = 0) {
  const id = toText(it?.id || it?.question_id || `Q${idx + 1}`);
  return {
    id,
    block: toText(it?.block),
    question: toText(it?.question || it?.text),
    ask_to: toText(it?.ask_to || it?.role || it?.askTo),
    answer_type: toText(it?.answer_type || it?.answerType),
    follow_up: toText(it?.follow_up || it?.followUp),
    answer: toText(it?.answer),
  };
}

function loadAiDraft(projectId) {
  const key = sessionFlowDraftStorageKey(projectId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const questions = toArray(parsed.questions).map((x, i) => normalizeAiQuestion(x, i)).filter((x) => !!x.question);
    return {
      title: toText(parsed.title),
      questions,
    };
  } catch {
    return null;
  }
}

function saveAiDraft(projectId, payload) {
  const key = sessionFlowDraftStorageKey(projectId);
  try {
    localStorage.setItem(key, JSON.stringify(payload || {}));
  } catch {
    // ignore storage errors
  }
}

function clearAiDraft(projectId) {
  const key = sessionFlowDraftStorageKey(projectId);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function defaultModel() {
  return {
    title: defaultTitle(),
  };
}

function createAiRunState(patch = {}) {
  return {
    status: "idle", // idle | opening | loading | success | error
    runId: "",
    startedAt: "",
    finishedAt: "",
    progressText: "",
    errorText: "",
    lastResultCount: 0,
    lastSessionId: "",
    ...patch,
  };
}

function createRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function shouldLogAiUi() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_AI__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAiUi(tag, payload = {}) {
  if (!shouldLogAiUi()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_UI] ${String(tag || "trace")} ${suffix}`.trim());
}

export default function SessionFlowModal({ open, busy, projectId, onClose, onSubmit }) {
  const [model, setModel] = useState(defaultModel());
  const [err, setErr] = useState("");
  const [aiQuestions, setAiQuestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRun, setAiRun] = useState(() => createAiRunState());
  const aiRunIdRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const defaults = defaultModel();
    const saved = loadAiDraft(projectId);
    const nextModel = {
      ...defaults,
      title: toText(saved?.title) || defaults.title,
    };
    setModel(nextModel);
    setErr("");
    const nextQuestions = toArray(saved?.questions).map((x, i) => normalizeAiQuestion(x, i)).filter((x) => !!x.question);
    setAiQuestions(nextQuestions);
    setAiOpen(nextQuestions.length > 0);
    setAiErr("");
    setAiRun(
      createAiRunState({
        status: nextQuestions.length ? "success" : "idle",
        progressText: nextQuestions.length ? `Показан последний результат (${nextQuestions.length}).` : "",
        lastResultCount: nextQuestions.length,
        lastSessionId: "",
      })
    );
    aiRunIdRef.current = "";
  }, [open, projectId]);

  const canSubmit = !!projectId && !!toText(model.title);
  const aiPayloadJson = useMemo(() => JSON.stringify(aiQuestions), [aiQuestions]);
  const resetForm = () => {
    const defaults = defaultModel();
    setModel(defaults);
    setErr("");
    setAiErr("");
    setAiQuestions([]);
    setAiOpen(false);
    setAiRun(createAiRunState());
    aiRunIdRef.current = "";
  };

  useEffect(() => {
    if (!open) return;
    saveAiDraft(projectId, {
      title: toText(model.title),
      questions: aiQuestions,
      ts: Date.now(),
    });
  }, [open, projectId, model.title, aiPayloadJson]);

  async function generateAiQuestions() {
    if (busy || aiBusy) return;
    const title = toText(model.title);
    if (!title) {
      setAiErr("Сначала введите название сессии.");
      setAiRun(
        createAiRunState({
          status: "error",
          progressText: "Ошибка ввода",
          errorText: "Сначала введите название сессии.",
          lastResultCount: toArray(aiQuestions).length,
          lastSessionId: "",
        })
      );
      return;
    }
    const runId = createRunId();
    const startedAtTs = Date.now();
    const startedAt = new Date(startedAtTs).toISOString();
    aiRunIdRef.current = runId;
    setAiOpen(true);
    setAiRun(
      createAiRunState({
        status: "opening",
        runId,
        startedAt,
        progressText: "Открываем окно вопросов...",
        lastResultCount: toArray(aiQuestions).length,
        lastSessionId: "",
      })
    );
    logAiUi("click", { sessionId: "", projectId: String(projectId || ""), runId, titleLen: title.length });
    logAiUi("open", { sessionId: "", projectId: String(projectId || ""), runId, status: "opening" });
    setAiBusy(true);
    setAiErr("");
    setErr("");
    setAiRun((prev) =>
      prev.runId === runId
        ? {
            ...prev,
            status: "loading",
            progressText: "Запрос отправлен",
            errorText: "",
          }
        : prev
    );
    logAiUi("loading", { sessionId: "", projectId: String(projectId || ""), runId, phase: "request_sent" });
    try {
      const payload = {
        title,
        project_id: String(projectId || ""),
        min_questions: 15,
        max_questions: 20,
      };
      const exec = await executeAi({
        toolId: "session_title_questions",
        sessionId: "",
        projectId: String(projectId || ""),
        inputHash: createAiInputHash(payload),
        payload,
        mode: "live",
        run: () => apiSessionTitleQuestions(payload),
      });
      if (!exec.ok) {
        const errorText = String(exec?.error?.message || "Не удалось получить вопросы от AI.");
        if (exec?.error?.shouldNotify !== false) {
          setAiErr(errorText);
        }
        const finishedAtTs = Date.now();
        if (aiRunIdRef.current === runId) {
          setAiRun((prev) =>
            prev.runId === runId
              ? {
                  ...prev,
                  status: "error",
                  finishedAt: new Date(finishedAtTs).toISOString(),
                  progressText: "Ошибка запроса",
                  errorText,
                  lastResultCount: toArray(aiQuestions).length,
                }
              : prev
          );
        }
        logAiUi("error", {
          sessionId: "",
          projectId: String(projectId || ""),
          runId,
          durationMs: finishedAtTs - startedAtTs,
          message: errorText,
        });
        return;
      }
      setAiRun((prev) =>
        prev.runId === runId
          ? {
              ...prev,
              status: "loading",
              progressText: "Получен ответ",
            }
          : prev
      );
      logAiUi("loading", { sessionId: "", projectId: String(projectId || ""), runId, phase: "response_received" });
      const r = exec.result;
      if (!r?.ok) {
        const errorText = String(r?.error || "Не удалось получить вопросы от AI.");
        setAiErr(errorText);
        const finishedAtTs = Date.now();
        if (aiRunIdRef.current === runId) {
          setAiRun((prev) =>
            prev.runId === runId
              ? {
                  ...prev,
                  status: "error",
                  finishedAt: new Date(finishedAtTs).toISOString(),
                  progressText: "Ошибка ответа",
                  errorText,
                  lastResultCount: toArray(aiQuestions).length,
                }
              : prev
          );
        }
        logAiUi("error", {
          sessionId: "",
          projectId: String(projectId || ""),
          runId,
          durationMs: finishedAtTs - startedAtTs,
          message: errorText,
        });
        return;
      }
      setAiRun((prev) =>
        prev.runId === runId
          ? {
              ...prev,
              status: "loading",
              progressText: "Парсинг ответа",
            }
          : prev
      );
      logAiUi("loading", { sessionId: "", projectId: String(projectId || ""), runId, phase: "parsing" });
      const incoming = toArray(r.result?.questions).map((x, i) => normalizeAiQuestion(x, i)).filter((x) => !!x.question);
      const prevById = {};
      toArray(aiQuestions).forEach((q) => {
        prevById[toText(q.id)] = q;
      });
      const merged = incoming.map((q, i) => {
        const k = toText(q.id) || `Q${i + 1}`;
        const prev = prevById[k];
        return {
          ...q,
          id: k,
          answer: toText(prev?.answer || q.answer),
        };
      });
      setAiQuestions(merged);
      setAiOpen(true);
      if (!merged.length) {
        setAiErr("AI не вернул валидный список вопросов. Уточните название и повторите.");
      } else if (exec.cached) {
        setAiErr("AI временно недоступен: показан последний успешный набор вопросов (cached).");
      }
      const finishedAtTs = Date.now();
      if (aiRunIdRef.current === runId) {
        setAiRun((prev) =>
          prev.runId === runId
            ? {
                ...prev,
                status: "success",
                finishedAt: new Date(finishedAtTs).toISOString(),
                progressText: exec.cached ? "Готово (cached)" : "Готово",
                errorText: "",
                lastResultCount: merged.length,
              }
            : prev
        );
      }
      logAiUi("success", {
        sessionId: "",
        projectId: String(projectId || ""),
        runId,
        durationMs: finishedAtTs - startedAtTs,
        resultCount: merged.length,
        cached: exec.cached ? 1 : 0,
      });
    } finally {
      setAiBusy(false);
    }
  }

  function removeAiQuestion(questionId) {
    const qid = toText(questionId);
    if (!qid) return;
    setAiQuestions((prev) => toArray(prev).filter((x) => toText(x.id) !== qid));
  }

  function updateAiAnswer(questionId, answer) {
    const qid = toText(questionId);
    if (!qid) return;
    setAiQuestions((prev) =>
      toArray(prev).map((x) => (toText(x.id) === qid ? { ...x, answer: String(answer || "") } : x))
    );
  }

  async function submit(action) {
    if (!canSubmit || busy) {
      setErr("Заполните название сессии.");
      return;
    }
    setErr("");
    const success = Boolean(
      await onSubmit?.({
        title: toText(model.title),
        mode: "quick_skeleton",
        ai_prep_questions: toArray(aiQuestions)
          .map((q, i) => ({
            id: toText(q.id) || `Q${i + 1}`,
            block: toText(q.block),
            question: toText(q.question),
            ask_to: toText(q.ask_to),
            answer_type: toText(q.answer_type),
            follow_up: toText(q.follow_up),
            answer: toText(q.answer),
          }))
          .filter((q) => !!q.question),
        action,
      })
    );
    if (success) {
      clearAiDraft(projectId);
      resetForm();
    }
  }

  const footer = (
    <>
      <button type="button" className="secondaryBtn" onClick={onClose} disabled={busy}>
        Отмена
      </button>
      <button type="button" className="secondaryBtn" onClick={() => submit("generate")} disabled={!canSubmit || busy}>
        {busy ? "Создаю..." : "Создать и сгенерировать"}
      </button>
      <button type="button" className="primaryBtn" onClick={() => submit("interview")} disabled={!canSubmit || busy}>
        {busy ? "Создаю..." : "Создать и начать интервью"}
      </button>
    </>
  );

  return (
    <Modal open={open} title="Создание сессии" onClose={onClose} footer={footer}>
      <div className="sessionFlowGrid">
        <div className="field">
          <div className="label">Название сессии</div>
          <div className="sessionFlowTitleRow">
            <input
              className="input"
              value={model.title}
              onChange={(e) => setModel((prev) => ({ ...prev, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  generateAiQuestions();
                }
              }}
            />
            <button
              type="button"
              className={"iconBtn sessionFlowAiBtn" + (aiOpen ? " on" : "") + (aiBusy ? " isLoading" : "")}
              onClick={generateAiQuestions}
              disabled={busy || aiBusy}
              title="Сформировать вопросы от AI"
            >
              {aiBusy ? "AI..." : "✦ AI"}
            </button>
          </div>
        </div>
      </div>

      <div className="sessionFlowHint">
        Сценарий: создать сессию → перейти к сборке процесса в Diagram. Акторы появляются из BPMN pool/lanes.
      </div>

      {aiOpen ? (
        <div className="sessionFlowAiPanel">
          <div className="sessionFlowAiHead">
            <div className="grid gap-1">
              <div className="label">AI-вопросы для первого интервью</div>
              <div className="muted small">Ответы сохраняются автоматически во время ввода.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="secondaryBtn smallBtn"
                onClick={generateAiQuestions}
                disabled={busy || aiBusy}
              >
                {aiBusy ? "Генерация..." : "Пересобрать"}
              </button>
              <button
                type="button"
                className="secondaryBtn smallBtn"
                disabled
                title="Остановка AI-запроса пока недоступна."
              >
                Остановить
              </button>
            </div>
          </div>
          <div className={"sessionFlowAiStatus " + aiRun.status}>
            <div className="sessionFlowAiStatusMain">
              <span className={"sessionFlowAiStatusDot " + aiRun.status} />
              <span>{aiRun.progressText || (aiBusy ? "Генерация вопросов..." : "Ожидание запуска AI.")}</span>
            </div>
            <div className="sessionFlowAiStatusMeta">
              <span>runId: {toText(aiRun.runId) || "—"}</span>
              <span>результатов: {Number(aiRun.lastResultCount || 0)}</span>
            </div>
            {toText(aiRun.errorText) ? <div className="sessionFlowAiStatusErr">{toText(aiRun.errorText)}</div> : null}
            {aiRun.status === "error" ? (
              <div className="sessionFlowAiStatusActions">
                <button type="button" className="secondaryBtn smallBtn" onClick={generateAiQuestions} disabled={busy || aiBusy}>
                  Повторить
                </button>
              </div>
            ) : null}
          </div>
          {!aiQuestions.length && !aiBusy ? <div className="muted small">Список пока пуст. Нажмите `✦ AI` или Enter в поле названия.</div> : null}
          {!aiQuestions.length && aiBusy ? (
            <div className="sessionFlowAiSkeleton">
              <div className="sessionFlowAiSkeletonRow" />
              <div className="sessionFlowAiSkeletonRow" />
              <div className="sessionFlowAiSkeletonRow" />
            </div>
          ) : null}
          <div className="sessionFlowAiList">
            {aiQuestions.map((q) => (
              <div className="sessionFlowAiItem" key={q.id}>
                <div className="sessionFlowAiItemTop">
                  <div className="sessionFlowAiMeta">
                    <span className="chip on">{q.id}</span>
                    {q.block ? <span className="chip">{q.block}</span> : null}
                  </div>
                  <button type="button" className="iconBtn sessionFlowChipDel" onClick={() => removeAiQuestion(q.id)} title="Удалить вопрос" disabled={busy || aiBusy}>
                    ✕
                  </button>
                </div>
                <div className="sessionFlowAiQuestion">{q.question}</div>
                <div className="sessionFlowAiFoot muted small">
                  {q.ask_to ? `Кому: ${q.ask_to}` : "Кому: —"} · {q.answer_type ? `Тип: ${q.answer_type}` : "Тип: —"}
                </div>
                {q.follow_up ? <div className="sessionFlowAiFollow small">Follow-up: {q.follow_up}</div> : null}
                <textarea
                  className="input sessionFlowAiAnswer"
                  rows={2}
                  placeholder="Ответ интервьюера..."
                  value={q.answer}
                  onChange={(e) => updateAiAnswer(q.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {err ? <div className="badge err">{err}</div> : null}
      {aiErr ? <div className="badge err">{aiErr}</div> : null}
      {!projectId ? <div className="badge err">Сначала выберите проект.</div> : null}
    </Modal>
  );
}
