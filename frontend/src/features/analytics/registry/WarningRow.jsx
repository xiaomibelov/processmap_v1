export default function WarningRow({ warnings = [] }) {
  if (!warnings.length) return null;
  return (
    <div className="registryWarningRow" data-testid="registry-warning-row">
      {warnings.map((text, i) => (
        <div key={i} className="registryWarningItem">
          <span className="registryWarningIcon" aria-hidden="true">⚠</span>
          <span className="registryWarningText">{text}</span>
        </div>
      ))}
    </div>
  );
}
