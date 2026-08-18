# PLAN — uiux/sidebar-header-join-v1

**Ветка:** `uiux/sidebar-header-join-v1` от `origin/main` (`9e288d01`).  
**Контур:** UI/UX. **Цель:** визуально объединить левый сайдбар с блоком «← Назад / путь» в единую колонку; сохранить функциональность и стабильность DOM при переключении workspace (#740).

---

## 1. Что меняется и где

| Что | Текущее состояние | Что будет |
|---|---|---|
| **Левая колонка explorer** | `WorkspaceSidebar` внутри `WorkspaceExplorer` — узкая плавающая панель (`w-48`, `bg-panel2`, `border-r`). | Единая колонка от верха до низа: шапка «назад + путь» + ниже список organization/workspaces на общей поверхности (`bg-panel`, один border). |
| **Блок «назад + путь»** | Сейчас порталится в `workspaceMain` вместе с правым хедером (`ExplorerPane`/`ProjectPane`). | Переносится в левую колонку; правый хедер остаётся однострочным (табы, поиск, кнопки, счётчики). |
| **Правый хедер** | В explorer: кнопка «назад», крошки, табы, поиск, кнопки, счётчики. | Только табы, поиск, кнопки; счётчики workspace убираются (переезд в сайдбар — см. контур `uiux/ws-counters-to-sidebar-v1`). |
| **Страницы** | workspace root, раздел/папка, проект. | Одна и та же колонка слева; breadcrumb/header в ней адаптируется под текущий уровень. |
| **Страница сессии (канвас)** | `SessionNavStrip` в `workspaceMain`. | Не трогаем. |

---

## 2. Файлы

- `frontend/src/features/explorer/WorkspaceExplorer.jsx` — основные изменения.
- `frontend/src/features/explorer/ExplorerSidebarContext.jsx` *(новый)* — контекст для передачи breadcrumb-блока из `ExplorerPane`/`ProjectPane` в общую левую колонку.
- `frontend/src/components/TextBreadcrumbs.jsx` — без изменений; используем `forceCollapse={true}` для ограниченной ширины колонки.
- `frontend/src/components/AppShell.jsx` — без изменений; слот `workspace-main-nav` остаётся для правого хедера и `SessionNavStrip`.
- `frontend/src/components/navSingleLineLayout.js` — без изменений; explorer-заголовок перестаёт использовать `showCounters`/`shortCounters`, но сами пороги оставим ради проектного хедера и существующих тестов.
- Тесты: `workspaceProjectBreadcrumb.source.test.mjs`, `workspaceSectionHeaderCleanup.source.test.mjs`, `TextBreadcrumbs.test.mjs` — проверить/обновить source-assertions при смещении кода.

---

## 3. Архитектура

```
AppShell
└── workspaceMain
    ├── [data-testid="workspace-main-nav"]   ← правый хедер (табы/поиск/кнопки) из ExplorerPane/ProjectPane
    └── ProcessStage / WorkspaceExplorer
        └── flex row
            ├── ExplorerSidebarColumn (фикс. ширина ~224 px)
            │   ├── SidebarHeaderBlock   ← «назад + путь» (из контекста)
            │   └── WorkspaceSidebar     ← organization/workspaces
            └── right area
                ├── ExplorerPane  (absolute, hidden when project open)
                └── ProjectPane   (when project open)
```

### 3.1 Контекст левой шапки

Новый `ExplorerSidebarContext` хранит React-элемент `header` (back + breadcrumbs).  
`ExplorerPane` и `ProjectPane` вызывают `useSetExplorerSidebarHeader(headerNode)` — эффект записывает/сбрасывает заголовок при mount/unmount.  
`WorkspaceExplorer` читает `useExplorerSidebarHeader()` и рендерит его в верхней части левой колонки.

Это позволяет:
- держать один DOM-узел левой колонки при переключении workspace;
- не дублировать `WorkspaceSidebar` между `ExplorerPane` и `ProjectPane`;
- оставить вычисление breadcrumbs внутри соответствующей панели (где уже есть `page` / `proj` / `backCrumbs`).

### 3.2 Левая колонка

- Ширина `w-56` (224 px) фиксированная, `shrink-0`.
- Общая поверхность: `bg-panel`, `rounded-xl2`, `border border-border` (те же токены, что у `workspaceMain`).
- Верхний блок: высота `h-10` + `border-b border-border`, `px-3`, flex, `gap-2`, `overflow-hidden`.
  - Кнопка «назад»: `shrink-0`, `secondaryBtn h-7`.
  - `TextBreadcrumbs`: `min-w-0 flex-1`, `singleLine`, `forceCollapse={true}`.
- Нижняя часть: `flex-1 overflow-hidden`.
  - `WorkspaceSidebar` убирает собственный `border-r`/`bg-panel2`; рендерится на общем фоне колонки.

### 3.3 Правый хедер

`ExplorerPane` и `ProjectPane` продолжают порталить правый хедер в `workspaceMainNavSlot`, но без back-кнопки и breadcrumbs:

- **ExplorerPane:** табы «Проекты/Аналитика», поиск, кнопки «Создать раздел/Проект».  
  `data-testid="explorer-header"` и `getWorkspaceHeaderLayout(explorerNavWidth)` остаются.
- **ProjectPane:** `StatusPopoverControl`, табы «Сессии/Аналитика», поиск, кнопка «Новая сессия», счётчик сессий.  
  `data-testid="project-header"` и `getWorkspaceHeaderLayout(projectNavWidth)` остаются.

---

## 4. Детали реализации

### 4.1 `ExplorerSidebarContext.jsx`

```jsx
const ExplorerSidebarContext = createContext({
  header: null,
  setHeader: () => {},
});

export function ExplorerSidebarProvider({ children }) {
  const [header, setHeader] = useState(null);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <ExplorerSidebarContext.Provider value={value}>{children}</ExplorerSidebarContext.Provider>;
}

export function useExplorerSidebarHeader() {
  return useContext(ExplorerSidebarContext).header;
}

export function useSetExplorerSidebarHeader(header) {
  const { setHeader } = useContext(ExplorerSidebarContext);
  useEffect(() => {
    setHeader(header);
    return () => setHeader(null);
  }, [header, setHeader]);
}
```

### 4.2 `WorkspaceExplorer.jsx`

1. Оборачиваем return в `ExplorerSidebarProvider`.
2. Заменяем внутренний layout:
   ```jsx
   <div className="h-full flex flex-row min-h-0 font-sans">
     <div className="w-56 shrink-0 flex flex-col bg-panel rounded-xl2 border border-border overflow-hidden">
       <SidebarHeaderBlock />
       <div className="flex-1 overflow-hidden">
         <WorkspaceSidebar ... />
       </div>
     </div>
     <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
       {/* ExplorerPane + ProjectPane as before */}
     </div>
   </div>
   ```
3. `SidebarHeaderBlock` читает `useExplorerSidebarHeader()`. Если null — рендерит пустой `h-10` с нижней границей (чтобы высота колонки совпадала с правым хедером).
4. `WorkspaceSidebar` убирает `h-full flex flex-col border-r border-border bg-panel2` → заменяем на `h-full flex flex-col` (фон родителя).

### 4.3 `ExplorerPane`

- Убрать из `explorerHeader`: кнопку «← Назад к разделам» и `TextBreadcrumbs`.
- Сформировать `explorerSidebarHeader` (back + breadcrumbs) и вызвать `useSetExplorerSidebarHeader(explorerSidebarHeader)`.
- Оставить `createPortal(explorerHeader, headerSlotEl)` с правой частью.
- Сохранить переменные `headerCrumbItems`, `TextBreadcrumbs` и `dataTestId="explorer-breadcrumbs"` в коде, чтобы source-тесты (`workspaceProjectBreadcrumb`, `workspaceSectionHeaderCleanup`) продолжали находить их.

### 4.4 `ProjectPane`

- Убрать из `projectHeader`: кнопку «← Назад к разделу» и `TextBreadcrumbs`.
- Сформировать `projectSidebarHeader` (back + `projectCrumbItems`) и вызвать `useSetExplorerSidebarHeader(projectSidebarHeader)`.
- Оставить `projectHeader` с `StatusPopoverControl`, табами, поиском, кнопкой создания, счётчиком сессий.
- Сохранить `buildProjectBreadcrumbTrail(...)` и `<TextBreadcrumbs ... dataTestId="project-breadcrumbs"` для source-тестов.

### 4.5 Адаптив и путь

- Путь ограничен шириной колонки: `TextBreadcrumbs` получает `forceCollapse={true}`, поэтому длинный трейл сразу сворачивается в `первый / … / два последних`.
- Каждый сегмент `truncate`; тултип на элементах пути — нативный `title` или логика `TextBreadcrumbs` (ellipsis показывает скрытые имена).
- Compact (<680 px):
  - Если в проекте уже есть поведение «сайдбар за бургером» — сохраняем.
  - Если нет: в рамках этого контура скрываем левую колонку (`hidden`) на ширине <680 px и добавляем в правый хедер кнопку-бургер, которая открывает левую колонку как `absolute inset-y-0 left-0 z-40 w-56 bg-panel border-r shadow-xl`.  
  - Решение уточним по diff/скринам; основной приёмке — desktop 1440/1100/880/640.

### 4.6 Стабильность DOM (#740)

- Левая колонка и `WorkspaceSidebar` не размонтируются при переключении workspace внутри `ExplorerPane`.
- `ExplorerPane` остаётся смонтированным (скрытым) при открытом проекте — текущее поведение сохраняем.
- `WorkspaceSidebar` не пересоздаётся между панелями, т.к. живёт в `WorkspaceExplorer`.

---

## 5. Тесты и приёмка

### 5.1 Unit / source tests

- `node --test` в `frontend/src`.
- Обновить, если source-assertions сместились:
  - `workspaceProjectBreadcrumb.source.test.mjs` — ожидает `buildProjectBreadcrumbTrail` и `project-breadcrumbs` в `WorkspaceExplorer.jsx`.
  - `workspaceSectionHeaderCleanup.source.test.mjs` — ожидает `explorer-header`, `project-header`, `getWorkspaceHeaderLayout`.
- Добавить/обновить: `navSingleLineLayout.test.mjs` не трогаем (счётчики в проектном хедере остаются).

### 5.2 Ручная / скриншотная приёмка

Снять скрины **workspace root** и **раздела с длинным путём** (1440/1100/880/640):
- левая колонка — одна цельная поверхность без зазора;
- блок «назад + путь» и правый хедер на одной горизонтальной линии;
- путь урезан внутри колонки, не выпирает;
- кнопка «Открыть проект/сессию» не пересекается с датой (проверяется на таблице справа).

Дополнительно — страница проекта:
- в левой колонке — путь `workspace / папка / проект` + кнопка назад;
- в правом хедере — статус, табы, поиск, «+ Новая сессия», счётчик сессий в одну строку.

### 5.3 Гейты

- `pytest` backend: без изменений.
- `node --test` frontend: без новых падений относительно `origin/main`.
- `vite build`: OK.

---

## 6. Риски

- **Перенос breadcrumbs из nav slot в левую колонку** может затронуть source-тесты. Будем сохранять идентификаторы (`explorer-breadcrumbs`, `project-breadcrumbs`, `explorer-back-sections`, `project-back-section`).
- **Ширина колонки 224 px** может оказаться узкой для длинных имён workspace; `WorkspaceSidebar` уже использует `truncate`, так что не вылезет.
- **Счётчики workspace** сейчас убираются из хедера, но фактический перенос в сайдбар делается в отдельном контуре `uiux/ws-counters-to-sidebar-v1`. В этом контуре они просто исчезают из правого хедера (что соответствует DoD «Убрать из хедера»).
