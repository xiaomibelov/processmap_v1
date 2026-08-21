import {
  SITE_TYPES,
  LANGS,
  UNITS_MASS,
  UNITS_TEMP,
  UNITS_TIME,
} from "./constants";

function setPassport(setModel, patch) {
  setModel((prev) => ({
    ...prev,
    passport: {
      ...(prev.passport || {}),
      ...patch,
    },
  }));
}

function setPassportUnits(setModel, patch) {
  setModel((prev) => ({
    ...prev,
    passport: {
      ...(prev.passport || {}),
      units: {
        ...((prev.passport && prev.passport.units) || {}),
        ...patch,
      },
    },
  }));
}

function setPassportStandards(setModel, patch) {
  setModel((prev) => ({
    ...prev,
    passport: {
      ...(prev.passport || {}),
      standards: {
        ...((prev.passport && prev.passport.standards) || {}),
        ...patch,
      },
    },
  }));
}

function setPassportKpi(setModel, patch) {
  setModel((prev) => ({
    ...prev,
    passport: {
      ...(prev.passport || {}),
      kpi: {
        ...((prev.passport && prev.passport.kpi) || {}),
        ...patch,
      },
    },
  }));
}

function setPassportOwner(setModel, patch) {
  setModel((prev) => ({
    ...prev,
    passport: {
      ...(prev.passport || {}),
      owner: {
        ...((prev.passport && prev.passport.owner) || {}),
        ...patch,
      },
    },
  }));
}

export default function ProjectWizardForm({ model, setModel }) {
  const passport = model.passport || {};
  const units = passport.units || {};
  const standards = passport.standards || {};
  const kpi = passport.kpi || {};
  const owner = passport.owner || {};

  return (
    <div>
      <div className="grid2">
        <div className="field">
          <div className="label">Название проекта</div>
          <input
            className="input"
            value={model.title || ""}
            onChange={(e) => setModel((p) => ({ ...p, title: e.target.value }))}
          />
        </div>

        <div className="field">
          <div className="label">Название процесса (как в цехе)</div>
          <input
            className="input"
            value={passport.process_name || ""}
            onChange={(e) => setPassport(setModel, { process_name: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">Название первой сессии</div>
          <input
            className="input"
            placeholder="Напр.: Интервью — Приготовление бульона"
            value={model.first_session_title || ""}
            onChange={(e) => setModel((p) => ({ ...p, first_session_title: e.target.value }))}
          />
        </div>

        <div className="field">
          <div className="label">Тип площадки</div>
          <select
            className="input"
            value={passport.site_type || "dark_kitchen"}
            onChange={(e) => setPassport(setModel, { site_type: e.target.value })}
          >
            {SITE_TYPES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Язык</div>
          <select
            className="input"
            value={passport.language || "ru"}
            onChange={(e) => setPassport(setModel, { language: e.target.value })}
          >
            {LANGS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Единицы: масса</div>
          <select
            className="input"
            value={units.mass || "g"}
            onChange={(e) => setPassportUnits(setModel, { mass: e.target.value })}
          >
            {UNITS_MASS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Единицы: температура</div>
          <select
            className="input"
            value={units.temp || "C"}
            onChange={(e) => setPassportUnits(setModel, { temp: e.target.value })}
          >
            {UNITS_TEMP.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Единицы: время</div>
          <select
            className="input"
            value={units.time || "min"}
            onChange={(e) => setPassportUnits(setModel, { time: e.target.value })}
          >
            {UNITS_TIME.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="label">Продукт или семейство</div>
          <input
            className="input"
            value={passport.product_family || ""}
            onChange={(e) => setPassport(setModel, { product_family: e.target.value })}
          />
        </div>
      </div>

      <div className="divider" />

      <div className="grid3">
        <div className="field">
          <div className="label">Стандарты</div>
          <label className="check">
            <input
              type="checkbox"
              checked={!!standards.haccp}
              onChange={(e) => setPassportStandards(setModel, { haccp: e.target.checked })}
            />
            HACCP
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!standards.allergens}
              onChange={(e) => setPassportStandards(setModel, { allergens: e.target.checked })}
            />
            Аллергены
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!standards.traceability}
              onChange={(e) => setPassportStandards(setModel, { traceability: e.target.checked })}
            />
            Трассируемость
          </label>
        </div>

        <div className="field">
          <div className="label">KPI</div>
          <label className="check">
            <input
              type="checkbox"
              checked={!!kpi.speed}
              onChange={(e) => setPassportKpi(setModel, { speed: e.target.checked })}
            />
            Скорость
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!kpi.quality}
              onChange={(e) => setPassportKpi(setModel, { quality: e.target.checked })}
            />
            Качество
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!kpi.loss}
              onChange={(e) => setPassportKpi(setModel, { loss: e.target.checked })}
            />
            Потери
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!kpi.safety}
              onChange={(e) => setPassportKpi(setModel, { safety: e.target.checked })}
            />
            Безопасность
          </label>
        </div>

        <div className="field">
          <div className="label">Владелец процесса</div>
          <input
            className="input"
            placeholder="Имя"
            value={owner.name || ""}
            onChange={(e) => setPassportOwner(setModel, { name: e.target.value })}
          />
          <div style={{ height: 8 }} />
          <input
            className="input"
            placeholder="Телефон"
            value={owner.phone || ""}
            onChange={(e) => setPassportOwner(setModel, { phone: e.target.value })}
          />
          <div style={{ height: 8 }} />
          <input
            className="input"
            placeholder="Email"
            value={owner.email || ""}
            onChange={(e) => setPassportOwner(setModel, { email: e.target.value })}
          />
        </div>
      </div>

    </div>
  );
}
