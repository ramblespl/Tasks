const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const toCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePNG(w, h, rgbaCallback) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  const raw = Buffer.alloc(h * (w * 4 + 1));
  let offset = 0;
  for (let y = 0; y < h; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = rgbaCallback(x, y, w, h);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const compressed = zlib.deflateSync(raw);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([header, ihdr, idat, iend]);
}

// Distance to rounded rectangle
function distRoundedRect(x, y, rx, ry, rw, rh, rad) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = Math.abs(x - cx) - (rw / 2 - rad);
  const dy = Math.abs(y - cy) - (rh / 2 - rad);
  const outsideX = Math.max(0, dx);
  const outsideY = Math.max(0, dy);
  const dist = Math.sqrt(outsideX * outsideX + outsideY * outsideY);
  if (dx < 0 && dy < 0) return Math.max(dx, dy) - rad;
  return dist - rad;
}

// Draw brand icon
function renderBrandIcon(isMaskable) {
  return function(x, y, size) {
    const u = x / size;
    const v = y / size;

    // Background gradient: #3b82f6 (59, 130, 246) to #1d4ed8 (29, 78, 216)
    const t = (u + v) / 2;
    const bgR = Math.round(59 + (29 - 59) * t);
    const bgG = Math.round(130 + (78 - 130) * t);
    const bgB = Math.round(246 + (216 - 246) * t);

    if (!isMaskable) {
      // Rounded corner squircle for regular icon
      const cornerRad = size * 0.22;
      const d = distRoundedRect(x, y, 0, 0, size, size, cornerRad);
      if (d > 0) {
        // Outside rounded corners
        return [0, 0, 0, 0];
      }
    }

    // Inside bounds: Base background color
    let r = bgR;
    let g = bgG;
    let b = bgB;
    let a = 255;

    // Center icon geometry (scale with safe zone if maskable)
    // Safe zone: scale 0.7 for maskable, 0.85 for regular
    const scale = isMaskable ? 0.65 : 0.8;
    const cx = size * 0.5;
    const cy = size * 0.5;
    const nx = (x - cx) / (size * scale);
    const ny = (y - cy) / (size * scale);

    // Plane body / arrow (-45 degree rotated plane)
    // Rotate coords by +45 deg to align plane vertically
    const angle = Math.PI / 4;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const px = nx * cosA - ny * sinA;
    const py = nx * sinA + ny * cosA;

    // Plane fuselage & wings
    // Main triangle: apex at (0, -0.38), wings at (-0.32, 0.28), (0.32, 0.28), indent at (0, 0.16)
    let inPlane = false;
    if (py >= -0.38 && py <= 0.28) {
      const halfWidth = 0.32 * ((py - (-0.38)) / (0.28 - (-0.38)));
      if (Math.abs(px) <= halfWidth) {
        // Indent near back center
        if (py > 0.16) {
          const indentHalfWidth = 0.15 * ((py - 0.16) / (0.28 - 0.16));
          if (Math.abs(px) > indentHalfWidth) {
            inPlane = true;
          }
        } else {
          inPlane = true;
        }
      }
    }

    // Stabilizer fin in back
    if (py > 0.20 && py <= 0.35 && Math.abs(px) <= 0.08) {
      inPlane = true;
    }

    if (inPlane) {
      // White plane with subtle depth
      const planeBrightness = px < 0 ? 255 : 240;
      r = planeBrightness;
      g = planeBrightness;
      b = 255;
    }

    // Accent checkmark badge on bottom-right: center at nx = 0.28, ny = 0.28
    const badgeDx = nx - 0.28;
    const badgeDy = ny - 0.28;
    const badgeDist = Math.sqrt(badgeDx * badgeDx + badgeDy * badgeDy);
    if (badgeDist <= 0.18) {
      if (badgeDist <= 0.15) {
        // Emerald circle #10b981 (16, 185, 129)
        r = 16;
        g = 185;
        b = 129;

        // Checkmark inside green badge
        const cnx = (badgeDx) / 0.15;
        const cny = (badgeDy) / 0.15;
        // Checkmark lines: segment 1: (-0.45, 0) to (-0.1, 0.35); segment 2: (-0.1, 0.35) to (0.45, -0.35)
        const dLine1 = distToSegment(cnx, cny, -0.45, 0.05, -0.1, 0.40);
        const dLine2 = distToSegment(cnx, cny, -0.1, 0.40, 0.45, -0.35);
        if (dLine1 < 0.11 || dLine2 < 0.11) {
          r = 255;
          g = 255;
          b = 255;
        }
      } else {
        // White outline of badge
        r = 255;
        g = 255;
        b = 255;
      }
    }

    return [r, g, b, a];
  };
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

const publicDir = path.resolve(__dirname, '../public');

// 1. Apple touch icon 180x180
const applePng = makePNG(180, 180, renderBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), applePng);

// 2. pwa-192x192.png
const pwa192Png = makePNG(192, 192, renderBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192Png);

// 3. pwa-512x512.png
const pwa512Png = makePNG(512, 512, renderBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512Png);

// 4. pwa-maskable-512x512.png
const pwaMaskablePng = makePNG(512, 512, renderBrandIcon(true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskablePng);

// 5. favicon.ico (fallback 32x32 PNG inside ico structure or standard 48x48 PNG)
const favPng = makePNG(48, 48, renderBrandIcon(false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), favPng);

console.log('Successfully generated all PWA icons in /public:');
console.log('- apple-touch-icon.png (180x180)');
console.log('- pwa-192x192.png (192x192)');
console.log('- pwa-512x512.png (512x512)');
console.log('- pwa-maskable-512x512.png (512x512 maskable)');
console.log('- favicon.ico');
