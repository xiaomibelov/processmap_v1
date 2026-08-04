/**
 * P-1 D3: view-model экрана мёртвой сессии (терминальный 404).
 * Чистая функция — без React (тестируется node --test).
 */

function toText(value) {
  return String(value || "").trim();
}

const SOURCE_LABELS = {
  presence: "синхронизация присутствия",
  remote_poll: "фоновая синхронизация",
  session_loader: "загрузка сессии",
  save: "сохранение",
  unknown: "запрос к серверу",
};

/**
 * @param {Object} args
 * @param {Object|null} args.info — запись реестра sessionLiveness ({sessionId, source, error, at})
 * @param {string} [args.sessionTitle]
 * @param {boolean} [args.canCreate]
 */
export function buildDeadSessionView({ info = null, sessionTitle = "", canCreate = true } = {}) {
  const resolved = info && typeof info === "object" ? info : {};
  const source = toText(resolved.source) || "unknown";
  const sourceLabel = SOURCE_LABELS[source] || (source.startsWith("save") ? SOURCE_LABELS.save : SOURCE_LABELS.unknown);
  const title = toText(sessionTitle);
  return {
    title: "Сессия удалена или недоступна",
    lead: title
      ? `Сессия «${title}» была удалена (возможно, в другом окне или другим пользователем).`
      : "Эта сессия была удалена (возможно, в другом окне или другим пользователем).",
    contextLines: [
      `Сервер вернул 404 при: ${sourceLabel}.`,
      "Дальнейшие автоматические запросы по этой сессии остановлены.",
      "Несохранённые локальные изменения этой сессии восстановить нельзя.",
    ],
    actions: {
      backLabel: "К списку сессий",
      backHint: "Закрыть экран и вернуться к списку сессий проекта.",
      createLabel: canCreate ? "Создать новую" : "",
      createHint: canCreate ? "Создать новую сессию в этом проекте." : "",
    },
  };
}

export default buildDeadSessionView;
