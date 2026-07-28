/**
 * Scene setup, sun/sky, camera choreography and UI.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

import * as TEX from './textures.js';
import { buildMaterials, MAT, setNight } from './materials.js';
import { buildParliament, AXES, chamberPos, COURT_CENTRE as COURT } from './building.js';
import { buildSite } from './environment.js';
import { createPipeline } from './postfx.js';
import { LabelLayer } from './labels.js';
import { buildAnnotations, TAGS } from './annotations.js';
import { ScriptPanel } from './script.js';

const canvasHost = document.body;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Tone mapping is handled in postfx.js; the renderer hands over linear HDR.
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.preserveDrawingBuffer = true;   // lets the "save still" button work
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.4, 6000);
camera.position.set(215, 132, 260);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 900;
controls.target.set(0, 18, 0);

// ---------------------------------------------------------------------------
// Sky, sun, environment
// ---------------------------------------------------------------------------

const sky = new Sky();
sky.scale.setScalar(20000);
scene.add(sky);
sky.material.uniforms.turbidity.value = 6.5;
sky.material.uniforms.rayleigh.value = 2.2;
sky.material.uniforms.mieCoefficient.value = 0.006;
sky.material.uniforms.mieDirectionalG.value = 0.82;

const sun = new THREE.DirectionalLight(0xffffff, 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 900;
// Tight frustum: 4096 texels over 300 m is ~7 cm per texel, enough to resolve
// the shadow a single pier throws across the wall behind it.
const SH = 150;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.25;
sun.target.position.set(0, 12, 0);
scene.add(sun, sun.target);

const bounce = new THREE.HemisphereLight(0xbcd4ef, 0x6b5b42, 0.55);
scene.add(bounce);

// Warm interior fill so the chambers read once the roofs come off: one lamp in
// the court, one hanging in each chamber.
const interiorLamps = [new THREE.Vector3(0, 16, 0), ...AXES.map((a) => chamberPos(a).setY(15))]
  .map((p) => {
    const l = new THREE.PointLight(0xffdcae, 0, 120, 2);
    l.position.copy(p);
    scene.add(l);
    return l;
  });
const setInteriorLights = (v) => interiorLamps.forEach((l) => (l.intensity = v));

scene.fog = new THREE.FogExp2(0xbfc9cf, 0.00065);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envRT = null;
let fx = null;

// An unlit lower hemisphere, added only to the probe scene, so the environment
// map carries ground bounce instead of a black floor.
// Radius stays well inside the far plane passed to fromScene() below — unlike
// Sky, a plain mesh gets clipped and would contribute nothing.
const groundBounce = new THREE.Mesh(
  new THREE.SphereGeometry(60, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x8d8778, side: THREE.BackSide }),
);

const sunState = { elevation: 34, azimuth: 146 };

function applySun(regenerateEnv = true) {
  const phi = THREE.MathUtils.degToRad(90 - sunState.elevation);
  const theta = THREE.MathUtils.degToRad(sunState.azimuth);
  const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

  sky.material.uniforms.sunPosition.value.copy(dir);
  sun.position.copy(dir).multiplyScalar(400);

  // Colour + strength of the sun as it drops toward the horizon.
  const e = THREE.MathUtils.clamp(sunState.elevation, -4, 82);
  const low = THREE.MathUtils.clamp(1 - e / 24, 0, 1);          // 1 at horizon
  const night = THREE.MathUtils.clamp(-e / 4 + 0.25, 0, 1);

  sun.intensity = THREE.MathUtils.lerp(3.2, 0.12, Math.pow(low, 1.35));
  sun.color.setHSL(0.09 - low * 0.03, 0.28 + low * 0.55, 0.62 - low * 0.06);

  bounce.intensity = THREE.MathUtils.lerp(0.6, 0.14, low);
  bounce.color.setHSL(0.58, 0.35, THREE.MathUtils.lerp(0.72, 0.3, low));

  sky.material.uniforms.turbidity.value = 5.5 + low * 5;
  sky.material.uniforms.rayleigh.value = 1.6 + low * 2.4;

  fx?.setExposure(THREE.MathUtils.lerp(1.08, 1.6, low));
  scene.fog.color.setHSL(0.08 + (1 - low) * 0.5, 0.16 + low * 0.35, THREE.MathUtils.lerp(0.78, 0.24, low));
  scene.fog.density = 0.00034 + low * 0.00045;

  setNight(Math.max(night, low * 0.55));
  setInteriorLights(cutaway ? 520 + night * 700 : 0);

  if (regenerateEnv) {
    envRT?.dispose();
    const skyScene = new THREE.Scene();
    skyScene.add(sky, groundBounce);
    // Ground bounce matters: a sky-only environment leaves the lower hemisphere
    // black, so every downward-facing surface goes dead and the whole model
    // reads flat. The lit lawn/plaza colour goes into the probe too.
    groundBounce.material.color
      .setHSL(0.19, 0.34, THREE.MathUtils.lerp(0.30, 0.06, low))
      .lerp(new THREE.Color(0xb9ac96), 0.45);
    envRT = pmrem.fromScene(skyScene, 0, 0.1, 1000);
    scene.environment = envRT.texture;
    scene.environmentIntensity = THREE.MathUtils.lerp(0.85, 0.3, low);
    scene.add(sky);
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const loader = document.getElementById('loader');
const bar = document.querySelector('#bar i');
const loadmsg = document.getElementById('loadmsg');

let parliament, cutaway = false;
let labels = null, script = null, currentView = 'aerial';

const LABEL_BUTTONS = { hover: 'lblHover', cards: 'lblCards', dots: 'lblDots', off: 'lblOff' };

(async function init() {
  TEX.setRenderer(renderer);
  await TEX.buildAll((t, label) => {
    bar.style.width = `${Math.round(t * 100)}%`;
    loadmsg.textContent = `${label}…`;
  });

  buildMaterials();
  loadmsg.textContent = 'assembling the building…';
  await frame();

  parliament = buildParliament();
  scene.add(parliament);
  await frame();

  loadmsg.textContent = 'planting the Central Vista…';
  await frame();
  scene.add(buildSite());

  loadmsg.textContent = 'compiling post-processing…';
  await frame();
  try {
    fx = createPipeline(renderer, scene, camera);
  } catch (err) {
    // The pipeline comes off a CDN; if it can't load, keep the scene usable.
    console.warn('post-processing unavailable, falling back to direct render:', err);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
  }

  labels = new LabelLayer(camera, document.getElementById('labels'));
  labels.setItems(buildAnnotations());
  labels.onCardClick((view) => goTo(view));
  labels.attachPointer(renderer.domElement);

  applySun(true);
  countTriangles();
  buildUI();
  goTo('aerial', 0);

  loader.classList.add('done');
  setTimeout(() => loader.remove(), 900);

  // Handle for the console and for automated stills.
  window.app = { renderer, scene, camera, controls, goTo, setCutaway, views: VIEWS, fx, ready: true };
  animate();
})();

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ---------------------------------------------------------------------------
// Camera choreography
// ---------------------------------------------------------------------------

function chamberView(axisIdx, height, back) {
  const c = chamberPos(AXES[axisIdx]);
  const outward = c.clone().normalize();
  return {
    // Aimed above the dais so the motif ceiling and the gallery ring stay in
    // frame along with the benches.
    pos: c.clone().addScaledVector(outward, back).setY(height),
    target: c.clone().addScaledVector(outward, -7).setY(14.5),
  };
}

const VIEWS = {
  aerial: {
    label: 'Aerial approach',
    text: 'Triangular plan, roughly 200 m to a side. Dholpur beige sandstone piers with pierced jaali screens; red sandstone plinth, string courses and cornice.',
    pos: new THREE.Vector3(232, 168, 268),
    target: new THREE.Vector3(0, 16, 0),
  },
  gate: {
    label: 'Ceremonial entrance',
    text: 'One of three ceremonial entrances. Six columns for the building’s six doors, a bronze door leaf in a carved surround, flanked by lion pedestals.',
    pos: new THREE.Vector3(0, 15, -168),
    target: new THREE.Vector3(0, 22, -70),
  },
  facade: {
    label: 'Facade detail',
    text: 'The bay rhythm: a 2.9 m deep pier every 5.8 m, jaali screen set back 0.75 m, dark glazing behind that. Every stone map — albedo, normal, roughness — is generated in-browser.',
    pos: new THREE.Vector3(74, 9, -92),
    target: new THREE.Vector3(30, 20, -58),
  },
  court: {
    label: 'Banyan courtyard',
    text: 'The central court, open to the sky, with the banyan — India’s national tree — and its aerial roots at the centre of the plan.',
    pos: new THREE.Vector3(COURT.x * 0.35, 12, COURT.z * 0.35),
    target: new THREE.Vector3(COURT.x, 10, COURT.z),
    cut: true,
  },
  lok: {
    label: 'Lok Sabha chamber',
    text: '888 seats under a peacock ceiling — India’s national bird. Green carpet, teak benches, eight tiers rising away from the Speaker’s dais.',
    ...chamberView(0, 11.5, 15.2),
    cut: true,
  },
  rajya: {
    label: 'Rajya Sabha chamber',
    text: '384 seats under a lotus ceiling — the national flower. Red carpet and cushions, the same teak joinery and tiered horseshoe as the Lok Sabha.',
    ...chamberView(2, 11.5, 15.2),
    cut: true,
  },
  emblem: {
    label: 'National Emblem',
    text: 'The Lion Capital of Ashoka on its lotus bell, above the ribbed dome of the Constitution Hall.',
    pos: new THREE.Vector3(24, 44, 26),
    target: new THREE.Vector3(0, 35, 0),
  },
  plan: {
    label: 'Cutaway',
    text: 'Roofs lifted off, the way the Central Vista infographic draws it — the two debating chambers and the Constitution Hall around the banyan courtyard, ringed by four floors of offices.',
    pos: new THREE.Vector3(148, 168, 186),
    target: new THREE.Vector3(0, 6, 0),
    cut: 'all',
  },
  doors: {
    label: 'The six dwars',
    text: 'Six gates named for real and mythological creatures — Gaja, Ashwa and Garuda as ceremonial entrances on the three facades; Makara, Shardula and Hamsa as public entrances on the rounded corners.',
    pos: new THREE.Vector3(0, 240, 236),
    target: new THREE.Vector3(0, 10, 0),
  },
  roof: {
    label: 'Roof plaza',
    text: 'The roof is flat — a pale stone plaza edged by a red jaali parapet. The fans are arrays of skylight slots set into the deck above each chamber, not shells. The Lion Capital stands on a stepped triangular podium at the centre.',
    pos: new THREE.Vector3(72, 74, 82),
    target: new THREE.Vector3(0, 28, 0),
  },
};

let tween = null;

function goTo(key, ms = 1500) {
  const v = VIEWS[key];
  if (!v) return;
  currentView = key;
  labels?.setView(key);
  document.getElementById('capTitle').textContent = v.label;
  document.getElementById('capText').textContent = v.text;
  [...document.querySelectorAll('#views button')].forEach((b) =>
    b.classList.toggle('on', b.dataset.k === key));

  // Interior views need the shells off; every other view puts them back, so the
  // preset tour is self-consistent however you jump around it.
  const want = v.cut === true ? 'roof' : (v.cut || false);
  if (want !== cutaway) setCutaway(want);

  if (ms <= 0) {
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    return;
  }
  tween = {
    t: 0, ms,
    p0: camera.position.clone(), p1: v.pos.clone(),
    t0: controls.target.clone(), t1: v.target.clone(),
  };
}

function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + (dt * 1000) / tween.ms);
  const k = tween.t < 0.5
    ? 4 * tween.t ** 3
    : 1 - Math.pow(-2 * tween.t + 2, 3) / 2;      // easeInOutCubic
  camera.position.lerpVectors(tween.p0, tween.p1, k);
  controls.target.lerpVectors(tween.t0, tween.t1, k);
  if (tween.t >= 1) tween = null;
}

// ---------------------------------------------------------------------------
// Cutaway
// ---------------------------------------------------------------------------

/**
 * Three levels, because the two interesting insides are at different depths:
 *   false   everything on
 *   'roof'  outer shells off — the motif ceilings stay, which is what you want
 *           standing inside a chamber
 *   'all'   ceilings off too — the infographic's plan cutaway, seating visible
 */
