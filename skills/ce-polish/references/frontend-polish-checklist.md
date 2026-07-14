# Frontend polish checklist

Structured polish criteria for React + TypeScript client-side-rendered apps. Read this when the feature under polish is a frontend UI, so the conversation has concrete things to look for. This is a what-to-look-for reference, not a rigid gate — the iterate loop in `SKILL.md` remains conversational; these are the surfaces worth probing.

## Accessibility polish

### Keyboard navigation

- All interactive elements reachable via Tab key
- Focus order follows visual / logical order
- Focus is visible (outline or ring on focused elements) — never `outline: none` without a replacement ring
- Custom widgets have keyboard support: Enter to activate, Escape to close
- No keyboard traps — user can always Tab away
- Skip-to-content link visible on keyboard focus
- Modals trap focus while open, return focus to the trigger on close

### Screen reader

- All images have `alt` text (or `alt=""` for decorative images)
- Icon-only buttons have `aria-label`
- Page has exactly one `<h1>`; headings do not skip levels
- Dynamic content announced via `aria-live`: `polite` / `role="status"` for saves, `assertive` / `role="alert"` for errors
- Loading states marked with `aria-busy="true"` and `aria-label`

### Visual

| Criterion | Threshold |
|-----------|-----------|
| Text contrast (normal text) | >= 4.5:1 |
| Text contrast (large text, 18px+) | >= 3:1 |
| Touch target size (mobile) | >= 44x44px |
| Flash frequency | <= 3 flashes per second |

- Color is not the only way to convey information
- Text resizable to 200% without breaking layout

### Forms

- Every input has a visible label
- Required fields indicated (not by color alone)
- Error messages specific and associated with the field via `aria-describedby`
- Error state visible by more than color (icon, text, border)
- Known fields use `autocomplete` (e.g. `autocomplete="email"`)

## Responsive polish

- Test at 320px, 768px, 1024px, 1440px
- No horizontal scroll at any breakpoint
- Text readable at all sizes — check line length (45-75 characters ideal)
- Touch targets >= 44x44px on mobile
- No layout shift when fonts load (use `font-display: swap` plus fallback metrics)
- Images responsive: `srcset` + `sizes` + explicit `width` / `height`

## Visual polish

### Spacing consistency

- All spacing uses the project's design token scale (0.25rem increments or the Tailwind config)
- No off-scale values (`padding: 13px`, `margin-top: 2.3rem`)
- Consistent spacing between related elements (cards in a grid, items in a list, sections on a page)

### Typography hierarchy

- Clear visual hierarchy: h1 > h2 > h3 > body > small
- No skipped heading levels
- Consistent font sizes and weights across similar components

### Interaction states

Every interactive element has all of:

| State | Notes |
|-------|-------|
| default | resting appearance |
| hover | subtle color shift, not scale / transform (that is for clicks) |
| focus | visible and distinct from hover |
| active | pressed appearance |
| disabled | visually distinct, with `aria-disabled` or `disabled` attribute |

### Loading states

- Skeleton loaders for content areas (not spinners — skeletons show the shape)
- Skeletons marked with `aria-busy="true"` and `aria-label`
- Loading state appears within 100ms of the action (otherwise the user thinks nothing happened)

### Empty states

- Never blank screens — icon + heading + helper text + action button
- Empty state tells the user what to do next

### Error states

- Error messages are specific and actionable (not "Something went wrong")
- Error states include a retry or recovery action
- Error boundaries catch render errors and show a fallback

### Icon consistency

- Icons from the same set (do not mix Lucide and Heroicons)
- Consistent icon sizing (16px, 20px, 24px — not arbitrary sizes)
- Icons in buttons have `aria-hidden="true"` when accompanied by text

## Performance polish

### Web Vitals

| Metric | Threshold |
|--------|-----------|
| LCP | <= 2.5s |
| CLS | <= 0.1 |
| INP | <= 200ms |

Measure with Lighthouse or the `web-vitals` library.

### Render performance

- No unnecessary re-renders (check with React DevTools Profiler "Highlight updates")
- No commit > 16ms (causes a dropped frame at 60fps)
- Long lists virtualized (> 100 items)

### Bundle impact

- No new heavy dependencies added without checking bundle size
- Verify `import()` code splitting works in the production build
- Check the bundle analyzer for unexpected growth

## AI aesthetic anti-patterns

Refuse these patterns — they signal AI-generated UI, not intentional design:

- Purple / indigo gradient palettes as default
- Excessive gradients (on buttons, cards, backgrounds)
- `rounded-2xl` on everything
- Generic hero sections with centered text and a CTA button
- Lorem ipsum or placeholder copy left in the UI
- Oversized padding everywhere (no visual density)
- Stock card grids with no hierarchy
- Shadow-heavy design (also slows rendering on low-end devices)
- Overuse of animations / transitions on every element

## React-specific inspection

- State persists correctly across route navigation (no stale data from a previous route)
- Effect cleanup runs on unmount (no memory leaks, no stale state updates)
- Context provider value changes do not cause unnecessary re-renders
- Form inputs do not lose focus on each keystroke
- Controlled components have consistent `value` / `onChange` pairing
- `key` props on list items are stable (not array index when items can reorder)
