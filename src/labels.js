/**
 * Annotation layer.
 *
 * Two layouts:
 *
 *  - **hover** (default) — every anchor gets a small marker, and only the one
 *    you point at opens a card beside it. Showing twenty cards at once buries
 *    the model you are trying to look at.
 *  - **cards** — all of them at once in the left and right gutters, like a
 *    printed cutaway diagram, for reading rather than exploring.
 *
 * Cards live in the gutters rather than over the model because anchored cards
 * collide and jitter. Side assignment uses hysteresis so a card doesn't
 * ping-pong between gutters as its anchor crosses the centre line during an
 * orbit — but the stickiness is cleared on a view change, or every card strands
 * in whichever gutter it last occupied.
 */

import * as THREE from 'three';

const CARD_GAP = 10;
const GUTTER = 18;
const CARD_W = 244;
const HOVER_RADIUS = 34;          // px; generous, markers are small targets

export class LabelLayer {
  constructor(camera, root) {
    this.camera = camera;
    this.mode = 'hover';           // 'hover' | 'cards' | 'dots' | 'off'
    this.filter = 'all';
    this.view = null;
    this.items = [];
    this.hovered = null;
    this.pinned = null;

    this.root = root;
    this.svg = root.querySelector('#leaders');
    this.cardHost = root.querySelector('#cards');
    this.dotHost = root.querySelector('#dots');

    this._v = new THREE.Vector3();
    this._ptr = { x: -1e4, y: -1e4 };
    this._hud = document.getElementById('hud');
    this._tex = document.getElementById('tex');
  }

  /** Proximity hover — markers are far too small to hit reliably. */
  attachPointer(el) {
    // Tracked on the window, not the canvas: the HUD and caption sit above the
    // canvas and swallow its pointer events, so any marker that happens to be
    // behind a panel would be unreachable.
    addEventListener('pointermove', (e) => {
      this._ptr.x = e.clientX;
      this._ptr.y = e.clientY;
    });
    addEventListener('pointerleave', () => {
      this._ptr.x = this._ptr.y = -1e4;
    });
    el.addEventListener('pointerdown', () => {
      // Click the model near a marker to pin its card open.
      this.pinned = this.pinned === this.hovered ? null : this.hovered;
    });
  }

  setItems(items) {
    this.cardHost.innerHTML = '';
    this.dotHost.innerHTML = '';
    this.svg.innerHTML = '';

    this.items = items.map((it) => {
      const card = document.createElement('div');
      card.className = 'lbl-card';
      card.innerHTML = `
        <div class="lbl-kicker">${it.kicker || ''}</div>
        <h3>${it.title}</h3>
        <p>${it.body}</p>
        ${it.meta ? `<div class="lbl-meta">${it.meta}</div>` : ''}`;
      if (it.view) {
        card.classList.add('clickable');
        card.title = 'Go to this view';
      }
      card.addEventListener('pointerenter', () => { this.hovered = it.id; });
      card.addEventListener('pointerleave', () => { if (this.hovered === it.id) this.hovered = null; });
      this.cardHost.appendChild(card);

      const dot = document.createElement('div');
      dot.className = `lbl-dot tag-${it.tag || 'default'}`;
      dot.addEventListener('pointerenter', () => { this.hovered = it.id; });
      this.dotHost.appendChild(dot);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('class', `lbl-leader tag-${it.tag || 'default'}`);
      this.svg.appendChild(line);

      return { ...it, card, dot, line, side: null, h: 0 };
    });
  }

