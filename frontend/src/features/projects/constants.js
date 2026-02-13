export const SITE_TYPES = [
  { value: "dark_kitchen", label: "Dark kitchen" },
  { value: "workshop", label: "Цех" },
  { value: "factory", label: "Фабрика" },
];

export const LANGS = [
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

export const UNITS_MASS = [
  { value: "g", label: "г" },
  { value: "kg", label: "кг" },
];

export const UNITS_TEMP = [
  { value: "C", label: "°C" },
  { value: "F", label: "°F" },
];

export const UNITS_TIME = [
  { value: "min", label: "мин" },
  { value: "sec", label: "сек" },
];

export const MODES = [
  { value: "quick_skeleton", label: "Быстрый скелет (15–25 минут)" },
  { value: "deep_audit", label: "Глубокий аудит (1–3 часа)" },
];

export function str(v) {
  return String(v || "").trim();
}
