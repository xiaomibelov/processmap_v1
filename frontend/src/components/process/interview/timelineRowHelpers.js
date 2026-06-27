import { normalizeLoose, toArray, toText } from "./utils";

export function normalizeStepTimeUnit(raw) {
  return String(raw || "").trim().toLowerCase() === "sec" ? "sec" : "min";
}

export function readStepDurationSeconds(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const candidates = [
    step.work_duration_sec,
    step.workDurationSec,
    step.duration_sec,
    step.durationSec,
    step.step_time_sec,
    step.stepTimeSec,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const minCandidates = [
    step.duration_min,
    step.durationMin,
    step.step_time_min,
    step.stepTimeMin,
    step.duration,
  ];
  for (let i = 0; i < minCandidates.length; i += 1) {
    const raw = minCandidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num * 60);
  }
  return 0;
}

export function readStepDurationMinutes(stepRaw) {
  const sec = readStepDurationSeconds(stepRaw);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec / 60);
}

export function readStepWaitSeconds(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const secCandidates = [
    step.wait_duration_sec,
    step.waitDurationSec,
    step.wait_sec,
    step.waitSec,
  ];
  for (let i = 0; i < secCandidates.length; i += 1) {
    const raw = secCandidates[i];
    if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) continue;
    return Math.round(num);
  }
  const mins = Number(step.wait_min ?? step.waitMin);
  if (Number.isFinite(mins) && mins >= 0) return Math.round(mins * 60);
  return 0;
}

export function readStepWaitMinutes(stepRaw) {
  const sec = readStepWaitSeconds(stepRaw);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec / 60);
}

export function formatMinutesInputFromSeconds(secondsRaw) {
  const sec = Number(secondsRaw || 0);
  if (!Number.isFinite(sec) || sec <= 0) return "";
  if (sec % 60 === 0) return String(Math.round(sec / 60));
  return String(Math.round((sec / 60) * 10) / 10);
}

export function formatTimelineDuration(secondsRaw) {
  const sec = Math.max(0, Math.round(Number(secondsRaw || 0)));
  if (!sec) return "0м";
  if (sec < 60) return `${sec}с`;
  if (sec % 60 === 0) return `${Math.round(sec / 60)}м`;
  return `${Math.round((sec / 60) * 10) / 10}м`;
}

export function mergeLaneLinks(primary, secondary) {
  const byKey = {};
  [...toArray(primary), ...toArray(secondary)].forEach((laneInfo) => {
    const key = toText(laneInfo?.laneKey);
    if (!key) return;
    byKey[key] = laneInfo;
  });
  return Object.values(byKey).sort((a, b) => {
    const ai = Number(a?.laneIdx);
    const bi = Number(b?.laneIdx);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return String(a?.laneName || "").localeCompare(String(b?.laneName || ""), "ru");
  });
}


export function normalizeTier(value) {
  const tier = String(value || "").trim().toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

export function resolveBranchKey(branch, branchIdx) {
  return toText(branch?.key) || String.fromCharCode(65 + (branchIdx % 26));
}

export function splitAnnotationText(textRaw, titleRaw, index = 1) {
  const text = String(textRaw || "");
  const textTrimmed = toText(text);
  const title = toText(titleRaw) || `Аннотация #${Math.max(1, Number(index) || 1)}`;
  if (!textTrimmed) {
    return {
      title,
      body: "—",
      long: false,
    };
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstMeaningfulIndex = lines.findIndex((line) => toText(line));
  const meaningfulLines = firstMeaningfulIndex >= 0 ? lines.slice(firstMeaningfulIndex) : lines;
  const firstLine = toText(meaningfulLines[0]);
  const sameAsTitle = !!firstLine && normalizeLoose(firstLine) === normalizeLoose(title);
  const bodyLines = sameAsTitle ? meaningfulLines.slice(1) : meaningfulLines;
  const body = toText(bodyLines.join("\n")) || textTrimmed;
  const long = body.length > 180 || body.split("\n").length > 3;
  const showTitle = !!title && normalizeLoose(body) !== normalizeLoose(title);

  return {
    title: showTitle ? title : "",
    body,
    long,
  };
}
