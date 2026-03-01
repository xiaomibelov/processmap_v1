import { useMemo, useState } from "react";
import SidebarSection from "./SidebarSection";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function ActorsSection({
  open,
  onToggle,
  roles,
  laneCounts,
  sourceLabel,
  startRoleValue,
  onStartRoleChange,
  startRoleBusy,
  startRoleErr,
  disabled,
}) {
  const [query, setQuery] = useState("");
  const [pendingStartRole, setPendingStartRole] = useState("");
  const list = asArray(roles);
  const q = String(query || "").trim().toLowerCase();
  const filtered = useMemo(
    () => (!q ? list : list.filter((item) => String(item?.label || "").toLowerCase().includes(q))),
    [list, q],
  );
  const summary = `${list.length} акторов${sourceLabel ? ` · ${sourceLabel}` : ""}`;
  const selectedStartRole = String(pendingStartRole || startRoleValue || "");

  function applyStartRole() {
    void onStartRoleChange?.(selectedStartRole);
  }

  return (
    <SidebarSection
      sectionId="actors"
      title="Акторы"
      summary={summary}
      open={open}
      onToggle={onToggle}
      badge={list.length ? "LANES" : ""}
    >
      {list.length > 8 ? (
        <input
          className="input h-8 text-xs"
          placeholder="Поиск актора..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}

      <div className="mt-2 max-h-40 space-y-1 overflow-auto pr-1">
        {filtered.length ? (
          filtered.map((item, idx) => {
            const roleId = String(item?.role_id || "");
            const countRaw = Number(laneCounts?.[roleId]);
            const count = Number.isFinite(countRaw) && countRaw >= 0 ? Math.round(countRaw) : 0;
            return (
              <div key={`${item.role_id || "role"}_${idx}`} className="sidebarActorRow">
                <div className="sidebarActorMain">
                  <span className="sidebarActorIndex">{idx + 1}.</span>
                  <span className="sidebarActorName truncate">{item.label}</span>
                </div>
                <span className={`sidebarActorCount ${count > 0 ? "" : "isZero"}`} title={`Элементов BPMN в lane: ${count}`}>
                  {count}
                </span>
              </div>
            );
          })
        ) : (
          <div className="sidebarEmptyHint">
            Акторы не найдены.
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-[11px] font-medium text-muted">Стартовый актор</div>
        <div className="flex items-center gap-1.5">
          <select
            className="input h-8 text-xs"
            value={selectedStartRole}
            onChange={(event) => {
              setPendingStartRole(String(event.target.value || ""));
            }}
            disabled={!!disabled || !!startRoleBusy}
          >
            <option value="">Не выбран</option>
            {list.map((item) => (
              <option key={item.role_id} value={item.role_id}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondaryBtn h-8 px-2 text-[11px]"
            disabled={!!disabled || !!startRoleBusy || selectedStartRole === String(startRoleValue || "")}
            onClick={applyStartRole}
          >
            {startRoleBusy ? "..." : "Set"}
          </button>
        </div>
        {startRoleErr ? <div className="mt-1 text-[11px] text-danger">{startRoleErr}</div> : null}
      </div>
    </SidebarSection>
  );
}
