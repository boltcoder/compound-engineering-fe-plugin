---
name: ce-fix-bugs
description: Work through every open checklist item on a Jira ticket — fetch the ticket's checklist, fix each item with a per-item commit, then mark each fixed item "qa ready" via the Jira UI. Manual-only; one branch per ticket.
argument-hint: "<JIRA_TICKET_ID> (e.g. HVD-9954)"
disable-model-invocation: true
---

# Work a Jira Ticket's Checklist, Item by Item

`ce-fix-bugs` reads the **Checklist Text** custom field on a Jira ticket and walks through each open item one at a time. For every item you choose to act on, the skill ships a per-item commit whose subject identifies the ticket and item number, then opens a PR. After your review and approval, the skill drives the Jira UI to flip each worked-on item to `qa ready` — through the dropdown, not through the markdown field — so the ticket's progress rolls forward and the manual QA team sees the right status.

This skill is **manually invoked only** (`disable-model-invocation: true`). It does not auto-run from any pipeline and is never dispatched by a sibling skill.

## Constants (org-wide, hardcoded)

These are constants for this organization's Jira, not user configuration. The checklist is provided by the **Issue Checklist for Jira** app by Gebsun, installed on `chatous.atlassian.net` — its data lives in standard Jira custom fields plus per-item status in the Forge app's storage.

| Field ID | Field name | Purpose |
| --- | --- | --- |
| `customfield_11627` | Checklist Text | Raw markdown source. Editable textarea. The app renders its dropdown from this; the per-item status enum lives in the app's storage, **not** here. |
| `customfield_11674` | Checklist Text (view-only) | Forge-rendered mirror of `11627`. Read-only; do not write to it. |
| `customfield_11613` | Checklist Completed | Status summary — `"Not Completed"` or `"All Completed"`. Counts only `[done]` items. |
| `customfield_11628` | Checklist Progress | `"Checklist: <done>/<total>"`. Counts only `[done]` items. |
| `customfield_11629` | Checklist Progress % | `0.0`–`100.0`. Counts only `[done]` items. |
| `customfield_11614` | Checklist Content YAML | Always `null` in this org. Read-only; ignore. |
| `customfield_11645` | Checklist Template | Always `null` in this org. Read-only; ignore. |

- `JIRA_TICKET_PATTERN = ^[A-Z][A-Z0-9_]+-\d+$` — the standard Jira project-key + issue-number shape.
- Per-item state tokens recognised by the app's dropdown (six of them): `open`, `in progress`, `skipped`, `done`, `qa ready`, `reopen`. Multi-word tokens are written as a single bracket string, e.g. `* [in progress] 1. ...`, `* [qa ready] 2. ...`.
- Org default: `JIRA_URL = https://chatous.atlassian.net`.

The checklist field IDs are hardcoded because they are genuinely org-wide and asking each user to configure them would be friction without benefit. Override only via the env vars listed in "Env-var overrides" below when your org migrates field IDs — never via per-user config.

## Env-var overrides

Each of the field IDs can be overridden via an env var when the org's Jira is migrated to a different field set. The skill defaults to the org-wide values above and reads the env var only when set.

- `JIRA_CHECKLIST_TEXT_FIELD` (default `customfield_11627`)
- `JIRA_CHECKLIST_VIEW_FIELD` (default `customfield_11674`)
- `JIRA_CHECKLIST_COMPLETED_FIELD` (default `customfield_11613`)
- `JIRA_CHECKLIST_PROGRESS_FIELD` (default `customfield_11628`)
- `JIRA_CHECKLIST_PROGRESS_PCT_FIELD` (default `customfield_11629`)

Do not put these in per-user config — the mcp-atlassian MCP server is globally installed and reads its env from the shell profile, not from a per-repo YAML file (see `/ce-setup` Phase 3 for the credential-writing flow).

## MCP server dependency

This skill reads from and writes to Jira. **Reads and writes both go through the `mcp-atlassian` MCP server exclusively** — there is no `curl` write fallback (mutation needs the MCP server's authenticated session; a raw `curl` write path would invite credential leakage and bypass the server's retry/validation logic). The MCP server is configured by `/ce-setup` Phase 3.

Discover the `mcp-atlassian_*` tools via the platform's tool-discovery primitive (e.g. `ToolSearch` in Claude Code) — do not assume they are loaded. If the MCP server is not reachable, **stop** and surface: "Run `/ce-setup` to configure the Atlassian MCP server, then re-run `/ce-fix-bugs`." Do not proceed to write via `curl` under any circumstance.

