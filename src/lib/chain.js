// Cookie Canvas — chain bindings for Cookie Chain (SVM)
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export const COOKIE_RPC = "https://rpc.cookiescan.io";
// NOTE: docs say wss.cookiescan.io but its TLS cert is invalid — the RPC host
// serves the same websocket endpoint.
export const COOKIE_WSS = "wss://rpc.cookiescan.io";
export const EXPLORER_TX = (sig) => `https://cookiescan.io/tx/${sig}`;
export const EXPLORER_ADDR = (addr) => `https://cookiescan.io/account/${addr}`;

// Protocol constants — fixed forever. All pixel transactions send PIXEL_COST native COOK
// to TREASURY and carry a `CCv1:` memo. The canvas is fully reconstructible from
// chain data alone (getSignaturesForAddress on TREASURY).
export const TREASURY = new PublicKey(
  "5qnXpdxeJzn8zYgU4ezgFP4FrMJ6BwMBUUxpRHqQEeJS",
);
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
    _conn = new Connection(COOKIE_RPC, {
      wsEndpoint: COOKIE_WSS,
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

/** Fetch a tx and extract { pixel, signer, slot, blockTime } if it is a valid CCv1 pixel. */
export async function fetchPixelFromTx(signature) {
  const conn = getConnection();
  const tx = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
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
