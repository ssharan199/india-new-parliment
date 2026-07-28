/**
 * Geometry helpers: the triangular plan, UV normalisation, and perimeter
 * frames used to march the colonnade around the building.
 */

import * as THREE from 'three';

/**
 * Rewrite the UVs of a 1-segment BoxGeometry so texel density matches the real
 * face size instead of stretching one tile over every face.
 */
export function boxUV(geo, w, h, d, s = 1) {
  const uv = geo.attributes.uv;
  const spans = [
    [d, h], [d, h],   // +x, -x
    [w, d], [w, d],   // +y, -y
    [w, h], [w, h],   // +z, -z
  ];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = spans[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * su * s, uv.getY(i) * sv * s);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Box with metre-scaled UVs. */
export function box(w, h, d, s = 1) {
  return boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, s);
}

/**
 * Scale a geometry's existing 0..1 UVs.
 *
 * House rule: **UVs are in metres everywhere.** Material `repeat` then means
 * "texture tiles per metre", so texel density stays constant no matter what
 * primitive a surface is built from. These helpers convert the usual suspects.
 */
export function scaleUV(geo, su, sv = su) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** Open cylinder / drum: u wraps the circumference, v climbs the height. */
export function cylUV(geo, radius, height) {
  return scaleUV(geo, 2 * Math.PI * radius, height);
}

/** Disc or annulus: UVs span the bounding square of the outer radius. */
export function discUV(geo, outerRadius) {
  return scaleUV(geo, outerRadius * 2, outerRadius * 2);
}

/**
 * The plan: an equilateral triangle whose corners are cut back and rounded —
 * the silhouette that reads from the air as three straight facades meeting in
 * soft, curved corners.
 *
 * @param {number} inradius distance from centre to the middle of a facade
 * @param {number} chamfer  how far back from each sharp corner the flat runs stop
 */
export function triShape(inradius, chamfer) {
  const R = inradius * 2;                  // circumradius of an equilateral triangle
  const verts = [0, 1, 2].map((j) => {
    const a = THREE.MathUtils.degToRad(30 + 120 * j);
    return new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R);
  });

  const pts = [];
  for (let j = 0; j < 3; j++) {
    const v0 = verts[j], v1 = verts[(j + 1) % 3];
    const dir = v1.clone().sub(v0).normalize();
    pts.push({
      a: v0.clone().addScaledVector(dir, chamfer),
      b: v1.clone().addScaledVector(dir, -chamfer),
      ctrl: v1,
    });
  }

  const shape = new THREE.Shape();
  shape.moveTo(pts[0].a.x, pts[0].a.y);
  for (let j = 0; j < 3; j++) {
    const seg = pts[j];
    const next = pts[(j + 1) % 3];
    shape.lineTo(seg.b.x, seg.b.y);
    shape.quadraticCurveTo(seg.ctrl.x, seg.ctrl.y, next.a.x, next.a.y);
  }
  shape.closePath();
  return shape;
}

/**
 * The three rounded corners of the plan, in shape space — the midpoint of each
 * corner's quadratic curve. The public entrances sit on these.
 */
export function triCorners(inradius, chamfer) {
  const R = inradius * 2;
  const verts = [0, 1, 2].map((j) => {
    const a = THREE.MathUtils.degToRad(30 + 120 * j);
    return new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R);
  });

  return [0, 1, 2].map((j) => {
    const v = verts[j];
    const prev = verts[(j + 2) % 3];
    const next = verts[(j + 1) % 3];
    // Where the straight runs stop on either side of this corner.
    const b = v.clone().addScaledVector(v.clone().sub(prev).normalize(), -chamfer);
    const a = v.clone().addScaledVector(next.clone().sub(v).normalize(), chamfer);
    // Quadratic bezier at t = 0.5.
    return b.clone().multiplyScalar(0.25)
      .addScaledVector(v, 0.5)
      .addScaledVector(a, 0.25);
  });
}

/** Shape-space (x,y) -> world (x, height, -y). Matches an ExtrudeGeometry rotated -90° about X. */
export function toWorld(p, y = 0) {
  return new THREE.Vector3(p.x, y, -p.y);
}

/**
 * Evenly spaced stations around a closed shape, each with an outward normal.
 * Used to place piers, jaali bays and roof brackets without hand-authoring
 * every position.
 */
export function perimeterFrames(shape, count) {
  const pts = shape.getSpacedPoints(count);   // count+1 points, last == first
  const frames = [];
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + count) % count];
    const next = pts[(i + 1) % count];
    const tan = next.clone().sub(prev).normalize();
    // CCW winding -> outward normal is the right-hand perpendicular.
    const nor = new THREE.Vector2(tan.y, -tan.x);
    frames.push({
      pos: p.clone(),
      tangent: tan,
      normal: nor,
      angle: Math.atan2(nor.y, nor.x),
      gap: next.distanceTo(prev) * 0.5,
    });
  }
  return frames;
}

/** Yaw (about world Y) that makes a mesh's +Z face point along a shape-space normal. */
export function yawFromNormal(n) {
  return Math.atan2(n.x, -n.y);
}

/** Extrude a closed shape (optionally with a hole) upward from y0 to y1. */
export function extrudeUp(shape, y0, y1, { holes = [], bevel = 0 } = {}) {
  const s = shape.clone();
  s.holes = holes;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: y1 - y0,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 24,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  return geo;
}

/** A lathe profile from [x,y] pairs. */
export function lathe(profile, segments = 64, uvScale = 1) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  return scaleUV(geo, uvScale * segments * 0.1, uvScale);
}

/**
 * A faceted petal shell — the roof form over each chamber. Alternating petals
 * are lifted slightly so the ribs catch a hard edge of sunlight.
 */
export function petalRoof(radius, height, petals = 12, rise = 0.14) {
  const pos = [];
  const uvs = [];

  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const a1 = ((i + 1) / petals) * Math.PI * 2;
    const lift = (i % 2 === 0 ? 1 : -1) * rise;

    // Sub-divide each petal along its length so the shell curves.
    const steps = 6;
    const rib = (a, t) => {
      const r = radius * (1 - t);
      const y = height * Math.pow(t, 0.72) + (1 - t) * t * 4 * lift * radius * 0.12;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    };

    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const p00 = rib(a0, t0), p10 = rib(a1, t0);
      const p01 = rib(a0, t1), p11 = rib(a1, t1);
      const quad = [p00, p10, p11, p00, p11, p01];
      for (const p of quad) pos.push(p.x, p.y, p.z);
      const uvq = [[0, t0], [1, t0], [1, t1], [0, t0], [1, t1], [0, t1]];
      for (const [u, v] of uvq) uvs.push(u, v * 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Concentric-arc helper: positions along an arc at a given radius. */
export function arcPoints(radius, a0, a1, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = a0 + (a1 - a0) * t;
    out.push({ a, x: Math.cos(a) * radius, z: Math.sin(a) * radius });
  }
  return out;
}
