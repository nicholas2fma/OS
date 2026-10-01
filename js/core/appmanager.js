/* ==========================================================================
   App manager: launching (zoom out of the icon), closing (back into the icon),
   the interactive Home gesture, swiping along the Home bar between apps and
   the app switcher. Every movement is a spring (js/core/motion.js) that picks
   up the finger's velocity and can be interrupted at any time.
   ========================================================================== */
(function () {
  'use strict';

  const M = () => OS.motion;
  const running = new Map();
  let layer, backdrop;
  let current = null;
  let mode = 'home';           // 'home' | 'app' | 'switcher'
  let zTop = 1;

  const W = () => OS.state.width;
  const H = () => OS.state.height;
  const R = () => (OS.state.fullscreen ? 44 : 58);
  const ICON_R = 15;
  const HOME_ZOOM = .16;       // how much the Home Screen zooms toward the icon while an app is open

  /* ---------------- visual frames ----------------
     A window is described in screen space: centre (cx, cy), scale s, visible
     height hv, corner radius rv and opacity o. applyVis() turns that into a
     transform + clip-path in the window's own coordinates. */

  function fullVis() { return { cx: W() / 2, cy: H() / 2, s: 1, hv: H(), rv: R(), o: 1 }; }
  function iconVis(r) { return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, s: r.width / W(), hv: r.height, rv: ICON_R, o: 1 }; }
  function centerRect() { const s = 62; return { x: W() / 2 - s / 2, y: H() / 2 - s / 2, width: s, height: s }; }

  function applyVis(rec, v, noClip) {
    rec.vis = Object.assign({}, v);
    const s = Math.max(.01, v.s);
    const x = v.cx - (W() * s) / 2;
    const y = v.cy - (H() * s) / 2;
    rec.win.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    if (noClip) rec.win.style.clipPath = 'none';
    else {
      const iy = Math.max(0, (H() - v.hv / s) / 2);
      rec.win.style.clipPath = `inset(${iy}px 0px ${iy}px 0px round ${Math.max(0, v.rv / s)}px)`;
    }
    rec.win.style.opacity = v.o == null ? '' : String(OS.clamp(v.o, 0, 1));
  }

  function clearVis(rec) {
    rec.win.style.transform = '';
    rec.win.style.clipPath = '';
    rec.win.style.opacity = '';
    rec.vis = fullVis();
  }

  function stopAnim(rec) {
    if (rec && rec.anim) { rec.anim.stop(); rec.anim = null; }
  }

  /* ---------------- lifecycle ---------------- */

  function create(id) {
    const def = OS.apps[id];
    const ic = OS.Icons.defs[id] || {};
    const win = OS.el(`<div class="app-window has-label suspended ${def.dark ? 'force-dark' : ''}" data-app="${id}">
      <div class="app-card-label">${OS.icon(id, 'sm')}<span>${OS.esc(def.name)}</span></div>
      <div class="app-clip" style="${def.background ? '--app-bg:' + def.background : ''}">
        <div class="app-content"></div>
        <div class="app-cover" style="--ic-bg:${ic.bg || '#888'}">${OS.Icons.glyph(id)}</div>
      </div>
    </div>`);
    const clip = win.querySelector('.app-clip');
    clip.style.position = 'absolute';
    clip.style.inset = '0';
    clip.style.overflow = 'hidden';
    clip.style.borderRadius = 'inherit';
    clip.style.background = 'var(--app-bg, var(--bg))';
    layer.appendChild(win);
    const rec = {
      id, def, win,
      content: win.querySelector('.app-content'),
      cover: win.querySelector('.app-cover'),
      instance: {},
      lastUsed: Date.now(),
      statusBar: null,
      vis: fullVis(),
      anim: null,
    };
    rec.cover.style.opacity = '0';
    const ctx = {
      id,
      win,
      el: rec.content,
      setStatusBar(style) { rec.statusBar = style; OS.chrome(); },
      close() { home(); },
      notify(o) { return OS.notify(Object.assign({ app: id }, o)); },
      isVisible() { return current === rec && mode === 'app' && !OS.state.locked && OS.state.screenOn; },
    };
    running.set(id, rec);
    try {
      rec.instance = def.mount(rec.content, ctx) || {};
    } catch (e) {
      console.error('[apps] mount failed for', id, e);
      rec.content.innerHTML = `<div class="empty-state">${OS.sym('info')}<b>Impossibile aprire ${OS.esc(def.name)}</b><span>${OS.esc(e.message)}</span></div>`;
      rec.instance = {};
    }
    return rec;
  }

  function call(rec, hook, arg) {
    try { if (rec && rec.instance && rec.instance[hook]) rec.instance[hook](arg); }
    catch (e) { console.error('[apps]', rec.id, hook, e); }
  }

  function showWin(rec) {
    rec.win.classList.remove('suspended');
    rec.win.style.zIndex = ++zTop;
  }

  function suspend(rec) {
    stopAnim(rec);
    rec.win.getAnimations().forEach((a) => a.cancel());
    rec.win.classList.add('suspended');
    rec.win.classList.remove('animating');
    clearVis(rec);
    rec.cover.style.opacity = '0';
  }

  function chromeStyle() {
    if (!current) return 'light';
    const sb = current.statusBar || current.def.statusBar || 'auto';
    if (sb === 'light' || sb === 'dark') return sb;
    return OS.isDark() ? 'light' : 'dark';
  }

  /* ---------------- Home Screen zoom (anchored on the icon) ---------------- */

  let zoomOrigin = null;
  const reduced = () => !!OS.settings.reduceMotion;
  /** Riduci movimento: apps cross-fade in place instead of zooming out of their icon */
  function fadeVis() { return Object.assign(fullVis(), { s: .97, o: 0 }); }
  function homeZoom(k) { OS.Home.zoom(1 + (reduced() ? 0 : HOME_ZOOM) * k, zoomOrigin); }

  /* ---------------- open ---------------- */

  function open(id, opts) {
    opts = opts || {};
    if (!OS.apps[id]) return;
    if (OS.state.locked) { OS.Lock.unlock(() => open(id, opts)); return; }
    if (OS.state.ccOpen) OS.CC.close();
    if (OS.state.ncOpen) OS.NC.close();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    if (OS.Home.exitJiggle) OS.Home.exitJiggle();

    if (mode === 'switcher') {
      const rec = running.get(id) || create(id);
      switcherOpen(rec);
      call(rec, 'onShow', opts.data);
      return;
    }

    const prev = current;
    const rec = running.get(id) || create(id);
    rec.lastUsed = Date.now();

    if (prev === rec && mode === 'app' && !rec.closing) {
      call(rec, 'onShow', opts.data);
      return;
    }

    const originEl = mode === 'home' ? (opts.from || OS.Home.iconFor(id)) : null;
    const r = originEl ? OS.Home.restRect(originEl) : centerRect();
    const target = reduced() ? fadeVis() : iconVis(r);

    if (prev && prev !== rec) {
      call(prev, 'onHide');
      const p = prev;
      setTimeout(() => { if (current !== p) suspend(p); }, 450);
    }

    // re-opening an app that is still flying back into its icon: continue from where it is
    const reopening = rec.closing && rec.anim;
    stopAnim(rec);
    rec.closing = false;
    const start = reopening ? Object.assign({}, rec.vis) : target;

    current = rec;
    mode = 'app';
    showWin(rec);
    OS.chrome();
    call(rec, 'onShow', opts.data);
    OS.emit('app:open', id);

    zoomOrigin = { x: target.cx, y: target.cy };
    rec.win.classList.add('animating');
    const end = fullVis();
    const fromCover = reduced() ? 0 : reopening ? parseFloat(rec.cover.style.opacity) || 0 : 1;
    applyVis(rec, start);
    rec.cover.style.opacity = String(fromCover);
    rec.anim = M().animate({
      from: 0, to: 1, preset: 'appOpen',
      onUpdate(p) {
        const v = {};
        Object.keys(end).forEach((k) => { v[k] = M().lerp(start[k], end[k], p); });
        applyVis(rec, v);
        rec.cover.style.opacity = String(fromCover * (1 - M().segment(p, .04, .32)));
        homeZoom(Math.min(1, p));
      },
      onComplete() {
        rec.anim = null;
        rec.win.classList.remove('animating');
        clearVis(rec);
        rec.cover.style.opacity = '0';
      },
    });
  }

  /* ---------------- close into the icon ---------------- */

  /**
   * Flies the current window back to its icon (or shrinks it in the middle
   * when the icon is not on screen). `velocity` is in screen px/s.
   */
  function home(opts) {
    opts = opts || {};
    if (OS.state.spotlightOpen) OS.Spotlight.close();
    if (mode === 'switcher') { switcherToHome(); return; }
    if (mode !== 'app' || !current) {
      if (OS.Home.goToPage) OS.Home.goToPage(0);
      return;
    }
    const rec = current;
    current = null;
    mode = 'home';
    call(rec, 'onHide');
    OS.chrome();
    OS.emit('app:close', rec.id);

    const el = OS.Home.iconFor(rec.id);
    const r = el ? OS.Home.restRect(el) : centerRect();
    const target = reduced() ? fadeVis() : iconVis(r);
    if (!el) target.o = 0;
    zoomOrigin = { x: target.cx, y: target.cy };

    stopAnim(rec);
    rec.closing = true;
    rec.win.classList.add('animating');
    const from = Object.assign({}, rec.vis || fullVis());
    if (from.o == null) from.o = 1;
    const v = opts.velocity || {};
    const sStart = from.s;
    const zoomStart = opts.homeK == null ? 1 : opts.homeK;
    rec.anim = M().animate({
      from, to: target, preset: 'appClose',
      velocity: { cx: v.x || 0, cy: v.y || 0, s: v.s || 0, hv: v.hv || 0, rv: 0, o: 0 },
      onUpdate(cur) {
        applyVis(rec, cur);
        const k = OS.clamp((cur.s - target.s) / Math.max(.001, sStart - target.s), 0, 1);
        rec.cover.style.opacity = reduced() ? '0' : String(1 - M().segment(k, .12, .62));
        homeZoom(zoomStart * k);
      },
      onComplete() {
        rec.anim = null;
        rec.closing = false;
        if (current !== rec && mode !== 'switcher') suspend(rec);
        homeZoom(0);
      },
    });
  }

  /* ---------------- interactive Home gesture ---------------- */

  let drag = null;
  function dragStart() {
    if (mode !== 'app' || !current || OS.state.locked) return false;
    const rec = current;
    stopAnim(rec);
    rec.closing = false;
    if (!rec.vis) rec.vis = fullVis();
    rec.win.classList.add('animating');
    drag = { rec, from: Object.assign({}, rec.vis) };
    return true;
  }

  /** the card under the finger: shrinks as it rises, follows sideways */
  function dragVis(dx, dyUp) {
    const up = Math.max(0, dyUp);
    const q = OS.clamp(up / (H() * .65), 0, 1);
    const s = 1 - .52 * Math.pow(q, .8);
    // pulling down instead of up meets rubber-band resistance
    const pullDown = dyUp < 0 ? -M().rubber(dyUp, 160, .5) : 0;
    return {
      v: {
        cx: W() / 2 + dx * .75,
        cy: H() - up * .92 - (H() * s) / 2 + pullDown,
        s,
        hv: H() * s,
        rv: M().lerp(R(), 42, Math.min(1, q * 2.2)),
        o: 1,
      },
      q,
    };
  }

  function dragMove(dx, dyUp) {
    if (!drag) return;
    const { v, q } = dragVis(dx, dyUp);
    applyVis(drag.rec, v);
    drag.q = q;
    zoomOrigin = zoomOrigin || { x: W() / 2, y: H() / 2 };
    homeZoom(1 - q);
  }

  /**
   * Decides between going Home, opening the switcher and cancelling,
   * using where the flick would come to rest (Apple's projection).
   */
  function dragEnd(dx, dyUp, vx, vyUp, held) {
    if (!drag) return;
    const { rec } = drag;
    const q = drag.q || 0;
    drag = null;
    const projected = dyUp + M().project(vyUp, .985);
    if (held && dyUp > 60 && Math.abs(vyUp) < 400) { enterSwitcher(true); return; }
    if (projected > H() * .22 || (dyUp > 90 && vyUp > -200)) {
      current = rec;
      home({
        velocity: { x: vx * .75, y: -vyUp * .92, s: -(.52 * .8 * vyUp) / (H() * .65) },
        homeK: 1 - q,
      });
      return;
    }
    // cancel: spring back to full screen with the finger's velocity
    stopAnim(rec);
    rec.anim = M().animate({
      from: Object.assign({}, rec.vis), to: fullVis(), preset: 'snappy',
      velocity: { cx: vx * .75, cy: -vyUp * .92 },
      onUpdate(cur) {
        applyVis(rec, cur);
        const k = OS.clamp((1 - cur.s) / .52, 0, 1);
        homeZoom(1 - k);
      },
      onComplete() { rec.anim = null; rec.win.classList.remove('animating'); clearVis(rec); homeZoom(1); },
    });
  }

  /* ---------------- swipe along the Home bar: previous / next app ---------------- */

  let hswipe = null;
  let quickOrder = null;
  let quickT = null;

  function order() {
    if (quickOrder) return quickOrder.filter((r) => running.has(r.id));
    return Array.from(running.values()).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  function hDragStart() {
    if (mode !== 'app' || !current || OS.state.locked) return false;
    const list = order();
    const i = list.indexOf(current);
    hswipe = { list, i, cur: current, prev: list[i + 1] || null, next: list[i - 1] || null };
    stopAnim(current);
    [hswipe.prev, hswipe.next].forEach((r) => { if (r) { stopAnim(r); showWin(r); r.win.classList.add('animating'); } });
    current.win.style.zIndex = ++zTop;
    current.win.classList.add('animating');
    return true;
  }

  function hVis(offset) {
    // the windows shrink a little while they slide, like iOS
    const s = 1 - Math.min(.06, Math.abs(offset) / W() * .12);
    return { cx: W() / 2 + offset, cy: H() / 2, s, hv: H() * s, rv: R(), o: 1 };
  }

  function hLayout(dx) {
    const h = hswipe;
    let off = dx;
    if ((dx > 0 && !h.prev) || (dx < 0 && !h.next)) off = M().rubber(dx, W(), .45);
    applyVis(h.cur, hVis(off));
    if (h.prev) applyVis(h.prev, hVis(off - W() - 18));
    if (h.next) applyVis(h.next, hVis(off + W() + 18));
    return off;
  }

  function hDragMove(dx) { if (hswipe) hswipe.off = hLayout(dx); }

  function hDragEnd(dx, vx) {
    const h = hswipe;
    if (!h) return;
    hswipe = null;
    const proj = dx + M().project(vx, .985);
    let dir = 0;
    if (proj > W() * .35 && h.prev) dir = 1;
    else if (proj < -W() * .35 && h.next) dir = -1;
    const target = dir * (W() + 18);
    const incoming = dir === 1 ? h.prev : dir === -1 ? h.next : null;
    const from = h.off == null ? dx : h.off;
    const spring = M().animate({
      from, to: target, velocity: vx, preset: 'snappy',
      onUpdate(off) {
        applyVis(h.cur, hVis(off));
        if (h.prev) applyVis(h.prev, hVis(off - W() - 18));
        if (h.next) applyVis(h.next, hVis(off + W() + 18));
      },
      onComplete() {
        [h.cur, h.prev, h.next].forEach((r) => { if (r) r.win.classList.remove('animating'); });
        if (incoming) {
          call(h.cur, 'onHide');
          suspend(h.cur);
          [h.prev, h.next].forEach((r) => { if (r && r !== incoming) suspend(r); });
          clearVis(incoming);
          incoming.win.style.zIndex = ++zTop;
          current = incoming;
          call(incoming, 'onShow');
          OS.chrome();
          // rapid swipes keep walking the same history; it settles after a pause
          quickOrder = h.list;
          clearTimeout(quickT);
          quickT = setTimeout(() => { quickOrder = null; if (current) current.lastUsed = Date.now(); }, 2500);
        } else {
          clearVis(h.cur);
          [h.prev, h.next].forEach((r) => { if (r) suspend(r); });
        }
      },
    });
    h.cur.anim = spring;
  }

  /* ---------------- App switcher ---------------- */

  let sx = 0;
  let sxAnim = null;
  let swOrder = [];
  const K = () => (OS.state.width < 380 ? .6 : .64);
  const spacing = () => W() * K() * .86;

  function cardVis(i, extra) {
    const k = K();
    const base = i - sx;
    // cards further back slide a little less: a hint of depth like iOS
    const depth = base > 0 ? base * spacing() * .06 : 0;
    const v = { cx: W() / 2 - base * spacing() + depth, cy: H() / 2 + 6, s: k, hv: H() * k, rv: R() * k, o: 1 };
    return Object.assign(v, extra || {});
  }

  function layoutCards() {
    swOrder.forEach((rec, i) => {
      if (rec.anim) return;
      applyVis(rec, Object.assign(cardVis(i), rec.lift || {}), true);
      rec.win.style.zIndex = 100 - i;
    });
  }

  function springCards(opts) {
    opts = opts || {};
    swOrder.forEach((rec, i) => {
      stopAnim(rec);
      const to = cardVis(i);
      const from = Object.assign({}, rec.vis || to);
      if (from.o == null) from.o = 1;
      rec.win.style.zIndex = 100 - i;
      const delay = opts.stagger ? i * 25 : 0;
      const run = () => {
        rec.anim = M().animate({
          from, to, preset: opts.preset || 'snappy', velocity: opts.velocity && opts.velocity(rec, i),
          onUpdate(cur) { applyVis(rec, cur, !opts.clip || rec !== opts.clip); },
          onComplete() { rec.anim = null; applyVis(rec, to, true); },
        });
      };
      if (delay) setTimeout(run, delay); else run();
    });
  }

  function enterSwitcher(fromDrag) {
    if (OS.state.locked || mode === 'switcher') return;
    if (OS.Home.exitJiggle) OS.Home.exitJiggle();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    const prevMode = mode;
    const wasCurrent = current;
    swOrder = Array.from(running.values()).sort((a, b) => b.lastUsed - a.lastUsed);
    mode = 'switcher';
    layer.classList.add('switcher');
    layer.classList.toggle('empty', !swOrder.length);
    if (sxAnim) sxAnim.stop();
    sx = 0;
    homeZoom(0);
    if (current) call(current, 'onHide');

    swOrder.forEach((rec, i) => {
      rec.cover.style.opacity = '0';
      rec.win.classList.remove('animating');
      if (rec.win.classList.contains('suspended')) {
        rec.win.classList.remove('suspended');
        // older apps slide in from the left (from an app) or rise from below (from Home)
        const start = cardVis(i, prevMode === 'app' ? { cx: cardVis(i).cx - W() * .5 } : { cy: cardVis(i).cy + H() * .3, o: 0 });
        applyVis(rec, start, true);
      } else if (!fromDrag || rec !== wasCurrent) {
        applyVis(rec, rec.vis || fullVis());
      }
    });
    springCards({ clip: fromDrag ? wasCurrent : null, stagger: !fromDrag && prevMode !== 'app' });
    OS.chrome();
    OS.emit('switcher', true);
  }

  function switcherOpen(rec) {
    layer.classList.remove('switcher', 'empty');
    const idx = swOrder.indexOf(rec);
    const others = swOrder.filter((r) => r !== rec);
    mode = 'app';
    current = rec;
    rec.lastUsed = Date.now();
    if (!swOrder.includes(rec)) { showWin(rec); applyVis(rec, cardVis(0)); }
    rec.win.classList.remove('suspended');
    rec.win.style.zIndex = ++zTop + 200;
    stopAnim(rec);
    const from = Object.assign({}, rec.vis);
    rec.anim = M().animate({
      from, to: fullVis(), preset: 'appOpen',
      onUpdate(cur) { applyVis(rec, cur); },
      onComplete() { rec.anim = null; clearVis(rec); rec.win.style.zIndex = ++zTop; },
    });
    // the other cards slide out of the way, older to the left, newer to the right
    others.forEach((o) => {
      stopAnim(o);
      const j = swOrder.indexOf(o);
      const dir = j > idx ? -1 : 1;
      const f = Object.assign({}, o.vis);
      o.anim = M().animate({
        from: f, to: Object.assign({}, f, { cx: f.cx + dir * W() * .9, o: .2 }), preset: 'snappy',
        onUpdate(cur) { applyVis(o, cur, true); },
        onComplete() { o.anim = null; suspend(o); },
      });
    });
    homeZoom(1);
    OS.chrome();
    call(rec, 'onShow');
    OS.emit('switcher', false);
  }

  function switcherToHome() {
    layer.classList.remove('switcher', 'empty');
    mode = 'home';
    current = null;
    swOrder.forEach((rec) => {
      stopAnim(rec);
      const f = Object.assign({}, rec.vis);
      rec.anim = M().animate({
        from: f, to: Object.assign({}, f, { s: f.s * .82, hv: f.hv * .82, cy: f.cy + 40, o: 0 }), preset: 'smooth',
        onUpdate(cur) { applyVis(rec, cur, true); },
        onComplete() { rec.anim = null; if (current !== rec) suspend(rec); },
      });
    });
    zoomOrigin = { x: W() / 2, y: H() / 2 };
    OS.Home.zoom(1.08, zoomOrigin);
    requestAnimationFrame(() => OS.Home.springZoom(1));
    OS.chrome();
    OS.emit('switcher', false);
  }

  function kill(rec, vyUp) {
    call(rec, 'onHide');
    call(rec, 'onDestroy');
    running.delete(rec.id);
    swOrder = swOrder.filter((r) => r !== rec);
    if (current === rec) current = null;
    stopAnim(rec);
    const f = Object.assign({}, rec.vis);
    rec.anim = M().animate({
      from: f, to: Object.assign({}, f, { cy: -H() * .6, o: .4 }), preset: 'snappy', velocity: { cy: -(vyUp || 1200) },
      onUpdate(cur) { applyVis(rec, cur, true); },
      onComplete() { rec.win.remove(); },
    });
    OS.emit('app:killed', rec.id);
    if (!swOrder.length) {
      layer.classList.add('empty');
      setTimeout(() => { if (mode === 'switcher' && !swOrder.length) switcherToHome(); }, 450);
    } else {
      const max = swOrder.length - 1;
      if (sxAnim) { sxAnim.stop(); sxAnim = null; }
      sx = OS.clamp(Math.round(sx), 0, max);
      springCards();
    }
  }

  function animateScroll(target, velocity) {
    if (sxAnim) sxAnim.stop();
    sxAnim = M().animate({
      from: sx, to: target, velocity, preset: 'snappy',
      onUpdate(v) { sx = v; layoutCards(); },
      onComplete() { sxAnim = null; },
    });
  }

  function installSwitcherGestures() {
    let d = null;
    layer.addEventListener('pointerdown', (e) => {
      if (mode !== 'switcher') return;
      const p = OS.point(e);
      const winEl = e.target.closest('.app-window');
      if (sxAnim) { sxAnim.stop(); sxAnim = null; }
      const tr = M().tracker();
      tr.add(p.x, p.y);
      d = { x: p.x, y: p.y, sx0: sx, rec: winEl ? running.get(winEl.dataset.app) : null, axis: null, id: e.pointerId, tr };
    });
    window.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id || mode !== 'switcher') return;
      const p = OS.point(e);
      d.tr.add(p.x, p.y);
      const dx = p.x - d.x, dy = p.y - d.y;
      if (!d.axis) {
        if (Math.abs(dx) > 8) d.axis = 'x';
        else if (dy < -8 && d.rec) d.axis = 'y';
        else return;
        swOrder.forEach((r) => stopAnim(r));
      }
      if (d.axis === 'x') {
        let v = d.sx0 + dx / spacing();
        const max = Math.max(0, swOrder.length - 1);
        if (v < 0) v = -M().rubber(-v * spacing(), W(), .5) / spacing();
        if (v > max) v = max + M().rubber((v - max) * spacing(), W(), .5) / spacing();
        sx = v;
        layoutCards();
      } else {
        const i = swOrder.indexOf(d.rec);
        if (i < 0) return;
        // the card follows the finger up; pulling down resists
        const off = dy < 0 ? dy : M().rubber(dy, 300, .4);
        d.rec.lift = { cy: cardVis(i).cy + off, s: K() * (1 - Math.min(.08, Math.max(0, -off) / 3000)) };
        d.rec.lift.hv = H() * d.rec.lift.s;
        layoutCards();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const g = d;
      d = null;
      if (mode !== 'switcher') return;
      const p = OS.point(e);
      const dy = p.y - g.y;
      const vel = g.tr.velocity();
      if (!g.axis) {
        if (g.rec) switcherOpen(g.rec);
        else switcherToHome();
        return;
      }
      if (g.axis === 'x') {
        const max = Math.max(0, swOrder.length - 1);
        const proj = sx + M().project(vel.x, .985) / spacing();
        animateScroll(OS.clamp(Math.round(proj), 0, max), vel.x / spacing());
      } else {
        const rec = g.rec;
        rec.lift = null;
        if (dy + M().project(vel.y, .985) < -160) kill(rec, -vel.y);
        else springCards({ velocity: (r) => (r === rec ? { cy: vel.y } : null) });
      }
    });
  }

  function init() {
    layer = document.getElementById('apps');
    backdrop = OS.el('<div class="switcher-backdrop"></div>');
    layer.appendChild(backdrop);
    layer.appendChild(OS.el('<div class="switcher-empty">Nessuna app aperta</div>'));
    installSwitcherGestures();
  }

  OS.Apps = {
    init, open, home, kill,
    enterSwitcher,
    dragStart, dragMove, dragEnd,
    hDragStart, hDragMove, hDragEnd,
    chromeStyle,
    running,
    get current() { return current; },
    get mode() { return mode; },
    get animating() { return !!(current && current.anim); },
  };
})();
