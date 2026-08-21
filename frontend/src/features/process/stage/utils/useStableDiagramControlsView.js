import { useRef } from "react";
import { buildDiagramControlsView } from "../orchestration/buildDiagramViewModel";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i];
    if (!hasOwn(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Memoizes buildDiagramControlsView using shallow input comparison.
 * Uses a render-phase ref update (safe for read-only memoization).
 */
export default function useStableDiagramControlsView(inputFactory) {
  const cacheRef = useRef({ input: null, output: null });
  const nextInput = inputFactory();
  if (!cacheRef.current.input || !shallowEqual(cacheRef.current.input, nextInput)) {
    cacheRef.current.input = nextInput;
    cacheRef.current.output = buildDiagramControlsView(nextInput);
  }
  return cacheRef.current.output;
}
