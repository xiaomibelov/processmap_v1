import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

async function loadSpinner() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  const mod = await server.ssrLoadModule(
    "/src/features/process/bpmn/stage/load/FlowArcSpinner.jsx",
  );
  return { server, mod };
}

test("FlowArcSpinner renders an SVG with a status role and sr-only label", async () => {
  const { server, mod } = await loadSpinner();
  try {
    const html = renderToStaticMarkup(React.createElement(mod.default));
    assert.match(html, /<svg/);
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /flowArcSpinner-srOnly[^>]*>Загрузка диаграммы…/);
  } finally {
    await server.close();
  }
});

test("FlowArcSpinner honors the size prop and renders all visual parts", async () => {
  const { server, mod } = await loadSpinner();
  try {
    const html = renderToStaticMarkup(React.createElement(mod.default, { size: 24 }));
    assert.match(html, /width="24"/);
    assert.match(html, /height="24"/);
    assert.match(html, /flowArcSpinner-track/);
    assert.match(html, /flowArcSpinner-trail/);
    assert.match(html, /flowArcSpinner-dot/);
    assert.match(html, /flowArcSpinner-node/);
  } finally {
    await server.close();
  }
});
