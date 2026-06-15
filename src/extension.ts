import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { readLayoutFromDb } from './sqlite-reader';

const SAVED_LAYOUT_KEY = 'maxeditor.savedLayout';

type Layout = {
  sideBar: boolean;
  panel: boolean;
  auxiliaryBar: boolean;
};

let maximized = false;
let savedLayout: Layout | null = null;
// Fallback if DB probe fails — assume all open.
let current: Layout = { sideBar: true, panel: true, auxiliaryBar: true };
let ctx: vscode.ExtensionContext;
let log: vscode.OutputChannel;

function probeLayoutFromDb(): void {
  try {
    const storageDir = ctx.storageUri?.fsPath;
    if (!storageDir) {
      log.appendLine('[probe] no storageUri — skipping');
      return;
    }

    const dbPath1 = path.normalize(path.join(storageDir, '..', 'state.vscdb'));
    const dbPath2 = path.normalize(path.join(storageDir, '..', '..', 'state.vscdb'));
    const dbPath  = fs.existsSync(dbPath1) ? dbPath1 : dbPath2;

    if (!fs.existsSync(dbPath)) {
      log.appendLine('[probe] DB not found — skipping');
      return;
    }

    const layout = readLayoutFromDb(dbPath);
    if (!layout) {
      log.appendLine('[probe] DB parse returned null — keeping defaults');
      return;
    }

    current.sideBar      = !layout.sideBarHidden;
    current.panel        = !layout.panelHidden;
    current.auxiliaryBar = !layout.auxiliaryBarHidden;

    log.appendLine(`[probe] DB: sideBar.hidden=${layout.sideBarHidden}, panel.hidden=${layout.panelHidden}, aux.hidden=${layout.auxiliaryBarHidden}`);
    log.appendLine(`[probe] current seeded to: ${JSON.stringify(current)}`);
  } catch (err) {
    log.appendLine(`[probe] failed: ${err} — keeping defaults`);
  }
}

async function maximize(): Promise<void> {
  savedLayout = { ...current };
  log.appendLine(`[maximize] current: ${JSON.stringify(current)}, savedLayout: ${JSON.stringify(savedLayout)}`);

  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  current.sideBar = false;
  await vscode.commands.executeCommand('workbench.action.closePanel');
  current.panel = false;
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  current.auxiliaryBar = false;

  maximized = true;
  ctx.workspaceState.update(SAVED_LAYOUT_KEY, savedLayout);
  log.appendLine('[maximize] done.');
}

async function restore(): Promise<void> {
  log.appendLine(`[restore] savedLayout: ${JSON.stringify(savedLayout)}`);
  if (!savedLayout) {
    log.appendLine('[restore] nothing to restore');
    return;
  }

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

  log.appendLine(`[restore] done. current: ${JSON.stringify(current)}`);
  maximized = false;
  savedLayout = null;
  ctx.workspaceState.update(SAVED_LAYOUT_KEY, undefined);
}

export function activate(context: vscode.ExtensionContext): { isMaximized(): boolean } {
  ctx = context;
  log = vscode.window.createOutputChannel('Max Editor');

  const persisted = ctx.workspaceState.get<Layout>(SAVED_LAYOUT_KEY);
  if (persisted) {
    savedLayout = persisted;
    maximized   = true;
    log.appendLine(`[activate] resuming maximized state: ${JSON.stringify(savedLayout)}`);
  } else {
    probeLayoutFromDb();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('maxeditor.toggleMaximize', async () => {
      log.appendLine(`[toggle] maximized=${maximized}, current=${JSON.stringify(current)}`);
      if (maximized) {
        await restore();
      } else {
        await maximize();
      }
    }),
  );

  return { isMaximized: () => maximized };
}

export function deactivate(): void {}
