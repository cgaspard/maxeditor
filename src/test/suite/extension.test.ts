import * as assert from 'assert';
import * as vscode from 'vscode';

async function waitMs(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) { return; }
    await waitMs(intervalMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

// DOM helpers — only available when running inside the VS Code renderer process.
// In the extension host (Node) document is undefined; tests that need DOM are skipped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (globalThis as any).document as { querySelector(s: string): { classList: { contains(c: string): boolean } } | null } | undefined;

function domHasEmpty(selector: string): boolean {
  const el = doc?.querySelector(selector);
  if (!el) { return true; }
  return el.classList.contains('empty');
}

function domSideBarHidden(): boolean     { return domHasEmpty('.part.sidebar'); }
function domPanelBottomHidden(): boolean { return domHasEmpty('.part.panel.basepanel'); }
function domAuxBarHidden(): boolean      { return domHasEmpty('.part.auxiliarybar'); }

const HAS_DOM = doc !== undefined;

// Every workbench command the extension calls — verified against live registry.
const REQUIRED_COMMANDS = [
  'workbench.action.closeSidebar',
  'workbench.action.closePanel',
  'workbench.action.closeAuxiliaryBar',
  'workbench.action.focusSideBar',
  'workbench.action.togglePanel',
  'workbench.action.toggleAuxiliaryBar',
  'workbench.action.focusActiveEditorGroup',
];

suite('Max Editor Extension', () => {

  let allCommands: string[] = [];
  let ext: vscode.Extension<{ isMaximized(): boolean }> | undefined;

  suiteSetup(async () => {
    ext = vscode.extensions.getExtension('cgaspard.maxeditor');
    assert.ok(ext, 'Extension cgaspard.maxeditor should be installed');
    await ext!.activate();
    allCommands = await vscode.commands.getCommands(true);
  });

  setup(async () => {
    if (ext?.exports?.isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !ext!.exports.isMaximized());
      await waitMs(200);
    }
  });

  teardown(async () => {
    if (ext?.exports?.isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !ext!.exports.isMaximized());
      await waitMs(200);
    }
  });

  // ── Command registry ────────────────────────────────────────────────────────

  test('Extension registers toggleMaximize command', () => {
    assert.ok(allCommands.includes('maxeditor.toggleMaximize'));
  });

  for (const cmd of REQUIRED_COMMANDS) {
    test(`Workbench command exists: ${cmd}`, () => {
      assert.ok(allCommands.includes(cmd),
        `'${cmd}' not found in VS Code registry — extension will throw when called`);
    });
  }

  // ── State tracking (extension host) ────────────────────────────────────────

  test('isMaximized() starts false', () => {
    assert.strictEqual(ext!.exports.isMaximized(), false);
  });

  test('isMaximized() true after maximize', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    assert.strictEqual(ext!.exports.isMaximized(), true);
  });

  test('isMaximized() false after restore', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !ext!.exports.isMaximized());
    assert.strictEqual(ext!.exports.isMaximized(), false);
  });

  test('Three toggles ends maximized', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !ext!.exports.isMaximized());
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    assert.strictEqual(ext!.exports.isMaximized(), true);
  });

  test('Commands do not throw', async () => {
    await assert.doesNotReject(() => Promise.resolve(
      vscode.commands.executeCommand('maxeditor.toggleMaximize')));
    await waitFor(() => ext!.exports.isMaximized());
    await assert.doesNotReject(() => Promise.resolve(
      vscode.commands.executeCommand('maxeditor.toggleMaximize')));
    await waitFor(() => !ext!.exports.isMaximized());
  });

  // ── DOM visibility (renderer only) ─────────────────────────────────────────
  // These tests only run when document is available (renderer context).
  // In the extension host test runner they are skipped.

  test('DOM: sidebar hidden after maximize' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (domSideBarHidden()) {
      await vscode.commands.executeCommand('workbench.action.focusSideBar');
      await waitFor(() => !domSideBarHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domSideBarHidden(), true, 'sidebar .empty after maximize');
  });

  test('DOM: bottom panel hidden after maximize' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (domPanelBottomHidden()) {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      await waitFor(() => !domPanelBottomHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domPanelBottomHidden(), true, 'bottom panel .empty after maximize');
  });

  test('DOM: aux bar hidden after maximize' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (domAuxBarHidden()) {
      await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
      await waitFor(() => !domAuxBarHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domAuxBarHidden(), true, 'aux bar .empty after maximize');
  });

  test('DOM: sidebar restored after restore' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (domSideBarHidden()) {
      await vscode.commands.executeCommand('workbench.action.focusSideBar');
      await waitFor(() => !domSideBarHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domSideBarHidden(), false, 'sidebar visible after restore');
  });

  test('DOM: bottom panel restored after restore' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (domPanelBottomHidden()) {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
      await waitFor(() => !domPanelBottomHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domPanelBottomHidden(), false, 'bottom panel visible after restore');
  });

  test('DOM: panel closed before maximize stays closed after restore' + (HAS_DOM ? '' : ' [SKIP: no DOM]'), async function() {
    if (!HAS_DOM) { return this.skip(); }
    if (!domPanelBottomHidden()) {
      await vscode.commands.executeCommand('workbench.action.closePanel');
      await waitFor(() => domPanelBottomHidden(), 3000);
    }
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => ext!.exports.isMaximized());
    await waitMs(300);
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !ext!.exports.isMaximized());
    await waitMs(300);
    assert.strictEqual(domPanelBottomHidden(), true, 'panel that was closed before maximize stays closed');
  });
});
