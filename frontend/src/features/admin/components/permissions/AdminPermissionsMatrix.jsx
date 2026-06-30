import { useMemo, useState } from "react";
import SectionCard from "../common/SectionCard";
import { useAdminQuery } from "../../hooks/useAdminQuery";
import { useAdminMutation } from "../../hooks/useAdminMutation";
import {
  apiAdminListPermissionPrincipals,
  apiAdminListMatrixPermissions,
  apiAdminPatchMatrixPermission,
  apiAdminBulkMatrixPermissions,
} from "../../api/adminApi";
import { toText } from "../../adminUtils";

const ENTITY_TYPES = [
  { id: "users", label: "Users" },
  { id: "sessions", label: "Sessions" },
  { id: "folders", label: "Folders" },
  { id: "workspaces", label: "Workspaces" },
  { id: "analytics", label: "Analytics" },
];

const PRESETS = ["none", "viewer", "editor", "manager", "admin"];

function permissionKeys(entityType) {
  if (entityType === "analytics") {
    return ["dk_view", "dk_export", "fk_view", "fk_export", "manage_dashboards"];
  }
  if (entityType === "users" || entityType === "folders" || entityType === "workspaces") {
    return ["view", "edit", "manage", "admin"];
  }
  return ["view", "edit", "manage"];
}

function presetPermissions(entityType, preset) {
  const keys = permissionKeys(entityType);
  const all = Object.fromEntries(keys.map((k) => [k, false]));
  if (preset === "none") return all;
  if (entityType === "analytics") {
    all.dk_view = true;
    all.fk_view = true;
    if (preset === "viewer") return all;
    all.dk_export = true;
    all.fk_export = true;
    if (preset === "editor") return all;
    all.manage_dashboards = true;
    if (preset === "manager") return all;
    return all;
  }
  all.view = true;
  if (preset === "viewer") return all;
  all.edit = true;
  if (preset === "editor") return all;
  all.manage = true;
  if (preset === "manager") return all;
  if (keys.includes("admin")) all.admin = true;
  return all;
}

function detectPreset(entityType, perms) {
  if (!perms || typeof perms !== "object") return "none";
  for (const preset of PRESETS) {
    const target = presetPermissions(entityType, preset);
    const keys = permissionKeys(entityType);
    if (keys.every((k) => !!perms[k] === !!target[k])) return preset;
  }
  return "custom";
}

