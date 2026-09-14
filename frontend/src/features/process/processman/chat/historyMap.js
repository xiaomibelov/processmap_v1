// AGENT-HISTORY — маппинг AgentTurnOut (GET /api/sessions/{id}/agent/history)
// в view-модель сообщений ленты процессмена (chat/processmanChatStore).
// Контракт content-dict — backend/app/agent/memory_store.py + app/agent/chat.py:
//   user:      { text, selected_step_id }
//   assistant: { text, status? } (+ колонки action/action_payload/usage)
// Маппер защитный: битые/пустые turn'ы пропускаются, исключений не бросает.
import { AGENT_STATUS, CHAT_ROLE } from "./processmanChatStore.js";

function asText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch {
    return "";
  }
}

/** Текст из content-dict: плоский text или fallback JSON (только для непустого dict). */
function readContentText(content) {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const text = asText(content.text || "");
  if (text) return text;
  if (!Object.keys(content).length) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

/**
 * Один AgentTurnOut -> сообщение ленты (или null, если turn служебный/битый).
 * Не мутирует turn; поля совместимы с append* helper'ами стора.
 */
export function mapHistoryTurnToMessage(turn) {
  if (!turn || typeof turn !== "object") return null;
  const role = String(turn.role || "").trim();
  const rawContent = turn.content;
  const content = rawContent && typeof rawContent === "object" ? rawContent : {};
  const at = Number(turn.created_at) > 0 ? Number(turn.created_at) : Date.now();

  if (role === "user") {
    const text = readContentText(rawContent);
    if (!text.trim()) return null; // служебный/пустой turn — не показываем
    return {
      id: `h_${asText(turn.id || "u")}`,
      role: CHAT_ROLE.USER,
      text,
      at,
    };
  }

  if (role === "assistant") {
    const status = String(content.status || "").trim();
    const text = readContentText(content);
    if (!text.trim()) return null;
    const action = turn.action ? String(turn.action) : "";
    const msg = {
      id: `h_${asText(turn.id || "a")}`,
      role: CHAT_ROLE.AGENT,
      status: AGENT_STATUS.DONE,
      action,
      stepId: content.selected_step_id ? asText(content.selected_step_id) : "",
      question: "",
      text,
      meta: {
        hydrated: true,
        usage: turn.usage && typeof turn.usage === "object" ? turn.usage : null,
      },
      errorText: "",
      errorStatus: "",
      at,
    };
    // ошибочный assistant-turn (LLM-фейл, см. chat.py) — честный error-статус
    if (status && status !== "ok") {
      msg.status = AGENT_STATUS.ERROR;
      msg.errorStatus = status;
    }
    return msg;
  }

  return null; // системные/неизвестные роли — пропускаем
}

/** Массив turn'ов -> массив сообщений ленты (порядок сохраняется). */
export function mapHistoryTurnsToMessages(turns) {
  if (!Array.isArray(turns)) return [];
  const out = [];
  for (const turn of turns) {
    const msg = mapHistoryTurnToMessage(turn);
    if (msg) out.push(msg);
  }
  return out;
}
