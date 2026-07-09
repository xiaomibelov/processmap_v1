export default function SidebarInfoTip({ text = "", label = "Пояснение" }) {
  const tipText = String(text || "").trim();
  if (!tipText) return null;
  return (
    <span className="sidebarInfoTipWrap">
      <button
        type="button"
        className="sidebarInfoTip"
        aria-label={label}
        tabIndex={0}
      >
        i
      </button>
      <span className="sidebarInfoTipBubble" role="tooltip">
        {tipText}
      </span>
    </span>
  );
}
