import { useMemo, useState } from "react";
import { uid } from "../../lib/ids";

function normalizeRoleId(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  return v
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 32);
}

export default function ActorsSetup({ draft, onSaveActors }) {
  const [label, setLabel] = useState("");
  const [roles, setRoles] = useState(Array.isArray(draft.roles) ? draft.roles : []);
  const [startRole, setStartRole] = useState(typeof draft.start_role === "string" ? draft.start_role : "");

  const options = useMemo(
    () => roles.map((r) => ({ value: r.role_id, label: r.label })),
    [roles]
  );

  function addRole() {
    const v = label.trim();
    if (!v) return;

    const base = normalizeRoleId(v);
    let role_id = base || `role_${roles.length + 1}`;
    if (roles.some((r) => r.role_id === role_id)) {
      role_id = `${role_id}_${uid("r").slice(-4)}`;
    }

    const next = [...roles, { role_id, label: v }];
    setRoles(next);
    if (!startRole) setStartRole(role_id);
    setLabel("");
  }

  function removeRole(role_id) {
    const next = roles.filter((r) => r.role_id !== role_id);
    setRoles(next);
    if (startRole === role_id) setStartRole(next[0]?.role_id || "");
  }

  const canStart = roles.length > 0 && !!startRole;

  return (
    <div className="panel">
      <div className="panelHead">Actors-first</div>
      <div className="panelBody">
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Настройка акторов</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Добавь роли (cook_1, hot_shop_operator и т.д.) и выбери <strong>start_role</strong>.
          Пока это не заполнено — интервью/заметки блокируются.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Роли</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Напр: Повар 1 / Горячий цех"
                className="textarea"
                style={{ minHeight: 40, height: 40, resize: "none" }}
              />
              <button className="btn" onClick={addRole} disabled={!label.trim()}>
                Добавить
              </button>
            </div>

            <div className="hr" />

            {roles.length === 0 ? (
              <div className="small muted">Пока ролей нет.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {roles.map((r) => (
                  <div key={r.role_id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>{r.label}</div>
                    <div className="small muted">({r.role_id})</div>
                    <div style={{ flex: 1 }} />
                    <button className="btn" onClick={() => removeRole(r.role_id)}>
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Start role</div>

            <select
              className="textarea"
              style={{ minHeight: 40, height: 40, resize: "none" }}
              value={startRole}
              onChange={(e) => setStartRole(e.target.value)}
              disabled={roles.length === 0}
            >
              <option value="">— выбрать —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.value})
                </option>
              ))}
            </select>

            <div className="small muted" style={{ marginTop: 8 }}>
              Это актор, который начинает процесс.
            </div>
          </div>

          <button
            className="primaryBtn"
            disabled={!canStart}
            onClick={() => onSaveActors({ roles, start_role: startRole })}
          >
            Начать интервью
          </button>

          {!canStart ? (
            <div className="small muted">
              Нужны минимум 1 роль и выбранный start_role.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
