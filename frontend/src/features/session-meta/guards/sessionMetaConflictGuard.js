function toSeq(valueRaw) {
  const value = Number(valueRaw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function createSessionMetaConflictGuard() {
  let latestAppliedWriteSeq = 0;

  function shouldApplyHydration(payloadRaw = {}) {
    const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
    const writeSeq = toSeq(payload._meta_write_seq);
    if (!writeSeq) {
      return {
        apply: true,
        reason: "no_write_seq",
        writeSeq: 0,
        latestAppliedWriteSeq,
      };
    }
    if (writeSeq < latestAppliedWriteSeq) {
      return {
        apply: false,
        reason: "stale_write_seq",
        writeSeq,
        latestAppliedWriteSeq,
      };
    }
    latestAppliedWriteSeq = writeSeq;
    return {
      apply: true,
      reason: "ok",
      writeSeq,
      latestAppliedWriteSeq,
    };
  }

  function markAppliedWriteSeq(valueRaw) {
    const value = toSeq(valueRaw);
    if (!value) return latestAppliedWriteSeq;
    if (value > latestAppliedWriteSeq) {
      latestAppliedWriteSeq = value;
    }
    return latestAppliedWriteSeq;
  }

  function getState() {
    return {
      latestAppliedWriteSeq,
    };
  }

  return {
    shouldApplyHydration,
    markAppliedWriteSeq,
    getState,
  };
}

export default createSessionMetaConflictGuard;
