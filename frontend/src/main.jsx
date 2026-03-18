import React from "react";
import ReactDOM from "react-dom/client";
import RootApp from "./RootApp";
import ChunkMismatchBoundary, { isChunkMismatchError } from "./shared/ui/ChunkMismatchBoundary";
import "./styles/tailwind.css";
import "./styles/legacy/legacy_bpmn.css";

// Global handler: catch unhandled promise rejections caused by stale chunk
// fetches (post-deploy mismatch). Only matches the narrow chunk-load class;
// all other rejections are left alone for standard error surfaces.
window.addEventListener("unhandledrejection", (event) => {
  const err = event?.reason;
  if (!isChunkMismatchError(err)) return;
  event.preventDefault();
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "[ChunkMismatch] Unhandled chunk-load rejection detected — triggering reload prompt.",
      String(err?.message || err),
    );
  }
  // Dispatch a custom DOM event so the nearest ChunkMismatchBoundary (or any
  // future listener) can show a reload prompt even when the rejection is not
  // caught by a React error boundary (e.g. top-level lazy import outside tree).
  window.dispatchEvent(
    new CustomEvent("fpc:chunk-mismatch", { detail: { message: String(err?.message || err) } }),
  );
});

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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ChunkMismatchBoundary>
      <RootApp />
    </ChunkMismatchBoundary>
  </React.StrictMode>
);
