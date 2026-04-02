import { useCallback, useEffect, useState } from "react";
import {
  getOrgPropertyDictionaryBundle,
  listOrgPropertyDictionaryOperations,
  upsertOrgPropertyDictionaryValue,
} from "./notesApi.js";

function toText(value) {
  return String(value || "").trim();
}

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

  useEffect(() => {
    if (!selectedCamundaPropertiesEditable || !toText(activeOrgId)) {
      setOrgPropertyDictionaryOperations([]);
      setOrgPropertyDictionaryOperationsLoading(false);
      return;
    }
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

  useEffect(() => {
    if (!selectedCamundaPropertiesEditable || !toText(activeOrgId) || !toText(selectedOperationKey)) {
      setOrgPropertyDictionaryBundle(null);
      setOrgPropertyDictionaryLoading(false);
      setOrgPropertyDictionaryErr("");
      setOrgPropertyDictionaryAddBusyKey("");
      return;
    }
    let cancelled = false;
    setOrgPropertyDictionaryLoading(true);
    setOrgPropertyDictionaryErr("");
    void (async () => {
      const result = await getOrgPropertyDictionaryBundle(activeOrgId, selectedOperationKey, { includeInactive: false });
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
