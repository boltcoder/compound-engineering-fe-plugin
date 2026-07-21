import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-fix-bugs contract", () => {
  test("is manually invoked only (disable-model-invocation)", async () => {
    const raw = await readRepoFile("skills/ce-fix-bugs/SKILL.md")
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatterMatch).not.toBeNull()
    const frontmatter = frontmatterMatch![1]
    expect(frontmatter).toMatch(/disable-model-invocation:\s*true/)
  })

  test("hardcodes the org-wide Jira checklist custom field IDs with env-var overrides", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    // The org-wide Checklist Text custom field is hardcoded.
    expect(content).toContain("customfield_11627")
    // The Forge-rendered mirror is read-only and named explicitly.
    expect(content).toContain("customfield_11674")
    // The Completed / Progress / Progress % fields are documented.
    expect(content).toContain("customfield_11613")
    expect(content).toContain("customfield_11628")
    expect(content).toContain("customfield_11629")
    // Override only via env var (not per-user config).
    expect(content).toContain("JIRA_CHECKLIST_TEXT_FIELD")
    expect(content).toContain("JIRA_CHECKLIST_VIEW_FIELD")
    expect(content).toContain("JIRA_CHECKLIST_COMPLETED_FIELD")
    expect(content).toContain("JIRA_CHECKLIST_PROGRESS_FIELD")
    expect(content).toContain("JIRA_CHECKLIST_PROGRESS_PCT_FIELD")
    expect(content.toLowerCase()).toContain("do not put these in per-user config")
  })

  test("uses the standard Jira ticket pattern and strips the # / -suffix to a bare ID", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    expect(content).toContain("JIRA_TICKET_PATTERN")
    expect(content).toContain("^[A-Z][A-Z0-9_]+-\\d+$")
    // Bare ID is what MCP calls and the commit prefix use; suffix only stays on the branch.
    expect(content).toMatch(/HVD-9954/)
    expect(content).toMatch(/Strip any CI\/CD hash suffix/)
    expect(content).toMatch(/bare.*ID/i)
    expect(content).toMatch(/examples: `HVD-9954`/)
  })

  test("recognises the six checklist state tokens and the canonical markdown shape", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    // Six state tokens.
    expect(content).toContain("`open`")
    expect(content).toContain("`in progress`")
    expect(content).toContain("`skipped`")
    expect(content).toContain("`done`")
    expect(content).toContain("`qa ready`")
    expect(content).toContain("`reopen`")
    // The actual shape parsed in the field on a real ticket.
    expect(content).toContain("* [open] 1. Searching for random long name")
    expect(content).toContain("* [open] 2. \"No Maches\" string below search is slightly left aligned to search bar.")
    expect(content).toContain("* [open] 3. When type in the search bar and click on Search icon")
  })

  test("filters to actionable items only (open | reopen)", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    expect(content).toMatch(/state token is `open` or `reopen`/)
    expect(content).toMatch(/Items in any other state.*listed but not worked on in this run/)
    // Empty-actionable stop message.
    expect(content).toMatch(/has no `open` or `reopen` items/)
  })

  test("uses one branch per ticket and per-item commit subject identifying the item", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    // One branch per ticket is the explicit rule.
    expect(content).toMatch(/one branch per ticket/)
    expect(content).toMatch(/<pr-prefix>\/<TICKET>-checklist/)
    // Per-item commit subject shape.
    expect(content).toContain("<TICKET> - Checklist item #<N> -")
    expect(content).toContain("HVD-9954 - Checklist item 1 -")
    expect(content).toContain("HVD-9954 - Checklist item 3 -")
    // Stage only the files changed for this item; never `git add .`.
    expect(content).toContain("do not run `git add .`")
  })

  test("routes bug-shaped items to /ce-debug and feature-shaped to /ce-work", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    expect(content).toContain("`/ce-debug`")
    expect(content).toContain("`/ce-work`")
    // Bug vs feature heuristic is explicit.
    expect(content).toMatch(/bug.*feature|feature.*bug/i)
    // Ambiguous case must ask, not guess.
    expect(content).toMatch(/ambiguous/i)
    // Items delegated to a skill that fails do not get an invented transition.
    expect(content).toContain("stays `open` and the user is told")
  })

  test("writes the checklist field through the mcp-atlassian MCP server only (no curl)", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    expect(content).toContain("mcp-atlassian")
    expect(content).toContain("there is no `curl` write fallback")
    expect(content).toContain("do not fall back to `curl`")
    expect(content).toContain("mcp-atlassian_jira_update_issue")
    expect(content).toContain("mcp-atlassian_jira_get_issue")
  })

  test("marks items 'qa ready' by rewriting the checklist markdown via the MCP server", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    // The per-item status IS the bracketed token in the markdown; rewriting it is what flips the status.
    expect(content).toMatch(/per-item status.*is.*bracketed.*token|rewriting.*token.*is what moves.*status/i)
    // The flip goes through the MCP server (no UI automation).
    expect(content).toMatch(/no UI automation|not a UI action/i)
    expect(content).toContain("mcp-atlassian_jira_update_issue")
    // Skill must not depend on agent-browser for the qa-ready flip.
    expect(content).not.toMatch(/agent-browser/)
  })

  test("documents the SKIPPED annotation shape with an uppercase reason", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    expect(content).toContain("(SKIPPED: REASON_GOES_HERE)")
    expect(content).toContain("ALREADY FIXED IN ANOTHER TICKET")
    expect(content).toMatch(/uppercase letters, numbers, spaces/)
    // The state token stays the same; only the text annotation marks a skip.
    expect(content).toMatch(/Do \*\*not\*\* change the state token for skipped items/)
  })

  test("does not transition the ticket status or edit Test Behaviors", async () => {
    const content = await readRepoFile("skills/ce-fix-bugs/SKILL.md")

    // Skill does not move the ticket's overall status (that's ce-jira-update's job).
    expect(content).toMatch(/ticket.*status|`To Do`.*`In Progress`.*`In Review`/)
    // Skill does not touch Test Behaviors.
    expect(content).toContain("customfield_11643")
    expect(content).toMatch(/Does not write to.*customfield_11643|Test Behaviors.*ce-jira-update/i)
  })
})
