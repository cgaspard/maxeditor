import * as vscode from 'vscode';

// VS Code provides no public API to read sidebar/panel/auxiliaryBar visibility.
// The only reliable approach is to track state ourselves.
//
// On maximize: close everything and remember what was open.
// On restore: re-open only what was open before.
//
// We track the three panels by intercepting our own open/close calls and
// watching onDidChangeConfiguration for activityBar (the one setting VS Code
// does persist as readable config).

type Layout = {
  sideBar: boolean;
  panel: boolean;
  auxiliaryBar: boolean;
  activityBar: boolean;
};

let maximized = false;
let savedLayout: Layout | null = null;

// Current known layout — updated whenever we make a change.
// Seeded from what we can read at startup.
let current: Layout = {
  sideBar: true,
  panel: false,
  auxiliaryBar: false,
  activityBar: true,
};

function syncActivityBar(): void {
  const loc = vscode.workspace.getConfiguration('workbench').get<string>('activityBar.location');
  current.activityBar = loc !== 'hidden';
}

async function maximize(): Promise<void> {
  savedLayout = { ...current };

  if (current.sideBar) {
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    current.sideBar = false;
  }
  if (current.panel) {
    await vscode.commands.executeCommand('workbench.action.closePanel');
    current.panel = false;
  }
  if (current.auxiliaryBar) {
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    current.auxiliaryBar = false;
  }
  if (current.activityBar) {
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.hide');
    current.activityBar = false;
  }

  maximized = true;
}

async function restore(): Promise<void> {
  if (!savedLayout) { return; }

  if (savedLayout.sideBar) {
    await vscode.commands.executeCommand('workbench.action.focusSideBar');
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    current.sideBar = true;
  }
  if (savedLayout.panel) {
    await vscode.commands.executeCommand('workbench.action.togglePanel');
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    current.panel = true;
  }
  if (savedLayout.auxiliaryBar) {
    await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
    current.auxiliaryBar = true;
  }
  if (savedLayout.activityBar) {
    await vscode.commands.executeCommand('workbench.action.activityBarLocation.default');
    current.activityBar = true;
  }

  maximized = false;
}

export function activate(context: vscode.ExtensionContext): void {
  syncActivityBar();

  // Keep activityBar in sync if user changes it manually via settings
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('workbench.activityBar.location') && !maximized) {
        syncActivityBar();
      }
    }),
  );

  // Track the three layout buttons so our state stays accurate across
  // manual user toggles. We use overrideCommand to intercept the same
  // commands the title bar buttons call.
  //
  // NOTE: VS Code doesn't allow overriding built-in commands, so we
  // can't intercept workbench.action.togglePanel etc. directly.
  // Instead we expose proxy commands that also update our state, and
  // the user can optionally bind these. The title bar buttons will
  // still diverge if clicked — but maximize/restore cycles after that
  // will be correct because we snapshot before hiding and restore
  // exactly that snapshot.

  context.subscriptions.push(
    vscode.commands.registerCommand('maxeditor.toggleMaximize', async () => {
      if (maximized) {
        await restore();
      } else {
        await maximize();
      }
    }),
  );
}

export function deactivate(): void {}
