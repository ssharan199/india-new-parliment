/**
 * Seeded, tileable value noise.
 *
 * Every texture in this project is generated at runtime, so the noise has to be
 * (a) deterministic and (b) periodic — otherwise the seams show up the moment a
 * texture is repeated across a 200 m facade.
 */

export class Noise {
  constructor(seed = 1337) {
    let s = seed >>> 0 || 1;
    this.rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);

    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Hashed lattice value in [0,1]. */
  hash(x, y) {
    return this.perm[(this.perm[x & 255] + (y & 255)) & 255] / 255;
  }

  /** Value noise with independent wrap periods on each axis. */
  value(x, y, perX, perY) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const x0 = ((xi % perX) + perX) % perX;
    const x1 = (x0 + 1) % perX;
    const y0 = ((yi % perY) + perY) % perY;
    const y1 = (y0 + 1) % perY;

    const a = this.hash(x0, y0), b = this.hash(x1, y0);
    const c = this.hash(x0, y1), d = this.hash(x1, y1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /**
   * Fractal sum. `perX`/`perY` are the lattice periods of the *first* octave;
   * each following octave doubles them, so the whole stack tiles cleanly.
   */
  fbm(x, y, octaves = 5, perX = 4, perY = 4, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    let px = perX, py = perY;
    let sx = x, sy = y;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.value(sx, sy, px, py);
      norm += amp;
      amp *= gain;
      sx *= 2; sy *= 2;
      px *= 2; py *= 2;
    }
    return sum / norm;
  }

  /** Absolute-difference fbm — the sharp creases read as mineral veining. */
  turbulence(x, y, octaves = 5, perX = 4, perY = 4) {
    let sum = 0, amp = 1, norm = 0, px = perX, py = perY;
    let sx = x, sy = y;
    for (let i = 0; i < octaves; i++) {
      sum += amp * Math.abs(this.value(sx, sy, px, py) * 2 - 1);
      norm += amp;
      amp *= 0.5;
      sx *= 2; sy *= 2;
      px *= 2; py *= 2;
    }
    return sum / norm;
  }

  /** Ridged noise — good for bark and eroded stone. */
  ridged(x, y, octaves = 5, perX = 4, perY = 4) {
    return 1 - this.turbulence(x, y, octaves, perX, perY);
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** #rrggbb -> [r,g,b] in 0..255 */
export function hex2rgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Interpolate through an arbitrary list of hex stops. */
export function ramp(stops, t) {
  t = clamp01(t);
  const n = stops.length - 1;
  const f = t * n;
  const i = Math.min(n - 1, Math.floor(f));
  const k = f - i;
  const a = stops[i], b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}
