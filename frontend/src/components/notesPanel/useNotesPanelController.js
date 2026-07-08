import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOrgPropertyDictionaryBundle,
  listOrgPropertyDictionaryOperations,
  upsertOrgPropertyDictionaryValue,
} from "./notesApi.js";

function toText(value) {
  return String(value || "").trim();
}

const BUNDLE_CLEAR_GRACE_MS = 500;

export default function useNotesPanelController({
  activeOrgId = "",
  selectedCamundaPropertiesEditable = false,
  selectedOperationKey = "",
  orgPropertyDictionaryRevision = 0,
  onOrgPropertyDictionaryChanged,
}) {
  const [orgPropertyDictionaryOperations, setOrgPropertyDictionaryOperations] = useState([]);
  const [orgPropertyDictionaryOperationsLoading, setOrgPropertyDictionaryOperationsLoading] = useState(false);
  const [orgPropertyDictionaryBundle, setOrgPropertyDictionaryBundle] = useState(null);
  const [orgPropertyDictionaryLoading, setOrgPropertyDictionaryLoading] = useState(false);
  const [orgPropertyDictionaryErr, setOrgPropertyDictionaryErr] = useState("");
  const [orgPropertyDictionaryAddBusyKey, setOrgPropertyDictionaryAddBusyKey] = useState("");
  const lastOperationsKeyRef = useRef("");

  useEffect(() => {
    if (!selectedCamundaPropertiesEditable || !toText(activeOrgId)) {
      setOrgPropertyDictionaryOperations([]);
      setOrgPropertyDictionaryOperationsLoading(false);
      return () => {};
    }
    const key = `${toText(activeOrgId)}:${selectedCamundaPropertiesEditable ? 1 : 0}:${orgPropertyDictionaryRevision}`;
    if (key === lastOperationsKeyRef.current) {
      return () => {};
    }
    lastOperationsKeyRef.current = key;
    let cancelled = false;
    setOrgPropertyDictionaryOperationsLoading(true);
    void (async () => {
      const result = await listOrgPropertyDictionaryOperations(activeOrgId, { includeInactive: false });
      if (cancelled) return;
      if (!result.ok) {
        setOrgPropertyDictionaryOperations([]);
        setOrgPropertyDictionaryOperationsLoading(false);
        return;
      }
      setOrgPropertyDictionaryOperations(Array.isArray(result.items) ? result.items : []);
      setOrgPropertyDictionaryOperationsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, selectedCamundaPropertiesEditable, orgPropertyDictionaryRevision]);

  const lastBundleKeyRef = useRef("");
  const previousOperationKeyRef = useRef("");
  const bundleClearTimeoutRef = useRef(null);

  useEffect(() => {
    if (bundleClearTimeoutRef.current) {
      clearTimeout(bundleClearTimeoutRef.current);
      bundleClearTimeoutRef.current = null;
    }

    if (!selectedCamundaPropertiesEditable || !toText(activeOrgId)) {
      setOrgPropertyDictionaryBundle(null);
      setOrgPropertyDictionaryLoading(false);
      setOrgPropertyDictionaryErr("");
      setOrgPropertyDictionaryAddBusyKey("");
      lastBundleKeyRef.current = "";
      previousOperationKeyRef.current = "";
      return () => {};
    }

    const opKey = toText(selectedOperationKey);

    if (!opKey) {
      // Keep the previous bundle for a short grace period so that transient
      // operation-key resets (e.g. while Robot Meta is being saved/synced) do
      // not immediately drop the schema and cause properties to be saved as
      // custom rows.
      if (previousOperationKeyRef.current) {
        setOrgPropertyDictionaryLoading(false);
        setOrgPropertyDictionaryErr("");
        bundleClearTimeoutRef.current = setTimeout(() => {
          setOrgPropertyDictionaryBundle(null);
          lastBundleKeyRef.current = "";
          previousOperationKeyRef.current = "";
          bundleClearTimeoutRef.current = null;
        }, BUNDLE_CLEAR_GRACE_MS);
        return () => {
          if (bundleClearTimeoutRef.current) {
            clearTimeout(bundleClearTimeoutRef.current);
            bundleClearTimeoutRef.current = null;
          }
        };
      }
      setOrgPropertyDictionaryBundle(null);
      setOrgPropertyDictionaryLoading(false);
      setOrgPropertyDictionaryErr("");
      setOrgPropertyDictionaryAddBusyKey("");
      lastBundleKeyRef.current = "";
      previousOperationKeyRef.current = "";
      return () => {};
    }

    const key = `${toText(activeOrgId)}:${selectedCamundaPropertiesEditable ? 1 : 0}:${opKey}:${orgPropertyDictionaryRevision}`;
    if (key === lastBundleKeyRef.current) {
      // Same operation as before; if we were in the grace period the bundle is
      // still valid, so just make sure loading is off.
      previousOperationKeyRef.current = opKey;
      setOrgPropertyDictionaryLoading(false);
      return () => {};
    }

    lastBundleKeyRef.current = key;
    previousOperationKeyRef.current = opKey;
    setOrgPropertyDictionaryBundle(null);
    setOrgPropertyDictionaryLoading(true);
    setOrgPropertyDictionaryErr("");
    let cancelled = false;
    void (async () => {
      const result = await getOrgPropertyDictionaryBundle(activeOrgId, opKey, { includeInactive: false });
      if (cancelled) return;
      if (!result.ok) {
        setOrgPropertyDictionaryBundle(null);
        setOrgPropertyDictionaryErr(toText(result.error || "Не удалось загрузить словарь свойств."));
        setOrgPropertyDictionaryLoading(false);
        return;
      }
      setOrgPropertyDictionaryBundle(result.bundle || null);
      setOrgPropertyDictionaryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, selectedCamundaPropertiesEditable, selectedOperationKey, orgPropertyDictionaryRevision]);

  const addDictionaryValueForSelectedElement = useCallback(async (propertyKey, optionValue) => {
    const oid = toText(activeOrgId);
    const operationKey = toText(selectedOperationKey);
    const normalizedPropertyKey = toText(propertyKey);
    const normalizedValue = toText(optionValue);
    if (!oid || !operationKey || !normalizedPropertyKey || !normalizedValue) {
      return { ok: false, error: "missing_dictionary_context" };
    }
    setOrgPropertyDictionaryAddBusyKey(normalizedPropertyKey);
    try {
      const result = await upsertOrgPropertyDictionaryValue(oid, operationKey, normalizedPropertyKey, {
        option_value: normalizedValue,
      });
      if (!result.ok) {
        const errorText = toText(result.error || "Не удалось добавить значение в словарь организации.");
        return { ok: false, error: errorText };
      }
      const bundleResult = await getOrgPropertyDictionaryBundle(oid, operationKey, { includeInactive: false });
      if (bundleResult.ok) {
        setOrgPropertyDictionaryBundle(bundleResult.bundle || null);
      }
      onOrgPropertyDictionaryChanged?.();
      return { ok: true, value: normalizedValue };
    } catch (error) {
      const errorText = toText(error?.message || error || "Не удалось добавить значение в словарь организации.");
      return { ok: false, error: errorText };
    } finally {
      setOrgPropertyDictionaryAddBusyKey("");
    }
  }, [activeOrgId, selectedOperationKey, onOrgPropertyDictionaryChanged]);

  return {
    orgPropertyDictionaryOperations,
    orgPropertyDictionaryOperationsLoading,
    orgPropertyDictionaryBundle,
    orgPropertyDictionaryLoading,
    orgPropertyDictionaryErr,
    orgPropertyDictionaryAddBusyKey,
    addDictionaryValueForSelectedElement,
  };
}
