export const THEME_STORAGE_KEY = "fpc_theme";

export function resolveInitialTheme(stored) {
  const value = String(stored || "").trim();
  return value === "dark" ? "dark" : "light";
}

export function applyInitialTheme(root, stored) {
  const theme = resolveInitialTheme(stored);
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  return theme;
}
