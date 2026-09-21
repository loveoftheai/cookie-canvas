# 🍪 Cookie Canvas

A collaborative pixel-art board that lives **entirely on Cookie Chain**. Every pixel
placed by every visitor is a real on-chain transaction; the whole artwork can be
rebuilt from public chain data alone — no backend, no database, no indexer service.

Built for the **"Create an App on Cookie Chain"** bounty (Superteam Earn), and
submitted to the **Colosseum Crypto World's Fair MVP hackathon**.

**Live:** https://loveoftheai.github.io/cookie-canvas/ ·
**Demo video:** https://youtu.be/LLyP8R0Tkb8

## Demo mode (honest by design)

Cookie Chain has **no faucet** — test COOK is only obtainable by bridging real
funds from Solana via [Hyperlane](https://hyperlane.cookiescan.io). So the app
ships with a **clearly-labeled demo mode** ("▶ Try demo"): it replays a
simulated pixel timeline through the _exact same_ pipeline (palette → signing →
broadcasting → confirming → feed/leaderboard) with no wallet and no chain
writes. Demo pixels are always tagged `demo` in the feed, banner, and status
bar — they are never presented as on-chain data. Connect Nightly with bridged
COOK to bake **real** pixels (each one verifiable on cookiescan.io).

## How it works

1. Each pixel placement is one transaction signed by the user's wallet:
   - a **memo instruction** `CCv1:x,y:rrggbb` (coordinates + hex color)
   - a **0.000001 COOK transfer** to the protocol treasury
     [`5qnXpdxeJzn8zYgU4ezgFP4FrMJ6BwMBUUxpRHqQEeJS`](https://cookiescan.io/account/5qnXpdxeJzn8zYgU4ezgFP4FrMJ6BwMBUUxpRHqQEeJS)
2. On load, the app walks `getSignaturesForAddress(TREASURY)` and parses each
   transaction's memo to repaint the board (newest wins).
3. A websocket subscription on the treasury account streams fresh pixels live.
4. Analytics (top artists, 24h activity histogram, totals) are computed from the
   same chain data.

Because the format is a public convention (`CCv1` memos to a fixed treasury),
**anyone** can rebuild, fork, or audit the artwork — the canvas is permissionless
on-chain state.

### Prove it yourself: rebuild the board from chain data

```bash
node tools/rebuild-from-chain.mjs                # stats + ASCII preview
node tools/rebuild-from-chain.mjs --png out.png   # also render the artwork
```

Zero dependencies — raw JSON-RPC against the public Cookie Chain RPC. It walks
every transaction that ever touched the treasury, parses `CCv1` memos, and
reconstructs the full board (newest write wins, same rule as the app). Point
`RPC=` / `TREASURY=` at any SVM network to audit a fork. The protocol path can
also be exercised on Solana devnet with `tools/devnet-e2e.mjs` (needs a working
faucet; the public one has been dry).

## Features

- Nightly wallet connection (Wallet Standard; other Solana wallets work too)
- Real transaction execution with clear pending → confirming → confirmed status
- Explorer links for every pixel & artist (cookiescan.io)
- Live activity feed via websocket
- Leaderboard (all-time / 24h), 24h activity histogram, treasury total
- Error handling: rejected signatures, failed sends, RPC hiccups — surfaced as toasts
- Pan / zoom board, cookie-warm palette + custom color picker
- **Time-lapse replay** — every pixel carries its blockTime; scrub or play the
  board's history and watch the artwork form (6s / 15s / 30s speeds, live-mode
  return). Works on chain-indexed pixels and the demo timeline alike.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
```

## Wallet setup (Nightly)

Add Cookie Chain as a custom SVM network in Nightly:

- RPC: `https://rpc.cookiescan.io`
- WebSocket: `wss://rpc.cookiescan.io`

Explorer: https://cookiescan.io

## Tech

React 19 + Vite, `@solana/web3.js`, `@solana/wallet-adapter-react` (Nightly adapter),
Cookie Chain public RPC. Zero backend — the chain is the database.

## License

MIT
