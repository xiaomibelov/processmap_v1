import { createContext, useContext } from "react";

// Часть А (nav-zone): слот навигационной зоны в верхней части workspaceMain.
// AppShell создаёт слот; страницы explorer порталят в него свой хедер-блок
// (кнопка «назад» + крошки + H1 + мета), чтобы позиция была пиксель-в-пиксель
// одинаковой на всех трёх уровнях (раздел / проект / сессия).

export const WorkspaceMainNavSlotContext = createContext(null);

export function useWorkspaceMainNavSlot() {
  return useContext(WorkspaceMainNavSlotContext);
}
