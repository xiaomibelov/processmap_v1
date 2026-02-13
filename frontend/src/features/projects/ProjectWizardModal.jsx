import { useMemo, useState } from "react";
import Modal from "../../shared/ui/Modal";
import { str } from "./constants";
import ProjectWizardForm from "./ProjectWizardForm";

function defaultModel() {
  return {
    title: "Новый проект",
    mode: "quick_skeleton",
    passport: {
      process_name: "",
      site_type: "dark_kitchen",
      language: "ru",
      units: { mass: "g", temp: "C", time: "min" },
      standards: { haccp: true, allergens: true, traceability: true },
      kpi: { speed: true, quality: true, loss: false, safety: true },
      product_family: "General",
      owner: { name: "", phone: "", email: "" },
    },
  };
}

export default function ProjectWizardModal({ open, onClose, onCreate }) {
  const [model, setModel] = useState(defaultModel());
  const [busy, setBusy] = useState(false);

  const resolved = useMemo(() => {
    const title = str(model.title);
    const p = model.passport || {};
    const process = str(p.process_name) || title || "Process";
    return { title, process };
  }, [model]);

  async function submit() {
    if (busy) return;
    if (!resolved.title) return;

    setBusy(true);
    try {
      const p0 = model.passport || {};
      const passport = {
        ...p0,
        process_name: resolved.process,
        product_family: str(p0.product_family) || "General",
        units: p0.units || { mass: "g", temp: "C", time: "min" },
        standards: p0.standards || { haccp: true, allergens: true, traceability: true },
        kpi: p0.kpi || { speed: true, quality: true, loss: false, safety: true },
        owner: p0.owner || { name: "", phone: "", email: "" },
      };

      await onCreate?.({
        title: resolved.title,
        passport,
        mode: str(model.mode) || "quick_skeleton",
      });
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button className="secondaryBtn" onClick={onClose} disabled={busy}>
        Отмена
      </button>
      <button className="primaryBtn" onClick={submit} disabled={busy}>
        {busy ? "Создаю..." : "Создать"}
      </button>
    </>
  );

  return (
    <Modal open={open} title="Создание проекта" onClose={onClose} footer={footer}>
      <ProjectWizardForm model={model} setModel={setModel} />
    </Modal>
  );
}
