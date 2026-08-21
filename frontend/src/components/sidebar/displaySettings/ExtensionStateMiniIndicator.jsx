// Compact extension-state indicator (property-panel-redesign, UI refresh).
//
// A glanceable ~16px icon at the top of the Properties tab mirroring the
// detailed SidebarTrustStatus in the "Вспомогательное" group (which keeps
// the retry CTA — untouched). States: saved (✓) / local (✎) /
// syncing|refreshing (⟳) / error (⚠). Tooltip carries the Russian copy;
// no visible text.

import { extensionStateMiniView } from "./extensionStateMiniView.js";

function MiniIcon({ icon }) {
  if (icon === "check") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M2 6.2 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "pencil") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M7.6 2.2 L9.8 4.4 L4.4 9.8 L2 10.2 L2.4 7.8 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "sync") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M9.5 4.5 A4 4 0 0 0 3 3.2 L2 4.4 M2.5 7.5 A4 4 0 0 0 9 8.8 L10 7.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2 2.6 L2 4.4 L3.8 4.4 M10 9.4 L10 7.6 L8.2 7.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M6 1.8 L10.8 10.2 L1.2 10.2 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 4.8 L6 7.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="8.7" r="0.8" fill="currentColor" />
    </svg>
  );
}

export default function ExtensionStateMiniIndicator({ syncState = "saved", busy = false }) {
  const view = extensionStateMiniView(busy ? "syncing" : syncState);
  return (
    <span
      className={`extensionStateMini extensionStateMini--${view.tone}`}
      role="status"
      title={view.tooltip}
      aria-label={view.tooltip}
      data-testid="extension-state-mini"
      data-tone={view.tone}
    >
      <MiniIcon icon={view.icon} />
    </span>
  );
}
