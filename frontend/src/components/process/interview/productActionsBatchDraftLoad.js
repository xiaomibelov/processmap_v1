import { apiLoadBatchDraft } from "../../../lib/api.js";

/**
 * Starts loading the persisted product-actions batch draft for a session.
 *
 * Returns a handle with `cancel()` and `done`. If `cancel()` runs before the
 * request resolves (component unmounted or the session switched), the stale
 * draft is discarded and `apply` is never called. Load errors are silently
 * ignored, matching the previous fire-and-forget behaviour. Mirrors the
 * `cancelled`-flag guard used in useNotesPanelController.js.
 */
export function startProductActionsBatchDraftLoad(sessionId, { load = apiLoadBatchDraft, apply } = {}) {
  let cancelled = false;
  const done = (async () => {
    try {
      const result = await load(sessionId);
      if (cancelled) return;
      if (result?.ok && result?.draft && typeof result.draft === "object") {
        apply?.(result.draft);
      }
    } catch {
      // Ignore load errors
    }
  })();
  return {
    done,
    cancel() {
      cancelled = true;
    },
  };
}
