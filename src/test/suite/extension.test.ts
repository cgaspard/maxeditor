import * as assert from 'assert';
import * as vscode from 'vscode';

async function waitFor(condition: () => boolean, timeoutMs = 3000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) { return; }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function isMaximized(): boolean {
  return vscode.workspace.getConfiguration('workbench').get('activityBar.location') === 'hidden';
}

// Every workbench command the extension calls — verified against the live registry.
const REQUIRED_COMMANDS = [
  'workbench.action.closeSidebar',
  'workbench.action.closePanel',
  'workbench.action.closeAuxiliaryBar',
  'workbench.action.activityBarLocation.hide',
  'workbench.action.activityBarLocation.default',
  'workbench.action.focusSideBar',
  'workbench.action.togglePanel',
  'workbench.action.toggleAuxiliaryBar',
  'workbench.action.focusActiveEditorGroup',
];

suite('Max Editor Extension', () => {

  let allCommands: string[] = [];

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('cgaspard.maxeditor');
    assert.ok(ext, 'Extension cgaspard.maxeditor should be installed');
    await ext!.activate();
    allCommands = await vscode.commands.getCommands(true);
  });

  setup(async () => {
    if (isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !isMaximized());
    }
  });

  teardown(async () => {
    if (isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !isMaximized());
    }
  });

  // --- Command registry validation ---

  test('Extension registers toggleMaximize command', async () => {
    assert.ok(
      allCommands.includes('maxeditor.toggleMaximize'),
      'maxeditor.toggleMaximize should be registered'
    );
  });

  for (const cmd of REQUIRED_COMMANDS) {
    test(`Workbench command exists: ${cmd}`, () => {
      assert.ok(
        allCommands.includes(cmd),
        `Command '${cmd}' not found in VS Code registry — extension will error when called`
      );
    });
  }

  // --- Behaviour tests ---

  test('Maximize hides the activity bar', async () => {
    assert.ok(!isMaximized(), 'Should start in normal state');
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);
    const location = vscode.workspace.getConfiguration('workbench').get('activityBar.location');
    assert.strictEqual(location, 'hidden', 'Activity bar should be hidden after maximize');
  });

  test('Restore brings activity bar back', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !isMaximized());
    const location = vscode.workspace.getConfiguration('workbench').get('activityBar.location');
    assert.notStrictEqual(location, 'hidden', 'Activity bar should be visible after restore');
  });

  test('Three toggles ends maximized', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !isMaximized());
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);
    assert.ok(isMaximized(), 'Should be maximized after three toggles');
  });

  test('Maximize and restore do not throw', async () => {
    await assert.doesNotReject(
      () => Promise.resolve(vscode.commands.executeCommand('maxeditor.toggleMaximize')),
      'maximize should not throw'
    );
    await waitFor(isMaximized);
    await assert.doesNotReject(
      () => Promise.resolve(vscode.commands.executeCommand('maxeditor.toggleMaximize')),
      'restore should not throw'
    );
    await waitFor(() => !isMaximized());
  });
});
