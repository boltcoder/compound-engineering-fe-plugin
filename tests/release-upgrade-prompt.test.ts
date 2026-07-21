import { describe, expect, test } from "bun:test"
import { buildUpgradePrompt } from "../scripts/release/upgrade-prompt"

describe("buildUpgradePrompt — structure", () => {
  const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: ["ce-fix-bugs"] })

  test("includes the section header and copy-paste framing", () => {
    expect(prompt).toContain("## Use this prompt to upgrade")
    expect(prompt).toContain("Copy the prompt below and paste it into any opencode session")
  })

  test("targets the given version in the plugin ref", () => {
    expect(prompt).toContain("v3.21.3")
    expect(prompt).toContain("#v3.21.3")
  })

  test("keeps the prerequisite install step (gh, agent-browser, docker)", () => {
    expect(prompt).toContain("brew install gh")
    expect(prompt).toContain("agent-browser")
    expect(prompt).toContain("Docker Desktop")
  })

  test("keeps the /ce-setup step with Jira credential walk-through", () => {
    expect(prompt).toContain("/ce-setup")
    expect(prompt).toContain("Atlassian email")
    expect(prompt).toContain("api-tokens")
  })
})

describe("buildUpgradePrompt — cumulative summary (always-on)", () => {
  const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [] })

  test("step 6 reads the current version from ~/.config/opencode/opencode.json", () => {
    expect(prompt).toContain("~/.config/opencode/opencode.json")
    expect(prompt).toMatch(/parse.*#vX\.Y\.Z|currently-pinned plugin ref/i)
  })

  test("step 6 fetches every release between current and target via gh", () => {
    expect(prompt).toContain("gh release list --limit 50")
    expect(prompt).toContain("gh release view v<VERSION> --json body --jq '.body'")
  })

  test("step 6 handles the 'already up to date' case", () => {
    expect(prompt).toMatch(/already on v3\.21\.3 or newer/i)
  })

  test("step 6 enumerates the range in ascending order and de-duplicates skills", () => {
    expect(prompt).toMatch(/ascending order/)
    expect(prompt).toMatch(/De-duplicate skills/i)
  })

  test("step 6 degrades gracefully if gh release list errors", () => {
    expect(prompt).toMatch(/don't block the rest of the upgrade|skip the summary/i)
  })

  test("step 6 falls back to asking the user when the pinned ref can't be parsed", () => {
    expect(prompt).toMatch(/ask me once for my current version/i)
  })
})

describe("buildUpgradePrompt — new-skills walkthrough (conditional)", () => {
  test("includes step 7 per-skill walkthrough when newSkills is non-empty", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: ["ce-fix-bugs"] })
    expect(prompt).toContain("gh release view v3.21.3 --json body --jq '.body'")
    expect(prompt).toMatch(/only the ones new in this release/i)
    expect(prompt).toContain("docs/skills/<skill>.md")
    expect(prompt).toContain("step 7")
  })

  test("omits the per-skill walkthrough and keeps a simpler step 7 when newSkills is empty", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [] })
    expect(prompt).not.toContain("gh release view v3.21.3 --json body --jq '.body'")
    expect(prompt).toContain("step 7")
    expect(prompt).toMatch(/confirm I have everything I need/i)
  })
})

describe("buildUpgradePrompt — migration note (one-time, this release only)", () => {
  const migrationNote =
    "5b. Edit ~/.config/opencode/opencode.json and change api.thehive.ai to api-cdn.thehive.ai in every baseURL. If already changed, do nothing."

  test("includes the migration instruction in the prompt when provided", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [], migrationNote })
    expect(prompt).toContain("api.thehive.ai")
    expect(prompt).toContain("api-cdn.thehive.ai")
    expect(prompt).toContain("If already changed, do nothing")
  })

  test("does not include any migration text when migrationNote is empty", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [] })
    expect(prompt).not.toContain("api-cdn.thehive.ai")
    expect(prompt).not.toContain("migration")
  })

  test("does not include any migration text when migrationNote is whitespace-only", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [], migrationNote: "   \n  " })
    expect(prompt).not.toContain("api-cdn.thehive.ai")
  })

  test("migration step is inserted between step 5 (/ce-setup) and step 6 (cumulative summary)", () => {
    const prompt = buildUpgradePrompt({ version: "3.21.3", newSkills: [], migrationNote })
    const step5Idx = prompt.indexOf("When /ce-setup finishes, confirm which tools")
    const migrationIdx = prompt.indexOf("api-cdn.thehive.ai")
    const step6Idx = prompt.indexOf("produce a cumulative summary")
    expect(step5Idx).toBeGreaterThan(-1)
    expect(migrationIdx).toBeGreaterThan(step5Idx)
    expect(step6Idx).toBeGreaterThan(migrationIdx)
  })
})
