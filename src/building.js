/**
 * The building: triangular perimeter block, deep-pier colonnade with jaali
 * infill, three chamber drums under petal roofs, the central banyan court and
 * the National Emblem mast.
 *
 * Everything is tagged with userData.layer — `shell`, `roof`, `ceiling` or
 * `interior` — so the cutaway view can strip the outer roofs in one traversal
 * while leaving the motif ceilings in place.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT } from './materials.js';
import {
  box, scaleUV, cylUV, discUV, triShape, triCorners, toWorld, perimeterFrames,
  yawFromNormal, extrudeUp, arcPoints,
} from './geom.js';

export const P = {
  inradius: 58,        // centre -> middle of a facade
  chamfer: 26,         // how far back the corners are cut
  depth: 12,           // thickness of the perimeter office block. Thinner than
                       // it looks right in section, but the aerials show the
                       // ring as a narrow band and the roof features filling
                       // almost the whole interior.
  plinthTop: 3.4,      // podium top — this is the interior floor level
  redBase: 9.5,        // top of the red sandstone base band
  wallTop: 26.4,       // the roof is FLAT at this level, all the way across
  parapetTop: 30.2,
  innerRoof: 26.4,
  courtR: 19,          // hexagonal banyan court, sitting in the third bay
  chamberDist: 25.2,
  chamberR: 17,
  bays: 108,
};

/** Everything indoors sits on top of the podium, not on grade. */
export const FLOOR = P.plinthTop;

const DEG = THREE.MathUtils.degToRad;
/** The three facade axes, in shape space. 90° faces the main (south) approach. */
export const AXES = [90, 210, 330].map(DEG);

/**
 * The six dwars. Three ceremonial gates sit at the middle of each facade; three
 * public entrances sit on the rounded corners. Each is named for a real or
 * mythological creature from Indian folklore.
 *
 * Sides are the real building's; this model's triangle is oriented to its own
 * facade axes, so treat them as which-door-is-which rather than true compass
 * bearings.
 */
export const DOORS = [
  { key: 'gaja', name: 'Gaja Dwar', creature: 'Elephant', side: 'North', kind: 'ceremonial', axisIndex: 0,
    meaning: 'Intellect, memory, wealth and wisdom.' },
  { key: 'ashwa', name: 'Ashwa Dwar', creature: 'Horse', side: 'South', kind: 'ceremonial', axisIndex: 1,
    meaning: 'Power, strength and courage.' },
  { key: 'garuda', name: 'Garuda Dwar', creature: 'Garuda, king of birds', side: 'East', kind: 'ceremonial', axisIndex: 2,
    meaning: 'The mount of Vishnu — power and dharma.' },
  { key: 'makara', name: 'Makara Dwar', creature: 'Makara, part-mammal part-fish', side: 'West', kind: 'public', cornerIndex: 0,
    meaning: 'Unity in diversity and peaceful coexistence.' },
  { key: 'shardula', name: 'Shardula Dwar', creature: 'Shardula, lion-tiger hybrid', side: 'South-east', kind: 'public', cornerIndex: 1,
    meaning: 'The power of the people.' },
  { key: 'hamsa', name: 'Hamsa Dwar', creature: 'Hamsa, the swan', side: 'North-east', kind: 'public', cornerIndex: 2,
    meaning: 'Self-realisation and moksha.' },
];

/**
 * Only two chamber volumes. The third bay of the triangle is the open banyan
 * court, which is what the aerial photographs show — a hexagonal green void
 * where a third drum would otherwise sit.
 */
export const CHAMBERS = [
  { name: 'Lok Sabha', axis: AXES[0], carpet: 'carpetGreen', cushion: 'cushionGreen', ceiling: 'ceilingPeacock' },
  { name: 'Rajya Sabha', axis: AXES[2], carpet: 'carpetRed', cushion: 'cushionRed', ceiling: 'ceilingLotus' },
];

let uid = 0;
function add(parent, geo, mat, layer, name) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.layer = layer;
  m.name = name || `part_${uid++}`;
  parent.add(m);
  return m;
}

/** World position of a chamber centre. */
export function chamberPos(axis, dist = P.chamberDist) {
  return new THREE.Vector3(Math.cos(axis) * dist, 0, -Math.sin(axis) * dist);
}

/** Yaw that makes a group's local +Z point outward along a facade axis. */
function faceOutward(axis) {
  return axis + Math.PI / 2;
}

/**
 * The banyan court occupies the third bay — the one without a debating chamber
 * — not the middle of the plan. Seen from above it is a hexagonal green void
 * off to one side, with the emblem podium alone at the centre.
 */
export const COURT_CENTRE = chamberPos(AXES[1], 24);

// ---------------------------------------------------------------------------

