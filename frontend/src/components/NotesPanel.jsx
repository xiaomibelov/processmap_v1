import { useEffect, useMemo, useRef, useState } from "react";
import { elementNotesForId, normalizeElementNotesMap } from "../features/notes/elementNotes";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function str(v) {
  return String(v || "").trim();
}

function roleObj(r, idx) {
  if (!r) return null;
  if (typeof r === "string") {
    const label = str(r);
    if (!label) return null;
    return { role_id: `role_${idx + 1}`, label };
  }
  if (typeof r === "object") {
    const role_id = str(r.role_id || r.id || `role_${idx + 1}`);
    const label = str(r.label || r.title || role_id);
    if (!role_id && !label) return null;
    return { role_id: role_id || `role_${idx + 1}`, label: label || role_id };
  }
  const label = str(r);
  if (!label) return null;
  return { role_id: `role_${idx + 1}`, label };
}

function normalizeRoles(roles) {
  const arr = asArray(roles);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const x = roleObj(arr[i], out.length);
    if (x) out.push(x);
  }
  return out;
}

function normalizeDerivedActors(actors) {
  const arr = asArray(actors);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i += 1) {
    const raw = arr[i];
    if (!raw || typeof raw !== "object") continue;
    const actorId = str(raw.actorId || raw.id || raw.laneId || `actor_${i + 1}`);
    const label = str(raw.name || raw.label || raw.laneName || actorId);
    if (!actorId || !label) continue;
    if (seen.has(actorId)) continue;
    seen.add(actorId);
    out.push({ role_id: actorId, label });
  }
  return out;
}

function resolveStartRole(start_role, roles) {
  const sr = str(start_role);
  if (!sr) return { label: "—", matched: false };
  const rr = normalizeRoles(roles);
  const hit = rr.find((r) => r.role_id === sr) || rr.find((r) => r.label === sr);
  return {
    label: hit ? hit.label : sr,
    matched: !!hit,
  };
}

function normalizeAiStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function normalizeAiQuestionsByElementMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
  const out = {};
  Object.keys(rawMap).forEach((rawElementId) => {
    const elementId = str(rawElementId);
    if (!elementId) return;
    const rawEntry = rawMap[rawElementId];
    const rawList = Array.isArray(rawEntry)
      ? rawEntry
      : (Array.isArray(rawEntry?.items) ? rawEntry.items : []);
    const list = rawList
      .map((rawItem, idx) => {
        const item = rawItem && typeof rawItem === "object" ? rawItem : {};
        const qid = str(item?.qid || item?.id || item?.question_id || item?.questionId || `q_${idx + 1}`);
        const text = str(item?.text || item?.question || item?.label);
        if (!qid || !text) return null;
        return {
          qid,
          text,
          status: normalizeAiStatus(item?.status),
          comment: str(item?.comment || item?.answer),
        };
      })
      .filter(Boolean);
    if (list.length) out[elementId] = list;
  });
  return out;
}

function shouldLogActorsTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_ACTORS__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_actors") || "").trim() === "1";
  } catch {
    return false;
  }
}

