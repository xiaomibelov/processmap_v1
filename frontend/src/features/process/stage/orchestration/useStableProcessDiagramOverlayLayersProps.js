import { useRef } from "react";
import buildProcessDiagramOverlayLayersProps from "./buildProcessDiagramOverlayLayersProps";
import { bumpDrawioPerfCounter } from "../../drawio/runtime/drawioRuntimeProbes.js";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeInputForMemo(rawInput, fnRefs, stableFnByKey) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const normalized = {};
  Object.keys(input).forEach((key) => {
    const value = input[key];
    if (typeof value !== "function") {
      normalized[key] = value;
      return;
    }
    fnRefs[key] = value;
    if (typeof stableFnByKey[key] !== "function") {
      stableFnByKey[key] = (...args) => {
        const next = fnRefs[key];
        if (typeof next === "function") return next(...args);
        return undefined;
      };
    }
    normalized[key] = stableFnByKey[key];
  });
  return normalized;
}

function areInputsShallowEqual(prevRaw, nextRaw) {
  const prev = prevRaw && typeof prevRaw === "object" ? prevRaw : null;
  const next = nextRaw && typeof nextRaw === "object" ? nextRaw : null;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (let idx = 0; idx < prevKeys.length; idx += 1) {
    const key = prevKeys[idx];
    if (!hasOwn(next, key)) return false;
    if (!Object.is(prev[key], next[key])) return false;
  }
  return true;
}

function collectChangedInputKeys(prevRaw, nextRaw) {
  const prev = prevRaw && typeof prevRaw === "object" ? prevRaw : {};
  const next = nextRaw && typeof nextRaw === "object" ? nextRaw : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed = [];
  keys.forEach((key) => {
    if (!Object.is(prev[key], next[key])) changed.push(key);
  });
  return changed;
}

export default function useStableProcessDiagramOverlayLayersProps(inputRaw) {
  const functionRefs = useRef({});
  const stableFunctionByKey = useRef({});
  const cacheRef = useRef({
    input: null,
    output: null,
  });
  const normalizedInput = normalizeInputForMemo(
    inputRaw,
    functionRefs.current,
    stableFunctionByKey.current,
  );
  const cache = cacheRef.current;
  if (cache.output && areInputsShallowEqual(cache.input, normalizedInput)) {
    bumpDrawioPerfCounter("overlay.vm.diagramOverlayProps.cacheHit");
    return cache.output;
  }
  const changedKeys = collectChangedInputKeys(cache.input, normalizedInput);
  bumpDrawioPerfCounter("overlay.vm.diagramOverlayProps.cacheMiss");
  if (changedKeys.length > 0) {
    const sample = changedKeys.slice(0, 12);
    sample.forEach((key) => {
      bumpDrawioPerfCounter(`overlay.vm.input.changed.${String(key)}`);
    });
    if (changedKeys.length > sample.length) {
      bumpDrawioPerfCounter("overlay.vm.input.changed.__other");
    }
  }
  const output = buildProcessDiagramOverlayLayersProps(normalizedInput);
  cacheRef.current = {
    input: normalizedInput,
    output,
  };
  return output;
}
