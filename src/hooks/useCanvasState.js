// Global canvas state: chain-indexed pixels + live subscription + placement.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TREASURY,
  buildPixelTx,
  fetchPixelFromTx,
  fetchPixelSignatures,
  getConnection,
  shortSleep,
} from "../lib/chain";
import { buildDemoTimeline, nextDemoSig } from "../lib/demo";

const HISTORY_PAGES = 4; // ~4000 most recent pixels on load
const FETCH_CONCURRENCY = 6;

export function useCanvasState({ publicKey, signTransaction, connected }) {
  // pixels: Map "x,y" -> { x, y, rgb, signature, signer, blockTime }
  const [pixels, setPixels] = useState(new Map());
  const [feed, setFeed] = useState([]); // newest first
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [pending, setPending] = useState(null); // {x,y,rgb,status,signature?,error?}
  const seenSigs = useRef(new Set());
  const latestSig = useRef(null);
  const [demoActive, setDemoActive] = useState(false);
  const demoTimers = useRef([]);

  const ingest = useCallback((px) => {
    if (!px || !px.signature || seenSigs.current.has(px.signature)) return;
    seenSigs.current.add(px.signature);
    setPixels((prev) => {
      const next = new Map(prev);
      next.set(`${px.x},${px.y}`, px);
      return next;
    });
    setFeed((prev) => [px, ...prev].slice(0, 200));
  }, []);

  // Demo mode: replay a scripted, SIMULATED pixel timeline locally so the app
  // can be explored without a funded wallet. Nothing here touches the chain.
  const startDemo = useCallback(() => {
    if (demoActive) return;
    setDemoActive(true);
    const items = buildDemoTimeline();
    // animate in fast (a couple of pixels per tick) for a lively time-lapse
    let i = 0;
    const tick = setInterval(() => {
      for (let k = 0; k < 3 && i < items.length; k++, i++) ingest(items[i]);
      if (i >= items.length) clearInterval(tick);
    }, 12);
    demoTimers.current.push(tick);
  }, [demoActive, ingest]);

  const stopDemo = useCallback(() => {
    demoTimers.current.forEach(clearInterval);
    demoTimers.current = [];
    setDemoActive(false);
    // demo pixels leave with the session — refresh to reset the board
    setPixels(new Map());
    setFeed([]);
    seenSigs.current = new Set();
  }, []);

  // Initial backfill
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const sigs = await fetchPixelSignatures(HISTORY_PAGES);
        if (dead) return;
        // newest first — later pixels overwrite earlier in the Map
        setProgress({ done: 0, total: sigs.length });
        let done = 0;
        for (let i = 0; i < sigs.length; i += FETCH_CONCURRENCY) {
          const batch = sigs.slice(i, i + FETCH_CONCURRENCY);
          const results = await Promise.all(
            batch.map((s) => fetchPixelFromTx(s.signature).catch(() => null)),
          );
          results.forEach((r) => !dead && ingest(r));
          done += batch.length;
          if (!dead) setProgress({ done, total: sigs.length });
          await shortSleep(120); // be polite to the public RPC
        }
      } catch (e) {
        console.warn("backfill failed", e);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [ingest]);

  // Live updates via websocket on the TREASURY account
  useEffect(() => {
    let subId = null;
    let timer = null;
    const conn = getConnection();
    const poll = async () => {
      try {
        const sigs = await conn.getSignaturesForAddress(TREASURY, {
          limit: 25,
        });
        const fresh = sigs.filter((s) => !seenSigs.current.has(s.signature));
        for (const s of fresh) {
          const px = await fetchPixelFromTx(s.signature).catch(() => null);
          ingest(px);
        }
      } catch (e) {
        console.warn("live poll failed", e);
      }
    };
    (async () => {
      try {
        subId = conn.onAccountChange(TREASURY, () => {
          clearTimeout(timer);
          timer = setTimeout(poll, 1500);
        });
      } catch (e) {
        console.warn("ws failed, falling back to polling", e);
      }
      timer = setInterval(poll, 15000);
    })();
    return () => {
      if (subId !== null)
        conn.removeAccountChangeListener(subId).catch(() => {});
      clearInterval(timer);
      clearTimeout(timer);
    };
  }, [ingest]);

  const place = useCallback(
    async (x, y, rgb) => {
      // Demo mode: walk the same signing → sending → confirming pipeline,
      // simulated locally (clearly labeled in the UI as demo, not on-chain).
      if (demoActive) {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (const status of ["signing", "sending", "confirming"]) {
          setPending({ x, y, rgb, status });
          await wait(450);
        }
        ingest({
          x,
          y,
          rgb,
          signature: nextDemoSig("you"),
          signer: "You (demo)",
          blockTime: Math.floor(Date.now() / 1000),
          demo: true,
        });
        setPending(null);
        return "demo";
      }
      if (!connected || !publicKey || !signTransaction) {
        throw new Error("Connect your Nightly wallet first");
      }
      setPending({ x, y, rgb, status: "signing" });
      try {
        const tx = await buildPixelTx(publicKey, x, y, rgb);
        setPending({ x, y, rgb, status: "sending" });
        const signed = await signTransaction(tx);
        const conn = getConnection();
        const sig = await conn.sendRawTransaction(signed.serialize());
        setPending({ x, y, rgb, status: "confirming", signature: sig });
        const latest = await conn.getLatestBlockhash();
        const conf = await conn.confirmTransaction(
          {
            signature: sig,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          "confirmed",
        );
        if (conf.value.err) throw new Error("Transaction failed on-chain");
        ingest({
          x,
          y,
          rgb,
          signature: sig,
          signer: publicKey.toString(),
          blockTime: Math.floor(Date.now() / 1000),
        });
        setPending(null);
        return sig;
      } catch (e) {
        setPending({
          x,
          y,
          rgb,
          status: "error",
          error: String(e?.message || e),
        });
        setTimeout(() => setPending(null), 4000);
        throw e;
      }
    },
    [connected, publicKey, signTransaction, ingest, demoActive],
  );

  return {
    pixels,
    feed,
    loading,
    progress,
    pending,
    place,
    demoActive,
    startDemo,
    stopDemo,
  };
}
