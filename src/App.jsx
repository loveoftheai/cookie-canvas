import { useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCanvasState } from "./hooks/useCanvasState";
import CanvasBoard from "./components/CanvasBoard";
import ReplayBar from "./components/ReplayBar";
import { Palette, Activity, Leaderboard } from "./components/Sidebar";
import {
  EXPLORER_ADDR,
  TREASURY,
  NET,
  NETWORKS,
  switchNetwork,
} from "./lib/chain";

function Toast({ msg, kind, onClose }) {
  if (!msg) return null;
  return (
    <div className={`toast ${kind || ""}`} onClick={onClose}>
      {msg}
    </div>
  );
}

export default function App() {
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();
  const {
    pixels,
    feed,
    loading,
    progress,
    pending,
    place,
    demoActive,
    startDemo,
    stopDemo,
  } = useCanvasState({ publicKey, signTransaction, connected });
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState("f0b050");
  const [cooldown, setCooldown] = useState(false);
  // time-lapse: replayUntil = null → live board; number → only pixels ≤ that blockTime
  const [replayUntil, setReplayUntil] = useState(null);
  const shownPixels = useMemo(
    () =>
      replayUntil === null
        ? pixels
        : new Map(
            [...pixels].filter(([, p]) => (p.blockTime || 0) <= replayUntil),
          ),
    [pixels, replayUntil],
  );

  // ?demo=1 auto-starts demo mode (used by the recorded walkthrough)
  useEffect(() => {
    if (
      !connected &&
      new URLSearchParams(location.search).get("demo") === "1"
    ) {
      const t = setTimeout(startDemo, 2500);
      return () => clearTimeout(t);
    }
  }, [connected, startDemo]);

  // ?net=devnet shareable deep link — persists the network and reloads once
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("net");
    if (q && NETWORKS[q] && localStorage.getItem("cc_net") !== q) {
      localStorage.setItem("cc_net", q);
      location.reload();
    }
  }, []);

  const statusText = useMemo(() => {
    if (pending?.status === "signing")
      return "Waiting for signature in Nightly…";
    if (pending?.status === "sending") return `Broadcasting to ${NET.label}…`;
    if (pending?.status === "confirming") return "Confirming…";
    return null;
  }, [pending]);

  const handlePlace = async (x, y) => {
    if (busy || cooldown) return;
    setBusy(true);
    try {
      await place(x, y, color);
      setToast({ msg: `Pixel baked at (${x},${y}) 🍪`, kind: "ok" });
      setCooldown(true);
      setTimeout(() => setCooldown(false), 1500);
    } catch (e) {
      const m = String(e?.message || e);
      setToast({
        msg: m.includes("User rejected")
          ? "Signature rejected"
          : `Failed: ${m.slice(0, 120)}`,
        kind: "err",
      });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">🍪</span>
          <div>
            <h1>Cookie Canvas</h1>
            <p className="muted">
              A collaborative pixel board where every pixel is a real on-chain
              transaction — the artwork is rebuildable from chain history alone.
            </p>
          </div>
        </div>
        <div className="wallet-row">
          <div className="net-switch" role="tablist" aria-label="Network">
            {Object.values(NETWORKS).map((n) => (
              <button
                key={n.key}
                className={"net-btn" + (n.key === NET.key ? " on" : "")}
                onClick={() => switchNetwork(n.key)}
                title={
                  n.key === "cookie"
                    ? "Cookie Chain mainnet (needs bridged COOK)"
                    : "Solana Devnet — real transactions, devnet SOL (no value)"
                }
              >
                {n.key === "cookie" ? "🍪 Cookie Chain" : "◎ Solana Devnet"}
              </button>
            ))}
          </div>
          {!connected && !demoActive && (
            <button className="demo-btn" onClick={startDemo}>
              ▶ Try demo
            </button>
          )}
          {demoActive && (
            <button className="demo-btn on" onClick={stopDemo}>
              ✕ Exit demo
            </button>
          )}
          <WalletMultiButton />
        </div>
      </header>

      {NET.key === "devnet" && !demoActive && (
        <div className="demo-banner net-banner">
          <b>Solana Devnet mode</b> — pixels here are <i>real transactions</i>{" "}
          (devnet SOL, no monetary value), each verifiable on Solscan. Same CCv1
          protocol as the Cookie Chain board.
        </div>
      )}

      {demoActive && (
        <div className="demo-banner">
          <b>Demo mode</b> — these pixels are simulated locally so you can
          explore without a funded wallet.{" "}
          {NET.needsBridge
            ? "Connect Nightly (with bridged COOK) to bake real on-chain pixels."
            : "Connect a wallet with devnet SOL (any faucet) to bake real on-chain pixels."}
        </div>
      )}

      <main>
        <div className="left">
          <CanvasBoard
            pixels={shownPixels}
            pending={pending}
            onPlace={handlePlace}
            disabled={(!connected && !demoActive) || busy || cooldown}
            empty={!connected && !demoActive && !loading && pixels.size === 0}
            onDemo={startDemo}
          />
          <ReplayBar pixels={pixels} onReplay={setReplayUntil} />
          {replayUntil !== null && (
            <div className="demo-banner replay-banner">
              <b>Time-lapse</b> — replaying chain history. Click <b>● Live</b>{" "}
              to return to the live board.
            </div>
          )}
          <div className="statusbar">
            {loading ? (
              <span className="muted">
                Indexing chain history… {progress.done}/{progress.total} txs
              </span>
            ) : statusText ? (
              <span className="ok-text">● {statusText}</span>
            ) : connected ? (
              <span className="ok-text">
                ● Connected — pick a color and click a cell
              </span>
            ) : demoActive ? (
              <span className="ok-text">
                ● Demo mode (simulated) — pick a color and click a cell
              </span>
            ) : (
              <span className="muted">
                ●{" "}
                {NET.needsBridge
                  ? "Connect Nightly (add Cookie Chain RPC in Nightly settings)"
                  : "Connect a wallet with devnet SOL — pick a color and bake a real pixel"}
              </span>
            )}
          </div>
        </div>
        <div className="right">
          <Palette
            onPick={(c) => setColor(c)}
            disabled={!connected && !demoActive}
          />
          <Activity feed={feed} loading={loading} progress={progress} />
          <Leaderboard feed={feed} pixels={pixels} />
        </div>
      </main>

      <footer className="muted small">
        {NET.label} · RPC <code>{NET.rpc}</code> · treasury{" "}
        <a
          href={EXPLORER_ADDR(TREASURY.toString())}
          target="_blank"
          rel="noreferrer"
        >
          {TREASURY.toString().slice(0, 8)}…
        </a>{" "}
        · 1 pixel = 1 tx (memo <code>CCv1:x,y:rrggbb</code> +{" "}
        {NET.needsBridge ? "0.000001 COOK" : "0.000001 SOL"}) · built for the
        Cookie Chain cApp bounty
      </footer>

      <Toast
        msg={toast?.msg}
        kind={toast?.kind}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
