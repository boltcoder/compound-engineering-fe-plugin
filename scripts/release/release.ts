#!/usr/bin/env bun
/**
 * Repeatable release pipeline for compound-engineering-fe-plugin.
 *
 * Usage:
 *   bun run scripts/release/release.ts --bump minor [--notes "..."] [--dry-run]
 *
 * What it does (in order):
 *   1. Validates: on main, clean tree, up to date with origin.
 *   2. Reads current version from package.json.
 *   3. Computes next version from --bump (patch|minor|major).
 *   4. Bumps version across all 8 plugin manifests + .release-please-manifest.json.
 *   5. Generates a CHANGELOG.md entry from git log since the last tag.
 *   6. Commits, tags (vX.Y.Z), pushes both.
 *   7. Creates a GitHub Release via `gh release create`.
 *
 * --dry-run prints what would happen without writing or pushing.
 */

import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// =====================================================
//  Args
// =====================================================

type BumpLevel = "patch" | "minor" | "major"

function parseArgs(argv: string[]): {
  bump: BumpLevel | null
  notes: string | null
  dryRun: boolean
} {
  let bump: BumpLevel | null = null
  let notes: string | null = null
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--bump") {
      const val = argv[i + 1]
      if (val === "patch" || val === "minor" || val === "major") {
        bump = val
      } else {
        console.error(`--bump must be patch|minor|major, got: ${val}`)
        process.exit(1)
      }
      i++
      continue
    }
    if (arg === "--notes") {
      notes = argv[i + 1] ?? null
      i++
      continue
    }
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/release/release.ts --bump <patch|minor|major> [--notes \"...\"] [--dry-run]")
      process.exit(0)
    }
  }

  if (!bump) {
    console.error("Usage: bun run scripts/release/release.ts --bump <patch|minor|major> [--notes \"...\"] [--dry-run]")
    process.exit(1)
  }

  return { bump, notes, dryRun }
}

// =====================================================
//  Helpers
// =====================================================

function run(cmd: string, opts?: { capture?: boolean; cwd?: string }): string {
  if (opts?.capture) {
    return execSync(cmd, { encoding: "utf8", cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] }).trim()
  }
  execSync(cmd, { cwd: opts?.cwd, stdio: "inherit" })
  return ""
}

function bumpVersion(version: string, bump: BumpLevel): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Unsupported version format: ${version}`)
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  switch (bump) {
    case "major": return `${major + 1}.0.0`
    case "minor": return `${major}.${minor + 1}.0`
    case "patch": return `${major}.${minor}.${patch + 1}`
  }
}

// All files that carry the version string, with the JSON path to update.
const VERSION_FILES: Array<{ file: string; jsonPath?: string }> = [
  { file: "package.json" },
  { file: "plugin.json" },
  { file: ".claude-plugin/plugin.json" },
  { file: ".cursor-plugin/plugin.json" },
  { file: ".codex-plugin/plugin.json" },
  { file: ".kimi-plugin/plugin.json" },
  { file: ".grok-plugin/plugin.json" },
  { file: ".devin-plugin/plugin.json" },
]

const MANIFEST_FILE = ".github/.release-please-manifest.json"
const CHANGELOG_FILE = "CHANGELOG.md"
const REPO_URL = "https://github.com/boltcoder/compound-engineering-fe-plugin"

function updateVersionInFile(filePath: string, oldVersion: string, newVersion: string): boolean {
  const content = readFileSync(filePath, "utf8")
  // For .release-please-manifest.json, only bump the "." key
  if (filePath === MANIFEST_FILE) {
    const json = JSON.parse(content)
    if (json["."] === oldVersion) {
      json["."] = newVersion
      writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n")
      return true
    }
    return false
  }
  // For plugin.json files, update the "version" field
  const json = JSON.parse(content)
  if (json.version === oldVersion) {
    json.version = newVersion
    writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n")
    return true
  }
  return false
}

function getLastTag(): string | null {
  try {
    return run("git describe --tags --abbrev=0", { capture: true })
  } catch {
    return null
  }
}

function generateChangelogEntry(newVersion: string, lastTag: string | null): string {
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD"
  const log = run(`git log ${range} --oneline --no-merges`, { capture: true })

  const features: string[] = []
  const fixes: string[] = []
  const others: string[] = []

  for (const line of log.split("\n")) {
    if (!line.trim()) continue
    const hash = line.substring(0, 7)
    const msg = line.substring(8)
    if (/^feat/i.test(msg)) {
      features.push(`* ${msg} (${hash})`)
    } else if (/^fix/i.test(msg)) {
      fixes.push(`* ${msg} (${hash})`)
    } else if (!/^(chore|docs|test|ci|build|style|refactor|perf|revert):/i.test(msg)) {
      others.push(`* ${msg} (${hash})`)
    }
  }

  const compareUrl = lastTag
    ? `${REPO_URL}/compare/${lastTag}...v${newVersion}`
    : `${REPO_URL}/releases/tag/v${newVersion}`

  let entry = `## [${newVersion}](${compareUrl}) (${new Date().toISOString().split("T")[0]})\n\n`

  if (features.length > 0) {
    entry += `### Features\n\n${features.join("\n")}\n\n`
  }
  if (fixes.length > 0) {
    entry += `### Bug Fixes\n\n${fixes.join("\n")}\n\n`
  }
  if (others.length > 0) {
    entry += `### Other Changes\n\n${others.join("\n")}\n\n`
  }

  return entry
}

