import { describe, expect, test } from "bun:test"
import { parseArgs } from "../scripts/release/cli"

describe("parseArgs — required flag", () => {
  test("rejects when --bump is missing", () => {
    expect(() => parseArgs([])).toThrow(/missing --bump/)
  })

  test("rejects an invalid --bump value", () => {
    expect(() => parseArgs(["--bump", "weekly"])).toThrow(/--bump must be patch/)
  })
})

describe("parseArgs — value form variants", () => {
  test("accepts --bump patch (space form)", () => {
    expect(parseArgs(["--bump", "patch"]).bump).toBe("patch")
  })

  test("accepts --bump=patch (equals form)", () => {
    expect(parseArgs(["--bump=patch"]).bump).toBe("patch")
  })

  test("accepts --notes with space form", () => {
    expect(parseArgs(["--bump", "patch", "--notes", "hello"]).notes).toBe("hello")
  })

  test("accepts --notes=value with equals form", () => {
    expect(parseArgs(["--bump=patch", "--notes=hello"]).notes).toBe("hello")
  })

  test("accepts --recent-skills with space form", () => {
    expect(parseArgs(["--bump", "patch", "--recent-skills", "a,b"]).recentSkills).toEqual(["a", "b"])
  })

  test("accepts --recent-skills=value with equals form", () => {
    expect(parseArgs(["--bump=patch", "--recent-skills=a,b"]).recentSkills).toEqual(["a", "b"])
  })

  test("trims whitespace around comma-separated skills", () => {
    expect(parseArgs(["--bump=patch", "--recent-skills=a, b , c"]).recentSkills).toEqual(["a", "b", "c"])
  })

  test("filters out empty entries from comma-separated skills", () => {
    expect(parseArgs(["--bump=patch", "--recent-skills=a,,b,"]).recentSkills).toEqual(["a", "b"])
  })
})

describe("parseArgs — boolean flags", () => {
  test("--dry-run sets dryRun true", () => {
    expect(parseArgs(["--bump=patch", "--dry-run"]).dryRun).toBe(true)
  })

  test("omitting --dry-run leaves dryRun false", () => {
    expect(parseArgs(["--bump=patch"]).dryRun).toBe(false)
  })
})

describe("parseArgs — combinations", () => {
  test("parses a full set of flags in mixed forms", () => {
    const result = parseArgs([
      "--bump=minor",
      "--notes=release notes text",
      "--recent-skills", "ce-fix-bugs,ce-jira-update",
      "--dry-run",
    ])
    expect(result).toEqual({
      bump: "minor",
      notes: "release notes text",
      recentSkills: ["ce-fix-bugs", "ce-jira-update"],
      migrationNote: null,
      dryRun: true,
    })
  })
})

describe("parseArgs — --migration-note", () => {
  test("accepts --migration-note with space form", () => {
    expect(parseArgs(["--bump", "patch", "--migration-note", "hello"]).migrationNote).toBe("hello")
  })

  test("accepts --migration-note=value with equals form", () => {
    expect(parseArgs(["--bump=patch", "--migration-note=hello"]).migrationNote).toBe("hello")
  })

  test("defaults to null when --migration-note is not passed", () => {
    expect(parseArgs(["--bump=patch"]).migrationNote).toBeNull()
  })

  test("preserves newlines and special characters in the note", () => {
    const note = "5b. Edit ~/.config/opencode/opencode.json and change api.thehive.ai to api-cdn.thehive.ai in every baseURL. If already changed, do nothing."
    expect(parseArgs(["--bump=patch", `--migration-note=${note}`]).migrationNote).toBe(note)
  })
})
