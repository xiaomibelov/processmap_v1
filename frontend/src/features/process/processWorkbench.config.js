export const PROCESS_WORKBENCH_CONFIG = {
  tabs: [
    { id: "interview", label: "Interview" },
    { id: "diagram", label: "Diagram" },
    { id: "xml", label: "XML" },
    { id: "doc", label: "DOC" },
  ],
  emptyGuide: {
    title: "Начало работы",
    steps: [
      "Выберите проект и откройте сессию в верхней панели.",
      "Перейдите в `Diagram`: импортируйте BPMN или соберите схему вручную.",
      "Откройте `Interview`: синхронно заполните шаги, лейны и `Text annotation (BPMN)`.",
      "Нажмите `Сгенерировать процесс`, затем проверьте результат и выгрузите `Export BPMN`.",
    ],
  },
  labels: {
    save: "Save",
    importBpmn: "Импорт BPMN",
    exportBpmn: "Export BPMN",
    generate: "Сгенерировать процесс",
    generating: "Генерация…",
    seed: "Seed",
    reset: "Reset",
    clear: "Clear",
    ai: "✦ AI",
  },
  tooltips: {
    saveDisabled: "Доступно в Diagram/XML",
    saveLocal: "Сохранить XML локально",
    saveBackend: "Сохранить XML на backend",
    importNoSession: "Сначала выберите сессию",
    importInterview: "Импорт доступен в BPMN-режиме (Diagram/XML)",
    importReady: "Загрузить BPMN/XML файл",
    export: "Экспорт BPMN в файл",
    seed: "Создать pool + lanes из акторов",
    reset: "Перезагрузить XML с бэка",
    clearLocal: "Удалить локальную версию",
    clearBackend: "Очистить сохранённый XML на backend",
    generateLocal: "recompute доступен только для API-сессий",
    generateLocked: "Сначала настрой акторов",
    generateReady: "recompute → подтянуть BPMN → fit",
    aiInterview: "AI в Interview находится в строках шагов",
    aiLocal: "Подсветить узкие места на узлах BPMN",
    aiBackend: "DeepSeek: обработать следующий элемент BPMN и добавить 5 вопросов",
  },
};

export function normalizeWorkbenchTab(tab) {
  const t = String(tab || "").trim().toLowerCase();
  if (t === "editor") return "diagram";
  if (t === "interview" || t === "diagram" || t === "xml" || t === "doc") return t;
  return "interview";
}

export function getGenerateTooltip({ isLocal, locked }) {
  if (isLocal) return PROCESS_WORKBENCH_CONFIG.tooltips.generateLocal;
  if (locked) return PROCESS_WORKBENCH_CONFIG.tooltips.generateLocked;
  return PROCESS_WORKBENCH_CONFIG.tooltips.generateReady;
}
