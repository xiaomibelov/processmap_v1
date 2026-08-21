function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mdCell(value) {
  const raw = toText(value).replaceAll("|", "\\|").replace(/\s+/g, " ");
  return raw || "—";
}

function secToLabel(secRaw) {
  const sec = Number(secRaw);
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const rounded = Math.round(sec);
  if (rounded < 60) return `${rounded} сек`;
  if (rounded < 3600) {
    if (rounded % 60 === 0) return `${Math.round(rounded / 60)} мин`;
    return `${Math.floor(rounded / 60)} мин ${rounded % 60} сек`;
  }
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function stepRefText(step) {
  const graphNo = toText(step?.graphNo || step?.graph_path || step?.graphPath);
  const title = toText(step?.title || step?.nodeName || step?.nodeId);
  return graphNo ? `#${graphNo} ${title}` : title;
}

function normalizeRtier(raw) {
  const key = toText(raw).toUpperCase();
  if (key === "R0" || key === "R1" || key === "R2") return key;
  if (key.startsWith("R2.")) return key;
  return "";
}

function buildStepDetails(lines, step) {
  const graphNo = toText(step?.graph?.graphNo || step?.index);
  lines.push(`#### Шаг ${graphNo}. ${toText(step?.title) || "Без названия"}`);
  lines.push("- Контекст:");
  lines.push(`  - Lane: ${toText(step?.laneName) || "—"}`);
  lines.push(`  - BPMN: ${toText(step?.bpmn?.nodeName) || "—"} (${toText(step?.bpmn?.nodeId) || "unbound"})`);
  lines.push(`  - Тип шага: ${toText(step?.bpmn?.nodeType) || "—"}`);
  lines.push(`  - Время шага: ${secToLabel(step?.durationSec)}`);
  lines.push(`  - Tier: ${toText(step?.tier) || "None"}`);
  lines.push(`  - AI: ${Number(step?.ai?.questionsCount || 0)}`);
  lines.push(`  - Notes: ${Number(step?.notes?.elementCount || 0)}`);
  if (asObject(step?.dod).total > 0) {
    lines.push("- DoD checklist:");
    lines.push(`  - Статус: ${Number(step?.dod?.done || 0)}/${Number(step?.dod?.total || 0)} (${Number(step?.dod?.score || 0)}%)`);
    const missing = toArray(step?.dod?.missingKeys).map((key) => toText(key)).filter(Boolean);
    if (missing.length) lines.push(`  - Missing: ${missing.join(", ")}`);
  }

  const between = asObject(step?.graph?.betweenBranchesSummary);
  if (between && Number(between?.branchesCount || 0) > 0) {
    lines.push("- Ветки/альтернативные сценарии:");
    lines.push("  - | Tier | Label | Outcome | Steps | Time | Primary | Причина |\n  - |---|---|---|---:|---|---|---|");
    toArray(between?.rows).forEach((branch) => {
      lines.push(`  - | ${mdCell(branch?.tier)} | ${mdCell(branch?.label)} | ${mdCell(branch?.outcome)} | ${Number(branch?.stepsCount || 0)} | ${mdCell(branch?.time || "—")} | ${branch?.primary ? "yes" : "no"} | ${mdCell(branch?.primary ? branch?.primaryReasonLabel : branch?.nonPrimaryReasonLabel)} |`);
    });
  }
  lines.push("");
}

export function renderDodSnapshotMarkdown(snapshotRaw, { includeTechnical = false } = {}) {
  const snapshot = asObject(snapshotRaw);
  const meta = asObject(snapshot?.meta);
  const counts = asObject(snapshot?.counts);
  const bpmn = asObject(counts?.bpmn);
  const interview = asObject(counts?.interview);
  const tiers = asObject(counts?.tiers);
  const time = asObject(snapshot?.time);
  const quality = asObject(snapshot?.quality);

  const lines = [];
  const processTitle = toText(meta?.processTitle || meta?.sessionTitle) || "Без названия";

  lines.push(`# Документ процесса: ${processTitle}`);
  lines.push("");

  lines.push("## 1. Титул");
  lines.push(`- Название процесса: ${processTitle}`);
  lines.push(`- Дата/время генерации: ${toText(meta?.generatedAtIso) || "—"}`);
  lines.push(`- Версия/режим: ${toText(meta?.version) || "DoDSnapshot.v1"}${toText(meta?.mode) ? ` · ${toText(meta?.mode)}` : ""}`);
  lines.push("");

  lines.push("## 2. Сводка (Summary)");
  lines.push(`- BPMN-узлов: ${Number(bpmn?.nodesTotal || 0)}`);
  lines.push(`- Переходов BPMN: ${Number(bpmn?.flowsTotal || 0)}`);
  lines.push(`- Аннотаций BPMN: ${Number(bpmn?.annotationsTotal || 0)}`);
  lines.push(`- Акторов (pool/lane): ${Math.max(Number(bpmn?.lanesTotal || 0), toArray(snapshot?.lanes).length)}`);
  lines.push(`- Шагов Interview: ${Number(interview?.stepsTotal || 0)}`);
  lines.push(`- Подпроцессов: ${Number(interview?.subprocessGroupsTotal || 0)}`);
  lines.push(`- Разделов с заметками: ${Number(interview?.notesSectionsTotal || 0)}`);
  lines.push(`- Суммарное время процесса: ${secToLabel(time?.processTotalSec)}`);
  lines.push(`- Суммарное время mainline: ${secToLabel(time?.mainlineTotalSec)}`);
  lines.push(`- Tiers (flows): P0=${Number(tiers?.P0 || 0)} · P1=${Number(tiers?.P1 || 0)} · P2=${Number(tiers?.P2 || 0)} · None=${Number(tiers?.None || 0)}`);
  lines.push("");

  if (toArray(time?.byLaneSec).length) {
    lines.push("### 2.1 Суммарное время по ролям/лайнам");
    lines.push("| # | Лайн | Время (сумма) |");
    lines.push("|---:|---|---|");
    toArray(time?.byLaneSec).forEach((row, idx) => {
      lines.push(`| ${idx + 1} | ${mdCell(row?.laneName)} | ${mdCell(secToLabel(row?.totalSec))} |`);
    });
    lines.push("");
  }

  lines.push("## 3. Акторы (пулы/лайны)");
  if (!toArray(snapshot?.lanes).length) {
    lines.push("- Нет данных по лайнам.");
  } else {
    lines.push("| № | Pool/Lane | Роль/описание | Кол-во шагов | Время (сумма) |");
    lines.push("|---:|---|---|---:|---|");
    toArray(snapshot?.lanes).forEach((lane, idx) => {
      lines.push(`| ${idx + 1} | ${mdCell(lane?.laneName)} | ${mdCell(lane?.laneName)} | ${Number(lane?.stepsCount || 0)} | ${mdCell(secToLabel(lane?.timeTotalSec))} |`);
    });
  }
  lines.push("");

  lines.push("## 4. BPMN схема: узлы и связи");
  lines.push("### 4.1 Узлы (список)");
  const graphNodes = toArray(asObject(snapshot?.graph).nodes);
  if (!graphNodes.length) {
    lines.push("- Узлы BPMN не найдены.");
  } else {
    lines.push("| # | graph_path | BPMN ID | Type | Name | Lane | Incoming | Outgoing | Класс | Notes | AI |");
    lines.push("|---:|---|---|---|---|---|---:|---:|---|---:|---:|");
    graphNodes.forEach((node, idx) => {
      lines.push(`| ${idx + 1} | ${mdCell(node?.graphPath || "—")} | ${mdCell(node?.nodeId)} | ${mdCell(node?.nodeType)} | ${mdCell(node?.nodeName)} | ${mdCell(node?.laneName || "—")} | ${Number(node?.incoming || 0)} | ${Number(node?.outgoing || 0)} | ${mdCell(node?.class)} | ${Number(node?.notesCount || 0)} | ${Number(node?.aiCount || 0)} |`);
    });
  }
  lines.push("");

  lines.push("### 4.2 Переходы (sequence flows)");
  const graphFlows = toArray(asObject(snapshot?.graph).flows);
  if (!graphFlows.length) {
    lines.push("- Переходы BPMN не найдены.");
  } else {
    lines.push("| # | Flow ID | From | To | Label/Condition | Tier | Класс |");
    lines.push("|---:|---|---|---|---|---|---|");
    graphFlows.forEach((flow, idx) => {
      const from = `${toText(flow?.sourcePath) || "—"} · ${toText(flow?.sourceId)} · ${toText(flow?.sourceName)}`;
      const to = `${toText(flow?.targetPath) || "—"} · ${toText(flow?.targetId)} · ${toText(flow?.targetName)}`;
      lines.push(`| ${idx + 1} | ${mdCell(flow?.flowId)} | ${mdCell(from)} | ${mdCell(to)} | ${mdCell(flow?.label || "—")} | ${mdCell(flow?.tier || "None")} | ${mdCell(flow?.class)} |`);
    });
  }
  lines.push("");

  const rVariants = toArray(snapshot?.r_variants);
  const rtiers = asObject(snapshot?.r_tiers);
  lines.push("## 5. Варианты прохождения");
  if (toText(rtiers?.warning)) {
    lines.push(`> ⚠ ${toText(rtiers?.warning)}`);
  }
  if (!rVariants.length) {
    lines.push("- Варианты R0/R1/R2 не рассчитаны.");
  } else {
    lines.push("| Вариант | Steps | Time | DoD | stopReason |");
    lines.push("|---|---:|---|---|---|");
    rVariants.forEach((variant) => {
      const summary = asObject(variant?.summary);
      lines.push(`| ${mdCell(variant?.key)} | ${Number(summary?.stepsCount || toArray(variant?.steps).length || 0)} | ${mdCell(secToLabel(summary?.totalTimeSec))} | ${mdCell(`${Number(summary?.dodPct || 0)}%`)} | ${mdCell(variant?.stopReason || "—")} |`);
    });
    lines.push("");
    rVariants.forEach((variant) => {
      const key = normalizeRtier(variant?.key) || toText(variant?.key);
      lines.push(`### ${key}`);
      const steps = toArray(variant?.steps);
      const edges = toArray(variant?.edges);
      if (!steps.length) {
        lines.push("- Пустая трасса.");
        lines.push("");
        return;
      }
      lines.push("| # | Откуда (node) | Flow (in) | Условие | Шаг (node) | Flow (out) | Куда (node) | R-tier |");
      lines.push("|---:|---|---|---|---|---|---|---|");
      steps.forEach((step, idx) => {
        const prevStep = idx > 0 ? steps[idx - 1] : null;
        const nextStep = idx < steps.length - 1 ? steps[idx + 1] : null;
        const inFlow = idx > 0 ? asObject(edges[idx - 1]) : {};
        const outFlow = asObject(edges[idx] || {});
        lines.push(
          `| ${idx + 1} | ${mdCell(prevStep?.nodeId || "—")} | ${mdCell(inFlow?.flowId || "—")} | ${mdCell(outFlow?.label || "—")} | ${mdCell(step?.nodeId || "—")} | ${mdCell(outFlow?.flowId || "—")} | ${mdCell(nextStep?.nodeId || "—")} | ${mdCell(outFlow?.rtier || key || "—")} |`,
        );
      });
      lines.push("");
    });
  }
  lines.push("");

  lines.push("## 6. Таймлайн/шаги интервью (главное)");
  lines.push("### 6.1 Таблица шагов (Откуда -> Шаг -> Куда)");
  const steps = toArray(snapshot?.steps);
  if (!steps.length) {
    lines.push("- Шаги интервью не найдены.");
  } else {
    lines.push("| # | Lane | Откуда (prev) | Шаг | Куда (next) | Время шага | Время накопит. | Условие перехода | Артефакты/входы | Выходы | Риски | DoD (x/y) |");
    lines.push("|---:|---|---|---|---|---|---|---|---|---|---|---|");
    steps.forEach((step, idx) => {
      const prevText = toArray(step?.graph?.prev).map((prev) => stepRefText(prev)).join("; ") || "Старт процесса";
      const nextText = toArray(step?.graph?.next).map((next) => stepRefText(next)).join("; ") || "Финиш процесса";
      const condition = toArray(step?.graph?.next).map((next) => toText(next?.label)).filter(Boolean).join("; ") || "—";
      const title = `Шаг ${toText(step?.graph?.graphNo || step?.index)}. ${toText(step?.title)}`;
      lines.push(`| ${idx + 1} | ${mdCell(step?.laneName || "—")} | ${mdCell(prevText)} | ${mdCell(title)} | ${mdCell(nextText)} | ${mdCell(secToLabel(step?.durationSec))} | ${mdCell(secToLabel(step?.cumulativeSec))} | ${mdCell(condition)} | — | — | — | ${mdCell(`${Number(step?.dod?.done || 0)}/${Number(step?.dod?.total || 0)}`)} |`);
    });
  }
  lines.push("");

  lines.push("### 6.2 Детали шагов");
  if (!steps.length) {
    lines.push("- Детали шагов недоступны.");
    lines.push("");
  } else {
    steps.forEach((step) => buildStepDetails(lines, step));
  }

  lines.push("## 7. Проверки качества (Quality)");
  if (!toArray(quality?.items).length) {
    lines.push("- Ошибки/предупреждения не обнаружены.");
  } else {
    lines.push("| # | Уровень | Ошибка/предупреждение | Как исправить |");
    lines.push("|---:|---|---|---|");
    toArray(quality?.items).forEach((item, idx) => {
      lines.push(`| ${idx + 1} | ${mdCell(item?.level)} | ${mdCell(item?.message)} | ${mdCell(item?.fix || "—")} |`);
    });
  }
  lines.push("");

  if (includeTechnical) {
    lines.push("## 8. Тех. сведения");
    lines.push("<details>");
    lines.push("<summary>Показать внутренние идентификаторы и raw данные</summary>");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify({
      session_id: toText(meta?.sessionId),
      generated_at: toText(meta?.generatedAtIso),
      raw_counts: {
        bpmn: bpmn,
        interview: interview,
        tiers,
      },
      internal_node_ids: graphNodes.map((node) => toText(node?.nodeId)).filter(Boolean),
      internal_flow_ids: graphFlows.map((flow) => toText(flow?.flowId)).filter(Boolean),
      detached_node_ids: toArray(asObject(snapshot?.technical).detachedNodeIds),
    }, null, 2));
    lines.push("```");
    lines.push("</details>");
    lines.push("");
  }

  return lines.join("\n").trim();
}
