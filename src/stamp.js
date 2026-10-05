// The numbers line ("2026 · 279 TREES · 1,234 CONTRIBUTIONS"), drawn into the frames in a
// 3 x 5 pixel face at the canvas's own resolution, so it is as blocky as the trees.

// each glyph is 5 rows of 3 bits, top row first
const GLYPHS = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ',': [0, 0, 0, 2, 4], '.': [0, 0, 0, 0, 2], '·': [0, 0, 2, 0, 0], ' ': [0, 0, 0, 0, 0],
};
const W = 3, H = 5, GAP = 1, MARGIN = 4;
const INK = [246, 238, 216], EDGE = [24, 28, 24];

export function statsLine(stats, period, year) {
  const n = x => x.toLocaleString('en-US');
  const parts = [`${n(stats.trees)} ${stats.trees === 1 ? 'TREE' : 'TREES'}`, `${n(stats.cards)} ${stats.cards === 1 ? 'CONTRIBUTION' : 'CONTRIBUTIONS'}`];
  if (period === 'this-year') parts.unshift(String(year));
  else if (/^\d{4}$/.test(period)) parts.unshift(period);
  return parts.join(' · ');
}

/* Draw `text` into an RGBA frame of w x h, at its bottom left, light with a dark outline. */
export function stamp(rgba, w, h, text) {
  const glyphs = [...text.toUpperCase()].map(c => GLYPHS[c] || GLYPHS[' ']);
  const x0 = MARGIN, y0 = h - MARGIN - H;
  const lit = new Set();
  glyphs.forEach((g, i) => g.forEach((row, y) => {
    for (let x = 0; x < W; x++) if (row & (1 << (W - 1 - x))) lit.add(`${x0 + i * (W + GAP) + x},${y0 + y}`);
  }));
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  };
  for (const p of lit) {
    const [x, y] = p.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!lit.has(`${x + dx},${y + dy}`)) put(x + dx, y + dy, EDGE);
  }
  for (const p of lit) { const [x, y] = p.split(',').map(Number); put(x, y, INK); }
}
