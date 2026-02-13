import { useMemo, useState } from "react";

const SITE_TYPES = [
  { value: "dark_kitchen", label: "Dark kitchen" },
  { value: "workshop", label: "Цех" },
  { value: "factory", label: "Фабрика" },
];

const LANGS = [
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

const UNITS_MASS = [
  { value: "g", label: "г" },
  { value: "kg", label: "кг" },
];

const UNITS_TEMP = [
  { value: "C", label: "°C" },
  { value: "F", label: "°F" },
];

const UNITS_TIME = [
  { value: "min", label: "мин" },
  { value: "sec", label: "сек" },
];

const MODES = [
  { value: "quick_skeleton", label: "Быстрый скелет (15–25 минут)" },
  { value: "deep_audit", label: "Глубокий аудит (1–3 часа)" },
];

function str(v) {
  return String(v || "").trim();
}

export default function ProjectWizardModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState("Новый проект");
  const [processName, setProcessName] = useState("");
  const [productFamily, setProductFamily] = useState("General");

  const [siteType, setSiteType] = useState("dark_kitchen");
  const [language, setLanguage] = useState("ru");
  const [mass, setMass] = useState("g");
  const [temp, setTemp] = useState("C");
  const [time, setTime] = useState("min");

  const [haccp, setHaccp] = useState(true);
  const [allergens, setAllergens] = useState(true);
  const [traceability, setTraceability] = useState(true);

  const [kpiSpeed, setKpiSpeed] = useState(true);
  const [kpiQuality, setKpiQuality] = useState(true);
  const [kpiLoss, setKpiLoss] = useState(false);
  const [kpiSafety, setKpiSafety] = useState(true);

  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  const [mode, setMode] = useState("quick_skeleton");
  const [busy, setBusy] = useState(false);

  const resolvedProcessName = useMemo(() => {
    const t = str(processName);
    if (t) return t;
    const tt = str(title);
    return tt || "Process";
  }, [processName, title]);

  if (!open) return null;

  async function submit() {
    if (busy) return;

    const t = str(title);
    if (!t) return;

    setBusy(true);
    try {
      const passport = {
        site_type: siteType,
        language,
        units: { mass, temp, time },
        standards: { haccp, allergens, traceability },
        process_name: resolvedProcessName,
        product_family: str(productFamily) || "General",
        kpi: { speed: !!kpiSpeed, quality: !!kpiQuality, loss: !!kpiLoss, safety: !!kpiSafety },
        owner: { name: str(ownerName), phone: str(ownerPhone), email: str(ownerEmail) },
      };

      await onCreate?.({
        title: t,
        passport,
        mode,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">Создание проекта</div>
          <button className="iconBtn" onClick={onClose} title="Закрыть">✕</button>
        </div>

        <div className="modalBody">
          <div className="grid2">
            <div className="field">
              <div className="label">Название проекта</div>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="field">
              <div className="label">Название процесса (как в цехе)</div>
              <input className="input" value={processName} onChange={(e) => setProcessName(e.target.value)} />
            </div>

            <div className="field">
              <div className="label">Тип площадки</div>
              <select className="select" value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                {SITE_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            <div className="field">
              <div className="label">Язык</div>
              <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            <div className="field">
              <div className="label">Единицы: масса</div>
              <select className="select" value={mass} onChange={(e) => setMass(e.target.value)}>
                {UNITS_MASS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            <div className="field">
              <div className="label">Единицы: температура</div>
              <select className="select" value={temp} onChange={(e) => setTemp(e.target.value)}>
                {UNITS_TEMP.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            <div className="field">
              <div className="label">Единицы: время</div>
              <select className="select" value={time} onChange={(e) => setTime(e.target.value)}>
                {UNITS_TIME.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </div>

            <div className="field">
              <div className="label">Продукт или семейство</div>
              <input className="input" value={productFamily} onChange={(e) => setProductFamily(e.target.value)} />
            </div>
          </div>

          <div className="divider" />

          <div className="grid3">
            <div className="field">
              <div className="label">Стандарты</div>
              <label className="check"><input type="checkbox" checked={haccp} onChange={(e) => setHaccp(e.target.checked)} /> HACCP</label>
              <label className="check"><input type="checkbox" checked={allergens} onChange={(e) => setAllergens(e.target.checked)} /> Аллергены</label>
              <label className="check"><input type="checkbox" checked={traceability} onChange={(e) => setTraceability(e.target.checked)} /> Трассируемость</label>
            </div>

            <div className="field">
              <div className="label">KPI</div>
              <label className="check"><input type="checkbox" checked={kpiSpeed} onChange={(e) => setKpiSpeed(e.target.checked)} /> Скорость</label>
              <label className="check"><input type="checkbox" checked={kpiQuality} onChange={(e) => setKpiQuality(e.target.checked)} /> Качество</label>
              <label className="check"><input type="checkbox" checked={kpiLoss} onChange={(e) => setKpiLoss(e.target.checked)} /> Потери</label>
              <label className="check"><input type="checkbox" checked={kpiSafety} onChange={(e) => setKpiSafety(e.target.checked)} /> Безопасность</label>
            </div>

            <div className="field">
              <div className="label">Владелец процесса</div>
              <input className="input" placeholder="Имя" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              <input className="input" placeholder="Телефон" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              <input className="input" placeholder="Email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
          </div>

          <div className="divider" />

          <div className="field">
            <div className="label">Режим старта</div>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <div style={{ opacity: 0.7, marginTop: 6 }}>
              После создания проекта мы сразу создадим первую сессию выбранного режима.
            </div>
          </div>
        </div>

        <div className="modalFooter">
          <button className="secondaryBtn" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="primaryBtn" onClick={submit} disabled={busy}>
            {busy ? "Создаю..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
