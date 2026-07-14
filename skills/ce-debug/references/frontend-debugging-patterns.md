# Frontend Debugging Patterns

Patterns for debugging client-side-rendered React + TypeScript bugs. Load this when the bug involves React components, browser behavior, CSS/layout, state management, or frontend error triage.

---

## React DevTools Debugging

### Components panel

- Inspect component tree hierarchy -- verify the tree matches your mental model
- Select a component to see its props and state at the current commit
- "Highlight updates when components render" setting -- visually identifies which components re-render and when
- If a component re-renders when its props/state haven't changed, the parent is likely creating new object references inline

### Profiler panel

- Record a trace while reproducing the bug -- flame chart shows which components rendered and how long each took
- "Why did this render?" -- click a component in the flame chart to see the cause (parent rendered, props changed, state changed, context changed)
- Commit timings: a single commit > 16ms causes a dropped frame at 60fps
- Ranked chart: sorts components by render time -- identifies the most expensive component in each commit

### Common React bug patterns

| Symptom | Likely cause | Diagnostic |
|---------|-------------|------------|
| Stale state in event handler | Closure captured old state value | Add `console.log` inside the handler to see captured value; fix with functional update or ref |
| Effect runs in infinite loop | State update inside effect depending on same state | Check dependency array; remove the self-triggering dependency or guard the update |
| Component re-mounts on every render | Parent creates new component type inline or key changes every render | Check for inline component definitions (`const Foo = () => ...` inside another component) and dynamic keys |
| Context consumers re-render unnecessarily | Context value changes on every provider render | Memoize the context value or split into focused contexts |
| Form input loses focus on each keystroke | Component re-mounts because parent re-creates the input element | Check for inline component definitions or keys that change with input value |

---

## State Management Debugging

### Zustand

- Selector re-render storms: selectors returning new object references on every call -- use `useShallow` or `shallow` comparator
- Immutability violations: mutating state directly instead of creating a new object -- Zustand relies on reference equality to trigger re-renders
- Debug: log state shape on every change -- `useStore.subscribe(console.log)`

### React Query

- Stale cache: query key doesn't match between mutation invalidation and query definition -- verify key shape consistency
- Cache not invalidating: missing `queryClient.invalidateQueries` in mutation `onSuccess` -- or key shape mismatch between invalidation and query
- Infinite re-fetching: `refetchOnWindowFocus` combined with stale data and no `staleTime` -- set a `staleTime` to prevent aggressive refetching
- Debug: React Query DevTools panel shows cache state, query status, and last fetch time

### Redux Toolkit

- Selector performance: selectors creating new references on every call -- use `createSelector` for memoization
- Action not reaching reducer: check action type string matches, and that the action is dispatched (not just created)
- Debug: Redux DevTools action log shows dispatched actions and state diff

---

## CSS / Layout Debugging

### DevTools box model

- Inspect element -> Computed tab -> see actual margin/border/padding/width/height
- Check if element is using `content-box` vs `border-box` -- mismatched box-sizing causes layout surprises

### Flexbox/Grid debugging

- Flexbox: check `flex-direction`, `justify-content`, `align-items`, and `flex-grow`/`flex-shrink`/`flex-basis`
- Grid: check `grid-template-columns`/`grid-template-rows` and `gap`
- DevTools Layout pane shows flex/grid overlays

### Z-index / stacking context

- New stacking context created by: `position` other than `static` with `z-index`, `opacity < 1`, `transform`, `filter`, `will-change`, `isolation: isolate`
- Z-index only works within the same stacking context -- a child with `z-index: 9999` won't appear above a sibling of an ancestor with `z-index: 1`
- Debug: DevTools -> Layers panel shows stacking context tree

### Tailwind utility conflicts

- Conflicting utilities: `px-4 px-6` -- last class in the source order wins, not the CSS specificity
- Debug: DevTools -> Elements -> Styles pane shows which utility classes are applied and which are overridden
- Check the generated CSS in DevTools, not just the class names in the source

