# Frontend Review Checklist

Frontend-specific checks to fold into persona prompts when the diff touches React components, TypeScript types, CSS/Tailwind, hooks, or state management. Read this alongside `persona-catalog.md` at Stage 3 when the `frontend` signal is present; distribute the relevant sections into the matching personas' review prompts at Stage 4 dispatch.

Each rule below is a falsifiable constraint or a labelled heuristic, not generic advice. A documented repo standard always overrides a baseline rule here. Skip anything tooling (linter, type-checker, a11y auditor) already enforces.

## React Rendering Performance

- Unnecessary re-renders: a component re-renders when its parent renders but its props and state are unchanged. Flag only when the component is expensive and profiling shows the re-render cost is real. `React.memo` is the fix, not the default.
- Object/array literals created inline in JSX props force the child to re-render every render, because the prop reference changes each time. Hoist stable references to module scope with `as const`:

  ```tsx
  const STABLE_OPTIONS = [{ value: 'a' }, { value: 'b' }] as const;

  function Select() {
    return <CustomSelect options={STABLE_OPTIONS} />;
  }
  ```

- `useMemo`/`useCallback` overuse: wrapping every value and handler "just in case" adds allocation and dependency-tracking cost without benefit. Apply only where profiling shows the memoization pays for itself. Overusing is as bad as underusing.
- Context value churn: a single Context whose value object is reconstructed every render causes every consumer to re-render on any provider state change. Split into focused contexts, or select a slice with `useContextSelector` (or a `useSyncExternalStore` wrapper) so consumers re-render only on the slice they read.
- Missing virtualization for long lists: a list rendering more than ~100 DOM nodes should virtualize with `react-window` or `react-virtual`. Flag the threshold, not every mapped list.
- `useEffect` doing what should be an event handler: if an effect fires on a state change that was itself triggered by a user action, the logic belongs in the event handler, not the effect. Moving it removes a render cycle and a stale-closure risk.
- Effect dependency loops: a state update inside an effect that lists that same state in its dependency array never stops firing. The fix is to remove the state from the deps (derive instead) or move the update out of the effect.

## TypeScript Type Correctness

- `as any` casts: each one is a hole in the type system. Require an inline comment on the same line explaining why the runtime is safe when the type is not. No comment -> flag it.

  ```ts
  const el = event.target as unknown as HTMLInputElement;
  ```

- `as` assertions on a type the compiler already inferred: remove them. They add noise and suppress future type-narrowing improvements without adding safety.
- Missing discriminated union exhaustiveness: a `switch` on a union member without a `default` case that assigns to `never` will not surface a type error when a new variant is added. Require the exhaustiveness check:

  ```ts
  switch (action.type) {
    case 'add':
      return state + 1;
    case 'sub':
      return state - 1;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
  ```

- Prefer `satisfies` over a type annotation when you want the literal types preserved for consumers:

  ```ts
  const config = { retries: 3 } satisfies Config;
  ```

  `const config: Config = { retries: 3 }` widens `retries` to `number`, so a downstream `typeof config.retries` is `number` instead of `3`.

- Generic over-complexity: a generic with 3+ type parameters where none are independently varied by callers is over-generalized. Simplify to fewer parameters or inline the fixed ones.
- `unknown` at a boundary is correct, but it must be narrowed (type guard, schema validation, `instanceof`) before use. `as any` immediately after `unknown` defeats the boundary check -> flag it.
- Type duplication: the same shape defined in two files. Extract a shared type and import it; drift between the copies is a latent bug.
- `Omit`/`Pick` chains that collapse to a single type add indirection without value. If the chain resolves to a shape that could be written directly, write it directly.

## Accessibility

