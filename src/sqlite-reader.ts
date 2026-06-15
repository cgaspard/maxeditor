import * as fs from 'fs';

// Minimal SQLite3 B-tree reader — enough to extract string key/value pairs
// from VS Code's state.vscdb ItemTable. No native module needed.
//
// SQLite file format reference: https://www.sqlite.org/fileformat.html
// We only need: page size, root page of ItemTable, then walk leaf pages
// looking for records whose key matches our target strings.

function readUint16BE(buf: Buffer, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function readUint32BE(buf: Buffer, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// Read a SQLite variable-length integer. Returns [value, bytesConsumed].
function readVarint(buf: Buffer, off: number): [number, number] {
  let result = 0;
  let i = 0;
  while (i < 9) {
    const byte = buf[off + i];
    if (i === 8) {
      // 9th byte: all 8 bits used, no continuation
      result = (result * 256 + byte);
      i++;
      break;
    }
    result = (result * 128) + (byte & 0x7f);
    i++;
    if (!(byte & 0x80)) { break; }
  }
  return [result, i];
}

// Parse a single cell's payload and return {key, value} if it's a text/text record.
function parseCell(payload: Buffer): { key: string; value: string } | null {
  try {
    let off = 0;

    // Header length varint
    const [headerLen, hl] = readVarint(payload, off);
    off += hl;
    const headerEnd = headerLen;

    // Read serial type varints from header
    const serialTypes: number[] = [];
    let hoff = hl;
    while (hoff < headerEnd) {
      const [st, n] = readVarint(payload, hoff);
      serialTypes.push(st);
      hoff += n;
    }

    // Body starts after header
    let boff = headerEnd;
    const values: string[] = [];
    for (const st of serialTypes) {
      if (st === 0) {
        // NULL
        values.push('');
      } else if (st >= 13 && (st % 2) === 1) {
        // Text: length = (st - 13) / 2
        const len = (st - 13) / 2;
        values.push(payload.slice(boff, boff + len).toString('utf8'));
        boff += len;
      } else if (st >= 12 && (st % 2) === 0) {
        // Blob: skip
        const len = (st - 12) / 2;
        boff += len;
        values.push('');
      } else if (st >= 1 && st <= 6) {
        // Integer: 1-6 bytes
        const sizes = [0, 1, 2, 3, 4, 6, 8];
        boff += sizes[st];
        values.push('');
      } else if (st === 7) {
        boff += 8;
        values.push('');
      } else if (st === 8 || st === 9) {
        values.push(st === 9 ? '1' : '0');
      } else {
        return null;
      }
    }

    if (values.length >= 2) {
      return { key: values[0], value: values[1] };
    }
  } catch {
    // malformed cell
  }
  return null;
}

// Walk a B-tree page and all its children, collecting key→value pairs for target keys.
function walkPage(
  data: Buffer,
  pageNum: number,
  pageSize: number,
  targets: Set<string>,
  result: Map<string, string>,
): void {
  if (result.size === targets.size) { return; } // found everything

  const pageOff = (pageNum - 1) * pageSize;
  if (pageOff + pageSize > data.length) { return; }

  const page = data.slice(pageOff, pageOff + pageSize);

  // Page header starts at offset 0, except page 1 which has a 100-byte file header.
  const hoff = (pageNum === 1) ? 100 : 0;

  const pageType = page[hoff];
  // 0x0d = leaf table, 0x05 = interior table
  if (pageType !== 0x0d && pageType !== 0x05) { return; }

  const cellCount = readUint16BE(page, hoff + 3);
  const cellPtrArrayOff = hoff + (pageType === 0x05 ? 12 : 8);

  if (pageType === 0x05) {
    // Interior page: recurse into left children
    const rightmostChild = readUint32BE(page, hoff + 8);
    for (let i = 0; i < cellCount; i++) {
      const ptr = readUint16BE(page, cellPtrArrayOff + i * 2);
      const childPage = readUint32BE(page, ptr);
      walkPage(data, childPage, pageSize, targets, result);
      if (result.size === targets.size) { return; }
    }
    walkPage(data, rightmostChild, pageSize, targets, result);
    return;
  }

  // Leaf page: parse each cell
  for (let i = 0; i < cellCount; i++) {
    const ptr = readUint16BE(page, cellPtrArrayOff + i * 2);
    if (ptr === 0 || ptr >= pageSize) { continue; }

    // Read payload length varint
    let coff = ptr;
    const [payloadLen, pn] = readVarint(page, coff);
    coff += pn;

    // Skip rowid varint
    const [, rn] = readVarint(page, coff);
    coff += rn;

    // Inline payload (we ignore overflow pages for simplicity — our values are small)
    const inlineLen = Math.min(payloadLen, pageSize - coff);
    if (inlineLen <= 0) { continue; }

    const payload = page.slice(coff, coff + inlineLen);
    const record = parseCell(payload);
    if (record && targets.has(record.key)) {
      result.set(record.key, record.value);
    }
  }
}

// Find the root page number of ItemTable by scanning the sqlite_schema leaf pages.
function findItemTableRoot(data: Buffer, pageSize: number): number {
  // sqlite_schema is always rooted at page 1.
  // Records: type, name, tbl_name, rootpage(int), sql
  // We need rootpage for name='ItemTable'.
  const page = data.slice(0, pageSize);
  const hoff = 100; // page 1 has 100-byte file header
  const pageType = page[hoff];
  if (pageType !== 0x0d && pageType !== 0x05) { return 0; }

  const cellCount = readUint16BE(page, hoff + 3);
  const cellPtrArrayOff = hoff + (pageType === 0x05 ? 12 : 8);

  for (let i = 0; i < cellCount; i++) {
    const ptr = readUint16BE(page, cellPtrArrayOff + i * 2);
    if (ptr === 0 || ptr >= pageSize) { continue; }

    let coff = ptr;
    const [payloadLen, pn] = readVarint(page, coff);
    coff += pn;
    const [, rn] = readVarint(page, coff);
    coff += rn;

    const inlineLen = Math.min(payloadLen, pageSize - coff);
    if (inlineLen <= 0) { continue; }

    const payload = page.slice(coff, coff + inlineLen);

    // Parse sqlite_schema record: type(text), name(text), tbl_name(text), rootpage(int), sql(text)
    try {
      let off = 0;
      const [headerLen, hl] = readVarint(payload, off);
      off += hl;

      const serialTypes: number[] = [];
      let hoff2 = hl;
      while (hoff2 < headerLen) {
        const [st, n] = readVarint(payload, hoff2);
        serialTypes.push(st);
        hoff2 += n;
      }

      let boff = headerLen;
      const vals: Array<string | number> = [];
      for (const st of serialTypes) {
        if (st >= 13 && (st % 2) === 1) {
          const len = (st - 13) / 2;
          vals.push(payload.slice(boff, boff + len).toString('utf8'));
          boff += len;
        } else if (st >= 1 && st <= 4) {
          const sizes = [0, 1, 2, 3, 4];
          let v = 0;
          for (let b = 0; b < sizes[st]; b++) { v = v * 256 + payload[boff + b]; }
          vals.push(v);
          boff += sizes[st];
        } else if (st === 5) { boff += 6; vals.push(0); }
        else if (st === 6 || st === 7) { boff += 8; vals.push(0); }
        else if (st === 8) { vals.push(0); }
        else if (st === 9) { vals.push(1); }
        else if (st === 0) { vals.push(''); }
        else if (st >= 12 && (st % 2) === 0) {
          const len = (st - 12) / 2; boff += len; vals.push('');
        } else { vals.push(''); }
      }

      // vals[1] = name, vals[3] = rootpage
      if (vals[1] === 'ItemTable' && typeof vals[3] === 'number') {
        return vals[3] as number;
      }
    } catch { /* skip */ }
  }

  return 0;
}

export interface LayoutKeys {
  sideBarHidden: boolean;
  panelHidden: boolean;
  auxiliaryBarHidden: boolean;
}

export function readLayoutFromDb(dbPath: string): LayoutKeys | null {
  try {
    const data = fs.readFileSync(dbPath);

    // Validate SQLite magic header
    if (data.slice(0, 16).toString('ascii') !== 'SQLite format 3\0') {
      return null;
    }

    const pageSize = readUint16BE(data, 16) || 65536;
    const itemTableRoot = findItemTableRoot(data, pageSize);
    if (!itemTableRoot) { return null; }

    const targets = new Set([
      'workbench.sideBar.hidden',
      'workbench.panel.hidden',
      'workbench.auxiliaryBar.hidden',
    ]);
    const result = new Map<string, string>();
    walkPage(data, itemTableRoot, pageSize, targets, result);

    return {
      sideBarHidden:      result.get('workbench.sideBar.hidden')      === 'true',
      panelHidden:        result.get('workbench.panel.hidden')        === 'true',
      auxiliaryBarHidden: result.get('workbench.auxiliaryBar.hidden') === 'true',
    };
  } catch {
    return null;
  }
}
