import { useCallback, useEffect, useRef, useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default function useBpmnQuickEditController({
  quickEdit: quickEditRaw,
  targetId = "",
  dispatchActionRequest,
} = {}) {
  const quickEdit = asObject(quickEditRaw);
  const quickActionId = toText(quickEdit?.actionId);
  const quickLabel = toText(quickEdit?.label);
  const quickPlaceholder = toText(quickEdit?.placeholder);
  const quickValueFromMenu = String(quickEdit?.value ?? "");
  const quickKey = `${toText(targetId)}::${quickActionId}`;
  const hasQuickEdit = !!quickActionId && !!quickLabel;

  const inputRef = useRef(null);
  const skipBlurCommitRef = useRef(false);
  const [quickDraft, setQuickDraft] = useState(quickValueFromMenu);
  const [lastCommittedValue, setLastCommittedValue] = useState(quickValueFromMenu);

  useEffect(() => {
    setQuickDraft(quickValueFromMenu);
    setLastCommittedValue(quickValueFromMenu);
  }, [quickKey, quickValueFromMenu]);

  useEffect(() => {
    if (!hasQuickEdit || !inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [hasQuickEdit, quickKey]);

  const submitQuickEdit = useCallback(async () => {
    if (!hasQuickEdit || typeof dispatchActionRequest !== "function") return;
    if (quickDraft === lastCommittedValue) return;
    const result = await Promise.resolve(
      dispatchActionRequest({
        actionId: quickActionId,
        value: quickDraft,
        closeOnSuccess: false,
      }),
    );
    if (result?.ok === true || result === undefined) {
      setLastCommittedValue(quickDraft);
    }
  }, [dispatchActionRequest, hasQuickEdit, lastCommittedValue, quickActionId, quickDraft]);

  const onInputKeyDown = useCallback((event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      void submitQuickEdit();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuickDraft(lastCommittedValue);
      skipBlurCommitRef.current = true;
      event.currentTarget.blur();
    }
  }, [lastCommittedValue, submitQuickEdit]);

  const onInputBlur = useCallback(() => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    void submitQuickEdit();
  }, [submitQuickEdit]);

  return {
    hasQuickEdit,
    quickActionId,
    quickLabel,
    quickPlaceholder,
    quickDraft,
    setQuickDraft,
    inputRef,
    onInputKeyDown,
    onInputBlur,
  };
}