- Use `<button>` for actions and `<a href>` for navigation. Never use `<div onClick>` as a button: it is not keyboard-focusable, not announced as a control, and does not fire on Enter/Space.
- Icon-only buttons must carry an `aria-label` (e.g. `aria-label="Close dialog"`). No accessible name -> screen readers announce nothing or the icon class.
- Every form input must have an associated label: a `<label htmlFor>` wrapping or pointing at it, or an `aria-label`. A placeholder is not a label.
- Focus must be visible: an outline or ring on `:focus-visible`. Never `outline: none` without a replacement ring/box-shadow; keyboard users lose their position.
- Modals must trap focus while open (focus enters the dialog, Tab cycles within it) and return focus to the trigger on close.
- A skip-to-content link must be the first focusable element on the page, visible on keyboard focus (not only on mouse hover).
- Heading hierarchy: exactly one `<h1>` per page/view; no skipped levels (`<h2>` then `<h4>` is a violation).
- Touch targets on mobile must be at least 44x44px. Flag interactive elements smaller than that without a `min-h-[44px]`/`min-w-[44px]` equivalent.
- Text contrast must meet WCAG AA: >= 4.5:1 for normal text, >= 3:1 for large text (18px+ or 14px+ bold). Flag a foreground/background pair below the threshold.
- Color must not be the only channel conveying information (status, error state, selection). Add an icon, text label, or pattern so colorblind users and screen readers get the signal.
- Dynamic content changes must be announced: `aria-live="polite"` or `role="status"` for non-urgent updates (save confirmations, result counts); `aria-live="assertive"` or `role="alert"` for errors.
- `tabindex` must be `0` (add to natural order) or `-1` (focusable programmatically only). Never `> 0`: it breaks the natural tab order and is a maintenance trap.
- Form errors must be visible by more than color (icon, text, border) and associated with the field via `aria-describedby` pointing at the error message element.
- Known field types must use `autocomplete` (e.g. `type="email" autocomplete="email"`, `autocomplete="current-password"`). Missing it breaks password-manager and autofill support.
- Loading states must be marked `aria-busy="true"` and carry an `aria-label` (e.g. "Loading results") so screen-reader users know work is in progress.
- Never ship a blank screen for empty, loading, or error states. Each must show at minimum: an icon, a heading, helper text, and an action (retry, create, go back).

## Bundle Size

- Initial JS bundle must stay under ~200KB gzipped. Flag when a diff pushes it over; the number is a heuristic ceiling, not a hard cap, so cite the measured before/after when flagging.
- Whole-library imports (`import * from 'lodash'`, `import _ from 'lodash'`) pull the entire library into the bundle. Use named or deep imports so the bundler can tree-shake:

  ```ts
  import debounce from 'lodash/debounce';
  ```

- Heavy, rarely-used features (charting libraries, rich text editors, media players) must load via dynamic `import()`, not a static top-level import, so they stay out of the initial bundle.
- Route-level code splitting: each route component must be a `lazy()` import wrapped in `<Suspense>`. A static import of a route component puts the whole route in the initial bundle.
- Barrel files (`index.ts` re-exporting an entire subtree) defeat tree-shaking: the bundler cannot prove which exports are unused, so it includes all of them. Flag new barrels that re-export more than a handful of modules.
- New dependencies: check the bundle impact (size), maintenance status (last commit, open issues), license compatibility, and whether the existing stack already solves the problem. Flag a new dep that duplicates an existing capability.

## CSS / Tailwind

- Conflicting Tailwind utilities on the same element (e.g. `px-4 px-6`) resolve silently to the last one in source order, which is rarely the author's intent. Flag any duplicate property family.
- `@apply` misuse: complex chains of applied utilities inside a custom class obscure the utility intent and are hard to debug. Flag `@apply` chains longer than a few utilities, especially when they include responsive or state variants.
- Off-scale spacing values (`padding: 13px`, `margin-top: 2.3rem`) break visual rhythm. Use the project's spacing scale (Tailwind's 0.25rem increments, or the configured theme). Flag raw pixel/rem values that do not land on the scale.
- Design token inconsistency: raw hex colors (`#3b82f6`) instead of semantic tokens (`text-primary`, `bg-surface`, `border-default`). Flag raw color values; they bypass theming and drift from the system.
- Inline styles or arbitrary pixel values where a utility class exists: prefer the utility so the value stays on the scale and is consistent with the rest of the UI.
- Dead CSS variables or design tokens defined but never referenced. Flag defined-but-unused tokens in the diff; they accumulate.
- Responsive utility ordering must be mobile-first: base styles first, then `sm:`, then `lg:`. Desktop-first (`lg:grid-cols-3 sm:grid-cols-1`) overrides correctly only if every intermediate breakpoint is set, which is fragile. Flag inversions.