---

## Browser Memory Leaks

Common leak patterns in CSR React apps:

| Pattern | Leak mechanism | Fix |
|---------|---------------|-----|
| Event listener without cleanup | Listener holds reference to component, preventing GC | Remove in `useEffect` cleanup: `return () => element.removeEventListener(...)` |
| `setInterval`/`setTimeout` without cleanup | Timer callback fires after unmount, may set state on unmounted component | Clear in cleanup: `return () => clearInterval(id)` |
| DOM reference held after unmount | Ref still points to detached DOM node | Set ref to null in cleanup or rely on React's unmount |
| `ResizeObserver`/`MutationObserver` without disconnect | Observer holds reference to target element | `return () => observer.disconnect()` |
| Closure capturing large object | Event handler or effect captures a large object that should be GC'd | Use a ref or narrow the captured value |
| Promise settling after unmount | `.then()` callback sets state on unmounted component (React warning) | Use AbortController or a mounted flag |

---

## Frontend Error Triage

| Error pattern | Likely cause | First step |
|--------------|-------------|------------|
| `TypeError: Cannot read property 'x' of undefined` | Data flow: value is undefined where expected | Trace where the value originates -- API response shape, prop chain, context value |
| `TypeError: X is not a function` | Import/export mismatch or wrong `this` binding | Check import statement, verify the function is exported, check if method lost `this` context |
| CORS error | Server not sending `Access-Control-Allow-Origin` header | Check server CORS config, verify request origin matches allowed origins |
| Hydration mismatch | Server-rendered HTML differs from client render | Check for `typeof window !== 'undefined'` guards, Date/Math.random usage, or browser-only APIs in render |
| White screen (no error) | Unhandled error in render | Check error boundaries, console for swallowed errors, React DevTools for component tree state |
| "Maximum update depth exceeded" | Infinite render loop: state update in render or effect without guard | Find the `setState` call in render/effect and add a condition or remove from wrong lifecycle |

---

## Safe Fallback Patterns

Error boundary fallback:

```tsx
<ErrorBoundary fallback={<ErrorState message="Failed to load chart" onRetry={() => refetch()} />}>
  <Chart data={data} />
</ErrorBoundary>
```

Empty state fallback:

```tsx
{data.length === 0 ? (
  <EmptyState icon={<InboxIcon />} title="No tasks yet" action={<NewTaskButton />} />
) : (
  <TaskList tasks={data} />
)}
```

Safe config with warning:

```typescript
function getConfig(): Config {
  if (!window.APP_CONFIG) {
    console.warn('APP_CONFIG not found, using defaults');
    return DEFAULT_CONFIG;
  }
  return window.APP_CONFIG;
}
```

---

## Feedback Loop Construction (frontend-specific)

The feedback loop IS the skill. A tight pass/fail signal that goes red on this specific bug is 90% of the fix. Before theorizing, construct one of these loops:

| Loop type | When to use | Example |
|-----------|------------|---------|
| Failing component test | Bug is in component logic | React Testing Library test asserting the exact symptom |
| Headless browser script | Bug requires DOM interaction | Playwright script: navigate, click, assert on DOM/console/network |
| Console assertion | Bug is in render output | `console.assert` in component body checking a condition |
| DevTools Profiler trace | Bug is a performance issue | Record trace, assert no commit > 16ms |
| Network mock | Bug is in API integration | MSW handler returning a specific response shape |

Tighten the loop: make it faster (skip unrelated setup), sharper (assert the specific symptom, not "didn't crash"), more deterministic (pin time, seed RNG, freeze network).

Form 3-5 ranked falsifiable hypotheses before testing any. Single-hypothesis generation anchors on the first plausible idea. Format: "If X is the cause, then changing Y will make the bug disappear / changing Z will make it worse."

Tag every debug log with a unique prefix (e.g. `[DEBUG-a4f2]`). Cleanup becomes a single grep. Untagged logs survive; tagged logs die.
