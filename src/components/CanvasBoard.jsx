import { useEffect, useRef, useState } from "react";
import { CANVAS_H, CANVAS_W, EXPLORER_TX, NET } from "../lib/chain";

const fmtTime = (t) =>
  t
    ? new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"
    : "—";

// 96x96 board rendered on <canvas>, zoomable & pannable by drag.
export default function CanvasBoard({
  pixels,
  pending,
  onPlace,
  disabled,
  empty,
  onDemo,
}) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [color, setColor] = useState("#f0b050"); // set by parent palette via props below
  const [hover, setHover] = useState(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 }); // viewport px, for the popover
  const view = useRef({ scale: 6, ox: 0, oy: 0 });
  const drag = useRef(null);
  const needsDraw = useRef(true);

  // expose color setter through a tiny event bus (App passes palette changes)
  useEffect(() => {
    const h = (e) => setColor(e.detail);
    window.addEventListener("cc-color", h);
    return () => window.removeEventListener("cc-color", h);
  }, []);

  useEffect(() => {
    needsDraw.current = true;
  }, [pixels, pending]);

  useEffect(() => {
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cvs = ref.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      const { scale, ox, oy } = view.current;
      ctx.fillStyle = "#1c1410";
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      // faint grid every 8 px
      ctx.strokeStyle = "rgba(255,220,170,0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= CANVAS_W; g += 8) {
        ctx.beginPath();
        ctx.moveTo(g * scale + ox, oy);
        ctx.lineTo(g * scale + ox, CANVAS_H * scale + oy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, g * scale + oy);
        ctx.lineTo(CANVAS_W * scale + ox, g * scale + oy);
        ctx.stroke();
      }
      for (const p of pixels.values()) {
        ctx.fillStyle = `#${p.rgb}`;
        ctx.fillRect(p.x * scale + ox, p.y * scale + oy, scale, scale);
      }
      if (hover) {
        const { x, y } = hover;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x * scale + ox, y * scale + oy, scale, scale);
      }
      if (pending && pending.status !== "error") {
        ctx.fillStyle = `#${pending.rgb}99`;
        ctx.fillRect(
          pending.x * scale + ox,
          pending.y * scale + oy,
          scale,
          scale,
        );
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [pixels, hover, pending]);

  const toCell = (e) => {
    const cvs = ref.current;
    const r = cvs.getBoundingClientRect();
    const px =
      ((e.clientX - r.left) * (cvs.width / r.width) - view.current.ox) /
      view.current.scale;
    const py =
      ((e.clientY - r.top) * (cvs.height / r.height) - view.current.oy) /
      view.current.scale;
    const x = Math.floor(px),
      y = Math.floor(py);
    if (x < 0 || y < 0 || x >= CANVAS_W || y >= CANVAS_H) return null;
    return { x, y };
  };

  return (
    <div className="board-wrap" ref={wrapRef}>
      <div className="board-hint">
        drag to pan · scroll to zoom · click a cell to bake a pixel (1 tx =
        0.000001 {NET.needsBridge ? "COOK" : "SOL"}) · hover a pixel for its
        on-chain provenance
      </div>
      <canvas
        ref={ref}
        width={640}
        height={640}
        onPointerDown={(e) => {
          if (e.button === 1 || e.shiftKey || e.buttons === 4) return;
          drag.current = { sx: e.clientX, sy: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            const dx = e.clientX - drag.current.sx,
              dy = e.clientY - drag.current.sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
            view.current.ox += dx;
            view.current.oy += dy;
            drag.current.sx = e.clientX;
            drag.current.sy = e.clientY;
          }
          const c = toCell(e);
          setHover(c);
          if (wrapRef.current) {
            const r = wrapRef.current.getBoundingClientRect();
            setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const c = toCell(e);
            if (c && !disabled) onPlace(c.x, c.y);
          }
        }}
        onPointerLeave={() => setHover(null)}
        onWheel={(e) => {
          e.preventDefault();
          const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          view.current.scale = Math.min(
            24,
            Math.max(2, view.current.scale * f),
          );
        }}
      />
      {empty && (
        <div className="board-empty">
          <b>The chain canvas is blank.</b>
          <span>
            No real pixels yet — each one costs a transaction (0.000001
            {NET.needsBridge ? "COOK" : "SOL"}),
            so the board only fills when someone pays to paint. Be the first, or
            look around first:
          </span>
          <button className="demo-btn" onClick={onDemo}>
            ▶ Try demo
          </button>
        </div>
      )}
      {hover &&
        (() => {
          const p = pixels.get(`${hover.x},${hover.y}`);
          const wrap = wrapRef.current;
          const W = wrap ? wrap.clientWidth : 640;
          const H = wrap ? wrap.clientHeight : 640;
          const left = Math.min(cursor.x + 16, W - 240);
          const top = cursor.y > H - 130 ? cursor.y - 120 : cursor.y + 16;
          return (
            <div
              className="pixel-pop"
              style={{ left: Math.max(4, left), top: Math.max(4, top) }}
            >
              {p ? (
                <>
                  <div className="pp-row">
                    <span
                      className="pp-chip"
                      style={{ background: `#${p.rgb}` }}
                    />
                    <b>
                      ({p.x},{p.y})
                    </b>
                    <span className="pp-hex">#{p.rgb}</span>
                  </div>
                  <div className="pp-row muted">
                    by{" "}
                    {p.demo ? (
                      "demo painter (simulated)"
                    ) : (
                      <code>
                        {(p.signer || "").slice(0, 4)}…
                        {(p.signer || "").slice(-4)}
                      </code>
                    )}
                  </div>
                  <div className="pp-row muted">{fmtTime(p.blockTime)}</div>
                  {!p.demo && p.signature && (
                    <a
                      href={EXPLORER_TX(p.signature)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      tx ↗
                    </a>
                  )}
                </>
              ) : (
                <span className="muted">
                  empty cell — click to bake the first pixel here
                </span>
              )}
            </div>
          );
        })()}
    </div>
  );
}
