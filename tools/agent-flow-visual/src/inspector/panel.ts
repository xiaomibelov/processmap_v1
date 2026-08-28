import type { LayoutNode } from "agent-flow-core";
import { PALETTE } from "../canvas/renderer.js";

export class InspectorPanel {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.cssText = `
      position:absolute;
      top:0;
      right:0;
      width:320px;
      height:100%;
      background:${PALETTE.panel};
      border-left:1px solid ${PALETTE.border};
      padding:16px;
      box-sizing:border-box;
      overflow:auto;
      transform:translateX(100%);
      transition:transform 0.2s ease;
      color:${PALETTE.bright};
      font-family:${PALETTE.mono};
      font-size:13px;
    `;
  }

  showNode(node: LayoutNode): void {
    this.container.style.transform = "translateX(0)";
    this.container.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = node.title;
    title.style.cssText = `margin:0 0 12px 0;color:${PALETTE.gold};font-family:${PALETTE.mono};`;

    const status = document.createElement("p");
    status.style.cssText = `color:${PALETTE.subtle};margin:0 0 12px 0;`;
    status.textContent = `status: ${node.status}`;

    this.container.append(title, status);

    if (node.description) {
      const desc = document.createElement("p");
      desc.style.cssText = `color:${PALETTE.bright};margin:0 0 12px 0;`;
      desc.textContent = node.description;
      this.container.append(desc);
    }

    if (node.toolCount > 0) {
      const tools = document.createElement("p");
      tools.style.cssText = `color:${PALETTE.gold};margin:0 0 12px 0;`;
      tools.textContent = `tools: ${node.toolCount}${node.lastTool ? ` · ${node.lastTool}` : ""}`;
      this.container.append(tools);
    }

    if (node.outputTokens > 0) {
      const tok = document.createElement("p");
      tok.style.cssText = `color:${PALETTE.dim};margin:0 0 12px 0;`;
      tok.textContent = `tokens: ${node.outputTokens}`;
      this.container.append(tok);
    }

    if (node.chips.length > 0) {
      const chipsTitle = document.createElement("h4");
      chipsTitle.textContent = "Artifacts";
      chipsTitle.style.cssText = `margin:12px 0 8px 0;color:${PALETTE.bright};`;
      this.container.append(chipsTitle);

      for (const chip of node.chips) {
        const chipEl = document.createElement("div");
        chipEl.textContent = `${chip.kind}: ${chip.path}`;
        chipEl.style.cssText = `
          font-size:12px;
          padding:6px 8px;
          background:${PALETTE.ink};
          border:1px solid ${PALETTE.border};
          border-radius:4px;
          margin-bottom:6px;
          word-break:break-all;
          color:${PALETTE.subtle};
        `;
        this.container.append(chipEl);
      }
    }
  }

  hide(): void {
    this.container.style.transform = "translateX(100%)";
  }
}
