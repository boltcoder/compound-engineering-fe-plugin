# Jira Ticket Context (optional intake)

This reference governs the optional Jira-ticket-ID capture that fires once at the very start of `ce-brainstorm`, `ce-plan`, and `ce-ideate`, before any other phase. It is the only place those skills ask for a ticket ID; downstream skills (`ce-commit`, `ce-commit-push-pr`, `ce-jira-update`) resolve the ID from branch name, commit subject, or plan frontmatter rather than re-asking.

## When this fires

Once per skill invocation, as the **first** intake step (Phase 0.0a — before output-mode resolution, resume checks, or any other gate). It is genuinely optional: a blank answer is the common case and the rest of the skill proceeds unchanged.

## The ask

Use the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first; `request_user_input` in Codex; `ask_question` in Antigravity CLI (`agy`); `ask_user` in Pi). One question, single free-text answer:

> Jira Ticket ID? (blank = none, this is optional — example: `HVD-9554`)

The tool's free-text path covers blank and arbitrary input. Fall back to plain chat only when no blocking tool exists in the harness or the call errors — never silently skip the question.

## Validation and resolution

- **Blank / "none" / "skip"**: no ticket. Set `JIRA_TICKET_ID=""` and proceed. The rest of the skill is unchanged; no Jira context is fetched, no artifact frontmatter is written for the ticket.
- **Non-blank**: normalize to upper-case and validate against `^[A-Z][A-Z0-9_]+-\d+$` (the standard Jira project-key + issue-number shape). On mismatch, re-ask once with the validation error shown; a second mismatch falls back to blank and proceeds (do not loop).
- **Resume shortcut**: if this skill is resuming an existing artifact (per the skill's own resume phase) and that artifact's YAML frontmatter carries an active `jira_ticket:` field, **do not re-ask** — inherit that value as `JIRA_TICKET_ID` and continue. A comment-prefixed `# jira_ticket:` line does not count (YAML comment).

## Fetching ticket context (only when an ID resolved)

When `JIRA_TICKET_ID` is non-empty, fetch the ticket's description and comment thread and surface a short summary in the dialogue so the brainstorm/plan/ideation has grounding. Two paths, in order:

1. **`mcp-atlassian` MCP server (preferred).** Discover via the platform's tool-discovery primitive (e.g. `ToolSearch` in Claude Code) — do not assume the tool is loaded. If reachable, call `mcp-atlassian_jira_get_issue` with `issue_key: <JIRA_TICKET_ID>` and `include: comments`. Read `description`, `summary`, `status.name`, `comment.body` entries. This is the path the `ce-setup` Phase 3 wires in.
2. **Direct API fallback (read-only).** Only if the MCP server is not reachable. Run a single argv-style `curl` shell call:

   ```
   curl -s -u "${JIRA_USERNAME}:${JIRA_API_TOKEN}" "${JIRA_URL}/rest/api/3/issue/<JIRA_TICKET_ID>?fields=summary,status,description,comment"
   ```

   Interpret a non-200 response (bad token, missing env vars, wrong URL) by reporting the gap to the user and continuing without ticket context — never block the skill on Jira connectivity. Surface "run `/ce-setup` to configure Atlassian MCP" only when both paths fail and the user clearly wants the integration.

**Carry a short summary, not the raw payload.** Distill to 3-8 lines: the ticket's summary, the current status, the gist of the description, and any comment thread highlights that bear on what the user is about to brainstorm/plan/ideate. The agent's working context is enough; downstream skills re-fetch the full ticket if they need it.

## Carrying the ID forward

When `JIRA_TICKET_ID` is non-empty and the skill writes a durable artifact (`docs/plans/…` for `ce-brainstorm` and `ce-plan`; `docs/ideation/…` for `ce-ideate`), write the ID into the artifact's YAML frontmatter (markdown) or visible metadata block (HTML) as:

```
jira_ticket: HVD-9554
```

This is how `ce-commit-push-pr` and `ce-jira-update` resolve the ID without re-asking: they read `jira_ticket:` from a matching plan's frontmatter, the current branch name, or a recent commit subject — in that order. HTML artifacts mirror the field into their visible metadata block following the skill's own rendering reference (the same place `artifact_readiness` is rendered).

If the skill is enriching an existing artifact in place (e.g. `ce-plan` enriching a brainstorm-sourced requirements-only plan), preserve any existing `jira_ticket:` value unless the user explicitly changes it this run — do not overwrite a resolved ID with blank.

## What this does NOT do

- Does not create or transition Jira issues. Issue creation lives in `ce-plan`'s handoff; description and test-behavior updates live in `ce-jira-update`. This skill only captures the ID and fetches context.
- Does not write the ticket ID into commit messages or PR titles. That is `ce-commit` and `ce-commit-push-pr`'s job, resolved from branch/commit/frontmatter.
- Does not require Jira connectivity. A blank answer, a failed MCP probe, or a failed `curl` all fall through to "no ticket context" and the skill continues normally.
