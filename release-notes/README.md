# Release notes

Each release has its own notes file in this directory. The release workflow
reads it verbatim and uses it as the GitHub Release body, so write it like
something a human would actually want to read.

## How to cut a release

1. Pick the next version (e.g. `0.2.0`) and update `package.json` `"version"`.
2. Create `release-notes/<version>.md` (no `v` prefix — just `0.2.0.md`).
3. Commit both: `git commit -am "Release v0.2.0"`.
4. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin main --tags
   ```
5. The [Release workflow](../.github/workflows/release.yml) will:
   - Verify the tag matches `package.json` version
   - Verify `release-notes/<version>.md` exists
   - Build the `.vsix` via `npm run package:vsix`
   - Create a GitHub Release with that file attached and these notes as the body

If the tag/version or notes file is missing, the workflow fails fast so
nothing half-baked gets published.

## Style guide for notes

The goal is notes that a user installing the extension can read in 30 seconds
and understand what changed and whether they care. Suggested sections, in
priority order — omit any that don't apply:

```markdown
## <short summary line — what this release is about>

### Highlights        ← only for notable releases; 2-3 bullets max
### Added             ← new features
### Changed           ← behavior changes (call out breaking changes explicitly)
### Fixed             ← bug fixes
### Removed           ← removed features / settings
### Install           ← always include for first release; optional after that
```

Tips:

- Lead with **what users see**, not implementation details. "Status bar button
  now shows restore icon when maximized" beats "updated updateStatusBar logic."
- Call out **breaking changes** with a `**Breaking:**` prefix on the bullet.
- Link to PRs / issues where it adds context (`(#42)`), but don't make it
  the whole message.
- Keep it tight — bullets, not paragraphs.
