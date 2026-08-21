export default function Button({ variant = "secondary", size = "sm", className = "", children, ...rest }) {
  const v = variant === "primary" ? "primaryBtn" : "secondaryBtn";
  const s = size === "sm" ? "btnSm" : "";
  return (
    <button className={`${v} ${s} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