## State Management Anti-Patterns

- Global state overuse: state in Zustand/Redux that only one component reads and writes. State should live close to where it is used; local `useState` is the default, global is the exception.
- React Query cache invalidation anti-patterns: wrong query key shape (so a mutation does not invalidate the matching query), missing `invalidateQueries` after a mutation, or a stale cache caused by a key shape change that orphans old entries. Flag each.
- Context performance: a single giant context object whose value changes on every render re-renders all consumers. Split into focused contexts keyed by the slice that changes.
- Selector misuse: a selector that returns a new object/array reference on every call defeats referential equality and forces re-renders. Use a shallow-equality comparator (`useShallow`, `shallowEqual`) or return primitives.
- Stale state in closures: an event handler or effect capturing an old state value because it closed over it at creation time. Use a ref for the latest value, or a functional update (`setState(prev => ...)`).
- Optimistic update missing rollback: `onMutate` applies the optimistic value but `onError` does not roll back to `context.previous`. The UI shows the optimistic state permanently after a failed mutation. Flag the missing `onError`.
- Server state vs client state confusion: using Zustand/Redux to cache server data (fetch results, list pages) instead of React Query/SWR. Server cache belongs in a query cache with invalidation; client-only state (UI flags, form drafts) belongs in a store.

## React Hooks Correctness

- Effect dependency array correctness: a missing dependency causes a stale closure (the effect reads an old value); an extra dependency causes an unnecessary run. Both are bugs. Verify the array matches the reactive reads inside the effect.
- Cleanup function presence: subscriptions, timers, listeners, observers, and `IntersectionObserver`/`ResizeObserver` instances created in an effect must be cleaned up in the effect's return. A missing cleanup leaks across unmounts.
- Conditional hook calls: hooks must never be inside `if`, loops, or callbacks. React's rules-of-hooks enforcement depends on call order. If conditional logic is needed, extract a custom hook that calls the hook unconditionally and branches internally.
- `useEffect` for derived state: if a value can be computed from existing state/props during render, compute it during render. An effect that sets state from other state adds a render cycle and a stale-closure surface for no benefit.
- Custom hook over-abstraction: a hook wrapping a single API call, or a hook doing too much (fetching + caching + UI state + analytics). Extract only when the logic is reused across components or is genuinely complex enough to warrant isolation.

## Code Smells (Fowler baseline)

This table is a baseline that applies even when the repo documents no conventions. A documented repo standard always overrides it. Each smell is a labelled heuristic, never a hard violation. Skip anything tooling already enforces.

| Smell | Signal | Fix |
|-------|--------|-----|
| Mysterious Name | Function/variable whose name doesn't reveal what it does | Rename; if no honest name exists, the design is murky |
| Duplicated Code | Same logic shape in multiple places | Extract the shared shape |
| Feature Envy | Method reaches into another object's data more than its own | Move the method onto the data it envies |
| Data Clumps | Same few fields/params travel together | Bundle into one type |
| Primitive Obsession | Primitive standing in for a domain concept | Give the concept its own type |
| Repeated Switches | Same switch/if-cascade on same type recurs | Replace with polymorphism or shared map |
| Shotgun Surgery | One logical change forces scattered edits across many files | Gather what changes together into one module |
| Speculative Generality | Abstraction/parameters/hooks for needs the spec doesn't have | Delete it; inline back until a real need shows |
| Message Chains | Long `a.b().c().d()` navigation | Hide the walk behind one method |
| Middle Man | Class/function that mostly delegates onward | Cut it, call the real target directly |
| Refused Bequest | Subclass/implementer that ignores most of what it inherits | Drop inheritance, use composition |

## Change Sizing

| Size | Guidance |
|------|----------|
| ~100 lines | Good |
| ~300 lines | Acceptable if it is a single logical change |
| ~1000 lines | Too large -> split into smaller PRs |

Watch file size, not just diff size: a single file approaching ~1000 total lines is an inspection signal. Decompose the file first, then add the new code. A diff that fits the size budget by editing an already-massive file still carries the review cost of that file's surface area.
