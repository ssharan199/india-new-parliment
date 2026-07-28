/**
 * Site: lawn, the paved apron and approach roads, the tree belt that rings the
 * Central Vista plot, and a scatter of low hedges.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT } from './materials.js';
import { scaleUV, cylUV, boxUV, triShape, extrudeUp } from './geom.js';
import { P } from './building.js';
import { Noise } from './noise.js';

export function buildSite() {
  const g = new THREE.Group();
  g.name = 'site';

  // --- Lawn -----------------------------------------------------------------
  // Wide enough that the plane's edge stays behind the haze at every preset.
  const ground = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(3200, 3200, 64, 64), 3200, 3200), MAT.grass);
  // A whisper of undulation so the shadow line across the lawn isn't dead flat.
  const n = new Noise(505);
  const pos = ground.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (n.fbm(x * 0.004 + 4, y * 0.004 + 4, 4, 8, 8) - 0.5) * 1.6);
  }
  ground.geometry.computeVertexNormals();
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.6;
  ground.receiveShadow = true;
  g.add(ground);

  // --- Paved apron around the building --------------------------------------
  const apron = new THREE.Mesh(
    extrudeUp(triShape(P.inradius + 46, P.chamfer + 30), -0.25, 0.05),
    MAT.paving,
  );
  apron.receiveShadow = true;
  g.add(apron);

  // Kerb line.
  const kerb = new THREE.Mesh(
    extrudeUp(triShape(P.inradius + 46.6, P.chamfer + 30), -0.4, 0.28,
      { holes: [triShape(P.inradius + 45.4, P.chamfer + 29)] }),
    MAT.cornice,
  );
  kerb.receiveShadow = kerb.castShadow = true;
  g.add(kerb);

  // --- Approach roads on the three axes -------------------------------------
  for (const deg of [90, 210, 330]) {
    const a = THREE.MathUtils.degToRad(deg);
    const road = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(26, 340), 26, 340), MAT.road);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -a + Math.PI / 2;
    road.position.set(Math.cos(a) * 230, 0.02, -Math.sin(a) * 230);
    road.receiveShadow = true;
    g.add(road);
  }

  g.add(buildTrees());
  g.add(buildHedges());
  return g;
}

// ---------------------------------------------------------------------------

function treeGeometries() {
  const trunk = cylUV(new THREE.CylinderGeometry(0.42, 0.72, 6.5, 8, 2), 0.57, 6.5);
  trunk.translate(0, 3.25, 0);

  const blobs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = i === 0 ? 0 : 2.1;
    const s = i === 0 ? 4.1 : 2.7;
    const geo = scaleUV(new THREE.IcosahedronGeometry(s, 1), 2 * Math.PI * s, Math.PI * s);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const j = 1 + Math.sin(p.getX(k) * 1.9 + i * 2.1) * 0.14;
      p.setXYZ(k, p.getX(k) * j, p.getY(k) * j * 0.86, p.getZ(k) * j);
    }
    geo.translate(Math.cos(a) * r, 8.4 + (i % 2) * 1.2, Math.sin(a) * r);
    blobs.push(geo);
  }
  return { trunk, canopy: mergeGeometries(blobs) };
}

function buildTrees() {
  const g = new THREE.Group();
  g.name = 'trees';
  const { trunk, canopy } = treeGeometries();

  const n = new Noise(808);
  const spots = [];
  const inner = P.inradius + 62;
  const outer = 720;

  for (let i = 0; i < 6000 && spots.length < 460; i++) {
    const a = n.rand() * Math.PI * 2;
    const r = inner + Math.pow(n.rand(), 0.55) * (outer - inner);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;

    // Keep the three ceremonial approaches clear.
    let blocked = false;
    for (const deg of [90, 210, 330]) {
      const ax = THREE.MathUtils.degToRad(deg);
      const dx = Math.cos(ax), dz = -Math.sin(ax);
      const along = x * dx + z * dz;
      const across = Math.abs(x * -dz + z * dx);
      if (along > 0 && across < 26) { blocked = true; break; }
    }
    if (blocked) continue;
    spots.push({ x, z, s: 0.72 + n.rand() * 0.75, rot: n.rand() * Math.PI * 2 });
  }

  const trunks = new THREE.InstancedMesh(trunk, MAT.bark, spots.length);
  const crowns = new THREE.InstancedMesh(canopy, MAT.foliage, spots.length);
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((sp, i) => {
    q.setFromEuler(new THREE.Euler(0, sp.rot, 0));
    m.compose(new THREE.Vector3(sp.x, -1.1, sp.z), q, new THREE.Vector3(sp.s, sp.s, sp.s));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    // Break up the green so the belt doesn't read as one flat mass.
    const t = (i * 0.37) % 1;
    col.setHSL(0.22 + t * 0.06, 0.42 + t * 0.16, 0.36 + t * 0.14);
    crowns.setColorAt(i, col);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;

  g.add(trunks, crowns);
  return g;
}

function buildHedges() {
  const g = new THREE.Group();
  g.name = 'hedges';
  const geo = boxUV(new THREE.BoxGeometry(1, 1, 1), 1, 1, 1);
  const hedges = [];
  const n = new Noise(3131);

  for (const deg of [90, 210, 330]) {
    const a = THREE.MathUtils.degToRad(deg);
    const dx = Math.cos(a), dz = -Math.sin(a);
    const px = -dz, pz = dx;
    for (let i = 0; i < 12; i++) {
      for (const side of [-1, 1]) {
        const along = P.inradius + 52 + i * 14;
        const across = side * (18 + (i % 3) * 2);
        const x = dx * along + px * across;
        const z = dz * along + pz * across;
        const s = 0.8 + n.rand() * 0.5;
        const m = new THREE.Matrix4()
          .makeRotationY(-a)
          .setPosition(x, 0.55 * s, z);
        const gg = geo.clone().scale(9 * s, 1.1 * s, 1.6 * s);
        gg.applyMatrix4(m);
        hedges.push(gg);
      }
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(hedges), MAT.foliage);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
