import { useRef } from "react";
import { createBpmnXmlCache } from "./bpmnXmlCache.js";

/**
 * Hook that returns a stable ref-wrapped BPMN XML cache.
 * Shape: { current: { get, set, has, delete, clear, keys } }
 * Compatible with existing consumers that access bpmnXmlCacheRef.current.get(...).
 */
export default function useBpmnXmlCache() {
  const cacheRef = useRef(null);
  if (!cacheRef.current) {
    cacheRef.current = createBpmnXmlCache();
  }
  return cacheRef;
}
