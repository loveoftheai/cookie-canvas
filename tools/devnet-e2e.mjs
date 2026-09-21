#!/usr/bin/env node
// devnet-e2e — validate the CCv1 protocol end-to-end on Solana devnet.
// Places real pixels (memo + transfer) to a throwaway treasury, so
// tools/rebuild-from-chain.mjs can be verified against real transactions.
//
//   node tools/devnet-e2e.mjs gen     # create keypairs -> /tmp/e2e-keys.json
//   curl -x http://127.0.0.1:7890 ... # requestAirdrop for the printed payer
//   node tools/devnet-e2e.mjs send    # place pixels, print rebuild command
//
// Costs nothing (devnet). Never touches Cookie Chain mainnet.
import { readFileSync, writeFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const MEMO_PROGRAM_ID = new PublicKey(
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
);
const KEYS = "/tmp/e2e-keys.json";

if (process.argv[2] === "gen") {
  const payer = Keypair.generate();
  const treasury = Keypair.generate();
  writeFileSync(
    KEYS,
    JSON.stringify(
      {
        payer: [...payer.secretKey],
        treasury: [...treasury.secretKey],
      },
      null,
      2,
    ),
  );
  console.log("payer    :", payer.publicKey.toString());
  console.log("treasury :", treasury.publicKey.toString());
  console.log("keys ->", KEYS);
  console.log("now airdrop (via proxy) :");
  console.log(
    `curl -x http://127.0.0.1:7890 -s -X POST ${RPC} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"requestAirdrop","params":["${payer.publicKey}", 50000000]}'`,
  );
  process.exit(0);
}

const { payer: pk, treasury: tk } = JSON.parse(readFileSync(KEYS));
const payer = Keypair.fromSecretKey(Uint8Array.from(pk));
const treasury = Keypair.fromSecretKey(Uint8Array.from(tk));
const conn = new Connection(RPC, "confirmed");

const bal = await conn.getBalance(payer.publicKey);
console.log("payer balance:", bal / 1e9, "SOL");
if (bal < 20000) throw new Error("airdrop not landed yet");

const pixels = [
  { x: 10, y: 10, rgb: "f0b050" },
  { x: 11, y: 10, rgb: "8a5a33" },
  { x: 11, y: 11, rgb: "3b2314" },
  { x: 40, y: 20, rgb: "00ff00" },
];
for (const p of pixels) {
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from(`CCv1:${p.x},${p.y}:${p.rgb}`, "utf8"),
    }),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: treasury.publicKey,
      lamports: 1000,
    }),
  );
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const s = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(s);
  console.log("pixel", JSON.stringify(p), "->", s.slice(0, 24) + "…");
}
console.log("\nnow rebuild:");
console.log(
  `RPC=${RPC} TREASURY=${treasury.publicKey} node tools/rebuild-from-chain.mjs`,
);
