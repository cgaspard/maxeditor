#!/usr/bin/env node
// Generate a 256x256 PNG icon for the Max Editor extension.
// Pure Node, no dependencies. Outputs media/icon.png.
//
// Design: an editor window motif — a screen/viewport frame with four
// corner arrows pointing outward (the universal "maximize/fullscreen"
// symbol), rendered in a deep slate background with cyan accent arrows
// and a subtle glow, evoking the idea of expanding the editor to fill
// the screen.
//
// Palette: matches the sibling lmstudio-vscode icon — deep slate
// background, cool cyan arrows, with a violet accent glow.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

const BG          = [0x1a, 0x1f, 0x2a, 0xff];  // deep slate
const BG_GLOW     = [0x26, 0x2d, 0x3d, 0xff];  // subtle radial center
const FRAME       = [0x2f, 0x37, 0x49, 0xff];  // screen body
const FRAME_HI    = [0x3c, 0x47, 0x5d, 0xff];  // top sheen
const FRAME_EDGE  = [0x7b, 0xc3, 0xe8, 0xff];  // cyan border
const ARROW       = [0xa8, 0xe0, 0xff, 0xff];  // bright cyan arrow fill
const ARROW_GLOW  = [0x7b, 0xc3, 0xe8, 0x88];  // arrow outer glow
const VIOLET_GLOW = [0x7c, 0x5c, 0xff, 0x44];  // subtle center glow

const out = new Uint8Array(SIZE * SIZE * 4);

function setPx(x, y, rgba) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  out[i] = rgba[0]; out[i+1] = rgba[1]; out[i+2] = rgba[2]; out[i+3] = rgba[3];
}

function blend(dst, src) {
  const sa = src[3] / 255, da = dst[3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return [0,0,0,0];
  return [
    Math.round((src[0]*sa + dst[0]*da*(1-sa)) / oa),
    Math.round((src[1]*sa + dst[1]*da*(1-sa)) / oa),
    Math.round((src[2]*sa + dst[2]*da*(1-sa)) / oa),
    Math.round(oa * 255)
  ];
}

function getPx(x, y) {
  const i = (y * SIZE + x) * 4;
  return [out[i], out[i+1], out[i+2], out[i+3]];
}

function aaPx(x, y, rgba, coverage) {
  if (coverage <= 0) return;
  const tinted = [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * Math.min(1, coverage))];
  const cur = getPx(x, y);
  const blended = blend(cur, tinted);
  const i = (y * SIZE + x) * 4;
  out[i] = blended[0]; out[i+1] = blended[1]; out[i+2] = blended[2]; out[i+3] = blended[3];
}

function fillRoundedRect(x0, y0, w, h, r, rgba) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const cx2 = x < x0+r ? x0+r : x > x0+w-1-r ? x0+w-1-r : x;
      const cy2 = y < y0+r ? y0+r : y > y0+h-1-r ? y0+h-1-r : y;
      const dx = x - cx2, dy = y - cy2;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d <= r - 0.5) setPx(x, y, rgba);
      else if (d <= r + 0.5) aaPx(x, y, rgba, r + 0.5 - d);
    }
  }
}

function radialGlow(cx, cy, rOuter, rgba) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.sqrt((x+0.5-cx)**2 + (y+0.5-cy)**2);
      if (d >= rOuter) continue;
      const t = 1 - d / rOuter;
      aaPx(x, y, rgba, t*t*0.5);
    }
  }
}

function fillPolygon(points, rgba) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  minX = Math.max(0, Math.floor(minX)-1); maxX = Math.min(SIZE-1, Math.ceil(maxX)+1);
  minY = Math.max(0, Math.floor(minY)-1); maxY = Math.min(SIZE-1, Math.ceil(maxY)+1);
  const samples = 4;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx+0.5)/samples, py = y + (sy+0.5)/samples;
          let inside = false;
          for (let i = 0, j = points.length-1; i < points.length; j = i++) {
            const [xi,yi] = points[i], [xj,yj] = points[j];
            const intersect = ((yi>py)!==(yj>py)) &&
              (px < ((xj-xi)*(py-yi)/(yj-yi+1e-9) + xi));
            if (intersect) inside = !inside;
          }
          if (inside) hits++;
        }
      }
      if (hits > 0) aaPx(x, y, rgba, hits/(samples*samples));
    }
  }
}

function drawLine(x0, y0, x1, y1, thickness, rgba) {
  const minX = Math.max(0, Math.floor(Math.min(x0,x1)-thickness-1));
  const maxX = Math.min(SIZE-1, Math.ceil(Math.max(x0,x1)+thickness+1));
  const minY = Math.max(0, Math.floor(Math.min(y0,y1)-thickness-1));
  const maxY = Math.min(SIZE-1, Math.ceil(Math.max(y0,y1)+thickness+1));
  const dx = x1-x0, dy = y1-y0, lenSq = dx*dx+dy*dy;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x+0.5, py = y+0.5;
      let t = lenSq === 0 ? 0 : ((px-x0)*dx+(py-y0)*dy)/lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx2 = x0+t*dx, cy2 = y0+t*dy;
      const d = Math.sqrt((px-cx2)**2+(py-cy2)**2);
      const half = thickness/2;
      if (d <= half-0.5) setPx(x, y, rgba);
      else if (d <= half+0.5) aaPx(x, y, rgba, half+0.5-d);
    }
  }
}

