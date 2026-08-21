export default function TopRightCtaGroup({
  className = "",
  onCreateProject,
  onCreateSession,
  createProjectLabel = "Новый проект",
  createSessionLabel = "Создать сессию",
  createProjectTestId = "",
  createSessionTestId = "",
  createSessionDisabled = false,
  createSessionTitle = "",
  compact = false,
}) {
  const sizeClass = compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  const rootClass = ["flex flex-wrap items-center justify-end gap-2", className].filter(Boolean).join(" ");
  const sessionTitle = createSessionTitle || (
    createSessionDisabled ? "Сначала выбери проект" : "Создать сессию"
  );
  return (
    <div className={rootClass}>
      <button
        type="button"
        className={`secondaryBtn min-h-0 whitespace-nowrap ${sizeClass}`}
        onClick={() => onCreateProject?.()}
        data-testid={createProjectTestId || undefined}
      >
        {createProjectLabel}
      </button>
      <button
        type="button"
        className={`primaryBtn min-h-0 whitespace-nowrap ${sizeClass}`}
        onClick={() => onCreateSession?.()}
        disabled={createSessionDisabled}
        title={sessionTitle}
        data-testid={createSessionTestId || undefined}
      >
        {createSessionLabel}
      </button>
    </div>
  );
}