  onCardClick(handler) {
    for (const it of this.items) {
      if (it.view) it.card.addEventListener('click', () => handler(it.view));
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.pinned = null;
    this.root.classList.toggle('dots-only', mode === 'dots');
    this.root.style.display = mode === 'off' ? 'none' : '';
    document.body.classList.toggle('labelled', mode === 'cards');
  }

  /**
   * Force a card open by id and keep it open. Used by the script walkthrough,
   * which has no cursor to hover with.
   */
  pin(id) {
    this.pinned = id;
    if (id) this.hovered = id;
  }

  setFilter(tag) { this.filter = tag; this._resetSides(); }
  setView(view) { this.view = view; this.pinned = null; this._resetSides(); }

  _resetSides() {
    for (const it of this.items) it.side = null;
  }

  /**
   * Gutter origins. Both panels are position:fixed, and offsetParent is always
   * null for fixed elements — a check based on it reports them hidden and puts
   * left-gutter cards straight back underneath the HUD.
   */
  _insets() {
    const vis = (el) => !!el && el.getBoundingClientRect().width > 0;
    return {
      left: vis(this._hud) ? this._hud.getBoundingClientRect().right + 14 : GUTTER,
      right: vis(this._tex)
        ? this._tex.getBoundingClientRect().left - 14 - CARD_W
        : innerWidth - GUTTER - CARD_W,
    };
  }

  _eligible(it) {
    if (this.filter !== 'all' && it.tag !== this.filter) return false;
    if (it.views && this.view && !it.views.includes(this.view)) return false;
    return true;
  }

  _hide(it) {
    it.card.style.display = 'none';
    it.line.style.display = 'none';
  }

  update() {
    if (this.mode === 'off') return;
    const W = innerWidth, H = innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const live = [];
    for (const it of this.items) {
      if (!this._eligible(it)) { this._hide(it); it.dot.style.display = 'none'; continue; }

      this._v.copy(it.anchor).project(this.camera);
      const behind = this._v.z > 1 || this._v.z < -1;
      const x = (this._v.x * 0.5 + 0.5) * W;
      const y = (-this._v.y * 0.5 + 0.5) * H;
      if (behind || x < -80 || x > W + 80 || y < -80 || y > H + 80) {
        this._hide(it); it.dot.style.display = 'none'; continue;
      }
      live.push({ it, x, y });
    }

    // Hover mode shows a marker only on the part under the cursor — a permanent
    // constellation of dots is exactly the clutter hover mode exists to avoid.
    const showAllDots = this.mode !== 'hover';
    for (const l of live) {
      l.it.dot.style.display = showAllDots ? '' : 'none';
      l.it.dot.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)`;
    }

    if (this.mode === 'dots') {
      for (const l of live) this._hide(l.it);
      return;
    }
    if (this.mode === 'hover') return this._layoutHover(live, W, H);
    return this._layoutGutters(live, W, H);
  }

  // -------------------------------------------------------------------------

  _layoutHover(live, W, H) {
    // Nearest marker to the cursor wins; a pinned card overrides.
    let best = null, bestD = HOVER_RADIUS * HOVER_RADIUS;
    for (const l of live) {
      const dx = l.x - this._ptr.x, dy = l.y - this._ptr.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = l; }
    }
    const overCard = this.hovered && this.items.find((i) => i.id === this.hovered)?.card.matches(':hover');
    if (best) {
      this.hovered = best.it.id;
    } else if (!overCard) {
      // Sticky band: the card sits ~20 px off the marker, so a hard cutoff at
      // HOVER_RADIUS closes it in the gap before the cursor can reach it.
      const cur = live.find((l) => l.it.id === this.hovered);
      const near = cur && Math.hypot(cur.x - this._ptr.x, cur.y - this._ptr.y) < HOVER_RADIUS * 3;
      if (!near) this.hovered = null;
    }

    const showId = this.pinned || this.hovered;

    for (const l of live) {
      const active = l.it.id === showId;
      l.it.dot.classList.toggle('hot', active);
      if (!active) { this._hide(l.it); continue; }

      l.it.dot.style.display = '';        // the one marker hover mode reveals

      const card = l.it.card;
      card.style.display = '';
      l.it.h = card.offsetHeight || 84;

      // Prefer the right of the marker, flip when it would run off the edge.
      const right = l.x + 20 + CARD_W < W - 12;
      const cx = right ? l.x + 20 : l.x - 20 - CARD_W;
      const cy = Math.max(12, Math.min(l.y - l.it.h / 2, H - l.it.h - 12));
      card.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
      card.classList.add('hot');

      const edgeX = right ? cx : cx + CARD_W;
      l.it.line.style.display = '';
      l.it.line.setAttribute('points', `${edgeX},${cy + l.it.h / 2} ${l.x},${l.y}`);
      l.it.line.classList.add('hot');
    }
  }

  _layoutGutters(live, W, H) {
    const inset = this._insets();

    // Measure before positioning: heights depend on wrapped text and can't be
    // known until the card is displayed in the document.
    for (const l of live) l.it.card.style.display = '';
    for (const l of live) l.it.h = l.it.card.offsetHeight || 84;

    const pivot = (inset.left + CARD_W + inset.right) / 2;
    const dead = W * 0.07;
    for (const l of live) {
      if (l.it.side === null) l.it.side = l.x < pivot ? 'left' : 'right';
      else if (l.x < pivot - dead) l.it.side = 'left';
      else if (l.x > pivot + dead) l.it.side = 'right';
      l.side = l.it.side;
    }

    const TOP = 74, BOTTOM = 16;
    const cols = { left: [], right: [] };
    for (const l of live) cols[l.side].push(l);

    /**
     * Greedy top-down stack. The caller must take the returned spills *out* of
     * the column — leaving them in means the next pass re-stacks and re-rejects
     * exactly the same cards.
     */
    const stack = (side) => {
      let cursor = TOP;
      const keep = [], spill = [];
      for (const l of cols[side].sort((a, b) => a.y - b.y)) {
        const h = l.it.h || 84;
        const top = Math.max(TOP, Math.max(cursor, l.y - h / 2));
        if (top + h > H - BOTTOM) { spill.push(l); continue; }
        l.top = top;
        cursor = top + h + CARD_GAP;
        keep.push(l);
      }
      cols[side] = keep;
      return spill;
    };

    for (const side of ['left', 'right']) {
      const other = side === 'left' ? 'right' : 'left';
      for (const l of stack(side)) { l.side = l.it.side = other; cols[other].push(l); }
    }
    const dropped = new Set();
    for (const side of ['left', 'right']) for (const l of stack(side)) dropped.add(l);
    for (const l of dropped) this._hide(l.it);

    for (const l of live) {
      if (dropped.has(l)) continue;
      const { it } = l;
      const cardX = l.side === 'left' ? inset.left : inset.right;

      it.card.style.transform = `translate(${Math.round(cardX)}px, ${Math.round(l.top)}px)`;
      it.card.classList.toggle('hot', this.hovered === it.id);
      it.dot.classList.toggle('hot', this.hovered === it.id);

      const edgeX = l.side === 'left' ? cardX + CARD_W : cardX;
      const edgeY = l.top + (it.h || 84) / 2;
      const midX = l.side === 'left'
        ? Math.max(edgeX + 14, Math.min(l.x - 16, edgeX + 90))
        : Math.min(edgeX - 14, Math.max(l.x + 16, edgeX - 90));

      it.line.style.display = '';
      it.line.setAttribute('points', `${edgeX},${edgeY} ${midX},${edgeY} ${l.x},${l.y}`);
      it.line.classList.toggle('hot', this.hovered === it.id);
    }
  }
}
