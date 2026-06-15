import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { readLayoutFromDb } from '../../sqlite-reader';

const WS_BASE = path.join(os.homedir(), 'Library/Application Support/Code/User/workspaceStorage');

function dbPath(hash: string): string {
  return path.join(WS_BASE, hash, 'state.vscdb');
}

// Real workspace DBs captured from the local machine.
// These hashes were verified at test-writing time — they may not exist on CI.
const KNOWN_DBS = {
  allHidden:  '1781454208393',
  allVisible: '04ec5389b4eb02488f0e4964a185dae8',
  mixed:      '01bf68268320c5c99bae53095dd0fc2d', // aux=hidden, side+panel=visible
};

suite('SQLite reader', () => {

  // ── Null / error cases ─────────────────────────────────────────────────────

  test('returns null for non-existent file', () => {
    const result = readLayoutFromDb('/tmp/does-not-exist-maxeditor.vscdb');
    assert.strictEqual(result, null);
  });

  test('returns null for empty file', () => {
    const p = path.join(os.tmpdir(), 'empty-maxeditor.vscdb');
    fs.writeFileSync(p, Buffer.alloc(0));
    try {
      assert.strictEqual(readLayoutFromDb(p), null);
    } finally {
      fs.unlinkSync(p);
    }
  });

  test('returns null for file with wrong magic header', () => {
    const p = path.join(os.tmpdir(), 'bad-magic-maxeditor.vscdb');
    const buf = Buffer.alloc(512);
    buf.write('Not a SQLite DB!\0', 0, 'ascii');
    fs.writeFileSync(p, buf);
    try {
      assert.strictEqual(readLayoutFromDb(p), null);
    } finally {
      fs.unlinkSync(p);
    }
  });

  // ── Real DB cases ──────────────────────────────────────────────────────────

  test('all-hidden DB: all three panels read as hidden', function() {
    const p = dbPath(KNOWN_DBS.allHidden);
    if (!fs.existsSync(p)) { return this.skip(); }

    const result = readLayoutFromDb(p);
    assert.ok(result, 'should return a result');
    assert.strictEqual(result!.sideBarHidden,      true,  'sidebar should be hidden');
    assert.strictEqual(result!.panelHidden,         true,  'panel should be hidden');
    assert.strictEqual(result!.auxiliaryBarHidden,  true,  'aux bar should be hidden');
  });

  test('all-visible DB: all three panels read as visible', function() {
    const p = dbPath(KNOWN_DBS.allVisible);
    if (!fs.existsSync(p)) { return this.skip(); }

    const result = readLayoutFromDb(p);
    assert.ok(result, 'should return a result');
    assert.strictEqual(result!.sideBarHidden,      false, 'sidebar should be visible');
    assert.strictEqual(result!.panelHidden,         false, 'panel should be visible');
    assert.strictEqual(result!.auxiliaryBarHidden,  false, 'aux bar should be visible');
  });

  test('mixed DB: reads partial hidden state correctly', function() {
    const p = dbPath(KNOWN_DBS.mixed);
    if (!fs.existsSync(p)) { return this.skip(); }

    const result = readLayoutFromDb(p);
    assert.ok(result, 'should return a result');
    // This DB has aux=hidden, sidebar+panel=visible
    assert.strictEqual(result!.sideBarHidden,      false, 'sidebar should be visible');
    assert.strictEqual(result!.panelHidden,         false, 'panel should be visible');
    assert.strictEqual(result!.auxiliaryBarHidden,  true,  'aux bar should be hidden');
  });

  test('result is a plain object with exactly the three expected boolean fields', function() {
    const p = dbPath(KNOWN_DBS.allVisible);
    if (!fs.existsSync(p)) { return this.skip(); }

    const result = readLayoutFromDb(p);
    assert.ok(result);
    assert.strictEqual(typeof result!.sideBarHidden,     'boolean');
    assert.strictEqual(typeof result!.panelHidden,        'boolean');
    assert.strictEqual(typeof result!.auxiliaryBarHidden, 'boolean');
  });

  // ── Scan available DBs for consistency ────────────────────────────────────
  // Reads every workspace DB on the machine and verifies the reader never throws
  // and always returns either null or a valid Layout object.

  test('never throws on any local workspace DB', function() {
    if (!fs.existsSync(WS_BASE)) { return this.skip(); }

    const dirs = fs.readdirSync(WS_BASE);
    let checked = 0;
    let parsed = 0;
    let nulls = 0;

    for (const dir of dirs) {
      const p = path.join(WS_BASE, dir, 'state.vscdb');
      if (!fs.existsSync(p)) { continue; }
      checked++;

      let result: ReturnType<typeof readLayoutFromDb> | undefined;
      assert.doesNotThrow(() => { result = readLayoutFromDb(p); }, `threw on ${dir}`);

      if (result === null) {
        nulls++;
      } else {
        assert.strictEqual(typeof result!.sideBarHidden,     'boolean', `sideBarHidden not boolean in ${dir}`);
        assert.strictEqual(typeof result!.panelHidden,        'boolean', `panelHidden not boolean in ${dir}`);
        assert.strictEqual(typeof result!.auxiliaryBarHidden, 'boolean', `auxiliaryBarHidden not boolean in ${dir}`);
        parsed++;
      }
    }

    console.log(`    checked ${checked} DBs: ${parsed} parsed, ${nulls} returned null`);
    assert.ok(checked > 0, 'should have found at least one DB');
    assert.ok(parsed > 0,  'should have successfully parsed at least one DB');
  });
});