function setCutaway(level) {
  cutaway = level === true ? 'roof' : (level || false);
  const hideRoof = !!cutaway;
  const hideCeiling = cutaway === 'all';

  parliament.traverse((o) => {
    if (o.userData.layer === 'roof') o.visible = !hideRoof;
    else if (o.userData.layer === 'ceiling') o.visible = !hideCeiling;
  });

  const btn = document.getElementById('btnCut');
  btn.textContent = cutaway === 'all' ? 'Cutaway: full' : cutaway ? 'Cutaway: roofs' : 'Cutaway';
  btn.classList.toggle('on', !!cutaway);
  setInteriorLights(cutaway ? 520 : 0);
}

const CUT_CYCLE = { false: 'roof', roof: 'all', all: false };

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

let autoOrbit = false;

function buildUI() {
  const views = document.getElementById('views');
  const order = [
    ['aerial', 'Aerial'], ['plan', 'Cutaway'], ['gate', 'Entrance'],
    ['facade', 'Facade'], ['court', 'Courtyard'], ['lok', 'Lok Sabha'],
    ['rajya', 'Rajya Sabha'], ['emblem', 'Emblem'],
    ['roof', 'Roof plaza'], ['doors', 'Six dwars'],
  ];
  for (const [k, label] of order) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.k = k;
    b.onclick = () => goTo(k);
    views.appendChild(b);
  }

  document.getElementById('btnCut').onclick = () => setCutaway(CUT_CYCLE[cutaway]);

  const orbitBtn = document.getElementById('btnOrbit');
  orbitBtn.onclick = () => {
    autoOrbit = !autoOrbit;
    orbitBtn.classList.toggle('on', autoOrbit);
  };

  const texBtn = document.getElementById('btnTex');
  const texPanel = document.getElementById('tex');
  texBtn.onclick = () => {
    const open = texPanel.classList.toggle('open');
    texBtn.classList.toggle('on', open);
    if (open && !texPanel.dataset.filled) fillSwatches();
  };

  document.getElementById('btnShot').onclick = () => {
    if (fx) fx.render(0.016); else renderer.render(scene, camera);
    const a = document.createElement('a');
    a.download = 'sansad-bhavan.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();
  };

  buildLabelUI();
  buildScriptUI();
  buildFxUI();

  const sunEl = document.getElementById('sun');
  const aziEl = document.getElementById('azi');
  const sunVal = document.getElementById('sunval');
  const aziVal = document.getElementById('azival');

  const live = () => {
    sunState.elevation = +sunEl.value;
    sunState.azimuth = +aziEl.value;
    sunVal.textContent = `${sunEl.value}°`;
    aziVal.textContent = `${aziEl.value}°`;
    applySun(false);
  };
  const settle = () => applySun(true);

  sunEl.oninput = aziEl.oninput = live;
  sunEl.onchange = aziEl.onchange = settle;

  addEventListener('keydown', (e) => {
    const map = {
      1: 'aerial', 2: 'plan', 3: 'gate', 4: 'facade', 5: 'court',
      6: 'lok', 7: 'rajya', 8: 'emblem', 9: 'roof', 0: 'doors',
    };
    if (map[e.key]) goTo(map[e.key]);
    if (e.key.toLowerCase() === 'c') setCutaway(CUT_CYCLE[cutaway]);
    if (e.key.toLowerCase() === 't') texBtn.click();
    if (e.key.toLowerCase() === 's') document.getElementById('btnScript').click();
    // L cycles hover -> all -> dots -> off, so labels can be dropped in one key.
    if (e.key.toLowerCase() === 'l') {
      const next = { hover: 'cards', cards: 'dots', dots: 'off', off: 'hover' }[labels.mode];
      document.getElementById(LABEL_BUTTONS[next]).click();
    }
  });
}

