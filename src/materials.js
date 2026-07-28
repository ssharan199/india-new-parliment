/**
 * Material library. Everything is MeshStandardMaterial / MeshPhysicalMaterial
 * fed by the procedural maps in textures.js.
 *
 * All geometry carries UVs measured in metres (see geom.js), so every `repeat`
 * below reads as **texture tiles per metre**. A sandstone tile holds 4 courses
 * across and 12 up, so repeat 0.09 → an 11 m tile → 2.8 × 0.9 m ashlar blocks.
 */

import * as THREE from 'three';
import { LIB, tiled } from './textures.js';

export const MAT = {};

export function buildMaterials() {
  // --- Exterior stone -------------------------------------------------------
  MAT.wall = new THREE.MeshStandardMaterial({
    ...tiled(LIB.sandstone, 0.09),
    color: 0xffffff,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 1.0,
    metalness: 0.0,
  });

  // Open-ended cylinders (chamber drums) need both faces.
  MAT.drum = new THREE.MeshStandardMaterial({
    ...tiled(LIB.sandstone, 0.09),
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  MAT.pier = new THREE.MeshStandardMaterial({
    ...tiled(LIB.sandstone, 0.09),
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1.0,
    metalness: 0.0,
  });

  MAT.cornice = new THREE.MeshStandardMaterial({
    ...tiled(LIB.redstone, 0.14),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 1.0,
    metalness: 0.0,
  });

  MAT.plinth = new THREE.MeshStandardMaterial({
    ...tiled(LIB.plinth, 0.12),
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 1.0,
    metalness: 0.0,
  });

  MAT.paving = new THREE.MeshStandardMaterial({
    ...tiled(LIB.paving, 0.06),
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1.0,
    metalness: 0.0,
  });

  // The roof is a pale stone plaza, not grey paving — it reads almost white
  // against the red parapet in every aerial photograph.
  // Large pale slabs. Built off the sandstone map rather than the grey granite
  // paving — tinting grey toward cream just gives muddy grey.
  MAT.roofStone = new THREE.MeshStandardMaterial({
    ...tiled(LIB.sandstone, 0.07),
    color: 0xfdf2dc,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 1.0,
  });

  // Recessed shadow gaps between the roof's radiating panels.
  MAT.slot = new THREE.MeshStandardMaterial({
    color: 0x1b1e22, metalness: 0.05, roughness: 0.55,
  });

  // The big overlapping skylight panels that make up each roof fan — near-white
  // and the dominant element of the whole roofscape from above.
  MAT.fanPanel = new THREE.MeshStandardMaterial({
    ...tiled(LIB.paving, 0.05),
    color: 0xfbf7ef,
    normalScale: new THREE.Vector2(0.25, 0.25),
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  MAT.step = new THREE.MeshStandardMaterial({
    ...tiled(LIB.paving, 0.25),
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughness: 1.0,
  });

  // --- Screens --------------------------------------------------------------
  // alphaTest (not transparency) so the perforations show up in the shadow map.
  MAT.jaali = new THREE.MeshStandardMaterial({
    ...tiled(LIB.sandstone, 0.5),
    alphaMap: LIB.jaaliStar,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0,
  });
  MAT.jaali.alphaMap.wrapS = MAT.jaali.alphaMap.wrapT = THREE.RepeatWrapping;

  MAT.jaaliParapet = MAT.jaali.clone();
  MAT.jaaliParapet.alphaMap = LIB.jaaliLattice;

  // The roof parapet screen is red sandstone, not beige.
  MAT.jaaliRed = new THREE.MeshStandardMaterial({
    ...tiled(LIB.redstone, 0.35),
    alphaMap: LIB.jaaliStar,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0,
  });

  // --- Metal ----------------------------------------------------------------
  MAT.bronze = new THREE.MeshStandardMaterial({
    ...tiled(LIB.bronze, 1.0),
    metalness: 1.0,
    roughness: 1.0,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });

  MAT.roofSheet = new THREE.MeshStandardMaterial({
    // Seam spacing is set per-surface in UV space (8 seams per tile), not by
    // metres — the ribs should follow the form, not a fixed pitch.
    ...tiled(LIB.roofSheet, 1, 1),
    color: 0xe4e1d9,
    metalness: 0.5,             // painted sheet, not bare mirror-finish metal
    roughness: 1.0,
    normalScale: new THREE.Vector2(1.0, 1.0),
    side: THREE.DoubleSide,     // the petal shells are single-surface
  });

  // The dome wants long, clean seams — the roof-sheet patina reads as crumpled
  // foil once it's wrapped around that much curvature.
  MAT.dome = new THREE.MeshStandardMaterial({
    ...tiled(LIB.roofSheet, 1, 1),
    color: 0xeceae3,
    metalness: 0.4,
    roughness: 1.0,
    normalScale: new THREE.Vector2(0.45, 0.45),
    side: THREE.DoubleSide,
  });

  MAT.gold = new THREE.MeshStandardMaterial({
    color: 0xd4af37, metalness: 1.0, roughness: 0.28,
  });

  // The ceremonial door leaf: beaten sheet gold, brighter and softer than the
  // cast bronze used elsewhere.
  MAT.goldLeaf = new THREE.MeshStandardMaterial({
    ...tiled(LIB.bronze, 0.6),
    color: 0xe8c96a,
    metalness: 1.0,
    roughness: 0.34,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });

  // --- Glazing --------------------------------------------------------------
  // Deliberately *not* `transmission`: that forces an extra full-scene pass for
  // a few square metres of skylight. Alpha + a sharp specular reads the same.
  MAT.window = new THREE.MeshStandardMaterial({
    color: 0x14202b,
    metalness: 0.35,
    roughness: 0.12,
    emissive: 0xffc98a,
    emissiveIntensity: 0.0,
  });

  MAT.skylight = new THREE.MeshStandardMaterial({
    color: 0xcfe0e8,
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  // --- Interiors ------------------------------------------------------------
  MAT.marble = new THREE.MeshPhysicalMaterial({
    ...tiled(LIB.marble, 0.12),
    roughness: 1.0,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });

  MAT.marbleWall = new THREE.MeshPhysicalMaterial({
    ...tiled(LIB.marble, 0.2),
    roughness: 1.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
    normalScale: new THREE.Vector2(0.3, 0.3),
    side: THREE.DoubleSide,
  });

  // Carpet wraps both the tread rings and the open-ended riser cylinders.
  MAT.carpetGreen = new THREE.MeshStandardMaterial({
    ...tiled(LIB.carpetGreen, 0.8),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(1.3, 1.3),
    side: THREE.DoubleSide,
  });

  MAT.carpetRed = new THREE.MeshStandardMaterial({
    ...tiled(LIB.carpetRed, 0.8),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(1.3, 1.3),
    side: THREE.DoubleSide,
  });

  // Upholstery reads a shade deeper than the floor it sits on.
  MAT.cushionGreen = new THREE.MeshStandardMaterial({
    ...tiled(LIB.carpetGreen, 1.4),
    color: 0x9aa89a,
    roughness: 1.0,
    normalScale: new THREE.Vector2(1.6, 1.6),
  });

  MAT.cushionRed = new THREE.MeshStandardMaterial({
    ...tiled(LIB.carpetRed, 1.4),
    color: 0xa89a9a,
    roughness: 1.0,
    normalScale: new THREE.Vector2(1.6, 1.6),
  });

  MAT.wood = new THREE.MeshStandardMaterial({
    ...tiled(LIB.wood, 1.0),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.7, 0.7),
  });

  MAT.woodPanel = new THREE.MeshStandardMaterial({
    ...tiled(LIB.wood, 0.3, 0.6),
    roughness: 1.0,
    normalScale: new THREE.Vector2(0.6, 0.6),
    side: THREE.DoubleSide,
  });

  MAT.plaster = new THREE.MeshStandardMaterial({
    color: 0xf1e9dc, roughness: 0.92, metalness: 0.0,
  });

  MAT.ceilingPeacock = new THREE.MeshStandardMaterial({
    map: LIB.peacock,
    normalMap: LIB.cofferNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.62,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  MAT.ceilingLotus = new THREE.MeshStandardMaterial({
    map: LIB.lotus,
    normalMap: LIB.cofferNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.62,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  // --- Landscape ------------------------------------------------------------
  MAT.grass = new THREE.MeshStandardMaterial({
    ...tiled(LIB.grass, 0.06),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });

  MAT.bark = new THREE.MeshStandardMaterial({
    ...tiled(LIB.bark, 0.6),
    roughness: 1.0,
    normalScale: new THREE.Vector2(1.2, 1.2),
  });

  MAT.foliage = new THREE.MeshStandardMaterial({
    ...tiled(LIB.foliage, 0.55),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(1.0, 1.0),
    side: THREE.DoubleSide,
  });

  MAT.road = new THREE.MeshStandardMaterial({
    ...tiled(LIB.paving, 0.08),
    color: 0x6d6a66,
    roughness: 1.0,
  });

  return MAT;
}

/** Warm the interiors and light the windows once the sun drops. */
export function setNight(amount) {
  if (!MAT.window) return;
  MAT.window.emissiveIntensity = amount * 2.4;
  MAT.gold.roughness = 0.28 - amount * 0.12;
}
