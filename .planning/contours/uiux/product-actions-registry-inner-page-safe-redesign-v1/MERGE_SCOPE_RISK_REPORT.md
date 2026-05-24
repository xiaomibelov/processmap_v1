# MERGE_SCOPE_RISK_REPORT — Оценка риска merge

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Run ID:** `20260517T112506Z-72991`  
**Ветка:** `fix/lockfile-sync-test`  
**Дата:** `2026-05-17`  

---

## 1. Резюме оценки

**Вердикт: SAFE TO MERGE COMBINED** (при условии прохождения runtime visual review Agent 4).

Ветка содержит 3 независимых блока изменений. Они не конфликтуют друг с другом и могут быть вмержены одним коммитом, **но** рекомендуется явно документировать состав изменений в сообщении коммита/PR.

---

## 2. Оценка по блокам

### 2.1. Analytics Hub v1.0.134 (Category A)

| Аспект | Оценка |
|--------|--------|
| Завершённость | ✅ Самодостаточная фича: компонент, routing, shell-интеграция, тесты |
| Конфликты с Registry | ❌ Нет — разные файлы, за исключением `ProcessStage.jsx` (sibling rendering) |
| Конфликты с main | ⚠️ Низкий риск: routing-функции новые, shell-пропсы добавлены опционально |
| Риск регрессии | Низкий: только добавление новых опциональных пропсов и поверхностей |

### 2.2. Registry redesign v1.0.135 (Category B)

| Аспект | Оценка |
|--------|--------|
| Завершённость | ✅ Декомпозиция выполнена, тесты проходят, версия bumped |
| Конфликты с Analytics Hub | ❌ Нет — registry использует тот же pre-existing routing в `ProcessStage.jsx` |
| Конфликты с main | ⚠️ Низкий риск: `ProductActionsRegistryPanel.jsx` был сильно изменён, но тесты покрывают |
| Риск регрессии | Низкий: только внутренний редизайн, data flow сохранён 1:1 |

### 2.3. Diagram performance v1.0.131–1.0.133 (Category C)

| Аспект | Оценка |
|--------|--------|
| Завершённость | ✅ Коммиты уже в истории ветки (`5b20bc2` и ранее) |
| Конфликты | ❌ Нет с A и B |
| Риск регрессии | Низкий: memo-обёртки и CSS-оптимизации, уже протестированы в других контурах |

---

## 3. Риски merge

| Риск | Уровень | Митигация |
|------|---------|-----------|
| Ветка содержит 3 фичи под одним именем | Средний | Явно перечислить все фичи в PR-описании |
| `ProcessStage.jsx` изменён в A (Analytics Hub) и содержит pre-existing registry routing | Низкий | Рouting-функции изолированы, конфликта с B нет |
| `tailwind.css` смешивает стили A и B | Низкий | Префиксы `.processAnalyticsHub*` и `.productActionsRegistry*` разделены |
| Версия `v1.0.135` содержит changelog за 1.0.131–1.0.135 | Низкий | Все версии легитимны и документированы |
| `ProcessAnalyticsHub.test.mjs` ожидает v1.0.134 | Низкий | 1 тест устарел из-за bump, легко фиксится, не блокирует merge |

---

## 4. Рекомендации

### 4.1. Merge strategy

**Рекомендуется:** Merge combined (все изменения ветки `fix/lockfile-sync-test` в `main` одним PR).

**Обоснование:**
- Все 3 блока (lockfile fix, diagram perf, Analytics Hub + Registry) — легитимные frontend-изменения.
- Нет конфликтов между блоками.
- Разделение ветки на 3 PR потребовало бы сложного rebase и увеличило риск ошибок.

### 4.2. Обязательные действия перед merge

1. **Исправить `ProcessAnalyticsHub.test.mjs`** — тест `version bumped to v1.0.134` ожидает старую версию. Нужно обновить на `v1.0.135`.
2. **Пройти runtime visual review Agent 4** — страница реестра должна быть визуально проверена на `5180`.
3. **Сборка frontend** — `npm run build` должен завершиться успешно (предыдущая попытка была прервана по OOM, требуется retry с достаточными ресурсами).

### 4.3. PR-описание (рекомендация)

```
Frontend updates v1.0.131–v1.0.135

1. Diagram performance (v1.0.131–1.0.133)
   - Memo boundaries for BpmnStage, InterviewStage
   - Pan/drag side-effect suppression
   - CSS interaction-mode optimizations

2. Analytics Hub (v1.0.134)
   - New Analytics Hub surface
   - Registry nested under Analytics Hub
   - Shell integration (TopBar, AppShell, WorkspaceExplorer)

3. Registry redesign (v1.0.135)
   - Decomposed ProductActionsRegistryPanel into isolated components
   - Metrics cards, filter grid, pagination 25/50
   - No backend/schema/BPMN/RAG changes
```

---

## 5. Go / No-Go

- **Go для merge** — после исправления теста Analytics Hub и прохождения runtime visual review Agent 4.
- **No-Go** — если Agent 4 обнаружит визуальные регрессии или runtime mismatch persists.

---

*Agent 3 / Merge Risk Assessor*  
*Run: 20260517T112506Z-72991*