function buildScriptUI() {
  const panel = document.getElementById('script');
  const btn = document.getElementById('btnScript');
  const playBtn = document.getElementById('scriptPlay');

  script = new ScriptPanel(document.getElementById('beats'), {
    goTo: (view) => goTo(view),
    // Cards can't be hovered by a walkthrough, so beats pin theirs open.
    pin: (id) => labels.pin(id),
  });
  script.onStop = () => { playBtn.textContent = '▶ Play'; playBtn.classList.remove('on'); };

  btn.onclick = () => {
    const open = panel.classList.toggle('open');
    btn.classList.toggle('on', open);
    document.body.classList.toggle('scripting', open);
    if (!open) script.stop();
  };

  playBtn.onclick = () => {
    if (script.playing) { script.stop(); return; }
    playBtn.textContent = '■ Stop';
    playBtn.classList.add('on');
    script.play(Math.max(0, script.active));
  };
}

function buildLabelUI() {
  const syncModes = () => Object.entries(LABEL_BUTTONS).forEach(([m, id]) =>
    document.getElementById(id).classList.toggle('on', labels.mode === m));

  for (const [m, id] of Object.entries(LABEL_BUTTONS)) {
    document.getElementById(id).onclick = () => { labels.setMode(m); syncModes(); };
  }

  const host = document.getElementById('lblTags');
  const chips = TAGS.map(({ key, label }) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      labels.setFilter(key);
      chips.forEach((o) => o.classList.toggle('on', o === b));
    };
    host.appendChild(b);
    return b;
  });
  chips[0].classList.add('on');

  labels.setMode('hover');
  syncModes();
}

