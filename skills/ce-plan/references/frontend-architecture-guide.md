# Frontend Architecture Guide

Loaded from SKILL.md Phase 3.4 when planning frontend features (React
components, state management, CSS architecture, performance budgets).
Apply these heuristics when composing the High-Level Technical Design and
each implementation unit's component boundaries.

Every rule below is a falsifiable constraint or a specific heuristic, not
generic advice. Override a rule only when the plan records why the
override is correct for this case.

## Component Composition Patterns

### Compound components (preferred for tightly-coupled UI)

```tsx
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Body>Content</Card.Body>
</Card>
```

Prefer this over `<Card title="..." headerVariant="..." bodyPadding="...">`.
Compound components compose; configuration objects do not. A new variant
is a new child element, not a new prop on the root.

### Container / presentational split

- **Container** handles data fetching, loading/error/empty states, and
  mutations.
- **Presentational** receives already-resolved data, renders UI, and calls
  callbacks.
- Not a strict rule for every component. Apply when data logic and
  rendering logic are both non-trivial; skip when one side is trivial.

### Render props for cross-cutting concerns

- Use a render prop when a shared behavior (dropdown, drag, animation)
  needs to wrap different render outputs.
- Prefer a hook over a render prop when the behavior does not need to
  control rendering. If the behavior only reads/writes state and does not
  dictate the DOM, a hook is the smaller interface.

## Folder Structure Heuristics

### Feature-based over type-based

```
src/
  features/
    orders/
      components/
      hooks/
      types.ts
      api.ts
      index.ts
    products/
      components/
      hooks/
      ...
  components/       # shared/ui components only
  hooks/            # shared hooks only
  lib/              # utilities, no React
```

A feature folder owns its components, hooks, types, and API surface. The
top-level `components/`, `hooks/`, and `lib/` directories hold only
cross-feature shared code. If a component is used by exactly one feature,
it belongs inside that feature, not at the top level.

### Colocated files

Keep `Component.tsx`, `Component.test.tsx`, `Component.stories.tsx`,
`useComponent.ts`, and `types.ts` together under one folder per
component. A component's tests, stories, and local hook live next to it,
not in a parallel type-based directory.

### Entry points over barrel files

A package exposes its public surface via root files (`index.ts`,
`client.ts`). Anything in a subfolder (`lib/`, `tests/`) is private.
Adding an entry point is just adding a root file; no barrel re-export
needed. Barrel files that re-export subfolder internals defeat the
private/public boundary and slow builds by pulling the whole graph.

## State Management Decision Ladder

Choose the simplest option that handles the case. Stop at the first rung
that works; do not skip ahead.

| Priority | Option | Use for |
|----------|--------|---------|
| 1 | `useState` | Component-local UI state (form values, toggle, modal open) |
| 2 | Lifted state | State shared by 2-3 sibling components -> lift to common parent |
| 3 | Context | Theme, auth, locale: read-heavy, write-rare, app-wide |
| 4 | URL state (`searchParams`) | Filters, pagination, sorting: shareable, bookmarkable |
| 5 | React Query / SWR | Server state + caching: any data from an API |
| 6 | Zustand / Redux | Complex app-wide client state: cross-feature interactions, optimistic updates |

Rules:

- Server state (API data) belongs in React Query/SWR, not in
  Zustand/Redux. A global store that mirrors server responses is a
  cache pretending to be state.
- URL state for anything shareable. If a user can bookmark a view, the
  state that defines that view should be in the URL, not in component
  state.
- Do not reach for global state when local state suffices. State should
  live close to where it is used.
- Prop drilling through 1-2 levels is fine. Three or more levels signals
  wrong state placement -> lift the state, or move to a higher rung.

## CSS Architecture Planning

### Tailwind configuration strategy

- Define design tokens (colors, spacing, typography) in
  `tailwind.config.ts`. Never use raw values (`text-gray-900`,
  `p-[13px]`) in components.
- Use semantic token names: `text-primary`, `bg-surface`,
  `border-default`. Not `text-gray-900`. A semantic name survives a
  theme change; a literal name does not.
- Dark mode: `class` strategy (not `media`) for user-toggleable dark
  mode. `media` forces the system preference and removes user choice.
- Custom spacing scale: 0.25rem (4px) increments. Reject off-scale
  values. An ad-hoc `p-[13px]` breaks the grid the rest of the system
  assumes.

### Responsive strategy

- Mobile-first: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. The
  base class is the smallest viewport; each breakpoint adds capability.
- Test at breakpoints: 320px, 768px, 1024px, 1440px. These four cover
  the common device widths without proliferating custom breakpoints.
- Define breakpoint usage in the plan: which breakpoints apply to which
  features. A plan that names the breakpoints a feature must hit is
  verifiable; one that says "make it responsive" is not.

### CSS-in-JS vs utility classes

