export default function ProcessStageShell({
  header = null,
  topPanels = null,
  body = null,
  dialogs = null,
  children = null,
}) {
  if (children !== null) {
    return <div className="processShell">{children}</div>;
  }

  return (
    <div className="processShell">
      {header}
      {topPanels}
      {body}
      {dialogs}
    </div>
  );
}