/** The realism panel only exists when the post-processing pipeline loaded. */
function buildFxUI() {
  if (!fx) return;
  document.getElementById('fxGroup').style.display = '';

  const toggle = (id, key) => {
    const b = document.getElementById(id);
    const sync = () => b.classList.toggle('on', !!fx.state[key]);
    b.onclick = () => { fx.state[key] = !fx.state[key]; fx.apply(); sync(); };
    sync();
  };
  toggle('fxAO', 'ao');
  toggle('fxBloom', 'bloom');
  toggle('fxSMAA', 'smaa');
  toggle('fxHalf', 'halfResAO');
  toggle('fxAOOnly', 'aoOnly');

  document.getElementById('fxQualityGroup').style.display = '';
  const qHost = document.getElementById('aoQuality');
  const qButtons = fx.qualities.map((q) => {
    const b = document.createElement('button');
    b.textContent = q;
    b.onclick = () => {
      fx.setQuality(q);
      qButtons.forEach((o) => o.classList.toggle('on', o === b));
    };
    qHost.appendChild(b);
    return b;
  });
  qButtons[fx.qualities.indexOf(fx.state.quality)]?.classList.add('on');

  const int = document.getElementById('aoInt');
  const rad = document.getElementById('aoRad');
  int.oninput = () => {
    fx.setAOIntensity(+int.value);
    document.getElementById('aoIntVal').textContent = int.value;
  };
  rad.oninput = () => {
    fx.setAORadius(+rad.value);
    document.getElementById('aoRadVal').textContent = `${rad.value} px`;
  };
}

