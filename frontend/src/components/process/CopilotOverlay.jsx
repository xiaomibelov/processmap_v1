import CopilotCard from "./CopilotCard";

export default function CopilotOverlay() {
  return (
    <div className="copilotOverlay">
      <div style={{ position: "absolute", right: 18, top: 120 }}>
        <CopilotCard
          title="AI Copilot: Обжарка на сковороде"
          questions={[
            "Какое оборудование используется?",
            "Время и температура готовки?",
            "Какие специи или добавки?",
          ]}
        />
      </div>

      <div style={{ position: "absolute", right: 18, top: 320 }}>
        <CopilotCard
          title="AI Copilot: Упаковка блюда"
          questions={[
            "Тип упаковки?",
            "Какой срок годности?",
            "Методы герметизации?",
            "Правила маркировки?",
          ]}
        />
      </div>

      <div style={{ position: "absolute", right: 18, bottom: 34 }}>
        <CopilotCard
          title="AI Copilot: Проверка качества"
          questions={[
            "Какая критическая температура?",
            "На что обращаем внимание?",
            "Что делать, если не проходит?",
          ]}
        />
      </div>
    </div>
  );
}
