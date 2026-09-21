// Demo mode: SIMULATED pixels for previewing the canvas without a funded
// wallet. These are clearly marked (demo: true), never linked to the explorer,
// and never claimed to be on-chain. Real placements still go through
// Nightly + a real Cookie Chain transaction.

// plausible-looking fake base58 signers so the leaderboard reads naturally
export const DEMO_SIGNERS = [
  "DemoBaker7xKq9vVdF3mZcA2wRtYhUjPnLbG4sEeoSdHkQ",
  "ChipMonster9dJa4nPqR7bZxWm2cVvT5yKoUuH8gFfLsSa",
  "CrumbArtist3zXw8mCvB1nKj6yTr4hGdPqEo0aU9lMnbVt",
  "DoughRaiser5cVn2kHf8sQw3xRz7yJm4tB6uG1eY0aLpOi",
];

let seq = 0;
export const nextDemoSig = (tag = "p") => `demo-${tag}-${Date.now()}-${seq++}`;

// Big cookie: filled circle with darker rim, chocolate chips, one bite taken.
function cookiePattern() {
  const px = [];
  const cx = 48,
    cy = 48,
    r = 19;
  const body = "c68a53",
    rim = "8a5a33",
    chip = "3b2314";
  const chips = [
    [-8, -6, 2.4],
    [7, -3, 2.0],
    [-2, 8, 2.2],
    [9, 9, 1.8],
    [-11, 5, 1.6],
    [3, -11, 1.7],
    [13, 2, 1.4],
    [-5, 13, 1.5],
  ];
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const ang = Math.atan2(-(y - cy), x - cx); // 0 = right, CCW
      // bite out of the upper-right (remove an off-center disc)
      const bd = Math.hypot(x - (cx + 13), y - (cy - 13));
      if (bd < 8.5) continue;
      let rgb = d > r - 1.4 ? rim : body;
      for (const [ox, oy, cr] of chips) {
        if (Math.hypot(x - (cx + ox), y - (cy + oy)) <= cr) rgb = chip;
      }
      px.push({ x, y, rgb });
    }
  }
  return px;
}

// A few loose pixels by "other artists" so the feed/leaderboard look alive.
function scattered(count = 46) {
  const out = [];
  let seed = 42;
  const rnd = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const cols = [
    "f0b050",
    "ffe1a8",
    "b33939",
    "2a9d8f",
    "ff70a6",
    "6a4c93",
    "ffffff",
  ];
  while (out.length < count) {
    const x = 8 + Math.floor(rnd() * 80),
      y = 6 + Math.floor(rnd() * 84);
    if (Math.hypot(x - 48, y - 48) < 26) continue; // keep clear of the cookie
    out.push({ x, y, rgb: cols[Math.floor(rnd() * cols.length)] });
  }
  return out;
}

// Build the scripted demo timeline (interleaved so the cookie "draws itself").
export function buildDemoTimeline() {
  const items = [];
  const now = Math.floor(Date.now() / 1000);
  // Timeline layout over a ~2h window so the time-lapse replay reads well:
  // loose pixels by "other artists" warm up the first stretch, then the cookie
  // draws itself row by row across the rest — a smooth scrub, not a burst.
  const loosePx = scattered();
  const loose = loosePx.map((p, i) => ({
    ...p,
    signer: DEMO_SIGNERS[1 + (i % 3)],
    blockTime: now - 7200 + Math.floor((i / loosePx.length) * 840), // first ~12%
  }));
  const cookiePx = cookiePattern();
  const cookie = cookiePx.map((p, i) => ({
    ...p,
    // the cookie "bakes" itself row by row across the remaining ~88%
    signer: DEMO_SIGNERS[0],
    blockTime: now - 6300 + Math.floor((i / cookiePx.length) * 6240),
  }));
  items.push(...loose, ...cookie);
  items.forEach((it, i) => {
    it.signature = nextDemoSig("t");
    it.demo = true;
    it.order = i;
  });
  return items;
}
