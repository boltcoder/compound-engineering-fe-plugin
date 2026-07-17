---
name: ce-jira-update
description: Update a Jira ticket's description and Test Behaviors field from the current branch's PR diff. Manual-only; checks PR approval first.
disable-model-invocation: true
---

# Update Jira Ticket from PR Diff

After a PR is approved, this skill reads the full branch diff and writes two things back to the Jira ticket the branch belongs to:

1. **Description appendix** — a layman, user-behavior-focused summary of what changed, appended to the ticket's existing description under a dated heading. No technical detail unless the ticket itself is a technical ticket.
2. **Test Behaviors field** — a QA-facing list of manual test points covering each user-visible branch in the diff. Read by the manual QA team; each branching flow with a user behavior gets its own item.

This skill is **manually invoked only**. It does not run as part of any pipeline and is never auto-dispatched by sibling skills — see `disable-model-invocation: true` above.

## Constants (org-wide, hardcoded)

These are constants for this organization's Jira, not user configuration:

- `JIRA_TEST_BEHAVIORS_FIELD = "customfield_11643"` — the "Test Behaviors" custom field, already configured on the HVD project on `chatous.atlassian.net`. Override only via the `JIRA_TEST_BEHAVIORS_FIELD` env var when your org migrates field IDs; do not put it in per-user config.
- `JIRA_TICKET_PATTERN = ^[A-Z][A-Z0-9_]+-\d+$` — the standard Jira project-key + issue-number shape, used everywhere the ticket ID is parsed or validated.

## MCP server dependency

This skill writes to Jira. Writes go through the `mcp-atlassian` MCP server exclusively — there is no `curl` write fallback (mutation needs the MCP server's authenticated session; a raw `curl` write path would invite credential leakage and bypass the server's retry/validation logic). The MCP server is configured by `/ce-setup` Phase 3.

Discover via the platform's tool-discovery primitive (e.g. `ToolSearch` in Claude Code) — do not assume `mcp-atlassian_*` tools are loaded. If the MCP server is not reachable, **stop** and surface: "Run `/ce-setup` to configure the Atlassian MCP server, then re-run `/ce-jira-update`." Do not proceed to write via `curl` under any circumstance.

## Workflow

### Step 1: Resolve the Jira ticket ID

Resolve `JIRA_TICKET_ID` in priority order, stopping at the first non-empty normalized value:

1. **Current branch name** — match `^.*/([A-Z][A-Z0-9_]+-\d+)$` against `git branch --show-current`. The ticket is the trailing segment after the last `/`.
2. **Recent commit subject** — `git log --oneline -10` and match `^([A-Z][A-Z0-9_]+-\d+)\b` against each subject. Most recent match wins.
3. **Plan artifact frontmatter** — a recent `docs/plans/*.md` with an active `jira_ticket:` field matching the change topic.
4. **Blocking ask** — if none of the above resolved, ask once via the platform's blocking question tool: "Jira Ticket ID for this PR? (e.g. `HVD-9554`)". Unlike the optional intake in `ce-brainstorm` / `ce-plan` / `ce-ideate`, this ask is **required** — without a ticket there is nothing to update. On a blank answer, report "No Jira ticket could be resolved; nothing to update" and stop.
5. **Validate** the resolved value against `^[A-Z][A-Z0-9_]+-\d+$`. A mismatch is reported and the skill stops.

### Step 2: Approval gate (optional, on by default)

The skill checks whether the PR for the current branch has at least one approval from GitHub before writing to the ticket. The gate is on by default; override per-run with the `gate:off` token, or standing via `jira_update_approval_gate: false` in `<repo-root>/.compound-engineering/config.local.yaml` (active non-commented value of exactly `false` disables; missing key or any other value means **on**).

Resolve the PR for the current branch:

```
gh pr list --head <branch> --state open --json number,url,title,state,headRefName,headRepositoryOwner
```

An exit-0 `[]` means no open PR — report "No open PR on `<branch>`; cannot verify approval. Open a PR first, or pass `gate:off` to skip." and stop. A non-zero exit means `gh` is missing, unauthenticated, or offline — treat as **unknown** (do not assume no PR); resolve `gh auth status` / connectivity, or accept `gate:off` from the user explicitly.

With a PR number, check approvals:

```
gh pr view <number> --json reviewDecision,reviews
```

`reviewDecision: "APPROVED"`, or at least one entry in `reviews` with `state: "APPROVED"`, passes the gate. Requested-but-pending, or only `COMMENTED`/`CHANGES_REQUESTED`, fails the gate. On a fail, print the PR URL and stop: "PR has no approvals yet — get at least one reviewer to approve, then re-run. Pass `gate:off` to skip this check."

### Step 3: Gather the diff and PR metadata

Fetch a fresh base and compute the full diff:

```
git fetch --no-tags origin <base>
git diff <merge-base>...HEAD
```

Resolve `<base>` per the standard rule (`git rev-parse --abbrev-ref origin/HEAD`, stripped → `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` → `main`). Also pull PR metadata for the change summary:

```
gh pr view <number> --json title,body,files,commits,additions,deletions,url
```

Carry: the PR title (which carries the Jira ticket prefix per `ce-commit-push-pr`), the file list, and the commit list. The diff itself is the authoritative source for behavior changes.

### Step 4: Fetch the existing ticket

Call `mcp-atlassian_jira_get_issue` with `issue_key: <JIRA_TICKET_ID>`, `fields: description,customfield_11643,summary,status,issuetype`. Carry the **full text** of `description` and `customfield_11643` (Test Behaviors) so the append and idempotency checks in Steps 6-7 work. Note `issuetype.name` to drive the technical-vs-layman decision in Step 6.

