import React, { useId } from "react";
import "./FlowArcSpinner.css";

/**
 * FlowArcSpinner — pure-SVG loading indicator for diagram load states.
 *
 * "Flow Arc" concept: a thin semi-ring track, a primary-colored leading dot
 * with a short gradient trail running along the arc, and a center node that
 * pulses out of phase with the rotation. All motion is CSS-only; colors come
 * from theme tokens (--c-accent) with .light/.dark adaptation, so the spinner
 * follows the app theme automatically.
 *
 * Props:
 *   size  — pixel size of the SVG (default 40)
 *   label — accessible name announced via the sr-only status text
 */
export default function FlowArcSpinner({ size = 40, label = "Загрузка диаграммы…" }) {
  const gradientId = `flowArcSpinner-trail-gradient-${useId()}`;

  return (
    <span className="flowArcSpinner" role="status" aria-live="polite">
      <svg
        className="flowArcSpinner-svg"
        viewBox="0 0 40 40"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--spinner-primary)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--spinner-primary)" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path className="flowArcSpinner-track" d="M20 4 A16 16 0 1 1 4 20" />
        <g className="flowArcSpinner-rotor">
          <path
            className="flowArcSpinner-trail"
            d="M20 4 A16 16 0 0 1 36 20"
            stroke={`url(#${gradientId})`}
          />
          <circle className="flowArcSpinner-dot" cx="36" cy="20" r="2" />
        </g>
        <circle className="flowArcSpinner-node" cx="20" cy="20" r="2.5" />
      </svg>
      <span className="flowArcSpinner-srOnly">{label}</span>
    </span>
  );
}
