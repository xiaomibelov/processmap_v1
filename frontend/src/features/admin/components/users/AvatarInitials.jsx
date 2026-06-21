import { avatarColorClass, getInitials } from "./userAccessUtils.js";

export function AvatarInitials({ name = "", email = "", size = "md", className = "" }) {
  const initials = getInitials(name, email);
  const colorClass = avatarColorClass(name || email || "unknown");
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };
  return (
    <div
      className={[
        "inline-flex items-center justify-center rounded-full font-medium",
        sizeClasses[size] || sizeClasses.md,
        colorClass,
        className,
      ].join(" ")}
      aria-label={`Аватар ${name || email || "пользователя"}`}
    >
      {initials}
    </div>
  );
}
