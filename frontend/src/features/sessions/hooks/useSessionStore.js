import { useCallback, useMemo, useState } from "react";

function toDraft(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useSessionStore(initialDraft, options = {}) {
  const normalize = typeof options?.normalize === "function" ? options.normalize : toDraft;
  const normalizedInitial = normalize(initialDraft);

  const [store, setStore] = useState(() => ({
    draft: normalizedInitial,
    version: 1,
    dirty: false,
    lastSavedAt: 0,
  }));

  const apply = useCallback(
    (nextDraft, meta = {}) => {
      setStore((prev) => {
        const normalized = normalize(nextDraft);
        const persisted = !!meta.persisted;
        const now = Date.now();
        return {
          draft: normalized,
          version: Number(prev.version || 0) + 1,
          dirty: persisted ? false : true,
          lastSavedAt: persisted ? now : prev.lastSavedAt || 0,
        };
      });
    },
    [normalize],
  );

  const setDraft = useCallback(
    (updater, meta = {}) => {
      setStore((prev) => {
        const current = normalize(prev.draft);
        const nextValue = typeof updater === "function" ? updater(current) : updater;
        const normalized = normalize(nextValue);
        const persisted = !!meta.persisted;
        const now = Date.now();
        return {
          draft: normalized,
          version: Number(prev.version || 0) + 1,
          dirty: persisted ? false : true,
          lastSavedAt: persisted ? now : prev.lastSavedAt || 0,
        };
      });
    },
    [normalize],
  );

  const setDraftPersisted = useCallback(
    (updater) => {
      setDraft(updater, { persisted: true });
    },
    [setDraft],
  );

  const mergeDraft = useCallback(
    (patch, meta = {}) => {
      setDraft((prev) => ({ ...toDraft(prev), ...toDraft(patch) }), meta);
    },
    [setDraft],
  );

  const resetDraft = useCallback(
    (nextDraft) => {
      apply(nextDraft, { persisted: true });
    },
    [apply],
  );

  const markSaved = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      dirty: false,
      lastSavedAt: Date.now(),
    }));
  }, []);

  return useMemo(
    () => ({
      draft: store.draft,
      version: store.version,
      dirty: store.dirty,
      lastSavedAt: store.lastSavedAt,
      setDraft,
      setDraftPersisted,
      mergeDraft,
      resetDraft,
      markSaved,
    }),
    [store, setDraft, setDraftPersisted, mergeDraft, resetDraft, markSaved],
  );
}

