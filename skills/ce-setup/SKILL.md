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

This phase sets up the `mcp-atlassian` server in a local Docker container so Jira and Confluence tools are available to the agent. The user sets `JIRA_USERNAME` and `JIRA_API_TOKEN` in `<repo-root>/.compound-engineering/config.local.yaml` under the "Hive Based Configurations" stanza (or exports them in the shell so the Docker container picks them up at start); ce-setup never prompts for or stores the secret value. `JIRA_URL` defaults to the org-wide `https://chatous.atlassian.net` baked into the readiness script; override via the `JIRA_URL` env var for a different org. It is entirely optional — declining skips the whole phase.

### Step 8: Run the Atlassian MCP readiness check

Set `SKILL_DIR` to the absolute directory you loaded this `SKILL.md` from:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
if [ -f "$SKILL_DIR/scripts/install-mcp-atlassian" ]; then bash "$SKILL_DIR/scripts/install-mcp-atlassian"; else echo "Bundled script not found at $SKILL_DIR/scripts/install-mcp-atlassian; skipping Atlassian MCP phase."; fi
```

Display the output to the user. The script reports four readiness dimensions: Docker running, image pulled, Atlassian account reachable (authenticated GET to Jira `/myself` using `JIRA_URL` + `JIRA_USERNAME` + `JIRA_API_TOKEN`; `JIRA_URL` falls back to `https://chatous.atlassian.net` when unset), and opencode MCP config present.

### Step 9: Ask Whether to Set Up Atlassian MCP

Ask the user:

```text
Set up the Atlassian MCP server (Jira + Confluence) via Docker?
This runs mcp-atlassian in a local container and wires it into opencode.

1. Yes, set it up
2. No thanks
```

If the user declines, skip the rest of this phase. If the user accepts, continue.

### Step 10: Verify Atlassian credentials are valid

The readiness check in Step 8 already attempted an authenticated GET to the Jira `/myself` endpoint using `JIRA_URL`, `JIRA_USERNAME`, and `JIRA_API_TOKEN`. If that probe returned 200, the credentials are valid and the account is reachable — continue to Step 11.

If the probe failed (401/403 = bad token, 404 = wrong URL, 000 = network error), or if `JIRA_USERNAME`/`JIRA_API_TOKEN` were unset, do not continue. Print guidance — never prompt for the secret value and never store it:

```text
Atlassian credentials could not be verified.
Set these in .compound-engineering/config.local.yaml under
"Hive Based Configurations" and export them in the shell so the
mcp-atlassian container picks them up at start:
  JIRA_USERNAME="your.email@company.com"
  JIRA_API_TOKEN="your_atlassian_api_token"
JIRA_URL defaults to https://chatous.atlassian.net (override via the
JIRA_URL env var for a different org).
Create a token at:
  https://id.atlassian.com/manage-profile/security/api-tokens
Restart your terminal (or source the profile) and run /ce-setup again.
```

If the probe succeeded but `JIRA_USERNAME` or `JIRA_API_TOKEN` was unset (the script skips the API call in that case and reports the vars as missing), stop with the same guidance.

### Step 11: Pull the Docker image if needed

If the readiness check reported the image as not pulled, pull it:

```bash
docker pull ghcr.io/sooperset/mcp-atlassian:latest
```

If Docker is not installed or not running, stop this phase and tell the user to install Docker (https://docs.docker.com/get-docker/) and rerun `/ce-setup`.

### Step 12: Write the MCP server entry into opencode config

The target is the user's global opencode config at `~/.config/opencode/opencode.json` (create it if missing; if `opencode.jsonc` exists instead, edit that). ce-setup adds an `mcp-atlassian` entry under the top-level `mcp` key without disturbing existing MCP servers or other config.

The entry uses opencode's `{env:VAR}` substitution so the secret is read from the environment at runtime, never written into the config file:

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
        "JIRA_API_TOKEN": "{env:JIRA_API_TOKEN}"
      }
    }
  }
}
```

Notes for the agent:
- `JIRA_USERNAME` and `JIRA_API_TOKEN` must be exported in the shell where opencode runs (set them in `.compound-engineering/config.local.yaml` under "Hive Based Configurations" as the source of truth, then export). `JIRA_URL` defaults to `https://chatous.atlassian.net` via the readiness script; here in the opencode entry it still uses `{env:JIRA_URL}` — if the user has not exported `JIRA_URL` themselves, tell them to set it (e.g. `export JIRA_URL=https://chatous.atlassian.net`) so the container resolves it at start. If any value is unset, the `{env:...}` resolves to empty and the container will fail to authenticate on first use.
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
