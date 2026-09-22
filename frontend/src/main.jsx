import React from "react";
import ReactDOM from "react-dom/client";
import RootApp from "./RootApp";
import FrontendErrorBoundary from "./features/telemetry/FrontendErrorBoundary";
import { installGlobalFrontendTelemetry } from "./features/telemetry/telemetryClient";
import "./styles/tailwind.css";
import "./styles/legacy/legacy_bpmn.css";
import { applyInitialTheme, THEME_STORAGE_KEY } from "./lib/theme";

// Reference the deploy fingerprint so it becomes part of the entry chunk
// content and forces a new hashed filename on every stage deploy.
const deployFingerprint = __DEPLOY_FINGERPRINT__;
if (typeof window !== "undefined" && deployFingerprint) {
  window.__DEPLOY_FINGERPRINT__ = deployFingerprint;
}

try {
  applyInitialTheme(document.documentElement, window.localStorage.getItem(THEME_STORAGE_KEY));
} catch {
  applyInitialTheme(document.documentElement, "light");
}

installGlobalFrontendTelemetry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FrontendErrorBoundary>
      <RootApp />
    </FrontendErrorBoundary>
  </React.StrictMode>
);
