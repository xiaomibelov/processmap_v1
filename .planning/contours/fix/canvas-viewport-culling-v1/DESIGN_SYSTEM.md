## Design System: ProcessMap

### Pattern
- **Name:** Hero + Features + CTA
- **CTA Placement:** Above fold
- **Sections:** Hero > Features > CTA

### Style
- **Name:** Glassmorphism
- **Mode Support:** Light ✓ Full | Dark ✓ Full
- **Keywords:** Frosted glass, transparent, blurred background, layered, vibrant background, light source, depth, multi-layer
- **Best For:** Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, navigation
- **Performance:** ⚠ Good | **Accessibility:** ⚠ Ensure 4.5:1

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#2563EB` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#3B82F6` | `--color-secondary` |
| Accent/CTA | `#EA580C` | `--color-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#1E293B` | `--color-foreground` |
| Muted | `#E9EFF8` | `--color-muted` |
| Border | `#E2E8F0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#2563EB` | `--color-ring` |

*Notes: Trust blue + orange CTA contrast [Accent adjusted from #F97316 for WCAG 3:1]*

### Typography
- **Heading:** Satoshi
- **Body:** General Sans
- **Mood:** premium, modern, clean, sophisticated, versatile, balanced
- **Best For:** Premium brands, modern agencies, SaaS, portfolios, startups
- **Google Fonts:** https://fonts.google.com/share?selection.family=DM+Sans:wght@400;500;700
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
```

### Key Effects
Backdrop blur (10-20px), subtle border (1px solid rgba white 0.2), light reflection, Z-depth

### Avoid (Anti-patterns)
- Excessive animation
- Dark mode by default

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

