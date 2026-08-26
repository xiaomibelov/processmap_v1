import { describe, expect, it } from "vitest";
import {
  artifactStepKind,
  buildContourFromScan,
  buildContoursFromScan,
  determineStatus,
  mapArtifactKind,
} from "../src/scanner-model.js";
import type { ScannedContourInput } from "../src/scanner-model.js";

function file(
  name: string,
  overrides?: Partial<ScannedContourInput["files"][number]>
): ScannedContourInput["files"][number] {
  return {
    name,
    path: `.planning/contours/feature/x/${name}`,
    size: 100,
    mtime: "2026-08-26T13:00:00.000Z",
    ...overrides,
  };
}

function input(overrides?: Partial<ScannedContourInput>): ScannedContourInput {
  return {
    type: "feature",
    name: "x",
    contourId: "feature/x",
    state: {},
    gates: [],
    files: [],
    ...overrides,
  };
}

describe("mapArtifactKind", () => {
  it("maps RAG_PREFLIGHT variants", () => {
    expect(mapArtifactKind("RAG_PREFLIGHT_PLANNER.md")).toBe("RAG_PREFLIGHT");
    expect(mapArtifactKind("RAG_PREFLIGHT_WORKER.md")).toBe("RAG_PREFLIGHT");
    expect(mapArtifactKind("RAG_PREFLIGHT.md")).toBe("RAG_PREFLIGHT");
  });

  it("maps core artifacts", () => {
    expect(mapArtifactKind("PLAN.md")).toBe("PLAN");
    expect(mapArtifactKind("API.md")).toBe("API");
    expect(mapArtifactKind("UI.md")).toBe("UI");
    expect(mapArtifactKind("TESTS.md")).toBe("TESTS");
    expect(mapArtifactKind("PR.md")).toBe("PR");
  });

  it("maps unknown files to OTHER", () => {
    expect(mapArtifactKind("notes.txt")).toBe("OTHER");
  });
});

describe("artifactStepKind", () => {
  it("returns correct step for known kinds", () => {
    expect(artifactStepKind("PLAN")).toBe("plan");
    expect(artifactStepKind("RAG_PREFLIGHT")).toBe("rag_preflight");
    expect(artifactStepKind("read_obsidian")).toBe("read_obsidian");
  });

  it("returns undefined for OTHER", () => {
    expect(artifactStepKind("OTHER")).toBeUndefined();
  });
});

describe("determineStatus", () => {
  it("prefers STATE.json status", () => {
    expect(determineStatus({ status: "finished" }, ["READY_FOR_EXECUTION"])).toBe("finished");
  });

  it("maps ready_for_* to blocked", () => {
    expect(determineStatus({ status: "ready_for_review" }, [])).toBe("blocked");
    expect(determineStatus({ status: "ready_for_execution" }, [])).toBe("blocked");
  });

  it("falls back to gate files", () => {
    expect(determineStatus({}, ["READY_FOR_EXECUTION"])).toBe("blocked");
    expect(determineStatus({}, ["WORKER_DONE"])).toBe("finished");
    expect(determineStatus({}, ["WORKER_STARTED"])).toBe("running");
  });

  it("returns unknown when nothing matches", () => {
    expect(determineStatus({}, [])).toBe("unknown");
    expect(determineStatus({ status: "weird" }, [])).toBe("unknown");
  });
});

describe("buildContourFromScan", () => {
  it("builds a finished contour from gate file", () => {
    const model = buildContourFromScan(
      input({
        files: [file("PLAN.md"), file("API.md")],
        gates: ["WORKER_DONE"],
      })
    );
    expect(model.status).toBe("finished");
    expect(model.steps.find((s) => s.step === "plan")?.status).toBe("ok");
    expect(model.steps.find((s) => s.step === "api")?.status).toBe("ok");
  });

  it("blocks contour waiting for execution approve", () => {
    const model = buildContourFromScan(
      input({
        files: [file("PLAN.md")],
        gates: ["READY_FOR_EXECUTION"],
      })
    );
    expect(model.status).toBe("blocked");
    expect(model.approvalGates).toHaveLength(1);
    expect(model.approvalGates[0].action).toBe("execute");
  });

  it("marks first pending step running when contour is running", () => {
    const model = buildContourFromScan(
      input({
        state: { status: "in_progress", branch: "feature/x" },
        files: [file("RAG_PREFLIGHT_PLANNER.md"), file("PLAN.md")],
      })
    );
    expect(model.status).toBe("running");
    expect(model.steps.find((s) => s.step === "plan")?.status).toBe("ok");
    expect(model.steps.find((s) => s.step === "api")?.status).toBe("running");
  });

  it("ignores phase gate files as artifacts", () => {
    const model = buildContourFromScan(
      input({
        files: [file("PLAN.md"), file("READY_FOR_REVIEW")],
      })
    );
    expect(model.files).toHaveLength(1);
    expect(model.files[0].name).toBe("PLAN.md");
  });

  it("keeps unknown files as OTHER artifacts", () => {
    const model = buildContourFromScan(
      input({
        files: [file("notes.txt")],
      })
    );
    expect(model.files).toHaveLength(1);
    expect(model.files[0].name).toBe("notes.txt");
  });

  it("uses branch from STATE.json", () => {
    const model = buildContourFromScan(
      input({
        state: { branch: "feature/x-real-data" },
      })
    );
    expect(model.branch).toBe("feature/x-real-data");
  });

  it("returns unknown for empty contour", () => {
    const model = buildContourFromScan(input());
    expect(model.status).toBe("unknown");
  });
});

describe("buildContoursFromScan", () => {
  it("sorts contours by startedAt", () => {
    const models = buildContoursFromScan([
      input({
        type: "feature",
        name: "b",
        contourId: "feature/b",
        files: [file("PLAN.md", { mtime: "2026-08-26T14:00:00.000Z" })],
      }),
      input({
        type: "feature",
        name: "a",
        contourId: "feature/a",
        files: [file("PLAN.md", { mtime: "2026-08-26T12:00:00.000Z" })],
      }),
    ]);
    expect(models.map((m) => m.contourId)).toEqual(["feature/a", "feature/b"]);
  });
});
