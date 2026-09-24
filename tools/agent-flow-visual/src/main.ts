import { App } from "./app.js";
import { ClaudeApp } from "./claude/app.js";
import type { ReplayPackage } from "./claude/loader.js";
import { reviveReplayPackage } from "./claude/loader.js";
import { createFileLogLoader } from "./io/log-loader.js";

import { PALETTE } from "./canvas/renderer.js";

function resolveLogPath(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("log");
  if (fromUrl) return fromUrl;

  const fromEnv = import.meta.env.AGENT_EVENTS_LOG;
  if (fromEnv) return fromEnv;

  return ".agents/events/agent-events.ndjson";
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("mode") === "claude" || params.has("claude")) {
    const target = params.get("claude") ?? undefined;
    await startClaude(root, target);
    return;
  }

  const log = params.get("log");
  if (log || params.get("mode") === "contours") {
    await startContours(root, log ?? resolveLogPath());
    return;
  }

  renderModePicker(root);
}

function renderModePicker(root: HTMLElement): void {
  root.style.cssText = `display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${PALETTE.canvasBg};color:${PALETTE.bright};font-family:${PALETTE.mono};`;
  root.innerHTML = `
    <h1 style="color:${PALETTE.gold};margin-bottom:24px;">zoetrope</h1>
    <div style="display:flex;gap:16px;">
      <button id="btn-contours" style="padding:16px 24px;border:1px solid ${PALETTE.border};border-radius:8px;background:${PALETTE.panel};color:${PALETTE.bright};cursor:pointer;font-family:${PALETTE.mono};font-size:14px;">ProcessMap contours</button>
      <button id="btn-claude" style="padding:16px 24px;border:1px solid ${PALETTE.border};border-radius:8px;background:${PALETTE.panel};color:${PALETTE.bright};cursor:pointer;font-family:${PALETTE.mono};font-size:14px;">Claude Code session</button>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#btn-contours")!.addEventListener("click", () => {
    root.innerHTML = "";
    void startContours(root, resolveLogPath());
  });
  root.querySelector<HTMLButtonElement>("#btn-claude")!.addEventListener("click", () => {
    renderClaudePicker(root);
  });
}

async function startContours(root: HTMLElement, logPath: string): Promise<void> {
  const loader = createFileLogLoader(logPath);
  let events: import("agent-flow-core").RawEvent[] = [];
  let mode: "live" | "replay" = "live";

  try {
    events = await loader.load();
    mode = events.length > 0 ? "replay" : "live";
  } catch (err) {
    mode = "live";
    events = [];
    // eslint-disable-next-line no-console
    console.info("Log file not found; starting in live mode.", err);
  }

  new App({ root, events, title: "feature/contour-flow-visual", mode, tailPath: logPath });
}

function renderClaudePicker(root: HTMLElement): void {
  root.innerHTML = "";
  root.style.cssText = `display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:100%;height:100%;background:${PALETTE.canvasBg};color:${PALETTE.bright};font-family:${PALETTE.mono};padding:40px;box-sizing:border-box;`;

  const box = document.createElement("div");
  box.style.cssText = `width:560px;max-width:100%;`;

  box.innerHTML = `
    <h2 style="color:${PALETTE.gold};margin:0 0 16px 0;">Claude Code session</h2>
    <label style="color:${PALETTE.subtle};display:block;margin-bottom:6px;">Project directory</label>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <input id="project-dir" type="text" value="" placeholder="~/.claude/projects/..." style="flex:1;padding:8px;border:1px solid ${PALETTE.border};border-radius:6px;background:${PALETTE.ink};color:${PALETTE.bright};font-family:${PALETTE.mono};" />
      <button id="btn-discover" style="padding:8px 14px;border:1px solid ${PALETTE.border};border-radius:6px;background:${PALETTE.panel};color:${PALETTE.bright};cursor:pointer;font-family:${PALETTE.mono};">Discover</button>
    </div>
    <div id="sessions" style="margin-bottom:16px;"></div>
    <div style="color:${PALETTE.dim};font-size:12px;">Or open a specific file path via ?claude=/path/to/session.jsonl</div>
    <button id="btn-back" style="margin-top:24px;padding:8px 14px;border:1px solid ${PALETTE.border};border-radius:6px;background:${PALETTE.ink};color:${PALETTE.subtle};cursor:pointer;font-family:${PALETTE.mono};">← back</button>
  `;

  root.append(box);

  const input = box.querySelector<HTMLInputElement>("#project-dir")!;
  const sessionsContainer = box.querySelector<HTMLDivElement>("#sessions")!;

  box.querySelector<HTMLButtonElement>("#btn-discover")!.addEventListener("click", async () => {
    sessionsContainer.innerHTML = "<div>loading…</div>";
    try {
      const res = await fetch("/api/claude/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDir: input.value }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { sessions: Array<{ sessionId: string; path: string; mtime: string; size: number }> };
      renderSessionList(root, data.sessions);
    } catch (err) {
      sessionsContainer.innerHTML = `<div style="color:${PALETTE.error}">error: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  });

  box.querySelector<HTMLButtonElement>("#btn-back")!.addEventListener("click", () => {
    renderModePicker(root);
  });
}

