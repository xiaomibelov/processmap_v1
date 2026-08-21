import { useCallback, useEffect, useState } from "react";
import { propertyCrudBoundary } from "./propertyCrudBoundary.js";

/**
 * React hook for the unified property CRUD boundary.
 *
 * Returns the current extension properties for the selected BPMN element and
 * bound setters. The hook re-renders when the boundary notifies about changes
 * (including optimistic local edits and completed saves).
 */
export default function usePropertyCrud(elementId) {
  const [properties, setProperties] = useState(() => (
    elementId ? propertyCrudBoundary.getProperties(elementId) : []
  ));
  const [status, setStatus] = useState(() => propertyCrudBoundary.getStatus());

  useEffect(() => {
    if (!elementId) {
      setProperties([]);
      return () => {};
    }

    setProperties(propertyCrudBoundary.getProperties(elementId));

    const unsubscribe = propertyCrudBoundary.subscribe(elementId, (event) => {
      if (event.type === "properties") {
        setProperties(propertyCrudBoundary.getProperties(elementId));
      }
      setStatus(propertyCrudBoundary.getStatus());
    });

    return unsubscribe;
  }, [elementId]);

  const setProperty = useCallback((propertyKey, value) => {
    if (!elementId) {
      return Promise.resolve({ ok: false, error: "missing element id" });
    }
    return propertyCrudBoundary.setProperty(elementId, propertyKey, value);
  }, [elementId]);

  const deleteProperty = useCallback((propertyKey) => {
    if (!elementId) {
      return Promise.resolve({ ok: false, error: "missing element id" });
    }
    return propertyCrudBoundary.deleteProperty(elementId, propertyKey);
  }, [elementId]);

  const setProperties = useCallback((updates) => {
    if (!elementId) {
      return Promise.resolve({ ok: false, error: "missing element id" });
    }
    return propertyCrudBoundary.setProperties(elementId, updates);
  }, [elementId]);

  return {
    properties,
    setProperty,
    deleteProperty,
    setProperties,
    isSaving: status.state === "saving",
    status,
  };
}
