import { useEffect, useMemo, useState } from "react";
import BranchesToolbar from "./BranchesToolbar";
import AddBranchModal from "./AddBranchModal";
import BranchesFilters from "./BranchesFilters";
import BranchesTable from "./BranchesTable";

function toText(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return toText(value).toLowerCase();
}

function buildStepOptions(timelineView = []) {
  return (Array.isArray(timelineView) ? timelineView : [])
    .map((step, idx) => {
      const stepId = toText(step?.id);
      if (!stepId) return null;
      const nodeId = toText(step?.node_bind_id || step?.node_id || step?.nodeId);
      const action = toText(step?.action) || toText(step?.node_bind_title) || nodeId || `Узел ${idx + 1}`;
      const lane = toText(step?.lane_name || step?.role || step?.area);
      const seq = toText(step?.seq_label || step?.seq || idx + 1);
      return {
        stepId,
        nodeId,
        action,
        lane,
        label: `${seq}. ${action}${lane ? ` · ${lane}` : ""}${nodeId ? ` · ${nodeId}` : " · без node_id"}`,
      };
    })
    .filter(Boolean);
}

export default function BpmnBranchesPanel({
  collapsed,
  toggleBlock,
  transitionView,
  patchTransitionWhen,
  timelineView,
  addTransition,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [fromStepId, setFromStepId] = useState("");
  const [toStepId, setToStepId] = useState("");
  const [whenDraft, setWhenDraft] = useState("");
  const [notice, setNotice] = useState(null);
  const [editingKey, setEditingKey] = useState("");
  const [insertTargetKey, setInsertTargetKey] = useState("");
  const [insertStepTitle, setInsertStepTitle] = useState("");
  const [insertLaneDraft, setInsertLaneDraft] = useState("");

  const [search, setSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("all");
  const [filterTo, setFilterTo] = useState("all");
  const [conditionMode, setConditionMode] = useState("all");
  const [problematicOnly, setProblematicOnly] = useState(false);
  const [groupByFrom, setGroupByFrom] = useState(false);

  const stepOptions = useMemo(() => buildStepOptions(timelineView), [timelineView]);
  const laneOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    (Array.isArray(timelineView) ? timelineView : []).forEach((step) => {
      const lane = toText(step?.lane_name || step?.role || step?.area);
      const key = normalize(lane);
      if (!lane || seen.has(key)) return;
      seen.add(key);
      out.push(lane);
    });
    return out;
  }, [timelineView]);

  useEffect(() => {
    if (!stepOptions.length) return;
    if (!stepOptions.some((item) => item.stepId === fromStepId)) setFromStepId(stepOptions[0].stepId);
    if (!stepOptions.some((item) => item.stepId === toStepId)) {
      setToStepId(stepOptions[Math.min(1, stepOptions.length - 1)]?.stepId || stepOptions[0].stepId);
    }
  }, [stepOptions, fromStepId, toStepId]);

  const transitionStats = useMemo(() => {
    const rows = Array.isArray(transitionView) ? transitionView : [];
    const withCondition = rows.filter((row) => !!toText(row?.when)).length;
    return { total: rows.length, withCondition };
  }, [transitionView]);

  const duplicateKeySet = useMemo(() => {
    const byKey = {};
    (Array.isArray(transitionView) ? transitionView : []).forEach((row) => {
      const key = toText(row?.key || `${row?.from_node_id || ""}__${row?.to_node_id || ""}`);
      if (!key) return;
      byKey[key] = (byKey[key] || 0) + 1;
    });
    const set = new Set();
    Object.keys(byKey).forEach((key) => {
      if (byKey[key] > 1) set.add(key);
    });
    return set;
  }, [transitionView]);

  const fromOptions = useMemo(() => {
    const map = new Map();
    (Array.isArray(transitionView) ? transitionView : []).forEach((row) => {
      const id = toText(row?.from_node_id);
      if (!id || map.has(id)) return;
      map.set(id, `${toText(row?.from_title) || id}${toText(row?.from_lane) ? ` · ${toText(row?.from_lane)}` : ""}`);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [transitionView]);

  const toOptions = useMemo(() => {
    const map = new Map();
    (Array.isArray(transitionView) ? transitionView : []).forEach((row) => {
      const id = toText(row?.to_node_id);
      if (!id || map.has(id)) return;
      map.set(id, `${toText(row?.to_title) || id}${toText(row?.to_lane) ? ` · ${toText(row?.to_lane)}` : ""}`);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [transitionView]);

  const filteredTransitions = useMemo(() => {
    const rows = Array.isArray(transitionView) ? transitionView : [];
    const query = normalize(search);
    return rows.filter((row) => {
      const fromNode = toText(row?.from_node_id);
      const toNode = toText(row?.to_node_id);
      const when = toText(row?.when);
      const key = toText(row?.key || `${fromNode}__${toNode}`);
      const fromTitle = toText(row?.from_title);
      const toTitle = toText(row?.to_title);
      const fromLane = toText(row?.from_lane);
      const toLane = toText(row?.to_lane);
      const hasCondition = !!when;
      const problematic = fromNode === toNode || !fromNode || !toNode || duplicateKeySet.has(key);

      if (filterFrom !== "all" && fromNode !== filterFrom) return false;
      if (filterTo !== "all" && toNode !== filterTo) return false;
      if (conditionMode === "with" && !hasCondition) return false;
      if (conditionMode === "without" && hasCondition) return false;
      if (problematicOnly && !problematic) return false;
      if (!query) return true;

      const hay = [
        fromTitle, toTitle, fromNode, toNode, fromLane, toLane, when,
      ].map(normalize).join(" ");
      return hay.includes(query);
    });
  }, [transitionView, search, filterFrom, filterTo, conditionMode, problematicOnly, duplicateKeySet]);

  function resetFilters() {
    setSearch("");
    setFilterFrom("all");
    setFilterTo("all");
    setConditionMode("all");
    setProblematicOnly(false);
    setGroupByFrom(false);
  }

  function onAddTransition() {
    if (typeof addTransition !== "function") return;
    const result = addTransition(fromStepId, toStepId, whenDraft);
    if (!result?.ok) {
      setNotice({
        type: "err",
        text: toText(result?.error) || "Не удалось добавить переход.",
      });
      return;
    }
    setNotice({
      type: result?.warning ? "warn" : "ok",
      text: toText(result?.message) || "Переход добавлен.",
    });
    if (result?.created) setWhenDraft("");
    setAddOpen(false);
  }

  function onStartEdit(row) {
    setEditingKey(toText(row?.key));
    setNotice(null);
  }

  function onCancelEdit() {
    setEditingKey("");
  }

  function onSaveEdit(row, nextWhen) {
    patchTransitionWhen?.(row?.from_node_id, row?.to_node_id, nextWhen);
    setEditingKey("");
    setNotice({
      type: "ok",
      text: "Условие сохранено.",
    });
  }

  function onOpenInsertBetween(row) {
    const key = toText(row?.key || `${row?.from_node_id || ""}__${row?.to_node_id || ""}`);
    if (!key) return;
    setInsertTargetKey(key);
    setInsertStepTitle("");
    setInsertLaneDraft(toText(row?.to_lane || row?.from_lane || ""));
    setNotice(null);
  }

  function onCancelInsertBetween() {
    setInsertTargetKey("");
    setInsertStepTitle("");
    setInsertLaneDraft("");
  }

  function onConfirmInsertBetween(row) {
    const result = addTransition?.("", "", "", {
      mode: "insert_between",
      fromNodeId: toText(row?.from_node_id),
      toNodeId: toText(row?.to_node_id),
      stepTitle: insertStepTitle,
      lane: insertLaneDraft,
      when: row?.when || "",
      whenPolicy: "to_first",
    });
    if (!result?.ok) {
      setNotice({
        type: "err",
        text: toText(result?.error) || "Не удалось вставить шаг между переходами.",
      });
      return;
    }
    setNotice({
      type: "ok",
      text: toText(result?.message) || "Шаг вставлен между переходами.",
    });
    onCancelInsertBetween();
  }

  return (
    <div className="interviewBlock interviewBranchesPanel">
      <BranchesToolbar
        collapsed={collapsed}
        transitionCount={transitionStats.total}
        conditionalCount={transitionStats.withCondition}
        onOpenAdd={() => setAddOpen(true)}
        onToggleCollapsed={() => toggleBlock?.("transitions")}
      />

      <AddBranchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        stepOptions={stepOptions}
        fromStepId={fromStepId}
        toStepId={toStepId}
        whenDraft={whenDraft}
        onFromStepIdChange={setFromStepId}
        onToStepIdChange={setToStepId}
        onWhenDraftChange={setWhenDraft}
        onConfirm={onAddTransition}
      />

      {!collapsed ? (
        <>
          <div className="interviewTransitionSourceHint">
            Связи построены по BPMN sequenceFlow (from → to).
          </div>
          <BranchesFilters
            search={search}
            filterFrom={filterFrom}
            filterTo={filterTo}
            conditionMode={conditionMode}
            problematicOnly={problematicOnly}
            groupByFrom={groupByFrom}
            fromOptions={fromOptions}
            toOptions={toOptions}
            onSearchChange={setSearch}
            onFilterFromChange={setFilterFrom}
            onFilterToChange={setFilterTo}
            onConditionModeChange={setConditionMode}
            onProblematicOnlyChange={setProblematicOnly}
            onGroupByFromChange={setGroupByFrom}
            onReset={resetFilters}
            totalFilteredCount={filteredTransitions.length}
          />

          {notice ? (
            <div className={`interviewAnnotationNotice ${notice.type || "pending"}`}>
              {notice.text}
            </div>
          ) : null}

          <BranchesTable
            transitions={filteredTransitions}
            laneOptions={laneOptions}
            groupByFrom={groupByFrom}
            editingKey={editingKey}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
            insertTargetKey={insertTargetKey}
            insertState={{
              title: insertStepTitle,
              setTitle: setInsertStepTitle,
              lane: insertLaneDraft,
              setLane: setInsertLaneDraft,
            }}
            onOpenInsertBetween={onOpenInsertBetween}
            onCancelInsertBetween={onCancelInsertBetween}
            onConfirmInsertBetween={onConfirmInsertBetween}
          />
        </>
      ) : null}
    </div>
  );
}
