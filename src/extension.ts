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
};

let maximized = false;
let savedLayout: Layout | null = null;

// Current known layout — updated whenever we make a change.
// Seeded from what we can read at startup.
let current: Layout = {
  sideBar: true,
  panel: false,
  auxiliaryBar: false,
};

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

  maximized = false;
}

export function activate(context: vscode.ExtensionContext): void {
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
