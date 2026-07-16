---
name: ce-setup
description: "Check Compound Engineering health and repo-local config."
disable-model-invocation: true
---

# Compound Engineering Setup

## Interaction Method

Ask each question below using the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to a numbered list in chat only when no blocking tool exists in the harness or the call errors. Never silently skip or auto-configure.

`ce-setup` is a lightweight health check and repo-local config helper. It does **not** bulk-install every optional dependency. Missing tools are reported as optional capabilities so the user can install only the workflows they use.

## Phase 1: Diagnose

### Step 1: Determine Plugin Version

Detect the installed compound-engineering plugin version by reading the plugin metadata or manifest when the platform exposes it. If the version cannot be determined, skip this step.

If a version is found, pass it to the check script via `--version`. Otherwise omit the flag.

### Step 2: Run the Health Check

Before running the script, display:

```text
Compound Engineering -- checking your environment...
```

Run the bundled check script. Set `SKILL_DIR` to the absolute directory you loaded this `ce-setup` SKILL.md from — the Bash tool's CWD is the user's project, not the skill dir, so a bare `scripts/` path will not resolve:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
if [ -f "$SKILL_DIR/scripts/check-health" ]; then bash "$SKILL_DIR/scripts/check-health" --version VERSION; else echo "Bundled health script not found at $SKILL_DIR/scripts/check-health; run the inline checks from ce-setup instead."; fi
```

Use the same command without `--version VERSION` if Step 1 could not determine a version.

If the script is unavailable, perform the inline equivalent:

1. Check optional tools with `command -v`: `agent-browser`, `gh`, `jq`, `ast-grep`, `ffmpeg`.
2. If inside a git repo, resolve the repo root with `git rev-parse --show-toplevel`.
3. Check for obsolete `compound-engineering.local.md` at the repo root.
4. Check whether `.compound-engineering/config.local.yaml` exists and, if it does, whether `git check-ignore -q .compound-engineering/config.local.yaml` succeeds.
5. Compare `.compound-engineering/config.local.example.yaml` with `references/config-template.yaml` when the template is readable; otherwise report that the example refresh must be done manually.

Display the diagnostic output to the user. Missing optional tools are not setup failures.

### Step 3: Decide Whether Repo-Local Fixes Are Needed

Proceed to Phase 2 only if one or more repo-local project issues exist:

- obsolete `compound-engineering.local.md`
- `.compound-engineering/config.local.yaml` exists but is not safely gitignored
- `.compound-engineering/config.local.example.yaml` is missing or outdated

If no project issues exist, proceed directly to Phase 3 (Atlassian MCP). Do not stop early — the Atlassian MCP check always runs.

If optional tools are missing, do not offer a bulk install. The diagnostic already printed the relevant install command or project URL. Say: "Install optional tools only for the workflows you use."

## Phase 2: Fix Repo-Local Issues

Resolve the repository root (`git rev-parse --show-toplevel`). All paths below are relative to the repo root, not the current working directory.

### Step 4: Remove Obsolete Local Config

If `compound-engineering.local.md` exists at the repo root, explain that it is obsolete because review-agent selection is automatic and surviving machine-local settings now live in `.compound-engineering/config.local.yaml`.

Ask whether to delete it now. Delete only if the user approves.

### Step 5: Refresh Example Config

Copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.example.yaml`, creating the directory if needed. This file is committed to the repo and should always reflect the latest available settings.

If the bundled template cannot be located by the current platform, print the source template path that failed and tell the user the example config could not be refreshed automatically.

### Step 6: Create Local Config If Wanted

If `.compound-engineering/config.local.yaml` does not exist, ask:

```text
Set up a local config file for this project?
This saves optional Compound Engineering preferences such as output formats and product pulse settings.
Everything starts commented out -- you only enable what you need.

1. Yes, create it
2. No thanks
```

If the user approves, copy `references/config-template.yaml` to `<repo-root>/.compound-engineering/config.local.yaml`.

### Step 7: Ensure Local Config Is Gitignored

If `.compound-engineering/config.local.yaml` exists and is not covered by `.gitignore`, offer to add:

```text
.compound-engineering/*.local.yaml
```

Append the entry to the repo-root `.gitignore` only if the user approves. Do not overwrite unrelated `.gitignore` content.

## Phase 3: Atlassian MCP Server (optional)

This phase sets up the `mcp-atlassian` server in a local Docker container so Jira and Confluence tools are available to the agent. The user must export `JIRA_API_KEY` (or `JIRA_API_TOKEN`) on their own system; ce-setup never prompts for or stores the secret value. It is entirely optional — declining skips the whole phase.

### Step 8: Run the Atlassian MCP readiness check

