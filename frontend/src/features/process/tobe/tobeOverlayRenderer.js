// To-Be document card host: intentionally minimal DOM (host + one title
// node). The document icon is a CSS background on the title (::before), so
// the whole card stays at two DOM nodes per document.

const TITLE_MAX_LENGTH = 80;

export function createTobeDocumentHost(doc) {
  if (typeof document === "undefined") return null;

  const host = document.createElement("div");
  host.classList.add("fpc-tobe-doc");
  host.dataset.fpcElementId = String(doc?.anchorElementId || "");
  host.dataset.fpcTobeDocId = String(doc?.id || "");
  const color = String(doc?.color || "").trim();
  if (color) {
    host.style.setProperty("--fpc-tobe-accent", color);
  }

  let title = String(doc?.title ?? "").trim();
  if (title.length > TITLE_MAX_LENGTH) {
    title = `${title.slice(0, TITLE_MAX_LENGTH)}...`;
  }
  const titleEl = document.createElement("span");
  titleEl.classList.add("fpc-tobe-doc-title");
  titleEl.textContent = title;
  if (title) titleEl.title = title;
  host.appendChild(titleEl);

  const x = Number(doc?.x);
  const y = Number(doc?.y);
  const position = {
    top: Number.isFinite(y) ? y : 0,
    left: Number.isFinite(x) ? x : 0,
  };

  return { host, position };
}
