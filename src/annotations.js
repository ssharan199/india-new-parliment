/**
 * What the labels say.
 *
 * Facts are from the Central Vista infographic, NextIAS's piece on the six
 * entrances, and TNPSC Thervu Pettagam's write-up. Where sources disagree — the
 * mapping between the six named dwars and the three ceremonial gates Gyan /
 * Shakti / Karma is reported differently in different places — the label says so
 * rather than picking one silently.
 */

import * as THREE from 'three';
import { P, FLOOR, AXES, CHAMBERS, DOORS, COURT_CENTRE, chamberPos, doorAnchor } from './building.js';

const EXTERIOR = ['aerial', 'plan', 'gate', 'facade', 'roof', 'emblem'];
const v = (x, y, z) => new THREE.Vector3(x, y, z);

/** Roof apex of a chamber, for labels that point at it from outside. */
function chamberTop(i, h) {
  return chamberPos(AXES[i]).setY(h);
}

export function buildAnnotations() {
  const items = [];

  // --- The building itself --------------------------------------------------
  items.push({
    id: 'plan', tag: 'space', views: ['aerial', 'plan', 'roof'],
    kicker: 'The plan',
    title: 'Triangular footprint',
    body: 'Roughly 200 m to a side with cut-back, rounded corners — about 65,000 sq m over four floors, and around 10% smaller in footprint than the old circular building.',
    meta: 'Built by Tata Projects · inaugurated 28 May 2023',
    anchor: v(0, P.parapetTop + 2, 0),
  });

  items.push({
    id: 'facade', tag: 'space', views: ['facade', 'gate'],
    kicker: 'The envelope',
    title: 'Sandstone piers and jaali',
    body: 'A 2.9 m deep Dholpur beige sandstone pier every 5.8 m, with a pierced jaali screen set back behind it and dark glazing behind that. Red sandstone bands bracket the screen zone.',
    anchor: v(Math.cos(AXES[0]) * (P.inradius + 3), FLOOR + 16, -Math.sin(AXES[0]) * (P.inradius + 3)),
  });

  items.push({
    id: 'offices', tag: 'space', views: ['aerial', 'plan', 'facade', 'roof'],
    kicker: 'Perimeter block',
    title: 'Office rooms',
    body: 'State-of-the-art offices on all four floors — the Prime Minister, ministers, the Speaker, rooms for parliamentary committees and leaders, the Parliament Library and canteen.',
    meta: '92 minister offices · 6 committee rooms',
    anchor: v(Math.cos(AXES[2]) * (P.inradius - 6), 20, -Math.sin(AXES[2]) * (P.inradius - 6)),
  });

  items.push({
    id: 'emblem', tag: 'space', views: ['aerial', 'roof', 'emblem'],
    kicker: 'Crowning the hall',
    title: 'National Emblem',
    body: 'The Lion Capital of Ashoka on its inverted lotus bell — four lions back to back, the dharma chakra on the abacus — standing on a stepped triangular podium at the centre of the roof plaza.',
    anchor: v(0, P.wallTop + 12, 0),
    view: 'emblem',
  });

  // --- The three great spaces ----------------------------------------------
  items.push({
    id: 'lok', tag: 'chamber', views: [...EXTERIOR, 'court'],
    kicker: 'Lower house',
    title: 'Lok Sabha Chamber',
    body: 'Designed on the theme of the peacock, India’s national bird. The chamber’s colour scheme is green — carpet and seat cushions both — under a ceiling of peacock-feather motifs.',
    meta: '888 seats (old chamber: 550) · up to 1,272 in joint session',
    anchor: chamberTop(0, FLOOR + 30),
    view: 'lok',
  });

  items.push({
    id: 'rajya', tag: 'chamber', views: [...EXTERIOR, 'court'],
    kicker: 'Upper house',
    title: 'Rajya Sabha Chamber',
    body: 'Designed on the theme of the lotus, the national flower. The scheme here is red — carpet and seat cushions — beneath concentric rings of lotus petals.',
    meta: '384 seats (old chamber: 250)',
    anchor: chamberTop(2, FLOOR + 30),
    view: 'rajya',
  });

  items.push({
    id: 'constitution', tag: 'chamber', views: [...EXTERIOR, 'court'],
    kicker: 'Off the central lounge',
    title: 'Constitution Hall',
    body: 'Reached from the central lounge, with the Lok Sabha and Rajya Sabha chambers on either side of it. It holds a copy of the Constitution and showcases India’s democratic heritage.',
    anchor: v(COURT_CENTRE.x * 0.45, FLOOR + 12, COURT_CENTRE.z * 0.45),
  });

  items.push({
    id: 'courtyard', tag: 'space', views: [...EXTERIOR, 'court'],
    kicker: 'At the centre of the plan',
    title: 'Courtyard with banyan tree',
    body: 'A hexagonal courtyard open to the sky, filling the third bay of the triangle, planted with a banyan — India’s national tree — and its aerial roots. The central lounge sits directly adjacent.',
    anchor: v(COURT_CENTRE.x, FLOOR + 13, COURT_CENTRE.z),
    view: 'court',
  });

  items.push({
    id: 'roofs', tag: 'space', views: ['roof', 'aerial', 'emblem'],
    kicker: 'Above the chambers',
    title: 'Skylight fans',
    body: 'The roof is flat. What reads as a shell from the air is a fan of narrow skylight slots set flush into the stone deck above each chamber, separated by pale wedges with red sandstone ribs.',
    anchor: chamberTop(0, P.wallTop + 2),
    view: 'roof',
  });

  // --- The six dwars --------------------------------------------------------
  for (const d of DOORS) {
    items.push({
      id: `door-${d.key}`, tag: 'door', views: ['aerial', 'plan', 'gate', 'facade', 'doors'],
      kicker: d.kind === 'ceremonial' ? 'Ceremonial entrance' : 'Public entrance',
      title: d.name,
      body: `Named for the ${d.creature}. ${d.meaning}`,
      meta: `${d.side} side · ${d.kind === 'ceremonial' ? 'ceremonial gate' : 'public gate'}`,
      anchor: doorAnchor(d),
    });
  }

  items.push({
    id: 'doors-overview', tag: 'door', views: ['aerial', 'plan', 'doors'],
    kicker: 'Six doors',
    title: 'Three ceremonial, three public',
    body: 'Six gates named after real and mythological creatures from Indian folklore. Three ceremonial entrances are reserved for the President, Prime Minister, Speaker and other dignitaries; three are public.',
    meta: 'Also called Gyan, Shakti and Karma — knowledge, strength, duty. Sources differ on which named dwar is which.',
    anchor: v(0, FLOOR + 34, 0),
  });

  // --- Chamber interiors ----------------------------------------------------
  // Anchors are given in chamber-local coordinates and mapped out through the
  // group's own transform, so they stay put if a chamber moves. Local -Z is
  // toward the courtyard, which is where the dais sits.
  const inChamber = (axisIdx, lx, ly, lz) => {
    const axis = AXES[axisIdx];
    const yaw = axis + Math.PI / 2;              // matches faceOutward()
    const c = chamberPos(axis);
    return new THREE.Vector3(
      c.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
      FLOOR + ly,
      c.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
    );
  };

  const chambers = [
    {
      c: 0, key: 'lok', house: 'Lok Sabha', colour: 'Green',
      ceilTitle: 'Peacock ceiling',
      ceilBody: 'Rings of peacock-feather eyes with their barbs fanning out — the national bird, and the motif that gives the whole chamber its theme.',
      carpetBody: 'Green carpet and green seat cushions run through the whole chamber. Eight tiers of teak benches rise away from the well.',
      seats: '888 seats — 550 in the old chamber',
    },
    {
      c: 2, key: 'rajya', house: 'Rajya Sabha', colour: 'Red',
      ceilTitle: 'Lotus ceiling',
      ceilBody: 'Concentric rings of lotus petals radiating from a gilded boss — the national flower, and the theme of this chamber.',
      carpetBody: 'Red carpet and red seat cushions, with the same teak joinery and tiered horseshoe as the Lok Sabha.',
      seats: '384 seats — 250 in the old chamber',
    },
  ];

  for (const s of chambers) {
    const at = (lx, ly, lz) => inChamber(s.c, lx, ly, lz);
    // Also scoped to the cutaway: with the roofs lifted you are looking straight
    // down into both chambers, so every interior callout should be reachable
    // there too, not only from inside the room.
    const add2 = (id, kicker, title, body, anchor, meta) =>
      items.push({ id: `${s.key}-${id}`, tag: 'chamber', views: [s.key, 'plan'], kicker, title, body, meta, anchor });

    add2('ceiling', 'Overhead', s.ceilTitle, s.ceilBody, at(0, 15.5, -5));
    add2('dais', 'Front of the chamber', 'Speaker’s dais',
      'The presiding officer’s chair on its raised podium, backed by a teak panel with the chamber crest in a bronze surround.',
      at(0, 5.2, -8.6));
    add2('well', 'Centre', 'The well of the House',
      'The open floor between the dais and the first tier of benches, where members speak from and where the House gathers.',
      at(0, 0.9, -1.5));
    add2('benches', 'Seating', `${s.colour} benches`, s.carpetBody, at(6.5, 1.6, 5.5), s.seats);
    add2('desks', 'At every place', 'Teak desks and consoles',
      'Two members share each bench. Every place has its own desk with a digital console — the chamber runs an electronic voting system.',
      at(-6.5, 1.9, 5.5));
    add2('gallery', 'Above the benches', 'Press and public galleries',
      'The balcony ring running around the chamber above the panelling, carrying press and visitor seating.',
      at(-12, 9.2, 2));
    add2('panel', 'Chamber wall', 'Teak panelling',
      'The drum wall is lined in teak to head height and in pale stone above, which is what gives the chamber its acoustics.',
      at(12.5, 7, -4));
  }

  // --- Courtyard ------------------------------------------------------------
  const cc = COURT_CENTRE;
  items.push({
    id: 'court-roots', tag: 'space', views: ['court', 'plan'],
    kicker: 'Around the trunk', title: 'Aerial roots',
    body: 'The banyan drops aerial roots from its limbs, which thicken into secondary trunks — the habit that lets a single tree spread indefinitely.',
    anchor: v(cc.x + 5.5, FLOOR + 6, cc.z + 3.5),
  });
  items.push({
    id: 'court-floor', tag: 'space', views: ['court', 'plan'],
    kicker: 'Underfoot', title: 'Marble inlay',
    body: 'A marble disc set into the hexagonal court paving beneath the tree, ringed by a raised sandstone planter.',
    anchor: v(cc.x - 7, FLOOR + 0.4, cc.z + 5),
  });
  items.push({
    id: 'court-colonnade', tag: 'space', views: ['court', 'plan'],
    kicker: 'Around the inner face', title: 'Gallery colonnade',
    body: 'A colonnade runs the full inner face of the perimeter block, opening the office ring onto the interior on every floor.',
    anchor: v(Math.cos(AXES[0]) * 36, FLOOR + 11, -Math.sin(AXES[0]) * 36),
  });

  items.push({
    id: 'lounge', tag: 'space', views: ['court', 'plan'],
    kicker: 'Adjacent to the courtyard',
    title: 'Central lounge',
    body: 'The lounge sits directly beside the central courtyard, open to the banyan. MPs and visitors with special permission are allowed entry, and the Constitution Hall opens off it.',
    anchor: v(Math.cos(AXES[1]) * 14, FLOOR + 6, -Math.sin(AXES[1]) * 14),
  });

  return items;
}

export const TAGS = [
  { key: 'all', label: 'All' },
  { key: 'chamber', label: 'Chambers' },
  { key: 'door', label: 'Doors' },
  { key: 'space', label: 'Spaces' },
];

void CHAMBERS;
