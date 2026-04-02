import {
  normalizeAttentionMarkers,
  isAttentionMarkerUnread,
  countUnreadAttentionMarkers,
  countAttentionMarkers,
} from "./attentionMarkers.js";

function asArray(v) { return Array.isArray(v) ? v : []; }
function asObject(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function toText(v) { return String(v ?? "").trim(); }
function toNodeId(v) { return String(v ?? "").trim() || ""; }

const QUALITY_RULE_COPY = Object.freeze({
  missing_start_event: { title: "Не указано начало процесса", short: "На схеме нет точки, откуда процесс стартует.", fix: "Добавьте событие «Старт» и соедините его со следующим шагом." },
  missing_end_event: { title: "Не указано завершение процесса", short: "На схеме нет явной точки завершения.", fix: "Добавьте событие «Завершение» и подведите к нему финальный шаг." },
  dangling_incoming: { title: "Шаг недостижим", short: "К этому шагу не ведет ни один переход.", fix: "Добавьте входящий переход от предыдущего шага." },
  dangling_outgoing: { title: "Шаг обрывает процесс", short: "После этого шага нет перехода дальше.", fix: "Добавьте переход к следующему шагу или к завершению." },
  gateway_missing_inout: { title: "Развилка разрывает цепочку", short: "У развилки нет корректного входа или выхода.", fix: "Проверьте, что к развилке есть вход и хотя бы один выход." },
  gateway_missing_condition: { title: "Для веток не заданы условия", short: "У развилки есть несколько выходов, но не подписаны условия.", fix: "Добавьте условия переходов или отметьте ветку по умолчанию." },
  gateway_single_outgoing: { title: "Развилка не дает ветвления", short: "У развилки только один выход.", fix: "Либо добавьте альтернативную ветку, либо уберите развилку." },
  task_without_label: { title: "Шаг без названия", short: "Название шага пустое.", fix: "Укажите короткое понятное название шага." },
  long_label: { title: "Слишком длинное название шага", short: "Название сложно читать на диаграмме.", fix: "Сократите название до краткой формулировки." },
  task_without_lane: { title: "Шаг без роли/лайна", short: "Для шага не указан исполнитель.", fix: "Назначьте шагу роль или lane." },
  duplicate_task_name: { title: "Повторяются названия шагов", short: "Несколько шагов имеют одинаковое название.", fix: "Переименуйте шаги, чтобы их можно было различать." },
  cycle_detected: { title: "Обнаружен цикл в процессе", short: "Процесс может зациклиться.", fix: "Проверьте ветвления и условия переходов, чтобы разорвать цикл." },
  unreachable_from_start: { title: "Шаг не связан с началом процесса", short: "Этот шаг не достижим от стартового события.", fix: "Свяжите шаг цепочкой переходов от старта." },
  interview_mismatch: { title: "Несовпадение Interview и диаграммы", short: "Данные Interview не соответствуют текущей схеме.", fix: "Синхронизируйте шаги Interview с диаграммой." },
  generic: { title: "Найдена проблема качества", short: "Проверьте выделенный шаг на схеме.", fix: "Откройте элемент и уточните связи, название и роль." },
});

function qualityIssueCopy(issue, nodeTitle = "") {
  const ruleId = String(issue?.ruleId || "generic").trim().toLowerCase() || "generic";
  const preset = QUALITY_RULE_COPY[ruleId] || QUALITY_RULE_COPY.generic;
  const fallbackReason = String(asArray(issue?.reasons)[0] || "").trim();
  const fallbackFix = String(issue?.fixHint || issue?.aiHint || "").trim();
  return {
    ruleId,
    title: String(preset?.title || QUALITY_RULE_COPY.generic.title),
    short: String(preset?.short || fallbackReason || QUALITY_RULE_COPY.generic.short),
    fix: fallbackFix || String(preset?.fix || QUALITY_RULE_COPY.generic.fix),
    nodeTitle: String(nodeTitle || "").trim() || "Шаг без названия",
  };
}

/**
 * Core attention marker derivation — pure function.
 * Mirrors the inline useMemo blocks from ProcessStage.jsx lines 856-920.
 */
export function deriveAttentionMarkers({
  user,
  bpmnMeta,
  attentionSessionLastOpenedAt,
  sid,
}) {
  const attentionViewerId = toText(user?.id || user?.user_id || user?.email || "anon");
  const attentionStorageKey = `pm:attention_last_opened:v1:${attentionViewerId}:${sid || "-"}`;
  const attentionMarkers = normalizeAttentionMarkers(asObject(bpmnMeta).attention_markers);
  const attentionShowOnWorkspace = asObject(bpmnMeta).attention_show_on_workspace !== false;

  const attentionMarkersWithState = attentionMarkers.map((marker) => {
    const unread = isAttentionMarkerUnread(marker, attentionViewerId, attentionSessionLastOpenedAt);
    return { ...marker, unread };
  });

  const attentionMarkerUnreadCount = countUnreadAttentionMarkers(
    attentionMarkers, attentionViewerId, attentionSessionLastOpenedAt,
  );

  const attentionMarkerHomeCount = countAttentionMarkers(
    attentionMarkers, { showOnWorkspace: attentionShowOnWorkspace },
  );

  const customAttentionHints = attentionMarkersWithState
    .filter((marker) => !marker.is_checked && marker.node_id)
    .map((marker) => ({
      id: marker.id,
      nodeId: marker.node_id,
      title: marker.message,
      reasons: [marker.message],
      markerClass: marker.unread ? "fpcAttentionMarkerUnread" : "fpcAttentionMarkerSeen",
      severity: marker.unread ? "high" : "medium",
      hideTag: true,
    }));

  return {
    attentionViewerId,
    attentionStorageKey,
    attentionMarkers,
    attentionShowOnWorkspace,
    attentionMarkersWithState,
    attentionMarkerUnreadCount,
    attentionMarkerHomeCount,
    customAttentionHints,
  };
}

/**
 * Attention items aggregation — merges coverage + quality signals
 * into a unified attention-item list. Pure function.
 * Mirrors ProcessStage.jsx lines 2025-2168.
 */
export function deriveAttentionItems({
  coverageRowsAll,
  coverageById,
  coverageNodes,
  qualityHintsRaw,
  qualityNodeTitleById,
  attentionFilters,
}) {
  // coverageNodeMetaById — only used here, inlined
  const coverageNodeMetaById = {};
  asArray(coverageNodes).forEach((node) => {
    const id = toNodeId(node?.id);
    if (!id) return;
    coverageNodeMetaById[id] = {
      id,
      title: String(node?.title || node?.name || id).trim() || id,
      lane: String(node?.actor_role || node?.laneName || node?.lane || "").trim(),
      type: String(node?.type || "").trim(),
    };
  });

  // qualityReasonsByNode — uses qualityIssueCopy
  const qualityReasonsByNode = {};
  asArray(qualityHintsRaw).forEach((issue) => {
    const nodeId = toNodeId(issue?.nodeId);
    if (!nodeId) return;
    const nodeTitle = String(
      qualityNodeTitleById[nodeId]
      || coverageById[nodeId]?.title
      || issue?.title
      || nodeId,
    ).trim();
    const ui = qualityIssueCopy(issue, nodeTitle);
    const reason = {
      id: `quality:${ui.ruleId}`,
      kind: "quality",
      text: `Ошибка качества: ${ui.short}`,
      detail: ui.fix,
    };
    if (!Array.isArray(qualityReasonsByNode[nodeId])) qualityReasonsByNode[nodeId] = [];
    if (!qualityReasonsByNode[nodeId].some((it) => String(it?.id || "") === reason.id)) {
      qualityReasonsByNode[nodeId].push(reason);
    }
  });

  // attentionItemsRaw
  const byNode = {};
  const ensureItem = (nodeId) => {
    const id = toNodeId(nodeId);
    if (!id) return null;
    if (!byNode[id]) {
      const row = coverageById[id];
      const meta = coverageNodeMetaById[id] || {};
      byNode[id] = {
        id,
        title: String(row?.title || meta?.title || qualityNodeTitleById[id] || id).trim() || id,
        lane: String(row?.lane || meta?.lane || "").trim(),
        type: String(row?.type || meta?.type || "").trim(),
        reasons: [],
        hasQuality: false,
        hasAiMissing: false,
        hasNotesMissing: false,
        hasDodMissing: false,
        priority: Number(row?.score || 0),
      };
    }
    return byNode[id];
  };

  asArray(coverageRowsAll).forEach((row) => {
    const item = ensureItem(row?.id);
    if (!item) return;
    const dodMissingCount = Number(!!row?.missingNotes) + Number(!!row?.missingAiQuestions) + Number(!!row?.missingDurationQuality);
    if (row?.missingAiQuestions) {
      item.hasAiMissing = true;
      item.reasons.push({ id: "ai_missing", kind: "ai", text: "Нет AI-вопросов" });
    }
    if (row?.missingNotes) {
      item.hasNotesMissing = true;
      item.reasons.push({ id: "notes_missing", kind: "notes", text: "Нет заметок" });
    }
    if (dodMissingCount > 0) {
      item.hasDodMissing = true;
      item.reasons.push({ id: "dod_missing", kind: "dod", text: `DoD: missing ${dodMissingCount}` });
    }
  });

  Object.entries(qualityReasonsByNode).forEach(([nodeId, reasons]) => {
    const item = ensureItem(nodeId);
    if (!item) return;
    item.hasQuality = true;
    item.priority = Math.max(item.priority, 10);
    asArray(reasons).forEach((reason) => {
      if (!item.reasons.some((it) => String(it?.id || "") === String(reason?.id || ""))) {
        item.reasons.push(reason);
      }
    });
  });

  const attentionItemsRaw = Object.values(byNode)
    .map((item) => ({
      ...item,
      reasons: asArray(item?.reasons).slice(0, 3),
    }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => {
      const qualityDelta = Number(!!b.hasQuality) - Number(!!a.hasQuality);
      if (qualityDelta !== 0) return qualityDelta;
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
      if (priorityDelta !== 0) return priorityDelta;
      return String(a.title || "").localeCompare(String(b.title || ""), "ru");
    });

  // attentionFilterKinds
  const attentionFilterKinds = Object.entries(attentionFilters || {})
    .filter(([, enabled]) => !!enabled)
    .map(([kind]) => String(kind || "").trim());

  // attentionItems
  const attentionItems = !attentionFilterKinds.length
    ? attentionItemsRaw
    : attentionItemsRaw.filter((item) => attentionFilterKinds.some((kind) => {
      if (kind === "quality") return !!item?.hasQuality;
      if (kind === "ai") return !!item?.hasAiMissing;
      if (kind === "notes") return !!item?.hasNotesMissing;
      return false;
    }));

  return {
    coverageNodeMetaById,
    qualityReasonsByNode,
    attentionItemsRaw,
    attentionFilterKinds,
    attentionItems,
  };
}
