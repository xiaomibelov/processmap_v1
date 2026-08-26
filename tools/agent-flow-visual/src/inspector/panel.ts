import type { LayoutNode } from "agent-flow-core";

export class InspectorPanel {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.cssText =
      "position:absolute;top:0;right:0;width:320px;height:100%;background:#fff;border-left:1px solid #E2E8F0;padding:16px;box-sizing:border-box;overflow:auto;transform:translateX(100%);transition:transform 0.2s ease;";
  }

  showNode(node: LayoutNode): void {
    this.container.style.transform = "translateX(0)";
    this.container.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = node.label;
    title.style.margin = "0 0 12px 0";

    const status = document.createElement("p");
    status.textContent = `Status: ${node.status}`;

    this.container.append(title, status);

    if (node.chips.length > 0) {
      const chipsTitle = document.createElement("h4");
      chipsTitle.textContent = "Artifacts";
      chipsTitle.style.marginBottom = "8px";
      this.container.append(chipsTitle);

      for (const chip of node.chips) {
        const chipEl = document.createElement("div");
        chipEl.textContent = `${chip.kind}: ${chip.path}`;
        chipEl.style.cssText =
          "font-size:12px;padding:6px 8px;background:#F1F5F9;border-radius:4px;margin-bottom:6px;word-break:break-all;";
        this.container.append(chipEl);
      }
    }
  }

  hide(): void {
    this.container.style.transform = "translateX(100%)";
  }
}
