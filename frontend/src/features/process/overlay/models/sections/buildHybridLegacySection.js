function toText(value) {
  return String(value || "").trim();
}

export default function buildHybridLegacySection({
  rows,
  hybridVisible,
  hybridUiPrefs,
  hybridTotalCount,
  hybridModeEffective,
} = {}) {
  const hybridRows = rows.filter((row) => toText(row.entityKind) === "hybrid");
  const legacyRows = rows.filter((row) => toText(row.entityKind) === "legacy");
  const hybridOpacityPct = Number.isFinite(Number(hybridUiPrefs?.opacity))
    ? Math.max(0, Math.min(100, Number(hybridUiPrefs.opacity)))
    : 100;
  const focusPref = !!hybridUiPrefs?.focus;
  const focusActive = hybridVisible !== false && focusPref;
  return {
    hybridLegacySection: {
      visible: hybridVisible !== false,
      mode: toText(hybridModeEffective) === "edit" ? "edit" : "view",
      locked: !!hybridUiPrefs?.lock,
      focus: focusActive,
      focusActive,
      focusPref,
      opacityPct: hybridOpacityPct,
      rows: {
        hybrid: hybridRows,
        legacy: legacyRows,
      },
      hybridCount: hybridRows.length,
      legacyCount: legacyRows.length,
      totalCount: Number(hybridTotalCount || (hybridRows.length + legacyRows.length)),
    },
    hybridRows,
    legacyRows,
    hybridOpacityPct,
  };
}
