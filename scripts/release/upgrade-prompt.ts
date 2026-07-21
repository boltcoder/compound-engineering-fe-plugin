/**
 * Builds the "Use this prompt to upgrade" section that gets appended to every
 * GitHub Release body. Extracted from release.ts so the prompt shape can be
 * unit-tested without running the whole release pipeline.
 *
 * Two behaviors are owned here:
 *
 *  1. Cumulative-changes summary (every release from now on): the prompt tells
 *     the agent to detect the user's currently-installed version by reading the
 *     pinned ref from ~/.config/opencode/opencode.json, then fetch every GitHub
 *     Release between that version and the target version, and present an
 *     informative summary of new/changed skills across the whole range — not
 *     just the single latest release. This runs after /ce-setup finishes.
 *
 *  2. One-time migration instructions (--migration-note on the release CLI):
 *     an arbitrary string of extra steps inserted into the prompt for THIS
 *     release only. Used for one-off migrations like the api.thehive.ai ->
 *     api-cdn.thehive.ai base-URL rewrite. Empty for normal releases.
 */

export type UpgradePromptOptions = {
  /** Target version being released, e.g. "3.21.3" (no leading 'v'). */
  version: string
  /** Skills auto-detected as new in this release (drives the per-release walkthrough step). */
  newSkills: string[]
  /** One-time migration instructions inserted into the prompt for this release only. Empty string for no migration. */
  migrationNote?: string
}

export function buildUpgradePrompt(opts: UpgradePromptOptions): string {
  const { version, newSkills } = opts
  const migrationNote = opts.migrationNote?.trim() ?? ""

  const migrationStep = migrationNote
    ? `${migrationNote}\n`
    : ""

  const onboardingStep =
    newSkills.length > 0
      ? `
7. After the cumulative summary, walk me through each NEW skill shipped specifically in v${version} (not the whole range — only the ones new in this release). Use \`gh release view v${version} --json body --jq '.body'\` to read this release's notes, find the "What's new in this release" section, and for every skill listed there tell me: (a) what it does in one line, (b) when to reach for it, (c) how to invoke it. Read \`docs/skills/<skill>.md\` for each so you can answer accurately, not from memory.
8. When the walkthrough is done, confirm I have everything I need to start using the new skills in this project.`
      : `
7. When the summary is done, confirm I have everything I need to start using any new skills in this project.`

  return `
---

## Use this prompt to upgrade

Copy the prompt below and paste it into any opencode session. The agent will walk you through the whole upgrade — installing prerequisites, pinning the plugin ref, restarting opencode, and running \`/ce-setup\`.

\`\`\`
Upgrade the compound-engineering-fe plugin to v${version} in this opencode install.

1. Make sure the required tools are installed. Run each of these in a terminal (skip any that are already installed) and report back the output of each:
   - gh:    brew install gh
   - agent-browser: npm install -g agent-browser && agent-browser install
   - Docker Desktop: install from https://docs.docker.com/get-docker/ (the daemon must be running before /ce-setup runs)
2. Edit ~/.config/opencode/opencode.json and pin the plugin ref to v${version}:
   {
     "plugin": ["compound-engineering-fe@git+https://github.com/boltcoder/compound-engineering-fe-plugin.git#v${version}"]
   }
3. Restart opencode (close and reopen the session) so the new plugin ref is loaded.
4. After restart, in any project, run /ce-setup. It will re-check for gh, agent-browser, and docker; then walk me through Jira setup — ask for my GitHub username, Atlassian email, and API token one by one, and write them to my shell profile. Have my API token ready (create one at https://id.atlassian.com/manage-profile/security/api-tokens).
5. When /ce-setup finishes, confirm which tools and credentials are now in place and what (if anything) still needs to be installed manually.${migrationStep ? `\n${migrationStep}` : ""}
6. After /ce-setup finishes, produce a cumulative summary of everything that has changed between my currently-installed version and v${version}. Steps:
   a. Read ~/.config/opencode/opencode.json and find the currently-pinned plugin ref. Parse the \`#vX.Y.Z\` suffix to determine my current version. If the file has no pinned ref, or the version can't be parsed, ask me once for my current version (e.g. "3.20.0") and continue.
   b. If my current version is already v${version} or newer, tell me "You're already on v${version} or newer; no upgrade summary needed" and skip to step 7.
   c. Otherwise, list every GitHub Release between my current version (exclusive) and v${version} (inclusive) in ascending order. Use \`gh release list --limit 50\` to enumerate, then \`gh release view v<VERSION> --json body --jq '.body'\` for each release in the range.
   d. For each release in the range, extract: the version, the "What's new in this release" section (new skills auto-detected by the release pipeline), and the Features / Bug Fixes sections from the changelog entry. De-duplicate skills — if a skill appears in multiple releases' "What's new" sections, list it once and note which release introduced it.
   e. Present a single consolidated summary in this shape:
      - "New skills since v<current>:" — one bullet per skill, with the release that introduced it and a one-line description (read \`docs/skills/<skill>.md\` for an accurate description, don't rely on memory).
      - "Other changes since v<current>:" — one bullet per release (version + date), each with a one-line gist of the notable Features/Bug Fixes from that release.
      - "Total: <N> releases between v<current> and v${version} (inclusive)."
   f. If \`gh release list\` errors or returns no releases in the range, tell me and skip the summary — don't block the rest of the upgrade.${onboardingStep}
\`\`\`
`
}
