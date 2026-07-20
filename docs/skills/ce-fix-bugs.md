# `ce-fix-bugs`

> Walk through every open checklist item on a Jira ticket, fix each one with a per-item commit, and flip each fixed item to `qa ready` via the Jira UI. Manual-only; one branch per ticket.

`ce-fix-bugs` reads the **Checklist Text** custom field on a Jira ticket and works through every `open`/`reopen` item one at a time. For each item, the skill decides whether it's bug-shaped or feature-shaped, dispatches `/ce-debug` or `/ce-work` accordingly, and lands a per-item commit whose subject identifies the ticket and item number (`HVD-9954 - Checklist item #1 - clear X icon no longer overlaps typed text`). All commits for one ticket stack on a single `<prefix>/<TICKET>-checklist` branch; one PR per ticket.

After the user reviews and approves the PR, the skill drives the Jira UI through `agent-browser` to flip each worked-on item to `qa ready` — through the dropdown, not through the markdown field — so the ticket's progress bar and "All Completed" string reflect reality and the manual QA team sees the right status.

It is **manual-only** (`disable-model-invocation: true`) and never auto-dispatched by another skill.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Iterates the open items on a Jira ticket's checklist, fixes each via `/ce-debug` or `/ce-work`, lands one commit per item on a single per-ticket branch, then flips each fixed item to `qa ready` via the Jira UI |
| When to use it | When a Jira ticket has a checklist (the **Issue Checklist for Jira** app by Gebsun) and you want to walk through every open item methodically, one PR per ticket |
| What it produces | One branch per ticket with N per-item commits, one PR per ticket, and N flipped checklist items (one per fixed item) |
| What it does not do | Transition the ticket's overall status, edit the Test Behaviors field, or auto-dispatch — all three are `ce-jira-update`'s job after the PR is approved |

---

## The Problem

When a ticket has a long checklist of open items, three things go wrong in practice:

- **They pile up.** Without a disciplined loop, engineers cherry-pick the easy items, leave the hard ones in `open`, and the checklist drifts further from "All Completed" every sprint. The ticket never closes cleanly.
- **Items blur into one giant commit.** A developer fixes three unrelated checklist items in one commit, and the per-item context (which fix matched which bug) is lost. When the QA team looks at the diff, they can't trace a regression back to its checklist entry.
- **`qa ready` is invisible.** Even when items are fixed, the manual QA team reads the **dropdown state** (the colored badge each item shows in the Jira UI), not the markdown text. Until that dropdown says `qa ready`, the QA team doesn't know the item is done.

`ce-fix-bugs` addresses all three in one manual invocation per ticket.

---

## The Solution

`ce-fix-bugs` runs as a structured pass per ticket:

1. **Resolve and validate the ticket ID.** Strip any `#` or `-<suffix>` per `ce-jira-update`'s normalization rules; validate against `^[A-Z][A-Z0-9_]+-\d+$`. Ask once if blank.
2. **Fetch the ticket** through `mcp-atlassian_jira_get_issue` for the summary, description, and the checklist fields (`customfield_11627`, `customfield_11613`, `customfield_11628`, `customfield_11629`). Stop if there's no checklist or the MCP server is unreachable.
3. **Parse and present** the items. Recognize the canonical markdown shape:
   ```
   # Default checklist
   * [open] 1. <body>
   * [open] 2. <body>
   * [reopen] 3. <body>
   ```
   Filter to actionable items (state `open` or `reopen`); list the rest without working on them.
