# Frontend Optimization Examples

Concrete measurement harnesses, degenerate gates, experiment patterns, and audit checklists for frontend optimization targets (Web Vitals, bundle size, render performance, INP). Load this when the optimization target is a frontend performance metric.

## Web Vitals Optimization

### Core Web Vitals Targets

| Metric | Good | Needs work | Poor |
|--------|------|-----------|------|
| LCP | <= 2.5s | <= 4.0s | > 4.0s |
| INP | <= 200ms | <= 500ms | > 500ms |
| CLS | <= 0.1 | <= 0.25 | > 0.25 |

### Degenerate Gates

Abort the experiment if any gate is hit:

- LCP > 4.0s -> degenerate load
- CLS > 0.25 -> degenerate layout shift
- INP > 500ms -> degenerate interaction
- Bundle > 500KB gzipped initial -> degenerate bundle

### Measurement Harness

Lighthouse CI (synthetic, CI regression):

```bash
npx lighthouse <url> --output json --output-path ./report.json
npx lhci autorun
```

web-vitals library (RUM, real user impact):

```js
import { onLCP, onCLS } from 'web-vitals';
import { onINP } from 'web-vitals/attribution';

onLCP(metric => sendToAnalytics(metric));
onINP(metric => sendToAnalytics(metric));
onCLS(metric => sendToAnalytics(metric));
```

The INP attribution build gives `interactionTarget`, `inputDelay`, `processingDuration`, `presentationDelay`.

### Synthetic + RUM Both Required

- Lighthouse/DevTools Performance tab (synthetic, CI regression)
- `web-vitals` library/CrUX (RUM, validates real user impact)
- Field and lab are NOT interchangeable -- treating them as same is a form of fabrication

### Experiment Patterns

| Optimization | Hard metric | Harness | What to vary |
|-------------|-------------|---------|--------------|
| LCP improvement | LCP (ms) | Lighthouse + web-vitals | Image format, preload hints, fetchpriority, font loading |
| CLS reduction | CLS score | Lighthouse + web-vitals | Explicit dimensions, font-display, content-visibility |
| INP improvement | INP (ms) | web-vitals/attribution + DevTools trace | Long task splitting, scheduler.yield, memoization |
| Bundle reduction | KB gzipped | vite-bundle-visualizer / webpack-bundle-analyzer | Code splitting, tree-shaking, dependency replacement |
| Render performance | Commit time (ms) | React DevTools Profiler | Memoization, context splitting, virtualization |

## Bundle Size Optimization

### Performance Budget

- Initial JS: < 200KB gzipped
- Initial CSS: < 50KB gzipped
- Images: < 200KB per above-fold image
- Fonts: < 100KB total (2-3 families, 2-3 weights)
- API p95: < 200ms

### Bundle Analysis Harness

```bash
npx vite-bundle-visualizer
npx webpack-bundle-analyzer stats.json
npx bundlesize --config bundlesize.config.json
```

### Experiment Patterns

- Route-level code splitting: `lazy(() => import('./RouteComponent'))` wrapped in `<Suspense>`
- Heavy feature lazy loading: dynamic `import()` for charts, editors, media players
- Tree-shaking verification: verify dependency ships ESM and marks `sideEffects: false` in package.json
- Dependency replacement: `lodash` -> `lodash-es` (tree-shakeable) or individual function imports
- Barrel file audit: barrel files re-exporting entire subtrees defeat tree-shaking -- replace with direct imports

### Anti-Patterns To Flag

- `import * from 'lodash'` -> use `import debounce from 'lodash/debounce'`
- Missing dynamic import for heavy rare features
- Barrel files re-exporting everything
- New dependencies added without bundle impact check

## Render Performance Optimization

### React DevTools Profiler As Measurement Harness

1. Record a trace while reproducing the interaction
2. Flame chart shows which components rendered and how long
3. Ranked chart sorts by render time -- identifies the most expensive component
4. "Why did this render?" shows the cause (parent rendered, props changed, state changed, context changed)

**Degenerate gate:** any single commit > 16ms causes a dropped frame at 60fps.

### Experiment Patterns

| Problem | Experiment | Measure |
|---------|-----------|---------|
| Unnecessary re-renders | Add `React.memo` on expensive component | Profiler commit count + time |
| Context value churn | Split context into focused contexts | Number of consumers re-rendering |
| Inline object props | Hoist stable references to module scope | Profiler "why did this render" -> props changed? |
| Long list rendering | Add `react-window` virtualization | Profiler render time for scroll interaction |
| Expensive computation | Add `useMemo` (only where profiling shows benefit) | Profiler render time |

### AI-Generated Anti-Patterns (Rendering)

