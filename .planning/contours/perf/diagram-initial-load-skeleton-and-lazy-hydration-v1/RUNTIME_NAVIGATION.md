# RUNTIME_NAVIGATION.md

## Runtime URLs

| Service | URL |
|---------|-----|
| Frontend | `http://clearvestnic.ru:5180` |
| API | `http://clearvestnic.ru:8088` |
| API Health | `http://clearvestnic.ru:8088/health` |

## Target Session

From post-optimization audit:
- **Session ID**: `wewe` (`4c515d1c6e`)
- **Project**: `Описание процессов Долгопрудный` (`b1c8a56b6e`)

## How to Open Session Directly

1. Navigate to `http://clearvestnic.ru:5180`.
2. Authenticate via localStorage:
   ```js
   localStorage.setItem('fpc_auth_access_token', '<DEV_ADMIN_TOKEN>');
   ```
3. Reload page.
4. Navigate to session via workspace explorer or direct URL if known.

## How to Open Diagram

1. Open session.
2. Ensure tab is set to "Diagram" (default for most sessions).
3. If not, click "Diagram" tab in session toolbar.

## How to Measure Load Milestones

### Shell Visible
```js
// Page shell rendered
document.querySelector('.processStageRoot') !== null
```

### Skeleton Visible
```js
// If skeleton implemented:
document.querySelector('[data-testid="diagram-skeleton"]') !== null
```

### Canvas Visible
```js
// BPMN canvas container present
document.querySelector('.djs-container') !== null
```

### Diagram Ready
```js
// BpmnStage sets diagramReady = true
document.querySelector('[data-testid="diagram-ready"]') !== null
```

### Overlays/Decor Ready
```js
// Property overlays
document.querySelectorAll('.fpcPropertyOverlay').length
// Analytics selection marker
document.querySelectorAll('.fpcAnalyticsSelected').length
```

### Property Panel Usable
```js
// NotesPanel rendered and has content
document.querySelector('.sidebarShell') !== null
```

## How to Switch Tabs

### Analysis ↔ Diagram
1. Click "Анализ" tab to go to Analysis.
2. Click "Diagram" tab to return to Diagram.

### XML ↔ Diagram
1. Click "XML" tab to go to XML editor.
2. Click "Diagram" tab to return to Diagram.

## How to Inspect Network

### DevTools Filters
```
method:PUT path:/bpmn
method:PATCH path:/sessions
path:/bpmn/versions?limit=1
```

### Expected Results
- PUT `/bpmn`: **0** from load/tab switch/view interactions.
- PATCH `/sessions`: **0** from load/tab switch/view interactions.
- `/bpmn/versions?limit=1`: background polls only (≤ 5).

## Browser Snippets

```js
// Total DOM nodes
document.querySelectorAll('*').length

// Total SVG nodes
document.querySelectorAll('svg *').length

// BPMN canvas containers
document.querySelectorAll('.djs-container').length

// Property overlays
document.querySelectorAll('.fpcPropertyOverlay').length

// Analytics selected markers
document.querySelectorAll('.fpcAnalyticsSelected').length

// BPMN overlays (djs)
document.querySelectorAll('.djs-overlay').length

// Diagram ready marker
document.querySelector('[data-testid="diagram-ready"]') !== null
```

## Auth Token

Use dev admin credentials. Token is available in local dev environment. Do not expose in logs.
