import { useEffect, useState } from "react";

function readZoom(inst) {
  try {
    return inst?.get?.("canvas")?.zoom?.() ?? 1;
  } catch {
    return 1;
  }
}

export function useOverlayZoom(bpmnInst) {
  const [zoom, setZoom] = useState(() => readZoom(bpmnInst));

  useEffect(() => {
    if (!bpmnInst) return undefined;
    const canvas = bpmnInst.get("canvas");
    if (!canvas) return undefined;

    const onViewbox = () => setZoom(readZoom(bpmnInst));
    canvas.on("canvas.viewbox.changed", onViewbox);
    canvas.on("canvas.resized", onViewbox);
    onViewbox();

    return () => {
      canvas.off("canvas.viewbox.changed", onViewbox);
      canvas.off("canvas.resized", onViewbox);
    };
  }, [bpmnInst]);

  return zoom;
}