- State duplication instead of lifting
- `React.memo`/`useMemo`/`useCallback` wrapping everything "just in case" (cost without benefit, can hurt perf)
- Over-eager `useEffect` dependencies causing redundant re-renders or update loops
- `scroll`/`resize` listeners without `passive: true` or debounce

### AI-Generated Anti-Patterns (Network)

- Over-fetching data "just in case"
- Sequential `await`s when `Promise.all` would work
- Redundant API calls where one would suffice -- missing deduplication

## INP Optimization Workflow

INP (Interaction to Next Paint) measures responsiveness. Optimize in this order:

1. **Field data first:** check CrUX or RUM tool for real-user INP before optimizing
2. **Identify slow interactions:** DevTools -> Performance panel -> record while interacting; look for long tasks > 50ms triggered by clicks/keystrokes
3. **Test on mid-range Android:** INP issues often only surface on slower hardware; use real device or DevTools CPU throttling (4x-6x slowdown)
4. **INP attribution:** `import { onINP } from 'web-vitals/attribution'` to get `interactionTarget`, `inputDelay`, `processingDuration`, `presentationDelay`

### Long Task Splitting

- Long tasks > 50ms block the main thread and delay INP
- Use `scheduler.yield()` (preferred), `scheduler.postTask()` with priorities, or `isInputPending()` to yield between chunks
- `requestIdleCallback` for deferrable non-urgent work (analytics flush, prefetch, warmup)
- Defer non-critical work out of event handlers (analytics, logging) so the interaction response is not delayed

## Image Optimization

### LCP Hero Image

```html
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" width="1200" height="630" fetchpriority="high" alt="...">
</picture>
```

- Modern formats: AVIF, WebP
- Explicit `width`/`height` to prevent CLS
- `fetchpriority="high"` and NO lazy loading for LCP images

### Below-Fold Images

```html
<img src="photo.jpg" width="800" height="600" loading="lazy" decoding="async" alt="...">
```

### Responsive Images

```html
<img srcset="photo-480w.jpg 480w, photo-800w.jpg 800w, photo-1200w.jpg 1200w"
     sizes="(max-width: 600px) 480px, (max-width: 900px) 800px, 1200px"
     src="photo-800w.jpg" alt="...">
```

## Font Optimization

- Limit to 2-3 font families, 2-3 weights each
- WOFF2 format only (skip WOFF/TTF/EOT)
- Self-hosted (third-party font CDNs add DNS + TCP + TLS round-trips)
- Preload LCP-critical fonts: `<link rel="preload" as="font" type="font/woff2" crossorigin>`
- `font-display: swap` (or `optional` for non-critical)
- Subset via `unicode-range` to ship only needed glyphs
- Consider variable fonts when multiple weights/styles are required
- Adjust fallback metrics with `size-adjust`, `ascent-override`, `descent-override` to reduce CLS on font swap
- Consider system font stack first

## Performance Audit Checklist

### JavaScript

- Bundle < 200KB gzipped initial load
- Code splitting with dynamic `import()` for routes and heavy features
- Tree shaking verified (ESM + `sideEffects: false`)
- No blocking JS in `<head>` (use `defer` or `async`)
- Heavy computation offloaded to Web Workers
- `React.memo` only on expensive same-props re-renders
- `useMemo`/`useCallback` only where profiling shows benefit
- Long tasks > 50ms broken up (main lever for INP)
- Third-party scripts with `async`/`defer` + facade when heavy

### CSS

- Critical CSS inlined or preloaded
- No render-blocking CSS for non-critical styles
- No CSS-in-JS runtime cost in production (use extraction)

### Rendering

- No layout thrashing (forced synchronous layouts)
- Animations use `transform` and `opacity` (GPU-accelerated)
- Long lists virtualized (`react-window`)
- No unnecessary full-page re-renders
- `content-visibility: auto` + `contain-intrinsic-size` for off-screen sections
- No `unload` handlers and no `Cache-Control: no-store` on HTML (preserves bfcache)

### Network

- Static assets cached with long `max-age` + content hashing
- HTTP/2 or HTTP/3 enabled
- `preconnect` for known origins
- `fetchpriority` on critical non-image resources
- No unnecessary redirects

## Severity Classification For Optimization Findings

| Severity | Criteria | Action |
|----------|---------|--------|
| Critical | Directly causes CWV to fail "Good" threshold | Fix before release |
| High | Likely degrades CWV or significant slowdown | Fix before release |
| Medium | Suboptimal, measurable but contained | Fix in current sprint |
| Low | Best practice gap, minor/speculative | Next sprint |
| Info | Improvement opportunity, no current evidence | Consider |
