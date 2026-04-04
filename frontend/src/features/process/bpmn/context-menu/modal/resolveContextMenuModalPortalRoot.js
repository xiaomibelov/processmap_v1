const CONTEXT_MENU_MODAL_ROOT_ID = "fpc-context-menu-modal-root";

export default function resolveContextMenuModalPortalRoot() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(CONTEXT_MENU_MODAL_ROOT_ID);
  if (existing instanceof HTMLElement) return existing;

  const root = document.createElement("div");
  root.id = CONTEXT_MENU_MODAL_ROOT_ID;
  root.setAttribute("data-fpc-modal-root", "context-menu");
  document.body.appendChild(root);
  return root;
}