function renderSessionList(
  root: HTMLElement,
  sessions: Array<{ sessionId: string; path: string; mtime: string; size: number }>
): void {
  const container = root.querySelector<HTMLDivElement>("#sessions")!;
  if (sessions.length === 0) {
    container.innerHTML = "<div style=\"color:#9a9a9a\">No sessions found.</div>";
    return;
  }

  container.innerHTML = `<div style="color:${PALETTE.subtle};margin-bottom:8px;">${sessions.length} session(s)</div>`;
  const list = document.createElement("div");
  list.style.cssText = `display:flex;flex-direction:column;gap:8px;`;

  for (const s of sessions) {
    const row = document.createElement("button");
    row.style.cssText = `text-align:left;padding:10px 12px;border:1px solid ${PALETTE.border};border-radius:6px;background:${PALETTE.ink};color:${PALETTE.bright};cursor:pointer;font-family:${PALETTE.mono};font-size:12px;`;
    const mtime = new Date(s.mtime).toLocaleString();
    row.innerHTML = `<div><strong>${s.sessionId}</strong></div><div style="color:${PALETTE.dim};font-size:11px;">${mtime} · ${s.size} bytes</div>`;
    row.addEventListener("click", async () => {
      root.innerHTML = "<div style=\"padding:40px;color:#9a9a9a\">loading session…</div>";
      try {
        const res = await fetch(`/api/claude/session?path=${encodeURIComponent(s.path)}`);
        if (!res.ok) throw new Error(await res.text());
        const pkg = reviveReplayPackage((await res.json()) as ReplayPackage);
        root.innerHTML = "";
        new ClaudeApp({ root, pkg, followHead: true });
      } catch (err) {
        root.innerHTML = `<div style="padding:40px;color:${PALETTE.error}">error: ${err instanceof Error ? err.message : String(err)}</div>`;
      }
    });
    list.append(row);
  }
  container.append(list);
}

async function startClaude(root: HTMLElement, target?: string): Promise<void> {
  root.innerHTML = "<div style=\"padding:40px;color:#9a9a9a\">loading session…</div>";
  if (!target) {
    renderClaudePicker(root);
    return;
  }
  try {
    const res = await fetch(`/api/claude/session?path=${encodeURIComponent(target)}`);
    if (!res.ok) throw new Error(await res.text());
    const pkg = reviveReplayPackage((await res.json()) as ReplayPackage);
    root.innerHTML = "";
    new ClaudeApp({ root, pkg, followHead: true });
  } catch (err) {
    root.innerHTML = `<div style="padding:40px;color:${PALETTE.error}">error: ${err instanceof Error ? err.message : String(err)}</div>`;
  }
}

main().catch((err) => {
  console.error("Failed to start Agent Flow Visual:", err);
});