If the MCP call errors or the tool is unreachable (after the discovery step above), stop — do not fall back to `curl`. Surface the `/ce-setup` message.

### Step 5: Compose the description appendix

Dispatch a generic subagent with `references/agents/qa-test-extractor.md` as the prompt (the persona takes the diff and ticket context and returns both the description text and the test-behaviors text in one pass — see that reference for the shape). The dispatch is a single subagent call; do not split into two.

The appendix goes under a dated heading inside the Jira description:

```
## What changed (from PR #<number>, <YYYY-MM-DD>)

<2-6 short sentences describing user-visible behavior changes in layman terms>
```

**Layman rule.** No file names, library names, component names, technical jargon, or implementation detail unless the ticket itself is a technical ticket (its `issuetype.name` is `Bug`/`Technical Task`/`Sub-task`/`Spike` or its existing description is visibly technical — code snippets, table names, API endpoints). For a feature ticket, lead with what the user now sees or can do that they couldn't before, and what's gone or changed. One idea per sentence.

**Examples to calibrate against:**
- Layman (feature): "Clicking the matches cell in the Custom Classes table now opens a preview panel instead of truncated text. A search bar at the top filters the words as you type, and the list scrolls independently. The column can also expand to show full content in-table."
- Technical (only when the ticket is a technical one): "Replaced the inline matches cell with a `MatchesPreview` popover component backed by a 72vw/80vh container; sticky search uses `SearchInput` from hive-components; column `allowExpansion` enabled."

### Step 6: Compose the Test Behaviors content

The subagent returns the Test Behaviors block in the established shape for this org's HVD project — already visible on ticket HVD-9954's `customfield_11643`:

```
Area: <feature area — e.g. "Custom Classes settings (project Settings → Custom Classes / Allowlists)">
What changed:
<one short paragraph summarizing the user-visible behavior>
What to test:
- <concrete manual test step covering one user-visible branch>
- <next test step — each branching flow with a user behavior gets its own bullet>
- ...
```

**Coverage rule.** If the code branches into multiple flows and each branch has a user behavior (e.g. "search returns results" vs "search returns nothing" vs "clear search"), each branch gets its own bullet. Do not collapse them. Edge cases the QA team needs to hit — empty states, sticky-on-scroll, permission/sizing, regression of adjacent flows — each earn a bullet when the diff touches them. Cap at ~10 items; if more qualify, group sibling branches under one bullet with lettered sub-items (a/b/c).

### Step 7: Idempotency check

Before previewing, check the existing ticket content:

- **Description idempotency**: if the existing `description` already contains a heading matching `## What changed (from PR #<number>` (same PR number) from a prior run, surface it and ask whether to **replace** that section or **cancel**. Do not silently append a second section for the same PR. On `replace`, splice the new section in place of the old one; on `cancel`, stop without writing.
- **Test Behaviors idempotency**: if the existing `customfield_11643` already contains the string `(from PR #<number>` or references the same PR number, surface it and ask whether to **overwrite** the field or **cancel**. The Test Behaviors field holds the authoritative QA list, so overwrite is the common case; the prompt is there to prevent accidental loss of prior manual test notes that a human added.

Ask the idempotency question(s) via the platform's blocking question tool. On `cancel` for either, stop entirely — do not write one and skip the other.

### Step 8: Preview and apply

Print both composed blocks in chat — the description appendix heading + body, and the full Test Behaviors content as it will land in `customfield_11643` — then ask via the platform's blocking question tool: "Apply these updates to `<JIRA_TICKET_ID>`? (description appendix under `## What changed (from PR #<number>, <date>)`, Test Behaviors field updated)".

On confirm, issue two MCP calls in order:

1. **Description append/replace** — call `mcp-atlassian_jira_update_issue` with `issue_key: <JIRA_TICKET_ID>` and `fields: {"description": "<full new description — existing body spliced with the appendix section>"}`. Always send the full new description text (Jira's `update` replaces the field, not appends); reconstruct it by combining the existing description body (minus any prior `## What changed (from PR #<number>` section per Step 7's replace rule) with the new section appended at the end.
2. **Test Behaviors field** — call `mcp-atlassian_jira_update_issue` with `issue_key: <JIRA_TICKET_ID>` and `additional_fields: "{\"customfield_11643\": \"<full new Test Behaviors text>\"}"`. Send the full new text (overwrite, not merge).

On a successful apply of both, print a one-line summary: `Updated <JIRA_TICKET_ID> — description appendix + Test Behaviors field (customfield_11643).`

On a partial failure (one call succeeds, the other errors), report which succeeded and which failed verbatim, and stop — do not retry the failed call automatically. Surface the MCP error message so the user can address it (`/ce-setup` re-run, MCP server restart, or manual Jira edit).

### Step 9: Report

Print:
- The Jira ticket URL: `https://<JIRA_URL>/browse/<JIRA_TICKET_ID>` (using `${JIRA_URL}` from the environment, not guessed).
- The PR URL that the diff was sourced from.
- A one-line note: `Description appended under "## What changed (from PR #<N>)". Test Behaviors field (customfield_11643) overwritten. Approved by: <approver login(s)>.`

No babysit handoff, no follow-up skill dispatch — this skill is terminal.

## What this skill does NOT do

- Does not write to PR review comments, GitHub Issues, or any tracker other than the Jira ticket resolved in Step 1.
- Does not transition the Jira ticket's status. Status transitions are a human/QA decision; this skill only updates the description and the Test Behaviors custom field.
- Does not run tests. The Test Behaviors content is composed from the diff, not from test runs; if the diff introduces a behavior the tests do not cover, the QA team still gets a test point for it (that's the point).
- Does not commit anything to the repository. The only writes are to Jira via the MCP server.
