import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function localKey(sessionId) {
  return `fpc_bpmn_xml_${sessionId}`;
}

function forceHorizontalLanes(xml) {
  const s = String(xml || "");
  if (!s) return s;
  return s.replace(/isHorizontal="false"/g, 'isHorizontal="true"');
}

function prettyXml(xml) {
  const s0 = String(xml || "");
  const s = s0.trim();
  if (!s) return "";
  try {
    const reg = /(>)(<)(\/*)/g;
    const w = s.replace(reg, "$1\n$2$3");
    let pad = 0;
    const out = w.split("\n").map((line) => {
      const l = line.trim();
      if (!l) return "";
      if (/^<\/.+>/.test(l)) pad = Math.max(pad - 1, 0);
      const ind = "  ".repeat(pad);
      if (/^<[^!?/].*[^/]>$/.test(l) && !l.includes("</")) pad += 1;
      return ind + l;
    });
    return out.filter((x) => x !== "").join("\n");
  } catch {
    return s0;
  }
}

function seedFromActors(roles = []) {
  const clean = roles.map((r) => String(r || "").trim()).filter(Boolean);
  const laneNames = clean.length ? clean : ["Actor"];

  const poolX = 140;
  const poolY = 90;
  const poolW = 1600;
  const laneH = 150;
  const poolH = laneNames.length * laneH;

  const startX = poolX + 140;
  const startY = poolY + Math.floor(laneH / 2) - 18;

  const lanesXml = laneNames
    .map((name, i) => {
      const id = `Lane_${i + 1}`;
      return `<bpmn:lane id="${id}" name="${name}">
  <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
</bpmn:lane>`;
    })
    .join("\n");

  const laneShapesXml = laneNames
    .map((_, i) => {
      const id = `Lane_${i + 1}`;
      const y = poolY + i * laneH;
      return `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="true">
  <dc:Bounds x="${poolX}" y="${y}" width="${poolW}" height="${laneH}" />
</bpmndi:BPMNShape>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">

  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" name="Process" processRef="Process_1" />
  </bpmn:collaboration>

  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
${lanesXml}
    </bpmn:laneSet>

    <bpmn:startEvent id="StartEvent_1" name="Start" />
  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="${poolX}" y="${poolY}" width="${poolW}" height="${poolH}" />
      </bpmndi:BPMNShape>

${laneShapesXml}

      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="${startX}" y="${startY}" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

function XmlView({ xml }) {
  const formatted = useMemo(() => prettyXml(xml), [xml]);
  const lines = useMemo(() => (formatted ? formatted.split("\n") : []), [formatted]);

  return (
    <div className="xmlWrap">
      <div className="xmlScroller">
        {lines.length === 0 ? (
          <div className="muted">XML пустой.</div>
        ) : (
          <div className="xmlGrid">
            {lines.map((line, idx) => (
              <div className="xmlRow" key={idx}>
                <div className="xmlLn">{idx + 1}</div>
                <pre className="xmlCode">{line}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function safeFit(inst, attempt = 0) {
  try {
    const canvas = inst.get("canvas");
    const container = canvas?._container;
    const w = container?.clientWidth || 0;
    const h = container?.clientHeight || 0;

    if ((!w || !h) && attempt < 10) {
      await new Promise((r) => setTimeout(r, 70));
      return safeFit(inst, attempt + 1);
    }

    canvas.zoom("fit-viewport");
    const z = canvas.zoom();
    if (!Number.isFinite(z)) canvas.zoom(1);
  } catch {
  }
}

async function httpGetXml(sessionId) {
  const sid = String(sessionId || "");
  const url = `/api/sessions/${sid}/bpmn`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `GET ${url} -> ${res.status} ${t}` };
    }
    const text = await res.text();
    return { ok: true, xml: text };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

const BpmnStage = forwardRef(function BpmnStage({ sessionId, view, draft, reloadKey }, ref) {
  const viewerEl = useRef(null);
  const editorEl = useRef(null);

  const viewerRef = useRef(null);
  const modelerRef = useRef(null);

  const [xml, setXml] = useState("");
  const [srcHint, setSrcHint] = useState("");
  const [err, setErr] = useState("");

  function loadFromLocal() {
    const sid = String(sessionId || "");
    if (!sid) return false;
    const v = localStorage.getItem(localKey(sid));
    if (v && v.trim()) {
      const fixed = forceHorizontalLanes(v);
      setXml(fixed);
      setSrcHint("local");
      return true;
    }
    return false;
  }

  async function loadFromBackend() {
    const sid = String(sessionId || "");
    if (!sid || sid.startsWith("local_")) {
      setXml("");
      setSrcHint("");
      return;
    }
    const r = await httpGetXml(sid);
    if (!r.ok) {
      setErr(String(r.error || "failed to load bpmn"));
      return;
    }
    setErr("");
    const fixed = forceHorizontalLanes(String(r.xml || ""));
    setXml(fixed);
    setSrcHint("backend");
  }

  async function ensureViewer() {
    if (viewerRef.current) return viewerRef.current;
    const mod = await import("bpmn-js/lib/NavigatedViewer");
    const Viewer = mod.default || mod;
    const v = new Viewer({ container: viewerEl.current });
    viewerRef.current = v;
    return v;
  }

  async function ensureModeler() {
    if (modelerRef.current) return modelerRef.current;
    const mod = await import("bpmn-js/lib/Modeler");
    const Modeler = mod.default || mod;
    const m = new Modeler({ container: editorEl.current });
    modelerRef.current = m;
    return m;
  }

  async function renderViewer(nextXml) {
    const v = await ensureViewer();
    await v.importXML(forceHorizontalLanes(String(nextXml || "")));
    await safeFit(v);
  }

  async function renderModeler(nextXml) {
    const m = await ensureModeler();
    await m.importXML(forceHorizontalLanes(String(nextXml || "")));
    await safeFit(m);
  }

  async function saveLocalFromModeler() {
    const sid = String(sessionId || "");
    if (!sid) return;
    const m = await ensureModeler();
    const res = await m.saveXML({ format: true });
    const out = forceHorizontalLanes(String(res?.xml || ""));
    localStorage.setItem(localKey(sid), out);
    setXml(out);
    setSrcHint("local");
  }

  async function seedNew() {
    const roles = asArray(draft?.roles).map((x) => String(x || "").trim()).filter(Boolean);
    const seeded = forceHorizontalLanes(seedFromActors(roles));
    await renderModeler(seeded);
    setXml(seeded);
    setSrcHint("local");
  }

  function clearLocalOnly() {
    const sid = String(sessionId || "");
    if (!sid) return;
    localStorage.removeItem(localKey(sid));
    setSrcHint("backend");
  }

  useEffect(() => {
    const sid = String(sessionId || "");
    if (!sid) return;
    const hadLocal = loadFromLocal();
    if (!hadLocal) loadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!sessionId) return;

      try {
        if (view === "diagram") {
          if (!xml) return;
          await renderViewer(xml);
        }
        if (view === "editor") {
          const base = xml && xml.trim() ? xml : seedFromActors(asArray(draft?.roles));
          await renderModeler(base);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e?.message || e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, xml, sessionId]);

  useEffect(() => {
    return () => {
      try {
        viewerRef.current?.destroy?.();
      } catch {
      }
      try {
        modelerRef.current?.destroy?.();
      } catch {
      }
      viewerRef.current = null;
      modelerRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const inst = view === "editor" ? modelerRef.current : viewerRef.current;
      if (!inst) return;
      const canvas = inst.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Number.isFinite(z) ? z + 0.2 : 1.2);
    },
    zoomOut: () => {
      const inst = view === "editor" ? modelerRef.current : viewerRef.current;
      if (!inst) return;
      const canvas = inst.get("canvas");
      const z = canvas.zoom();
      canvas.zoom(Number.isFinite(z) ? Math.max(z - 0.2, 0.2) : 0.8);
    },
    fit: () => {
      const inst = view === "editor" ? modelerRef.current : viewerRef.current;
      if (!inst) return;
      safeFit(inst);
    },

    seedFromActors: () => seedNew(),
    saveLocal: () => saveLocalFromModeler(),
    resetBackend: () => loadFromBackend(),
    clearLocal: () => {
      clearLocalOnly();
      loadFromBackend();
    },
  }));

  return (
    <div className="bpmnStage">
      {err ? (
        <div className="badge err" style={{ marginBottom: 10 }}>
          {err}
        </div>
      ) : null}

      <div className="bpmnMetaRow">
        <div className="muted">
          источник: <b>{srcHint || "—"}</b>
        </div>
      </div>

      <div style={{ display: view === "xml" ? "block" : "none" }}>
        <XmlView xml={xml} />
      </div>

      <div className="bpmnCanvas" ref={viewerEl} style={{ display: view === "diagram" ? "block" : "none" }} />
      <div className="bpmnCanvas" ref={editorEl} style={{ display: view === "editor" ? "block" : "none" }} />
    </div>
  );
});

export default BpmnStage;
