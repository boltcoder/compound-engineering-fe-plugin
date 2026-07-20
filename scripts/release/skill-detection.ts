#!/usr/bin/env bun
/**
 * Pure helpers for the "What's new in this release" auto-detection in release.ts.
 * Kept separate so they can be unit-tested without running the whole release pipeline.
 *
 * These functions assume they're called from a git repo root and operate on the
 * local skill tree at `skills/<name>/SKILL.md` and the docs tree at
 * `docs/skills/<name>.md`.
 */

import { existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"

export function findNewSkillsBetweenRefs(fromRef: string, toRef: string = "HEAD"): string[] {
  const diff = execSync(`git diff --name-only ${fromRef}..${toRef} -- skills/`, {
    encoding: "utf8",
  }).trim()
  const skills = new Set<string>()
  for (const filePath of diff.split("\n")) {
    const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(filePath)
    if (match) skills.add(match[1])
  }
  return Array.from(skills).sort()
}

/**
 * Returns the most recent tag whose minor version is strictly less than the
 * provided current tag. For v3.21.1 with v3.20.0, v3.20.1, v3.20.2 tags
 * available → returns v3.20.2 (most recent of the lower-minor tags).
 *
 * Pass `currentTag` explicitly so this function is fully testable without
 * needing a real git state — callers in release.ts pass `getLastTag()`.
 */
export function findPreviousMinorTag(currentTag: string, allTags: string[]): string | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(currentTag)
  if (!m) return null
  const currentMinor = Number(m[2])

  // Sort tags descending by version so the first match is the most recent.
  const sorted = [...allTags]
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
    .sort((a, b) => {
      const am = /^v(\d+)\.(\d+)\.(\d+)$/.exec(a)!
      const bm = /^v(\d+)\.(\d+)\.(\d+)$/.exec(b)!
      const va = Number(am[1]) * 1_000_000 + Number(am[2]) * 1_000 + Number(am[3])
      const vb = Number(bm[1]) * 1_000_000 + Number(bm[2]) * 1_000 + Number(bm[3])
      return vb - va
    })

  for (const tag of sorted) {
    const tm = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)!
    if (Number(tm[2]) < currentMinor) return tag
  }
  return null
}

/**
 * Reads the `description:` field from a skill's YAML frontmatter. Trims
 * surrounding quotes if present. Returns a fallback string if the file,
 * the frontmatter block, or the description field is missing.
 */
export function readSkillDescription(
  skillName: string,
  repoRoot: string = process.cwd(),
): string {
  const filePath = `${repoRoot}/skills/${skillName}/SKILL.md`
  if (!existsSync(filePath)) return "(no description available)"
  const content = readFileSync(filePath, "utf8")
  const parts = content.split(/^---\s*$/m)
  if (parts.length < 3) return "(no frontmatter found)"
  const fm = parts[1] ?? ""
  const m = /^description:\s*(.+?)\s*$/m.exec(fm)
  if (!m) return "(no description in frontmatter)"
  return m[1].replace(/^["']|["']$/g, "").trim()
}

/**
 * Pretty-print a git ref for the "since X" annotation in release notes.
 * Tags render verbatim; anything else (commit hash) is shortened to 7 chars.
 */
export function lookbackTagDisplay(ref: string): string {
  return /^v\d+\.\d+\.\d+$/.test(ref) ? ref : ref.slice(0, 7)
}

export type SkillEntry = {
  name: string
  description: string
  docsPath: string | null
  bullet: string
}

/**
 * Build the per-skill entry objects used by the "What's new" section.
 * Pure: does not write anything, only reads the file system.
 */
export function buildSkillEntries(
  skillNames: string[],
  repoRoot: string = process.cwd(),
): SkillEntry[] {
  return skillNames.map((name) => {
    const description = readSkillDescription(name, repoRoot)
    const docsPath = `${repoRoot}/docs/skills/${name}.md`
    const hasDocs = existsSync(docsPath)
    const bullet =
      `- **\`${name}\`** — ${description}\n` +
      (hasDocs
        ? `  - Docs: \`docs/skills/${name}.md\`\n`
        : `  - Docs: _(not yet documented)_\n`) +
      `  - How to use it: invoke \`/${name}\` after the trigger condition is met (see the linked docs page for the exact entry point and any required args).`
    return {
      name,
      description,
      docsPath: hasDocs ? `docs/skills/${name}.md` : null,
      bullet,
    }
  })
}
