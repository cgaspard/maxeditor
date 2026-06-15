# VS Code API Request: Layout Visibility

## Background

This extension needs to know whether the sidebar, bottom panel, and auxiliary bar
are currently visible before hiding them — so they can be restored to their exact
previous state on unmaximize.

VS Code does not expose this through the public Extension API. The layout buttons
in the title bar track this state correctly because they run in the renderer
process with direct access to `IWorkbenchLayoutService`. Extensions run in the
extension host and have no bridge to that service.

The only workaround today is to parse VS Code's internal `state.vscdb` SQLite
file directly. This is stale mid-session (VS Code only flushes it on window
close) and relies on undocumented storage keys.

## What We Requested

Expose three new read-only properties and one event on `vscode.window`:

```typescript
// Current visibility state
vscode.window.isSideBarVisible: boolean
vscode.window.isPanelVisible: boolean
vscode.window.isAuxiliaryBarVisible: boolean

// Event fired whenever any of the three change
vscode.window.onDidChangeLayoutVisibility: Event<{
  sideBar: boolean;
  panel: boolean;
  auxiliaryBar: boolean;
}>
```

These would bridge `IWorkbenchLayoutService.isVisible()` and
`onDidChangePartVisibility` from the renderer to the extension host — the same
pattern used for `vscode.window.state` (`focused`, `active`).

## Links

- **GitHub Issue**: https://github.com/microsoft/vscode/issues/321409
- **Pull Request**: https://github.com/microsoft/vscode/pull/321414
- **Proposal file**: `src/vscode-dts/vscode.proposed.layoutVisibility.d.ts` (in the PR)

## Once Accepted

When this API ships in VS Code Insiders:

1. Add `"enabledApiProposals": ["layoutVisibility"]` to `package.json`
2. Copy `vscode.proposed.layoutVisibility.d.ts` from the VS Code repo into this project
3. Replace the `probeLayoutFromDb()` call in `src/extension.ts` with:
   ```typescript
   current.sideBar      = vscode.window.isSideBarVisible;
   current.panel        = vscode.window.isPanelVisible;
   current.auxiliaryBar = vscode.window.isAuxiliaryBarVisible;
   ```
4. Subscribe to `vscode.window.onDidChangeLayoutVisibility` to keep `current` accurate mid-session
5. Once finalized (moved from proposed → stable), remove `enabledApiProposals` and delete the local `.d.ts` copy
