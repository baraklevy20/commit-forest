// Frames -> image files. Frames are worked on at the canvas's own size (388 x 194) and each
// canvas pixel becomes a SCALE x SCALE block only when encoded, with no smoothing.

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

/* The canvas's frames (PNG data URLs) as pixels, with the numbers line drawn in (text), if any. */
export function prepare(shots, text) {
  return shots.map(s => {
    const f = decode(s);
    if (text) stamp(f.rgba, f.w, f.h, text);
    return f;
  });
}

// a 4 x 4 ordered-dither matrix: the order the pixels change in during a dissolve
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* `steps` frames dissolving from frame a into frame b in an ordered dither, pixel art's own
 * way of fading: each frame turns one more share of the pixels over, in a fixed pattern. */
export function dissolve(a, b, steps) {
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const cut = (i / (steps + 1)) * 16, rgba = new Uint8Array(a.rgba);
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        if (BAYER[(y % 4) * 4 + (x % 4)] >= cut) continue;
        const o = (y * a.w + x) * 4;
        rgba.set(b.rgba.subarray(o, o + 4), o);
      }
    }
    out.push({ w: a.w, h: a.h, rgba });
  }
  return out;
}

/* An animated PNG: every colour kept, looping for ever. */
export function apng(frames, fps, k) {
  const f = frames.map(x => upscale(x, k));
  return Buffer.from(UPNG.encode(f.map(x => x.rgba.buffer), f[0].w, f[0].h, 0, f.map(() => Math.round(1000 / fps))));
}

/* The first frame, still. */
export function png(frames, k) {
  const f = upscale(frames[0], k);
  return Buffer.from(UPNG.encode([f.rgba.buffer], f.w, f.h, 0));
}

/* A GIF with one palette for the whole loop (so colours don't flicker between frames), no dithering. */
export function gif(frames, fps, k) {
  const f = frames.map(x => upscale(x, k));
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