export default function NotesPanel({
  draft,
  selectedElement,
  elementNotesFocusKey,
  onAddNote,
  onAddElementNote,
  onUpdateElementAiQuestion,
  disabled,
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [elementText, setElementText] = useState("");
  const [elementBusy, setElementBusy] = useState(false);
  const [elementErr, setElementErr] = useState("");
  const [aiErr, setAiErr] = useState("");
  const [aiBusyQid, setAiBusyQid] = useState("");
  const [aiSavedQid, setAiSavedQid] = useState("");
  const [aiCommentDraft, setAiCommentDraft] = useState({});
  const elementNotesSectionRef = useRef(null);

  const derivedActors = useMemo(() => normalizeDerivedActors(draft?.actors_derived), [draft]);
  const legacyRoles = useMemo(() => normalizeRoles(draft?.roles), [draft]);
  const roles = derivedActors.length ? derivedActors : legacyRoles;
  const startRoleView = useMemo(
    () => (derivedActors.length ? { label: "из Diagram lanes", matched: true } : resolveStartRole(draft?.start_role, roles)),
    [draft, derivedActors, roles],
  );
  const notes = useMemo(() => {
    const arr = asArray(draft?.notes);
    return [...arr].slice(-3).reverse();
  }, [draft]);
  const noteCount = asArray(draft?.notes).length;
  const notesByElement = useMemo(
    () => normalizeElementNotesMap(draft?.notes_by_element || draft?.notesByElementId),
    [draft?.notes_by_element, draft?.notesByElementId],
  );
  const selectedElementId = str(selectedElement?.id);
  const selectedElementName = str(selectedElement?.name || selectedElementId);
  const selectedElementType = str(selectedElement?.type);
  const selectedElementNotes = useMemo(
    () => elementNotesForId(notesByElement, selectedElementId),
    [notesByElement, selectedElementId],
  );
  const aiQuestionsByElement = useMemo(
    () => normalizeAiQuestionsByElementMap(draft?.interview?.ai_questions_by_element || draft?.interview?.aiQuestionsByElementId),
    [draft?.interview?.ai_questions_by_element, draft?.interview?.aiQuestionsByElementId],
  );
  const selectedElementAiQuestions = useMemo(
    () => asArray(aiQuestionsByElement[selectedElementId]),
    [aiQuestionsByElement, selectedElementId],
  );
  const isElementMode = !!selectedElementId;
  const sid = str(draft?.session_id || draft?.id);

  useEffect(() => {
    if (!shouldLogActorsTrace()) return;
    // eslint-disable-next-line no-console
    console.debug(
      `[ACTORS] leftpanel render sid=${sid || "-"} actorsDerivedCount=${derivedActors.length}`,
    );
  }, [sid, derivedActors.length]);

  useEffect(() => {
    if (!selectedElementId) return;
    const node = elementNotesSectionRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedElementId, elementNotesFocusKey]);

  useEffect(() => {
    const next = {};
    selectedElementAiQuestions.forEach((q) => {
      next[q.qid] = str(q.comment);
    });
    setAiCommentDraft(next);
    setAiErr("");
    setAiSavedQid("");
  }, [selectedElementId, selectedElementAiQuestions]);

  function noteText(v) {
    return String(v?.text || v?.notes || v || "").trim();
  }

  async function sendGlobalNote() {
    const t = str(text);
    if (!t) return;
    if (disabled || busy) return;

    setBusy(true);
    setErr("");
    try {
      const r = onAddNote?.(t);
      const rr = r && typeof r.then === "function" ? await r : r;

      if (rr && rr.ok === false) {
        setErr(String(rr.error || "API error"));
        return;
      }

      setText("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function sendElementNote() {
    const t = str(elementText);
    if (!selectedElementId || !t) return;
    if (disabled || elementBusy) return;
    setElementBusy(true);
    setElementErr("");
    try {
      const r = onAddElementNote?.(selectedElementId, t);
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) {
        setElementErr(String(rr.error || "API error"));
        return;
      }
      setElementText("");
    } catch (e) {
      setElementErr(String(e?.message || e));
    } finally {
      setElementBusy(false);
    }
  }

  async function saveElementAiQuestion(question, patch = {}) {
    const qid = str(question?.qid);
    if (!selectedElementId || !qid) return;
    if (typeof onUpdateElementAiQuestion !== "function") return;
    if (disabled || aiBusyQid) return;

    const status = Object.prototype.hasOwnProperty.call(patch, "status")
      ? normalizeAiStatus(patch?.status)
      : normalizeAiStatus(question?.status);
    const comment = Object.prototype.hasOwnProperty.call(patch, "comment")
      ? str(patch?.comment)
      : str(aiCommentDraft[qid] ?? question?.comment);

    setAiBusyQid(qid);
    setAiErr("");
    try {
      const r = onUpdateElementAiQuestion?.(selectedElementId, qid, { status, comment });
      const rr = r && typeof r.then === "function" ? await r : r;
      if (rr && rr.ok === false) {
        setAiErr(String(rr.error || "Не удалось сохранить AI-комментарий."));
        return;
      }
      setAiSavedQid(qid);
      setTimeout(() => {
        setAiSavedQid((prev) => (prev === qid ? "" : prev));
      }, 1200);
    } catch (e) {
      setAiErr(String(e?.message || e));
    } finally {
      setAiBusyQid("");
    }
  }

  return (
    <div className="leftPanel flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <div className="card leftPanelCard actorsCard p-3">
        <div className="cardTitle text-sm font-semibold">Акторы</div>
        <div className="roleListColumn mt-2 space-y-1.5">
          {roles.length ? (
            roles.map((r, idx) => (
              <div className="roleRowItem" key={`${r.role_id || "role"}_${idx}`}>
                {idx + 1}. {r.label}
              </div>
            ))
          ) : (
            <span className="muted">Акторы не заданы.</span>
          )}
        </div>
        <div className="startRoleBox mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-panel2 px-2 py-1.5">
          <span className="sessionMetaLabel">Стартовый актор</span>
          <span className={"startRolePill " + (startRoleView.matched ? "ok" : "warn")}>
            {startRoleView.label}
          </span>
        </div>
      </div>

      {isElementMode ? (
        <div className="card leftPanelCard p-3" id="element-notes-section" ref={elementNotesSectionRef}>
          <div className="cardTitle text-sm font-semibold">Заметки узла</div>
          <div className="mt-2 rounded-lg border border-border bg-panel2 px-2 py-2 text-xs text-muted">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-semibold text-fg" title={selectedElementName}>
                {selectedElementName}
              </div>
              <span className="badge px-2 py-0.5 text-[10px]">Выбран элемент</span>
            </div>
            <div className="mt-1 truncate">
              id: <span className="font-mono">{selectedElementId}</span>
              {selectedElementType ? <span> · {selectedElementType}</span> : null}
              <span> · заметок: {selectedElementNotes.length}</span>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">AI-вопросы</div>
            {selectedElementAiQuestions.length ? (
              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {selectedElementAiQuestions.map((q) => {
                  const qid = str(q?.qid);
                  const isBusy = aiBusyQid === qid;
                  const isDone = normalizeAiStatus(q?.status) === "done";
                  const commentValue = str(aiCommentDraft[qid] ?? q?.comment);
                  return (
                    <div key={qid} className={`rounded-lg border border-border bg-panel2 px-2 py-2 ${isDone ? "ring-1 ring-emerald-400/40" : ""}`}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={(e) => {
                            void saveElementAiQuestion(q, { status: e.target.checked ? "done" : "open" });
                          }}
                          disabled={!!disabled || isBusy}
                        />
                        <span className="text-xs text-fg">{q.text}</span>
                      </label>

                      <textarea
                        className="input mt-2 text-xs"
                        placeholder="Комментарий/ответ..."
                        value={commentValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          setAiCommentDraft((prev) => ({ ...prev, [qid]: next }));
                        }}
                        onBlur={() => {
                          void saveElementAiQuestion(q, { comment: commentValue });
                        }}
                        rows={2}
                        style={{ resize: "vertical" }}
                        disabled={!!disabled || isBusy}
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="secondaryBtn h-7 px-2 text-[11px]"
                          onClick={() => {
                            void saveElementAiQuestion(q, { comment: commentValue });
                          }}
                          disabled={!!disabled || isBusy}
                        >
                          {isBusy ? "Сохраняю..." : "Сохранить"}
                        </button>
                        <span className="text-[11px] text-muted">
                          {aiSavedQid === qid ? "Сохранено" : isDone ? "Готово" : "Открыто"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-muted">
                Для выбранного узла AI-вопросов пока нет.
              </div>
            )}
            {aiErr ? <div className="badge err mt-2">{aiErr}</div> : null}
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Заметка узла</div>
            {selectedElementNotes.length ? (
              <div className="max-h-40 space-y-1.5 overflow-auto pr-1">
                {selectedElementNotes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border bg-panel2 px-2 py-1.5 text-xs text-fg">
                    {n.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">Пока нет заметок для этого элемента.</div>
            )}

            {elementErr ? <div className="badge err mt-2">{elementErr}</div> : null}
            <textarea
              className="input mt-2"
              placeholder="Заметка для выбранного узла..."
              value={elementText}
              onChange={(e) => setElementText(e.target.value)}
              rows={3}
              style={{ resize: "vertical" }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendElementNote();
                }
              }}
              disabled={!!disabled || elementBusy}
            />
            <button type="button" className="secondaryBtn mt-2 w-full" onClick={sendElementNote} disabled={!!disabled || elementBusy}>
              {elementBusy ? "Сохраняю..." : "Добавить заметку к узлу"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card leftPanelCard notesPreviewCard p-3">
            <div className="cardTitle text-sm font-semibold">Заметки (общие)</div>
            <div className="sessionMetaRow mt-1 flex items-center justify-between">
              <span className="sessionMetaLabel">Количество</span>
              <span className="sessionMetaValue">{noteCount}</span>
            </div>
            {noteCount === 0 ? <div className="muted">Пока заметок нет.</div> : null}
            {notes.length ? (
              <div className="notesPreviewList mt-2 space-y-1.5">
                {notes.map((n, i) => (
                  <div className="notesPreviewItem muted rounded-md border border-border bg-panel2 px-2 py-1.5" key={n?.id || i}>
                    {noteText(n).slice(0, 140)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card leftPanelCard composerCard p-3">
            <div className="cardTitle text-sm font-semibold">Сообщения / заметки</div>

            <div className="muted leftPanelComposerHint mt-1">
              Ctrl/⌘ + Enter — отправить
            </div>

            {err ? (
              <div className="badge err leftPanelError">
                {err}
              </div>
            ) : null}

            <textarea
              className="input"
              placeholder="Сообщение..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              style={{ resize: "vertical" }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendGlobalNote();
                }
              }}
              disabled={!!disabled || busy}
            />

            <div className="mt-2 flex items-center justify-end">
              <button type="button" className="primaryBtn" onClick={sendGlobalNote} disabled={!!disabled || busy}>
                {busy ? "Отправляю..." : "Отправить"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
