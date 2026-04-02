function joinClassNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function SidebarTrustStatus({
  title = null,
  titleClassName = "sidebarFieldLabel sidebarFieldLabel--withChip",
  titleTestId = "",
  label = "",
  helper = "",
  helperMeta = "",
  tone = "saved",
  pillClassName = "",
  ctaLabel = "",
  onCta,
  ctaDisabled = false,
  ctaVariant = "primary",
  ctaClassName = "",
  helperClassName = "",
  testIdPrefix = "",
}) {
  const normalizedTone = String(tone || "saved").trim().toLowerCase() || "saved";
  const normalizedLabel = String(label || "").trim();
  const normalizedHelper = String(helper || "").trim();
  const normalizedHelperMeta = String(helperMeta || "").trim();
  const normalizedCtaLabel = String(ctaLabel || "").trim();
  const pillTestId = testIdPrefix ? `${testIdPrefix}-pill` : undefined;
  const helperTestId = testIdPrefix ? `${testIdPrefix}-helper` : undefined;
  const actionsTestId = testIdPrefix ? `${testIdPrefix}-actions` : undefined;
  const buttonClassName = joinClassNames(
    ctaVariant === "secondary" ? "secondaryBtn" : "primaryBtn",
    "h-7 px-2.5 text-[11px]",
    ctaClassName,
  );

  return (
    <>
      {title ? (
        <div className={titleClassName} data-testid={titleTestId || undefined}>
          {title}
          {normalizedLabel ? (
            <span className={joinClassNames(`sidebarStatusPill is-${normalizedTone}`, pillClassName)} data-testid={pillTestId}>
              {normalizedLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {normalizedHelper ? (
        <div className={joinClassNames(`sidebarStatusHelper is-${normalizedTone}`, helperClassName)} data-testid={helperTestId}>
          <span>{normalizedHelper}</span>
          {normalizedHelperMeta ? <span className="sidebarStatusHelperMeta">{normalizedHelperMeta}</span> : null}
        </div>
      ) : null}
      {normalizedCtaLabel ? (
        <div className="sidebarStatusActionRow" data-testid={actionsTestId}>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => {
              void onCta?.();
            }}
            disabled={ctaDisabled}
          >
            {normalizedCtaLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
