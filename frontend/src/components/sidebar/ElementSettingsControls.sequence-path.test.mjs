import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

async function loadControls() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  const mod = await server.ssrLoadModule("/src/components/sidebar/ElementSettingsControls.jsx");
  return { server, mod };
}

test("NodePathSettings renders sequence option objects as labels, not [object Object]", async () => {
  const { server, mod } = await loadControls();
  try {
    const html = renderToStaticMarkup(React.createElement(mod.NodePathSettings, {
      selectedElementId: "Task_1",
      nodePathEditable: true,
      nodePathPaths: ["P0"],
      nodePathSequenceKey: { key: "primary", label: "Основной" },
      nodePathSyncState: "saved",
    }));
    assert.match(html, /Основной/);
    assert.doesNotMatch(html, /\\[object Object\\]|object_object/);
  } finally {
    await server.close();
  }
});

test("NodePathSettings renders sequence flow path labels with alternative copy", async () => {
  const { server, mod } = await loadControls();
  try {
    const html = renderToStaticMarkup(React.createElement(mod.NodePathSettings, {
      selectedElementId: "Flow_1",
      flowHappyEditable: true,
      flowPathTier: { value: "P1", label: "Восстановление" },
      nodePathEditable: false,
      nodePathSyncState: "saved",
    }));
    assert.match(html, /Альтернативный/);
    assert.doesNotMatch(html, /Восстановление|\\[object Object\\]|object_object/);
  } finally {
    await server.close();
  }
});