export function buildParliament() {
  const root = new THREE.Group();
  root.name = 'SansadBhavan';

  const outer = triShape(P.inradius, P.chamfer);
  const inner = triShape(P.inradius - P.depth, P.chamfer * 0.78);
  const plinthShape = triShape(P.inradius + 3.2, P.chamfer + 2.4);
  const corniceShape = triShape(P.inradius + 2.2, P.chamfer + 1.6);
  const parapetOuter = triShape(P.inradius + 1.0, P.chamfer + 0.6);
  const parapetInner = triShape(P.inradius - 1.4, P.chamfer * 0.98);

  // -- Plinth: a heavy carved base the whole mass sits on ---------------------
  add(root, extrudeUp(plinthShape, 0, 2.4), MAT.plinth, 'shell', 'plinth');
  add(root, extrudeUp(triShape(P.inradius + 1.6, P.chamfer + 1.2), 2.4, P.plinthTop),
    MAT.cornice, 'shell', 'plinthCap');

  // -- Main block: solid ring, its top cap becomes the roof deck --------------
  const ring = extrudeUp(outer, P.plinthTop, P.wallTop, { holes: [inner] });
  add(root, ring, [MAT.roofStone, MAT.wall], 'shell', 'perimeterBlock');

  // Red sandstone base band. In every photograph the bottom storey is red and
  // everything above it is beige — that split does most of the recognition work.
  add(root, extrudeUp(triShape(P.inradius + 0.5, P.chamfer + 0.3), P.plinthTop, P.redBase,
    { holes: [triShape(P.inradius - P.depth - 0.5, P.chamfer * 0.78)] }),
    [MAT.cornice, MAT.cornice], 'shell', 'redBase');

  add(root, extrudeUp(triShape(P.inradius + 0.9, P.chamfer + 0.5), P.redBase, P.redBase + 0.6,
    { holes: [triShape(P.inradius - 1, P.chamfer)] }),
    MAT.plinth, 'shell', 'baseCornice');

  // Bands framing the screen zone, top and bottom. They sit proud of the wall
  // but behind the jaali, so they must bracket the screens rather than cross
  // them — a mid-height band just shows through the perforations as clutter.
  // These are facade rings; a solid slab here would roof the interior.
  for (const y of [5.7, 21.5]) {
    add(root, extrudeUp(triShape(P.inradius + 0.35, P.chamfer + 0.2), y, y + 0.35,
      { holes: [triShape(P.inradius - 1.2, P.chamfer)] }),
      MAT.cornice, 'shell', 'stringCourse');
  }

  // -- Cornice + parapet ------------------------------------------------------
  add(root, extrudeUp(corniceShape, 24.2, P.wallTop, { holes: [triShape(P.inradius - 2, P.chamfer)] }),
    MAT.cornice, 'roof', 'cornice');
  // Parapet: a low red kerb, a pierced jaali screen, then a red coping — the
  // band that runs right round the roof edge in every photograph.
  add(root, extrudeUp(parapetOuter, P.wallTop, P.wallTop + 1.1, { holes: [parapetInner] }),
    MAT.cornice, 'roof', 'parapetKerb');
  add(root, extrudeUp(triShape(P.inradius + 1.4, P.chamfer + 0.8), P.parapetTop - 0.5, P.parapetTop,
    { holes: [triShape(P.inradius - 1.8, P.chamfer)] }), MAT.cornice, 'roof', 'parapetCap');

  // -- Facade: colonnade, screens, glazing ------------------------------------
  root.add(buildFacade(outer));

  // -- Six dwars: three ceremonial on the facades, three public on the corners
  for (const axis of AXES) root.add(buildEntrance(axis));
  for (const c of triCorners(P.inradius, P.chamfer)) root.add(buildPublicEntrance(c));

  // -- Inner roof deck over the office/gallery ring, open at the court --------
  root.add(buildInnerRoof(inner));

  // -- Interior court, galleries, chambers ------------------------------------
  root.add(buildCourt());
  for (const c of CHAMBERS) root.add(buildChamber(c));

  root.add(buildInnerColonnade(inner));

  return root;
}

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------

function buildFacade(outer) {
  const g = new THREE.Group();
  g.name = 'facade';
  const frames = perimeterFrames(outer, P.bays);

  // Entrance zones get a portico instead of the standard bay rhythm.
  const gates = AXES.map((a) => new THREE.Vector2(Math.cos(a) * P.inradius, Math.sin(a) * P.inradius));
  const isGate = (p) => gates.some((gp) => gp.distanceTo(p) < 19);

  const bays = frames.filter((f) => !isGate(f.pos));

  // --- Pier: base block + shaft + capital, merged into one geometry.
  // Slender and closely spaced, as in the photographs — the earlier chunky
  // piers read as a fortress rather than a colonnade.
  const pierH = 13.4, pierW = 1.0, pierD = 1.9;
  const pierGeo = mergeGeometries([
    box(pierW + 0.34, 0.6, pierD + 0.3).translate(0, 0.3, 0),
    box(pierW, pierH, pierD).translate(0, 0.6 + pierH / 2, 0),
    box(pierW + 0.3, 0.7, pierD + 0.26).translate(0, 0.6 + pierH + 0.35, 0),
  ]);
  const piers = new THREE.InstancedMesh(pierGeo, MAT.pier, bays.length);
  piers.castShadow = piers.receiveShadow = true;
  piers.userData.layer = 'shell';

  // --- Jaali screen and the dark glazing recessed behind it
  const jaaliGeo = scaleUV(new THREE.PlaneGeometry(3.2, 5.4), 0.78, 1.3);
  const jaali = new THREE.InstancedMesh(jaaliGeo, MAT.jaali, bays.length);
  jaali.castShadow = jaali.receiveShadow = true;
  jaali.userData.layer = 'shell';

  const glassGeo = new THREE.PlaneGeometry(3.4, 9.8);
  const glass = new THREE.InstancedMesh(glassGeo, MAT.window, bays.length);
  glass.userData.layer = 'shell';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);

  bays.forEach((f, i) => {
    const yaw = yawFromNormal(f.normal);
    q.setFromEuler(new THREE.Euler(0, yaw, 0));

    const base = toWorld(f.pos, 0);
    const nrm = new THREE.Vector3(f.normal.x, 0, -f.normal.y);

    // Colonnade stands on the red base band, not on the podium.
    m.compose(base.clone().addScaledVector(nrm, 0.85).setY(P.redBase + 0.6), q, s);
    piers.setMatrixAt(i, m);

    // Jaali high in the bay, glazing below it — the arrangement in the photos,
    // rather than one full-height screen per bay.
    m.compose(base.clone().addScaledVector(nrm, 0.5).setY(21.4), q, s);
    jaali.setMatrixAt(i, m);

    m.compose(base.clone().addScaledVector(nrm, 0.12).setY(15.4), q, s);
    glass.setMatrixAt(i, m);
  });

  piers.instanceMatrix.needsUpdate = true;
  jaali.instanceMatrix.needsUpdate = true;
  glass.instanceMatrix.needsUpdate = true;
  g.add(piers, jaali, glass);

  // Pierced red screen running the full parapet, all 108 bays including the
  // entrance zones — the band doesn't break for the gates.
  const railGeo = scaleUV(new THREE.PlaneGeometry(6.4, 2.3), 1.5, 0.55);
  const rail = new THREE.InstancedMesh(railGeo, MAT.jaaliRed, frames.length);
  rail.castShadow = rail.receiveShadow = true;
  rail.userData.layer = 'roof';
  frames.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, yawFromNormal(f.normal), 0));
    const nrm = new THREE.Vector3(f.normal.x, 0, -f.normal.y);
    m.compose(toWorld(f.pos, P.wallTop + 2.25).addScaledVector(nrm, 0.55), q, s);
    rail.setMatrixAt(i, m);
  });
  rail.instanceMatrix.needsUpdate = true;
  g.add(rail);

  // Roof-terrace lanterns, one every eighth bay.
  // OctahedronGeometry is non-indexed while CylinderGeometry is indexed —
  // mergeGeometries needs them to agree, so drop both to non-indexed.
  const lampGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8).toNonIndexed().translate(0, 1.1, 0),
    new THREE.OctahedronGeometry(0.42).translate(0, 2.5, 0),
  ]);
  const lamps = new THREE.InstancedMesh(lampGeo, MAT.bronze, Math.floor(P.bays / 8));
  lamps.userData.layer = 'roof';
  lamps.castShadow = true;
  for (let i = 0; i < lamps.count; i++) {
    const f = frames[i * 8];
    const p = toWorld(f.pos, P.parapetTop);
    m.compose(p.addScaledVector(new THREE.Vector3(f.normal.x, 0, -f.normal.y), -1.0), new THREE.Quaternion(), s);
    lamps.setMatrixAt(i, m);
  }
  lamps.instanceMatrix.needsUpdate = true;
  g.add(lamps);

  return g;
}

