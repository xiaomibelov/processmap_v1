import { useCallback, useEffect, useState } from "react";
import {
  getOrgPropertyDictionaryBundle,
  listOrgPropertyDictionaryOperations,
  upsertOrgPropertyDictionaryValue,
} from "./notesApi.js";

function toText(value) {
  return String(value || "").trim();
}

const DICTIONARY_CACHE_TTL_MS = 30_000;
const dictionaryCache = new Map();

function dictionaryCacheKey(orgId, type, extra = "") {
  return `${type}|${orgId}|${extra}`;
}

function getCachedDictionary(key) {
  const entry = dictionaryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DICTIONARY_CACHE_TTL_MS) {
    dictionaryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedDictionary(key, value) {
  dictionaryCache.set(key, { ts: Date.now(), value });
}

function invalidateDictionaryCache(orgId) {
  const prefix = `|${orgId}|`;
  for (const key of dictionaryCache.keys()) {
    if (key.includes(prefix)) dictionaryCache.delete(key);
  }
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
    if (!toText(activeOrgId)) {
      setOrgPropertyDictionaryOperations([]);
      setOrgPropertyDictionaryOperationsLoading(false);
      return;
    }
    const cacheKey = dictionaryCacheKey(activeOrgId, "operations", String(orgPropertyDictionaryRevision));
    const cached = getCachedDictionary(cacheKey);
    if (cached) {
      if (selectedCamundaPropertiesEditable) {
        setOrgPropertyDictionaryOperations(cached);
      }
      setOrgPropertyDictionaryOperationsLoading(false);
      return;
    }
    let cancelled = false;
    let timeoutId = setTimeout(() => {
      if (cancelled) return;
      if (selectedCamundaPropertiesEditable) setOrgPropertyDictionaryOperationsLoading(true);
      void (async () => {
        const result = await listOrgPropertyDictionaryOperations(activeOrgId, { includeInactive: false });
        if (cancelled) return;
        const items = Array.isArray(result.items) ? result.items : [];
        setCachedDictionary(cacheKey, items);
        if (!result.ok) {
          if (selectedCamundaPropertiesEditable) setOrgPropertyDictionaryOperations([]);
          if (selectedCamundaPropertiesEditable) setOrgPropertyDictionaryOperationsLoading(false);
          return;
        }
        if (selectedCamundaPropertiesEditable) {
          setOrgPropertyDictionaryOperations(items);
          setOrgPropertyDictionaryOperationsLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
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
    const cacheKey = dictionaryCacheKey(activeOrgId, "bundle", `${selectedOperationKey}:${orgPropertyDictionaryRevision}`);
    const cached = getCachedDictionary(cacheKey);
    if (cached) {
      setOrgPropertyDictionaryBundle(cached);
      setOrgPropertyDictionaryLoading(false);
      return;
    }
    let cancelled = false;
    let timeoutId = setTimeout(() => {
      if (cancelled) return;
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
        const bundle = result.bundle || null;
        setCachedDictionary(cacheKey, bundle);
        setOrgPropertyDictionaryBundle(bundle);
        setOrgPropertyDictionaryLoading(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
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
