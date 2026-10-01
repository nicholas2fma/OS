/* ==========================================================================
   System gestures (edges), hardware buttons, keyboard shortcuts, sizing
   ========================================================================== */
(function () {
  'use strict';

  const TOP_ZONE = 40;
  const BOTTOM_ZONE = 30;

  /* ---------- sizing: framed device on desktop, full-bleed on phones ---------- */

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const full = coarse && Math.min(vw, vh) < 600;
    document.body.classList.toggle('fullscreen', full);
    const root = document.documentElement;
    if (full) {
      OS.state.fullscreen = true;
      OS.state.scale = 1;
      OS.state.width = vw;
      OS.state.height = vh;
      root.style.setProperty('--sw', vw + 'px');
      root.style.setProperty('--sh', vh + 'px');
      root.style.setProperty('--scale', 1);
    } else {
      OS.state.fullscreen = false;
      OS.state.width = 402;
      OS.state.height = 874;
      root.style.setProperty('--sw', '402px');
      root.style.setProperty('--sh', '874px');
      const help = vw > 900 && vh > 560 ? 316 : 0;
      const s = Math.min((vw - help - 40) / 428, (vh - 40) / 900, 1.15);
      OS.state.scale = Math.max(.35, s);
      root.style.setProperty('--scale', OS.state.scale);
    }
    // home grid adapts to short screens (e.g. Safari with its toolbars)
    const H = OS.state.height;
    root.style.setProperty('--row-h', Math.round(OS.clamp((H - 260) / 5, 78, 98)) + 'px');
    root.style.setProperty('--icon', (H < 740 ? 56 : 62) + 'px');
    OS.emit('resize');
  }

  /* ---------- edge gestures ---------- */

  function installEdges() {
    const screen = OS.screenEl;
    let g = null;

    screen.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !OS.state.screenOn) return;
      if (document.getElementById('overlay').classList.contains('active')) return;
      const p = OS.point(e);
      const W = OS.state.width, H = OS.state.height;

      // top edge. iOS 27 with Siri AI: left → Notification Center, centre (Dynamic Island) →
      // Cerca o chiedi, right → Control Center. Without Siri AI: the iOS 26 map.
      const onIsland = !!e.target.closest('#island, #island-bubble');
      if (p.y < TOP_ZONE + (onIsland ? 10 : 0) && !OS.state.ccOpen && !OS.state.ncOpen && !OS.state.spotlightOpen) {
        let kind;
        if (OS.settings.siriAI && !OS.state.locked) kind = p.x > W * .66 ? 'cc' : p.x < W * .34 ? 'nc' : 'ask';
        else kind = p.x > W * .6 ? 'cc' : 'nc';
        if (onIsland && kind !== 'ask') return;
        g = { kind, x: p.x, y: p.y, t: performance.now(), id: e.pointerId, active: false, tr: OS.motion.tracker() };
        if (!onIsland) e.stopPropagation();
        return;
      }

      // bottom edge → home / app switcher
      if (p.y > H - BOTTOM_ZONE && !OS.state.locked && !e.target.closest('.sheet-wrap')) {
        g = { kind: 'home', x: p.x, y: p.y, t: performance.now(), lastMove: performance.now(), id: e.pointerId, active: false, mode: OS.Apps.mode, tr: OS.motion.tracker() };
        e.stopPropagation();
      }
    }, true);

    window.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = OS.point(e);
      g.tr.add(p.x, p.y);
      const dx = p.x - g.x, dy = p.y - g.y;
      if (!g.active) {
        if (Math.hypot(dx, dy) < 6) return;
        g.active = true;
        if (g.kind === 'cc') OS.CC.beginDrag();
        if (g.kind === 'nc') OS.NC.beginDrag();
        if (g.kind === 'ask') { OS.Island.suppressNextClick(); OS.Spotlight.beginPull(); }
        if (g.kind === 'home' && g.mode === 'app') {
          // sliding along the Home bar switches apps; moving up goes Home
          if (Math.abs(dx) > Math.abs(dy) * 1.2) g.h = OS.Apps.hDragStart();
          else g.app = OS.Apps.dragStart();
        }
      }
      if (g.kind === 'cc') OS.CC.drag(dy);
      if (g.kind === 'nc') OS.NC.drag(dy);
      if (g.kind === 'ask') OS.Spotlight.pull(dy);
      if (g.kind === 'home' && g.h) OS.Apps.hDragMove(dx);
      if (g.kind === 'home' && g.app) {
        if (Math.abs(p.y - (g.py == null ? p.y : g.py)) > 1.5 || Math.abs(p.x - (g.px == null ? p.x : g.px)) > 1.5) g.lastMove = performance.now();
        g.px = p.x; g.py = p.y;
        OS.Apps.dragMove(dx, -dy);
      }
    });

    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      const p = OS.point(e);
      s.tr.add(p.x, p.y);
      const dx = p.x - s.x, dy = p.y - s.y;
      const vel = s.tr.velocity();

      if (s.kind === 'cc') { if (s.active) OS.CC.release(dy, vel.y); return; }
      if (s.kind === 'nc') { if (s.active) OS.NC.release(dy, vel.y); return; }
      if (s.kind === 'ask') { if (s.active) OS.Spotlight.endPull(dy, vel.y); return; }
      // home gesture
      if (!s.active) {
        // a click on the home indicator acts like the home gesture (desktop friendly)
        goHome();
        return;
      }
      if (s.h) { OS.Apps.hDragEnd(dx, vel.x); return; }
      if (s.app) {
        // a finger that rested before lifting asks for the app switcher
        const held = performance.now() - s.lastMove > 140;
        OS.Apps.dragEnd(dx, -dy, vel.x, -vel.y, held);
        return;
      }
      if (-dy > 40 || vel.y < -500) goHome();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function goHome() {
    if (OS.state.ccOpen) { OS.CC.close(); return; }
    if (OS.state.ncOpen) { OS.NC.close(); return; }
    if (OS.state.locked) { OS.Lock.unlock(); return; }
    if (OS.state.spotlightOpen) { OS.Spotlight.close(); return; }
    if (OS.Home.jiggle) { OS.Home.exitJiggle(); return; }
    if (OS.Apps.mode === 'home') { OS.Home.goToPage(0); return; }
    OS.Apps.home();
  }

  /* ---------- hardware buttons ---------- */

  let hudT = null;
  function volumeHUD() {
    const hud = document.getElementById('hud');
    let el = hud.querySelector('.hud-volume');
    if (!el) {
      el = OS.el(`<div class="hud-volume glass"><div class="fill"></div>${OS.sym('speaker', { size: 20 })}</div>`);
      hud.appendChild(el);
    }
    el.querySelector('.fill').style.height = (OS.settings.volume * 100) + '%';
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(hudT);
    hudT = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function hardware(kind) {
    switch (kind) {
      case 'power': OS.Lock.power(); break;
      case 'volup':
      case 'voldown': {
        const v = OS.clamp(OS.settings.volume + (kind === 'volup' ? .0625 : -.0625), 0, 1);
        OS.set('volume', Math.round(v * 10000) / 10000);
        if (OS.state.screenOn) volumeHUD();
        OS.sound('click');
        break;
      }
      case 'action': {
        const on = OS.toggle('silent');
        if (!OS.state.screenOn) OS.Lock.wake();
        OS.Island.flash({
          left: `<span style="color:${on ? '#ff453a' : '#fff'}">${OS.sym(on ? 'bell-slash' : 'bell-fill', { size: 20 })}</span>`,
          right: `<span style="color:${on ? '#ff453a' : '#fff'}">${on ? 'Silenzioso' : 'Suoneria'}</span>`,
          width: 230,
        });
        OS.haptic(30);
        break;
      }
      case 'camera':
        if (!OS.state.screenOn) OS.Lock.wake();
        OS.Lock.unlock(() => OS.Apps.open('camera'));
        break;
      default:
    }
  }

  /* ---------- keyboard ---------- */

  function typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  }

  function installKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (typing()) { document.activeElement.blur(); }
        const overlay = document.getElementById('overlay');
        if (overlay.classList.contains('active')) {
          const dim = overlay.querySelector('.menu-dim, .sheet-dim');
          if (dim) dim.click();
          return;
        }
        if (OS.Island.expanded) { OS.Island.collapse(); return; }
        if (OS.Apps.mode === 'switcher') { OS.Apps.home(); return; }
        goHome();
        return;
      }
      if (typing()) return;
      if (!OS.state.screenOn) { OS.Lock.wake(); return; }
      const k = e.key.toLowerCase();
      if (OS.state.locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); OS.Lock.unlock(); return; }
      if (k === 'h') goHome();
      else if (k === 'm') { if (OS.Apps.mode === 'switcher') OS.Apps.home(); else OS.Apps.enterSwitcher(); }
      else if (k === 'c') { if (OS.state.ccOpen) OS.CC.close(); else { if (OS.state.ncOpen) OS.NC.close(); OS.CC.open(); } }
      else if (k === 'n') { if (OS.state.ncOpen) OS.NC.close(); else { if (OS.state.ccOpen) OS.CC.close(); OS.NC.open(); } }
      else if (k === 'l') OS.Lock.power();
      else if (k === 's') OS.Siri.activate();
      else if (e.key === '/' && !OS.state.locked && (OS.Apps.mode === 'home' || OS.settings.siriAI)) { e.preventDefault(); OS.Spotlight.open(); }
      else if (e.key === 'ArrowRight' && OS.Apps.mode === 'home' && !OS.state.locked) OS.Home.goToPage(OS.Home.page + 1);
      else if (e.key === 'ArrowLeft' && OS.Apps.mode === 'home' && !OS.state.locked) OS.Home.goToPage(OS.Home.page - 1);
    });
  }

  function init() {
    installEdges();
    installKeys();
    document.querySelectorAll('[data-hw]').forEach((b) => {
      if (b.dataset.hw !== 'power') { b.addEventListener('click', () => hardware(b.dataset.hw)); return; }
      // side button: press = lock / wake, hold = Siri (iOS 27)
      let t = null;
      let long = false;
      b.addEventListener('pointerdown', () => {
        long = false;
        if (OS.settings.siriButton === false) return;
        t = setTimeout(() => { long = true; OS.Siri.activate(); }, 550);
      });
      b.addEventListener('pointerup', () => { clearTimeout(t); if (!long) hardware('power'); });
      b.addEventListener('pointerleave', () => clearTimeout(t));
    });
    window.addEventListener('resize', resize);
    // prevent page zoom / context menus that break the illusion
    window.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, [contenteditable]')) e.preventDefault(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  OS.Gestures = { init, resize, goHome, hardware };
})();
