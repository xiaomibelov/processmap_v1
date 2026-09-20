import { getDict } from "../../../../shared/i18n/index.js";
import { ru } from "../../../../shared/i18n/ru.js";

// Словарь секций Сводки по текущей локали (механизм shared/i18n, fallback — ru).
// Доступ через переменную намеренно: читается объектный неймспейс admin.dashboardPage,
// а не листовой ключ (для листов есть t()/i18nKeysInvariant).
export function dashboardDict() {
  const dict = getDict();
  return (dict && dict.admin && dict.admin.dashboardPage) || ru.admin.dashboardPage;
}
