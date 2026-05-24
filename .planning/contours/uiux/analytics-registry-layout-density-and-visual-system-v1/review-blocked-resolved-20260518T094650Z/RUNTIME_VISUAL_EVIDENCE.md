# Runtime Visual Evidence

Контур: `uiux/analytics-registry-layout-density-and-visual-system-v1`  
Run ID: `20260518T085529Z-44650`  
Статус: `NOT_CAPTURED_FOR_VERDICT`

## Причина

Browser screenshots intentionally not used for verdict because `http://clearvestnic.ru:5180/build-info.json` serves a different contour:

- expected: `uiux/analytics-registry-layout-density-and-visual-system-v1`
- actual: `uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1`
- actual sourceWorktree: `/opt/processmap-test-agent2-uiux`
- actual sha: `d805e1c64c1107b9e3fe6854e031694bf741b187`

Any screenshot from this runtime would be evidence for the wrong build.

## Required next visual evidence after unblock

After `:5180` serves the current contour build, collect:

- Analytics Hub wide screenshot at `1280px+`, preferably `1920x1080`;
- Product Actions Registry populated project screenshot;
- Product Actions Registry empty workspace screenshot without fake data;
- optional scrolled screenshot showing pagination and sources;
- console summary;
- network summary confirming no unsafe `PUT`, `PATCH`, or `DELETE` during viewing/navigation.
