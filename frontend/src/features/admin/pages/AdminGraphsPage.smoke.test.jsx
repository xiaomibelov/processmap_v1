// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import AdminGraphsPage from "./AdminGraphsPage.jsx";

const FIXTURE = {
  data: {
    snapshots: [
      {
        id: "20260830-000000-000000",
        created_at: "2026-08-30T00:00:00+00:00",
        commit_sha: "abc123def4567890",
        commit_message: "test commit",
        is_current: true,
        html_size: 1000,
        json_size: 500,
      },
    ],
    current: {
      id: "20260830-000000-000000",
      commit_sha: "abc123def4567890",
      commit_message: "test commit",
    },
    analytics: {
      snapshot_id: "20260830-000000-000000",
      commit_sha: "abc123def4567890",
      total_nodes: 1500,
      total_edges: 2000,
      community_nodes: 300,
      cross_community_edges: 50,
      isolated_nodes: 5,
      unclassified_percent: 2.5,
      layer_distribution: [
        { layer_id: "frontend", label: "Frontend", color: "#4E79A7", node_count: 100, percent: 33.3 },
        { layer_id: "backend", label: "Backend", color: "#F28E2C", node_count: 150, percent: 50 },
      ],
      top_hubs: [{ node_id: "n1", label: "Hub 1", layer: "backend", degree: 42 }],
      largest_communities: [{ community_id: "c1", label: "Community 1", layer: "backend", size: 30 }],
      layer_gaps: [
        { source_layer: "frontend", target_layer: "backend", edge_count: 12, has_edges: true, note: "real edges exist" },
      ],
    },
  },
  loading: false,
  error: "",
  rebuilding: false,
  rebuildError: "",
  activeJobId: "",
  activeStatus: null,
  canRebuild: true,
  rebuildDisabledReason: "",
  rebuild: () => {},
};

function renderPageString(payload = FIXTURE) {
  return renderToString(<AdminGraphsPage payload={payload} />);
}

function setupContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    container,
    cleanup() {
      container.remove();
    },
  };
}

async function renderPage(payload = FIXTURE) {
  const { container, cleanup } = setupContainer();
  const root = createRoot(container);
  await act(async () => {
    root.render(<AdminGraphsPage payload={payload} />);
  });
  return { container, root, cleanup };
}

describe("AdminGraphsPage smoke", () => {
  it("renders without throwing", () => {
    const html = renderPageString();
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders analytics cards and tables", async () => {
    const { container, root, cleanup } = await renderPage();
    expect(container.textContent).toContain("Всего нод");
    expect(container.textContent).toContain("1500");
    expect(container.textContent).toContain("Рёбер");
    expect(container.textContent).toContain("2000");
    expect(container.textContent).toContain("Frontend");
    expect(container.textContent).toContain("Backend");
    expect(container.textContent).toContain("Hub 1");
    expect(container.textContent).toContain("Community 1");
    root.unmount();
    cleanup();
  });

  it("renders viewer section with current snapshot commit", async () => {
    const { container, root, cleanup } = await renderPage();
    expect(container.textContent).toContain("Вьювер графа");
    expect(container.textContent).toContain("abc123de");
    root.unmount();
    cleanup();
  });

  it("renders snapshot history", async () => {
    const { container, root, cleanup } = await renderPage();
    expect(container.textContent).toContain("История снапшотов");
    expect(container.textContent).toContain("20260830-000000-000000");
    expect(container.textContent).toContain("Текущий");
    root.unmount();
    cleanup();
  });

  it("shows loading state", async () => {
    const { container, root, cleanup } = await renderPage({ ...FIXTURE, loading: true, data: null });
    expect(container.textContent).toContain("Загрузка графа");
    root.unmount();
    cleanup();
  });

  it("shows error state", async () => {
    const { container, root, cleanup } = await renderPage({ ...FIXTURE, error: "fail" });
    expect(container.textContent).toContain("fail");
    root.unmount();
    cleanup();
  });

  it("rebuild button calls callback", async () => {
    const onRebuild = vi.fn();
    const { container, root, cleanup } = await renderPage({ ...FIXTURE, rebuild: onRebuild });
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Пересобрать")
    );
    expect(button).not.toBeNull();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRebuild).toHaveBeenCalledTimes(1);
    root.unmount();
    cleanup();
  });

  it("shows neutral empty state when no snapshot", async () => {
    const onRebuild = vi.fn();
    const { container, root, cleanup } = await renderPage({
      ...FIXTURE,
      data: { snapshots: [], current: null, analytics: null },
      rebuild: onRebuild,
    });
    expect(container.textContent).toContain("Граф ещё не собран");
    expect(container.textContent).toContain("Пересборка HTML занимает");
    expect(container.textContent).toContain("Вьювер графа");
    expect(container.textContent).not.toContain("Ошибка загрузки данных");
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Пересобрать")
    );
    expect(button).not.toBeNull();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRebuild).toHaveBeenCalledTimes(1);
    root.unmount();
    cleanup();
  });

  it("disables rebuild button when input files are missing", async () => {
    const onRebuild = vi.fn();
    const { container, root, cleanup } = await renderPage({
      ...FIXTURE,
      canRebuild: false,
      rebuildDisabledReason: "Отсутствуют входные файлы: graph.json",
      rebuild: onRebuild,
    });
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("Пересобрать")
    );
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toContain("Отсутствуют входные файлы");
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRebuild).not.toHaveBeenCalled();
    root.unmount();
    cleanup();
  });
});
