function toText(value) {
  return String(value || "").trim();
}

export function resolveSessionNavNoticeCopy(noticeRaw = null) {
  const notice = noticeRaw && typeof noticeRaw === "object" ? noticeRaw : {};
  const code = toText(notice.code).toUpperCase();
  if (code === "LEAVE_FLUSH_FAILED") {
    return {
      title: "Сохранение не завершено",
      fallbackMessage: "Не удалось сохранить изменения перед выходом в проект. Попробуйте снова.",
    };
  }
  return {
    title: "Сессия недоступна",
    fallbackMessage: "Не удалось открыть текущую сессию.",
  };
}
