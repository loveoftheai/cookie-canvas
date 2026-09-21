import { useMemo, useState } from "react";
import { EXPLORER_ADDR, EXPLORER_TX, PIXEL_COST } from "../lib/chain";

const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const ago = (t) => {
  if (!t) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const COOKIE_PALETTE = [
  "#000000",
  "#5a3e2b",
  "#c68a53",
  "#f0b050",
  "#ffe1a8",
  "#ffffff",
  "#b33939",
  "#e76f51",
  "#f4a261",
  "#2a9d8f",
  "#264653",
  "#457b9d",
  "#a8dadc",
  "#6a4c93",
  "#ff70a6",
  "#caffbf",
  "#fdffb6",
  "#9bf6ff",
  "#bdb2ff",
  "#ffc6ff",
];

export function Palette({ onPick, disabled }) {
  const [custom, setCustom] = useState("#f0b050");
  return (
    <section className="card palette">
      <h3>Palette</h3>
      <div className="swatches">
        {COOKIE_PALETTE.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            disabled={disabled}
            onClick={() => {
              setCustom(c);
              window.dispatchEvent(
                new CustomEvent("cc-color", { detail: c.slice(1) }),
              );
              onPick?.(c.slice(1));
            }}
          />
        ))}
      </div>
      <div className="custom-row">
        <input
          type="color"
          value={custom}
          disabled={disabled}
          onChange={(e) => {
            setCustom(e.target.value);
            window.dispatchEvent(
              new CustomEvent("cc-color", { detail: e.target.value.slice(1) }),
            );
            onPick?.(e.target.value.slice(1));
          }}
        />
        <code>{custom}</code>
      </div>
    </section>
  );
}

export function Activity({ feed, loading, progress }) {
  return (
    <section className="card activity">
      <h3>
        Fresh out of the oven
        {loading && progress.total > 0 && (
          <span className="muted">
            {" "}
            · indexing {progress.done}/{progress.total}
          </span>
        )}
      </h3>
      {feed.length === 0 && (
        <div className="muted small">No pixels yet — be the first artist.</div>
      )}
      <ul>
        {feed.slice(0, 14).map((p) => (
          <li key={p.signature}>
            <span className="dot" style={{ background: `#${p.rgb}` }} />
            {p.demo ? (
              <span className="mono">
                demo·{p.signer.startsWith("You") ? "you" : short(p.signer)}
              </span>
            ) : (
              <a
                className="mono"
                href={EXPLORER_TX(p.signature)}
                target="_blank"
                rel="noreferrer"
              >
                {short(p.signer)}
              </a>
            )}
            <span className="muted">
              painted ({p.x},{p.y}) {ago(p.blockTime)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Leaderboard({ feed, pixels }) {
  const [scope, setScope] = useState("all");
  const stats = useMemo(() => {
    const counts = new Map();
    const dayAgo = Date.now() / 1000 - 86400;
    const source =
      scope === "24h"
        ? feed.filter((p) => p.blockTime > dayAgo)
        : pixels.values();
    let total = 0;
    for (const p of source) {
      counts.set(p.signer, (counts.get(p.signer) || 0) + 1);
      total++;
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const artists = counts.size;
    return { top, total, artists };
  }, [feed, pixels, scope]);

  const hours = useMemo(() => {
    const buckets = new Array(24).fill(0);
    const now = Date.now() / 1000;
    for (const p of feed) {
      const h = Math.floor((now - (p.blockTime || now)) / 3600);
      if (h >= 0 && h < 24) buckets[23 - h]++;
    }
    return buckets;
  }, [feed]);
  const maxH = Math.max(1, ...hours);

  return (
    <section className="card leaderboard">
      <h3>
        Top bakers
        <span className="toggle">
          <button
            className={scope === "all" ? "on" : ""}
            onClick={() => setScope("all")}
          >
            all-time
          </button>
          <button
            className={scope === "24h" ? "on" : ""}
            onClick={() => setScope("24h")}
          >
            24h
          </button>
        </span>
      </h3>
      <div className="stat-row">
        <div>
          <b>{stats.total}</b>
          <span>pixels</span>
        </div>
        <div>
          <b>{stats.artists}</b>
          <span>artists</span>
        </div>
        <div>
          <b>{(stats.total * (PIXEL_COST / 1e9)).toFixed(6)}</b>
          <span>COOK in treasury</span>
        </div>
      </div>
      <div className="hist">
        {hours.map((v, i) => (
          <div
            key={i}
            title={`${v} px`}
            style={{ height: `${(v / maxH) * 100}%` }}
          />
        ))}
      </div>
      <ol>
        {stats.top.map(([addr, n], i) => (
          <li key={addr}>
            <span className="rank">#{i + 1}</span>
            <a
              className="mono"
              href={EXPLORER_ADDR(addr)}
              target="_blank"
              rel="noreferrer"
            >
              {short(addr)}
            </a>
            <b>{n}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}
