---
title: "05 Карта сохранения и CAS"
type: project-atlas-update
contour: fix/bpmn-history-headers-default-and-lazy-xml-v1
date: 2026-05-01
status: source-tested
---

## History list не является save writer

> [!warning] Restore остаётся write operation
> Lazy XML detail не отменяет CAS. Восстановление версии должно продолжать отправлять актуальный `base_diagram_state_version` и показывать реальный `409`.

| Сценарий | Read/write | CAS boundary | Изменение контура |
| -------- | ---------- | ------------ | ----------------- |
| History list | read | none | Headers-only, без XML |
| Version preview | read | none | Lazy XML одной версии |
| Restore version | write | required | Без изменений |
| Save BPMN XML | write | required | Без изменений |
| Remote poll | read | none | Не трогался |

> [!danger] Не смешивать
> История версий не должна вмешиваться в save/CAS lifecycle, durable BPMN XML truth, users/auth/org/workspace truth и remote conflict handling.

Связанные файлы:

| Файл | Роль |
| ---- | ---- |
| `frontend/src/components/ProcessStage.jsx` | UI state, lazy XML, restore entrypoint |
| `frontend/src/components/ProcessStage.cas-base-propagation.test.mjs` | Regression proof для CAS base |
| `frontend/src/lib/api.js` | Restore API wrapper |
