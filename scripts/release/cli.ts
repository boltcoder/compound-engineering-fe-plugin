#!/usr/bin/env bun
/**
 * CLI argument parsing for scripts/release/release.ts.
 * Kept separate so parseArgs is unit-testable without invoking the full pipeline.
 *
 * Accepts both `--flag value` and `--flag=value` forms for every value-taking flag.
 */

export type BumpLevel = "patch" | "minor" | "major"

export type ParsedReleaseArgs = {
  bump: BumpLevel | null
  notes: string | null
  recentSkills: string[]
  migrationNote: string | null
  dryRun: boolean
}

export function parseArgs(argv: string[]): ParsedReleaseArgs {
  let bump: BumpLevel | null = null
  let notes: string | null = null
  let recentSkills: string[] = []
  let migrationNote: string | null = null
  let dryRun = false

  // Accept both `--flag value` and `--flag=value` forms.
  const splitFlag = (raw: string): { key: string; inlineValue: string | null } => {
    const eq = raw.indexOf("=")
    if (eq === -1) return { key: raw, inlineValue: null }
    return { key: raw.slice(0, eq), inlineValue: raw.slice(eq + 1) }
  }

  for (let i = 0; i < argv.length; i++) {
    const { key: arg, inlineValue } = splitFlag(argv[i])
    if (arg === "--bump") {
      const val = inlineValue ?? argv[i + 1]
      if (val === "patch" || val === "minor" || val === "major") {
        bump = val
      } else {
        throw new Error(`--bump must be patch|minor|major, got: ${val}`)
      }
      if (inlineValue === null) i++
      continue
    }
    if (arg === "--notes") {
      notes = inlineValue ?? argv[i + 1] ?? null
      if (inlineValue === null) i++
      continue
    }
    if (arg === "--recent-skills") {
      const val = inlineValue ?? argv[i + 1] ?? ""
      recentSkills = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      if (inlineValue === null) i++
      continue
    }
    if (arg === "--migration-note") {
      migrationNote = inlineValue ?? argv[i + 1] ?? null
      if (inlineValue === null) i++
      continue
    }
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }
  }

  if (!bump) {
    throw new Error("missing --bump")
  }

  return { bump, notes, recentSkills, migrationNote, dryRun }
}

export function printUsage(): void {
  console.log(
    "Usage: bun run scripts/release/release.ts --bump <patch|minor|major> [--notes \"...\"] [--recent-skills \"a,b\"] [--migration-note \"...\"] [--dry-run]",
  )
}