Set `SKILL_DIR` to the absolute directory you loaded this `SKILL.md` from:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
if [ -f "$SKILL_DIR/scripts/install-mcp-atlassian" ]; then bash "$SKILL_DIR/scripts/install-mcp-atlassian"; else echo "Bundled script not found at $SKILL_DIR/scripts/install-mcp-atlassian; skipping Atlassian MCP phase."; fi
```

Display the output to the user. The script reports four readiness dimensions: Docker running, image pulled, `JIRA_API_KEY`/`JIRA_API_TOKEN` set, and opencode MCP config present.

### Step 9: Ask Whether to Set Up Atlassian MCP

Ask the user:

```text
Set up the Atlassian MCP server (Jira + Confluence) via Docker?
This runs mcp-atlassian in a local container and wires it into opencode.

1. Yes, set it up
2. No thanks
```

If the user declines, skip the rest of this phase. If the user accepts, continue.

### Step 10: Verify JIRA_API_KEY or JIRA_API_TOKEN is set

The user must have exported `JIRA_API_KEY` (preferred) or `JIRA_API_TOKEN` in their shell. Check with a single command:

```bash
if [ -n "${JIRA_API_KEY:-${JIRA_API_TOKEN:-}}" ]; then echo "set"; else echo "unset"; fi
```

If unset, stop this phase and print guidance — do not prompt for the secret value and never store it:

```text
JIRA_API_KEY (or JIRA_API_TOKEN) is not set in your environment.
Create an Atlassian API token at:
  https://id.atlassian.com/manage-profile/security/api-tokens
Then export it in your shell profile (~/.zshrc or ~/.bashrc):
  export JIRA_API_KEY="your_token_here"
Restart your terminal (or source the profile) and run /ce-setup again.
```

Both env var names are interchangeable: `JIRA_API_KEY` is the user-facing name and is mapped to `JIRA_API_TOKEN` (the name the upstream container reads) in the opencode MCP config below.

### Step 11: Pull the Docker image if needed

If the readiness check reported the image as not pulled, pull it:

```bash
docker pull ghcr.io/sooperset/mcp-atlassian:latest
```

If Docker is not installed or not running, stop this phase and tell the user to install Docker (https://docs.docker.com/get-docker/) and rerun `/ce-setup`.

### Step 12: Write the MCP server entry into opencode config

The target is the user's global opencode config at `~/.config/opencode/opencode.json` (create it if missing; if `opencode.jsonc` exists instead, edit that). ce-set-up adds an `mcp-atlassian` entry under the top-level `mcp` key without disturbing existing MCP servers or other config.

The entry uses opencode's `{env:VAR}` substitution so the secret is read from the environment at runtime, never written into the config file. The container reads `JIRA_API_TOKEN`; pick the substitution based on which env var the user actually exports (detected in Step 10):

- If the user exports `JIRA_API_KEY`: map it -> `"JIRA_API_TOKEN": "{env:JIRA_API_KEY}"`
- If the user exports `JIRA_API_TOKEN`: use it directly -> `"JIRA_API_TOKEN": "{env:JIRA_API_TOKEN}"`

Template (substitute the `JIRA_API_TOKEN` value per the rule above):

```json
{
  "mcp": {
    "mcp-atlassian": {
      "type": "local",
      "command": [
        "docker", "run", "-i", "--rm",
        "-e", "JIRA_URL",
        "-e", "JIRA_USERNAME",
        "-e", "JIRA_API_TOKEN",
        "ghcr.io/sooperset/mcp-atlassian:latest"
      ],
      "enabled": true,
      "environment": {
        "JIRA_URL": "{env:JIRA_URL}",
        "JIRA_USERNAME": "{env:JIRA_USERNAME}",
        "JIRA_API_TOKEN": "{env:JIRA_API_KEY}"
      }
    }
  }
}
```

Notes for the agent:
- `JIRA_URL` and `JIRA_USERNAME` must also be exported by the user (e.g. `https://your-company.atlassian.net` and `you@company.com`). If they are unset, the `{env:...}` resolves to empty and the container will fail to authenticate on first use — tell the user to export them alongside the token.
- Use `jq` to merge the entry into an existing config non-destructively. If `jq` is unavailable, read the file as JSON, add the key, and write it back with proper formatting. Never overwrite the entire file; preserve all existing keys, comments (in `.jsonc`), and whitespace where feasible.
- If the `mcp-atlassian` entry already exists, leave it unless the user asks to rewrite it.

## Phase 4: Summary

Display a brief summary:

```text
✅ Compound Engineering setup complete

Fixed:      <repo-local fixes applied, or none>
Skipped:    <repo-local fixes declined, or none>
Atlassian:  <mcp-atlassian status: configured | declined | blocked (reason) | not attempted>
Optional:   <missing optional tools, or all available>

Run /ce-setup anytime to re-check.
```
