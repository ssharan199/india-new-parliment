/**
 * Procedural texture foundry.
 *
 * Nothing here is downloaded — every albedo / normal / roughness map is painted
 * into a canvas at load time. Each generator returns a full PBR set so the
 * facades react to the sun the way real Dholpur sandstone does: the bedding
 * planes catch light, the mortar joints stay in shadow, the polished marble
 * goes mirror-flat while the carpet stays dead matte.
 */

import * as THREE from 'three';
import { Noise, clamp01, hex2rgb, ramp } from './noise.js';

let MAX_ANISO = 8;
export function setRenderer(renderer) {
  MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
}

/** Thumbnails for the in-app texture inspector. */
export const gallery = [];
function show(name, canvas) {
  gallery.push({ name, canvas });
  return canvas;
}

export function newCanvas(size, h) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h || size;
  return c;
}

export function texture(canvas, { srgb = false, repeat = 1, wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = wrap;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]);
  else t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Height -> normal (Sobel, wrapped so tiling stays seamless)
// ---------------------------------------------------------------------------

export function normalFromHeight(heightCanvas, strength = 2.0) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = newCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;

      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Bundle a raw {color,height,rough} triple into three.js textures. */
function pack(name, maps, { repeat = 1, normalStrength = 2.0, inspect = true } = {}) {
  const normalCanvas = normalFromHeight(maps.height, normalStrength);
  if (inspect) {
    show(name, maps.color);
    show(name + ' · normal', normalCanvas);
    show(name + ' · roughness', maps.rough);
  }
  return {
    map: texture(maps.color, { srgb: true, repeat }),
    normalMap: texture(normalCanvas, { repeat }),
    roughnessMap: texture(maps.rough, { repeat }),
    canvases: { ...maps, normal: normalCanvas },
  };
}

// ---------------------------------------------------------------------------
// Stone — the workhorse. Sandstone, granite paving, marble all come from here.
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {string[]} o.colors      light -> dark ramp stops
 * @param {number}   o.bedding     strength of the horizontal sedimentary banding
 * @param {object}   o.blocks      {cols, rows, joint, bond} ashlar coursing
 */
export function stoneMaps({
  size = 1024,
  seed = 7,
  colors = ['#e8d8b6', '#cdb488', '#a58a5e'],
  bedding = 0.55,
  grain = 0.28,
  blocks = null,
  roughBase = 0.74,
  roughVar = 0.2,
  weather = 0.0,
} = {}) {
  const n = new Noise(seed);
  const stops = colors.map(hex2rgb);

  const color = newCanvas(size);
  const height = newCanvas(size);
  const rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Body of the stone: broad cloudy variation.
      const body = n.fbm(u * 6, v * 6, 6, 6, 6);
      // Bedding planes: stretched hard along X, tight along Y.
      const beds = n.fbm(u * 2, v * 26, 4, 2, 26);
      // Quartz speckle at texel scale.
      const speck = n.hash(x * 3 + 11, y * 3 + 7);

      let t = clamp01(body * (1 - bedding) + beds * bedding);
      t = clamp01(t + (speck - 0.5) * grain);

      let hgt = t;
      let rgh = roughBase + roughVar * (1 - t) + (speck - 0.5) * 0.08;
      let shade = 1.0;

      // Ashlar coursing with a running bond.
      if (blocks) {
        const { cols, rows, joint = 0.012, bond = 0.5 } = blocks;
        const row = Math.floor(v * rows);
        const uu = (u * cols + (row % 2) * bond) % 1;
        const vv = (v * rows) % 1;
        const col = Math.floor(u * cols + (row % 2) * bond);

        const du = Math.min(uu, 1 - uu) / cols;
        const dv = Math.min(vv, 1 - vv) / rows;
        const dj = Math.min(du, dv);

        // Per-block tone drift — no two quarried blocks match.
        const tone = (n.hash(col * 17 + 3, row * 29 + 5) - 0.5) * 0.1;
        t = clamp01(t + tone);
        hgt = clamp01(hgt + tone * 0.5);

        if (dj < joint) {
          // Dry-laid ashlar: the joint is a fine shadow line, not a mortar band.
          const k = 1 - dj / joint;             // 0 at edge of joint, 1 at centre
          shade = 1 - 0.30 * k * k;
          hgt = clamp01(hgt - 0.62 * k * k);
          rgh += 0.14 * k;
        } else if (dj < joint * 2.2) {
          // Arris: the chamfered lip of the block catches a highlight.
          hgt = clamp01(hgt + 0.06);
        }
      }

      // Rain-washing streaks down the face.
      if (weather > 0) {
        const streak = n.fbm(u * 14, v * 1.5, 4, 14, 2);
        const w = clamp01((streak - 0.45) * 3) * weather;
        shade *= 1 - w * 0.22;
        rgh += w * 0.12;
      }

      const [r, g, b] = ramp(stops, 1 - t);
      const i = (y * size + x) * 4;
      cc.data[i] = r * shade;
      cc.data[i + 1] = g * shade;
      cc.data[i + 2] = b * shade;
      cc.data[i + 3] = 255;

      const hv = hgt * 255;
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = hv;
      hc.data[i + 3] = 255;

      const rv = clamp01(rgh) * 255;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = rv;
      rc.data[i + 3] = 255;
    }
  }

  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Marble — Makrana white with grey/gold veining, near-mirror polish
