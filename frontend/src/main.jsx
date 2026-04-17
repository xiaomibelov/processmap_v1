import React from "react";
import ReactDOM from "react-dom/client";
import RootApp from "./RootApp";
import FrontendErrorBoundary from "./features/telemetry/FrontendErrorBoundary";
import { installGlobalFrontendTelemetry } from "./features/telemetry/telemetryClient";
import "./styles/tailwind.css";
import "./styles/legacy/legacy_bpmn.css";

const themeKey = "fpc_theme";
try {
  const stored = String(window.localStorage.getItem(themeKey) || "").trim();
  const theme = stored === "light" ? "light" : "dark";
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
} catch {
  document.documentElement.classList.remove("light");
  document.documentElement.classList.add("dark");
}

installGlobalFrontendTelemetry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FrontendErrorBoundary>
      <RootApp />
    </FrontendErrorBoundary>
  </React.StrictMode>
);
