# Frontend Ideation Lenses

Supplementary lenses that probe frontend-specific concerns. Apply these alongside the existing 6 ideation frames (pain/friction, inversion/removal/automation, assumption-breaking, leverage/compounding, cross-domain analogy, constraint-flipping) when the topic is frontend-related. Load this file when the topic touches React, TypeScript, CSS, accessibility, performance, or design systems; skip it for non-frontend topics.

## Frontend Ideation Lenses

Each lens is a probing checklist, not a frame replacement. Run a lens across the grounding evidence and the axis surface the same way a frame runs — the lens names what to look for, the frame names how to think about it.

### Accessibility improvement lens

- What barriers exist for keyboard-only users?
- What dynamic content lacks ARIA live announcements?
- Which interactive elements are missing keyboard support?
- What color-contrast gaps exist?
- Which touch targets are below 44x44px?
- What happens when text is resized to 200%?
- Which screens lack skip-to-content navigation?
- What forms lack proper label associations?

### Performance improvement lens

- Which routes have the largest bundle impact?
- What interactions have INP > 200ms?
- Which images lack modern formats or responsive sizing?
- What long tasks > 50ms block the main thread?
- Which lists should be virtualized?
- What context providers cause cascade re-renders?
- Which API calls are sequential when they could be parallel?
- What fonts can be self-hosted or subsetted?

### Design system evolution lens

- Which components are duplicated across features instead of shared?
- What design tokens are inconsistent or undefined?
- Which component variants could be consolidated?
- What spacing values don't conform to the scale?
- Which components lack loading/empty/error states?
- What interaction states (hover/focus/active/disabled) are missing?
- Which icon sets are mixed?
- What responsive patterns are ad-hoc instead of systematic?

### Frontend DX lens

- Which build steps are slow and could be cached or parallelized?
- What TypeScript errors are most common in the codebase?
- Which components are hardest to test and why?
- What developer tooling is missing (Storybook, type checking, linting)?
- Which environment setup steps are manual and could be automated?
- What HMR (hot module replacement) gaps exist?
- Which type definitions are inaccurate or missing?

## Frontend Axis Decomposition Examples

When decomposing a frontend topic into axes for Phase 1.5, these examples illustrate the shape. Derive axes from actual grounding, not from these templates — they exist to calibrate granularity, not to be copied.

### "Improve our dashboard" -> axes

- Data loading strategy (React Query vs SWR vs custom, prefetching, caching)
- Component composition (container/presentational split, compound components)
- Interaction states (loading skeletons, error boundaries, empty states, optimistic updates)
- Accessibility (keyboard navigation, ARIA live regions, focus management, screen reader)
- Responsive behavior (mobile-first, breakpoint strategy, touch targets)
- Performance (bundle size, virtualization, memoization, Web Vitals)

### "Improve form handling" -> axes

- Validation strategy (client-side, server-side, schema-based, timing)
- Error presentation (inline, summary, focus management, ARIA)
- State management (controlled/uncontrolled, form library, field-level vs form-level)
- Accessibility (label association, error association, autocomplete, keyboard navigation)
- Performance (re-render scope, debounced validation, submit handling)
- UX patterns (progressive disclosure, multi-step, autosave, draft)

### "Improve data table" -> axes

- Virtualization strategy (windowing, pagination, infinite scroll)
- Sorting and filtering (client vs server, URL state, debounced input)
- Accessibility (table semantics, sort announcements, screen reader navigation)
- Performance (memoization, selector optimization, render batching)
- Responsive behavior (column priority, horizontal scroll, card view on mobile)
- State management (selection, expansion, editing, URL state for filters)

## Frontend Evidence Scout Signals

Thresholds for evidence scouts (Phase 1.5) to flag when scanning a frontend codebase. Each threshold is a falsifiable trigger — a signal fires when the measured value crosses the stated line, not when it "feels high." Quote the offending line with a `file:line` pointer in the dossier; do not interpret, just flag.

### React signals

- `useEffect` bodies > 20 lines (complex effect; extraction or redesign candidate)
- Context provider nesting depth > 3 (over-nested providers)
- Component prop count > 5 (interface too wide; decomposition candidate)
- Components with > 10 `useState` calls (state management candidate)
- `useEffect` with `[]` dependency but referencing state (stale closure risk)
- `React.memo` on every export (over-memoization)

### TypeScript signals

- `as any` count per file (type safety holes)
- `@ts-ignore` or `@ts-expect-error` count (suppressed errors)
- Files with > 5 generic type parameters (over-abstraction)
- Union types > 5 members without a discriminant (should be a discriminated union)

### CSS signals

- Inline `style` attributes in JSX (should use utility classes or CSS modules)
- `!important` declarations (specificity war)
- Custom pixel values instead of design tokens
- Duplicate class string patterns across components (extract to shared component)

### Accessibility signals

- `<div onClick>` without `role` and `tabIndex` (keyboard inaccessible)
- Images without `alt` attribute
- `tabindex` values > 0
- Form inputs without associated labels
- Color-only state indicators (no icon/text/border)

### Bundle signals

- `import * from` statements
- Route files without `lazy()` or dynamic `import()`
- `index.ts` barrel files re-exporting > 10 modules
- `package.json` dependencies with overlapping functionality

## Frontend Grounding Artifacts

When grounding ideation in the codebase (Phase 1 quick context scan and Phase 1.5 evidence scouts), scan these frontend-specific artifacts. The table names what to look for in each — it is a coverage checklist, not an exhaustive read list.

| Artifact | What to look for |
|----------|-----------------|
| `tailwind.config.ts/js` | Design tokens, breakpoints, custom theme |
| `package.json` | Dependencies, scripts, bundle suspects |
| `tsconfig.json` | Strictness level, path aliases, module resolution |
| Component library (Storybook) | Existing components, variants, gaps |
| `src/router*` or `src/routes*` | Route structure, lazy loading, code splitting |
| `src/store*` or `src/context*` | State management architecture |
| `src/api*` or `src/services*` | API integration patterns, React Query setup |
| `.eslintrc*` | Linting rules, custom rules, disabled rules |
| `vite.config.*` or `webpack.config.*` | Build configuration, aliases, plugins |
