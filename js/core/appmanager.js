/* ==========================================================================
   App manager: launching (zoom from icon), closing (back into icon),
   interactive home gesture, app switcher (multitasking)
   ========================================================================== */
(function () {
  'use strict';

  const running = new Map();
  let layer, backdrop;
  let current = null;
  let mode = 'home';           // 'home' | 'app' | 'switcher'
  let animating = false;
  let zTop = 1;

  const W = () => OS.state.width;
  const H = () => OS.state.height;
  const R = () => (OS.state.fullscreen ? 44 : 58);
  const ICON_R = 15;
  const OPEN_EASE = 'cubic-bezier(.2,.95,.25,1)';
  const CLOSE_EASE = 'cubic-bezier(.25,.9,.3,1)';

  /* ---------- frames (transform + clip) ---------- */

  function frame(x, y, s, insetY, radius) {
    return {
      transform: `translate(${x}px, ${y}px) scale(${s})`,
      clipPath: `inset(${insetY}px 0px ${insetY}px 0px round ${radius}px)`,
    };
  }
  function fullFrame() { return frame(0, 0, 1, 0, R()); }
  function iconFrame(r) {
    const s = r.width / W();
    const y = r.y + r.height / 2 - (H() * s) / 2;
    const insetY = (H() - r.height / s) / 2;
    return frame(r.x, y, s, insetY, ICON_R / s);
  }
  function centerRect() {
    const size = 62;
    return { x: W() / 2 - size / 2, y: H() / 2 - size / 2, width: size, height: size };
  }

  /* ---------- lifecycle ---------- */

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
    rec.win.getAnimations().forEach((a) => a.cancel());
    rec.win.classList.add('suspended');
    rec.win.classList.remove('sw-anim', 'animating');
    rec.win.style.transform = '';
    rec.win.style.clipPath = '';
    rec.win.style.opacity = '';
    rec.win.style.transition = '';
    rec.cover.style.opacity = '0';
  }

  function chromeStyle() {
    if (!current) return 'light';
    const sb = current.statusBar || current.def.statusBar || 'auto';
    if (sb === 'light' || sb === 'dark') return sb;
    return OS.isDark() ? 'light' : 'dark';
  }

  /* ---------- open ---------- */

  function open(id, opts) {
    opts = opts || {};
    if (!OS.apps[id]) return;
    if (OS.state.locked) { OS.Lock.unlock(() => open(id, opts)); return; }
    if (OS.state.ccOpen) OS.CC.close();
    if (OS.state.ncOpen) OS.NC.close();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    OS.Home.exitJiggle && OS.Home.exitJiggle();

    if (mode === 'switcher') {
      const rec = running.get(id) || create(id);
      switcherOpen(rec);
      call(rec, 'onShow', opts.data);
      return;
    }
    if (animating) finishAnimations();

    const prev = current;
    const rec = running.get(id) || create(id);
    rec.lastUsed = Date.now();

    if (prev === rec && mode === 'app') {
      call(rec, 'onShow', opts.data);
      return;
    }

    const originEl = mode === 'home' ? (opts.from || OS.Home.iconFor(id)) : null;
    const r = originEl ? OS.rectOf(originEl) : centerRect();

    if (prev && prev !== rec) {
      call(prev, 'onHide');
      setTimeout(() => { if (current !== prev) suspend(prev); }, 380);
    }

    current = rec;
    mode = 'app';
    showWin(rec);
    OS.Home.setBehind(true);
    OS.chrome();
    call(rec, 'onShow', opts.data);
    OS.emit('app:open', id);

    animating = true;
    rec.win.classList.add('animating');
    const from = iconFrame(r);
    const anim = rec.win.animate([from, fullFrame()], { duration: 560, easing: OPEN_EASE });
    rec.cover.animate([{ opacity: 1 }, { opacity: 1, offset: .12 }, { opacity: 0 }], { duration: 360, easing: 'ease-out' });
    anim.onfinish = anim.oncancel = () => {
      rec.win.classList.remove('animating');
      animating = false;
    };
  }

  function finishAnimations() {
    running.forEach((rec) => rec.win.getAnimations().forEach((a) => a.finish()));
    animating = false;
  }

  /* ---------- close to home ---------- */

  function home(opts) {
    opts = opts || {};
    if (OS.state.spotlightOpen) OS.Spotlight.close();
    if (mode === 'switcher') { switcherToHome(); return; }
    if (mode !== 'app' || !current) {
      OS.Home.goToPage && OS.Home.goToPage(0);
      return;
    }
    const rec = current;
    current = null;
    mode = 'home';
    call(rec, 'onHide');

    const el = OS.Home.iconFor(rec.id);
    const target = el ? iconFrame(OS.Home.restRect(el)) : (() => {
      const f = iconFrame(centerRect());
      return f;
    })();
    const from = opts.from || fullFrame();
    OS.Home.setBehind(false);
    OS.chrome();
    OS.emit('app:close', rec.id);

    animating = true;
    rec.win.classList.add('animating');
    rec.win.style.transform = '';
    rec.win.style.clipPath = '';
    const anim = rec.win.animate([from, target], {
      duration: opts.fast ? 380 : 480, easing: CLOSE_EASE, fill: 'forwards',
    });
    rec.cover.animate([{ opacity: 0 }, { opacity: 0, offset: .25 }, { opacity: 1 }], { duration: opts.fast ? 300 : 380, easing: 'ease-in', fill: 'forwards' });
    if (!el) rec.win.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
    anim.onfinish = () => {
      animating = false;
      if (current !== rec && mode !== 'switcher') suspend(rec);
      rec.cover.getAnimations().forEach((a) => a.cancel());
    };
  }

  /* ---------- interactive home gesture ---------- */

  let dragRec = null;
  function dragStart() {
    if (mode !== 'app' || !current || OS.state.locked) return false;
    if (animating) finishAnimations();
    dragRec = current;
    dragRec.win.getAnimations().forEach((a) => a.cancel());
    dragRec.win.classList.add('animating');
    return true;
  }

  function dragFrame(dx, dy) {
    const p = OS.clamp(dy / (H() * .6), 0, 1);
    const s = 1 - .5 * Math.pow(p, .85);
    const cx = W() / 2 + dx * .7;
    const bottom = H() - Math.max(0, dy) * .9;
    const x = cx - (W() * s) / 2;
    const y = bottom - H() * s;
    return { f: frame(x, y, s, 0, OS.lerp(R(), 70, p) / s), p };
  }

  function dragMove(dx, dy) {
    if (!dragRec) return;
    const { f, p } = dragFrame(dx, dy);
    dragRec.win.style.transform = f.transform;
    dragRec.win.style.clipPath = f.clipPath;
    OS.Home.setProgress(1 - p);
  }

  function dragEnd(dx, dy, vy, held) {
    if (!dragRec) return;
    const rec = dragRec;
    dragRec = null;
    const { f } = dragFrame(dx, dy);
    if (held && dy > 70) {
      enterSwitcher(true);
      return;
    }
    if (dy > 110 || (vy > .45 && dy > 30)) {
      rec.win.style.transform = '';
      rec.win.style.clipPath = '';
      home({ from: f, fast: true });
    } else {
      // snap back
      OS.Home.setProgress(null);
      const anim = rec.win.animate([f, fullFrame()], { duration: 380, easing: OPEN_EASE });
      rec.win.style.transform = '';
      rec.win.style.clipPath = '';
      anim.onfinish = () => rec.win.classList.remove('animating');
      OS.Home.setBehind(true);
    }
  }

  /* ---------- App switcher ---------- */

  let sx = 0;
  let swOrder = [];
  const K = () => (OS.state.width < 380 ? .6 : .64);
  const spacing = () => W() * K() * .86;

  function cardPos(i) {
    const k = K();
    const cw = W() * k, ch = H() * k;
    const base = i - sx;
    const x = W() / 2 - cw / 2 - base * spacing();
    const y = (H() - ch) / 2 + 6;
    return { x, y, k };
  }

  function layoutCards(animate) {
    swOrder.forEach((rec, i) => {
      const { x, y, k } = cardPos(i);
      rec.win.classList.toggle('sw-anim', !!animate);
      rec.win.style.transition = animate ? 'transform .5s var(--ease-spring), opacity .3s ease' : 'none';
      rec.win.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      rec.win.style.zIndex = 100 - i;
      rec.win.style.clipPath = 'none';
    });
  }

  function enterSwitcher(fromDrag) {
    if (OS.state.locked) return;
    if (mode === 'switcher') return;
    if (animating) finishAnimations();
    OS.Home.exitJiggle && OS.Home.exitJiggle();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    const prevMode = mode;
    swOrder = Array.from(running.values()).sort((a, b) => b.lastUsed - a.lastUsed);
    mode = 'switcher';
    layer.classList.add('switcher');
    layer.classList.toggle('empty', !swOrder.length);
    sx = 0;
    OS.Home.setBehind(false);
    OS.Home.setProgress(null);
    if (current) call(current, 'onHide');

    swOrder.forEach((rec, i) => {
      rec.win.getAnimations().forEach((a) => a.cancel());
      rec.cover.style.opacity = '0';
      if (rec.win.classList.contains('suspended')) {
        rec.win.classList.remove('suspended');
        const { x, y, k } = cardPos(i);
        rec.win.style.transition = 'none';
        rec.win.style.clipPath = 'none';
        rec.win.style.transform = `translate(${x - (prevMode === 'app' ? W() * .4 : 0)}px, ${y + (prevMode === 'app' ? 0 : H() * .25)}px) scale(${k})`;
        rec.win.style.opacity = prevMode === 'app' ? '1' : '0';
      } else if (!fromDrag) {
        rec.win.style.transform = 'translate(0px, 0px) scale(1)';
      }
      rec.win.classList.remove('animating');
    });
    void layer.offsetWidth;
    swOrder.forEach((rec) => { rec.win.style.opacity = ''; });
    layoutCards(true);
    OS.chrome();
    OS.emit('switcher', true);
  }

  function switcherOpen(rec) {
    layer.classList.remove('switcher', 'empty');
    const others = swOrder.filter((r) => r !== rec);
    mode = 'app';
    current = rec;
    rec.lastUsed = Date.now();
    if (!swOrder.includes(rec)) showWin(rec);
    rec.win.classList.remove('suspended');
    rec.win.style.transition = 'transform .5s var(--ease-spring)';
    rec.win.style.zIndex = ++zTop + 100;
    rec.win.style.transform = 'translate(0px, 0px) scale(1)';
    others.forEach((o) => { o.win.style.transition = 'opacity .25s ease, transform .5s var(--ease-spring)'; o.win.style.opacity = '0'; });
    setTimeout(() => {
      rec.win.style.transition = '';
      rec.win.style.transform = '';
      rec.win.style.clipPath = '';
      rec.win.style.zIndex = ++zTop;
      rec.win.classList.remove('sw-anim');
      others.forEach((o) => suspend(o));
    }, 520);
    OS.Home.setBehind(true);
    OS.chrome();
    call(rec, 'onShow');
    OS.emit('switcher', false);
  }

  function switcherToHome() {
    layer.classList.remove('switcher', 'empty');
    mode = 'home';
    current = null;
    swOrder.forEach((rec) => {
      rec.win.style.transition = 'opacity .25s ease, transform .4s var(--ease-spring)';
      rec.win.style.opacity = '0';
      const t = rec.win.style.transform;
      rec.win.style.transform = t.replace(/scale\(([\d.]+)\)/, (m, k) => `scale(${k * .9})`);
    });
    const list = swOrder.slice();
    setTimeout(() => list.forEach((rec) => { if (current !== rec) suspend(rec); }), 300);
    OS.Home.setBehind(false);
    OS.chrome();
    OS.emit('switcher', false);
  }

  function kill(rec) {
    call(rec, 'onHide');
    call(rec, 'onDestroy');
    running.delete(rec.id);
    swOrder = swOrder.filter((r) => r !== rec);
    if (current === rec) current = null;
    const pos = rec.win.style.transform;
    rec.win.style.transition = 'transform .35s cubic-bezier(.4,0,1,1), opacity .35s';
    rec.win.style.transform = pos.replace(/translate\(([-\d.]+)px, ([-\d.]+)px\)/, (m, x) => `translate(${x}px, ${-H()}px)`);
    rec.win.style.opacity = '0';
    setTimeout(() => rec.win.remove(), 360);
    OS.emit('app:killed', rec.id);
    if (!swOrder.length) {
      layer.classList.add('empty');
      setTimeout(() => { if (mode === 'switcher' && !swOrder.length) switcherToHome(); }, 450);
    } else {
      sx = OS.clamp(sx, 0, swOrder.length - 1);
      setTimeout(() => layoutCards(true), 60);
    }
  }

  function installSwitcherGestures() {
    let d = null;
    layer.addEventListener('pointerdown', (e) => {
      if (mode !== 'switcher') return;
      const p = OS.point(e);
      const winEl = e.target.closest('.app-window');
      d = { x: p.x, y: p.y, t: performance.now(), sx0: sx, rec: winEl ? running.get(winEl.dataset.app) : null, axis: null, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id || mode !== 'switcher') return;
      const p = OS.point(e);
      const dx = p.x - d.x, dy = p.y - d.y;
      if (!d.axis) {
        if (Math.abs(dx) > 8) d.axis = 'x';
        else if (dy < -8 && d.rec) d.axis = 'y';
        else return;
      }
      if (d.axis === 'x') {
        let v = d.sx0 + dx / spacing();
        const max = Math.max(0, swOrder.length - 1);
        if (v < 0) v = v * .35;
        if (v > max) v = max + (v - max) * .35;
        sx = v;
        layoutCards(false);
      } else {
        const i = swOrder.indexOf(d.rec);
        if (i < 0) return;
        const { x, y, k } = cardPos(i);
        d.rec.win.style.transition = 'none';
        d.rec.win.style.transform = `translate(${x}px, ${y + Math.min(0, dy)}px) scale(${k})`;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const g = d;
      d = null;
      if (mode !== 'switcher') return;
      const p = OS.point(e);
      const dx = p.x - g.x, dy = p.y - g.y;
      const dt = Math.max(1, performance.now() - g.t);
      if (!g.axis) {
        if (g.rec) switcherOpen(g.rec);
        else switcherToHome();
        return;
      }
      if (g.axis === 'x') {
        const v = dx / dt;
        sx = OS.clamp(Math.round(sx + v * 1.2), 0, Math.max(0, swOrder.length - 1));
        layoutCards(true);
      } else if (dy < -110 || dy / dt < -.6) {
        kill(g.rec);
      } else {
        layoutCards(true);
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
    chromeStyle,
    running,
    get current() { return current; },
    get mode() { return mode; },
    get animating() { return animating; },
  };
})();
