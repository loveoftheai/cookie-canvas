import { useEffect, useMemo, useRef, useState } from "react";

// Time-lapse replay: scrub through the canvas' chain history.
// The playhead is a blockTime — the board renders only pixels at/below it.
export default function ReplayBar({ pixels, onReplay }) {
  const bounds = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    for (const p of pixels.values()) {
      const t = p.blockTime || 0;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    return min === Infinity ? null : { min, max };
  }, [pixels]);

  const [until, setUntil] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(15); // seconds of wall-clock replay
  const raf = useRef(null);
  const play = useRef(null); // {t0, from, to}

  // drive the playhead
  useEffect(() => {
    if (!playing || !bounds) return;
    play.current = { t0: performance.now(), from: bounds.min, to: bounds.max };
    const step = (now) => {
      const p = play.current;
      const k = Math.min(1, (now - p.t0) / (duration * 1000));
      // ease-in slightly so dense recent history doesn't flash by
      const ek = k * k * (3 - 2 * k);
      setUntil(p.from + (p.to - p.from) * ek);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, duration, bounds]);

  // lift state up: null = live mode, number = replay playhead
  useEffect(() => {
    onReplay(playing || until !== null ? until : null);
  }, [until, playing, onReplay]);

  if (!bounds || bounds.max - bounds.min < 2) return null;

  const fmt = (t) =>
    new Date(t * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const start = () => {
    setUntil(bounds.min);
    setPlaying(true);
  };

  return (
    <div className="replay-bar">
      <button
        className="replay-btn"
        onClick={() =>
          playing
            ? setPlaying(false)
            : until === null || until >= bounds.max
              ? start()
              : setPlaying(true)
        }
        title="Replay the canvas' on-chain history"
      >
        {playing ? "⏸" : "⟲ Replay"}
      </button>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={Math.max(1, Math.floor((bounds.max - bounds.min) / 500))}
        value={until === null ? bounds.max : until}
        onChange={(e) => {
          setPlaying(false);
          setUntil(Number(e.target.value));
        }}
      />
      <span className="replay-time">
        {until === null
          ? `${pixels.size} px · live`
          : `${fmt(until)}${playing ? " ▶" : " ⏸"}`}
      </span>
      {until !== null && !playing && (
        <button
          className="replay-btn live"
          onClick={() => {
            setUntil(null);
            setPlaying(false);
          }}
        >
          ● Live
        </button>
      )}
      <span className="replay-speed">
        {[6, 15, 30].map((d) => (
          <button
            key={d}
            className={duration === d ? "on" : ""}
            onClick={() => setDuration(d)}
          >
            {d}s
          </button>
        ))}
      </span>
    </div>
  );
}
