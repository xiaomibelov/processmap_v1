import pmModdleDescriptor from "../../../robotmeta/pmModdleDescriptor.js";
import camundaModdleDescriptor from "../../../camunda/camundaModdleDescriptor.js";
import zeebeModdleDescriptor from "../../../camunda/zeebeModdleDescriptor.js";

function createCanvasContainer(kind) {
  const el = document.createElement("div");
  el.className = `tobeOverlayMock-canvas tobeOverlayMock-canvas--${kind}`;
  el.style.width = "100%";
  el.style.height = "100%";
  return el;
}

// Два read-only NavigatedViewer: TO BE (активный слой) + AS IS (ghost-подложка).
// Паттерн создания — ensureViewer (BpmnStage.jsx): deferUpdate, те же moddle
// extensions. Никаких modeler-API, подписок commandStack и onChange-вариантов.
export async function createMockOverlayViewers(options = {}) {
  let Viewer = options.Viewer;
  if (!Viewer) {
    const mod = await import("bpmn-js/lib/NavigatedViewer");
    Viewer = mod.default || mod;
  }
  const asisContainer = createCanvasContainer("asis");
  const tobeContainer = createCanvasContainer("tobe");
  const viewerOptions = {
    moddleExtensions: {
      pm: pmModdleDescriptor,
      camunda: camundaModdleDescriptor,
      zeebe: zeebeModdleDescriptor,
    },
    deferUpdate: true,
  };
  const asis = new Viewer({ ...viewerOptions, container: asisContainer });
  const tobe = new Viewer({ ...viewerOptions, container: tobeContainer });
  return {
    asis: { viewer: asis, container: asisContainer },
    tobe: { viewer: tobe, container: tobeContainer },
  };
}
