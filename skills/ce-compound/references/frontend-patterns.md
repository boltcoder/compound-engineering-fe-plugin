# Frontend Patterns

Frontend-specific guidance for documenting solved problems. Read this when the learning touches React, TypeScript, CSS, accessibility, bundling, or browser performance — alongside `yaml-schema.md` (category mapping) and `schema.yaml` (frontmatter contract).

## Frontend Solution Categories

When documenting a solved frontend problem, use these categories in addition to the existing `ui-bugs/` category:

| Category | Use for |
|----------|---------|
| `rendering-performance/` | React re-render issues, memoization decisions, context value churn, virtualization |
| `accessibility/` | ARIA bugs, screen reader issues, keyboard navigation fixes, contrast violations |
| `bundle-size/` | Import bloat, tree-shaking failures, dependency weight, code splitting decisions |
| `state-management/` | Zustand/Redux/React Query issues, cache invalidation patterns, selector performance |
| `css-architecture/` | Tailwind conflicts, specificity issues, design token problems, responsive layout bugs |
| `typescript-patterns/` | Type narrowing issues, discriminated union patterns, generic design decisions |
| `hooks-architecture/` | Effect dependency issues, custom hook design, cleanup patterns |

These are subdirectory suggestions under `docs/solutions/`, not new `problem_type` enum values. The `problem_type` frontmatter field still comes from `schema.yaml`; the directory is where the doc lands.

## Frontend Anti-Patterns Catalog

When pattern-matching a solved problem against known anti-patterns, use this catalog:

| Anti-pattern | Symptom | Root cause | Fix pattern |
|--------------|---------|-----------|-------------|
| Prop drilling | Props passed through 3+ levels | State placed too high | Move state lower, use composition, or context |
| Context overuse | All state in one giant Context | Treating context as a global store | Split into focused contexts or use Zustand |
| Effect loops | Effect fires infinitely | State update in effect depending on same state | Guard the update or remove self-triggering dependency |
| Stale closures | Event handler uses old state value | Closure captured state at render time | Use functional update or ref |
| Over-decomposition | Many tiny components used once | Premature extraction | Inline until pattern repeats |
| Memoization misuse | `React.memo`/`useMemo` everywhere | Treating memoization as free optimization | Remove where profiling shows no benefit |
| Render prop abuse | Nested render props for simple logic | Over-applying the pattern | Use hooks or composition instead |
| Hook dependency errors | Effect doesn't fire or fires too often | Wrong dependency array | Fix the array; use `useCallback`/`useMemo` for stable refs |
| Global state overuse | Everything in Redux/Zustand | Treating global state as default | Use local state when state is component-scoped |
| Server state in client store | API data in Redux/Zustand | Confusing server cache with client state | Use React Query/SWR for server state |
| Barrel file bloat | Bundle includes unused exports | Re-exporting entire subtrees | Use direct imports or entry points |
| Inline object props | Child re-renders every parent render | New object reference each render | Hoist to module scope as `as const` |

## Frontend Solution Template

When documenting a frontend bug fix, include these fields in the solution. The `module` value should match the category the doc lands in (`rendering-performance`, `accessibility`, `bundle-size`, `state-management`, `css-architecture`, `typescript-patterns`, `hooks-architecture`):

```yaml
---
module: rendering-performance
tags: [react, useMemo, context, re-render]
problem_type: bug
---

# [Title: describe the symptom, not the fix]

## Symptom
[What the user/developer observed — e.g. "Dashboard takes 3s to become interactive after navigation"]

## Root Cause
[The causal chain — e.g. "Context value created inline in provider -> all 47 consumers re-render on any state change -> each consumer computes expensive derived data"]

## Fix
[What was changed and why — e.g. "Split AppContext into UserContext and ThemeContext. Memoized context values with useMemo. Moved derived data computation into selectors."]

## Prevention
[How to prevent recurrence — e.g. "Check context consumer count with React DevTools Profiler before adding new consumers. Use selector-based subscription (Zustand) for contexts with > 10 consumers."]

## Verification
[How the fix was verified — e.g. "React DevTools Profiler: commit count reduced from 47 to 3 on state change. Lighthouse INP: 450ms -> 120ms."]
```

## Frontend Pattern Recognition Signals

When scanning a codebase for patterns to document:

### Rendering performance signals
- Component files > 200 lines (decomposition candidate)
- `useEffect` with no dependency array or `[]` with state references inside
- `React.memo` wrapping every component export
- Context provider wrapping the entire app with a large value object
- `useState` followed by `useEffect` that derives from that state (should compute during render)

### State management signals
- Multiple `useState` calls that are always updated together (should be a single `useReducer` or object state)
- Redux/Zustand store containing data that came from an API (should be in React Query)
- React Query `queryKey` that doesn't include all variables the query depends on
- `queryClient.invalidateQueries` with a broader key than the mutation affects

### Accessibility signals
- `<div onClick>` without `role="button"` and `tabIndex={0}` (should be `<button>`)
- `aria-label` on elements that have visible text (redundant)
- `alt=""` on images that convey information (should have descriptive alt)
- `tabindex` values > 0 (breaks tab order)

### Bundle size signals
- `import * from` statements (whole-library imports)
- No `lazy()` or dynamic `import()` in route definitions
- `index.ts` files re-exporting everything from a directory (barrel files)
- Dependencies in `package.json` that overlap in functionality (e.g. both `lodash` and `underscore`)

### TypeScript signals
- `as any` casts (each one is a type hole)
- `as unknown as T` double assertions (almost always wrong type boundary)
- `interface` with optional fields that should be a discriminated union
- Generic functions with 3+ type parameters that are never independently varied

## Frontend Documentation Sources

When researching frontend framework documentation:

| Source | Use for |
|--------|---------|
| react.dev | React hooks, components, patterns, API reference |
| developer.mozilla.org | Web APIs, CSS, HTML, JavaScript |
| web.dev | Performance, Web Vitals, accessibility, progressive enhancement |
| Chrome DevTools docs | Profiling, debugging, performance analysis |
| Tailwind CSS docs | Utility classes, configuration, responsive design |
| React Query docs | Caching, invalidation, optimistic updates, query keys |
| Zustand docs | Store setup, selectors, middleware |
| TypeScript docs | Type narrowing, generics, type operators |
| MDN Web Docs | Browser compatibility, API reference |
