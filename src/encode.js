// Frames -> image files. Each canvas pixel becomes a SCALE x SCALE block, with no smoothing.

import UPNG from 'upng-js';
import gifenc from 'gifenc';
import { stamp } from './stamp.js';

const { GIFEncoder, quantize, applyPalette } = gifenc;

function decode(dataUrl) {
  const png = UPNG.decode(Buffer.from(dataUrl.split(',', 2)[1], 'base64'));
  return { w: png.width, h: png.height, rgba: new Uint8Array(UPNG.toRGBA8(png)[0]) };
}

function upscale({ w, h, rgba }, k) {
  const out = new Uint8Array(w * k * h * k * 4), row = w * k * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4);
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) out.set(p, (y * k + dy) * row + (x * k + dx) * 4);
    }
  }
  return { w: w * k, h: h * k, rgba: out };
}

// text: the numbers line to draw into each frame, or none
const frames = (shots, k, text) => shots.map(s => {
  const f = decode(s);
  if (text) stamp(f.rgba, f.w, f.h, text);
  return upscale(f, k);
});

/* An animated PNG: every colour kept, looping for ever. */
export function apng(shots, fps, k, text) {
  const f = frames(shots, k, text);
  return Buffer.from(UPNG.encode(f.map(x => x.rgba.buffer), f[0].w, f[0].h, 0, f.map(() => Math.round(1000 / fps))));
}

/* The first frame, still. */
export function png(shots, k, text) {
  const [f] = frames(shots.slice(0, 1), k, text);
  return Buffer.from(UPNG.encode([f.rgba.buffer], f.w, f.h, 0));
}

/* A GIF with one palette for the whole loop (so colours don't flicker between frames), no dithering. */
export function gif(shots, fps, k, text) {
  const f = frames(shots, k, text);
  // the palette from every frame's pixels, sampled so a long loop stays quick
  const step = Math.max(1, Math.floor(f.length / 8)), sample = [];
  for (let i = 0; i < f.length; i += step) sample.push(f[i].rgba);
  const all = new Uint8Array(sample.reduce((a, s) => a + s.length, 0));
  sample.reduce((o, s) => (all.set(s, o), o + s.length), 0);
  const palette = quantize(all, 256);
  const enc = GIFEncoder();
  for (const x of f) enc.writeFrame(applyPalette(x.rgba, palette), x.w, x.h, { palette, delay: Math.round(1000 / fps), repeat: 0 });
  enc.finish();
  return Buffer.from(enc.bytes());
}
