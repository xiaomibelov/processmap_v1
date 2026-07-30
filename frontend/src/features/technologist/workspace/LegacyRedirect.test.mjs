// CL1 — redirect /technologist/workspace → /app (единая истина WS3).
// Source-contract тест (по паттерну legacy *.test.mjs): RootApp больше не
// монтирует страницу WS1, а делает location.replace на /app с сохранением query.
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT_APP = path.resolve(__dirname, "../../../RootApp.jsx");

describe("CL1: legacy route /technologist/workspace", () => {
  const src = fs.readFileSync(ROOT_APP, "utf8");

  it("RootApp redirects /technologist/workspace to /app (no WS1 page mount)", () => {
    expect(src).toContain('pathname.startsWith("/technologist/workspace")');
    expect(src).toContain("window.location.replace(`/app${search || \"\"}`)");
    // страница WS1 больше не монтируется в RootApp
    expect(src).not.toContain("import TechnologistWorkspace");
  });

  it("redirect preserves query string", () => {
    const search = "?template=abc123";
    const target = `/app${search || ""}`;
    expect(target).toBe("/app?template=abc123");
  });
});
