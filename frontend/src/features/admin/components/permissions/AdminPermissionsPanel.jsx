import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "../common/SectionCard";
import AdminTabs from "../common/AdminTabs";
import {
  apiAdminListPermissions,
  apiAdminListPermissionEntities,
  apiAdminPatchPermission,
  apiAdminBulkPermissions,
} from "../../api/adminApi";
import { AdminPermissionToggles, AdminPermissionSummary, usePermissionKeys } from "./AdminPermissionToggles";
import AdminPermissionsMatrix from "./AdminPermissionsMatrix";
import { toText } from "../../adminUtils";

const ENTITY_TABS = [
  { id: "matrix", label: "Matrix" },
  { id: "sessions", label: "Sessions" },
  { id: "folders", label: "Folders" },
  { id: "workspaces", label: "Workspaces" },
  { id: "analytics", label: "Analytics" },
];

const ENTITY_TYPES = ["users", "sessions", "folders", "workspaces", "analytics"];
const DEFAULT_ENTITY_ID = "*";
const ROLES = ["org_owner", "org_admin", "editor", "project_manager", "org_viewer", "auditor"];

function buildRolePermissions(defaults = {}, overrides = []) {
  const out = {};
  ROLES.forEach((role) => {
    out[role] = { ...(defaults[role] || {}) };
  });
  overrides.forEach((row) => {
    if (row.role && out[row.role]) {
      out[row.role] = { ...out[row.role], ...row.permissions };
    }
  });
  return out;
}

export default function AdminPermissionsPanel({ orgId = "" }) {
  const [activeTab, setActiveTab] = useState("matrix");
  const [loading, setLoading] = useState(false);
  const [defaults, setDefaults] = useState({});
  const [overrides, setOverrides] = useState({});
  const [entities, setEntities] = useState([]);
  const [entityOverrides, setEntityOverrides] = useState({});
  const [expanded, setExpanded] = useState({});
  const [notice, setNotice] = useState("");

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    const res = await apiAdminListPermissions();
    setLoading(false);
    if (!res.ok) return;
    setDefaults(res.data?.defaults || {});
    setOverrides(res.data?.overrides || {});
  }, []);

  const loadEntities = useCallback(async (entityType) => {
    if (entityType === "matrix") return;
    setLoading(true);
    const res = await apiAdminListPermissionEntities({ entity_type: entityType });
    setLoading(false);
    if (!res.ok) return;
    setEntities(res.data?.entities || []);
    const ov = {};
    Object.entries(res.data?.overrides || {}).forEach(([key, perms]) => {
      const [entityId, role] = key.split(":", 2);
      if (!ov[entityId]) ov[entityId] = {};
      ov[entityId][role] = perms;
    });
    setEntityOverrides(ov);
  }, []);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    void loadEntities(activeTab);
  }, [activeTab, loadEntities]);

  async function handleDefaultChange(entityType, role, perms) {
    const res = await apiAdminPatchPermission(entityType, DEFAULT_ENTITY_ID, { role, permissions: perms });
    if (!res.ok) {
      setNotice(String(res.error || "Ошибка сохранения"));
      return;
    }
    setOverrides((prev) => {
      const next = { ...prev };
      if (!next[entityType]) next[entityType] = [];
      const idx = next[entityType].findIndex((r) => r.entity_id === DEFAULT_ENTITY_ID && r.role === role);
      const row = { org_id: orgId, entity_type: entityType, entity_id: DEFAULT_ENTITY_ID, role, permissions: perms };
      if (idx >= 0) next[entityType][idx] = row;
      else next[entityType].push(row);
      return next;
    });
    setNotice("Сохранено");
    setTimeout(() => setNotice(""), 1500);
  }

  async function handleEntityChange(entityType, entityId, role, perms) {
    const res = await apiAdminPatchPermission(entityType, entityId, { role, permissions: perms });
    if (!res.ok) {
      setNotice(String(res.error || "Ошибка сохранения"));
      return;
    }
    setEntityOverrides((prev) => ({
      ...prev,
      [entityId]: { ...(prev[entityId] || {}), [role]: perms },
    }));
    setNotice("Сохранено");
    setTimeout(() => setNotice(""), 1500);
  }

  const matrixData = useMemo(() => {
    return ENTITY_TYPES.map((etype) => ({
      entity_type: etype,
      rolePermissions: buildRolePermissions(defaults[etype], overrides[etype] || []),
    }));
  }, [defaults, overrides]);

  function toggleExpanded(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-3">
      <AdminTabs tabs={ENTITY_TABS} activeTab={activeTab} onChange={setActiveTab} />
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div> : null}
      {loading ? <div className="text-xs text-slate-500">Загрузка…</div> : null}

      {activeTab === "matrix" ? (
        <AdminPermissionsMatrix orgId={orgId} />
      ) : (
        <AdminPermissionsEntitySection
          entityType={activeTab}
          defaults={defaults[activeTab] || {}}
          entities={entities}
          entityOverrides={entityOverrides}
          expanded={expanded}
          onToggle={toggleExpanded}
          onChange={handleEntityChange}
        />
      )}
    </div>
  );
}

function AdminPermissionsEntitySection({
  entityType,
  defaults = {},
  entities = [],
  entityOverrides = {},
  expanded = {},
  onToggle,
  onChange,
}) {
  const keys = usePermissionKeys(entityType);

  return (
    <SectionCard title={`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Permissions`} subtitle="Override default access per entity" eyebrow="Access">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-white text-left text-[10px] uppercase tracking-[0.14em] text-slate-400">
            <tr>
              <th className="px-2 py-1.5 font-medium">Name</th>
              {ROLES.map((role) => (
                <th key={role} className="px-2 py-1.5 font-medium">{role.replace("org_", "").replace("_", " ")}</th>
              ))}
              <th className="px-2 py-1.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const id = toText(entity?.id);
              const name = toText(entity?.name || id);
              const isExpanded = expanded[id];
              return (
                <>
                  <tr key={id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onToggle(id)}>
                    <td className="px-2 py-2 font-medium text-slate-950">{name}</td>
                    {ROLES.map((role) => {
                      const perms = entityOverrides[id]?.[role] || defaults[role] || {};
                      return (
                        <td key={role} className="px-2 py-2">
                          <AdminPermissionSummary entityType={entityType} permissions={{ [role]: perms }} />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      <button type="button" className="text-xs font-medium text-emerald-700 hover:underline">
                        {isExpanded ? "Hide" : "Edit"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-50 bg-slate-50/50">
                      <td colSpan={ROLES.length + 2} className="px-2 py-2">
                        <div className="space-y-2">
                          {ROLES.map((role) => (
                            <div key={role} className="flex flex-wrap items-center gap-2">
                              <span className="w-20 text-[10px] font-medium uppercase text-slate-500">{role.replace("org_", "")}</span>
                              <AdminPermissionToggles
                                entityType={entityType}
                                rolePermissions={{ [role]: entityOverrides[id]?.[role] || defaults[role] || {} }}
                                onChange={(_, perms) => onChange(entityType, id, role, perms)}
                                size="xs"
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
            {!entities.length ? (
              <tr>
                <td colSpan={ROLES.length + 2} className="px-2 py-6 text-center text-xs text-slate-500">No entities found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
