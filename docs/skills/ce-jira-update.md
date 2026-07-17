# `ce-jira-update`

> Update a Jira ticket's description and Test Behaviors field from the current branch's PR diff. Manual-only; checks PR approval first.

`ce-jira-update` is the closer for a Jira-tracked PR: once a PR is approved, this skill reads the full branch diff, writes a layman-terms description appendix to the ticket, and fills the **Test Behaviors** custom field (`customfield_11643`) with concrete manual QA points covering each user-visible branch in the diff. It is the bridge between engineering work — committed in code, explained in the PR — and the two audiences who consume the ticket afterwards: non-technical stakeholders reading the description, and the manual QA team reading the test behaviors.

It is **manual-only** (`disable-model-invocation: true`) and never auto-dispatched by another skill. The approval gate (≥1 reviewer approval on the GitHub PR) is on by default and can be skipped with `gate:off` when needed.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | After PR approval, appends a layman description and overwrites the Test Behaviors field on the Jira ticket resolved from the current branch |
| When to use it | After a PR has at least one approval, before merge, to close the loop with stakeholders and QA |
| What it produces | Two updates on the Jira ticket: a `## What changed (from PR #<n>, <date>)` section appended to the description, and a fresh Test Behaviors block in `customfield_11643` |
| What it does not do | Transition ticket status, run tests, commit anything to the repo, or write to any tracker other than the resolved Jira ticket |

---

## The Problem

Two recurring gaps sit between an approved PR and a Jira ticket that's ready for QA:

- **Stakeholders can't read the description.** A ticket's description is usually the original problem statement, written before the work. Once the work ships, stakeholders need to know what actually changed — in plain language, not in commits. Updating the ticket by hand is tedious and easy to skip.
- **QA has no test points.** The manual QA team reads the **Test Behaviors** custom field on each ticket to know what to verify. Without a structured pass that walks the diff and pulls out each user-facing branch into its own test step, QA either gets nothing or gets a list that misses edge cases — empty states, sticky UI, regression of adjacent flows.

`ce-jira-update` addresses both in one manual invocation, after the PR is approved.

---

## The Solution

`ce-jira-update` runs as a structured pass:

1. **Resolve the Jira ticket ID** from the current branch name (`shrey/HVD-9554` → `HVD-9554`), a recent commit subject, a plan artifact's `jira_ticket:` frontmatter, or a blocking ask (required — without a ticket, there's nothing to update).
2. **Approval gate** — checks `gh pr view --json reviewDecision,reviews` for ≥1 approval on the PR for the current branch. On by default; `gate:off` skips. On a fail, prints the PR URL and stops.
3. **Gather the diff** — `git fetch` fresh base + `git diff <merge-base>...HEAD`, plus PR metadata via `gh pr view`.
4. **Fetch the existing ticket** — `mcp-atlassian_jira_get_issue` for the full description and the existing Test Behaviors field text (so idempotency checks work).
5. **Compose both updates** in one subagent dispatch — a generic subagent loaded with the bundled `references/agents/qa-test-extractor.md` persona reads the diff and returns both text blocks.
6. **Idempotency check** — if the description already contains a `## What changed (from PR #<n>` section, or the Test Behaviors field references the same PR number, ask before replacing/overwriting.
7. **Preview and apply** — blocking-question confirm, then two `mcp-atlassian_jira_update_issue` calls: one for the description (full new text, with the appendix spliced in), one for `customfield_11643` (full overwrite).

---

## What Makes It Novel

### 1. Org-wide constant, not per-user config

The Test Behaviors custom field is `customfield_11643` on this organization's Jira (`chatous.atlassian.net`). It is **hardcoded in the skill**, not user configuration. The skill states the field ID, the Jira instance, and the override path (`JIRA_TEST_BEHAVIORS_FIELD` env var, for field migrations) inline as constants. This is a deliberate departure from the plugin's usual "describe the capability, not the tool" rule — the field is genuinely org-wide, and asking each user to configure it would be friction without benefit.

### 2. Layman description with a technical-ticket carve-out

The description appendix is written for a reader who has never opened the codebase. File names, library names, component names, and technical jargon are forbidden **unless the ticket itself is technical** — `issuetype.name` is `Bug`/`Technical Task`/`Sub-task`/`Spike`, or the existing description contains code snippets, table names, or API endpoints. The skill reads the ticket's issue type and existing description to make the layman-vs-technical call, then composes accordingly.

### 3. One test bullet per branching user flow

The Test Behaviors content follows the established shape already visible on this org's tickets (e.g. HVD-9954): an `Area:` line, a one-paragraph `What changed:`, and a `What to test:` list. The coverage rule is strict: **each branching user flow with a distinct outcome gets its own bullet.** "Search returns results" vs "search returns nothing" vs "clear search" are three bullets, not one collapsed bullet. Empty states, sticky-on-scroll, permissions/sizing, and regression of adjacent flows each earn a bullet when the diff touches them. Cap at ~10 items; group sibling branches under lettered sub-items when more qualify.

### 4. MCP-only writes (no curl write fallback)

Reads can fall back to `curl` against the Jira REST API, but **writes go through the `mcp-atlassian` MCP server exclusively.** A raw `curl` write path would invite credential leakage and bypass the server's retry/validation logic. If the MCP server is unreachable, the skill stops and surfaces "Run `/ce-setup` to configure the Atlassian MCP server, then re-run `/ce-jira-update`." — it never silently falls back to `curl` for mutation.

### 5. Append-only description, full-overwrite Test Behaviors

The two fields have different update semantics:

