import * as vscode from 'vscode';

type PanelState = {
  sideBar: boolean;
  panel: boolean;        // bottom panel (terminal, output, etc.)
  activityBar: boolean;
  secondarySideBar: boolean;
  statusBar: boolean;
};

let maximized = false;
let savedState: PanelState | null = null;
let statusBarItem: vscode.StatusBarItem;

async function getPanelVisibility(): Promise<PanelState> {
  // Read current state by checking what's visible.
  // VSCode doesn't have a direct API for this, so we track state ourselves
  // and use context keys as best effort.  We default to "all visible" so the
  // first maximize always hides everything and a subsequent restore brings it
  // all back.
  return savedState ?? {
    sideBar: true,
    panel: true,
    activityBar: true,
    secondarySideBar: false,
    statusBar: true,
  };
}

async function maximize(): Promise<void> {
  // Snapshot current state before hiding anything.
  // Because VSCode has no API to query visibility we track the last restore
  // state; on first use we assume everything was visible.
  savedState = await getPanelVisibility();

  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  await vscode.commands.executeCommand('workbench.action.activityBarLocation.hide');
  await vscode.commands.executeCommand('workbench.action.statusBar.hide');

  maximized = true;
  updateStatusBar();
}

async function restore(): Promise<void> {
  if (!savedState) {
    return;
  }

  if (savedState.sideBar) {
    await vscode.commands.executeCommand('workbench.action.focusSideBar');
    // focusSideBar opens it; immediately move focus back to editor
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }

  if (savedState.panel) {
    await vscode.commands.executeCommand('workbench.action.showPanel');
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }

  if (savedState.secondarySideBar) {
    await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
  }

  // Activity bar: restore to default (side) position
  await vscode.commands.executeCommand('workbench.action.activityBarLocation.default');

  await vscode.commands.executeCommand('workbench.action.statusBar.show');

  maximized = false;
  updateStatusBar();
}

function updateStatusBar(): void {
  if (maximized) {
    statusBarItem.text = '$(screen-normal) Restore Editor';
    statusBarItem.tooltip = 'Click to restore panels (Max Editor)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBarItem.text = '$(screen-full) Maximize Editor';
    statusBarItem.tooltip = 'Click to maximize editor (Max Editor)';
    statusBarItem.backgroundColor = undefined;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'maxeditor.toggleMaximize';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

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

export function deactivate(): void {
  // subscriptions cleaned up by VS Code
}
