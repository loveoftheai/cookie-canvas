// Cookie Canvas — chain bindings. The canvas lives on Cookie Chain (SVM) and
// can also run on Solana Devnet (same CCv1 memo convention, real transactions).
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// Both networks use the identical protocol: a pixel = one transaction carrying
// a `CCv1:` memo + a tiny native transfer to that network's TREASURY. The board
// is fully reconstructible from chain data alone (getSignaturesForAddress).
export const NETWORKS = {
  cookie: {
    key: "cookie",
    label: "Cookie Chain",
    // NOTE: docs say wss.cookiescan.io but its TLS cert is invalid — the RPC host
    // serves the same websocket endpoint.
    rpc: "https://rpc.cookiescan.io",
    wss: "wss://rpc.cookiescan.io",
    treasury: "5qnXpdxeJzn8zYgU4ezgFP4FrMJ6BwMBUUxpRHqQEeJS",
    explorerTx: (sig) => `https://cookiescan.io/tx/${sig}`,
    explorerAddr: (addr) => `https://cookiescan.io/account/${addr}`,
    unit: "COOK",
    needsBridge: true,
  },
  devnet: {
    key: "devnet",
    label: "Solana Devnet",
    rpc: "https://api.devnet.solana.com",
    wss: "wss://api.devnet.solana.com",
    treasury: "2hAXRdZkoZvgeA9FK5jxhPXtRPk7Z51XFJa8b6pgdYtE",
    explorerTx: (sig) => `https://solscan.io/tx/${sig}?cluster=devnet`,
    explorerAddr: (addr) => `https://solscan.io/account/${addr}?cluster=devnet`,
    unit: "SOL (devnet, no value)",
    needsBridge: false,
  },
};

// Active network is fixed per page load; switching stores it and reloads.
export function getNetworkKey() {
  try {
    const k = localStorage.getItem("cc_net");
    return NETWORKS[k] ? k : "cookie";
  } catch {
    return "cookie";
  }
}
export const NET_KEY = getNetworkKey();
export const NET = NETWORKS[NET_KEY];
export function switchNetwork(key) {
  if (!NETWORKS[key]) return;
  localStorage.setItem("cc_net", key);
  location.search = key === "devnet" ? "?net=devnet" : "";
}

export const EXPLORER_TX = NET.explorerTx;
export const EXPLORER_ADDR = NET.explorerAddr;
export const TREASURY = new PublicKey(NET.treasury);
// spl-memo v1 — verified deployed on Cookie Chain (v2 is NOT; do not switch).
export const MEMO_PROGRAM_ID = new PublicKey(
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
);
export const PIXEL_COST = 0.000001 * LAMPORTS_PER_SOL; // 0.000001 COOK per pixel
export const CANVAS_W = 96;
export const CANVAS_H = 96;
export const MEMO_PREFIX = "CCv1";

let _conn = null;
export function getConnection() {
  if (!_conn)
    _conn = new Connection(NET.rpc, {
      wsEndpoint: NET.wss,
      commitment: "confirmed",
    });
  return _conn;
}

const MEMO_RE = /^CCv1:(\d+),(\d+):([0-9a-fA-F]{6})$/;

export function encodeMemo(x, y, rgb) {
  return `CCv1:${x},${y}:${rgb}`;
}

export function parseMemo(str) {
  const m = MEMO_RE.exec((str || "").trim());
  if (!m) return null;
  const x = +m[1],
    y = +m[2];
  if (x >= CANVAS_W || y >= CANVAS_H) return null;
  return { x, y, rgb: m[3].toLowerCase() };
}

/**
 * Build the pixel-placement transaction: memo + tiny COOK transfer to TREASURY.
 * Signed & sent by the user's wallet (Nightly).
 */
export async function buildPixelTx(payer, x, y, rgb) {
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: payer, isSigner: true, isWritable: true }],
      data: Buffer.from(encodeMemo(x, y, rgb), "utf8"),
    }),
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: TREASURY,
      lamports: PIXEL_COST,
    }),
  );
  tx.feePayer = payer;
  tx.recentBlockhash = (await getConnection().getLatestBlockhash()).blockhash;
  return tx;
}

/** Walk signature history on TREASURY, newest-first, up to `pages` * 1000. */
export async function fetchPixelSignatures(pages = 4) {
  const conn = getConnection();
  const sigs = [];
  let before = undefined;
  for (let p = 0; p < pages; p++) {
    const batch = await conn.getSignaturesForAddress(TREASURY, {
      limit: 1000,
      ...(before ? { before } : {}),
    });
    if (!batch.length) break;
    sigs.push(...batch);
    before = batch[batch.length - 1].signature;
    if (batch.length < 1000) break;
  }
  return sigs;
}

/** Extract { pixel, signer, slot, blockTime } from a jsonParsed tx, or null. */
function pixelFromTx(tx, signature) {
  const signerKey =
    tx.transaction.message.accountKeys.find((k) => k.signer) ??
    tx.transaction.message.accountKeys[0];
  const memo =
    tx.transaction.message.instructions
      .map((i) => (i.parsed && typeof i.parsed === "string" ? i.parsed : null))
      .find(Boolean) ??
    // jsonParsed encoding: fall back to raw log scan when parsed memo is absent
    extractMemoFromLogs(tx.meta?.logMessages);
  const pixel = parseMemo(memo);
  if (!pixel) return null;
  return {
    ...pixel,
    signature,
    signer: (signerKey.pubkey ?? signerKey).toString(),
    slot: tx.slot,
    blockTime: tx.blockTime,
  };
}

/** Fetch a tx and extract a CCv1 pixel (single-signature convenience). */
export async function fetchPixelFromTx(signature) {
  const conn = getConnection();
  const tx = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
  return pixelFromTx(tx, signature);
}

/**
 * Batched JSON-RPC backfill: many getTransaction calls in one HTTP POST.
 * Public RPCs throttle per request, so pulling ~25 txs per round-trip speeds
 * board reconstruction up enormously without hammering the endpoint.
 * Returns an array aligned with `signatures` (null where not a CCv1 pixel).
 */
export async function fetchPixelsBatch(signatures) {
  if (!signatures.length) return [];
  const results = new Array(signatures.length).fill(null);
  let pending = signatures.map((signature, i) => ({ signature, i }));
  // devnet load-balancers often miss a tx on a given node: one retry round
  // (which may land on a different node) recovers most of the nulls.
  for (let round = 0; round < 2 && pending.length; round++) {
    if (round) await shortSleep(600);
    const res = await fetch(NET.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        pending.map(({ signature }, i) => ({
          jsonrpc: "2.0",
          id: i,
          method: "getTransaction",
          params: [
            signature,
            { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
          ],
        })),
      ),
    });
    if (!res.ok) throw new Error("batch rpc http " + res.status);
    const arr = await res.json();
    const byId = new Map(arr.map((r) => [r.id, r]));
    const still = [];
    for (let i = 0; i < pending.length; i++) {
      const r = byId.get(i);
      if (r && !r.error && r.result) {
        try {
          results[pending[i].i] = pixelFromTx(r.result, pending[i].signature);
        } catch {
          /* unparseable — leave null */
        }
      } else {
        still.push(pending[i]);
      }
    }
    pending = still;
  }
  return results;
}

function extractMemoFromLogs(logs) {
  if (!logs) return null;
  for (const line of logs) {
    const i = line.indexOf("Program log: ");
    if (i >= 0 && line.slice(i + 13).startsWith(MEMO_PREFIX))
      return line.slice(i + 13);
  }
  return null;
}

export async function shortSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
