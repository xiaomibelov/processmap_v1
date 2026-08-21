export default function ProcessStageShell({
  header = null,
  topPanels = null,
  body = null,
  dialogs = null,
  children = null,
  className = "",
}) {
  const shellClassName = ["processShell", String(className || "").trim()].filter(Boolean).join(" ");
  if (children !== null) {
    return <div className={shellClassName}>{children}</div>;
  }

  return (
    <div className={shellClassName}>
      {header}
      {topPanels}
      {body}
      {dialogs}
    </div>
  );
}