4. **Set up the working branch.** One branch per ticket: `<pr-prefix>/<TICKET>-checklist` (e.g. `shrey/HVD-9954-checklist`). All per-item commits land on this branch.
5. **Per-item loop.** For each actionable item, in order:
   - **Route** to `/ce-debug` (bug-shaped) or `/ce-work` (feature-shaped). Ask if ambiguous.
   - **Commit** with the canonical per-item subject: `<TICKET> - Checklist item #N - <fix>`.
   - **Annotate** the markdown in `customfield_11627` for any skipped items (`(SKIPPED: REASON)`); leave state tokens alone (the app's progress counters read only `[done]`).
6. **Push and ask for review.** Print the running tally (`fixed: N / skipped: N / failed: N / branch / commits`); ask whether to open the PR, leave the branch local, or push and drive the UI first.
7. **Flip fixed items to `qa ready` via the Jira UI.** This step deliberately leaves the `mcp-atlassian` MCP server — the Forge app's per-item status enum lives in the app's private storage, not in any custom field the REST API exposes. Empirically: writing `* [qa ready]` to `customfield_11627` updates the markdown text, but `customfield_11613` stays `"Not Completed"` and `customfield_11629` stays `0.0`. Only the Jira UI dropdown moves the authoritative state. Use `agent-browser` to drive the dropdown, re-read the progress fields to verify each flip, then write `customfield_11627` one last time so the markdown reflects the new state.

---

## What Makes It Novel

### 1. One branch per ticket, one commit per item

The branch carries the ticket ID so `ce-commit-push-pr` can resolve it deterministically. Each per-item commit's subject identifies both the ticket and the item number (`HVD-9954 - Checklist item #1 - ...`), so a future reader can `git log --grep "HVD-9954 - Checklist item"` and find exactly the fix for exactly the item they're tracing. The PR description is generated by `ce-commit-push-pr` from the diff; this skill never hand-writes it.

### 2. The Forge-app status enum is not on REST

The **Issue Checklist for Jira** app stores the per-item status enum (`open`, `in progress`, `skipped`, `done`, `qa ready`, `reopen`) in the Forge app's private storage. `customfield_11627` is just a textarea that holds the markdown source — the app renders its dropdown from that text but tracks the dropdown's authoritative state in app storage, not in the field. So:

- Editing the markdown text in `customfield_11627` is fine for **skipped annotations** and for **showing `[qa ready]` after a flip** — but writing `* [qa ready]` does NOT move the dropdown UI, and it does NOT update `customfield_11613` / `customfield_11629`.
- To flip the dropdown, you must drive the Jira UI. `agent-browser` is the required tool; if it's missing, the skill pre-fails with the `/ce-setup` install line.

The skill accounts for this explicitly: Step 7 (the flip) goes through `agent-browser`, and the final markdown rewrite happens AFTER the UI flips land — so the markdown stays a faithful mirror of the authoritative state.

### 3. Skip annotations, not skip tokens

A skipped item stays `open` in the markdown — only its text gets a `(SKIPPED: REASON)` annotation appended. Why: the app's progress counters (`customfield_11613` / `customfield_11628` / `customfield_11629`) count only `[done]` items, and the QA team's view is driven by the dropdown, but a skipped item's `[open]` token is what tells the next reader "this was considered, deliberately skipped, not yet done" — switching the token to `[skipped]` would falsely imply the app's progress has advanced. The annotation is uppercase-by-convention and ASCII-letter-constrained so the reason reads cleanly in any text view.

### 4. Bug vs feature routing

A "no Maches left aligned" item is a polish request, not a bug; an "unable to type after clicking search icon" item is a bug. The skill uses a heuristic, not a strict rule:

- **Bug-shaped** (broken behavior, wrong output, unexpected state, error) → `/ce-debug`.
- **Feature-shaped** (new control, polish to spec, alignment to design intent, feature gap) → `/ce-work`.
- **Ambiguous** → ask once via the platform's blocking question tool.

Trivial items (one-line CSS, a typo, a label change) still route through one of the two — there is no third "trivial" path, because inventing one would defeat the per-item commit hygiene (every item deserves a delegated skill that owns its `git diff`).

### 5. MCP-only writes (no curl fallback)

The skill reads through `mcp-atlassian_jira_get_issue` and writes the markdown through `mcp-atlassian_jira_update_issue`. The UI flip in Step 7 is the only path that leaves the MCP server — and it does so on purpose, because REST cannot reach the Forge app's status enum. If the MCP server is unreachable, the skill stops with `/ce-setup` guidance; it never silently falls back to `curl`.

### 6. The skill is pure instructions — no companion script

Per the team's decision (see the conversation that produced this skill), `ce-fix-bugs` is **markdown-only**: parsing, state tracking, commit sequencing, and MCP writes are all done inline by the LLM. There is no `scripts/parse-checklist.py` or `scripts/flip-to-qa-ready.ts`. The reasoning is that the per-item decision (route, commit subject, branch name, skip-reason uppercase normalisation) is LLM judgment at every step, and a companion script would either re-implement the judgment or hand the LLM data the script can't yet understand. Keeping the skill instructions-only means the LLM owns the decision end-to-end and the contract is "read this SKILL.md and follow it."

---

## Quick Example

You invoke `/ce-fix-bugs HVD-9954` on a ticket whose `customfield_11627` is:

```
# Default checklist
* [open] 1. Searching for random long name  clear "X"  icon overlapped on typed string on the search field.
* [open] 2. "No Maches" string below search is slightly left aligned to search bar.
* [open] 3. When type in the search bar and click on Search icon the "X" (clear) icon is animated at the beginning of the search bar instead of at the end. After this, i am unable  to type anything in the search field and need to click again to continue typing.
```

The skill resolves `HVD-9954`, fetches the ticket, parses three `open` items, sets up `shrey/HVD-9954-checklist`, and walks the loop:

- **Item #1** — bug-shaped (icon overlap). Routed to `/ce-debug`. The delegated skill traces the issue to the search input's right padding, fixes it, returns. Commit `HVD-9954 - Checklist item 1 - clear X icon no longer overlaps typed text`.
- **Item #2** — alignment, but the user types `skip 2 — already fixed in another ticket, see #HVD-9931`. The reason is uppercased to `ALREADY FIXED IN ANOTHER TICKET, SEE #HVD-9931` and appended inside parens at the end of item #2's text in the rewritten `customfield_11627`. No commit.
- **Item #3** — bug-shaped (icon position + broken re-focus). Routed to `/ce-debug`. The delegated skill fixes the animation order and the focus restoration. Commit `HVD-9954 - Checklist item 3 - clear X icon stays at end after typing and re-focus is restored`.

Loop summary: `fixed: 2, skipped: 1, failed: 0, branch: shrey/HVD-9954-checklist, commits: 2`. The user picks "open the PR"; `/ce-commit-push-pr` opens PR #4512. The user picks "drive the UI to mark fixed items as qa ready"; `agent-browser` flips items #1 and #3 to `qa ready`, the skill re-reads `customfield_11629` to verify the progress percent moved, then writes `customfield_11627` one last time with `[open]` → `[qa ready]` for items #1 and #3 (item #2's text keeps its `SKIPPED: ...` annotation; its state token stays `open`).

The user then runs `/ce-jira-update` on PR #4512 to flip the ticket's overall status and write the Test Behaviors block.

---

## When to Reach For It

Reach for `ce-fix-bugs` when:

- A Jira ticket has a checklist (`customfield_11627` is non-empty) and you want to methodically work every open item to closure, with one PR per ticket.
- The manual QA team reads per-item dropdown state (`qa ready` / `done`) and you want to flip each item's dropdown for them as you ship its fix.
- You want per-item commits so the diff for each checklist entry is reviewable in isolation.

Skip `ce-fix-bugs` when:

- The ticket has no checklist — the skill stops with a clear message. Use `/ce-brainstorm` or `/ce-plan` instead.
- You're working a single bug-shaped item from a non-Jira source (a Slack thread, a paper note) — reach for `/ce-debug` directly.
- You only want to update the ticket's description or Test Behaviors after the PR is approved — that's `/ce-jira-update`'s job.
- The `mcp-atlassian` MCP server isn't configured — run `/ce-setup` first.

---

## Chain Position

`ce-fix-bugs` sits at the middle of the Jira-tracked PR lifecycle, after the work is broken into items and before the PR is approved:

```text
   (checklist on ticket)
         │
         ▼
   /ce-fix-bugs HVD-9954       "Walk every open item to closure"
         │
         ├─ per item: /ce-debug OR /ce-work → /ce-commit
         │
         ▼
   /ce-commit-push-pr          "Open the PR with one commit per item"
         │
         ▼
   (approval)
         │
         ▼
   /ce-jira-update             "Description + Test Behaviors + transition"
         │
         ▼
   merge
```

- **Upstream**: `/ce-debug` and `/ce-work` are the per-item delegated skills. They are dispatched from inside `ce-fix-bugs`'s loop, not from a chain.
- **This skill**: reads the checklist, sets up the per-ticket branch, walks the loop, drives the UI for the `qa ready` flips.
- **Downstream**: `/ce-commit-push-pr` opens the PR; `/ce-jira-update` flips the ticket status and writes Test Behaviors after approval. There is no direct handoff — the user picks "open the PR" or "drive the UI first" from the post-loop menu.

---

## Configuration

This skill has **no per-user config** — the checklist field IDs, the Jira URL, and the per-item state enum are all hardcoded org-wide constants (because they're the same for everyone on `chatous.atlassian.net` and asking each user to configure them would be friction without benefit):

- `JIRA_URL` = `https://chatous.atlassian.net` (env-var override when pointing at a different org)
- `JIRA_TICKET_PATTERN = ^[A-Z][A-Z0-9_]+-\d+$`
- `JIRA_CHECKLIST_TEXT_FIELD` = `customfield_11627` (env-var override on field migration)
- `JIRA_CHECKLIST_VIEW_FIELD` = `customfield_11674` (read-only mirror)
- `JIRA_CHECKLIST_COMPLETED_FIELD` = `customfield_11613`
- `JIRA_CHECKLIST_PROGRESS_FIELD` = `customfield_11628`
- `JIRA_CHECKLIST_PROGRESS_PCT_FIELD` = `customfield_11629`

The per-item state enum (`open`, `in progress`, `skipped`, `done`, `qa ready`, `reopen`) is also hardcoded — it comes from the **Issue Checklist for Jira** app by Gebsun, which is the only checklist app installed on this org's Jira.

The one runtime requirement this skill enforces (and stops on) is `agent-browser`: if `command -v agent-browser` returns empty when the skill starts, it surfaces the `/ce-setup` install line and stops. The `qa ready` UI flip in Step 7 is not optional.

---

## See Also

- [`/ce-setup`](./ce-setup.md) — Phase 3 configures the `mcp-atlassian` MCP server this skill writes through; the install line for `agent-browser` lives here too
- [`/ce-debug`](./ce-debug.md) — the per-item skill this skill dispatches for bug-shaped checklist items
- [`/ce-work`](./ce-work.md) — the per-item skill this skill dispatches for feature-shaped checklist items
- [`/ce-commit`](./ce-commit.md) — used for each per-item commit; the canonical subject shape `<TICKET> - Checklist item #N - <fix>` is the prefix for the commit series
- [`/ce-commit-push-pr`](./ce-commit-push-pr.md) — opens the PR after the loop; resolves the ticket ID from the branch name and prefixes the PR title
- [`/ce-jira-update`](./ce-jira-update.md) — downstream after the PR is approved; transitions the ticket to `Staging To QA` and writes the Test Behaviors field