// ---------------------------------------------------------------------------
// Ceremonial entrance: broad steps, six columns, bronze door surround
// ---------------------------------------------------------------------------

function buildEntrance(axis) {
  const g = new THREE.Group();
  g.name = 'entrance';
  g.rotation.y = faceOutward(axis);        // local +Z points out along the facade axis

  const r = P.inradius;

  // Steps down to grade.
  const steps = 14, rise = P.plinthTop / steps, tread = 1.05;
  const stepGeo = box(34, rise, tread);
  const stepMesh = new THREE.InstancedMesh(stepGeo, MAT.step, steps);
  stepMesh.castShadow = stepMesh.receiveShadow = true;
  stepMesh.userData.layer = 'shell';
  const m = new THREE.Matrix4();
  for (let i = 0; i < steps; i++) {
    m.makeTranslation(0, P.plinthTop - (i + 0.5) * rise, r + 5.6 + i * tread);
    stepMesh.setMatrixAt(i, m);
  }
  stepMesh.instanceMatrix.needsUpdate = true;
  g.add(stepMesh);

  // Cheek walls flanking the flight.
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(box(2.4, 4.4, 16.5), MAT.plinth);
    cheek.position.set(sx * 18, 1.4, r + 12.5);
    cheek.rotation.x = -0.115;
    cheek.castShadow = cheek.receiveShadow = true;
    cheek.userData.layer = 'shell';
    g.add(cheek);
  }

  // Portico platform.
  const deck = new THREE.Mesh(box(38, 1.2, 12), MAT.paving);
  deck.position.set(0, P.plinthTop - 0.6, r + 0.5);
  deck.receiveShadow = deck.castShadow = true;
  deck.userData.layer = 'shell';
  g.add(deck);

  // Six columns — one for each of the building's six doors.
  const colGeo = mergeGeometries([
    box(3.0, 0.8, 3.0).translate(0, 0.4, 0),
    box(2.3, 18.4, 2.3).translate(0, 9.9, 0),
    box(2.9, 1.1, 2.9).translate(0, 19.65, 0),
  ]);
  const cols = new THREE.InstancedMesh(colGeo, MAT.pier, 6);
  cols.castShadow = cols.receiveShadow = true;
  cols.userData.layer = 'shell';
  [-13.5, -8.1, -2.7, 2.7, 8.1, 13.5].forEach((x, i) => {
    m.makeTranslation(x, P.plinthTop, r + 4.6);
    cols.setMatrixAt(i, m);
  });
  cols.instanceMatrix.needsUpdate = true;
  g.add(cols);

  // Entablature and the chhajja that shades the doorway.
  const arch = new THREE.Mesh(box(33, 3.2, 9.5), MAT.cornice);
  arch.position.set(0, P.plinthTop + 22.2, r + 3.4);
  arch.castShadow = arch.receiveShadow = true;
  arch.userData.layer = 'shell';
  g.add(arch);

  const chhajja = new THREE.Mesh(box(35.5, 0.7, 11.5), MAT.cornice);
  chhajja.position.set(0, P.plinthTop + 24.1, r + 3.0);
  chhajja.castShadow = true;
  chhajja.userData.layer = 'roof';
  g.add(chhajja);

  // Bronze door leaves in a carved stone surround.
  const surround = new THREE.Mesh(box(15.5, 15.5, 1.2), MAT.plinth);
  surround.position.set(0, P.plinthTop + 7.5, r - 0.2);
  surround.castShadow = surround.receiveShadow = true;
  surround.userData.layer = 'shell';
  g.add(surround);

  // Sheet-gold leaf with a chakra medallion, in a deep recess.
  const doors = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(11.6, 12.6), 11.6, 12.6), MAT.goldLeaf);
  doors.position.set(0, P.plinthTop + 6.4, r + 0.45);
  doors.userData.layer = 'shell';
  g.add(doors);

  g.add(makeChakra(2.05, 0.28, P.plinthTop + 8.6, r + 0.7));
  // And the big stone roundel on the beige wall above the portal.
  g.add(makeChakra(3.1, 0.4, P.plinthTop + 26.6, r + 0.5, MAT.plinth));

  // Flanking dwarapala pedestals.
  for (const sx of [-1, 1]) {
    const ped = new THREE.Mesh(box(3.2, 3.6, 3.2), MAT.plinth);
    ped.position.set(sx * 11.5, P.plinthTop + 1.8, r + 6.2);
    ped.castShadow = ped.receiveShadow = true;
    ped.userData.layer = 'shell';
    g.add(ped);

    const lion = makeLion(1.5);
    lion.position.set(sx * 11.5, P.plinthTop + 3.6, r + 6.2);
    lion.rotation.y = sx > 0 ? -0.25 : 0.25;
    lion.userData.layer = 'shell';
    g.add(lion);
  }

  return g;
}

// ---------------------------------------------------------------------------
// Public entrance on a rounded corner — Makara, Shardula and Hamsa Dwar.
// Smaller than the ceremonial gates: a shallow porch, four piers, a bronze
// leaf, and a creature pedestal to either side.
// ---------------------------------------------------------------------------

