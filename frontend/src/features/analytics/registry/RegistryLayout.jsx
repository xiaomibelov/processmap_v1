export default function RegistryLayout({ children, className = "" }) {
  return (
    <div className={`registryLayout ${className}`.trim()} data-testid="registry-layout">
      {children}
    </div>
  );
}
