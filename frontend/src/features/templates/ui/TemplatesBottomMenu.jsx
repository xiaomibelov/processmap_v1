import { useCallback, useEffect, useMemo, useState } from "react";

import Modal from "../../../shared/ui/Modal";
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-panel2/65 text-[10px] text-muted"
                onClick={() => onToggleExpand?.(id)}
                aria-label={expanded ? "Свернуть папку" : "Развернуть папку"}
              >
                {children.length ? (expanded ? "▾" : "▸") : "•"}
              </button>
              <button
                type="button"
                className={`flex h-7 min-w-0 flex-1 items-center rounded-lg border px-2.5 text-left text-sm transition ${
                  isActive
                    ? "border-accent/60 bg-accentSoft/25 text-fg"
                    : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
                }`}
                style={{ paddingLeft: `${10 + (level * 12)}px` }}
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
      className={`flex min-h-[48px] w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
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
      className={`rounded-xl border p-3 transition ${
        selected
          ? "border-accent/60 bg-accentSoft/20"
          : "border-border/70 bg-panel2/35 hover:border-accent/35 hover:bg-panel2/60"
      }`}
      data-testid={`template-item-${id}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="block min-w-0 flex-1 text-left"
          onClick={() => onSelect?.(item)}
          data-testid={`btn-select-template-${id}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{toText(item.title || item.name || "Шаблон")}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded border border-border/70 bg-panel px-1.5 py-0.5">{preview.typeLabel}</span>
                <span>{preview.nodeCount} узл.</span>
                <span>{preview.edgeCount} flow</span>
              </div>
              {preview.laneNames.length ? (
                <div className="mt-1 truncate text-[11px] text-muted">
                  Lane: {preview.laneNames.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        </button>
        <button
          type="button"
          className="secondaryBtn h-8 shrink-0 px-2.5 text-[11px]"
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

function TemplatePickerFooter({
  busy,
  selectedTemplate,
  onRefresh,
  onClose,
  onApply,
  onDelete,
}) {
  const handleApply = useCallback(async () => {
    if (!selectedTemplate) return;
    const result = await Promise.resolve(onApply?.(selectedTemplate));
    if (result?.ok) {
      onClose?.();
    }
  }, [onApply, onClose, selectedTemplate]);

  const handleDelete = useCallback(async () => {
    if (!selectedTemplate) return;
    await Promise.resolve(onDelete?.(selectedTemplate));
  }, [onDelete, selectedTemplate]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="secondaryBtn h-9 px-3 text-xs"
          onClick={() => void onRefresh?.()}
          disabled={busy}
          data-testid="templates-footer-refresh"
        >
          Обновить
        </button>
        {selectedTemplate ? (
          <button
            type="button"
            className="secondaryBtn h-9 px-3 text-xs text-danger"
            onClick={() => void handleDelete()}
            disabled={busy || selectedTemplate?.can_delete === false}
            data-testid="templates-footer-delete"
          >
            Удалить
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="secondaryBtn h-9 px-3 text-xs" onClick={onClose} disabled={busy}>
          Закрыть
        </button>
        <button
          type="button"
          className="primaryBtn h-9 px-3 text-xs"
          onClick={() => void handleApply()}
          disabled={busy || !selectedTemplate}
          data-testid="templates-footer-apply"
        >
          Применить в сессию
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
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [expandedByScope, setExpandedByScope] = useState({ personal: new Set(), org: new Set() });

  const scope = toText(activeScope).toLowerCase() === "org" ? "org" : "personal";
  const allTemplates = Array.isArray(templates) ? templates : [];
  const folders = Array.isArray(foldersByScope?.[scope]) ? foldersByScope[scope] : [];
  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);
  const expandedIds = expandedByScope[scope] || new Set();

  const byScope = useMemo(() => {
    const personal = [];
    const org = [];
    allTemplates.forEach((item) => {
      const scopeRaw = toText(item?.scope).toLowerCase();
      if (scopeRaw === "org") org.push(item);
      else personal.push(item);
    });
    return { personal, org };
  }, [allTemplates]);

  const compatibleTemplates = useMemo(
    () => allTemplates.filter((template) => toText(template?.template_type || "bpmn_selection_v1") === "bpmn_fragment_v1"),
    [allTemplates],
  );
  const hiddenIncompatibleCount = Math.max(0, allTemplates.length - compatibleTemplates.length);

  const folderFilteredTemplates = useMemo(() => {
    const currentFolderId = toText(activeFolderId);
    return compatibleTemplates.filter((template) => {
      const templateFolderId = toText(template?.folder_id);
      if (!currentFolderId) return !templateFolderId;
      return templateFolderId === currentFolderId;
    });
  }, [compatibleTemplates, activeFolderId]);

  const searchNeedle = toText(search).toLowerCase();
  const visibleTemplates = useMemo(() => {
    if (!searchNeedle) return folderFilteredTemplates;
    return folderFilteredTemplates.filter((template) => collectSearchText(template).includes(searchNeedle));
  }, [folderFilteredTemplates, searchNeedle]);

  const selectedTemplate = useMemo(() => {
    const current = visibleTemplates.find((template) => toText(template?.id) === toText(selectedTemplateId));
    return current || visibleTemplates[0] || null;
  }, [selectedTemplateId, visibleTemplates]);
  const preview = useMemo(() => buildTemplatePreview(selectedTemplate), [selectedTemplate]);

  useEffect(() => {
    if (!open) {
      setSelectedTemplateId("");
      setSearch("");
      return;
    }
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

  const handleApplyRow = useCallback(async (templateRaw) => {
    const result = await Promise.resolve(onApply?.(templateRaw));
    if (result?.ok) {
      onClose?.();
    }
    return result;
  }, [onApply, onClose]);

  const scopeCounts = useMemo(() => ({
    personal: byScope.personal.filter((t) => toText(t?.template_type || "bpmn_selection_v1") === "bpmn_fragment_v1").length,
    org: byScope.org.filter((t) => toText(t?.template_type || "bpmn_selection_v1") === "bpmn_fragment_v1").length,
  }), [byScope]);

  return (
    <Modal
      open={open}
      title="Шаблоны процесса"
      onClose={onClose}
      cardClassName="w-[calc(100vw-32px)] max-w-[1200px] min-w-[900px]"
      footerClassName="!border-t-0 !p-0"
      footer={(
        <TemplatePickerFooter
          busy={busy}
          selectedTemplate={selectedTemplate}
          onRefresh={onRefresh}
          onClose={onClose}
          onApply={onApply}
          onDelete={onDelete}
        />
      )}
    >
      <div
        className="grid h-[65vh] min-h-[480px] gap-3 overflow-hidden md:grid-cols-[280px_1fr]"
        data-testid="templates-menu-panel"
      >
        {/* Left sidebar: scope + folders */}
        <div className="flex min-h-0 flex-col border-r border-border bg-panel2/25 p-4">
          <div className="mb-3 space-y-2">
            <ScopeButton
              active={scope === "personal"}
              label="Личные"
              count={scopeCounts.personal}
              onClick={() => onScopeChange?.("personal")}
              testId="templates-menu-scope-my"
            />
            {showOrgScope ? (
              <ScopeButton
                active={scope === "org"}
                label="Организация"
                count={scopeCounts.org}
                onClick={() => onScopeChange?.("org")}
                testId="templates-menu-scope-org"
              />
            ) : null}
          </div>

          <label className="mb-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Поиск</div>
            <input
              type="search"
              className="input h-9 w-full"
              placeholder="Найти шаблон, lane, node"
              value={search}
              onChange={(event) => setSearch(String(event.target.value || ""))}
            />
          </label>

          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Папки</div>
              <div className="text-xs text-muted">Фильтр по папкам</div>
            </div>
            <button
              type="button"
              className="secondaryBtn h-8 px-2.5 text-[11px]"
              onClick={() => void handleCreateFolder()}
              disabled={!canCreateFolder}
              title={canCreateFolder ? "Создать папку" : "Only org admins can create shared folders"}
              data-testid="templates-folder-create"
            >
              + Папка
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-panel/70 p-2">
            <button
              type="button"
              className={`mb-2 flex h-8 w-full items-center rounded-lg border px-3 text-left text-sm transition ${
                !toText(activeFolderId)
                  ? "border-accent/60 bg-accentSoft/25 text-fg"
                  : "border-border/70 bg-panel2/40 text-fg hover:border-accent/35 hover:bg-panel2/70"
              }`}
              onClick={() => onSelectFolder?.("")}
              data-testid="templates-folder-unsorted"
            >
              Без папки
            </button>
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
        </div>

        {/* Right area: list + preview */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-panel2/35">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Список шаблонов</div>
              <div className="text-sm text-fg">{visibleTemplates.length} BPMN fragment шаблонов</div>
            </div>
            <div className="flex items-center gap-2">
              {hiddenIncompatibleCount > 0 ? (
                <div className="rounded-full border border-border/70 bg-panel2/50 px-3 py-1 text-[11px] text-muted">
                  Скрыто legacy/hybrid: {hiddenIncompatibleCount}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`min-h-0 overflow-auto p-4 ${selectedTemplate ? "flex-1" : "flex-1"}`}
            data-testid="templates-picker"
          >
            {visibleTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
                {compatibleTemplates.length === 0
                  ? "В текущем scope пока нет BPMN fragment templates."
                  : "По текущему поиску или выбранной папке ничего не найдено."}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleTemplates.map((template) => (
                  <TemplateListRow
                    key={toText(template?.id) || Math.random().toString(36)}
                    template={template}
                    selected={toText(template?.id) === toText(selectedTemplate?.id)}
                    onSelect={(item) => setSelectedTemplateId(toText(item?.id))}
                    onApply={handleApplyRow}
                    busy={busy}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedTemplate ? (
            <div className="border-t border-border bg-panel2/25 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-fg">
                    {toText(selectedTemplate.title || selectedTemplate.name || "Шаблон")}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded border border-border/70 bg-panel px-2 py-0.5 text-fg">{preview.typeLabel}</span>
                    <span>{preview.nodeCount} узл.</span>
                    <span>{preview.edgeCount} flow</span>
                    <span>Обновлён: {preview.updatedAtText}</span>
                    {preview.sourceSessionId ? <span>Session: {preview.sourceSessionId}</span> : null}
                  </div>
                </div>
              </div>
              {preview.nodeNames.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Узлы</div>
                  <div className="flex flex-wrap gap-2">
                    {preview.nodeNames.slice(0, 12).map((name, index) => (
                      <span key={`${name}_${index}`} className="rounded-lg border border-border/70 bg-panel px-2 py-1 text-xs text-fg">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {preview.laneNames.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Lane hints</div>
                  <div className="flex flex-wrap gap-2">
                    {preview.laneNames.map((lane) => (
                      <span key={lane} className="rounded-lg border border-border/70 bg-panel2/60 px-2 py-1 text-xs text-fg">
                        {lane}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 text-xs text-muted">
                После нажатия «Применить в сессию» окно закроется и включится режим размещения фрагмента: ghost под курсором, ЛКМ — вставить, Esc — отмена.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