function buildPublicEntrance(cornerShapePoint) {
  const g = new THREE.Group();
  g.name = 'publicEntrance';

  const outward = cornerShapePoint.clone().normalize();
  const dist = cornerShapePoint.length();
  g.position.set(outward.x * dist, 0, -outward.y * dist);
  // Local +Z points away from the centre, out through the corner.
  g.rotation.y = Math.atan2(outward.x, -outward.y);

  const m = new THREE.Matrix4();

  const steps = 12, rise = P.plinthTop / steps, tread = 0.95;
  const stepMesh = new THREE.InstancedMesh(box(20, rise, tread), MAT.step, steps);
  stepMesh.castShadow = stepMesh.receiveShadow = true;
  stepMesh.userData.layer = 'shell';
  for (let i = 0; i < steps; i++) {
    m.makeTranslation(0, P.plinthTop - (i + 0.5) * rise, 4.6 + i * tread);
    stepMesh.setMatrixAt(i, m);
  }
  stepMesh.instanceMatrix.needsUpdate = true;
  g.add(stepMesh);

  const deck = new THREE.Mesh(box(23, 1.1, 9), MAT.paving);
  deck.position.set(0, P.plinthTop - 0.55, 0.6);
  deck.castShadow = deck.receiveShadow = true;
  deck.userData.layer = 'shell';
  g.add(deck);

  const colGeo = mergeGeometries([
    box(2.2, 0.7, 2.2).translate(0, 0.35, 0),
    box(1.7, 15.4, 1.7).translate(0, 8.4, 0),
    box(2.2, 0.9, 2.2).translate(0, 16.55, 0),
  ]);
  const cols = new THREE.InstancedMesh(colGeo, MAT.pier, 4);
  cols.castShadow = cols.receiveShadow = true;
  cols.userData.layer = 'shell';
  [-7.6, -2.6, 2.6, 7.6].forEach((x, i) => {
    m.makeTranslation(x, P.plinthTop, 3.2);
    cols.setMatrixAt(i, m);
  });
  cols.instanceMatrix.needsUpdate = true;
  g.add(cols);

  const lintel = new THREE.Mesh(box(20, 2.4, 7.2), MAT.cornice);
  lintel.position.set(0, P.plinthTop + 18.6, 2.4);
  lintel.castShadow = lintel.receiveShadow = true;
  lintel.userData.layer = 'shell';
  g.add(lintel);

  const surround = new THREE.Mesh(box(10.5, 11.5, 1.1), MAT.plinth);
  surround.position.set(0, P.plinthTop + 5.6, -0.4);
  surround.castShadow = surround.receiveShadow = true;
  surround.userData.layer = 'shell';
  g.add(surround);

  const doors = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(7.4, 9), 7.4, 9), MAT.bronze);
  doors.position.set(0, P.plinthTop + 4.9, 0.25);
  doors.userData.layer = 'shell';
  g.add(doors);

  // The named creature, on a pedestal either side of the leaf.
  for (const sx of [-1, 1]) {
    const ped = new THREE.Mesh(box(2.6, 3.0, 2.6), MAT.plinth);
    ped.position.set(sx * 6.6, P.plinthTop + 1.5, 4.6);
    ped.castShadow = ped.receiveShadow = true;
    ped.userData.layer = 'shell';
    g.add(ped);

    const beast = makeLion(1.15);
    beast.position.set(sx * 6.6, P.plinthTop + 3.0, 4.6);
    beast.rotation.y = sx > 0 ? -0.2 : 0.2;
    beast.userData.layer = 'shell';
    g.add(beast);
  }

  return g;
}

/** Ashoka chakra: a rimmed disc with 24 spokes, facing local +Z. */
function makeChakra(radius, depth, y, z, mat = MAT.gold) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  g.userData.layer = 'shell';

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 48), mat);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = disc.receiveShadow = true;
  g.add(disc);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, radius * 0.06, 8, 48), mat);
  rim.position.z = depth * 0.6;
  g.add(rim);

  const spokeGeo = box(radius * 0.045, radius * 1.56, depth * 0.5);
  const spokes = new THREE.InstancedMesh(spokeGeo, mat, 24);
  spokes.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    m.makeRotationZ((i / 24) * Math.PI);
    m.setPosition(0, 0, depth * 0.6);
    spokes.setMatrixAt(i, m);
  }
  spokes.instanceMatrix.needsUpdate = true;
  g.add(spokes);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, depth * 0.9, 20), mat);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = depth * 0.6;
  g.add(hub);

  return g;
}

/** World anchor a label should point at, for each of the six dwars. */
export function doorAnchor(door) {
  if (door.kind === 'ceremonial') {
    const a = AXES[door.axisIndex];
    const d = P.inradius + 10;
    return new THREE.Vector3(Math.cos(a) * d, P.plinthTop + 9, -Math.sin(a) * d);
  }
  const c = triCorners(P.inradius, P.chamfer)[door.cornerIndex];
  const n = c.clone().normalize();
  const d = c.length() + 5;
  return new THREE.Vector3(n.x * d, P.plinthTop + 7, -n.y * d);
}

// ---------------------------------------------------------------------------
// Inner roof deck (removed by the cutaway)
// ---------------------------------------------------------------------------

/**
 * The roof.
 *
 * It is FLAT — a pale stone plaza spanning the whole triangle, edged in red
 * sandstone, with the Lion Capital on a stepped triangular podium at the
 * centre. The fan shapes that read as shells in aerial photographs are not
 * shells at all: they are arrays of narrow skylight slots set flush into the
 * deck above each debating chamber.
 */
function buildInnerRoof(inner) {
  const g = new THREE.Group();
  g.name = 'roof';
  const Y = P.wallTop, T = 1.3;

  // Hexagonal opening over the banyan court. It sits in the third bay, not at
  // the centre — the centre belongs to the emblem podium.
  const cc = COURT_CENTRE;
  const court = new THREE.Path();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = cc.x + Math.cos(a) * P.courtR;
    const y = -cc.z + Math.sin(a) * P.courtR;      // shape space: y = -world z
    if (i === 0) court.moveTo(x, y); else court.lineTo(x, y);
  }
  court.closePath();

  const slab = extrudeUp(inner, Y, Y + T, { holes: [court] });
  add(g, slab, [MAT.roofStone, MAT.cornice], 'roof', 'roofDeck');

  // Red hexagonal kerb framing the court opening.
  const kerbOuter = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = cc.x + Math.cos(a) * (P.courtR + 3.4);
    const y = -cc.z + Math.sin(a) * (P.courtR + 3.4);
    if (i === 0) kerbOuter.moveTo(x, y); else kerbOuter.lineTo(x, y);
  }
  kerbOuter.closePath();
  add(g, extrudeUp(kerbOuter, Y + T, Y + T + 0.55, { holes: [court] }),
    MAT.cornice, 'roof', 'courtKerb');

  // Two fans, over the two debating chambers only.
  for (const c of CHAMBERS) {
    if (c.carpet) g.add(buildRoofFan(c.axis, Y + T, 20));
  }
  g.add(buildEmblemPodium(Y + T));
  return g;
}

