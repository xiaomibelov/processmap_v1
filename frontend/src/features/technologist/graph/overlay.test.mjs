// OL1 — unit-тесты чистых хелперов overlay (раскладка, трасс-индекс, подсветка, пары связей).
import { describe, expect, it } from "vitest";

import {
  OVERLAY_GAP_Y,
  OVERLAY_STACK_GAP_Y,
  applyOverlayLayout,
  buildTraceIndex,
  traceHighlights,
  traceLinkPairs,
} from "./overlay";

const ASIS = {
  nodes: [
    { id: "A", bpmn_type: "task", name: "A", x: 100, y: 100, width: 120, height: 80 },
    { id: "B", bpmn_type: "task", name: "B", x: 300, y: 100, width: 120, height: 80 },
  ],
  flows: [{ id: "F", source_ref: "A", target_ref: "B" }],
  lanes: [],
};

describe("applyOverlayLayout (OL1.2)", () => {
  it("ставит TO BE-узел строго под его AS IS-источником с offset по Y", () => {
    const draft = {
      nodes: [{ id: "A", derived_from: ["A"], x: 100, y: 100, width: 120, height: 80 }],
      flows: [],
    };
    const out = applyOverlayLayout(draft, ASIS);
    const n = out.nodes[0];
    expect(n.x).toBe(100); // совпадение по X — пространственное соответствие
    expect(n.y).toBe(100 + 80 + OVERLAY_GAP_Y); // под источником, подпись не перекрыта
    expect(draft.nodes[0].y).toBe(100); // вход не мутирован
  });

  it("каскадирует нескольких потомков одного источника вниз", () => {
    const draft = {
      nodes: [
        { id: "N1", derived_from: ["A"], x: 0, y: 0, width: 100, height: 60 },
        { id: "N2", derived_from: ["A"], x: 0, y: 0, width: 100, height: 60 },
      ],
      flows: [],
    };
    const out = applyOverlayLayout(draft, ASIS);
    expect(out.nodes[0].y).toBe(100 + 80 + OVERLAY_GAP_Y);
    expect(out.nodes[1].y).toBe(100 + 80 + OVERLAY_GAP_Y + 60 + OVERLAY_STACK_GAP_Y);
  });

  it("узлы без derived_from не трогает (свободная область)", () => {
    const draft = { nodes: [{ id: "New", x: 777, y: 555, width: 100, height: 60 }], flows: [] };
    const out = applyOverlayLayout(draft, ASIS);
    expect(out.nodes[0].x).toBe(777);
    expect(out.nodes[0].y).toBe(555);
  });

  it("без AS IS-модели возвращает вход как есть", () => {
    const draft = { nodes: [{ id: "A", derived_from: ["A"], x: 1, y: 2 }], flows: [] };
    expect(applyOverlayLayout(draft, null)).toBe(draft);
  });
});

describe("buildTraceIndex / traceHighlights (OL1.3)", () => {
  const traceMap = [
    { element_id: "A", draft_node_ids: ["D1"] },
    { element_id: "B", draft_node_ids: ["D2", "D3"] },
  ];
  const model = { nodes: [{ id: "D4", derived_from: ["A"] }] };

  it("строит индекс в обе стороны из traceMap + fallback derived_from", () => {
    const idx = buildTraceIndex(traceMap, model);
    expect(idx.tobeToAsis.get("D1")).toEqual(["A"]);
    expect(idx.asisToTobe.get("B")).toEqual(["D2", "D3"]);
    expect(idx.tobeToAsis.get("D4")).toEqual(["A"]); // fallback из узла
    expect(idx.asisToTobe.get("A")).toEqual(["D1", "D4"]);
  });

  it("выделение TO BE подсвечивает AS IS-источники, AS IS — потомков", () => {
    const idx = buildTraceIndex(traceMap, model);
    const h1 = traceHighlights(idx, { selectedTobeId: "D1" });
    expect([...h1.asis]).toEqual(["A"]);
    expect([...h1.tobe]).toEqual([]);
    const h2 = traceHighlights(idx, { selectedAsisId: "B" });
    expect([...h2.tobe].sort()).toEqual(["D2", "D3"]);
  });
});

describe("traceLinkPairs (OL1.4)", () => {
  const idx = buildTraceIndex([{ element_id: "A", draft_node_ids: ["D1"] },
    { element_id: "B", draft_node_ids: ["D2"] }], null);

  it("selection: только пары, инцидентные выделению", () => {
    expect(traceLinkPairs(idx, { mode: "selection", selectedTobeId: "D1" }))
      .toEqual([{ tobeId: "D1", asisId: "A" }]);
    expect(traceLinkPairs(idx, { mode: "selection", selectedTobeId: "", selectedAsisId: "" }))
      .toEqual([]);
  });

  it("always: все пары", () => {
    const pairs = traceLinkPairs(idx, { mode: "always" });
    expect(pairs).toHaveLength(2);
  });
});
