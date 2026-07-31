// UXF/B3: визуальные состояния сессионного step-bar'а.
// W4-инвариант: пройденные — done (✓), ПЕРВЫЙ невыполненный — current
// (выделен), остальные невыполненные — pending (приглушены), na — «не требуется».
export function decorateSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const currentIdx = list.findIndex((s) => s && s.state === "todo");
  return list.map((s, idx) => ({
    ...s,
    visual:
      s.state === "done"
        ? "done"
        : s.state === "na"
          ? "na"
          : idx === currentIdx
            ? "current"
            : "pending",
  }));
}
