/* ==========================================================================
   iOS scrolling for mouse and trackpad users: grab-and-fling with UIScrollView
   deceleration, rubber-band overscroll that springs back, and the large title
   that stretches when a list is pulled down. Touch screens keep the native
   scrolling (which already behaves like this on iPhone).
   ========================================================================== */
(function () {
  'use strict';

  const SCROLLERS = '.scroll, .scroll-x, .nav-scroll, .sheet-body, .library, .sp-results, .mp-results';
  const SKIP = 'input, textarea, select, [contenteditable="true"], canvas, iframe, video, .slider, .switch, .wheel, [data-slider], .cc-slider, .wx-pages, .no-dragscroll';
  const OUTSIDE = '#cc, #nc, #lock, #apps.switcher';
  const DECEL = .998; // UIScrollView.DecelerationRate.normal, per millisecond
  const K = -Math.log(DECEL) * 1000; // per second

  const state = new WeakMap(); // element → { off, spring, momentum }

  function st(el) {
    let s = state.get(el);
    if (!s) { s = { off: 0, spring: null, raf: 0, wheelT: null }; state.set(el, s); }
    return s;
  }

  const horizontal = (el) => el.classList.contains('scroll-x');
  const maxOf = (el, h) => (h ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight);
  const posOf = (el, h) => (h ? el.scrollLeft : el.scrollTop);
  const setPos = (el, h, v) => { if (h) el.scrollLeft = v; else el.scrollTop = v; };

  /** overscroll offset, applied as a transform on the scroller */
  function paintOff(el, h, off) {
    st(el).off = off;
    el.style.transform = Math.abs(off) < .1 ? '' : (h ? `translate3d(${off}px, 0, 0)` : `translate3d(0, ${off}px, 0)`);
    // a large title grows a little when its list is pulled down
    if (!h && el.classList.contains('nav-scroll')) {
      const t = el.querySelector(':scope > .large-title');
      if (t) {
        t.style.transformOrigin = '0 50%';
        t.style.transform = off > .5 ? `scale(${1 + Math.min(.12, off / 900)})` : '';
      }
    }
  }

  function stop(el) {
    const s = st(el);
    if (s.spring) { s.spring.stop(); s.spring = null; }
    if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  }

  /** springs the overscroll back to rest, starting with velocity v (px/s, visual) */
  function bounceBack(el, h, v) {
    const s = st(el);
    if (s.spring) s.spring.stop();
    s.spring = OS.motion.animate({
      from: s.off, to: 0, velocity: v || 0, preset: { response: .45, damping: 1 }, restDelta: .3,
      onUpdate(x) { paintOff(el, h, x); },
      onComplete() { s.spring = null; paintOff(el, h, 0); },
    });
  }

  /** content velocity v (px/s, positive = scroll position increasing) */
  function fling(el, h, v) {
    const s = st(el);
    const snap = getComputedStyle(el).scrollSnapType;
    if (snap && snap !== 'none') {
      // snapping lists choose the snap point nearest to where the flick would land
      const target = posOf(el, h) + OS.motion.project(v, DECEL);
      el.style.scrollSnapType = '';
      el.scrollTo(h ? { left: target, behavior: 'smooth' } : { top: target, behavior: 'smooth' });
      return;
    }
    if (Math.abs(v) < 20) return;
    const p0 = posOf(el, h);
    const max = maxOf(el, h);
    let t0 = null;
    const tick = (now) => {
      if (t0 == null) t0 = now;
      const t = (now - t0) / 1000;
      const vt = v * Math.exp(-K * t);
      const p = p0 + (v / K) * (1 - Math.exp(-K * t));
      if (p < 0 || p > max) {
        // ran into an edge: the remaining speed carries into the rubber band and back
        setPos(el, h, p < 0 ? 0 : max);
        s.raf = 0;
        bounceBack(el, h, -vt);
        return;
      }
      setPos(el, h, p);
      if (Math.abs(vt) < 8) { s.raf = 0; return; }
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  }

  function scrollerFor(target) {
    if (target.closest(SKIP) || target.closest(OUTSIDE)) return null;
    const el = target.closest(SCROLLERS);
    return el && OS.screenEl.contains(el) ? el : null;
  }

  function installDrag() {
    let g = null;
    let draggedAt = 0;
    OS.screenEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button > 0) return;
      const el = scrollerFor(e.target);
      if (!el) return;
      const h = horizontal(el);
      const p = OS.point(e);
      const s = st(el);
      // a click on a gliding list stops it, like a finger would
      const wasMoving = !!(s.raf || s.spring);
      stop(el);
      // a horizontal shelf inside a vertical list hands vertical drags to the list
      const outer = el.parentElement && el.parentElement.closest(SCROLLERS);
      const alt = outer && horizontal(outer) !== h && !outer.closest(OUTSIDE) ? outer : null;
      g = { el, h, alt, x: p.x, y: p.y, id: e.pointerId, active: false, tr: OS.motion.tracker(), wasMoving };
      g.tr.add(p.x, p.y);
    });
    window.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = OS.point(e);
      g.tr.add(p.x, p.y);
      const dx = p.x - g.x, dy = p.y - g.y;
      if (!g.active) {
        if (Math.hypot(dx, dy) < 7) return;
        // only take the drag if it goes along the scroller's axis
        const along = g.h ? Math.abs(dx) > Math.abs(dy) : Math.abs(dy) > Math.abs(dx);
        if (!along) {
          if (!g.alt) { g = null; return; }
          g.el = g.alt;
          g.h = !g.h;
          stop(g.el);
        }
        g.active = true;
        const s = st(g.el);
        g.start = posOf(g.el, g.h);
        g.off0 = s.off;
        g.x = p.x; g.y = p.y;
        g.el.style.scrollSnapType = 'none';
        g.el.style.scrollBehavior = 'auto';
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }
      const d = g.h ? p.x - g.x : p.y - g.y;
      const max = Math.max(0, maxOf(g.el, g.h));
      const dim = g.h ? g.el.clientWidth : g.el.clientHeight;
      // where the content would be without edges (overscroll counted back from the offset)
      const raw = g.start - OS.motion.unrubber(g.off0, dim) - d;
      if (raw < 0) {
        setPos(g.el, g.h, 0);
        paintOff(g.el, g.h, OS.motion.rubber(-raw, dim));
      } else if (raw > max) {
        setPos(g.el, g.h, max);
        paintOff(g.el, g.h, -OS.motion.rubber(raw - max, dim));
      } else {
        setPos(g.el, g.h, raw);
        if (st(g.el).off) paintOff(g.el, g.h, 0);
      }
    });
    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const s0 = g;
      g = null;
      if (!s0.active) {
        if (s0.wasMoving) { draggedAt = performance.now(); bounceBack(s0.el, s0.h, 0); }
        return;
      }
      draggedAt = performance.now();
      s0.el.style.scrollBehavior = '';
      const v = s0.tr.velocity();
      const vc = -(s0.h ? v.x : v.y); // content velocity
      const s = st(s0.el);
      if (Math.abs(s.off) > .5) { s0.el.style.scrollSnapType = ''; bounceBack(s0.el, s0.h, -vc); return; }
      fling(s0.el, s0.h, vc);
      if (!s.raf) s0.el.style.scrollSnapType = '';
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // a drag (or catching a moving list) must not also click what is under the cursor
    OS.screenEl.addEventListener('click', (e) => {
      if (performance.now() - draggedAt < 80) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  /** trackpads and wheels stretch the list past its ends, then it springs back */
  function installWheel() {
    OS.screenEl.addEventListener('wheel', (e) => {
      // the wheel's dominant direction picks the scroller: a vertical wheel over a
      // horizontal shelf belongs to the list around it
      const h = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      let el = scrollerFor(e.target);
      while (el && horizontal(el) !== h) el = el.parentElement && el.parentElement.closest(SCROLLERS);
      if (!el || el.closest(OUTSIDE)) return;
      const delta = h ? e.deltaX : e.deltaY;
      if (!delta) return;
      const max = maxOf(el, h);
      const pos = posOf(el, h);
      const s = st(el);
      const atStart = pos <= 0 && delta < 0;
      const atEnd = pos >= max - 1 && delta > 0;
      if (!atStart && !atEnd && !s.off) return;
      if (s.spring) { s.spring.stop(); s.spring = null; }
      const dim = h ? el.clientWidth : el.clientHeight;
      // accumulate the "raw" overscroll and show it through the rubber band
      s.raw = (Math.abs(s.off) < .1 ? 0 : s.raw || 0) - delta;
      if ((s.off > 0 && s.raw < 0) || (s.off < 0 && s.raw > 0)) s.raw = 0;
      paintOff(el, h, Math.sign(s.raw) * OS.motion.rubber(Math.abs(s.raw), dim, .35));
      clearTimeout(s.wheelT);
      s.wheelT = setTimeout(() => { s.raw = 0; bounceBack(el, h, 0); }, 90);
    }, { passive: true });
  }

  function init() {
    installDrag();
    installWheel();
  }

  OS.Scroll = { init, stop };
})();
