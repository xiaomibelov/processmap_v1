# 5-PLANE — Version Merge

## 1. UX Plane
- **Сценарий**: пользователь А видит уведомление "Б сохранил новую версию". Он хочет посмотреть, что изменилось, и решить: принять чужую версию, оставить свою, или вручную перенести часть изменений.
- **Интерфейс**: side-by-side два viewers + список семантических изменений; текущая версия слева/внизу, чужая — справа/сверху; своя подсвечена (например, синяя рамка), чужая — оранжевая.
- **Действия**: "Принять эту версию", "Оставить мою", "Редактировать вручную".

## 2. Data Plane
- Источники XML:
  - текущее из `bpmnStore.xml`;
  - чужая версия из `GET /api/sessions/{id}/bpmn/versions/{version_id}?include_xml=1`.
- Сохранение результата:
  - `PUT /api/sessions/{id}/bpmn` с выбранным XML + `base_diagram_state_version`.
  - `POST /api/sessions/{id}/bpmn/restore/{version_id}` для "accept theirs".
- Для отображения автора/времени использовать поля версии (`created_by`, `created_at`).

## 3. Logic Plane
- **Режим merge**: флаг `mergeModeActive` + `mergeCandidateVersionId`/`mergeCandidateXml`.
- **Семантический diff**: повторно использовать `buildSemanticBpmnDiff(currentXml, candidateXml)`.
- **CAS**: при сохранении выбранного XML отправлять актуальный `base_diagram_state_version` сервера (текущего session.diagram_state_version), чтобы не затереть ещё более новую версию.
- **Безопасность локальной копии**: modeler не трогается, пока пользователь не нажмёт "accept"; используем `NavigatedViewer` для обеих превью.

## 4. Integration Plane
- Новый компонент `BpmnMergeViewer` может инстанцировать два `NavigatedViewer`.
- `createBpmnRuntime` умеет чистить `.bjs-container` внутри своего host; нужно изолировать контейнеры.
- Связь с задачей 1: merge-режим открывается из уведомления о новой версии и из конфликтного модала.

## 5. Security / Auth Plane
- Только участники сессии с правом `view` могут читать версии.
- Для restore/save нужен `edit`.
- Не показывать email чужого пользователя, если нет прав; использовать `display_name` из автора версии.
