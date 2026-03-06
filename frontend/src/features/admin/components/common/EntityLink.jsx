import { toText } from "../../adminUtils";

export default function EntityLink({
  label = "",
  href = "",
  onNavigate,
}) {
  const nextHref = toText(href);
  return (
    <button
      type="button"
      className="text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
      onClick={() => nextHref && onNavigate?.(nextHref)}
      disabled={!nextHref}
    >
      {toText(label) || nextHref || "Open"}
    </button>
  );
}

