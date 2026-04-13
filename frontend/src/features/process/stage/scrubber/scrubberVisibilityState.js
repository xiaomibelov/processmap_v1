function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function resolveScrubberVisibilityState({
  active = true,
  manualHidden = false,
  canScroll = false,
} = {}) {
  const isActive = toBoolean(active, true);
  if (!isActive) return "inactive";

  const userHidden = toBoolean(manualHidden, false);
  if (userHidden) return "user-hidden";

  const useful = toBoolean(canScroll, false);
  if (useful) return "interactive";

  return "auto-collapsed";
}

