let _promise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export async function loadBpmnJs() {
  if (typeof window !== "undefined" && window.BpmnJS) {
    return window.BpmnJS;
  }
  if (_promise) return _promise;

  const urls = [
    "https://cdn.jsdelivr.net/npm/bpmn-js@13.2.2/dist/bpmn-viewer.development.js",
    "https://unpkg.com/bpmn-js@13.2.2/dist/bpmn-viewer.development.js",
  ];

  _promise = (async () => {
    let lastErr = null;

    for (const u of urls) {
      try {
        await loadScript(u);
        if (window.BpmnJS) return window.BpmnJS;
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("BpmnJS not available");
  })();

  return _promise;
}
