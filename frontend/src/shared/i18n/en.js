// UX-UPDATE — английский словарь (парный к shared/i18n/ru.js, ключи app_update.*).
// Паритет ключей проверяется тестом appUpdateModel.test.mjs.
// NB: LLM4 добавляет в этот файл ключи processman.* — при мерже веток
// (add/add) оставить ОБА блока.
export const en = {
  app_update: {
    title: "A ProcessMap update is available",
    titleDirty: "A ProcessMap update is available. Save your changes before updating.",
    description: "Reload the page to get the latest fixes.",
    descriptionSaving: "Wait for the save to finish before updating.",
    refresh: "Update",
    refreshDirty: "Save and update",
    refreshBusy: "Saving…",
    later: "Later",
    laterTitle: "Hide for 30 minutes",
    iconAria: "Update available",
  },
};
