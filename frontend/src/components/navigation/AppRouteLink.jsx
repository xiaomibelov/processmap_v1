import { shouldHandleClientNavigation } from "../../features/navigation/appLinkBehavior";

export default function AppRouteLink({
  href = "/app",
  target = "",
  onNavigate,
  onClick,
  ...props
}) {
  function handleClick(event) {
    onClick?.(event);
    if (!shouldHandleClientNavigation(event, target)) return;
    event.preventDefault();
    onNavigate?.(event);
  }

  return <a {...props} href={href} target={target || undefined} onClick={handleClick} />;
}
