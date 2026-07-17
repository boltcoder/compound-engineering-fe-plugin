# Installing Compound Engineering for OpenCode

Add Compound Engineering to the `plugin` array in your global or project `opencode.json`:

```json
{
  "plugin": ["compound-engineering-fe@git+https://github.com/boltcoder/compound-engineering-fe-plugin.git"]
}
```

Restart OpenCode after changing the config. The OpenCode plugin registers the Compound Engineering skills directory directly; no Bun installer or generated skill copy is required.

To pin a release, add a tag. Replace `X.Y.Z` with the release you want — see the [releases page](https://github.com/boltcoder/compound-engineering-fe-plugin/releases) for available tags:

```json
{
  "plugin": ["compound-engineering-fe@git+https://github.com/boltcoder/compound-engineering-fe-plugin.git#vX.Y.Z"]
}
```

## Local Development

From this checkout, point OpenCode at the package path:

```json
{
  "plugin": ["/path/to/compound-engineering-fe-plugin"]
}
```

Restart OpenCode after changing the package source.
