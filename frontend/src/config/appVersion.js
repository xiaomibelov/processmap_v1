export const appVersionInfo = {
  currentVersion: "v1.0.3",
  // Keep newest entry first. Each landed bounded update should bump version
  // and add 1-3 short Russian change lines here.
  changelog: [
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
