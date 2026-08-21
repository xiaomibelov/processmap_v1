// L10N — механизм локализации раздела «LLM» админ-панели.
// Язык по умолчанию — ru; отсутствующие ключи фолбэкаются на ru.
import ru from "./ru.js";
import en from "./en.js";

const DICTS = { ru, en };
const DEFAULT_LOCALE = "ru";
let currentLocale = DEFAULT_LOCALE;

export function setLocale(locale) {
  if (DICTS[locale]) currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function registerLocale(locale, dict) {
  DICTS[locale] = dict;
}

export function t(key) {
  const dict = DICTS[currentLocale] || {};
  const value = dict[key];
  if (value !== undefined) return value;
  const fallback = DICTS[DEFAULT_LOCALE] || {};
  return fallback[key] !== undefined ? fallback[key] : key;
}

// Подстановка {name} в строки словаря: tf("x", {n: 1})
export function tf(key, params) {
  let s = t(key);
  Object.entries(params || {}).forEach(([k, v]) => {
    s = s.replaceAll(`{${k}}`, String(v));
  });
  return s;
}

export default t;
