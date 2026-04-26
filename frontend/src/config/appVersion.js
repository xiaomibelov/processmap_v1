export const appVersionInfo = {
  currentVersion: "v1.0.6",
  // Keep newest entry first. Each landed bounded update should bump version
  // and add 1-3 short Russian change lines here.
  changelog: [
    {
      version: "v1.0.6",
      changes: [
        "Добавлен bounded inbox/history для уведомлений обсуждений.",
      ],
    },
    {
      version: "v1.0.5",
      changes: [
        "В обсуждениях появились персональные упоминания.",
        "Упоминания показываются в верхней панели.",
      ],
    },
    {
      version: "v1.0.4",
      changes: [
        "Внимание в обсуждениях можно подтвердить как обработанное.",
      ],
    },
    {
      version: "v1.0.3",
      changes: [
        "Внимание из обсуждений видно в навигации.",
      ],
    },
    {
      version: "v1.0.2",
      changes: [
        "Обсуждения показывают приоритет и внимание.",
      ],
    },
    {
      version: "v1.0.1",
      changes: [
        "Уплотнена область сообщений в обсуждениях.",
      ],
    },
    {
      version: "v1.0.0",
      changes: [
        "Версия приложения показана в интерфейсе.",
        "Краткий журнал изменений хранится в одном источнике.",
      ],
    },
  ],
};

export default appVersionInfo;