// ---------------------------------------------------------------------------

export function marbleMaps({ size = 1024, seed = 21, vein = '#8e8b84', warm = '#c7a878', base = '#f2efe6' } = {}) {
  const n = new Noise(seed);
  const [br, bg, bb] = hex2rgb(base);
  const [vr, vg, vb] = hex2rgb(vein);
  const [wr, wg, wb] = hex2rgb(warm);

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Domain-warp a sine field: classic marble veining.
      const w1 = n.turbulence(u * 4, v * 4, 6, 4, 4);
      const w2 = n.fbm(u * 2, v * 2, 4, 2, 2);
      const s = Math.sin((u * 3 + v * 1.7 + w1 * 2.6 + w2 * 0.8) * Math.PI * 2);
      const veinAmt = Math.pow(clamp01(1 - Math.abs(s)), 12);
      const hair = Math.pow(clamp01(1 - Math.abs(Math.sin((v * 9 + w1 * 5) * Math.PI * 2))), 26) * 0.5;
      const gold = Math.pow(clamp01(1 - Math.abs(Math.sin((u * 5 - v * 2 + w1 * 4) * Math.PI * 2))), 30) * 0.6;

      const dirt = (n.fbm(u * 8, v * 8, 4, 8, 8) - 0.5) * 10;

      let r = br + dirt, g = bg + dirt, b = bb + dirt;
      const k = clamp01(veinAmt + hair);
      r = r + (vr - r) * k; g = g + (vg - g) * k; b = b + (vb - b) * k;
      r = r + (wr - r) * gold; g = g + (wg - g) * gold; b = b + (wb - b) * gold;

      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;

      // Polished slab: relief is almost nil, just enough to break the reflection.
      const hgt = 0.5 + (0.5 - k) * 0.08 + dirt / 255;
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = clamp01(hgt) * 255;
      hc.data[i + 3] = 255;

      // Veins are softer minerals — they polish slightly duller than the field.
      const rgh = 0.05 + k * 0.16 + clamp01(n.fbm(u * 20, v * 20, 3, 20, 20)) * 0.04;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = clamp01(rgh) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Carpet — Lok Sabha green, Rajya Sabha red. Deep pile, zero specular.
// ---------------------------------------------------------------------------

export function carpetMaps({ size = 768, seed = 33, base = '#1d6b3a', dark = '#12472a', light = '#2f8a4d', motif = '#c9a227' } = {}) {
  const n = new Noise(seed);
  const stops = [hex2rgb(light), hex2rgb(base), hex2rgb(dark)];
  const [mr, mg, mb] = hex2rgb(motif);

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Pile: high-frequency fibre noise + a woven weft/warp beat.
      const fibre = n.hash(x * 2 + 5, y * 2 + 13);
      const tuft = n.fbm(u * 40, v * 40, 3, 40, 40);
      const weave = (Math.sin(u * size * 0.55) * Math.sin(v * size * 0.55)) * 0.5 + 0.5;
      const cloud = n.fbm(u * 5, v * 5, 4, 5, 5);

      let t = clamp01(cloud * 0.45 + tuft * 0.35 + fibre * 0.2);

      // Sparse woven diamond motif, the way chamber carpets are patterned.
      const dx = Math.abs(((u * 6) % 1) - 0.5), dy = Math.abs(((v * 6) % 1) - 0.5);
      const diamond = clamp01(1 - Math.abs(dx + dy - 0.34) * 22) * 0.55;

      let [r, g, b] = ramp(stops, t);
      r += (mr - r) * diamond * 0.5;
      g += (mg - g) * diamond * 0.5;
      b += (mb - b) * diamond * 0.5;

      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;

      const hgt = clamp01(t * 0.55 + weave * 0.25 + fibre * 0.35);
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = hgt * 255;
      hc.data[i + 3] = 255;

      const rgh = 0.9 + fibre * 0.1;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = clamp01(rgh) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Teak — desks, panelling, chamber joinery
// ---------------------------------------------------------------------------

export function woodMaps({ size = 768, seed = 51, light = '#a9743f', mid = '#7d4c22', dark = '#4a2a12' } = {}) {
  const n = new Noise(seed);
  const stops = [hex2rgb(light), hex2rgb(mid), hex2rgb(dark)];

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Warp the ring field so the grain wanders like a real quarter-sawn board.
      const warp = n.fbm(u * 3, v * 10, 4, 3, 10);
      const rings = Math.abs(Math.sin((v * 14 + warp * 3.2) * Math.PI));
      const grain = n.fbm(u * 60, v * 8, 3, 60, 8);
      const pore = n.hash(x + 3, y * 5 + 1);

      let t = clamp01(Math.pow(rings, 0.6) * 0.7 + grain * 0.25 + pore * 0.05);

      const [r, g, b] = ramp(stops, t);
      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;

      // Open pores sit below the lacquer surface.
      const hgt = clamp01(1 - t * 0.5 - (pore > 0.86 ? 0.35 : 0));
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = hgt * 255;
      hc.data[i + 3] = 255;

      const rgh = 0.24 + t * 0.22 + (pore > 0.86 ? 0.25 : 0);
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = clamp01(rgh) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Metal — bronze doors, the emblem, standing-seam roof sheet
// ---------------------------------------------------------------------------

export function metalMaps({ size = 512, seed = 71, base = '#8c6a34', patina = '#4b6b5a', seams = 0, polish = 0.3 } = {}) {
  const n = new Noise(seed);
  const [br, bg, bb] = hex2rgb(base);
  const [pr, pg, pb] = hex2rgb(patina);

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      const blotch = n.fbm(u * 5, v * 5, 5, 5, 5);
      const fine = n.fbm(u * 30, v * 30, 3, 30, 30);
      const brushed = n.hash(x * 7, y);          // anisotropic scratch feel

      const ox = clamp01((blotch - 0.42) * 2.4);  // oxidation mask
      let r = br + (pr - br) * ox;
      let g = bg + (pg - bg) * ox;
      let b = bb + (pb - bb) * ox;

      const lift = (fine - 0.5) * 26 + (brushed - 0.5) * 12;
      r += lift; g += lift; b += lift;

      let hgt = 0.5 + (fine - 0.5) * 0.3;
      let rgh = polish + ox * 0.45 + fine * 0.12;

      // Standing seams for the roof sheet.
      if (seams > 0) {
        const s = Math.abs(((u * seams) % 1) - 0.5);
        if (s > 0.46) { hgt = 0.95; rgh += 0.05; r *= 1.06; g *= 1.06; b *= 1.06; }
        else if (s > 0.43) { hgt = 0.2; }
      }

      const i = (y * size + x) * 4;
      cc.data[i] = clamp01(r / 255) * 255;
      cc.data[i + 1] = clamp01(g / 255) * 255;
      cc.data[i + 2] = clamp01(b / 255) * 255;
      cc.data[i + 3] = 255;

      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = clamp01(hgt) * 255;
      hc.data[i + 3] = 255;

      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = clamp01(rgh) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Ground cover
// ---------------------------------------------------------------------------

export function grassMaps({ size = 1024, seed = 91 } = {}) {
  const n = new Noise(seed);
  const stops = [hex2rgb('#79924a'), hex2rgb('#4c6d2f'), hex2rgb('#2c471c')];

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const patch = n.fbm(u * 4, v * 4, 5, 4, 4);
      const blade = n.hash(x * 5 + 2, y * 5 + 9);
      const clump = n.fbm(u * 24, v * 24, 3, 24, 24);
      const mow = Math.sin(v * 24 * Math.PI) * 0.5 + 0.5;    // mower stripes

      const t = clamp01(patch * 0.4 + clump * 0.35 + blade * 0.25 + mow * 0.08);
      const [r, g, b] = ramp(stops, 1 - t);

      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = clamp01(t * 0.6 + blade * 0.4) * 255;
      hc.data[i + 3] = 255;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = (0.86 + blade * 0.12) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

export function barkMaps({ size = 512, seed = 111 } = {}) {
  const n = new Noise(seed);
  const stops = [hex2rgb('#8b7a63'), hex2rgb('#5d4c39'), hex2rgb('#2e241a')];

  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fissure = n.ridged(u * 8, v * 2, 5, 8, 2);
      const detail = n.fbm(u * 26, v * 8, 4, 26, 8);
      const t = clamp01(Math.pow(fissure, 2.2) * 0.75 + detail * 0.25);
      const [r, g, b] = ramp(stops, 1 - t);
      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = t * 255; hc.data[i + 3] = 255;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = (0.82 + (1 - t) * 0.15) * 255;
      rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

export function foliageMaps({ size = 512, seed = 131, tint = ['#8fb457', '#3f6b2a', '#1d3315'] } = {}) {
  const n = new Noise(seed);
  const stops = tint.map(hex2rgb);
  const color = newCanvas(size), height = newCanvas(size), rough = newCanvas(size);
  const cc = color.getContext('2d').createImageData(size, size);
  const hc = height.getContext('2d').createImageData(size, size);
  const rc = rough.getContext('2d').createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const leaf = n.fbm(u * 18, v * 18, 4, 18, 18);
      const cluster = n.fbm(u * 5, v * 5, 4, 5, 5);
      const t = clamp01(cluster * 0.45 + leaf * 0.55);
      const [r, g, b] = ramp(stops, 1 - Math.pow(t, 1.4));
      const i = (y * size + x) * 4;
      cc.data[i] = r; cc.data[i + 1] = g; cc.data[i + 2] = b; cc.data[i + 3] = 255;
      hc.data[i] = hc.data[i + 1] = hc.data[i + 2] = t * 255; hc.data[i + 3] = 255;
      rc.data[i] = rc.data[i + 1] = rc.data[i + 2] = (0.72 + t * 0.2) * 255; rc.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cc, 0, 0);
  height.getContext('2d').putImageData(hc, 0, 0);
  rough.getContext('2d').putImageData(rc, 0, 0);
  return { color, height, rough };
}

// ---------------------------------------------------------------------------
// Jaali — the pierced stone screen. Painted with 2D canvas ops, used as an
// alpha map so it casts a real perforated shadow.
// ---------------------------------------------------------------------------

function ngon(ctx, cx, cy, r, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function jaaliAlpha({ size = 512, cells = 4, style = 'star' } = {}) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';

  const s = size / cells;
  for (let gy = -1; gy <= cells; gy++) {
    for (let gx = -1; gx <= cells; gx++) {
      const cx = (gx + 0.5) * s, cy = (gy + 0.5) * s;
      if (style === 'star') {
        // Octagonal void ringed by four small diamonds — a Mughal jaali grid.
        ngon(ctx, cx, cy, s * 0.315, 8, Math.PI / 8);
        ctx.fill();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          ngon(ctx, cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5, s * 0.15, 4, 0);
          ctx.fill();
        }
      } else if (style === 'lattice') {
        ngon(ctx, cx, cy, s * 0.4, 4, Math.PI / 4);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  show('jaali screen · alpha', c);
  return c;
}

// ---------------------------------------------------------------------------
// Ceiling motifs — peacock (Lok Sabha) and lotus (Rajya Sabha)
// ---------------------------------------------------------------------------

export function peacockCeiling({ size = 1024 } = {}) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const R = size / 2;

  const bg = ctx.createRadialGradient(R, R, R * 0.05, R, R, R);
  bg.addColorStop(0, '#f4e6c4');
  bg.addColorStop(0.55, '#e2cf9f');
  bg.addColorStop(1, '#b99a5d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Concentric feather fans, three rings, each denser than the last.
  const rings = [
    { r: R * 0.34, n: 12, len: R * 0.16 },
    { r: R * 0.58, n: 20, len: R * 0.2 },
    { r: R * 0.84, n: 30, len: R * 0.22 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2;
      const x = R + Math.cos(a) * ring.r, y = R + Math.sin(a) * ring.r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);

      // Feather barbs
      ctx.strokeStyle = 'rgba(20,90,86,0.45)';
      ctx.lineWidth = Math.max(1, size / 700);
      for (let k = -5; k <= 5; k++) {
        ctx.beginPath();
        ctx.moveTo(0, ring.len * 0.55);
        ctx.quadraticCurveTo(k * ring.len * 0.06, 0, k * ring.len * 0.16, -ring.len * 0.5);
        ctx.stroke();
      }
      // The eye
      const eye = [
        ['#0d3b47', ring.len * 0.26],
        ['#12756b', ring.len * 0.2],
        ['#2fa3a0', ring.len * 0.14],
        ['#c9a227', ring.len * 0.085],
        ['#2b1a52', ring.len * 0.04],
      ];
      for (const [col, rr] of eye) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr * 0.8, rr, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Central medallion
  ctx.fillStyle = '#0d3b47';
  ctx.beginPath(); ctx.arc(R, R, R * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.beginPath(); ctx.arc(R, R, R * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(201,162,39,0.85)';
  ctx.lineWidth = size / 220;
  for (const rr of [0.2, 0.46, 0.71, 0.96]) {
    ctx.beginPath(); ctx.arc(R, R, R * rr, 0, Math.PI * 2); ctx.stroke();
  }

  show('Lok Sabha ceiling · peacock', c);
  return c;
}

export function lotusCeiling({ size = 1024 } = {}) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const R = size / 2;

  const bg = ctx.createRadialGradient(R, R, R * 0.05, R, R, R);
  bg.addColorStop(0, '#f6ece0');
  bg.addColorStop(0.6, '#e6cfc2');
  bg.addColorStop(1, '#b3776b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const petal = (cx, cy, rot, len, wid, fill, stroke) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(wid, len * 0.55, 0, len);
    ctx.quadraticCurveTo(-wid, len * 0.55, 0, 0);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, size / 600);
    ctx.stroke();
    ctx.restore();
  };

  const rings = [
    { n: 24, r0: R * 0.62, len: R * 0.36, wid: R * 0.075, fill: 'rgba(200,120,110,0.55)' },
    { n: 18, r0: R * 0.4, len: R * 0.3, wid: R * 0.08, fill: 'rgba(226,166,150,0.7)' },
    { n: 12, r0: R * 0.2, len: R * 0.24, wid: R * 0.075, fill: 'rgba(243,214,196,0.85)' },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2;
      petal(R + Math.cos(a) * ring.r0, R + Math.sin(a) * ring.r0, a - Math.PI / 2 + Math.PI, ring.len, ring.wid, ring.fill, 'rgba(150,60,50,0.5)');
    }
  }

  ctx.fillStyle = '#c9a227';
  ctx.beginPath(); ctx.arc(R, R, R * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8c3b2f';
  ctx.beginPath(); ctx.arc(R, R, R * 0.06, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(201,162,39,0.8)';
  ctx.lineWidth = size / 230;
  for (const rr of [0.18, 0.5, 0.78, 0.98]) {
    ctx.beginPath(); ctx.arc(R, R, R * rr, 0, Math.PI * 2); ctx.stroke();
  }

  show('Rajya Sabha ceiling · lotus', c);
  return c;
}

/** Subtle relief for the coffered ceiling panels, shared by both chambers. */
export function coffer({ size = 512, rings = 6, spokes = 24 } = {}) {
  const c = newCanvas(size);
  const ctx = c.getContext('2d');
  const R = size / 2;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = size / 90;
  for (let i = 1; i <= rings; i++) {
    ctx.beginPath(); ctx.arc(R, R, (R * i) / rings, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R);
    ctx.stroke();
  }
  return c;
}

// ---------------------------------------------------------------------------
// Public library — everything the scene needs, built once.
// ---------------------------------------------------------------------------

export const LIB = {};

const STEPS = [
  ['Dholpur beige sandstone', () => {
    LIB.sandstone = pack('Dholpur beige sandstone', stoneMaps({
      size: 1024, seed: 7,
      colors: ['#e3cda2', '#c9ad7c', '#a3845a'],
      bedding: 0.44, grain: 0.2, weather: 0.62,
      blocks: { cols: 4, rows: 12, joint: 0.008 },
    }), { repeat: 1, normalStrength: 2.6 });
  }],
  ['Bansi Paharpur red sandstone', () => {
    LIB.redstone = pack('Bansi Paharpur red sandstone', stoneMaps({
      size: 1024, seed: 19,
      colors: ['#c2775a', '#a1523c', '#6f3627'],
      bedding: 0.42, grain: 0.22, weather: 0.35,
      blocks: { cols: 5, rows: 14, joint: 0.009 },
    }), { repeat: 1, normalStrength: 2.4 });
  }],
  ['carved plinth stone', () => {
    LIB.plinth = pack('carved plinth stone', stoneMaps({
      size: 512, seed: 23,
      colors: ['#b5765c', '#8e4a37', '#5c2e21'],
      bedding: 0.3, grain: 0.18, weather: 0.6,
      blocks: { cols: 6, rows: 3, joint: 0.02, bond: 0.0 },
    }), { repeat: 1, normalStrength: 3.4 });
  }],
  ['Makrana marble', () => {
    LIB.marble = pack('Makrana marble', marbleMaps({ size: 1024 }), { repeat: 1, normalStrength: 0.8 });
  }],
  ['granite plaza paving', () => {
    LIB.paving = pack('granite plaza paving', stoneMaps({
      size: 1024, seed: 41,
      colors: ['#b8b2a8', '#948d84', '#6c6660'],
      bedding: 0.2, grain: 0.4, weather: 0.3,
      blocks: { cols: 4, rows: 4, joint: 0.012, bond: 0.5 },
    }), { repeat: 1, normalStrength: 2.0 });
  }],
  ['Lok Sabha green carpet', () => {
    LIB.carpetGreen = pack('Lok Sabha green carpet', carpetMaps({
      base: '#12512a', dark: '#08301a', light: '#1e6d38', motif: '#b8931f',
    }), { repeat: 1, normalStrength: 3.0 });
  }],
  ['Rajya Sabha red carpet', () => {
    LIB.carpetRed = pack('Rajya Sabha red carpet', carpetMaps({
      seed: 34, base: '#6f1717', dark: '#420d0d', light: '#8d2626', motif: '#c39a2c',
    }), { repeat: 1, normalStrength: 3.0 });
  }],
  ['teak joinery', () => {
    LIB.wood = pack('teak joinery', woodMaps({}), { repeat: 1, normalStrength: 1.6 });
  }],
  ['cast bronze', () => {
    LIB.bronze = pack('cast bronze', metalMaps({ base: '#9c7434', patina: '#5c5535', polish: 0.26 }), { repeat: 1, normalStrength: 1.4 });
  }],
  ['standing-seam roof sheet', () => {
    LIB.roofSheet = pack('standing-seam roof sheet', metalMaps({
      size: 512, seed: 77, base: '#d8d5cd', patina: '#a9a79e', polish: 0.34, seams: 8,
    }), { repeat: 1, normalStrength: 2.2 });
  }],
  ['lawn', () => {
    LIB.grass = pack('lawn', grassMaps({}), { repeat: 1, normalStrength: 1.2 });
  }],
  ['tree bark', () => {
    LIB.bark = pack('tree bark', barkMaps({}), { repeat: 1, normalStrength: 3.0 });
  }],
  ['canopy foliage', () => {
    LIB.foliage = pack('canopy foliage', foliageMaps({}), { repeat: 1, normalStrength: 1.5 });
  }],
  ['screens & motifs', () => {
    LIB.jaaliStar = texture(jaaliAlpha({ cells: 4, style: 'star' }), { repeat: 1 });
    LIB.jaaliLattice = texture(jaaliAlpha({ cells: 5, style: 'lattice' }), { repeat: 1 });
    LIB.peacock = texture(peacockCeiling({}), { srgb: true, wrap: THREE.ClampToEdgeWrapping });
    LIB.lotus = texture(lotusCeiling({}), { srgb: true, wrap: THREE.ClampToEdgeWrapping });
    LIB.cofferNormal = texture(normalFromHeight(coffer({}), 1.2), { wrap: THREE.ClampToEdgeWrapping });
  }],
];

/** Build every texture, yielding to the browser so the loader can animate. */
export async function buildAll(onProgress) {
  for (let i = 0; i < STEPS.length; i++) {
    const [label, fn] = STEPS[i];
    onProgress?.(i / STEPS.length, label);
    await new Promise((r) => requestAnimationFrame(() => r()));
    fn();
  }
  onProgress?.(1, 'assembling');
  await new Promise((r) => requestAnimationFrame(() => r()));
}

/** Clone a PBR set with independent repeats (textures are shared otherwise). */
export function tiled(set, ru, rv = ru) {
  const out = {};
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    if (!set[k]) continue;
    const t = set[k].clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(ru, rv);
    t.anisotropy = MAX_ANISO;
    out[k] = t;
  }
  return out;
}
