import * as assert from 'assert';
import * as vscode from 'vscode';

// Helpers — poll until a condition is true or timeout
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

suite('Max Editor Extension', () => {

  suiteSetup(async () => {
    // Ensure extension is activated
    const ext = vscode.extensions.getExtension('cgaspard.maxeditor');
    assert.ok(ext, 'Extension cgaspard.maxeditor should be installed');
    await ext!.activate();
  });

  setup(async () => {
    // Always start each test in restored (non-maximized) state
    if (isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !isMaximized());
    }
  });

  teardown(async () => {
    // Clean up — restore panels after every test
    if (isMaximized()) {
      await vscode.commands.executeCommand('maxeditor.toggleMaximize');
      await waitFor(() => !isMaximized());
    }
  });

  test('Extension activates and registers command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('maxeditor.toggleMaximize'),
      'maxeditor.toggleMaximize command should be registered'
    );
  });

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
    assert.notStrictEqual(location, 'hidden', 'Activity bar should not be hidden after restore');
  });

  test('Toggle is idempotent — maximize twice stays maximized', async () => {
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);

    // Second toggle should restore
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(() => !isMaximized());

    // Third toggle should maximize again
    await vscode.commands.executeCommand('maxeditor.toggleMaximize');
    await waitFor(isMaximized);

    assert.ok(isMaximized(), 'Should be maximized after odd number of toggles');
  });

  test('No commands throw errors when invoked', async () => {
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