/**
 * The roof fan over a debating chamber.
 *
 * From directly above these are the dominant feature of the whole building: a
 * spread of eleven BIG near-white panels, like the leaves of a hand fan, each
 * an annular sector raised off the deck with a dark shadow gap between it and
 * its neighbour, alternating slightly in height so they read as overlapping.
 *
 * My first two attempts had this badly wrong — thin radial slots on a large
 * empty deck. The panels are the roof; the deck is only the margin around them.
 */
function buildRoofFan(axis, y, dist) {
  const g = new THREE.Group();
  g.name = 'roofFan';
  const c = chamberPos(axis, dist);
  g.position.set(c.x, y, c.z);
  g.rotation.y = faceOutward(axis);

  // Big: hub near the middle of the plan, sweeping out almost to the inner face
  // of the office ring. In the aerials the two fans and the court between them
  // leave only a narrow margin of bare deck.
  const R0 = 5, R1 = 26;
  const panels = 11;
  // Narrow enough that the two fans stay separate features in their own bays.
  // At a full half-turn, hubs 120° apart merge into one blob across the middle.
  const sweep = Math.PI * 0.85;
  const step = sweep / panels;
  const gap = 0.022;                 // radians of shadow between panels

  for (let i = 0; i < panels; i++) {
    const a0 = -sweep / 2 + i * step + gap;
    const len = step - gap * 2;
    // RingGeometry rotated -90° about X puts ring angle θ at (cos θ, 0, -sin θ);
    // the fan is laid out on (sin a, 0, cos a), so θ = a - π/2 aligns them.
    const ring = new THREE.RingGeometry(R0, R1, 6, 1, a0 - Math.PI / 2, len);
    ring.rotateX(-Math.PI / 2);
    discUV(ring, R1);
    const panel = new THREE.Mesh(ring, MAT.fanPanel);
    panel.position.y = 0.35 + (i % 2) * 0.28;
    panel.castShadow = panel.receiveShadow = true;
    panel.userData.layer = 'roof';
    g.add(panel);

    // Thin upstand along the panel edge so it has depth from a low angle.
    const edge = new THREE.Mesh(
      cylUV(new THREE.CylinderGeometry(R1, R1, 0.34, 48, 1, true, a0 - Math.PI / 2, len), R1, 0.34),
      MAT.fanPanel);
    edge.position.y = panel.position.y - 0.17;
    edge.userData.layer = 'roof';
    g.add(edge);
  }

  // Red sandstone hub the fan springs from.
  const hub = new THREE.Mesh(
    discUV(new THREE.RingGeometry(R0 - 2.2, R0 + 0.4, 48, 1), R0 + 0.4), MAT.cornice);
  hub.rotateX(-Math.PI / 2);
  hub.position.y = 0.12;
  hub.receiveShadow = true;
  hub.userData.layer = 'roof';
  g.add(hub);

  return g;
}

/** Stepped triangular podium carrying the National Emblem. */
function buildEmblemPodium(y) {
  const g = new THREE.Group();
  g.name = 'emblemPodium';

  // Small relative to the roof — in the photographs the deck reads as a wide
  // pale plaza with a compact red podium at its centre.
  const steps = [
    { r: 13.5, chamfer: 3.2, h: 1.1 },
    { r: 10.5, chamfer: 2.5, h: 1.0 },
    { r: 8.0, chamfer: 1.9, h: 1.0 },
  ];
  let top = y;
  for (const s of steps) {
    add(g, extrudeUp(triShape(s.r, s.chamfer), top, top + s.h), MAT.cornice, 'roof', 'podiumStep');
    top += s.h;
  }

  // Colonnaded drum under the capital — piers with jaali between them.
  const drumR = 4.8, drumH = 3.4;
  const colGeo = box(0.6, drumH, 0.8);
  const cols = new THREE.InstancedMesh(colGeo, MAT.cornice, 24);
  cols.castShadow = cols.receiveShadow = true;
  cols.userData.layer = 'roof';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, a, 0));
    m.compose(new THREE.Vector3(Math.sin(a) * drumR, top + drumH / 2, Math.cos(a) * drumR), q, one);
    cols.setMatrixAt(i, m);
  }
  cols.instanceMatrix.needsUpdate = true;
  g.add(cols);

  const screen = new THREE.Mesh(
    scaleUV(new THREE.CylinderGeometry(drumR - 0.3, drumR - 0.3, drumH, 40, 1, true), 26, 1),
    MAT.jaaliParapet);
  screen.position.y = top + drumH / 2;
  screen.userData.layer = 'roof';
  g.add(screen);

  top += drumH;
  add(g, extrudeUp(triShape(6.2, 1.5), top, top + 0.9), MAT.cornice, 'roof', 'podiumCap');
  top += 0.9;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, 1.2, 32), MAT.plinth);
  base.position.y = top + 0.6;
  base.castShadow = base.receiveShadow = true;
  base.userData.layer = 'roof';
  g.add(base);

  const emblem = makeEmblem();
  emblem.scale.setScalar(1.1);
  emblem.position.y = top + 1.2;
  emblem.userData.layer = 'roof';
  g.add(emblem);

  return g;
}

// ---------------------------------------------------------------------------
// Central banyan court
// ---------------------------------------------------------------------------

