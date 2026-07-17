import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-jira-update contract", () => {
  test("is manually invoked only (disable-model-invocation)", async () => {
    const raw = await readRepoFile("skills/ce-jira-update/SKILL.md")
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = frontmatterMatch![1]
    expect(frontmatter).toMatch(/disable-model-invocation:\s*true/)
  })

  test("hardcodes customfield_11643 as the Test Behaviors field with env-var override", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // The org-wide Test Behaviors custom field is hardcoded, not user-config.
    expect(content).toContain("customfield_11643")
    // Override only via env var (not per-user config).
    expect(content).toContain("JIRA_TEST_BEHAVIORS_FIELD")
    expect(content).toMatch(/env var/)
    // Do not put the field in per-user config.
    expect(content).toContain("do not put it in per-user config")
  })

  test("uses the standard Jira ticket pattern and resolves from branch/commit/plan/ask", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // The standard Jira ticket pattern is named as a constant.
    expect(content).toContain("JIRA_TICKET_PATTERN")
    // Resolution order: branch name, recent commit subject, plan frontmatter, blocking ask.
    expect(content).toContain("Current branch name")
    expect(content).toContain("Recent commit subject")
    expect(content).toContain("git log --oneline -10")
    expect(content).toContain("Plan artifact frontmatter")
    expect(content).toContain("jira_ticket:")
    expect(content).toMatch(/Blocking ask.*required.*nothing to update/s)
  })

  test("normalizes CI/CD hash-suffix and revision/hotfix-suffix ticket IDs to the bare ID", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // The two suffix conventions are documented.
    expect(content).toContain("HVD-9554#")
    expect(content).toMatch(/HVD-9554-2.*HVD-9554-hotfix/)
    // Normalization rule: strip trailing #, then strip trailing -<alphanumeric-segment>, result is bare ID used for Jira lookups/writes.
    expect(content).toMatch(/Strip the trailing `#`/)
    expect(content).toMatch(/strip a trailing `-<alphanumeric-segment>`/)
    // Branch name keeps the suffix; bare ID prefixes commits/PR titles and Jira calls.
    expect(content).toMatch(/branch name carries the suffix/i)
    expect(content).toMatch(/Jira lookups and all writes use the bare ID/)
    // The blocking ask prompt illustrates all three accepted forms.
    expect(content).toMatch(/examples: `HVD-9554`, `HVD-9554#`, or `HVD-9554-2`/)
  })

  test("approval gate is on by default with off-switches", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // Default-on approval gate using gh PR review state.
    expect(content).toContain("Approval gate")
    expect(content).toContain("gh pr view")
    expect(content).toMatch(/reviewDecision.*APPROVED|reviews.*state.*APPROVED/s)
    // Off-switches: per-run token + standing config.
    expect(content).toContain("gate:off")
    expect(content).toContain("jira_update_approval_gate: false")
    // Missing key or any other value means on (same gate semantics as pr_teaching_section).
    expect(content).toMatch(/missing key or any other value means \*\*on\*\*/)
    // When the gate fails with no approval, print PR URL and stop.
    expect(content).toContain("get at least one reviewer to approve")
  })

  test("writes only through mcp-atlassian MCP server — no curl write fallback", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    expect(content).toContain("no `curl` write fallback")
    expect(content).toMatch(/stop.*Run `\/ce-setup`.*re-run/s)
    // Mutation never via curl under any circumstance.
    expect(content).toContain("Do not proceed to write via `curl` under any circumstance.")
  })

  test("description appendix is append-only under the 'Updated Deliverable' dated heading", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // Heading shape is "Updated Deliverable as shipped on <date>" (no PR number in the heading).
    expect(content).toMatch(/## Updated Deliverable as shipped on <YYYY-MM-DD>/)
    expect(content).toMatch(/does \*\*not\*\* carry the PR number/)
    // Append to existing description; never overwrite the original body.
    expect(content).toMatch(/append|appended/i)
    // Layman rule, with the technical-ticket carve-out.
    expect(content).toMatch(/layman/i)
    expect(content).toMatch(/unless the ticket itself is a technical ticket/)
    expect(content).toMatch(/issuetype\.name/)
  })

  test("test behaviors cover each branching user flow with its own bullet", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // Each branching flow with a user behavior gets an item/bullet — coverage rule.
    expect(content).toContain("each branch gets its own bullet")
    // Established shape matches HVD-9954's customfield_11643.
    expect(content).toContain("Area: <feature area")
    expect(content).toContain("What changed:")
    expect(content).toContain("What to test:")
    // Cap when more qualify (grouped lettered sub-items).
    expect(content).toContain("Cap at ~10")
    // Regression bullets are last (assertion against the persona, where the rule is stated).
    const persona = await readRepoFile("skills/ce-jira-update/references/agents/qa-test-extractor.md")
    expect(persona).toMatch(/Regression bullets are last/i)
  })

  test("idempotency prevents double-append within the ship window and prompts before overwriting Test Behaviors", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // Description idempotency: a prior "Updated Deliverable" heading within ±7 days prompts replace-or-cancel.
    expect(content).toMatch(/already contains a heading matching `## Updated Deliverable as shipped on <date>`/)
    expect(content).toMatch(/within ±7 days of today/)
    // Older prior deliverables are preserved (not touched).
    expect(content).toMatch(/Older.*Updated Deliverable.*preserved/i)
    // Test Behaviors idempotency: references the same PR — prompt overwrite-or-cancel.
    expect(content).toMatch(/references the same PR number.*overwrite.*cancel/s)
    // Cancel for either stops entirely (no partial write).
    expect(content).toMatch(/do not write one and skip the other/)
  })

  test("preview and apply use the blocking question tool before any write", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    expect(content).toMatch(/Print both composed blocks in chat/)
    expect(content).toMatch(/Apply these updates to `<JIRA_TICKET_ID>`/)
    // Three MCP calls — description, Test Behaviors, then transition.
    expect(content).toMatch(/mcp-atlassian_jira_update_issue.*description/s)
    expect(content).toMatch(/additional_fields.*customfield_11643/s)
    expect(content).toMatch(/mcp-atlassian_jira_get_transitions/)
    expect(content).toMatch(/mcp-atlassian_jira_transition_issue/)
    // Partial failure is reported, not retried automatically.
    expect(content).toMatch(/do not retry the failed call automatically/)
  })

  test("auto-transitions ticket to Staging To QA by default, with explicit opt-out", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    // Default-on: transitions to Staging To QA after the write calls.
    expect(content).toContain("Transitions the ticket to `Staging To QA` by default")
    expect(content).toContain("Staging To QA")
    // Opt-out switches: per-run no-transition token + standing config.
    expect(content).toContain("no-transition")
    expect(content).toContain("jira_update_auto_transition: false")
    // Missing key or any other value means on (consistent gate semantics).
    expect(content).toMatch(/missing key or any other value means \*\*on\*\*/)
    // Skill no longer claims "does not transition" — that line was replaced.
    expect(content).not.toMatch(/Does not transition the Jira ticket's status/)
    // If the transition is unavailable (already in that status, workflow doesn't permit it), skip silently with a note — never a hard failure.
    expect(content).toMatch(/skipped silently with a note.*never a hard failure|skip the transition silently.*never fail/i)
  })

  test("does not commit to the repo and is terminal", async () => {
    const content = await readRepoFile("skills/ce-jira-update/SKILL.md")

    expect(content).toMatch(/Does not commit anything to the repository/)
    // Terminal skill — no babysit, no follow-up dispatch.
    expect(content).toMatch(/No babysit handoff, no follow-up skill dispatch/)
  })

  test("subagent persona exists and returns JSON with both fields", async () => {
    const persona = await readRepoFile(
      "skills/ce-jira-update/references/agents/qa-test-extractor.md",
    )

    // No YAML frontmatter (specialist prompt asset rule in AGENTS.md).
    expect(persona).not.toMatch(/^---\n[\s\S]*?\n---/)
    // Returns both description_appendix and test_behaviors as JSON.
    expect(persona).toMatch(/"description_appendix"/)
    expect(persona).toMatch(/"test_behaviors"/)
    // Layman rule and technical-ticket carve-out mirrored in the persona.
    expect(persona).toMatch(/layman/i)
    expect(persona).toMatch(/unless the ticket is technical/)
    // One bullet per branching user flow.
    expect(persona).toMatch(/one user-visible branch per bullet|one bullet per branching user flow/)
    // Regression last.
    expect(persona).toMatch(/Regression bullets are last/i)
  })
})
