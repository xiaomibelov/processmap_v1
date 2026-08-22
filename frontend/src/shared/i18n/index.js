import { ru } from "./ru.js";
import { en } from "./en.js";

const DICTS = { ru, en };
const DEFAULT_LOCALE = "ru";

function detectLocale() {
  if (typeof navigator !== "undefined" && navigator.language) {
    const lang = String(navigator.language).toLowerCase();
    if (lang.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

let currentLocale = detectLocale();

export function setLocale(locale) {
  if (DICTS[locale]) currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function getDict() {
  return DICTS[currentLocale] || DICTS[DEFAULT_LOCALE] || {};
}

export function t(key) {
  const dict = getDict();
  const value = key.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), dict);
  if (value !== undefined) return value;
  const fallback = DICTS[DEFAULT_LOCALE] || {};
  return key.split(".").reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), fallback) ?? key;
}

export function tf(key, params) {
  let s = String(t(key) || "");
  Object.entries(params || {}).forEach(([k, v]) => {
    s = s.replaceAll(`{${k}}`, String(v));
  });
  return s;
}
