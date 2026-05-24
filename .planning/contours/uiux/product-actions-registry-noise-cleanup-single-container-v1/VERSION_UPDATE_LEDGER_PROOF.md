# Version Update Ledger Proof

## Diff `frontend/src/config/appVersion.js`

```diff
-  currentVersion: "v1.0.137",
+  currentVersion: "v1.0.138",
   ...
   changelog: [
+    {
+      version: "v1.0.138",
+      changes: [
+        "Реестр действий с продуктом: один белый контейнер с разделителями 1px #F3F4F6; метрики — одна текстовая строка; фильтры — компактный ряд с text-link reset; warning — строка без жёлтого баннера; AI-блок — строка без градиента; таблица — 4 колонки 20/25/35/20 с раскрытием строки (chevron + 4 read-only поля).",
+      ],
+    },
     {
       version: "v1.0.137",
```

## Новая версия

`v1.0.138`

## Где видна в UI

`appVersionInfo.currentVersion` импортируется и отображается в `frontend/src/components/AppShell.jsx` / build-info-индикаторе (Agent 3 проверяет визуально в runtime). Reviewer обязан подтвердить, что после fresh cache-buster открытие `:5180` показывает версию `v1.0.138`.

## Verification

```bash
$ head -2 frontend/src/config/appVersion.js
export const appVersionInfo = {
  currentVersion: "v1.0.138",
```