The per-item status flip to `qa ready` (the last step of the workflow) **cannot** go through the MCP server — the Forge app's status enum lives in the app's private storage, not in any Jira custom field exposed via REST. The skill uses `agent-browser` (a required tool per `/ce-setup`) to drive the Jira UI dropdown for that step. `agent-browser` must be installed; if `command -v agent-browser` returns empty, surface the `/ce-setup` install line and stop.

## Checklist markdown shape

The raw markdown in `customfield_11627` looks like this on a real ticket (HVD-9954 as of writing):

```
# Default checklist
* [open] 1. Searching for random long name  clear "X"  icon overlapped on typed string on the search field.
* [open] 2. "No Maches" string below search is slightly left aligned to search bar.
* [open] 3. When type in the search bar and click on Search icon the "X" (clear) icon is animated at the beginning of the search bar instead of at the end. After this, i am unable  to type anything in the search field and need to click again to continue typing.
```

The shape to recognise:

- A single header line `# <checklist name>` (the app names checklists when there are multiple; one is the common case).
- One item per line, starting with `* [STATE] ` where `STATE` is one of the six tokens above.
- The item number (`1.`, `2.`, …) follows the state token, separated by a space.
- Free text after the number is the item body.
- A trailing newline is conventional but not guaranteed.

When the app is updated, line breaks can appear inside an item body (the textarea wraps); treat the entire line as the item. **Do not** split a wrapped item into two.

## Workflow

The workflow has seven steps. Steps 1-3 are read-only. Steps 4-6 are the per-item loop. Step 7 is the bulk UI-driven status flip after review.

### Step 1: Resolve and validate the ticket ID

The skill is invoked as `/ce-fix-bugs <JIRA_TICKET_ID>`. The argument is required.

1. Strip any CI/CD hash suffix (`#`) and any trailing `-<segment>` whose preceding part is a bare ID — exactly the normalisation `ce-jira-update` and `ce-jira-ticket-context` apply. The skill uses the **bare** ID (`HVD-9954`, never `HVD-9954#` or `HVD-9954-hotfix`) for every MCP call.
2. Validate the bare ID against `^[A-Z][A-Z0-9_]+-\d+$`. On mismatch, report and stop.
3. If the argument is blank, ask once via the platform's blocking question tool: "Jira ticket ID for the checklist you want to work through? (examples: `HVD-9954`, `HVD-9954#`, or `HVD-9954-2`)". On a second blank, stop with "No Jira ticket ID provided; nothing to fix."

### Step 2: Fetch the checklist

Call `mcp-atlassian_jira_get_issue` with `issue_key: <JIRA_TICKET_ID>` and `fields: summary,status,description,customfield_11627,customfield_11674,customfield_11613,customfield_11628,customfield_11629`.

Carry forward:

- The `summary` (printed at the top of the report).
- The current ticket `status.name` (informational; do not change it as part of this skill).
- The `description` (printed in the report so the user has ticket context).
- The `customfield_11627` text (the raw markdown to parse).
- The progress triple (`11613` / `11628` / `11629`) for the report's "before" snapshot.

If `customfield_11627` is `null` or empty, the ticket has no checklist. Stop and report: "`<TICKET>` has no checklist (customfield_11627 is empty). This skill only works on tickets with a checklist." Do not invent items.

If the MCP call errors or the tool is unreachable, stop — do not fall back to `curl`. Surface the `/ce-setup` message.

### Step 3: Parse the items and present them

Parse `customfield_11627` into a numbered list. The parser:

- Skips the `# <name>` header line.
- Matches `^\* \[(<state>)\] (\d+)\. (.*)$` per item (state is the literal token inside the brackets; the number is what the user types; the body is everything after `N. `).
- Normalises the state token to lowercase for comparison but preserves its exact original casing and any whitespace when rewriting the field.
- Strips a single trailing newline per item, preserves everything else (item bodies often have Figma links, video references, double-spaces, and Unicode quotes — all of which are part of the source and must not be "cleaned up").
- Numbers items by their appearance order, **not** by the embedded `N.` (which the app assigns but the user can edit). The user's mental model and the per-item commit message both refer to the appearance order — `Checklist item #1` is the first line after the header, `#2` is the second, and so on. If the embedded numbers disagree with appearance order, surface the discrepancy in the report and use appearance order for the commit prefix anyway.

