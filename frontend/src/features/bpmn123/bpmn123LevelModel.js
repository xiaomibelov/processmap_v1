export const BPMN123_LEVEL_1_ID = "bpmn1-level1-first-process";

export const BPMN123_LEVELS_BY_ID = {
  [BPMN123_LEVEL_1_ID]: {
    id: BPMN123_LEVEL_1_ID,
    tier: "BPMN 1",
    title: "BPMN 1 — Первый процесс",
    progressLabel: "0%",
    storyTitle: "Ситуация",
    story:
      "Менеджер просит описать простой процесс обработки заявки. Нужно собрать линейную BPMN-схему без ветвлений и дополнительных событий.",
    mentorMessage:
      "Начни с простого пути: старт, три задачи обработки заявки и финальное событие. Проверку и подсказки подключим в следующих контурах.",
    targetProcess: "Start Event → Принять заявку → Проверить данные → Подготовить ответ → End Event",
    objectives: [
      "Добавить Start Event",
      "Добавить задачу “Принять заявку”",
      "Добавить задачу “Проверить данные”",
      "Добавить задачу “Подготовить ответ”",
      "Добавить End Event",
      "Соединить элементы в правильном порядке",
    ],
  },
};

export function getBpmn123Level(levelId) {
  const key = String(levelId || "").trim();
  return BPMN123_LEVELS_BY_ID[key] || BPMN123_LEVELS_BY_ID[BPMN123_LEVEL_1_ID];
}
