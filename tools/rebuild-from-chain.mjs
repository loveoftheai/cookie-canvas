#!/usr/bin/env node
// rebuild-from-chain — prove the canvas lives on-chain.
//
// Zero dependencies: talks raw JSON-RPC to the public Cookie Chain RPC,
// walks every transaction that ever touched the treasury, parses CCv1 pixel
// memos, and rebuilds the full artwork from chain history alone.
// No database, no backend, no reference to this repo's app code.
//
// Usage:
//   node tools/rebuild-from-chain.mjs                 # stats + ASCII preview
//   node tools/rebuild-from-chain.mjs --png out.png   # also render a PNG
//   TREASURY=<pubkey> RPC=<url> node ...              # verify any fork/board
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const RPC = process.env.RPC || "https://rpc.cookiescan.io";
const TREASURY =
  process.env.TREASURY || "5qnXpdxeJzn8zYgU4ezgFP4FrMJ6BwMBUUxpRHqQEeJS";
const W = 96,
  H = 96;
const MEMO_RE = /^CCv1:(\d+),(\d+):([0-9a-fA-F]{6})$/;

const rpcId = { n: 0 };
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId.n,
      method,
      params,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

async function walkSignatures() {
  const sigs = [];
  let before;
  for (let page = 0; page < 50; page++) {
    const batch = await rpc("getSignaturesForAddress", [
      TREASURY,
      { limit: 1000, ...(before ? { before } : {}) },
    ]);
    if (!batch.length) break;
    sigs.push(...batch.map((s) => s.signature));
    before = batch[batch.length - 1].signature;
    if (batch.length < 1000) break;
    process.stderr.write(`\rindexed ${sigs.length} txs…`);
  }
  process.stderr.write("\n");
  return sigs;
}

function memoOf(tx) {
  const ix = tx?.transaction?.message?.instructions || [];
  for (const i of ix) {
    if (typeof i.parsed === "string" && MEMO_RE.test(i.parsed.trim()))
      return i.parsed.trim();
  }
  for (const line of tx?.meta?.logMessages || []) {
    const at = line.indexOf("Program log: ");
    if (at >= 0 && MEMO_RE.test(line.slice(at + 13).trim()))
      return line.slice(at + 13).trim();
  }
  return null;
}

// --- tiny dependency-free PNG writer -------------------------------------
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG(path, grid) {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const rgb = grid[y * W + x] || "1c1410"; // empty = board background
      const o = y * (1 + W * 3) + 1 + x * 3;
      raw[o] = parseInt(rgb.slice(0, 2), 16);
      raw[o + 1] = parseInt(rgb.slice(2, 4), 16);
      raw[o + 2] = parseInt(rgb.slice(4, 6), 16);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolor
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

// --- main -----------------------------------------------------------------
const sigs = await walkSignatures();
const grid = new Array(W * H);
const painters = new Map();
let pixels = 0;
// oldest first so newer placements win, matching the live board
for (const sig of sigs.reverse()) {
  const tx = await rpc("getTransaction", [sig, { encoding: "jsonParsed" }]);
  const memo = memoOf(tx);
  if (!memo) continue;
  const m = MEMO_RE.exec(memo);
  const x = +m[1],
    y = +m[2];
  if (x >= W || y >= H) continue;
  if (!grid[y * W + x]) pixels++;
  grid[y * W + x] = m[3].toLowerCase();
  const signer =
    tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey || "?";
  painters.set(signer, (painters.get(signer) || 0) + 1);
}

console.log(`treasury : ${TREASURY}`);
console.log(`txs      : ${sigs.length}`);
console.log(`pixels   : ${pixels} (latest write wins per cell)`);
console.log(`painters : ${painters.size}`);
for (const [p, n] of [...painters].sort((a, b) => b[1] - a[1]).slice(0, 5))
  console.log(`  ${p.slice(0, 10)}… ${n} px`);

// ASCII preview: 96x96 -> 48x24 (2x4 cells per char), luminance -> ascii
const RAMP = " .:-=+*#%@";
for (let ry = 0; ry < H; ry += 4) {
  let line = "";
  for (let rx = 0; rx < W; rx += 2) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let y = ry; y < ry + 4; y++)
      for (let x = rx; x < rx + 2; x++) {
        const rgb = grid[y * W + x];
        if (rgb) {
          r += parseInt(rgb.slice(0, 2), 16);
          g += parseInt(rgb.slice(2, 4), 16);
          b += parseInt(rgb.slice(4, 6), 16);
          n++;
        }
      }
    if (!n) {
      line += " ";
      continue;
    }
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / n / 255;
    line +=
      RAMP[Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1)))];
  }
  console.log(line);
}

const pngArg = process.argv.indexOf("--png");
if (pngArg > 0 && process.argv[pngArg + 1]) {
  writePNG(process.argv[pngArg + 1], grid);
  console.log(`\npng written: ${process.argv[pngArg + 1]}`);
}
if (!pixels)
  console.log(
    "\n(the board is genuinely blank — nobody has paid to paint yet; run the app in demo mode to see a simulated bake)",
  );
