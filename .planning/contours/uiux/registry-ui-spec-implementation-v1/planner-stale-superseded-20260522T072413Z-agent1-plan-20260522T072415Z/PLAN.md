# PLAN — uiux/registry-ui-spec-implementation-v1

## Goal
Implement the Product Actions Registry UI exactly per UI_SPEC.md.
The current implementation has working data but WRONG visual design.

## Current State
- Viewmodels exist and work (f24ce1f)
- ProductActionsRegistryPanel renders data but with OLD layout
- No white container, no tabs, no metrics row per spec, no source section

## Required Changes
1. Create RegistryLayout component (single white container, radius 12px, padding 24px)
2. Implement RegistryHeader per spec (title + subtitle + [?] + export dropdown)
3. Implement ScopeTabs ([Все действия] [По продуктам] [По сессиям])
4. Implement MetricsRow (Всего | С продуктом | Без продукта | Заполненность %)
5. Implement FiltersRow (Период | Продукт | Сессия | Статус | Источник)
6. Implement WarningRow (conditional soft text)
7. Implement AIControlsRow (🤖 AI: Найдено N... [Показать рекомендации])
8. Implement DataTable per spec (Действие | Продукт | Сессия | Источник | Статус | Дата)
   - Status badges with colored dots (Полная=green, Неполная=orange)
9. Implement SourceSection (Источники данных with indicators)
10. Implement EmptyState and LoadingSkeleton
11. Update backend endpoint to return view_model matching spec contract
12. Tests for all new components
13. Runtime proof on :5180

## Spec Reference
/opt/processmap-test/.planning/contours/uiux/registry-ui-spec-implementation-v1/UI_SPEC.md

## Constraints
- No backend schema changes
- No env changes
- Single container per page (spec rule)
- Backend-driven view_model (thin client)