function buildCourt() {
  const g = new THREE.Group();
  g.name = 'court';
  g.position.set(COURT_CENTRE.x, 0, COURT_CENTRE.z);

  // Paved hexagonal court floor.
  const floor = new THREE.Mesh(
    discUV(new THREE.CircleGeometry(P.courtR, 6, Math.PI / 6), P.courtR), MAT.paving);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR + 0.05;
  floor.receiveShadow = true;
  floor.userData.layer = 'interior';
  g.add(floor);

  const inlay = new THREE.Mesh(discUV(new THREE.CircleGeometry(9, 64), 9), MAT.marble);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = FLOOR + 0.09;
  inlay.receiveShadow = true;
  inlay.userData.layer = 'interior';
  g.add(inlay);

  // Raised planter ring.
  const ring = new THREE.Mesh(
    cylUV(new THREE.CylinderGeometry(5.0, 5.2, 1.1, 48, 1, true), 5.1, 1.1), MAT.plinth);
  ring.position.y = FLOOR + 0.6;
  ring.castShadow = ring.receiveShadow = true;
  ring.userData.layer = 'interior';
  g.add(ring);

  const soil = new THREE.Mesh(discUV(new THREE.CircleGeometry(5.0, 48), 5.0), MAT.bark);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = FLOOR + 1.1;
  soil.receiveShadow = true;
  soil.userData.layer = 'interior';
  g.add(soil);

  g.add(makeBanyan());
  return g;
}

/** The national tree, with its aerial roots. */
function makeBanyan() {
  const g = new THREE.Group();
  g.name = 'banyan';
  g.position.y = FLOOR + 1.05;
  g.scale.setScalar(1.0);       // the court is large enough for a full canopy
  g.userData.layer = 'interior';

  const trunk = new THREE.Mesh(
    cylUV(new THREE.CylinderGeometry(1.5, 2.6, 9, 14, 3), 2.0, 9),
    MAT.bark,
  );
  // Buttress the trunk with a little noise so it isn't a clean cone.
  const pos = trunk.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + Math.sin(Math.atan2(z, x) * 6 + y * 0.6) * 0.09;
    pos.setXYZ(i, x * k, y, z * k);
  }
  trunk.geometry.computeVertexNormals();
  trunk.position.y = 4.5;
  trunk.castShadow = trunk.receiveShadow = true;
  g.add(trunk);

  // Radiating limbs.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.85, 7.5, 8), MAT.bark);
    limb.position.set(Math.cos(a) * 2.6, 9.6, Math.sin(a) * 2.6);
    limb.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
    limb.castShadow = true;
    g.add(limb);
  }

  // Aerial roots dropping from the canopy.
  const rootGeo = new THREE.CylinderGeometry(0.1, 0.16, 8.5, 6);
  const roots = new THREE.InstancedMesh(rootGeo, MAT.bark, 22);
  roots.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + i * 0.37;
    const r = 4 + (i % 5) * 1.3;
    m.makeTranslation(Math.cos(a) * r, 6.0 + (i % 3) * 0.6, Math.sin(a) * r);
    roots.setMatrixAt(i, m);
  }
  roots.instanceMatrix.needsUpdate = true;
  g.add(roots);

  // Canopy: overlapping jittered spheres, foliage-textured.
  const blobs = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i === 0 ? 0 : 5.2 + (i % 3) * 1.4;
    const s = i === 0 ? 6.6 : 4.2 + (i % 4) * 0.55;
    const geo = scaleUV(new THREE.IcosahedronGeometry(s, 2), 2 * Math.PI * s, Math.PI * s);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const j = 1 + (Math.sin(p.getX(k) * 2.1 + i) * Math.cos(p.getZ(k) * 1.7)) * 0.11;
      p.setXYZ(k, p.getX(k) * j, p.getY(k) * j * 0.82, p.getZ(k) * j);
    }
    geo.translate(Math.cos(a) * r, 12.5 + (i % 3) * 1.1, Math.sin(a) * r);
    geo.computeVertexNormals();
    blobs.push(geo);
  }
  const canopy = new THREE.Mesh(mergeGeometries(blobs), MAT.foliage);
  canopy.castShadow = canopy.receiveShadow = true;
  g.add(canopy);

  return g;
}

// ---------------------------------------------------------------------------
// Inner colonnade around the court
// ---------------------------------------------------------------------------

function buildInnerColonnade(inner) {
  const g = new THREE.Group();
  g.name = 'innerColonnade';
  const frames = perimeterFrames(inner, 54);

  const colGeo = mergeGeometries([
    box(2.0, 0.7, 2.0).translate(0, 0.35, 0),
    box(1.55, 19.1, 1.55).translate(0, 10.25, 0),
    box(2.1, 0.8, 2.1).translate(0, 20.2, 0),
  ]);
  const cols = new THREE.InstancedMesh(colGeo, MAT.pier, frames.length);
  cols.castShadow = cols.receiveShadow = true;
  cols.userData.layer = 'interior';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  frames.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, yawFromNormal(f.normal), 0));
    const p = toWorld(f.pos, FLOOR).addScaledVector(new THREE.Vector3(f.normal.x, 0, -f.normal.y), -2.2);
    m.compose(p, q, s);
    cols.setMatrixAt(i, m);
  });
  cols.instanceMatrix.needsUpdate = true;
  g.add(cols);

  // Gallery floor across the whole inner area; the chambers and the court sit
  // on top of it.
  const outerR = P.inradius - P.depth + 0.5;
  const floor = new THREE.Mesh(discUV(new THREE.CircleGeometry(outerR, 96), outerR), MAT.paving);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR + 0.02;
  floor.receiveShadow = true;
  floor.userData.layer = 'interior';
  g.add(floor);

  return g;
}

// ---------------------------------------------------------------------------
// A chamber: drum, tiered seating, dais, petal roof, motif ceiling
// ---------------------------------------------------------------------------

