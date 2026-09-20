import { useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCanvasState } from "./hooks/useCanvasState";
import CanvasBoard from "./components/CanvasBoard";
import { Palette, Activity, Leaderboard } from "./components/Sidebar";
import { COOKIE_RPC, EXPLORER_ADDR, TREASURY } from "./lib/chain";

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
  const { pixels, feed, loading, progress, pending, place } = useCanvasState({
    publicKey,
    signTransaction,
    connected,
  });
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState("f0b050");
  const [cooldown, setCooldown] = useState(false);

  const statusText = useMemo(() => {
    if (pending?.status === "signing")
      return "Waiting for signature in Nightly…";
    if (pending?.status === "sending") return "Broadcasting to Cookie Chain…";
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
              A collaborative pixel board, fully on Cookie Chain. Every pixel is
              a real transaction — rebuild the entire artwork from chain history
              alone.
            </p>
          </div>
        </div>
        <WalletMultiButton />
      </header>

      <main>
        <div className="left">
          <CanvasBoard
            pixels={pixels}
            pending={pending}
            onPlace={handlePlace}
            disabled={!connected || busy || cooldown}
          />
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
            ) : (
              <span className="muted">
                ● Connect Nightly (add Cookie Chain RPC in Nightly settings)
              </span>
            )}
          </div>
        </div>
        <div className="right">
          <Palette onPick={(c) => setColor(c)} disabled={!connected} />
          <Activity feed={feed} loading={loading} progress={progress} />
          <Leaderboard feed={feed} pixels={pixels} />
        </div>
      </main>

      <footer className="muted small">
        RPC <code>{COOKIE_RPC}</code> · treasury{" "}
        <a
          href={EXPLORER_ADDR(TREASURY.toString())}
          target="_blank"
          rel="noreferrer"
        >
          {TREASURY.toString().slice(0, 8)}…
        </a>{" "}
        · 1 pixel = 1 tx (memo <code>CCv1:x,y:rrggbb</code> + 0.000001 COOK) ·
        built for the Cookie Chain cApp bounty
      </footer>

      <Toast
        msg={toast?.msg}
        kind={toast?.kind}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
