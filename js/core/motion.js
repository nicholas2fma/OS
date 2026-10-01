/* ==========================================================================
   Motion — the physics behind every animation, modelled on UIKit/SwiftUI.
   · Damped springs described like Apple does: `response` (seconds per
     oscillation) and `dampingFraction` (1 = no bounce, < 1 = bounce).
   · Springs are interruptible and start from the finger's velocity.
   · The same springs are sampled into CSS `linear()` easings, so plain CSS
     transitions move with real spring curves too.
   · Apple's rubber-band formula and scroll-style velocity projection.
   ========================================================================== */
(function () {
  'use strict';

  /* Presets mirror SwiftUI's named springs and the system values used by UIKit */
  const PRESETS = {
    smooth: { response: .5, damping: 1 },       // .smooth
    snappy: { response: .45, damping: .86 },    // .snappy
    bouncy: { response: .5, damping: .7 },      // .bouncy
    default: { response: .55, damping: .825 },  // .spring()
    interactive: { response: .15, damping: .86 }, // .interactiveSpring()
    appOpen: { response: .52, damping: .9 },
    appClose: { response: .42, damping: .92 },
    sheet: { response: .48, damping: .9 },
    nav: { response: .42, damping: 1 },
    island: { response: .5, damping: .72 },
    lens: { response: .35, damping: .7 },
  };

  /* ---------------- analytic damped harmonic oscillator ---------------- */

  /**
   * Returns f(t) → [displacement, velocity] for a spring that starts at
   * displacement x0 (value − target) with velocity v0 (units per second).
   */
  function solver(response, damping, x0, v0) {
    const w0 = (2 * Math.PI) / Math.max(.01, response);
    const z = Math.max(0, damping);
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const A = x0, B = (v0 + z * w0 * x0) / wd;
      return (t) => {
        const e = Math.exp(-z * w0 * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
        const x = e * (A * c + B * s);
        const v = e * ((B * wd - z * w0 * A) * c - (A * wd + z * w0 * B) * s);
        return [x, v];
      };
    }
    if (z === 1) {
      const B = v0 + w0 * x0;
      return (t) => {
        const e = Math.exp(-w0 * t);
        return [e * (x0 + B * t), e * (B - w0 * (x0 + B * t))];
      };
    }
    const r1 = -w0 * (z - Math.sqrt(z * z - 1)), r2 = -w0 * (z + Math.sqrt(z * z - 1));
    const c1 = (v0 - r2 * x0) / (r1 - r2), c2 = x0 - c1;
    return (t) => {
      const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
      return [c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
    };
  }

  function params(o) {
    let p;
    if (typeof o === 'string') p = Object.assign({}, PRESETS[o] || PRESETS.default);
    else if (o && o.preset) p = Object.assign({}, PRESETS[o.preset], o);
    else p = Object.assign({}, PRESETS.default, o || {});
    return p;
  }

  /** Riduci movimento: no bounce, shorter springs */
  function reduce(p) {
    if (typeof OS !== 'undefined' && OS.settings && OS.settings.reduceMotion) {
      p.damping = Math.max(1, p.damping);
      p.response = Math.min(p.response, .34);
    }
    return p;
  }

  /* ---------------- shared frame loop ---------------- */

  const running = new Set();
  let raf = 0;
  function loop(now) {
    raf = 0;
    running.forEach((a) => a.step(now));
    if (running.size) raf = requestAnimationFrame(loop);
  }
  function schedule(a) {
    running.add(a);
    if (!raf) raf = requestAnimationFrame(loop);
  }

  /**
   * Animates one number or an object of numbers.
   * opts: { from, to, velocity, response, damping, preset, onUpdate(value), onComplete(), restDelta }
   * Returns a handle: stop(), retarget(to), value, velocity, done (Promise).
   */
  function animate(opts) {
    const p = params(opts.preset ? opts.preset : opts);
    if (opts.response != null) p.response = opts.response;
    if (opts.damping != null) p.damping = opts.damping;
    reduce(p);
    const single = typeof opts.from === 'number';
    const wrap = (v) => (single ? { v } : Object.assign({}, v));
    let from = wrap(opts.from);
    let to = wrap(opts.to);
    let vel = opts.velocity == null ? {} : wrap(opts.velocity);
    const keys = Object.keys(to);
    const restDelta = opts.restDelta == null ? .005 : opts.restDelta;
    let solvers, t0 = null, current = Object.assign({}, from), currentV = {};
    let resolve;
    const done = new Promise((r) => { resolve = r; });

    function build() {
      solvers = {};
      keys.forEach((k) => {
        const x0 = (from[k] == null ? to[k] : from[k]) - to[k];
        solvers[k] = solver(p.response, p.damping, x0, vel[k] || 0);
      });
    }
    build();

    const handle = {
      done,
      get value() { return single ? current.v : current; },
      get velocity() { return single ? currentV.v || 0 : currentV; },
      step(now) {
        if (t0 == null) t0 = now;
        // OS.motion.slow > 1 plays every spring in slow motion (like the Simulator's "Slow Animations")
        const t = (now - t0) / 1000 / (OS.motion.slow || 1);
        let settled = true;
        keys.forEach((k) => {
          const [x, v] = solvers[k](t);
          current[k] = to[k] + x;
          currentV[k] = v;
          // pixels settle at sub-pixel precision, unit values (progress, scale) at restDelta
          const range = Math.abs(to[k] - (from[k] == null ? to[k] : from[k]));
          const tol = range > 2 ? .3 : restDelta;
          if (Math.abs(x) > tol || Math.abs(v) > tol * 12) settled = false;
        });
        if (t > 6) settled = true;
        if (settled) keys.forEach((k) => { current[k] = to[k]; currentV[k] = 0; });
        if (opts.onUpdate) opts.onUpdate(handle.value, handle);
        if (settled) {
          running.delete(handle);
          if (opts.onComplete) opts.onComplete(handle.value);
          resolve(true);
        }
      },
      stop() {
        running.delete(handle);
        resolve(false);
      },
      /** interrupt and head somewhere else, keeping the current velocity */
      retarget(newTo, newOpts) {
        from = Object.assign({}, current);
        vel = Object.assign({}, currentV);
        to = wrap(newTo);
        if (newOpts) Object.assign(p, params(newOpts));
        t0 = null;
        build();
        schedule(handle);
      },
    };
    if (opts.immediate) { handle.step(performance.now() + 1e7); return handle; }
    schedule(handle);
    return handle;
  }

  /**
   * A single animatable value that a finger can grab and a spring can take
   * over, keeping its velocity when interrupted (like a UIViewPropertyAnimator).
   * paint(value) is called on every change.
   */
  function value(initial, paint) {
    let v = initial;
    let anim = null;
    return {
      get value() { return v; },
      get velocity() { return anim ? anim.velocity : 0; },
      get animating() { return !!anim; },
      set(x) {
        if (anim) { anim.stop(); anim = null; }
        v = x;
        paint(v);
      },
      /** opts: { preset | response/damping, velocity, onComplete } */
      spring(to, opts) {
        opts = opts || {};
        const v0 = opts.velocity != null ? opts.velocity : (anim ? anim.velocity : 0);
        if (anim) anim.stop();
        const a = animate(Object.assign({}, typeof opts.preset === 'object' ? opts.preset : {}, {
          from: v, to, velocity: v0,
          preset: typeof opts.preset === 'string' ? opts.preset : undefined,
          restDelta: opts.restDelta,
          onUpdate(x) { v = x; paint(v); },
          onComplete() { if (anim === a) anim = null; if (opts.onComplete) opts.onComplete(); },
        }));
        anim = a;
        return a.done;
      },
      stop() { if (anim) { anim.stop(); anim = null; } },
    };
  }

  /* ---------------- CSS linear() easings from springs ---------------- */

  const cssSupport = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)');
  const cache = new Map();

  /**
   * Samples a spring going from 0 to 1 (optionally with a normalized initial
   * velocity) into { easing: 'linear(...)', duration: ms }.
   */
  function css(spec, v0n) {
    const p = reduce(params(spec));
    const key = p.response + '|' + p.damping + '|' + (v0n || 0);
    if (cache.has(key)) return cache.get(key);
    const f = solver(p.response, p.damping, -1, v0n || 0);
    let T = 0;
    for (let t = 0; t < 4; t += .01) {
      const [x, v] = f(t);
      if (Math.abs(x) < .001 && Math.abs(v) < .01) { T = t; break; }
      T = t;
    }
    T = Math.max(.15, T);
    const N = Math.min(80, Math.max(24, Math.round(T * 60)));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const [x] = f((i / N) * T);
      pts.push(+(1 + x).toFixed(4));
    }
    pts[N] = 1;
    const out = { easing: cssSupport ? `linear(${pts.join(', ')})` : (p.damping < .85 ? 'cubic-bezier(.34, 1.4, .64, 1)' : 'cubic-bezier(.2, .9, .25, 1)'), duration: Math.round(T * 1000) };
    cache.set(key, out);
    return out;
  }

  /** exposes the spring presets to CSS as --spring-NAME (easing) and --spring-NAME-dur */
  function installCSS(root) {
    Object.keys(PRESETS).forEach((name) => {
      const c = css(name);
      root.style.setProperty('--spring-' + name, c.easing);
      root.style.setProperty('--spring-' + name + '-dur', c.duration + 'ms');
    });
    // the generic easings used throughout the stylesheets become real springs
    root.style.setProperty('--ease-spring', css('smooth').easing);
    root.style.setProperty('--ease-bounce', css('bouncy').easing);
    root.style.setProperty('--ease-snappy', css('snappy').easing);
  }

  /* ---------------- gestures helpers ---------------- */

  /** Apple's rubber band: resistance grows the further you pull */
  function rubber(offset, dimension, c) {
    c = c == null ? .55 : c;
    const d = Math.max(1, dimension);
    return Math.sign(offset) * (1 - 1 / ((Math.abs(offset) * c) / d + 1)) * d;
  }

  /** inverse of rubber(): how far the finger went to produce a given stretch */
  function unrubber(stretch, dimension, c) {
    c = c == null ? .55 : c;
    const d = Math.max(1, dimension);
    const k = Math.min(.95, Math.abs(stretch) / d);
    return Math.sign(stretch) * (d / c) * (1 / (1 - k) - 1);
  }

  /** where a flick would come to rest (UIScrollView-style deceleration) */
  function project(velocity, rate) {
    const r = rate == null ? .992 : rate;
    return (velocity / 1000) * r / (1 - r);
  }

  /** collects pointer samples and reports release velocity in px/s */
  function tracker() {
    const pts = [];
    return {
      add(x, y, t) {
        pts.push({ x, y, t: t == null ? performance.now() : t });
        while (pts.length > 2 && pts[pts.length - 1].t - pts[0].t > 100) pts.shift();
      },
      velocity() {
        if (pts.length < 2) return { x: 0, y: 0 };
        const a = pts[0], b = pts[pts.length - 1];
        const dt = Math.max(8, b.t - a.t) / 1000;
        // a finger that stopped before lifting has no velocity
        if (performance.now() - b.t > 80) return { x: 0, y: 0 };
        return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
      },
      reset() { pts.length = 0; },
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  /** maps t through a sub-range [a, b] of the animation */
  const segment = (t, a, b) => clamp01((t - a) / (b - a));

  OS.motion = { PRESETS, animate, value, css, installCSS, rubber, unrubber, project, tracker, lerp, segment, clamp01, cssSupport, solver };
})();