function buildChamber(spec) {
  const g = new THREE.Group();
  g.name = spec.name;
  const c = chamberPos(spec.axis);
  g.position.copy(c).setY(FLOOR);          // the whole chamber sits on the podium
  g.rotation.y = faceOutward(spec.axis);   // local -Z points back toward the court

  const R = P.chamberR;
  // The chambers sit *under* the flat roof deck — nothing of them shows above it.
  const drumTop = P.wallTop - 1.4 - FLOOR;

  // --- Drum wall ------------------------------------------------------------
  const drum = new THREE.Mesh(
    cylUV(new THREE.CylinderGeometry(R, R + 0.6, drumTop, 48, 1, true), R, drumTop),
    MAT.drum,
  );
  drum.position.y = drumTop / 2;
  drum.castShadow = drum.receiveShadow = true;
  drum.userData.layer = 'shell';
  g.add(drum);

  // Jaali clerestory band near the top of the drum. The alpha pattern is sized
  // in cells, not metres, so it keeps its own UV scale.
  const band = new THREE.Mesh(
    scaleUV(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 3.6, 48, 1, true), 20, 1),
    MAT.jaaliParapet,
  );
  band.position.y = drumTop - 3.0;
  band.castShadow = true;
  band.userData.layer = 'shell';
  g.add(band);

  // Ring cornice at the drum head.
  const dcorn = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.3, R + 1.3, 1.1, 48), MAT.cornice);
  dcorn.position.y = drumTop + 0.4;
  dcorn.castShadow = dcorn.receiveShadow = true;
  dcorn.userData.layer = 'roof';
  g.add(dcorn);

  // No shell above: the chamber is capped flat and the roof deck runs over it.
  // The only thing that shows from above is the skylight fan in buildRoofFan().

  // --- Interior --------------------------------------------------------------
  if (spec.carpet) {
    g.add(buildChamberInterior(spec, R, drumTop));
  } else {
    // Constitution Hall: marble floor, a plinth for the Constitution itself.
    const floor = new THREE.Mesh(discUV(new THREE.CircleGeometry(R - 0.6, 64), R - 0.6), MAT.marble);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.42;
    floor.receiveShadow = true;
    floor.userData.layer = 'interior';
    g.add(floor);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.6, 32), MAT.marbleWall);
    ped.position.y = 1.2;
    ped.castShadow = ped.receiveShadow = true;
    ped.userData.layer = 'interior';
    g.add(ped);

    const casket = new THREE.Mesh(box(2.4, 1.0, 1.6), MAT.gold);
    casket.position.y = 2.5;
    casket.castShadow = true;
    casket.userData.layer = 'interior';
    g.add(casket);

    // Shallow saucer ceiling: the cap is flipped and squashed so it reads as a
    // dome from below without punching through the roof above.
    const ceil = new THREE.Mesh(
      new THREE.SphereGeometry(R - 0.4, 48, 20, 0, Math.PI * 2, 0, Math.PI * 0.42),
      MAT.marbleWall,
    );
    ceil.scale.set(1, -0.32, 1);
    ceil.position.y = drumTop - 0.6;
    ceil.userData.layer = 'ceiling';
    g.add(ceil);
  }

  return g;
}

function buildChamberInterior(spec, R, drumTop) {
  const g = new THREE.Group();
  g.name = spec.name + ' interior';
  g.userData.layer = 'interior';

  const carpet = MAT[spec.carpet];
  const cushion = MAT[spec.cushion];

  // Tiered floor: concentric steps rising away from the dais.
  const tiers = 8;
  for (let i = 0; i < tiers; i++) {
    const r0 = 3.2 + i * 1.5;
    const r1 = r0 + 1.5;
    const y = 0.42 + i * 0.42;
    const step = new THREE.Mesh(discUV(new THREE.RingGeometry(r0, r1, 64, 1), r1), carpet);
    step.rotation.x = -Math.PI / 2;
    step.position.y = y;
    step.receiveShadow = true;
    g.add(step);

    // The riser sits at the tier's *inner* edge, climbing from the tier below.
    if (i > 0) {
      const riser = new THREE.Mesh(
        cylUV(new THREE.CylinderGeometry(r0, r0, 0.42, 64, 1, true), r0, 0.42), carpet);
      riser.position.y = y - 0.21;
      riser.receiveShadow = true;
      g.add(riser);
    }
  }

  const wellFloor = new THREE.Mesh(discUV(new THREE.CircleGeometry(3.2, 48), 3.2), carpet);
  wellFloor.rotation.x = -Math.PI / 2;
  wellFloor.position.y = 0.42;
  wellFloor.receiveShadow = true;
  g.add(wellFloor);

  // --- Benches: curved desk + seat, laid out on each tier ---------------------
  // A bench, not a floating slab: desk in front, a solid seat box behind it,
  // backrest rising off the seat.
  const deskGeo = box(2.1, 0.78, 0.62);
  const seatGeo = box(1.66, 0.44, 0.56);
  const backGeo = box(1.66, 0.56, 0.13);

  const rows = [];
  for (let i = 0; i < tiers; i++) {
    const r = 4.2 + i * 1.5;
    const span = Math.PI * 1.62;                     // horseshoe opening toward the dais
    const n = Math.max(6, Math.round((span * r) / 2.35));
    rows.push({ r, span, n, y: 0.42 + i * 0.42 });
  }
  const total = rows.reduce((s, r) => s + r.n, 0);

  const desks = new THREE.InstancedMesh(deskGeo, MAT.wood, total);
  const seats = new THREE.InstancedMesh(seatGeo, cushion, total);
  const backs = new THREE.InstancedMesh(backGeo, cushion, total);
  for (const im of [desks, seats, backs]) {
    im.castShadow = im.receiveShadow = true;
    im.userData.layer = 'interior';
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let k = 0;
  const at = (a, r, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  for (const row of rows) {
    const a0 = Math.PI / 2 - row.span / 2;
    const a1 = Math.PI / 2 + row.span / 2;
    for (const p of arcPoints(row.r, a0, a1, row.n)) {
      // Benches look inward, across the well, to the Speaker's dais.
      q.setFromEuler(new THREE.Euler(0, -p.a - Math.PI / 2, 0));
      m.compose(at(p.a, row.r - 0.35, row.y + 0.39), q, one);
      desks.setMatrixAt(k, m);
      m.compose(at(p.a, row.r + 0.40, row.y + 0.22), q, one);
      seats.setMatrixAt(k, m);
      m.compose(at(p.a, row.r + 0.62, row.y + 0.72), q, one);
      backs.setMatrixAt(k, m);
      k++;
    }
  }
  desks.instanceMatrix.needsUpdate = true;
  seats.instanceMatrix.needsUpdate = true;
  backs.instanceMatrix.needsUpdate = true;
  g.add(desks, seats, backs);

  // --- Speaker's dais --------------------------------------------------------
  const dais = new THREE.Group();
  dais.position.set(0, 0.42, -R * 0.52);

  const podium = new THREE.Mesh(box(9.5, 1.5, 4.2), MAT.wood);
  podium.position.y = 0.75;
  podium.castShadow = podium.receiveShadow = true;
  dais.add(podium);

  const chair = new THREE.Mesh(box(2.0, 3.4, 1.4), MAT.wood);
  chair.position.set(0, 3.2, -1.0);
  chair.castShadow = true;
  dais.add(chair);

  const table = new THREE.Mesh(box(6.4, 0.9, 2.4), MAT.wood);
  table.position.set(0, 1.95, 1.6);
  table.castShadow = table.receiveShadow = true;
  dais.add(table);

  const backWall = new THREE.Mesh(box(15, 9.5, 0.8), MAT.woodPanel);
  backWall.position.set(0, 5.2, -3.6);
  backWall.castShadow = backWall.receiveShadow = true;
  dais.add(backWall);

  const backCap = new THREE.Mesh(box(15.8, 0.6, 1.4), MAT.wood);
  backCap.position.set(0, 10.2, -3.6);
  backCap.castShadow = true;
  dais.add(backCap);

  // The chamber crest, in a turned bronze surround.
  const crest = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), MAT.gold);
  crest.position.set(0, 7.6, -3.15);
  dais.add(crest);

  const crestRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.14, 8, 32), MAT.bronze);
  crestRing.position.set(0, 7.6, -3.14);
  dais.add(crestRing);
  dais.userData.layer = 'interior';
  g.add(dais);

  // --- Wall panelling + press gallery ---------------------------------------
  const panel = new THREE.Mesh(
    cylUV(new THREE.CylinderGeometry(R - 0.35, R - 0.35, 6.5, 48, 1, true), R - 0.35, 6.5),
    MAT.woodPanel,
  );
  panel.position.y = 6.6;      // clears the top tier, which tops out at ~2.9 m
  panel.receiveShadow = true;
  g.add(panel);

  // Above the panelling the drum's raw ashlar would show through; chambers are
  // lined, so drop a plaster-and-marble skin inside it.
  const lining = new THREE.Mesh(
    cylUV(new THREE.CylinderGeometry(R - 0.3, R - 0.3, drumTop - 9.4, 48, 1, true), R - 0.3, drumTop - 9.4),
    MAT.marbleWall,
  );
  lining.position.y = 9.4 + (drumTop - 9.4) / 2;
  lining.receiveShadow = true;
  g.add(lining);

  const gallery = new THREE.Mesh(new THREE.TorusGeometry(R - 1.6, 0.55, 10, 64), MAT.marbleWall);
  gallery.rotation.x = Math.PI / 2;
  gallery.position.y = 8.6;
  gallery.castShadow = gallery.receiveShadow = true;
  g.add(gallery);

  // --- Motif ceiling ---------------------------------------------------------
  // Tagged 'ceiling', not 'roof': the cutaway lifts the outer shells but leaves
  // the peacock and lotus in place — they're the point of the room.
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R - 0.5, 64), MAT[spec.ceiling]);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = drumTop - 1.2;
  ceil.userData.layer = 'ceiling';
  g.add(ceil);

  // A ring of downlights so the motif still reads at night.
  const lightRing = new THREE.Mesh(new THREE.TorusGeometry(R - 3.5, 0.22, 8, 48), MAT.gold);
  lightRing.rotation.x = Math.PI / 2;
  lightRing.position.y = drumTop - 1.9;
  lightRing.userData.layer = 'ceiling';
  g.add(lightRing);

  return g;
}

