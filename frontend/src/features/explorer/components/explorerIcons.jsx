// ─── Icons (inline SVG to avoid external deps) ────────────────────────────────
// Moved verbatim from WorkspaceExplorer.jsx (Ш1 of audit/workspace-explorer-decomposition DECOMP.md).
import React from "react";

export function IcoFolder({ open = false, className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      {open
        ? <path d="M1 4h14v9a1 1 0 01-1 1H2a1 1 0 01-1-1V4zM1 4V3a1 1 0 011-1h4l1 2H1z" fill="currentColor" opacity=".85" />
        : <path d="M1 4v9a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H7.5L6.5 3H2a1 1 0 00-1 1z" fill="currentColor" opacity=".75" />
      }
    </svg>
  );
}
export function IcoProject({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8" />
      <path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
export function IcoSession({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".75" />
      <path d="M8 4.5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}
export function IcoChevron({ right = false, className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
      {right
        ? <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}
export function IcoTreeBulk({ expanded = false, className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
      <path
        d={expanded ? "M5 5.25 7 7.25l2-2M5 8.75l2 2 2-2" : "M5 2.25l2 2 2-2M5 11.75l2-2 2 2"}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function IcoArrowLeft({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IcoSpinner({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IcoWorkspace({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".8" />
      <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="10.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="5.5" cy="10.5" r="1.5" fill="currentColor" opacity=".6" />
      <circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" opacity=".6" />
    </svg>
  );
}
export function IcoPlus({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
export function IcoSearch({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.25 10.25 13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export function IcoTrash({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 3.5h10M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M3.5 3.5l.5 8a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
export function IcoEdit({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L12 5l-7.5 7.5L1 13l.5-3.5L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IcoMove({ className = "" }) {
  return (
    <svg className={`inline-block ${className}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12M3 3l-2 4 2 4M11 3l2 4-2 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  );
}