- **Description** is append-only. The existing description body is preserved; a new `## What changed (from PR #<number>, <YYYY-MM-DD>)` section is spliced in at the end. A prior section for the same PR number triggers a replace-or-cancel prompt, never a silent double-append.
- **Test Behaviors** (`customfield_11643`) is full-overwrite. The field holds the authoritative QA list, so each run replaces it with the current diff's coverage. The idempotency check surfaces when a prior run already wrote for the same PR, and asks before overwriting — to prevent accidental loss of manual notes a human QA added.

---

## Quick Example

You finish a feature on branch `shrey/HVD-9554`, push it, open PR #4509, and get one approval. You invoke `/ce-jira-update`.

The skill resolves `HVD-9554` from the branch name. The approval gate confirms PR #4509 has `reviewDecision: APPROVED`. It fetches the diff — a new `MatchesPreview/` component, a search bar, sticky positioning, and a column expansion flag — plus the existing ticket (which has the original Slack-sourced problem statement and an empty Test Behaviors field).

A subagent reads the diff and returns:

**Description appendix** (layman, feature ticket):

> Clicking the matches cell in the Custom Classes table now opens a preview panel instead of truncated text. A search bar at the top filters the words as you type, and the list scrolls independently. The column can also expand to show full content in-table. No content is lost — every match word is reachable from the preview.

**Test Behaviors** (`customfield_11643`):

> Area: Custom Classes settings (project Settings → Custom Classes / Allowlists)
> What changed:
> The "matches" column in the Custom Classes table previously showed truncated text inline. Clicking it now opens a popover preview panel with a search bar at the top, a grid of match words below, and the ability to expand the matches column in-table.
> What to test:
> - Open a project with Custom Classes (and/or Allowlists) that have matches defined — confirm the matches cell opens the popover.
> - Search: type a substring present in the matches — only matching words remain. Type a substring with no match — "No matches" empty state appears.
> - Empty state width: when search returns nothing, the popover does not shrink/collapse (stays full width).
> - Sticky search bar: with enough matches to scroll, scroll the list — search bar stays fixed at top, content scrolls beneath.
> - Clear button: click × — all matches reappear.
> - Permissions/sizing: popover width ~72vw, doesn't overflow viewport on small screens; height doesn't exceed ~80vh.
> - Regression: other columns (class name, detect_* flags, substitutions) render unchanged; the table row click/edit flow still works.

After you confirm the preview, the skill issues two `mcp-atlassian_jira_update_issue` calls — one for the description (append), one for `customfield_11643` (overwrite) — and prints the ticket URL and PR URL.

---

## When to Reach For It

Reach for `ce-jira-update` when:

- A PR on a Jira-tracked branch has at least one approval and you're preparing the ticket for QA
- Stakeholders need a plain-language summary of what changed appended to the ticket
- The manual QA team needs concrete test points covering each branching user flow
- You want to close the loop between an approved PR and the Jira ticket without hand-writing both updates

Skip `ce-jira-update` when:

- The PR isn't approved yet — the gate fails and the skill stops. Get an approval first, or pass `gate:off` only when you have a deliberate reason to skip the check.
- The branch has no Jira ticket (no `<prefix>/<TICKET>` branch, no ticket-prefixed commit, no `jira_ticket:` in a plan). The skill stops with "No Jira ticket could be resolved."
- The `mcp-atlassian` MCP server isn't configured — run `/ce-setup` first.

---

## Chain Position

`ce-jira-update` sits at the end of the Jira-tracked PR lifecycle, after approval and before merge:

```text
/ce-brainstorm  →  /ce-plan  →  /ce-work  →  /ce-commit-push-pr  →  (approval)  →  /ce-jira-update  →  merge
        ↑                                              ↑                           ↑
   captures Jira ID                            branch + commits               updates ticket
   (Phase 0.0a)                               prefixed with ID              description + Test Behaviors
```

- **Upstream**: `/ce-brainstorm`, `/ce-plan`, and `/ce-ideate` capture the Jira ticket ID at intake (Phase 0.0a) and write it into the artifact's frontmatter as `jira_ticket:`. `/ce-commit-push-pr` and `/ce-commit` resolve the ID from the branch name or commit subject and use it for branch naming (`<prefix>/<TICKET>`) and commit/PR-title prefixing — so by the time the PR is approved, the branch carries the ticket ID deterministically.
- **This skill**: reads that ticket ID off the branch, reads the diff, and writes back to the ticket.
- **Downstream**: nothing. `ce-jira-update` is terminal — no babysit handoff, no follow-up skill dispatch. After it runs, the next step is a human merge decision.

---

## Configuration

This skill honors one config key in `<repo-root>/.compound-engineering/config.local.yaml`:

- `jira_update_approval_gate: false` — standing opt-out of the approval gate. Per-run override: `gate:off`. Default: on (any other value, missing key, or commented-out line means the gate fires).

The Test Behaviors custom field (`customfield_11643`) and the Jira ticket pattern (`^[A-Z][A-Z0-9_]+-\d+$`) are **hardcoded org-wide constants**, not config. Override the field ID only via the `JIRA_TEST_BEHAVIORS_FIELD` env var when your org migrates field IDs.

---

## See Also

- [`/ce-setup`](./ce-setup.md) — Phase 3 configures the `mcp-atlassian` MCP server this skill writes through
- [`/ce-commit-push-pr`](./ce-commit-push-pr.md) — resolves the Jira ticket ID from the branch name and prefixes commits / PR titles with it
- [`/ce-brainstorm`](./ce-brainstorm.md), [`/ce-plan`](./ce-plan.md), [`/ce-ideate`](./ce-ideate.md) — capture the Jira ticket ID at intake (Phase 0.0a) and write it into the artifact frontmatter