function prependChangelog(entry: string): void {
  const content = readFileSync(CHANGELOG_FILE, "utf8")
  const newContent = content.replace(/^# Changelog\n/, `# Changelog\n\n${entry}`)
  writeFileSync(CHANGELOG_FILE, newContent)
}

function generateConsumerUpgradeNotes(version: string): string {
  return `

---

## Use this prompt to upgrade

Copy the prompt below and paste it into any opencode session. The agent will pin the plugin ref, restart opencode, and run \`/ce-setup\` to walk you through Jira setup. Make sure the prerequisites are installed in your terminal first — the prompt does not install them.

### Prerequisites (install once in a terminal before pasting the prompt)

\`\`\`bash
brew install gh
npm install -g agent-browser && agent-browser install
# Docker Desktop: https://docs.docker.com/get-docker/
\`\`\`

### Paste this into opencode

\`\`\`
Upgrade the compound-engineering-fe plugin to v${version} in this opencode install.

1. Edit ~/.config/opencode/opencode.json and pin the plugin ref to v${version}:
   {
     "plugin": ["compound-engineering-fe@git+https://github.com/boltcoder/compound-engineering-fe-plugin.git#v${version}"]
   }
2. Restart opencode (close and reopen the session) so the new plugin ref is loaded.
3. After restart, in any project, run /ce-setup. It will check for gh, agent-browser, and docker; then walk me through Jira setup — ask for my GitHub username, Atlassian email, and API token one by one, and write them to my shell profile. Have my API token ready (create one at https://id.atlassian.com/manage-profile/security/api-tokens).
4. When /ce-setup finishes, confirm which tools and credentials are now in place and what (if anything) still needs to be installed manually.
\`\`\`
`
}

// =====================================================
//  Main
// =====================================================

const args = parseArgs(process.argv.slice(2))
const dryRun = args.dryRun

console.log(dryRun ? "=== DRY RUN ===" : "=== RELEASE PIPELINE ===")
console.log(`Bump: ${args.bump}`)

// 1. Validate git state
console.log("\n1. Validating git state...")
const branch = run("git rev-parse --abbrev-ref HEAD", { capture: true })
if (branch !== "main") {
  console.error(`Must be on main, currently on: ${branch}`)
  process.exit(1)
}

const status = run("git status --porcelain", { capture: true })
if (status) {
  console.error(`Working tree is not clean:\n${status}`)
  process.exit(1)
}

run("git fetch origin main")
const localHead = run("git rev-parse HEAD", { capture: true })
const remoteHead = run("git rev-parse origin/main", { capture: true })
if (localHead !== remoteHead) {
  console.error(`Local main is out of sync with origin/main`)
  process.exit(1)
}
console.log("   On main, clean tree, up to date with origin.")

// 2. Read current version
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const currentVersion = pkg.version
const newVersion = bumpVersion(currentVersion, args.bump)
console.log(`\n2. Version: ${currentVersion} -> ${newVersion} (${args.bump})`)

if (dryRun) {
  console.log("\n   [dry-run] Would bump these files:")
  for (const { file } of VERSION_FILES) console.log(`     - ${file}`)
  console.log(`     - ${MANIFEST_FILE}`)
  console.log(`     - ${CHANGELOG_FILE}`)
  console.log(`\n   [dry-run] Would commit, tag v${newVersion}, push, and create GitHub Release.`)
  process.exit(0)
}

// 3. Bump all manifest files
console.log("\n3. Bumping version in manifest files...")
let updated = 0
for (const { file } of VERSION_FILES) {
  if (updateVersionInFile(file, currentVersion, newVersion)) {
    console.log(`   ✓ ${file}`)
    updated++
  } else {
    console.error(`   ✗ ${file} — version field not found or mismatched`)
    process.exit(1)
  }
}
if (updateVersionInFile(MANIFEST_FILE, currentVersion, newVersion)) {
  console.log(`   ✓ ${MANIFEST_FILE}`)
  updated++
} else {
  console.error(`   ✗ ${MANIFEST_FILE} — "." key not found or mismatched`)
  process.exit(1)
}
console.log(`   ${updated} files updated.`)

// 4. Generate and prepend CHANGELOG entry
console.log("\n4. Generating CHANGELOG entry...")
const lastTag = getLastTag()
const changelogEntry = generateChangelogEntry(newVersion, lastTag)
prependChangelog(changelogEntry)
console.log(`   ✓ ${CHANGELOG_FILE} updated (entry from ${lastTag ?? "beginning"} to HEAD)`)

// 5. Commit
console.log("\n5. Committing...")
run(`git add -A`)
run(`git commit -m "chore(release): bump version to ${newVersion}"`)
console.log("   ✓ Committed.")

// 6. Tag
console.log(`\n6. Tagging v${newVersion}...`)
run(`git tag -a v${newVersion} -m "Release v${newVersion}"`)
console.log(`   ✓ Tagged.`)

// 7. Push
console.log("\n7. Pushing commit + tag...")
run("git push origin main")
run(`git push origin v${newVersion}`)
console.log("   ✓ Pushed.")

// 8. Create GitHub Release
console.log(`\n8. Creating GitHub Release v${newVersion}...`)
const consumerUpgrade = generateConsumerUpgradeNotes(newVersion)
const releaseNotes = (args.notes ?? changelogEntry) + consumerUpgrade
const tmpFile = path.join(require("node:os").tmpdir(), `ce-release-${newVersion}.md`)
writeFileSync(tmpFile, releaseNotes)
run(`gh release create v${newVersion} --title "v${newVersion}" --notes-file "${tmpFile}"`)
console.log("   ✓ GitHub Release created.")

console.log(`\n=== DONE: v${newVersion} released ===`)
console.log(`   ${REPO_URL}/releases/tag/v${newVersion}`)
