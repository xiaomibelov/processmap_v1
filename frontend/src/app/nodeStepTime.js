function ensureObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

export function normalizeStepTimeMinutes(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

export function normalizeStepTimeSeconds(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

export function readNodeStepTimeMinutes(nodeRaw) {
  const node = ensureObject(nodeRaw);
  const params = ensureObject(node.parameters);
  const candidates = [
    node.step_time_min,
    node.stepTimeMin,
    node.duration_min,
    node.durationMin,
    params.step_time_min,
    params.stepTimeMin,
    params.duration_min,
    params.durationMin,
    params.duration,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = normalizeStepTimeMinutes(candidates[i]);
    if (parsed !== null) return parsed;
  }
  const secondsCandidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < secondsCandidates.length; i += 1) {
    const sec = normalizeStepTimeSeconds(secondsCandidates[i]);
    if (sec !== null) return Math.round(sec / 60);
  }
  return null;
}

export function readNodeStepTimeSeconds(nodeRaw) {
  const node = ensureObject(nodeRaw);
  const params = ensureObject(node.parameters);
  const secondsCandidates = [
    node.step_time_sec,
    node.stepTimeSec,
    node.duration_sec,
    node.durationSec,
    params.step_time_sec,
    params.stepTimeSec,
    params.duration_sec,
    params.durationSec,
  ];
  for (let i = 0; i < secondsCandidates.length; i += 1) {
    const parsed = normalizeStepTimeSeconds(secondsCandidates[i]);
    if (parsed !== null) return parsed;
  }
  const fallbackMinutes = readNodeStepTimeMinutes(node);
  if (fallbackMinutes === null) return null;
  return Math.round(fallbackMinutes * 60);
}
