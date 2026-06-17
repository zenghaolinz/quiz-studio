// Generates a 1024x1024 branded placeholder PNG (zero deps, built-in zlib).
// Solid indigo background with a lighter rounded "Q-ish" ring so it isn't a flat slab.
const zlib = require("zlib");
const fs = require("fs");

const W = 1024, H = 1024;
const bg = [99, 102, 241];     // indigo-500
const ring = [224, 231, 255];  // indigo-100

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// raw image data: per row a filter byte (0) then RGBA pixels
const rowLen = 1 + W * 4;
const raw = Buffer.alloc(rowLen * H);
const cx = W / 2, cy = H / 2;
const rOuter = 360, rInner = 230;
for (let y = 0; y < H; y++) {
  const base = y * rowLen;
  raw[base] = 0; // filter none
  for (let x = 0; x < W; x++) {
    const o = base + 1 + x * 4;
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    let col = bg;
    // ring: between rInner and rOuter, with a gap on the right (Q tail)
    const inRing = d >= rInner && d <= rOuter;
    const inTail = dx >= 0 && dy >= 0 && d <= rOuter && d >= rInner - 40 &&
                   dx >= rInner * 0.6;
    if (inRing || inTail) col = ring;
    raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255;
  }
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
const out = process.argv[2] || "icon-source.png";
fs.writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
