import { useEffect, useMemo, useState } from "react";
import { formatHHMMFromSeconds, toArray, toText } from "../utils";

function resolveBranchKey(branch, idx) {
  return toText(branch?.key) || String.fromCharCode(65 + (idx % 26));
}

export default function CompareBranchesPopover({
  open = false,
  branches = [],
  metricsByBranchKey = {},
  onClose,
}) {
  const rows = useMemo(
    () => toArray(branches).map((branch, idx) => ({
      branch,
      key: resolveBranchKey(branch, idx),
      label: toText(branch?.label) || `Ветка ${idx + 1}`,
    })),
    [branches],
  );
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");

  useEffect(() => {
    if (!rows.length) {
      setLeftKey("");
      setRightKey("");
      return;
    }
    setLeftKey((prev) => (prev && rows.some((row) => row.key === prev) ? prev : rows[0].key));
    setRightKey((prev) => {
      if (prev && rows.some((row) => row.key === prev) && prev !== (leftKey || rows[0].key)) return prev;
      return rows[Math.min(1, rows.length - 1)]?.key || rows[0].key;
    });
  }, [rows, leftKey]);

  if (!open) return null;

  const left = rows.find((row) => row.key === leftKey) || rows[0] || null;
  const right = rows.find((row) => row.key === rightKey) || rows[1] || rows[0] || null;
  if (!left || !right) return null;
  const leftMetrics = metricsByBranchKey[left.key] || {};
  const rightMetrics = metricsByBranchKey[right.key] || {};

  const deltaSteps = Number(rightMetrics?.stepsCount || 0) - Number(leftMetrics?.stepsCount || 0);
  const deltaWait = Number(rightMetrics?.waitSec || 0) - Number(leftMetrics?.waitSec || 0);
  const deltaTotal = Number(rightMetrics?.totalSec || 0) - Number(leftMetrics?.totalSec || 0);
  const formatDeltaTime = (deltaSecRaw) => {
    const deltaSec = Number(deltaSecRaw || 0);
    const abs = Math.abs(deltaSec);
    const sign = deltaSec > 0 ? "+" : deltaSec < 0 ? "−" : "";
    return `${sign}${formatHHMMFromSeconds(abs)}`;
  };

  const leftTitles = new Set(toArray(leftMetrics?.stepTitles).map((title) => toText(title)).filter(Boolean));
  const rightTitles = new Set(toArray(rightMetrics?.stepTitles).map((title) => toText(title)).filter(Boolean));
  const onlyInLeft = [...leftTitles].filter((title) => !rightTitles.has(title));
  const onlyInRight = [...rightTitles].filter((title) => !leftTitles.has(title));

  return (
    <div className="interviewGatewayComparePopover" role="dialog" aria-label="Сравнить ветки">
      <div className="interviewGatewayCompareHead">
        <strong>Сравнить ветки</strong>
        <button type="button" className="secondaryBtn tinyBtn" onClick={() => onClose?.()}>
          Закрыть
        </button>
      </div>

      <div className="interviewGatewayCompareSelectors">
        <select className="select" value={left.key} onChange={(e) => setLeftKey(e.target.value)}>
          {rows.map((row) => (
            <option key={`left_${row.key}`} value={row.key}>{row.label}</option>
          ))}
        </select>
        <span className="muted small">vs</span>
        <select className="select" value={right.key} onChange={(e) => setRightKey(e.target.value)}>
          {rows.map((row) => (
            <option key={`right_${row.key}`} value={row.key}>{row.label}</option>
          ))}
        </select>
      </div>

      <div className="interviewGatewayCompareStats">
        <div>Δsteps: {deltaSteps > 0 ? `+${deltaSteps}` : deltaSteps}</div>
        <div>Δwait: {formatDeltaTime(deltaWait)}</div>
        <div>Δtotal: {formatDeltaTime(deltaTotal)}</div>
      </div>

      <div className="interviewGatewayCompareList">
        <div className="interviewGatewayCompareCol">
          <div className="muted small">Есть в {left.label}, нет в {right.label}</div>
          {onlyInLeft.length ? (
            <ul>
              {onlyInLeft.slice(0, 8).map((title, idx) => <li key={`left_only_${idx + 1}`}>{title}</li>)}
            </ul>
          ) : <div className="muted small">—</div>}
        </div>
        <div className="interviewGatewayCompareCol">
          <div className="muted small">Есть в {right.label}, нет в {left.label}</div>
          {onlyInRight.length ? (
            <ul>
              {onlyInRight.slice(0, 8).map((title, idx) => <li key={`right_only_${idx + 1}`}>{title}</li>)}
            </ul>
          ) : <div className="muted small">—</div>}
        </div>
      </div>
    </div>
  );
}
