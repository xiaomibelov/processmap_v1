import { useEffect, useMemo, useState } from "react";

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

export default function ActorsSetup({ draft, onSaveActors }) {
  const draftRoles = useMemo(() => ensureArray(draft?.roles).map((x) => String(x || "").trim()).filter(Boolean), [draft]);
  const draftStart = String(draft?.start_role || "").trim();

  const [roleInput, setRoleInput] = useState("");
  const [roles, setRoles] = useState(draftRoles);
  const [startRole, setStartRole] = useState(draftStart);
  const [err, setErr] = useState("");

  useEffect(() => {
    setRoles(draftRoles);
    setStartRole(draftStart);
    setErr("");
  }, [draftRoles, draftStart]);

  function addRole() {
    const v = String(roleInput || "").trim();
    if (!v) return;
    setRoles((prev) => {
      const next = ensureArray(prev).slice();
      if (!next.includes(v)) next.push(v);
      return next;
    });
    if (!startRole) setStartRole(v);
    setRoleInput("");
    setErr("");
  }

  function removeRole(name) {
    const n = String(name || "");
    setRoles((prev) => ensureArray(prev).filter((x) => x !== n));
    if (startRole === n) setStartRole("");
  }

  const canStart = roles.length >= 1 && !!startRole;

  async function startInterview() {
    setErr("");
    if (!canStart) {
      setErr("Нужны минимум 1 роль и выбранный start_role.");
      return;
    }
    await onSaveActors?.({ roles, start_role: startRole });
  }

  return (
    <div className="card">
      <div className="paneTitle">Actors-first</div>
      <div className="muted" style={{ marginTop: 6 }}>
        Добавь роли (cook_1, hot_shop_operator и т.д.) и выбери start_role. Пока это не заполнено — интервью/заметки блокируются.
      </div>

      {err ? (
        <div className="badge err" style={{ marginTop: 10 }}>
          {err}
        </div>
      ) : null}

      <div className="cardSection" style={{ marginTop: 12 }}>
        <div className="sectionTitle">Роли</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="input"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            placeholder="Напр: Повар 1 / Горячий цех"
            onKeyDown={(e) => {
              if (e.key === "Enter") addRole();
            }}
          />
          <button className="secondaryBtn smallBtn" onClick={addRole}>
            Добавить
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {roles.length === 0 ? (
            <div className="muted">Пока ролей нет.</div>
          ) : (
            <div className="chips">
              {roles.map((r) => (
                <div className="chip" key={r}>
                  <b>{r}</b> <span className="muted">(role_{roles.indexOf(r) + 1})</span>
                  <button className="miniDanger" onClick={() => removeRole(r)} title="Удалить роль">
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="cardSection" style={{ marginTop: 14 }}>
        <div className="sectionTitle">Start role</div>
        <select className="select" value={startRole} onChange={(e) => setStartRole(e.target.value)} disabled={roles.length === 0} style={{ marginTop: 8 }}>
          <option value="">— выбрать —</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="muted" style={{ marginTop: 6 }}>
          Это актор, который начинает процесс.
        </div>
      </div>

      <button className="primaryBtn" onClick={startInterview} disabled={!canStart} style={{ marginTop: 14, width: "100%" }}>
        Начать интервью
      </button>

      <div className="muted" style={{ marginTop: 8 }}>
        Нужны минимум 1 роль и выбранный start_role.
      </div>
    </div>
  );
}
