export function createDebouncedDiff(compute, { delayMs = 300 } = {}) {
  let timer = null;
  let pending = null;

  function schedule(pair, cb) {
    pending = { pair, cb };
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const job = pending;
      pending = null;
      if (!job) return;
      try {
        job.cb(null, compute(job.pair));
      } catch (err) {
        job.cb(err);
      }
    }, delayMs);
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pending = null;
  }

  return { schedule, cancel };
}

export function planMarkerChunks(ids, { chunkSize = 50, threshold = 100 } = {}) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length <= threshold) {
    return list.length ? [list.slice()] : [];
  }
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

const defaultScheduleFrame =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (cb) => setTimeout(cb, 0);

export function applyChunks(chunks, apply, scheduleFrame = defaultScheduleFrame) {
  const list = Array.isArray(chunks) ? chunks : [];
  let index = 0;
  let cancelled = false;

  function step() {
    if (cancelled || index >= list.length) return;
    apply(list[index], index);
    index += 1;
    if (index < list.length) scheduleFrame(step);
  }

  if (list.length) scheduleFrame(step);

  return function cancel() {
    cancelled = true;
  };
}
