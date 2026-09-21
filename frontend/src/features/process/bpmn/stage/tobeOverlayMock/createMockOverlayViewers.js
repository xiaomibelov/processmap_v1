import pmModdleDescriptor from "../../../robotmeta/pmModdleDescriptor.js";
import camundaModdleDescriptor from "../../../camunda/camundaModdleDescriptor.js";
import zeebeModdleDescriptor from "../../../camunda/zeebeModdleDescriptor.js";

function createCanvasContainer(classPrefix, kind) {
  const el = document.createElement("div");
  el.className = `${classPrefix}-canvas ${classPrefix}-canvas--${kind}`;
  el.style.width = "100%";
  el.style.height = "100%";
  return el;
}

// Один read-only NavigatedViewer (ghost-инстанс). Паттерн создания —
// ensureViewer (BpmnStage.jsx): deferUpdate, те же moddle extensions.
// Никаких modeler-API, подписок commandStack и onChange-вариантов.
// classPrefix: префикс классов контейнера (мок — tobeOverlayMock, underlay —
// tobeOverlayUnderlay). Извлечено из createMockOverlayViewers (underlay-v1):
// поведение мок-фабрики сохранено, контракт тот же.
export async function createSingleOverlayViewer(kind, options = {}) {
  let Viewer = options.Viewer;
  if (!Viewer) {
    const mod = await import("bpmn-js/lib/NavigatedViewer");
    Viewer = mod.default || mod;
  }
  const classPrefix = options.classPrefix || "tobeOverlayMock";
  const container = createCanvasContainer(classPrefix, kind);
  const viewer = new Viewer({
    moddleExtensions: {
      pm: pmModdleDescriptor,
      camunda: camundaModdleDescriptor,
      zeebe: zeebeModdleDescriptor,
    },
    deferUpdate: true,
    container,
  });
  return { viewer, container };
}

// Два read-only NavigatedViewer: TO BE (активный слой) + AS IS (ghost-подложка).
export async function createMockOverlayViewers(options = {}) {
  const asis = await createSingleOverlayViewer("asis", options);
  const tobe = await createSingleOverlayViewer("tobe", options);
  return { asis, tobe };
}