function formatPreset(preset) {
  if (preset === "none") return "None";
  if (preset === "custom") return "Custom";
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

function presetClass(preset) {
  if (preset === "admin") return "bg-rose-100 text-rose-700 ring-rose-200";
  if (preset === "manager") return "bg-amber-100 text-amber-700 ring-amber-200";
  if (preset === "editor") return "bg-blue-100 text-blue-700 ring-blue-200";
  if (preset === "viewer") return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  if (preset === "custom") return "bg-violet-100 text-violet-700 ring-violet-200";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function PrincipalBadge({ kind }) {
  const map = { role: "Role", user: "User", group: "Group" };
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
      {map[kind] || kind}
    </span>
  );
}

export default function AdminPermissionsMatrix({ orgId = "" }) {
  const [view, setView] = useState("simple");
  const [advancedEntityType, setAdvancedEntityType] = useState("sessions");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState("");
  const [notice, setNotice] = useState("");

  const oid = toText(orgId);

  const { data: principalsData, isLoading: principalsLoading } = useAdminQuery({
    queryKey: ["permissionPrincipals", oid],
    fetcher: () => apiAdminListPermissionPrincipals(),
    enabled: Boolean(oid),
  });

  const matrixParams = useMemo(() => {
    if (view === "advanced") return { entity_type: advancedEntityType };
    return {};
  }, [view, advancedEntityType]);

  const { data: matrixData, isLoading: matrixLoading } = useAdminQuery({
    queryKey: ["matrixPermissions", oid, view, advancedEntityType],
    fetcher: () => apiAdminListMatrixPermissions(matrixParams),
    enabled: Boolean(oid),
  });

  const principals = principalsData?.data?.items || [];
  const matrixItems = matrixData?.data?.items || [];
  const advancedEntities = matrixData?.data?.entities || [];

  const permissionsByPrincipal = useMemo(() => {
    const map = {};
    matrixItems.forEach((p) => {
      map[toText(p.principal_id)] = p.permissions || {};
    });
    return map;
  }, [matrixItems]);

  const patchMutation = useAdminMutation({
    mutationFn: ({ principalType, principalId, entityType, entityId, permissions }) =>
      apiAdminPatchMatrixPermission(principalType, principalId, entityType, entityId, { permissions }),
    invalidateKeys: [["matrixPermissions", oid]],
    onSuccess: () => {
      setNotice("Сохранено");
      setTimeout(() => setNotice(""), 1500);
    },
    onError: (err) => setNotice(String(err?.message || "Ошибка сохранения")),
  });

  const bulkMutation = useAdminMutation({
    mutationFn: (updates) => apiAdminBulkMatrixPermissions(updates),
    invalidateKeys: [["matrixPermissions", oid]],
    onSuccess: () => {
      setNotice("Bulk применён");
      setSelectedIds(new Set());
      setTimeout(() => setNotice(""), 1500);
    },
    onError: (err) => setNotice(String(err?.message || "Ошибка bulk")),
  });

  const visibleColumns = useMemo(() => {
    if (view === "advanced") {
      return advancedEntities.length
        ? advancedEntities.map((e) => ({ entityType: advancedEntityType, entityId: toText(e.id), label: toText(e.name || e.id) }))
        : [];
    }
    return ENTITY_TYPES.map((et) => ({ entityType: et.id, entityId: "*", label: et.label }));
  }, [view, advancedEntityType, advancedEntities]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(checked) {
    if (checked) setSelectedIds(new Set(principals.map((p) => toText(p.principal_id))));
    else setSelectedIds(new Set());
  }

  function applyBulk(preset) {
    const updates = [];
    principals
      .filter((p) => selectedIds.has(toText(p.principal_id)))
      .forEach((p) => {
        visibleColumns.forEach((col) => {
          updates.push({
            principal_type: p.principal_type,
            principal_id: toText(p.principal_id),
            entity_type: col.entityType,
            entity_id: col.entityId,
            permissions: presetPermissions(col.entityType, preset),
          });
        });
      });
    if (updates.length) bulkMutation.mutate(updates);
  }

  function handleCellChange(principal, col, preset) {
    if (preset === "custom") return;
    patchMutation.mutate({
      principalType: principal.principal_type,
      principalId: toText(principal.principal_id),
      entityType: col.entityType,
      entityId: col.entityId,
      permissions: presetPermissions(col.entityType, preset),
    });
  }

  function handleToggleChange(principal, entityType, key) {
    const current = permissionsByPrincipal[toText(principal.principal_id)]?.[entityType] || {};
    const next = { ...current, [key]: !current[key] };
    patchMutation.mutate({
      principalType: principal.principal_type,
      principalId: toText(principal.principal_id),
      entityType,
      entityId: "*",
      permissions: next,
    });
  }

  const isLoading = principalsLoading || matrixLoading;

  return (
    <SectionCard eyebrow="Permissions" title="Access Matrix" subtitle="Users, groups and roles × objects">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("simple")}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${view === "simple" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Simplified
          </button>
          <button
            type="button"
            onClick={() => setView("advanced")}
            className={`rounded-lg px-3 py-1 text-xs font-medium ${view === "advanced" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Advanced
          </button>
          {view === "advanced" ? (
            <select
              className="input h-7 min-h-0 py-0 text-xs"
              value={advancedEntityType}
              onChange={(e) => setAdvancedEntityType(e.target.value)}
            >
              {ENTITY_TYPES.map((et) => (
                <option key={et.id} value={et.id}>{et.label}</option>
              ))}
            </select>
          ) : null}
        </div>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-medium uppercase text-slate-500">Bulk:</span>
            {PRESETS.filter((p) => p !== "none").map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyBulk(p)}
                className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
              >
                Set {formatPreset(p)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyBulk("none")}
              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {notice ? <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div> : null}
      {isLoading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}

      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={principals.length > 0 && selectedIds.size === principals.length}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="px-2 py-1.5 font-medium">Principal</th>
              {visibleColumns.map((col) => (
                <th key={`${col.entityType}-${col.entityId}`} className="px-2 py-1.5 font-medium min-w-[100px]">{col.label}</th>
              ))}
              <th className="px-2 py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {principals.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 3} className="px-2 py-6 text-center text-slate-500">No principals found.</td>
              </tr>
            ) : null}
            {principals.map((p) => {
              const pid = toText(p.principal_id);
              const isExpanded = expandedId === pid && view === "simple";
              const perms = permissionsByPrincipal[pid] || {};
              return (
                <>
                  <tr key={pid} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pid)}
                        onChange={() => toggleSelected(pid)}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <PrincipalBadge kind={p.kind} />
                        <div>
                          <div className="font-medium text-slate-950">{toText(p.name) || pid}</div>
                          {p.email ? <div className="text-[10px] text-slate-500">{p.email}</div> : null}
                        </div>
                      </div>
                    </td>
                    {visibleColumns.map((col) => {
                      const cellPerms = perms[col.entityType === "*" ? advancedEntityType : col.entityType];
                      const preset = detectPreset(col.entityType, cellPerms);
                      return (
                        <td key={`${pid}-${col.entityType}-${col.entityId}`} className="px-2 py-2">
                          <select
                            value={preset}
                            onChange={(e) => handleCellChange(p, col, e.target.value)}
                            disabled={patchMutation.isPending}
                            className={`h-6 min-h-0 rounded px-1 py-0 text-[10px] font-medium outline-none ring-1 ${presetClass(preset)}`}
                          >
                            <option value="custom" disabled={preset !== "custom"}>{formatPreset(preset)}</option>
                            {PRESETS.map((opt) => (
                              <option key={opt} value={opt}>{formatPreset(opt)}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right">
                      {view === "simple" ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId((cur) => (cur === pid ? "" : pid))}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          {isExpanded ? "Hide" : "Edit"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-50 bg-slate-50/50">
                      <td colSpan={visibleColumns.length + 3} className="px-2 py-2">
                        <div className="space-y-2">
                          {ENTITY_TYPES.map((et) => {
                            const keys = permissionKeys(et.id);
                            const current = perms[et.id] || {};
                            return (
                              <div key={et.id} className="flex flex-wrap items-center gap-2">
                                <span className="w-24 text-[10px] font-medium uppercase text-slate-500">{et.label}</span>
                                {keys.map((key) => (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleToggleChange(p, et.id, key)}
                                    disabled={patchMutation.isPending}
                                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${current[key] ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                                  >
                                    {key.replace(/_/g, " ")}
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