function fillSwatches() {
  const host = document.getElementById('swatches');
  for (const { name, canvas } of TEX.gallery) {
    const wrap = document.createElement('div');
    wrap.className = 'sw';
    wrap.appendChild(canvas);
    const cap = document.createElement('span');
    cap.textContent = name;
    wrap.appendChild(cap);
    host.appendChild(wrap);
  }
  document.getElementById('tex').dataset.filled = '1';
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let acc = 0, frames = 0;
const statsEl = document.getElementById('stats');

/** Triangles in the scene graph, counted once (instances included). */
let sceneTris = 0;
function countTriangles() {
  let n = 0;
  scene.traverse((o) => {
    const idx = o.geometry?.index;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    n += ((idx ? idx.count : pos.count) / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  sceneTris = Math.round(n / 1000);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  stepTween(dt);
  if (autoOrbit && !tween) {
    const r = camera.position.clone().sub(controls.target);
    const a = Math.atan2(r.z, r.x) + dt * 0.045;
    const d = Math.hypot(r.x, r.z);
    camera.position.set(controls.target.x + Math.cos(a) * d, camera.position.y, controls.target.z + Math.sin(a) * d);
  }

  controls.update();
  if (fx) fx.render(dt); else renderer.render(scene, camera);
  labels?.update();

  acc += dt; frames++;
  if (acc > 0.5) {
    // renderer.info resets per render call, so with a composer it only ever
    // describes the final full-screen pass. Report the scene's own totals.
    statsEl.textContent =
      `${Math.round(frames / acc)} fps · ${sceneTris}k tris · ${fx ? 'postfx' : 'direct'}`;
    acc = 0; frames = 0;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  fx?.setSize(innerWidth, innerHeight);
});
