import { useMemo } from "react";
import { ru } from "../../../shared/i18n/ru.js";
import { en } from "../../../shared/i18n/en.js";

function getByPath(obj, path) {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

export function createT(locale = "ru") {
  const dict = locale === "en" ? en : ru;
  return function t(key) {
    const value = getByPath(dict, key);
    return typeof value === "string" ? value : key;
  };
}

export function useProcessAnalysisI18n(locale = "ru") {
  return useMemo(() => createT(locale), [locale]);
}
