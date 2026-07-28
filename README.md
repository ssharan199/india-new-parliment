# Sansad Bhavan — New Parliament House, in Three.js

A real-time model of India's new Parliament building (Central Vista, New Delhi),
built entirely in code. **No downloaded assets** — every texture is painted into
a canvas at load time and every piece of geometry is generated procedurally.

## Running it

ES modules need an `http://` origin, so double-clicking `index.html` won't work.
From this folder:

```bash
python -m http.server 8181 --bind 127.0.0.1
# or:  npx serve -l 8181 .
```

then open <http://localhost:8181/>. On Windows you can just run `start.cmd`.

(Port 8181 rather than 8000 on purpose — 8000 is a common default and is easy to
collide with. If the page that opens isn't this one, another server owns the port.)

First load spends 2–4 seconds generating textures; the loader shows progress.

## Controls

| | |
|---|---|
| drag / scroll | orbit, zoom |
| `1`–`0` | jump to a view |
| hover a marker | open that label; click to pin it open |
| `C` | cutaway — lift the roofs off |
| `L` | labels: on hover → show all → markers → hidden |
| `S` | script walkthrough — click a line to fly to it, or Play the whole thing |
| `T` | texture inspector |
| sun sliders | elevation and azimuth, live |
| realism panel | AO / bloom / SMAA toggles, AO intensity and radius |

`window.app` is exposed in the console (`app.goTo('lok')`, `app.setCutaway(true)`).

## The textures

This is where most of the work went. `src/textures.js` generates a full PBR set
— albedo, normal, roughness — for each material, from seeded, **tileable** value
noise (`src/noise.js`). Normals are Sobel-derived from a height channel painted
alongside the colour, with wrapped sampling so nothing seams.

| Material | What the generator does |
|---|---|
| Dholpur beige sandstone | fBm body + stretched bedding planes + quartz speckle, cut by an ashlar grid with running bond; joints darken, sink and roughen, and each block gets its own tone drift. Rain-wash streaks run down the face. |
| Bansi Paharpur red sandstone | same generator, redder ramp and a tighter course |
| Makrana marble | domain-warped sine field for the veining, a second pass for hairline veins and a third for gold; veins polish duller than the field, so roughness tracks the pattern |
| Chamber carpet | fibre hash + tuft noise + a woven warp/weft beat, with a gold diamond motif; roughness pinned near 1.0 |
| Teak | warped ring field, open pores dropped below the lacquer in both height and roughness |
| Bronze / roof sheet | oxidation blotch mask blended over base metal, plus optional standing seams that lift the height map |
| Jaali screen | 2D canvas ops — octagonal voids ringed by diamonds — used as an **alpha map with `alphaTest`**, so the perforations show up in the shadow map, not just the colour pass |
| Peacock / lotus ceilings | drawn with canvas paths: three rings of feather eyes with barbs (Lok Sabha), three rings of petals (Rajya Sabha) |
| Lawn, bark, foliage | patch/clump noise, ridged fissures, leaf-cluster fBm |

Open the **texture inspector** in the UI to see every generated map.

### Texel density

House rule: **all UVs are in metres.** `src/geom.js` provides `box()`, `cylUV()`
and `discUV()` to convert primitives, so a material's `repeat` reads as *texture
tiles per metre* and the same stone is the same size on a 200 m facade and on a
1.5 m pier. A sandstone tile holds 4 courses across and 12 up, so `repeat 0.09`
gives an 11 m tile → 2.8 × 0.9 m ashlar blocks.

## The building

Triangular plan, ~200 m to a side, corners cut back and rounded. Dimensions live
in `P` at the top of `src/building.js`.

- **Perimeter block** — a solid ring extrusion, four storeys, its top cap doubling
  as the roof terrace. 108 bays are marched around the plan with
  `perimeterFrames()`: a 2.9 m deep pier at each station, a jaali screen set back
  0.75 m, dark glazing behind that, and red bands bracketing the screen zone top
  and bottom. Bays falling within 19 m of a facade axis are dropped so the
  ceremonial entrance can take their place.
- **Six dwars** — three ceremonial entrances on the facade axes (fourteen-step
  flights, six columns, bronze leaves in a carved surround, flanked by creature
  pedestals) and three smaller public entrances on the rounded corners.
- **The roof is flat** — a pale stone plaza spanning the whole triangle, edged
  by a red sandstone parapet with a pierced jaali screen, and carrying the Lion
  Capital on a stepped triangular podium with a colonnaded drum.

  I got this wrong twice. First as faceted petal shells and a ribbed dome; then,
  after correcting to a flat deck, as thin radial slots on a mostly-empty plaza.
  What the aerials actually show is a spread of **twelve big near-white panels**
  per fan, like the leaves of a hand fan, each raised off the deck with a shadow
  gap and alternating slightly in height so they overlap. The panels *are* the
  roof; the deck is only the margin around them. Nothing of the chambers
  projects above the roofline.
- **Two chamber volumes, not three.** The third bay of the triangle is the open
  hexagonal banyan court — a green void where a third drum would otherwise sit —
  and the emblem podium stands alone at the centre. I originally had a central
  courtyard and three drums, which is not what the plan does.
- **A red base, a beige body.** The bottom storey is red sandstone up to a
  moulded cornice; everything above is Dholpur beige. That split does most of
  the recognition work in a silhouette.
- **Banyan court** at the centre, open to the sky through a hexagonal void in the
  inner roof deck, with aerial roots.
- **National Emblem** — the Lion Capital on its inverted lotus bell, above the
  Constitution Hall dome.

Everything is tagged `userData.layer` (`shell` / `roof` / `ceiling` / `interior`)
so the cutaway strips the outer shells in one traversal while leaving the motif
ceilings in place.

## Annotations

`src/labels.js` + `src/annotations.js`. Two layouts:

- **On hover** (default) — every anchor gets a marker, and only the one you
  point at opens a card beside it. Click to pin it open. Twenty cards at once
  buries the model you're trying to look at, so browsing beats broadcasting.
- **Show all** — the printed-diagram layout: every card at once in the left and
  right gutters, joined to its anchor by an elbowed leader line.

In gutter mode each anchor is projected to screen space every frame, cards are
assigned a gutter and de-overlapped by a greedy vertical stack, and the leaders
are drawn into a single SVG.

Hover picks the nearest marker within 34 px of the cursor, with a sticky band at
3× that radius: the card sits ~20 px off the marker, so a hard cutoff closes it
in the gap before the cursor can reach it.

In hover mode **no markers are drawn until one is in range** — a permanent
constellation of dots is exactly the clutter hover mode exists to avoid. The
cursor is tracked on `window` rather than the canvas, because the HUD and
caption sit above the canvas and swallow its pointer events, which would make
any marker behind a panel unreachable.

Two things that are easy to get wrong here:

- **Hysteresis.** Side assignment has a dead zone around the pivot. Without it a
  card ping-pongs between gutters every time its anchor crosses the centre line
  during an orbit. But the stickiness has to be *cleared on a view change*,
  otherwise every card stays in whichever gutter it last occupied and one column
  ends up overloaded while the other sits empty.
- **The gutters aren't the window edges.** The HUD sits above the label layer on
  the left and the texture inspector on the right, so both insets are measured
  from those panels at runtime. Placed at the raw window edge, left-column cards
  render *underneath* the HUD and simply never appear. Note the panels are
  `position: fixed`, and `offsetParent` is always `null` for fixed elements — a
  visibility check based on it reports them hidden and puts the bug straight
  back. Measure `getBoundingClientRect().width` instead.

Cards that still don't fit a column spill to the other one; anything left over
is dropped for that frame, but its anchor dot stays visible.

Labels are scoped per view and tagged Chambers / Doors / Spaces for filtering.
Cards with a target view are clickable. `L` cycles the modes.

Interior views are annotated as densely as the exterior: each debating chamber
carries markers for its motif ceiling, the Speaker's dais, the well of the
House, the benches, the desk consoles, the press and public galleries and the
teak panelling. Those anchors are authored in **chamber-local coordinates** and
pushed out through the group's own transform, so they follow the chamber if it
moves rather than needing to be re-measured in world space.

### The six dwars

Modelled as three ceremonial gates at the middle of each facade and three public
entrances on the rounded corners:

| Dwar | Creature | Symbolises | Side | Type |
|---|---|---|---|---|
| Gaja | Elephant | Intellect, memory, wealth, wisdom | North | Ceremonial |
| Ashwa | Horse | Power, strength, courage | South | Ceremonial |
| Garuda | King of birds, Vishnu's mount | Power and dharma | East | Ceremonial |
| Makara | Part-mammal, part-fish | Unity in diversity | West | Public |
| Shardula | Lion-tiger hybrid | The power of the people | South-east | Public |
| Hamsa | Swan | Self-realisation, moksha | North-east | Public |

The three ceremonial doors are also spoken of as **Gyan, Shakti and Karma** —
knowledge, strength and duty. Sources disagree on which named dwar maps to
which: [NextIAS](https://www.nextias.com/ca/current-affairs/18-09-2023/entrances-of-indias-new-parliament)
pairs Gaja/Ashwa/Garuda with Gyan/Shakti/Karma, while
[Business Today](https://www.businesstoday.in/visualstories/news/what-do-the-six-entrances-to-the-new-parliament-symbolise-know-all-about-how-they-honour-indian-folklore-and-culture-64393-21-09-2023)
describes the six dwars without making that link. The label says so rather than
picking one silently. Sides are the real building's — this model's triangle is
oriented to its own facade axes, so read them as which-door-is-which.

Chamber facts (888 / 384 seats, peacock and lotus themes, the joint-session
figure of 1,272, 65,000 sq m over four floors) are from the Central Vista
infographic and [TNPSC Thervu Pettagam](https://www.tnpscthervupettagam.com/articles-detail/the-new-parliament-of-india-%E2%80%93-part-1).

## Script walkthrough

`src/script.js` + [script-hi.md](script-hi.md). The Hinglish voiceover script is
data, not just prose: each beat carries the camera preset it belongs to and,
optionally, the annotation it should open. Clicking a line flies you there and
pins that card; **Play** walks the whole script on its own timecodes, which
doubles as a preview of the finished reel before any video is rendered.

The pin happens ~900 ms after the camera call, because `goTo()` clears the
pinned card as part of switching views — pinning first would just be undone.

`script-hi.md` is the readable copy for recording; `src/script.js` is the one
the viewer runs. Keep them in step.

## Lighting

Physical sun + sky (three's `Sky`) with the environment map regenerated through
`PMREMGenerator` whenever the sun settles. Sun colour, intensity, sky turbidity,
exposure, fog colour and window emissives are all driven off solar elevation, so
dusk warms and hazes the whole scene in one move.

The probe scene also contains an unlit lower hemisphere tinted to the lit lawn
colour. A sky-only environment leaves the bottom half of the probe black, which
kills every downward-facing surface and is a large part of why an untreated
three.js exterior reads flat.

Shadows are a single 4096² directional map over a 300 m frustum (~7 cm/texel) —
tight enough to resolve one pier's shadow on the wall behind it.

## Post-processing

`src/postfx.js`. The order is: render → **N8AO** → exposure → bloom → **AgX**
tone mapping → contrast/saturation → vignette → **SMAA**.

Ambient occlusion is the single biggest realism win: without contact darkening
every surface floats and the image reads flat no matter how good the albedo is.
[N8AO](https://github.com/N8python/n8ao) is used in screen-space-radius mode —
this scene is viewed from 8 m (inside a chamber) to 400 m (aerial), and a fixed
world-space radius would vanish at the far end. Occlusion is tinted warm rather
than black, which is closer to how skylight fills a crevice.

Two notes on the pipeline:

- postprocessing's ACES/AgX tone mappers **ignore `renderer.toneMappingExposure`**
  (only Reinhard2 and Uncharted2 read it), so exposure is its own small `Effect`
  before the tone-mapping stage.
- Hardware MSAA is off — AO needs a depth buffer — so SMAA runs last instead.

[realism-effects](https://github.com/0beqz/realism-effects) (SSGI/SSR/TRAA) was
the other candidate and would have added real indirect bounce, but its last
release is **1.1.2, May 2023**, against `three >=0.148`, and it patches enough
three internals that it does not run on r169. If you want to revisit it, the
`v2` / `poisson-recursive` branches are where the author's newer work lives.

Everything loads from a CDN through the importmap in `index.html`
(`postprocessing@6.39.3`, whose peer range is `three >= 0.168 < 0.186`, and
`n8ao@2.0.0`). If either fails to load, `main.js` falls back to a direct render
with three's own ACES tone mapping so the scene still works.

Importmap gotcha: `n8ao` imports `three/examples/jsm/postprocessing/Pass.js`, so
the map needs a `three/examples/jsm/` entry **as well as** `three/addons/`. Miss
it and the whole module graph fails to resolve, which shows up as a blank page
rather than an error inside your own code.

The **Realism** panel toggles AO / bloom / SMAA / half-res AO, exposes AO
intensity and radius, has N8AO's quality presets (Performance → Ultra), and a
"show AO buffer only" mode — the fastest way to tell whether AO is genuinely
being produced or silently failing.

Known warning: N8AOPostPass declares `needsDepthTexture` **and** `needsSwap`, and
postprocessing's input and output buffers share one depth attachment, so the
driver logs `glBlitFramebuffer: Read and write depth stencil attachments cannot
be the same image` once per frame and `getError()` returns 1282. The AO buffer
itself is correct (check it with "show AO buffer only"), and most drivers
tolerate it, but it is a real validation error, not a cosmetic log line.

## Files

```
index.html          shell, UI, importmap
src/noise.js        seeded tileable value noise, fBm, turbulence, ridged
src/textures.js     the texture foundry + the texture inspector gallery
src/materials.js    PBR material library
src/geom.js         plan shape, UV helpers, perimeter frames, petal shells
src/building.js     the building
src/environment.js  lawn, plaza, roads, tree belt
src/postfx.js       N8AO + bloom + tone mapping + SMAA pipeline
src/labels.js       gutter-stacked annotation cards and leader lines
src/annotations.js  what the labels say, and where they point
src/main.js         renderer, sun/sky, camera choreography, UI
images/             reference photographs the model is built against
```

## Notes

- Requires WebGL2. Roughly 350 draw calls / 460k triangles at the aerial view.
- Instanced meshes carry the piers, screens, glazing, benches, columns and trees.
- Software rasterisers (SwiftShader, `--disable-gpu`) render the model correctly
  but drop PCF-soft shadows; use a real GPU.