- Tailwind utility classes for new projects: zero runtime cost,
  consistent design tokens.
- CSS-in-JS (styled-components, emotion) only when dynamic styling based
  on runtime props is a core requirement, not a nice-to-have.
- CSS Modules for isolated component styles when Tailwind is not
  available.

## Web Vitals / Performance Budget Planning

Set targets at planning time, not retrofit. A plan without a budget
cannot be checked against one.

| Metric | Good | Needs work | Poor |
|--------|------|-----------|------|
| LCP | <= 2.5s | <= 4.0s | > 4.0s |
| INP | <= 200ms | <= 500ms | > 500ms |
| CLS | <= 0.1 | <= 0.25 | > 0.25 |

### Performance budget

- Initial JS bundle: < 200KB gzipped
- Initial CSS: < 50KB gzipped
- Images: < 200KB per above-fold image
- Fonts: < 100KB total (2-3 families, 2-3 weights each)
- API p95: < 200ms
- Lighthouse Performance: >= 90

### Code splitting plan

- Route-level: `lazy(() => import('./RouteComponent'))` wrapped in
  `<Suspense>`.
- Heavy features: dynamic `import()` for charts, editors, media players.
- Above-the-fold loads immediately; below-the-fold lazy loads.

### Image strategy

- Modern formats: WebP, AVIF.
- Responsive: `srcset` + `sizes` for resolution switching.
- Explicit `width`/`height` to prevent CLS.
- Hero/LCP image: `fetchpriority="high"`, no lazy loading.
- Below-fold: `loading="lazy"` + `decoding="async"`.

## Component Hierarchy Planning

When planning component structure, work through these in order:

1. Identify the data flow: which components need which data.
2. Place state at the lowest common ancestor of all components that need
   it.
3. Design prop interfaces: what does each component need? Are there
   natural boundaries?
4. Plan loading, error, and empty states for every async data
   dependency. A component that fetches must handle all three; a
   component that receives resolved data handles none.
5. Identify shared components that should live in the design system.
6. Component size red flag: > 200 lines -> plan to split.

## Interface Design (Design It Twice)

Your first interface idea is unlikely to be the best. When planning a
new module or component API, design it at least two radically different
ways:

- **Minimize the interface.** Aim for 1-3 entry points max. Maximize
  leverage per entry point.
- **Maximize flexibility.** Support many use cases and extension paths.
- **Optimize for the most common caller.** Make the default case
  trivial; make edge cases possible but not free.

Compare on three axes:

- **Depth** -- leverage at the interface.
- **Locality** -- where change concentrates when requirements shift.
- **Seam placement** -- where testing happens.

Be opinionated: which design is strongest, and why? Record the choice
and the rejected alternative in the plan's Key Technical Decisions.

## Deep Module Design

- **Deep = small interface + lots of implementation.** Shallow modules
  (large interface + little implementation) should be avoided. If the
  interface is as complex as the implementation, the module is a
  pass-through.
- **The deletion test.** Imagine deleting the module. If complexity
  vanishes, it was a pass-through. If complexity reappears across N
  callers, it was earning its keep.
- **One adapter means a hypothetical seam. Two adapters means a real
  one.** Do not introduce a seam unless something actually varies
  across it. A single-implementation abstraction is a seam with nothing
  on the other side.
- **The interface is the test surface.** Callers and tests cross the
  same seam. If you want to test past the interface, the module is
  probably the wrong shape.

## Accessibility Planning

When planning a feature, include:

- WCAG compliance level target (typically 2.1 AA).
- Keyboard navigation architecture: focus management on route change,
  focus traps for modals, skip navigation links.
- ARIA live regions for dynamic content: `polite` / `role="status"` for
  saves; `assertive` / `role="alert"` for errors.
- Screen reader testing plan: VoiceOver (macOS), NVDA (Windows), or
  JAWS.
- Touch target sizing: >= 44x44px on mobile.
- Color contrast: >= 4.5:1 normal text, >= 3:1 large text.

Accessibility is a planning input, not a post-implementation audit. A
plan that lists the ARIA patterns and focus-management decisions up front
is verifiable; one that says "make it accessible" is not.

## Definition of Done (frontend-specific)

A frontend task is done only when:

- Code runs and behaves as intended, verified at runtime in the browser
  -- not just typechecked.
- New behavior is covered by tests that fail without the change and pass
  with it.
- Existing tests still pass; no regressions.
- Edge cases and error paths are handled: loading states, error states,
  empty states.
- Accessibility: keyboard navigation works, focus is visible, ARIA is
  correct, contrast meets targets.
- Responsive: verified at 320px, 768px, 1024px, 1440px.
- Performance: no unnecessary re-renders, bundle size within budget, Web
  Vitals in "good" range.
- Linting and formatting pass.
- Change is scoped to the task -- no unrelated refactors snuck in.
