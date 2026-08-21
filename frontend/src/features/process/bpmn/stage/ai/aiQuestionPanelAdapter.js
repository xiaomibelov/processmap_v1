function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function normalizeAiQuestionStatus(raw) {
  return String(raw || "").trim().toLowerCase() === "done" ? "done" : "open";
}

function resolveCtx(ctxBase) {
  if (typeof ctxBase === "function") return asObject(ctxBase());
  return asObject(ctxBase);
}

export function createAiQuestionPanelAdapter(ctxBase = {}) {
  function getCtx() {
    const ctx = resolveCtx(ctxBase);
    const refs = asObject(ctx.refs);
    const callbacks = asObject(ctx.callbacks);
    const getters = asObject(ctx.getters);
    const utils = asObject(ctx.utils);
    return {
      refs,
      callbacks,
      getters,
      utils: {
        asObject: typeof utils.asObject === "function" ? utils.asObject : asObject,
        asArray: typeof utils.asArray === "function" ? utils.asArray : asArray,
        toText: typeof utils.toText === "function" ? utils.toText : toText,
        normalizeAiQuestionStatus: typeof utils.normalizeAiQuestionStatus === "function"
          ? utils.normalizeAiQuestionStatus
          : normalizeAiQuestionStatus,
      },
    };
  }

  function clearAiQuestionPanel(inst, kind, options = {}) {
    const { refs, callbacks, utils } = getCtx();
    const mode = kind === "editor" ? "editor" : "viewer";
    const state = utils.asObject(refs.aiQuestionPanelStateRef?.current?.[mode]);
    const overlayId = state.overlayId;
    if (overlayId) {
      try {
        const target = inst || callbacks.getInstance?.(mode);
        target?.get?.("overlays")?.remove?.(overlayId);
      } catch {
      }
    }
    if (refs.aiQuestionPanelStateRef?.current) {
      refs.aiQuestionPanelStateRef.current[mode] = {
        overlayId: null,
        elementId: options.keepElementId ? String(state.elementId || "") : "",
      };
    }
    if (!options.keepTarget && refs.aiQuestionPanelTargetRef?.current) {
      refs.aiQuestionPanelTargetRef.current[mode] = "";
    }
  }

  function openAiQuestionPanel(inst, kind, elementId, options = {}) {
    const { refs, callbacks, getters, utils } = getCtx();
    if (!inst) return;
    const mode = kind === "editor" ? "editor" : "viewer";
    const eid = utils.toText(elementId);
    if (!eid) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const registry = inst.get("elementRegistry");
    const overlays = inst.get("overlays");
    const el = registry.get(eid);
    if (!getters.isShapeElement?.(el)) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const questions = utils.asArray(callbacks.getAiQuestionsForElement?.(eid));
    if (!questions.length) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    const prevState = utils.asObject(refs.aiQuestionPanelStateRef?.current?.[mode]);
    if (
      options.toggle
      && prevState.overlayId
      && utils.toText(prevState.elementId) === eid
    ) {
      clearAiQuestionPanel(inst, mode);
      return;
    }

    clearAiQuestionPanel(inst, mode, { keepTarget: true });
    if (refs.aiQuestionPanelTargetRef?.current) {
      refs.aiQuestionPanelTargetRef.current[mode] = eid;
    }

    const bo = utils.asObject(el?.businessObject);
    const title = utils.toText(bo?.name || eid);
    const stats = callbacks.aiQuestionStats?.(questions) || { total: questions.length, withoutComment: 0 };

    const panel = document.createElement("div");
    panel.className = "fpcAiQuestionPanel";
    panel.dataset.elementId = eid;
    const stopPanelEvent = (ev) => {
      ev.stopPropagation();
    };
    panel.addEventListener("pointerdown", stopPanelEvent);
    panel.addEventListener("pointerup", stopPanelEvent);
    panel.addEventListener("mousedown", stopPanelEvent);
    panel.addEventListener("mouseup", stopPanelEvent);
    panel.addEventListener("click", stopPanelEvent);
    panel.addEventListener("dblclick", stopPanelEvent);

    const head = document.createElement("div");
    head.className = "fpcAiQuestionPanelHead";
    const titleNode = document.createElement("div");
    titleNode.className = "fpcAiQuestionPanelTitle";
    titleNode.textContent = title || eid;
    const metaNode = document.createElement("div");
    metaNode.className = "fpcAiQuestionPanelMeta";
    metaNode.textContent = `AI-вопросов: ${stats.total} · без ответа: ${stats.withoutComment}`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "fpcAiQuestionPanelClose";
    closeBtn.textContent = "×";
    closeBtn.title = "Закрыть";
    const closePanel = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      clearAiQuestionPanel(inst, mode);
    };
    closeBtn.addEventListener("pointerdown", closePanel);
    closeBtn.addEventListener("click", closePanel);

    const headText = document.createElement("div");
    headText.className = "fpcAiQuestionPanelHeadText";
    headText.appendChild(titleNode);
    headText.appendChild(metaNode);
    head.appendChild(headText);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const list = document.createElement("div");
    list.className = "fpcAiQuestionList";
    questions.forEach((question) => {
      const row = document.createElement("div");
      row.className = `fpcAiQuestionRow ${utils.normalizeAiQuestionStatus(question?.status) === "done" ? "done" : "open"}`;

      const line = document.createElement("label");
      line.className = "fpcAiQuestionLine";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = utils.normalizeAiQuestionStatus(question?.status) === "done";
      checkbox.className = "fpcAiQuestionCheck";
      const text = document.createElement("span");
      text.className = "fpcAiQuestionText";
      text.textContent = utils.toText(question?.text || question?.qid);
      line.appendChild(checkbox);
      line.appendChild(text);
      row.appendChild(line);

      const textarea = document.createElement("textarea");
      textarea.className = "fpcAiQuestionComment";
      textarea.placeholder = "Комментарий/ответ...";
      textarea.value = utils.toText(question?.comment);
      textarea.rows = 2;
      row.appendChild(textarea);

      const foot = document.createElement("div");
      foot.className = "fpcAiQuestionRowFoot";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "fpcAiQuestionSave";
      saveBtn.textContent = "Сохранить";
      const state = document.createElement("span");
      state.className = "fpcAiQuestionState";
      state.textContent = "";
      foot.appendChild(saveBtn);
      foot.appendChild(state);
      row.appendChild(foot);
      list.appendChild(row);

      const applyStateText = (label) => {
        state.textContent = label;
        if (!label) return;
        setTimeout(() => {
          if (state.textContent === label) state.textContent = "";
        }, 1200);
      };

      const commit = (source) => {
        const changed = callbacks.persistAiQuestionEntry?.(eid, question.qid, {
          status: checkbox.checked ? "done" : "open",
          comment: textarea.value,
        }, { source });
        if (changed) {
          row.classList.toggle("done", checkbox.checked);
          row.classList.toggle("open", !checkbox.checked);
          applyStateText("Сохранено");
        }
      };

      checkbox.addEventListener("pointerdown", stopPanelEvent);
      checkbox.addEventListener("click", stopPanelEvent);
      checkbox.addEventListener("change", () => commit("overlay_toggle_status"));
      saveBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        commit("overlay_save_click");
      });
      saveBtn.addEventListener("pointerdown", stopPanelEvent);
      textarea.addEventListener("pointerdown", stopPanelEvent);
      textarea.addEventListener("click", stopPanelEvent);
      textarea.addEventListener("blur", () => commit("overlay_comment_blur"));
      textarea.addEventListener("keydown", (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
          ev.preventDefault();
          commit("overlay_comment_hotkey");
        }
      });
    });
    panel.appendChild(list);

    const panelWidth = 320;
    const left = Number(el?.width || 0) + 10;
    const top = Math.max(-6, Math.round(Number(el?.height || 0) / 2 - 80));
    const overlayId = overlays.add(el.id, {
      position: {
        left: Number.isFinite(left) ? left : panelWidth / 3,
        top: Number.isFinite(top) ? top : -6,
      },
      html: panel,
    });
    if (refs.aiQuestionPanelStateRef?.current) {
      refs.aiQuestionPanelStateRef.current[mode] = {
        overlayId,
        elementId: eid,
      };
    }

    callbacks.logAiOverlayTrace?.("panel_open", {
      sid: String(callbacks.getSessionId?.() || "-"),
      elementId: eid,
      count: stats.total,
      source: utils.toText(options?.source || "unknown"),
      kind: mode,
    });
  }

  return {
    openAiQuestionPanel,
    clearAiQuestionPanel,
  };
}

export default createAiQuestionPanelAdapter;
