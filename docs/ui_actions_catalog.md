# UI Actions Catalog (PROCESSMAP)

Источник: фактические кнопки/селекторы из `frontend/src/components/TopBar.jsx`, `frontend/src/components/ProcessStage.jsx`, `frontend/src/components/NotesPanel.jsx`, `frontend/src/components/process/InterviewStage.jsx`, `frontend/src/components/sidebar/*`, а также e2e-спеки из `frontend/e2e/*`.

| Действие (UI label) | Где | Когда доступно | Что делает | Что меняет | API / сеть | Ошибки / edge cases |
|---|---|---|---|---|---|---|
| `Войти` | `/` header, login modal | Всегда | Открывает вход | UI state auth modal | `POST /api/auth/login` | 401: неверные креды |
| `Регистрация` | `/` header, hero/footer | Всегда | В текущей реализации ведёт на `/login` | Route | — | Отдельного `/register` маршрута нет |
| `На главную` | `/login` | Всегда | Возврат на лендинг | Route | — | — |
| `Войти в систему` | `/login` форма | Email+пароль заполнены | Авторизация и переход в `/app` | Auth state, access token | `POST /api/auth/login`, `GET /api/auth/me` | 401/5xx/network маппятся в error alert |
| `Новый проект` | TopBar | После логина | Открывает modal создания проекта | UI modal | `POST /api/projects` | Неактивных состояний нет, но backend ошибки показываются в модалке |
| `Создать` (в модалке проекта) | Project modal | Поля валидны | Создаёт проект и стартовую сессию | Selected project/session | `POST /api/projects`, `POST /api/projects/{id}/sessions` | Ошибка API оставляет modal открытой |
| `Создать сессию` | TopBar | Когда выбран проект | Открывает flow/modal создания сессии | Session list | `POST /api/projects/{id}/sessions` | disabled без projectId |
| `Удалить проект` (🗑) | TopBar | Когда выбран проект | Удаляет проект | Project/session state | `DELETE /api/projects/{id}` | Потеря контекста текущей сессии |
| `Удалить сессию` (🗑) | TopBar | Когда выбрана сессия | Удаляет сессию | Session state | `DELETE /api/sessions/{id}` | — |
| `Light/Dark` | TopBar | После логина | Переключает тему | `localStorage fpc_theme` | — | Только UI |
| `Выйти` | TopBar right | После логина | Logout + redirect `/` | auth state reset | `POST /api/auth/logout` | confirm диалог перед выходом |
| `Interview / Diagram / XML / DOC` | Segmented tabs | Когда открыта сессия | Переключает рабочую вкладку | active tab, orchestration lifecycle | PATCH/PUT при autosave в зависимости от изменений | Guard-логика tab-switch предотвращает rollback |
| `Save` / `Сохранено` | Diagram toolbar | Зависит от dirty-state | Явно сохраняет или показывает статус | draft/session state | в основном `PATCH /api/sessions/{id}` и/или `PUT /api/sessions/{id}/bpmn` | disabled если нет сессии |
| `Сгенерировать процесс` | Diagram toolbar | `workbench.canGenerate` | Запускает генерацию/пересчёт процесса | session graph/interview | `POST /api/sessions/{id}/recompute` (и связанные) | Tooltip при недоступности |
| `⋯` overflow | Diagram toolbar | На Diagram | Открывает overlay меню действий | overlay state | — | закрывается по outside/Esc |
| `Normal/Interview/Quality/Coverage` | Diagram mode switch | На Diagram | Меняет режим отображения диаграммы | `localStorage ui.diagram.mode.v1` + UI overlays | — | Не должен перезагружать модель |
| `Требует внимания (N)` | Toolbar | Diagram/Interview + сессия | Открывает панель missing-элементов | attention panel state | данные derived из quality+coverage maps | N пересчитывается после изменений |
| `attention filters: Quality/AI/Notes` | Attention panel | Панель открыта | Фильтрация списка пробелов | UI filter state | — | пустой список при узких фильтрах |
| `Показать на схеме` (attention item) | Attention panel row | Для каждого item | Центрирует диаграмму и ставит jump-focus marker | selection/focus markers | — | Должно визуально отличаться от обычного select |
| `Импорт BPMN` | Diagram overflow | Есть сессия и BPMN tab | Импорт XML файла | diagram model + draft xml | `PUT /api/sessions/{id}/bpmn` | Невалидный XML -> error status |
| `Экспорт BPMN` | Diagram overflow | Есть сессия | Экспорт текущей схемы | файл/клипборд поток | `GET /api/sessions/{id}/export` | export gate с предупреждением при quality errors |
| `Версии` | Diagram overflow | Есть сессия | Открывает modal snapshots | versions UI state | local snapshots storage (+ restore import) | IndexedDB fallback на localStorage |
| `Восстановить` (версия) | Versions modal | Есть snapshot | Восстанавливает XML версии | bpmn/xml/draft state | `PUT /api/sessions/{id}/bpmn` после restore pipeline | Важно не терять текущий контекст |
| `Pin` (версия) | Versions modal | Есть snapshot | Закрепляет версию вверх списка | snapshot metadata | local snapshot metadata store | переживает reload |
| `Diff` (версия) | Versions modal | >=2 snapshots | Показывает semantic diff A/B | diff view state | локальный semantic parser/diff | если данных мало — пустой diff |
| `Команды ON/OFF` | Diagram overflow | Diagram tab | Включает command mode | local toggle | — | OFF скрывает панель команд |
| `Применить` (AI command) | Command mode panel | Есть текст команды | Парсит команду -> ops -> применяет к modeler | model graph, XML | `POST /api/sessions/{id}/ai/command-ops` (или локальный ops apply) + persist | валидация ops, status/error в панели |
| `Качество схемы` + profile | Quality panel | Mode=Quality | Запуск lint профиля MVP/Production/HACCP | quality issues state | локальный lint + derived from model | rule details через "Подробнее" |
| `Автоисправить (N)` | Quality panel/modal | Есть safe fixes | Применяет безопасные fix-операции | bpmn + snapshot checkpoint | apply ops + `PUT /api/sessions/{id}/bpmn` | preview перед apply |
| `Показать на схеме` (quality issue) | Quality row | Для issue с узлом | Центрирование + фокус проблемного узла | focus marker + viewport | — | тех.коды скрыты, в "Подробнее" |
| `Coverage panel` | Mode=Coverage | На Diagram | Показывает узлы с пробелами | coverage rows/minimap | derived из notes+ai+quality | legend и markers |
| `Coverage marker` (minimap) | Coverage minimap | Есть markers | Jump-to узел | focus/selection | — | должна быть быстрая навигация на больших схемах |
| `Открыть панель` | Left sidebar handle | Когда sidebar скрыт | Разворачивает левую панель | sidebar open state | session/local storage flags | по reload default закрыт |
| `Свернуть` (sidebar header) | Left sidebar | Когда sidebar открыт | Сворачивает обратно в rail | sidebar state | — | rail не должен перекрывать canvas |
| `NODE/AI/NOTES/ACTORS/TEMPLATES` quick nav | Sidebar | Когда sidebar открыт | Быстрый переход/фокус секции | activeSection/scroll | — | active/muted/badge states |
| `AI: Сгенерировать вопросы` | Sidebar AI section | Выбран узел | Запрос AI вопросов по элементу | interview.ai_questions_by_element | `POST /api/sessions/{id}/ai/questions` + `PATCH /api/sessions/{id}` | empty/failed AI -> подсказка/ошибка |
| `AI: DONE/MISSING checkbox` | Sidebar AI section | Есть вопросы | Меняет статус вопроса | ai question status/comment | `PATCH /api/sessions/{id}` | busy state по qid |
| `AI: Сохранить` | Sidebar AI section | Изменён comment/status | Сохраняет ответ по вопросу | ai question entry | `PATCH /api/sessions/{id}` | — |
| `Заметки: Сохранить заметку` (узел) | Sidebar Notes, tab `К узлу` | Выбран узел | Сохраняет note к elementId | notes_by_element | `PATCH /api/sessions/{id}` и/или notes endpoint | unsaved indicator `DRAFT` |
| `Заметки: Сохранить заметку` (общая) | Sidebar Notes, tab `Общие` | Всегда | Добавляет общую заметку | draft.notes | `POST /api/sessions/{id}/notes` | empty-state при отсутствии заметок |
| `Покрытие` в Notes section | Sidebar Notes | Всегда | Раскрывает локальную coverage карточку | coverageOpen state | — | кнопка `В Diagram` переводит в coverage режим |
| `Batch ON/OFF` (Notes) | Sidebar Notes | Всегда | Включает массовые ops из текстовых команд | batch mode state | apply ops через event bridge -> persist | preview + errors |
| `Templates/TL;DR` | Sidebar templates section | В зависимости от выбранного узла | Вставка шаблона заметки, генерация TL;DR | note template + summary fields | AI/patch endpoints | summary хранится отдельно от original note |
| `Interview timeline actions` | Interview stage rows | Вкладка Interview | Выбор шага, AI, reorder, menu actions | interview.steps/transitions | `PATCH /api/sessions/{id}` + optional recompute | при delete обязателен confirm |
| `B2: Добавить переход` | Interview transitions block | Interview + шаги | Создаёт/редактирует переход между шагами | interview.transitions + graph edges sync | `PATCH /api/sessions/{id}` | дедуп from->to, валидация self-link |
| `Вставить шаг между` | Diagram/Interview transitions | Есть контекст A->B | A->C->B атомарно | nodes+edges+transition conditions | persist pipeline (`PATCH`/`PUT`) | если нет edge A->B -> error message |

## Подтверждающие файлы
- Auth + routes: `frontend/src/RootApp.jsx`
- Top bar actions: `frontend/src/components/TopBar.jsx`
- Diagram toolbar/modes/quality/coverage/attention/versions: `frontend/src/components/ProcessStage.jsx`
- Sidebar shell and sections: `frontend/src/components/NotesPanel.jsx`, `frontend/src/components/sidebar/SidebarShell.jsx`, `frontend/src/components/sidebar/SidebarSection.jsx`
- Interview actions: `frontend/src/components/process/InterviewStage.jsx`, `frontend/src/components/process/interview/useInterviewActions.js`
- API client methods: `frontend/src/lib/api.js`
- Backend endpoints: `backend/app/main.py`