// --- Draw ---

// Background
fillRoundedRect(0, 0, SIZE, SIZE, 44, BG);
radialGlow(SIZE/2, SIZE/2, 170, BG_GLOW);

const cx = SIZE/2, cy = SIZE/2;

// Screen frame body (rounded rect representing the editor window)
const fw = 148, fh = 112, fr = 14;
const fx = cx - fw/2, fy = cy - fh/2;
fillRoundedRect(fx+4, fy+6, fw, fh, fr, [0x12, 0x16, 0x1e, 0xff]); // drop shadow
fillRoundedRect(fx, fy, fw, fh, fr, FRAME);
// Top sheen
fillRoundedRect(fx+8, fy+8, fw-16, 16, 8, FRAME_HI);

// Title bar stripe — a thin bar at the top of the screen frame (like a window titlebar)
fillRoundedRect(fx, fy, fw, 24, fr, [0x3c, 0x47, 0x5d, 0xff]);
// Three tiny "traffic light" dots in the titlebar
const dotY = fy + 12;
for (let i = 0; i < 3; i++) {
  const dotX = fx + 20 + i * 18;
  const dotC = [[0x7b,0xc3,0xe8,0xcc],[0x7c,0x5c,0xff,0xcc],[0xa8,0xe0,0xff,0xcc]][i];
  for (let dy2 = -4; dy2 <= 4; dy2++) {
    for (let dx2 = -4; dx2 <= 4; dx2++) {
      const d = Math.sqrt(dx2*dx2+dy2*dy2);
      if (d <= 4) aaPx(dotX+dx2, dotY+dy2, dotC, 1);
    }
  }
}

// Frame cyan border
// Draw by stroking the inset rect edge with FRAME_EDGE
for (let y = fy; y < fy+fh; y++) {
  for (let x = fx; x < fx+fw; x++) {
    const rx = x < fx+fr ? fx+fr : x > fx+fw-1-fr ? fx+fw-1-fr : x;
    const ry = y < fy+fr ? fy+fr : y > fy+fh-1-fr ? fy+fh-1-fr : y;
    const dx2 = x - rx, dy2 = y - ry;
    const d = Math.sqrt(dx2*dx2+dy2*dy2);
    const distFromEdge = fr - d;
    if (distFromEdge >= 0 && distFromEdge <= 2) {
      aaPx(x, y, FRAME_EDGE, Math.max(0, 1 - distFromEdge/2) * 0.7);
    }
  }
}

// Content area lines (fake code lines)
const lineY = [fy+38, fy+52, fy+66, fy+80, fy+94];
const lineW = [80, 60, 90, 45, 70];
const lineX = fx + 16;
for (let i = 0; i < lineY.length; i++) {
  drawLine(lineX, lineY[i], lineX + lineW[i], lineY[i], 3,
    [0x7b, 0xc3, 0xe8, 0x40]);
}

// --- Corner expand arrows ---
// Four arrows pointing outward from each corner of the frame, indicating "maximize"
const arrowSize = 22;    // length of each arrow arm
const arrowHead = 12;    // arrowhead size
const arrowThick = 5;
const cornerPad = 10;    // distance outside the frame rect

function drawCornerArrow(cornerX, cornerY, dirX, dirY) {
  // Tip of the arrow (points outward)
  const tipX = cornerX + dirX * (arrowSize + cornerPad);
  const tipY = cornerY + dirY * (arrowSize + cornerPad);
  // Base of the arrow shaft
  const baseX = cornerX + dirX * cornerPad;
  const baseY = cornerY + dirY * cornerPad;

  // Glow
  drawLine(baseX, baseY, tipX, tipY, arrowThick + 6, ARROW_GLOW);

  // Arrow shaft
  drawLine(baseX, baseY, tipX, tipY, arrowThick, ARROW);

  // Arrowhead: triangle pointing outDir
  // Perpendicular to direction
  const perpX = -dirY, perpY = dirX;
  const headBase = arrowHead * 0.85;
  const headH = arrowHead;

  // Back of the arrowhead
  const backX = tipX - dirX * headH;
  const backY = tipY - dirY * headH;

  fillPolygon([
    [tipX, tipY],
    [backX + perpX * headBase/2, backY + perpY * headBase/2],
    [backX - perpX * headBase/2, backY - perpY * headBase/2],
  ], ARROW);
}

const r45 = 1 / Math.sqrt(2);

// Top-left corner
drawCornerArrow(fx, fy, -r45, -r45);
// Top-right corner
drawCornerArrow(fx+fw, fy, r45, -r45);
// Bottom-left corner
drawCornerArrow(fx, fy+fh, -r45, r45);
// Bottom-right corner
drawCornerArrow(fx+fw, fy+fh, r45, r45);

// Central violet glow for depth
radialGlow(cx, cy, 70, VIOLET_GLOW);

// --- PNG encode ---
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c>>>1) : c>>>1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc>>>8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;

const rowBytes = SIZE*4;
const raw = Buffer.alloc((rowBytes+1)*SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y*(rowBytes+1)] = 0;
  out.subarray(y*rowBytes, (y+1)*rowBytes).forEach((b, i) => { raw[y*(rowBytes+1)+1+i] = b; });
}
const idatData = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);

const target = path.join('media', 'icon.png');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, png);
console.log(`Wrote ${target} (${png.length} bytes, ${SIZE}x${SIZE})`);
