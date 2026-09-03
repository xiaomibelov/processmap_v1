# FOUND-BUGS — characterization tests Workspace Explorer (Шаг 0)

> Зафиксировано в рамках контурa `refactor/workspace-explorer-s0-tests`.
> Product-код НЕ менялся; баги найдены инфраструктурой characterization-тестов.
> Статусы: OPEN (не фиксили, только зафиксировали поведение).

## char-bug-1 — бесконечный passive-effect loop в ExplorerSidebarContext

- **Status:** OPEN
- **File:** `frontend/src/features/explorer/ExplorerSidebarContext.jsx` (`useSetExplorerSidebarHeader` + provider value memo)
- **Симптом:** при монтировании `WorkspaceExplorer` в jsdom рендер никогда не завершается — бесконечный re-render loop, тест «зависает» (timeout).
- **Root cause (по коду):**
  - `useSetExplorerSidebarHeader` — `useEffect(..., [header, register, unregister])`, где `header` — новый JSX-элемент на каждом рендере.
  - `register` / `unregister` из контекста пересоздаются на каждый `setStack` (provider value не мемоизирован / мемо зависит от меняющегося стейта).
  - Цикл: рендер → effect (header изменился) → `register(...)` → `setStack` → новые register/unregister → re-render → header снова новый → effect → …
- **Экспериментальное подтверждение:** с реальным `ExplorerSidebarContext` рендер не завершается; со стабом контекста (стабильные no-op `register`/`unregister`) тот же рендер проходит за ~2с. Следовательно, зависание вызван именно этим модулем, а не тестовой инфраструктурой.
- **Как зафиксировано в тестах:** инфраструктура `frontend/src/test-utils/explorerChar.jsx` мокает `ExplorerSidebarContext.jsx` стабом со стабильными no-op `register`/`unregister`, чтобы characterization-тесты могли рендерить `WorkspaceExplorer`. В проде, вероятно, эффект проявляется как избыточные рендеры (а при определённых условиях — и как видимый loop).
- **Почему выглядит неправильным:** эффект с семантикой «sync header в sidebar state» не должен триггериться от идентичности JSX-элемента; классический случай для `useEffect` с примитивными deps или мемоизации `header` на стороне потребителя и мемоизации provider value.
- **Идея фикса (не реализовано, вне контура):** мемоизировать provider value в `ExplorerSidebarContext.Provider`, либо в `useSetExplorerSidebarHeader` зависеть не от `header`, а от его семантического содержимого; либо принимать `header` как render-функцию/примитив.

---

*(пополняется по мере нахождения новых расхождений)*
