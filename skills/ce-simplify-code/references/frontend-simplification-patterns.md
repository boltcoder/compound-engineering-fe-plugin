# Frontend Simplification Patterns

Frontend-specific simplification patterns to fold into the reviewer prompts when the scope touches React components, TypeScript types, or CSS/Tailwind. Read this alongside the three reviewer personas in Step 2 when the resolved scope contains frontend code; distribute the relevant sections into the matching reviewers' prompts at dispatch.

Each rule below is a falsifiable constraint or a labelled heuristic, not generic advice. A documented repo standard always overrides a baseline rule here. Skip anything tooling (linter, type-checker) already enforces. Every rule is gated by the skill-wide behavior-preservation and over-simplification balance: if removing a construct would change behavior or remove a named concept that aids readability, skip it.

## React Simplification Patterns

### Remove unnecessary memoization

- `useMemo` wrapping a cheap computation (primitive arithmetic, string concatenation, a small array operation) is pure overhead. Remove it; the dependency-tracking and allocation cost exceeds the recomputation cost.
- `useCallback` wrapping a callback that is only passed to a native DOM element (not a child component) does nothing. Native elements do not compare prop references. Remove it.
- `React.memo` on a component that renders cheaply, or whose props change on every parent render, costs more in the comparison than it saves in skipped renders. Remove it.
- If removing `React.memo` exposes a real performance problem, the memoization was masking it. The actual fix is the parent's unnecessary re-renders, not the missing memo. Fix the source.

### Split giant contexts

- One Context providing many values forces every consumer to re-render when any single value changes, even values it does not read.
- Split into focused contexts (`ThemeContext`, `UserContext`, `LocaleContext`) so a consumer re-renders only on the slice it reads.
- If the split produces more than three contexts or the subscription logic grows complex, replace Context with a store that supports selector-based subscription (Zustand, `useSyncExternalStore`). The selector is the real fix; the split is the halfway point.

### Prop drilling assessment

- Shallow prop drilling (1-2 levels) is fine. Do not reach for Context or a store to avoid it; the indirection costs more than the drilling.
- Deep prop drilling (3+ levels) is a signal, not an automatic fix. Either the component tree is wrong and the state should live lower, or Context is warranted. Diagnose which before adding a provider.
- Composition can replace drilling: pass children as render props, or use compound components so the parent assembles and the children pull what they need.

### Custom hook over-abstraction

- A hook that wraps a single `useState` call adds a name and a file for no leverage. Inline it.
- A hook doing too much (fetching + transforming + caching + UI state) mixes concerns that change at different rates. Split into focused hooks, one per concern.
- A hook extracted for a single call site with no real complexity is speculative. Inline until a second use case or genuine complexity emerges.

### State colocation

- State lifted to a parent that does not read it, only passes it down, is misplaced. Move it to the child that owns it.
- Server state duplicated into component state when React Query/SWR is available is a second source of truth. Use the cache layer; do not copy server data into `useState`.
- Derived state stored in `useState` and synced via `useEffect` is a re-render cycle and a stale-closure surface for nothing. Compute it during render:

  ```tsx
  const filtered = items.filter((i) => i.active);
  ```

  not `useState` + `useEffect`.

### Component over-decomposition

- A component extracted for a single use case with three lines of JSX adds a file and a prop boundary for no reuse. Inline it.
- A wrapper component that adds no behavior and only forwards props is a pass-through. Remove it; call the target directly.
- Premature extraction before the API shape is clear freezes a bad interface. Wait until the pattern repeats, then extract.

### Conditional rendering simplification

Two branches with duplicated structure:

```tsx
{isLoading ? <Badge variant="secondary">Loading</Badge> : <Badge variant="default">Ready</Badge>}
```

Derive the variant and render once:

```tsx
const variant = isLoading ? 'secondary' : 'default';
return <Badge variant={variant}>{isLoading ? 'Loading' : 'Ready'}</Badge>;
```

The rule: when two render branches differ only in props, not in structure, derive the props and collapse to a single element.

## TypeScript Simplification Patterns

### Remove type duplication

- The same shape defined in two files drifts. Extract a shared type and import it.
- `Omit`/`Pick` chains that collapse to a single writable type add indirection without value. If the chain resolves to a shape that could be written directly, write it directly.
- Redundant `as` assertions on a type the compiler already inferred add noise and suppress future narrowing. Remove them.

### Simplify generics

- A generic with 3+ type parameters where none are independently varied by callers is over-generalized. Reduce to fewer, or inline the fixed ones.
- An unnecessarily tight constraint that could be simpler: `<T extends Record<string, unknown>>` when `<T extends object>` suffices. Loosen it.
- A default type parameter that every caller overrides is dead config. Remove the default.

### Use `satisfies` over type annotation

Type annotation widens the literal types:

```typescript
const config: ButtonVariant = { primary: 'bg-blue-500', secondary: 'bg-gray-500' };
```

`satisfies` validates against the type while preserving the literal types for consumers:

```typescript
const config = { primary: 'bg-blue-500', secondary: 'bg-gray-500' } satisfies ButtonVariant;
```

