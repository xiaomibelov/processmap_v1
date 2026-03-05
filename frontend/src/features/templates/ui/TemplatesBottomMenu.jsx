import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function toText(value) {
  return String(value || "").trim();
}

function folderLabel(folder) {
  return toText(folder?.name) || "Folder";
}

function buildChildrenMap(folders = []) {
  const map = new Map();
  (Array.isArray(folders) ? folders : []).forEach((folderRaw) => {
    const folder = folderRaw && typeof folderRaw === "object" ? folderRaw : {};
    const parentId = toText(folder.parent_id);
    const list = map.get(parentId) || [];
    list.push(folder);
    map.set(parentId, list);
  });
  for (const [key, list] of map.entries()) {
    list.sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0) || folderLabel(a).localeCompare(folderLabel(b), "ru"));
    map.set(key, list);
  }
  return map;
}

function collectFolderIds(childrenMap, rootId = "") {
  const out = [];
  const stack = [...(childrenMap.get(rootId) || [])];
  while (stack.length > 0) {
    const current = stack.shift();
    const id = toText(current?.id);
    if (!id) continue;
    out.push(id);
    const children = childrenMap.get(id) || [];
    if (children.length) stack.unshift(...children);
  }
  return out;
}

function FolderTree({
  parentId = "",
  level = 0,
  childrenMap,
  expandedIds,
  onToggleExpand,
  activeFolderId = "",
  onSelectFolder,
}) {
  const rows = childrenMap.get(parentId) || [];
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      {rows.map((folder) => {
        const id = toText(folder?.id);
        if (!id) return null;
        const children = childrenMap.get(id) || [];
        const expanded = expandedIds.has(id);
        const isActive = toText(activeFolderId) === id;
        return (
          <div key={id}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="secondaryBtn h-6 w-6 px-0 text-[10px]"
                onClick={() => onToggleExpand?.(id)}
                aria-label={expanded ? "Свернуть папку" : "Развернуть папку"}
              >
                {children.length ? (expanded ? "▾" : "▸") : "•"}
              </button>
              <button
                type="button"
                className={`secondaryBtn h-7 min-w-0 flex-1 justify-start px-2 text-[11px] ${isActive ? "border-accent/60 bg-accentSoft/30 text-fg" : ""}`}
                style={{ paddingLeft: `${Math.max(8, 8 + level * 10)}px` }}
                onClick={() => onSelectFolder?.(id)}
                data-testid={`templates-folder-${id}`}
              >
                <span className="truncate">{folderLabel(folder)}</span>
              </button>
            </div>
            {expanded ? (
              <FolderTree
                parentId={id}
                level={level + 1}
                childrenMap={childrenMap}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                activeFolderId={activeFolderId}
                onSelectFolder={onSelectFolder}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function TemplatesBottomMenu({
  open = false,
  onClose,
  activeScope = "personal",
  onScopeChange,
  activeFolderId = "",
  onSelectFolder,
  foldersByScope = {},
  templates = [],
  busy = false,
  onRefresh,
  onApply,
  onDelete,
  onCreateFolder,
  canCreateOrgFolder = false,
  showOrgScope = true,
}) {
  const panelRef = useRef(null);
  const [expandedByScope, setExpandedByScope] = useState({ personal: new Set(), org: new Set() });
  const scope = toText(activeScope).toLowerCase() === "org" ? "org" : "personal";
  const folders = Array.isArray(foldersByScope?.[scope]) ? foldersByScope[scope] : [];
  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);
  const expandedIds = expandedByScope[scope] || new Set();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest("[data-testid='templates-menu-button']")) return;
      onClose?.();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setExpandedByScope((prev) => {
      const current = prev && typeof prev === "object" ? prev : { personal: new Set(), org: new Set() };
      const existing = current[scope] instanceof Set ? current[scope] : new Set();
      const next = new Set(existing);
      collectFolderIds(childrenMap, "").forEach((id) => next.add(id));
      return { ...current, [scope]: next };
    });
  }, [childrenMap, open, scope]);

  const handleToggleExpand = useCallback((folderId) => {
    const id = toText(folderId);
    if (!id) return;
    setExpandedByScope((prev) => {
      const current = prev && typeof prev === "object" ? prev : { personal: new Set(), org: new Set() };
      const base = current[scope] instanceof Set ? current[scope] : new Set();
      const nextSet = new Set(base);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return { ...current, [scope]: nextSet };
    });
  }, [scope]);

  const canCreateFolder = scope === "personal" || canCreateOrgFolder;

  const handleCreateFolder = useCallback(async () => {
    if (!canCreateFolder) return;
    const title = typeof window !== "undefined"
      ? window.prompt("Название папки", "")
      : "";
    const name = toText(title);
    if (!name) return;
    const created = await Promise.resolve(onCreateFolder?.({
      scope,
      name,
      parentId: activeFolderId,
    }));
    if (created?.ok !== false && created?.item?.id) {
      onSelectFolder?.(created.item.id);
    }
  }, [activeFolderId, canCreateFolder, onCreateFolder, onSelectFolder, scope]);

  if (!open) return null;
  return (
    <div className="templatesBottomMenu diagramActionPopover" ref={panelRef} data-testid="templates-menu-panel">
      <div className="diagramActionPopoverHead">
        <span>Templates</span>
        <div className="flex items-center gap-1">
          <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={() => void onRefresh?.()} disabled={busy}>
            Refresh
          </button>
          <button type="button" className="secondaryBtn h-7 px-2 text-[11px]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={`secondaryBtn h-7 px-3 text-[11px] ${scope === "personal" ? "border-accent/60 bg-accentSoft/30 text-fg" : ""}`}
          onClick={() => onScopeChange?.("personal")}
          data-testid="templates-menu-scope-my"
        >
          My
        </button>
        {showOrgScope ? (
          <button
            type="button"
            className={`secondaryBtn h-7 px-3 text-[11px] ${scope === "org" ? "border-accent/60 bg-accentSoft/30 text-fg" : ""}`}
            onClick={() => onScopeChange?.("org")}
            data-testid="templates-menu-scope-org"
          >
            Org
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(220px,0.85fr)_minmax(260px,1fr)] gap-3">
        <div className="space-y-2 rounded-lg border border-border/70 bg-panel2/35 p-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`secondaryBtn h-7 min-w-0 flex-1 justify-start px-2 text-[11px] ${!toText(activeFolderId) ? "border-accent/60 bg-accentSoft/30 text-fg" : ""}`}
              onClick={() => onSelectFolder?.("")}
              data-testid="templates-folder-unsorted"
            >
              Без папки
            </button>
            <button
              type="button"
              className="secondaryBtn h-7 px-2 text-[11px]"
              onClick={() => void handleCreateFolder()}
              disabled={!canCreateFolder}
              title={canCreateFolder ? "Создать папку" : "Only org admins can create shared templates"}
              data-testid="templates-folder-create"
            >
              + Folder
            </button>
          </div>
          <FolderTree
            parentId=""
            level={0}
            childrenMap={childrenMap}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            activeFolderId={activeFolderId}
            onSelectFolder={onSelectFolder}
          />
        </div>
        <div className="space-y-2 rounded-lg border border-border/70 bg-panel2/35 p-2">
          {Array.isArray(templates) && templates.length > 0 ? (
            templates.map((templateRaw) => {
              const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
              const id = toText(template.id) || "unknown";
              return (
                <div key={id} className="rounded-md border border-border/60 bg-panel px-2 py-2" data-testid={`templates-item-${id}`}>
                  <div className="min-w-0 text-xs font-semibold text-fg">{toText(template.title || template.name || "Template")}</div>
                  <div className="mt-0.5 min-w-0 truncate text-[10px] text-muted">
                    {toText(template.template_type || "bpmn_selection_v1")}
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px]"
                      onClick={async () => {
                        await Promise.resolve(onApply?.(template));
                        onClose?.();
                      }}
                      data-testid={`btn-apply-template-${id}`}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px] text-danger"
                      onClick={() => void onDelete?.(template)}
                      disabled={busy || template.can_delete === false}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="diagramActionPopoverEmpty">No templates in this folder.</div>
          )}
        </div>
      </div>
    </div>
  );
}

