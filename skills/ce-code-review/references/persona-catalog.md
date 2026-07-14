# Persona Catalog

9 reviewer personas organized into always-on and cross-cutting conditional layers. The orchestrator uses this catalog to select which reviewers to spawn for each review.

## Always-on (4 structured personas + 1 local prompt asset)

Spawned on every review regardless of diff content.

**Structured persona prompt assets:**

| Persona | Prompt asset | Focus |
|---------|-------|-------|
| `correctness` | `correctness-reviewer` | Logic errors, edge cases, state bugs, error propagation, intent compliance |
| `testing` | `testing-reviewer` | Coverage gaps, weak assertions, brittle tests, missing edge case tests |
| `maintainability` | `maintainability-reviewer` | Structural quality, complexity deletion, 1k-line regressions, coupling, type-boundary leaks, dead code, premature abstraction |
| `project-standards` | `project-standards-reviewer` | CLAUDE.md and AGENTS.md compliance -- frontmatter, references, naming, cross-platform portability, tool selection |

**CE local prompt asset (unstructured output, synthesized separately):**

| Prompt asset | Focus |
|-------|-------|
| `learnings-researcher` | Search docs/solutions/ for past issues related to this PR's modules and patterns |

## Conditional (4 personas)

Spawned when the orchestrator identifies relevant patterns in the diff. The orchestrator reads the full diff and reasons about selection -- this is agent judgment, not keyword matching.

| Persona | Agent | Select when diff touches... |
|---------|-------|---------------------------|
| `performance` | `performance-reviewer` | Expensive renders, unnecessary re-renders, bundle size regressions, heavy data transforms, caching layers, async/concurrent code |
| `api-contract` | `api-contract-reviewer` | Route definitions, serializer/interface changes, event schemas, exported type signatures, API versioning |
| `reliability` | `reliability-reviewer` | Error handling, retry logic, circuit breakers, timeouts, background jobs, async handlers, health checks |
| `adversarial` | `adversarial-reviewer` | Diff has >=50 changed non-test, non-generated, non-lockfile lines, OR touches auth, payments, data mutations, external API integrations, or other high-risk domains, OR adds/modifies a **silent-pass verification mechanism** — a guard whose failure mode is going green while the real thing is red: CI/CD gating logic, merge-blocking checks, build/deploy steps, coverage/lint gates, or test infrastructure/mocks that could mask production. This trigger fires on the *mechanism* independent of line count and the auth/data heuristics. Scope guard: it does **not** fire on ordinary per-feature test assertions — a unit test asserting business logic is `testing`'s job — only on gating/CI/build/deploy/harness changes |

## Selection rules

1. **Always spawn all 4 always-on personas** plus the 1 CE always-on local prompt asset.
2. **For each cross-cutting conditional persona**, the orchestrator reads the diff and decides whether the persona's domain is relevant. This is a judgment call, not a keyword match.
3. **Announce the team** before spawning with a one-line justification per conditional reviewer selected.
