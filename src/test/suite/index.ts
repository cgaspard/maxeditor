import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 15000 });
  const testsRoot = path.resolve(__dirname);

  // Run discovery tests first if present, then the main suite
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  // Sort so commands.test runs before extension.test
  files.sort((a, b) => {
    if (a.includes('commands')) { return -1; }
    if (b.includes('commands')) { return 1; }
    return a.localeCompare(b);
  });

  for (const f of files) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
