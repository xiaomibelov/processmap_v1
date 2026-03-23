export function shouldIssueInterviewPatchAfterSave({
  savePending = false,
  isLocal = false,
  isStale = false,
  patchKeysCount = 0,
} = {}) {
  if (savePending) return false;
  if (isLocal) return false;
  if (isStale) return false;
  return Number(patchKeysCount || 0) > 0;
}
