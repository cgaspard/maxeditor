import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  // Use the system-installed VS Code CLI on macOS rather than downloading a
  // copy — the downloaded build invokes the raw Electron binary which rejects
  // the VS Code-specific flags (exit code 9).
  const vscodeExecutablePath =
    process.platform === 'darwin'
      ? '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
      : undefined;

  await runTests({ extensionDevelopmentPath, extensionTestsPath, vscodeExecutablePath });
}

main().catch(err => {
  console.error('Failed to run tests:', err);
  process.exit(1);
});