Filter to **actionable** items — those whose state token is `open` or `reopen`. Items in any other state (`in progress`, `skipped`, `done`, `qa ready`) are listed but not worked on in this run.

Print:

```
Ticket:    <TICKET_ID> — <summary>
URL:       <JIRA_URL>/browse/<TASKET>
Checklist: <done>/<total> complete (<pct>%) — status: <customfield_11613>
Actionable items (state = open | reopen): <N>
  #1  [open]    <body of item 1, first ~80 chars>
  #2  [open]    <body of item 2, first ~80 chars>
  #3  [reopen]  <body of item 3, first ~80 chars>
Other items (skipped this run):
  #4  [in progress] <body of item 4, first ~80 chars>
  #5  [done]        <body of item 5, first ~80 chars>
```

If there are zero actionable items, stop with: "`<TICKET>` has no `open` or `reopen` items. Nothing to fix." Do not loop, do not commit, do not drive the UI.

If `command -v agent-browser` is empty, surface: "agent-browser is not installed; install it via the `/ce-setup` line, then re-run `/ce-fix-bugs <TICKET>`." Stop — the qa-ready step (Step 7) requires it, and pre-failing here is better than discovering it at the end.

### Step 4: Set up the working branch

This skill produces **one branch per ticket**, with all of this run's per-item commits stacked on it. The branch name follows the `<pr-prefix>/<TICKET>` convention established by `/ce-commit-push-pr` and `/ce-commit` (read `JIRA_URL` for the org's default branch naming and read `GITHUB_PR_PREFIX_USERNAME` from the environment when set — fall back to the current OS user when unset).

1. Resolve the current branch and the default branch the same way `ce-work` does (`git rev-parse --abbrev-ref origin/HEAD` → strip → `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` → `main`).
2. If on the default branch, fetch and create the new ticket branch. If on an existing feature branch, ask the user once: "Continue working on `<current>`, or create a new ticket branch `<new>`?" and act on the answer.
3. Branch name shape: `<pr-prefix>/<TICKET>-checklist` is the canonical form (e.g. `shrey/HVD-9954-checklist`). It carries the **bare** ticket ID so `ce-commit-push-pr` can resolve it; if a CI/CD hash or hotfix suffix applies, append it per the conventions `ce-jira-update` uses for the suffix form.

Use the harness's native isolation if available (harness worktrees, etc.) — the skill does not run `git worktree add` itself.

### Step 5: Per-item loop

For each actionable item, in order, repeat the steps below. Track which items you `fixed`, `skipped`, and `failed` as you go.

#### Step 5a: Route the item

Inspect the item body. Decide:

- If the body describes a **bug** (broken behaviour, wrong output, an error, an unexpected state) → fix via `/ce-debug`. Pass the ticket ID and the item body as the bug description.
- If the body describes a **change, feature, or implementation** (a new control, a polish item, an alignment fix the design intends, a feature gap) → fix via `/ce-work`. Pass the item body as the work prompt.
- If the body is **ambiguous** (could be either, or you genuinely cannot tell) → ask the user via the platform's blocking question tool: "Item #N looks like it could be a bug or a feature. Which path?" with the two options. Do not guess on ambiguous items.

For trivial items (single-file alignment, a one-line CSS fix, a typo, a label change), `/ce-debug` or `/ce-work` may be more ceremony than the change warrants — still pick one of the two based on the bug-vs-feature heuristic above; do not invent a third path.

