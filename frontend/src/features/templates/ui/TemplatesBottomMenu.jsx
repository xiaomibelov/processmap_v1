import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { readTemplatePackFromTemplate } from "../services/applyBpmnFragmentTemplatePlacement.js";

function toText(value) {
  return String(value || "").trim();
}

function templateTypeLabel(typeRaw) {
  const type = toText(typeRaw).toLowerCase();
  if (type === "bpmn_fragment_v1") return "BPMN fragment";
  if (type === "hybrid_stencil_v1") return "Hybrid stencil";
  return "BPMN selection";
}

function folderLabel(folder) {
  return toText(folder?.name) || "Folder";
}

function formatDateTs(tsRaw) {
  let ts = Number(tsRaw || 0);
  if (!(ts > 0)) return "—";
  if (ts > 0 && ts < 1e12) ts *= 1000;
  try {
    return new Date(ts).toLocaleString("ru-RU");
  } catch {
    return "—";
  }
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

function collectSearchText(template) {
  const pack = readTemplatePackFromTemplate(template);
  const nodeNames = Array.isArray(pack?.fragment?.nodes)
    ? pack.fragment.nodes.map((node) => toText(node?.name || node?.id)).filter(Boolean)
    : [];
  const laneNames = Array.isArray(template?.lane_names) ? template.lane_names.map(toText).filter(Boolean) : [];
  const tags = Array.isArray(pack?.tags) ? pack.tags.map(toText).filter(Boolean) : [];
  return [
    toText(template?.title || template?.name),
    templateTypeLabel(template?.template_type),
    ...laneNames,
    ...tags,
    ...nodeNames,
  ].join(" ").toLowerCase();
}

function buildTemplatePreview(templateRaw = {}) {
  const template = templateRaw && typeof templateRaw === "object" ? templateRaw : {};
  const pack = readTemplatePackFromTemplate(template);
  const nodes = Array.isArray(pack?.fragment?.nodes) ? pack.fragment.nodes : [];
  const edges = Array.isArray(pack?.fragment?.edges) ? pack.fragment.edges : [];
  const nodeNames = nodes
    .map((node) => toText(node?.name || node?.id))
    .filter(Boolean);
  const laneNames = Array.from(new Set(
    nodes
      .map((node) => toText(node?.laneHint || node?.laneName || node?.lane_name || node?.lane))
      .filter(Boolean),
  ));
  return {
    typeLabel: templateTypeLabel(template?.template_type),
    updatedAtText: formatDateTs(template?.updated_at || template?.created_at),
    sourceSessionId: toText(template?.source_session_id || template?.payload?.source_session_id),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    tags: Array.isArray(pack?.tags) ? pack.tags.map(toText).filter(Boolean) : [],
    laneNames,
    nodeNames,
    selectionCount: Number(template?.selection_count || nodes.length || 0),
  };
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-panel2/65 text-[10px] text-muted"
                onClick={() => onToggleExpand?.(id)}
                aria-label={expanded ? "Свернуть папку" : "Развернуть папку"}
              >
                {children.length ? (expanded ? "▾" : "▸") : "•"}
              </button>
              <button
                type="button"
                className={`flex h-8 min-w-0 flex-1 items-center rounded-xl border px-3 text-left text-sm transition ${
                  isActive
                    ? "border-accent/60 bg-accentSoft/25 text-fg"
                    : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
                }`}
                style={{ paddingLeft: `${12 + (level * 14)}px` }}
                onClick={() => onSelectFolder?.(id)}
                data-testid={`templates-folder-${id}`}
              >
                <span className="truncate">{folderLabel(folder)}</span>
              </button>
            </div>
            {expanded ? (
              <div className="pl-3 pt-1">
                <FolderTree
                  parentId={id}
                  level={level + 1}
                  childrenMap={childrenMap}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  activeFolderId={activeFolderId}
                  onSelectFolder={onSelectFolder}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ScopeButton({ active = false, label = "", count = 0, onClick, testId = "" }) {
  return (
    <button
      type="button"
      className={`flex min-h-[52px] w-full flex-col items-start rounded-2xl border px-3 py-2 text-left transition ${
        active
          ? "border-accent/60 bg-accentSoft/25 text-fg"
          : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
      }`}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted">{Number(count || 0)} шаблонов</span>
    </button>
  );
}

function TemplateListRow({ template, selected = false, onSelect, onApply, busy = false }) {
  const item = template && typeof template === "object" ? template : {};
  const id = toText(item.id) || "unknown";
  const preview = buildTemplatePreview(item);
  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        selected
          ? "border-accent/60 bg-accentSoft/20"
          : "border-border/70 bg-panel2/35 hover:border-accent/35 hover:bg-panel2/60"
      }`}
      data-testid={`template-item-${id}`}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onSelect?.(item)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{toText(item.title || item.name || "Шаблон")}</div>
            <div className="mt-1 text-xs text-muted">
              {preview.typeLabel} · {preview.nodeCount} узл. · {preview.edgeCount} flow
            </div>
            {preview.laneNames.length ? (
              <div className="mt-1 truncate text-[11px] text-muted">
                Lane: {preview.laneNames.join(", ")}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-[11px] text-muted">{preview.updatedAtText}</div>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          className="secondaryBtn h-8 px-3 text-xs"
          onClick={async () => {
            const result = await Promise.resolve(onApply?.(item));
            return result;
          }}
          data-testid={`btn-apply-template-${id}`}
          disabled={busy}
        >
          Применить
        </button>
      </div>
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
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [expandedByScope, setExpandedByScope] = useState({ personal: new Set(), org: new Set() });

  const scope = toText(activeScope).toLowerCase() === "org" ? "org" : "personal";
  const allTemplates = Array.isArray(templates) ? templates : [];
  const folders = Array.isArray(foldersByScope?.[scope]) ? foldersByScope[scope] : [];
  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);
  const expandedIds = expandedByScope[scope] || new Set();
  const compatibleTemplates = useMemo(
    () => allTemplates.filter((template) => toText(template?.template_type || "bpmn_selection_v1") === "bpmn_fragment_v1"),
    [allTemplates],
  );
  const hiddenIncompatibleCount = Math.max(0, allTemplates.length - compatibleTemplates.length);
  const searchNeedle = toText(search).toLowerCase();
  const visibleTemplates = useMemo(() => {
    if (!searchNeedle) return compatibleTemplates;
    return compatibleTemplates.filter((template) => collectSearchText(template).includes(searchNeedle));
  }, [compatibleTemplates, searchNeedle]);
  const selectedTemplate = useMemo(() => {
    const current = visibleTemplates.find((template) => toText(template?.id) === toText(selectedTemplateId));
    return current || visibleTemplates[0] || null;
  }, [selectedTemplateId, visibleTemplates]);
  const preview = useMemo(() => buildTemplatePreview(selectedTemplate), [selectedTemplate]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
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

  useEffect(() => {
    if (!open) return;
    if (!selectedTemplate && selectedTemplateId) {
      setSelectedTemplateId("");
      return;
    }
    if (!selectedTemplate && visibleTemplates[0]?.id) {
      setSelectedTemplateId(toText(visibleTemplates[0].id));
    }
  }, [open, selectedTemplate, selectedTemplateId, visibleTemplates]);

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

  const handleApply = useCallback(async (templateRaw) => {
    const result = await Promise.resolve(onApply?.(templateRaw));
    if (result?.ok !== false) {
      onClose?.();
    }
    return result;
  }, [onApply, onClose]);

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-bg/70 px-4 py-5 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="flex h-[min(82vh,860px)] w-[min(1220px,calc(100vw-32px))] min-w-0 flex-col overflow-hidden rounded-[28px] border border-border bg-panel shadow-panel"
        data-testid="templates-menu-panel"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Templates</div>
            <div className="mt-1 text-xl font-semibold text-fg">BPMN templates for the current session</div>
            <div className="mt-1 text-sm text-muted">
              Выберите BPMN fragment, посмотрите состав и вставьте его сразу в текущую сессию без placement-шага.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={() => void onRefresh?.()} disabled={busy}>
              Обновить
            </button>
            <button type="button" className="secondaryBtn h-9 px-3 text-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(280px,360px)_minmax(0,1fr)] gap-0">
          <aside className="flex min-h-0 flex-col border-r border-border bg-panel2/25 px-4 py-4">
            <div className="mb-3 space-y-2">
              <ScopeButton
                active={scope === "personal"}
                label="Личные"
                count={scope === "personal" ? allTemplates.length : 0}
                onClick={() => onScopeChange?.("personal")}
                testId="templates-menu-scope-my"
              />
              {showOrgScope ? (
                <ScopeButton
                  active={scope === "org"}
                  label="Организация"
                  count={scope === "org" ? allTemplates.length : 0}
                  onClick={() => onScopeChange?.("org")}
                  testId="templates-menu-scope-org"
                />
              ) : null}
            </div>

            <label className="mb-3 block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Поиск</div>
              <input
                type="search"
                className="input h-10 w-full"
                placeholder="Найти шаблон, lane, node"
                value={search}
                onChange={(event) => setSearch(String(event.target.value || ""))}
              />
            </label>

            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Folders</div>
                <div className="text-xs text-muted">Explorer-style filter by folder</div>
              </div>
              <button
                type="button"
                className="secondaryBtn h-8 px-3 text-xs"
                onClick={() => void handleCreateFolder()}
                disabled={!canCreateFolder}
                title={canCreateFolder ? "Создать папку" : "Only org admins can create shared folders"}
                data-testid="templates-folder-create"
              >
                + Папка
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-panel/70 p-2">
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  className={`flex h-8 min-w-0 flex-1 items-center rounded-xl border px-3 text-left text-sm transition ${
                    !toText(activeFolderId)
                      ? "border-accent/60 bg-accentSoft/25 text-fg"
                      : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
                  }`}
                  onClick={() => onSelectFolder?.("")}
                  data-testid="templates-folder-unsorted"
                >
                  Без папки
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
          </aside>

          <section className="flex min-h-0 flex-col border-r border-border px-4 py-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Список</div>
                <div className="text-sm text-fg">{visibleTemplates.length} BPMN templates in current view</div>
              </div>
              {hiddenIncompatibleCount > 0 ? (
                <div className="rounded-full border border-border/70 bg-panel2/50 px-3 py-1 text-[11px] text-muted">
                  Скрыто legacy/hybrid: {hiddenIncompatibleCount}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1" data-testid="templates-picker">
              {visibleTemplates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted">
                  {compatibleTemplates.length === 0
                    ? "В текущем scope пока нет BPMN fragment templates."
                    : "По текущему поиску ничего не найдено."}
                </div>
              ) : (
                visibleTemplates.map((template) => (
                  <TemplateListRow
                    key={toText(template?.id) || Math.random().toString(36)}
                    template={template}
                    selected={toText(template?.id) === toText(selectedTemplate?.id)}
                    onSelect={(item) => setSelectedTemplateId(toText(item?.id))}
                    onApply={handleApply}
                    busy={busy}
                  />
                ))
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Preview</div>
                <div className="text-sm text-muted">Что именно будет вставлено в текущую BPMN session</div>
              </div>
              {selectedTemplate ? (
                <button
                  type="button"
                  className="secondaryBtn h-8 px-3 text-xs text-danger"
                  onClick={() => void onDelete?.(selectedTemplate)}
                  disabled={busy || selectedTemplate?.can_delete === false}
                >
                  Удалить
                </button>
              ) : null}
            </div>

            {!selectedTemplate ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-[24px] border border-dashed border-border bg-panel2/25 px-6 text-center text-sm text-muted">
                Выберите BPMN template слева, чтобы посмотреть состав и применить его в текущую сессию.
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-auto rounded-[24px] border border-border bg-panel2/25 p-5">
                  <div>
                    <div className="text-xl font-semibold text-fg">{toText(selectedTemplate.title || selectedTemplate.name || "Шаблон")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-border/70 bg-panel px-3 py-1 text-xs text-fg">{preview.typeLabel}</span>
                      <span className="rounded-full border border-border/70 bg-panel px-3 py-1 text-xs text-fg">{preview.nodeCount} узл.</span>
                      <span className="rounded-full border border-border/70 bg-panel px-3 py-1 text-xs text-fg">{preview.edgeCount} flow</span>
                      <span className="rounded-full border border-border/70 bg-panel px-3 py-1 text-xs text-muted">Обновлён: {preview.updatedAtText}</span>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-panel px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Insert behavior</div>
                      <div className="mt-2 text-sm text-fg">
                        Шаблон будет сразу вставлен в текущую BPMN-диаграмму и сразу сохранён в session через обычный BPMN write-path.
                      </div>
                      <div className="mt-2 text-xs text-muted">
                        Без draw.io, без hybrid, без дополнительного placement-шага.
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-panel px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Metadata</div>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted">Source session</span>
                          <span className="text-right text-fg">{preview.sourceSessionId || "—"}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted">Selection size</span>
                          <span className="text-right text-fg">{preview.selectionCount || preview.nodeCount || 0}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted">Folder</span>
                          <span className="text-right text-fg">{toText(activeFolderId) || "Без папки"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-panel px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Lane hints</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {preview.laneNames.length ? preview.laneNames.map((lane) => (
                        <span key={lane} className="rounded-full border border-border/70 bg-panel2/60 px-3 py-1 text-xs text-fg">
                          {lane}
                        </span>
                      )) : <span className="text-sm text-muted">Lane hints не заданы.</span>}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-panel px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Nodes preview</div>
                    {preview.nodeNames.length ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {preview.nodeNames.slice(0, 12).map((name, index) => (
                          <div key={`${name}_${index}`} className="rounded-xl border border-border/60 bg-panel2/40 px-3 py-2 text-sm text-fg">
                            {name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-muted">Имена узлов недоступны, но pack валиден и будет вставлен как BPMN fragment.</div>
                    )}
                  </div>

                  {preview.tags.length ? (
                    <div className="rounded-2xl border border-border/70 bg-panel px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Tags</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {preview.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-border/70 bg-panel2/60 px-3 py-1 text-xs text-fg">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="text-xs text-muted">
                    Apply сразу обновит Diagram/XML в активной сессии.
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="secondaryBtn h-10 px-4 text-sm" onClick={onClose} disabled={busy}>
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="primaryBtn h-10 px-4 text-sm"
                      onClick={() => void handleApply(selectedTemplate)}
                      disabled={busy || !selectedTemplate}
                    >
                      Применить в сессию
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) {
    return overlay;
  }
  return createPortal(overlay, document.body);
}
