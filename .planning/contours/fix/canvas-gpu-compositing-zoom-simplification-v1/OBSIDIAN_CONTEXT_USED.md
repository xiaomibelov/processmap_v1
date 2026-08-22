# Obsidian Context Used

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Vault**: `/srv/obsidian/project-atlas/ProcessMap`

---

## Files Read

### 1. `Audits/Diagram Baseline No Overlays Canvas Profile.md`
- **Relevance**: HIGH — confirms selection triggers +3,186 SVG nodes even with overlays OFF.
- **Key finding**: Element selection causes massive SVG/DOM inflation (+40%).
- **Hypothesis ranking**: H5 "CSS/SVG repaint cost dominates" — high confidence.
- **Decision**: Reinforces GPU compositing approach; paint cost is the real enemy, not just DOM count.

### 2. `Audits/Diagram Property Overlays Performance Audit.md`
- **Relevance**: MEDIUM — confirms overlays add +2,770 DOM nodes (34.5%), but this was already addressed by debounce contour.
- **Decision**: Overlay debounce is done; this contour must NOT re-solve overlay problems.

### 3. `HANDOFF/2026-05-24-agents-launcher-kimi-mcp-repair.md`
- **Relevance**: LOW — operational handoff, no product decisions relevant to canvas performance.

## Search Commands Used
```bash
find /srv/obsidian/project-atlas/ProcessMap -type f -name '*.md' | xargs grep -l -i 'canvas\|performance\|drag\|lag\|fps\|svg\|gpu\|composit\|zoom\|bpmn'
ls -la /srv/obsidian/project-atlas/ProcessMap/Audits/
```

## Decisions Taken from Obsidian
1. Paint/composite cost (H5) is the dominant bottleneck when overlays are off.
2. Previous culling attempt was reverted due to DOM removal side effects → this contour must keep ALL nodes in DOM.
3. Selection inflation (+3,186 SVG nodes) means even "at rest" the browser has high paint surface; GPU layer promotion is essential.
