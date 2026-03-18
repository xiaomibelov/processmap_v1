/**
 * ChunkMismatchBoundary
 *
 * Catches errors that occur when a lazy-loaded chunk is missing after a
 * production deploy (stale SPA shell → new asset hashes). Only matches
 * chunk-load / module-fetch errors; all other errors are re-thrown so
 * that real runtime bugs remain visible.
 *
 * Symptom this fixes:
 *   - "Failed to fetch dynamically imported module: /assets/InterviewPathsView-….js"
 *   - "Failed to load module script: server responded with MIME type text/html"
 *   - "Loading chunk N failed"
 *   - error.name === "ChunkLoadError"
 */
import { Component } from "react";

/**
 * Returns true only for chunk-load / module-fetch errors that indicate
 * a stale SPA shell after a deploy. Does NOT match arbitrary fetch or
 * runtime errors.
 */
export function isChunkMismatchError(error) {
  if (!error) return false;
  if (typeof error !== "object" && typeof error !== "string") return false;

  const name = String(error?.name || "");
  const message = String(error?.message || error || "");

  if (name === "ChunkLoadError") return true;
  if (/Failed to fetch dynamically imported module/i.test(message)) return true;
  if (/Loading chunk\s+\d+\s+failed/i.test(message)) return true;
  if (/Loading CSS chunk\s+\d+\s+failed/i.test(message)) return true;
  if (/Importing a module script failed/i.test(message)) return true;
  // Vite / webpack generic dynamic import rejection
  if (/import\(\).*failed/i.test(message)) return true;

  return false;
}

const RECOVERY_LABEL = "Приложение обновилось. Нажмите для перезагрузки страницы.";
const RELOAD_LABEL = "Перезагрузить";

export default class ChunkMismatchBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { caught: false };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    if (isChunkMismatchError(error)) {
      return { caught: true };
    }
    // Not a chunk mismatch — let it propagate to the next boundary (or crash).
    return null;
  }

  componentDidCatch(error, info) {
    if (!isChunkMismatchError(error)) {
      // Re-throw so React can surface the real error to a parent boundary or
      // the default unhandled-error mechanism.
      throw error;
    }
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[ChunkMismatchBoundary] Stale chunk detected — prompting reload.",
        { error: String(error?.message || error), componentStack: info?.componentStack },
      );
    }
  }

  handleReload() {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  render() {
    if (this.state.caught) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1rem",
            gap: "0.75rem",
            textAlign: "center",
          }}
          data-testid="chunk-mismatch-recovery"
        >
          <p style={{ margin: 0, fontSize: "0.9rem" }}>{RECOVERY_LABEL}</p>
          <button
            type="button"
            onClick={this.handleReload}
            data-testid="chunk-mismatch-reload-btn"
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {RELOAD_LABEL}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