The rule: use `satisfies` when you want the check but need the literals; use an annotation when you intend to widen.

### Reduce type assertions

- `as any` is a hole in the type system. Remove it, or replace with a type guard that proves the runtime shape.
- `as unknown as T` (double assertion) is almost always a wrong type boundary. Fix the boundary so a single assertion or none suffices.
- `as` on an already-inferred type adds noise and blocks future compiler narrowing. Remove it.

### Discriminated unions over loose unions

Loose union with no exhaustiveness checking:

```typescript
type Action = { type: string; payload?: unknown };
```

Discriminated union with exhaustiveness enforced:

```typescript
type Action =
  | { type: 'add'; payload: Item }
  | { type: 'remove'; payload: string }
  | { type: 'clear' };
```

The rule: a `type` field that is a `string` admits any value and defeats `switch` exhaustiveness. Narrow it to a literal union so a missing case is a compile error.

### Remove unnecessary `async`/`await`

- An `async function` that only wraps `return await promise` adds a promise layer for nothing. Drop `async`/`await` and return the promise directly.
- `await` on a value that is not a promise (a synchronous result, or a promise already resolved by the time it is read) is dead syntax. Remove it.

## CSS / Tailwind Simplification

### Redundant utility classes

- `px-4 px-6` on the same element: the last wins silently in source order. Remove the unused one.
- `block flex`: `flex` already sets `display: flex`. Remove `block`.
- `font-bold font-semibold`: last wins. Remove the unused one.

The general rule: two utilities from the same property family on one element resolve to the last in source order. Flag any duplicate family.

### Consolidate component variants

Multiple button components with slightly different class strings are copy-paste. Consolidate with a variant map:

```typescript
const variants = {
  primary: 'bg-blue-500 text-white hover:bg-blue-600',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  danger: 'bg-red-500 text-white hover:bg-red-600',
} as const;
```

The rule: when N components differ only in a class string keyed by a label, one component plus a variant map replaces them.

### Dead design tokens

- CSS variables defined in `:root` or Tailwind config but never referenced accumulate. Remove them.
- Custom colors that duplicate Tailwind's default palette bypass the system for no gain. Use the default.

### Simplify responsive class chains

Verbose responsive chain:

```tsx
<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-6" />
```

If the pattern repeats project-wide, extract a component:

```tsx
<Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={{ base: 2, sm: 4, lg: 6 }} />
```

The rule: a responsive grid chain repeated across files is the signal to extract. A single instance is not.

## Deep Module Vocabulary

When evaluating whether a module or component is the right shape, use these terms.

| Term | Meaning |
|------|---------|
| Module | Anything with an interface and implementation: function, class, package, component |
| Interface | Everything a caller must know to use the module: type signature, invariants, ordering constraints, error modes |
| Depth | Leverage at the interface. Deep = large behavior behind a small interface; shallow = interface nearly as complex as implementation |
| Seam | A place where you can alter behavior without editing in that place |
| Adapter | A concrete thing that satisfies an interface at a seam |
| Leverage | What callers get from depth: more capability per unit of interface learned |
| Locality | What maintainers get from depth: change, bugs, knowledge, and verification concentrate in one place |

**The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.

**One adapter means a hypothetical seam. Two adapters means a real one.** Do not introduce a seam unless something actually varies across it. A single implementation is not a seam; it is a boundary waiting for a reason.

### TypeScript testability patterns

- Accept dependencies, do not create them. `function processOrder(order, paymentGateway)` is testable; `function processOrder(order) { const gateway = new StripeGateway() }` is not.
- Return results, do not produce side effects. `function calculateDiscount(cart): Discount` is testable; `function applyDiscount(cart): void { cart.total -= discount }` is not.
- Small surface area: fewer methods means fewer tests needed; fewer params means simpler test setup.

## Structural Complexity Signals

| Signal | Threshold | Fix |
|--------|-----------|-----|
| Deep nesting | 3+ levels | Guard clauses or extract a helper |
| Long function | 50+ lines | Split by responsibility |
| Nested ternaries | 2+ levels | if/else, switch, or a lookup object |
| Boolean parameter flags | `doThing(true, false, true)` | Options object or separate functions |
| Repeated conditionals | Same check in multiple places | Predicate function or type narrowing |
| Component size | 200+ lines | Split by responsibility |

Each threshold is a labelled heuristic, not a hard limit. A 55-line function that does one thing is fine; a 30-line function doing three is not. Judge by responsibility count, not line count.

## Over-Simplification Traps

- Inlining too aggressively removes a named concept that aids readability. A helper that names a concept stays.
- Combining unrelated logic turns two simple things into one complex thing. Splitting by responsibility can mean splitting a function.
- Removing an "unnecessary" abstraction that exists for extensibility or testability removes a real seam. Confirm the purpose is obsolete (check `git blame`) before removing.
- Optimizing for line count instead of clarity. Fewer lines is not the goal; faster comprehension is.
- Simplifying code you do not understand. Understand first, then simplify, or skip.
- Batching simplifications into one change. Apply one simplification at a time and run tests after each, so a regression points to a single change.
