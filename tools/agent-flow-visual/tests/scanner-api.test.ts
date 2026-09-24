import { describe, expect, it } from "vitest";
import { createContourApiMiddleware, defaultRepoRoot } from "../src/server/api.mjs";

function mockReq(url: string): { url: string } {
  return { url };
}

function mockRes(): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader: (name: string, value: string) => void;
  end: (data: string) => void;
} {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(data: string) {
      this.body = data;
      this.ended = true;
    },
  };
  return res;
}

function next() {
  // no-op
}

describe("createContourApiMiddleware", () => {
  const repoRoot = defaultRepoRoot();
  const middleware = createContourApiMiddleware(repoRoot);

  it("returns real contours from /api/contours", async () => {
    const req = mockReq("/api/contours");
    const res = mockRes();
    await middleware(req as any, res as any, next as any);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const contours = JSON.parse(res.body);
    expect(Array.isArray(contours)).toBe(true);
    expect(contours.length).toBeGreaterThan(0);
    const ids = contours.map((c: any) => c.contourId);
    expect(ids).toContain("feature/contour-flow-visual");
  });

  it("reads an artifact via /api/artifact", async () => {
    const req = mockReq("/api/artifact?path=.planning/contours/feature/contour-flow-visual/PLAN.md");
    const res = mockRes();
    await middleware(req as any, res as any, next as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("PLAN");
  });

  it("rejects paths outside repo root", async () => {
    const req = mockReq("/api/artifact?path=../etc/passwd");
    const res = mockRes();
    await middleware(req as any, res as any, next as any);
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for missing artifact", async () => {
    const req = mockReq("/api/artifact?path=.planning/contours/feature/contour-flow-visual/NOT_FOUND.md");
    const res = mockRes();
    await middleware(req as any, res as any, next as any);
    expect(res.statusCode).toBe(404);
  });

  it("returns demo events from /api/demo", async () => {
    const req = mockReq("/api/demo");
    const res = mockRes();
    await middleware(req as any, res as any, next as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("contour.started");
  });
});
