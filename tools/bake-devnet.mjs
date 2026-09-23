// Bake REAL pixels on Solana Devnet using the same CCv1 protocol as the app.
// Usage:
//   node tools/bake-devnet.mjs "x,y,rrggbb" "x,y,rrggbb" ...   (explicit pixels)
//   node tools/bake-devnet.mjs --art art.png --at 24,24        (bake an image)
//   node tools/bake-devnet.mjs --airdrop                       (fund the payer)
// Keys live OUTSIDE the repo in ../wallets/sol_devnet_{payer,treasury}.json (600).
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";

const RPC = process.env.CC_RPC || "https://api.devnet.solana.com";
const TREASURY = new PublicKey(
  JSON.parse(
    readFileSync(
      new URL("../../wallets/sol_devnet_treasury.json", import.meta.url),
    ),
  ).pubkey,
);
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(
        new URL("../../wallets/sol_devnet_payer.json", import.meta.url),
      ),
    ).secret,
  ),
);
const MEMO_V1 = new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");
const PIXEL_COST = 0.000001 * LAMPORTS_PER_SOL;
const conn = new Connection(RPC, { commitment: "confirmed" });

const bal = async () =>
  (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;

async function airdrop(amount = 1) {
  console.log(
    "requesting airdrop",
    amount,
    "SOL for",
    payer.publicKey.toString(),
    "…",
  );
  const sig = await conn.requestAirdrop(
    payer.publicKey,
    amount * LAMPORTS_PER_SOL,
  );
  await conn.confirmTransaction(sig);
  console.log("balance now:", await bal());
}

function pixelTxs(pixels) {
  return pixels.map(({ x, y, rgb }) =>
    new Transaction().add(
      new TransactionInstruction({
        programId: MEMO_V1,
        keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
        data: Buffer.from(`CCv1:${x},${y}:${rgb}`, "utf8"),
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: TREASURY,
        lamports: PIXEL_COST,
      }),
    ),
  );
}

async function bake(pixels) {
  let ok = 0;
  for (const px of pixels) {
    try {
      const tx = pixelTxs([px])[0];
      tx.feePayer = payer.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      tx.sign(payer);
      const sig = await conn.sendRawTransaction(tx.serialize());
      // REST polling confirm (WS signatureSubscribe is unsupported on some
      // RPC providers, e.g. Alchemy — confirmTransaction would hang there)
      let err = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 750));
        const st = await conn.getSignatureStatuses([sig], {
          searchTransactionHistory: true,
        });
        const s = st && st.value[0];
        if (s) {
          if (s.err) {
            err = JSON.stringify(s.err);
            break;
          }
          if (
            s.confirmationStatus === "confirmed" ||
            s.confirmationStatus === "finalized"
          )
            break;
        }
      }
      if (err) throw new Error(err);
      ok++;
      console.log(
        `baked (${px.x},${px.y}) #${px.rgb} → ${sig}  https://solscan.io/tx/${sig}?cluster=devnet`,
      );
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error("FAILED", `(${px.x},${px.y})`, String(e).slice(0, 140));
    }
  }
  console.log(`done: ${ok}/${pixels.length}`);
}

// --art: downscale a PNG to pixels (nearest-color, simple RGB quantization)
async function artPixels(path, at = [24, 24], size = 16) {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(readFileSync(path));
  const out = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * png.width) / size);
      const sy = Math.floor((y * png.height) / size);
      const i = (sy * png.width + sx) * 4;
      const [r, g, b, a] = [
        png.data[i],
        png.data[i + 1],
        png.data[i + 2],
        png.data[i + 3],
      ];
      if (a < 128) continue;
      out.push({
        x: at[0] + x,
        y: at[1] + y,
        rgb: [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""),
      });
    }
  }
  return out;
}

const argv = process.argv.slice(2);
console.log("payer:", payer.publicKey.toString(), "balance:", await bal());
if (argv.includes("--airdrop")) {
  await airdrop(1);
} else if (argv.includes("--art")) {
  const path = argv[argv.indexOf("--art") + 1];
  const atArg = argv[argv.indexOf("--at") + 1];
  const size = Number(argv[argv.indexOf("--size") + 1] || 16);
  const at = atArg ? atArg.split(",").map(Number) : [24, 24];
  const px = await artPixels(path, at, size);
  console.log("art pixels:", px.length);
  await bake(px);
} else {
  const px = argv
    .filter((a) => /^\d+,\d+,([0-9a-fA-F]{6})$/.test(a))
    .map((a) => {
      const [x, y, rgb] = a.split(",");
      return { x: +x, y: +y, rgb };
    });
  if (!px.length) {
    console.error(
      'no pixels given. e.g. node tools/bake-devnet.mjs "40,40,f0b050"',
    );
    process.exit(1);
  }
  await bake(px);
}