// ---------------------------------------------------------------------------
// Lion capital / national emblem — a readable silhouette, not a portrait
// ---------------------------------------------------------------------------

function makeLion(scale = 1) {
  const parts = [];
  const body = new THREE.SphereGeometry(0.62, 14, 10);
  body.scale(0.8, 0.9, 1.5);
  body.translate(0, 0.72, 0.15);
  parts.push(body);

  const chest = new THREE.SphereGeometry(0.5, 12, 10);
  chest.scale(1.0, 1.1, 0.8);
  chest.translate(0, 0.95, 0.85);
  parts.push(chest);

  const mane = new THREE.SphereGeometry(0.55, 14, 12);
  mane.scale(1.15, 1.15, 0.85);
  mane.translate(0, 1.42, 0.72);
  parts.push(mane);

  const head = new THREE.SphereGeometry(0.34, 14, 12);
  head.scale(0.85, 0.9, 1.05);
  head.translate(0, 1.46, 1.06);
  parts.push(head);

  for (const sx of [-1, 1]) {
    const fore = new THREE.CylinderGeometry(0.13, 0.16, 1.0, 8);
    fore.translate(sx * 0.3, 0.5, 1.0);
    parts.push(fore);
    const hind = new THREE.CylinderGeometry(0.15, 0.19, 0.85, 8);
    hind.translate(sx * 0.32, 0.43, -0.5);
    parts.push(hind);
    const paw = new THREE.SphereGeometry(0.2, 8, 6);
    paw.scale(1, 0.6, 1.5);
    paw.translate(sx * 0.3, 0.1, 1.3);
    parts.push(paw);
  }

  const tail = new THREE.CylinderGeometry(0.06, 0.1, 1.1, 6);
  tail.rotateX(0.9);
  tail.translate(0, 1.0, -0.85);
  parts.push(tail);

  const geo = mergeGeometries(parts);
  geo.scale(scale, scale, scale);
  const mesh = new THREE.Mesh(geo, MAT.marbleWall);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function makeEmblem() {
  const g = new THREE.Group();
  g.name = 'nationalEmblem';

  // Inverted lotus bell.
  const bellPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    bellPts.push(new THREE.Vector2(1.9 - Math.pow(t, 1.5) * 1.15 + Math.sin(t * Math.PI) * 0.35, t * 2.2));
  }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 40), MAT.marbleWall);
  bell.castShadow = bell.receiveShadow = true;
  g.add(bell);

  // Abacus with the dharma chakra.
  const abacus = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.7, 0.55, 40), MAT.marbleWall);
  abacus.position.y = 2.48;
  abacus.castShadow = abacus.receiveShadow = true;
  g.add(abacus);

  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 20), MAT.gold);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    wheel.position.set(Math.cos(a) * 1.76, 2.48, Math.sin(a) * 1.76);
    wheel.rotation.y = -a + Math.PI / 2;
    g.add(wheel);
  }

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.22, 40), MAT.marbleWall);
  plate.position.y = 2.86;
  plate.castShadow = true;
  g.add(plate);

  // Four lions, back to back.
  for (let i = 0; i < 4; i++) {
    const lion = makeLion(1.15);
    lion.rotation.y = (i / 4) * Math.PI * 2;
    const a = (i / 4) * Math.PI * 2;
    lion.position.set(Math.sin(a) * 0.62, 2.97, Math.cos(a) * 0.62);
    g.add(lion);
  }

  return g;
}

export { makeLion, makeEmblem };
