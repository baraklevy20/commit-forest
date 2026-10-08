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
  "'": [2, 2, 0, 0, 0], '=': [0, 7, 0, 7, 0], '-': [0, 0, 7, 0, 0], '/': [1, 1, 2, 4, 4],
};
const W = 3, H = 5, GAP = 1, MARGIN = 4;
const INK = [246, 238, 216], EDGE = [24, 28, 24];
// a dark band behind each line, so busy scenery (synthwave's grid) never runs through the
// letters: this much of the scene still shows through, and it reaches this far round the text
const PLATE_SHOW = 0.35, PLATE_PAD = 2;

/* The line that says what the picture is, drawn at the top unless the label input is off. */
export function labelLine(login) {
  return `${login} ON GITHUB · ONE TREE PER DAY WITH A CONTRIBUTION`;
}

/* The year a period names ('2025', or this year's for 'this-year'), or null for the others. */
export function periodLabel(period, year) {
  return period === 'this-year' ? year : /^\d{4}$/.test(period) ? period : null;
}

/* The numbers line; `since` is the first year a whole history goes back to. */
export function statsLine(stats, period, year, since) {
  const n = x => x.toLocaleString('en-US');
  const parts = [`${n(stats.trees)} ${stats.trees === 1 ? 'TREE' : 'TREES'}`, `${n(stats.cards)} ${stats.cards === 1 ? 'CONTRIBUTION' : 'CONTRIBUTIONS'}`];
  const label = periodLabel(period, year);
  if (label) parts.unshift(label);
  // the same words as the calendar's heading, "288 contributions in the last year"
  else if (period === 'last-year') parts[parts.length - 1] += ' IN THE LAST YEAR';
  else if (period === 'all' && since) parts[parts.length - 1] += ` SINCE ${since}`;
  return parts.join(' · ');
}

/* Where a line of text goes in a w x h frame: its band (x, y, width, height), the pixels
 * of its letters, and the dark outline round them, as [x, y] pairs. */
export function textPixels(text, w, h, { top = false } = {}) {
  const glyphs = [...text.toUpperCase()].map(c => GLYPHS[c] || GLYPHS[' ']);
  const x0 = MARGIN, y0 = top ? MARGIN : h - MARGIN - H;
  const lit = new Set();
  glyphs.forEach((g, i) => g.forEach((row, y) => {
    for (let x = 0; x < W; x++) if (row & (1 << (W - 1 - x))) lit.add(`${x0 + i * (W + GAP) + x},${y0 + y}`);
  }));
  const ink = [...lit].map(p => p.split(',').map(Number)), edge = new Set();
  for (const [x, y] of ink) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!lit.has(`${x + dx},${y + dy}`)) edge.add(`${x + dx},${y + dy}`);
  const x1 = x0 + glyphs.length * (W + GAP) - GAP;
  const band = { x: x0 - PLATE_PAD, y: y0 - PLATE_PAD, w: x1 - x0 + 2 * PLATE_PAD, h: H + 2 * PLATE_PAD };
  return { band, ink, edge: [...edge].map(p => p.split(',').map(Number)) };
}

// the colours, for a page that draws the same lines itself
export const TEXT_COLOURS = { ink: INK, edge: EDGE, plateShow: PLATE_SHOW };

/* Draw `text` into an RGBA frame of w x h, at its bottom left (or top left), light with a
 * dark outline on a dark band. */
export function stamp(rgba, w, h, text, { top = false } = {}) {
  const { band, ink, edge } = textPixels(text, w, h, { top });
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  for (let y = band.y; y < band.y + band.h; y++) {
    for (let x = band.x; x < band.x + band.w; x++) {
      if (!inside(x, y)) continue;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(rgba[o + c] * PLATE_SHOW + EDGE[c] * (1 - PLATE_SHOW));
    }
  }
  const put = ([x, y], c) => {
    if (!inside(x, y)) return;
    const o = (y * w + x) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
  };
  edge.forEach(p => put(p, EDGE));
  ink.forEach(p => put(p, INK));
}