If the delegated skill returns with the bug/work still open (e.g. `ce-debug` couldn't reproduce, or `ce-work` decided the spec needs to be revisited), do **not** commit and mark the item as `failed`. Surface the reason to the user; the loop continues to the next item. Failed items stay `open` in the markdown (the workflow does not invent transitions for them).

#### Step 5b: Commit per item

When the delegated skill returns with a real change on disk, commit it **with a per-item subject** that identifies the ticket and the item. The exact format is:

```
<TICKET> - Checklist item #<N> - <one short sentence describing the fix>
```

Example: `HVD-9954 - Checklist item 1 - clear X icon sits inside search input padding`.

Conventions for the fix description:

- Lead with the user-visible change, not the implementation. "Clear X icon no longer overlaps typed text" beats "Add padding-right to .search-input".
- One sentence; one idea. If you cannot fit the fix into one short sentence, the commit message is too long — split the change into two items or shorten.
- Match the casing style of the existing repo (read a few recent commit subjects from `git log --oneline -10` first; if the repo's style is sentence-case, the fix description is sentence-case too).
- Do **not** add a `feat:` / `fix:` conventional-commits prefix. The `<TICKET> - Checklist item #N -` part is the prefix for this commit series; it stacks with whatever convention the team uses for ticket-prefixed commits.

Stage only the files the delegated skill changed for this item — do not run `git add .`. Verify with `git diff --cached --stat` before committing. The commit is created with `/ce-commit` (interactive mode is fine; the per-item subject above carries the meaning).

If the delegated skill produced no diff at all (e.g. it decided the item was already fixed, or the bug was a non-issue), skip the commit entirely and mark the item as `skipped` in the loop's running tally.

#### Step 5c: Update the checklist markdown after the commit

After each successful commit, write `customfield_11627` back via `mcp-atlassian_jira_update_issue` with the same field path. The only change in the rewritten markdown is:

- The just-fixed item's state token flips from `open` (or `reopen`) to `in progress` **only** if the delegated skill is mid-flight and the fix spans multiple turns. For a one-shot fix that lands in the commit, the state stays `open` until the final UI flip in Step 7. The markdown source is a transient display surface — the authoritative status lives in the Forge app's storage and is what the Jira UI's progress bar / count / "All Completed" string reads. Updating the markdown mid-loop adds noise without information.
- Items the user marked as `skip` in the loop get a brief uppercase reason appended inside parentheses at the end of the item's text. The shape is:

  ```
  * [open] 1. <original body> (SKIPPED: REASON_GOES_HERE)
  ```

  The reason must be uppercase letters, numbers, spaces, and the punctuation `():,-/` — convert the user's natural-language reason into that shape (e.g. "Already fixed in another ticket" → `ALREADY FIXED IN ANOTHER TICKET`). If the user does not provide a reason when prompted, ask once more and accept a brief phrase on a second prompt; on a third blank, use `NO REASON PROVIDED`.

  Do **not** change the state token for skipped items — they remain `open` (or whatever they were). The `SKIPPED: ...` annotation is the only marker; the state token drives the app's progress counts and we do not want a skipped item to look like a completed one.

The MCP write is **a single call per successful fix** — send the full new `customfield_11627` text (the textarea field replaces, not appends). Preserve every other item's line exactly as parsed; do not normalise whitespace, fix typos in unrelated items, or re-flow line breaks.

If the MCP call errors, surface the error to the user but do not roll back the commit. The commit stands; the checklist annotation can be retried on the next run.

### Step 6: Push the branch and ask for review

When the loop is done (every actionable item has been `fixed`, `skipped`, or `failed`), print the running tally:

```
<HVD-9954> checklist run summary
  fixed:   2  (#1 search-bar padding, #3 search icon position)
  skipped: 1  (#2 alignment — already fixed in another ticket)
  failed:  0
  branch:  shrey/HVD-9954-checklist
  commits: 2  (one per fixed item)
  PR:      <not opened yet>
```

Ask via the platform's blocking question tool:

```
Open a PR for <branch> now?

  1. Yes — open it with /ce-commit-push-pr
  2. No  — leave the branch local, I'll push later
  3. Drive the Jira UI to mark <N> worked-on items as "qa ready" first
```

- Option 1 — invoke `/ce-commit-push-pr` with the standard ticket-prefix conventions. The PR title and description are generated by that skill; do not hand-edit.
- Option 2 — stop after this. The branch and commits are local; the user will push and open a PR themselves.
- Option 3 — push the branch (so the Jira UI's commit-log pane shows the commits), then proceed to Step 7. PR open is the user's call after Step 7 lands.

### Step 7: Flip worked-on items to "qa ready" via the Jira UI

This step is **the only** place the skill leaves the `mcp-atlassian` MCP server for Jira writes — and it does so on purpose, because the Forge app's per-item status enum lives in the app's private storage, not in any custom field the REST API exposes. Confirmed empirically on ticket GEN-3570 in this org: writing `* [qa ready]` to `customfield_11627` updates the markdown text but `customfield_11613` stays `"Not Completed"` and `customfield_11629` stays `0.0` — the app does not recognise non-`[done]` markers, and the authoritative state only moves when the dropdown UI itself is used.

Use `agent-browser` to drive the Jira UI:

1. Open `<JIRA_URL>/browse/<TICKET>`.
2. For each item the loop marked as `fixed` (skip `skipped` and `failed`):
   a. Click that item's dropdown in the rendered checklist.
   b. Select `qa ready`.
3. After each item flips, re-read the ticket's progress fields (`customfield_11628`, `customfield_11629`) by calling `mcp-atlassian_jira_get_issue` and verify the progress percent is non-zero (a single `qa ready` does not count toward completion, but the read-back confirms the app accepted the flip — if progress is still 0/N after every item, the dropdown selection did not register and the item needs a retry).
4. Print a final summary:

```
<HVD-9954> checklist status flip complete
  flipped to "qa ready":
    #1  clear X icon overlap        — verified (progress: 0/3)
    #3  search icon position        — verified (progress: 0/3)
  skipped (left as open):
    #2  "No Matches" alignment      — skipped by user; reason logged in markdown
  not flipped (failed):
    (none)
```

5. **Final markdown refresh** — after the UI flips land, write `customfield_11627` one more time so the markdown reflects the new state. The flip is what moved the authoritative status; the markdown rewrite is so the next reader of the field text sees the right tokens. Rewrite every item the loop acted on: `[open]` → `[qa ready]` for fixed items, leave skipped/failed items alone. This is the only rewrite that changes a state token in markdown.

If `agent-browser` fails (network, auth, the Jira UI layout changed, the dropdown selector didn't match), surface the error and stop. The branch and commits stand; the user can complete the UI flip manually or re-run `/ce-fix-bugs <TICKET>` to retry — the loop is idempotent for items already in `qa ready` (Step 3's filter excludes them).

## What this skill does NOT do

- Does not edit, transition, or comment on the ticket's `status` field. The ticket status (`To Do` / `In Progress` / `In Review` / etc.) is the team's existing workflow; this skill only touches the per-item checklist.
- Does not transition the ticket itself — that's `ce-jira-update`'s job, after the PR is approved.
- Does not write to `customfield_11643` (Test Behaviors) — that's `ce-jira-update`'s job.
- Does not run tests, lint, or build — the delegated skill (`/ce-debug` or `/ce-work`) owns those.
- Does not auto-dispatch. `disable-model-invocation: true` is intentional: this skill is invoked manually per ticket. Auto-dispatch from another skill would let a sibling assume the user wants the bug fixed when they only wanted to talk about it.
- Does not write to the ticket via `curl` for any field. All MCP writes go through `mcp-atlassian`. The UI flip in Step 7 is a separate path because the Forge app's status enum is not exposed via REST.
- Does not invent transitions for failed items. If `/ce-debug` could not reproduce or `/ce-work` decided the spec needs revisiting, the item stays `open` and the user is told.

## Quick example

You invoke `/ce-fix-bugs HVD-9954` on a ticket whose `customfield_11627` is:

```
# Default checklist
* [open] 1. Searching for random long name  clear "X"  icon overlapped on typed string on the search field.
* [open] 2. "No Maches" string below search is slightly left aligned to search bar.
* [open] 3. When type in the search bar and click on Search icon the "X" (clear) icon is animated at the beginning of the search bar instead of at the end. After this, i am unable  to type anything in the search field and need to click again to continue typing.
```

The skill resolves the bare ID, fetches the ticket, parses three `open` items, sets up `shrey/HVD-9954-checklist`, and walks the loop:

- Item #1 — bug-shaped (icon overlap), routed to `/ce-debug`. The delegated skill traces the issue to the search input's right padding, fixes it, returns. Commit `HVD-9954 - Checklist item 1 - clear X icon no longer overlaps typed text`.
- Item #2 — alignment, but the user types `skip 2 — already fixed in another ticket, see #HVD-9931`. The reason is uppercased to `ALREADY FIXED IN ANOTHER TICKET, SEE #HVD-9931`, appended inside parens at the end of item #2's text in the rewritten `customfield_11627`. No commit.
- Item #3 — bug-shaped (icon position + broken re-focus). Routed to `/ce-debug`. The delegated skill fixes the animation order and the focus restoration. Commit `HVD-9954 - Checklist item 3 - clear X icon stays at end after typing and re-focus is restored`.

Loop summary: `fixed: 2, skipped: 1, failed: 0, branch: shrey/HVD-9954-checklist, commits: 2`. The user picks "open the PR"; `/ce-commit-push-pr` opens the PR. The user picks "drive the UI to mark fixed items as qa ready"; `agent-browser` flips items #1 and #3 to `qa ready`, the skill re-reads `customfield_11629` to verify, and writes `customfield_11627` one last time with `[open]` → `[qa ready]` for items #1 and #3 (item #2's text keeps its `SKIPPED: ...` annotation; its state token stays `open`).
