/* ==========================================================================
   Liquid Glass refraction
   --------------------------------------------------------------------------
   Chromium can apply an SVG filter as a backdrop-filter. For every element
   registered here we build a displacement map that bends the backdrop near
   the rounded edge (a convex lens bevel), blur + saturate it, and set
   `backdrop-filter: url(#lg-…)`. Other engines keep the CSS-only glass.
   ========================================================================== */
(function () {
  'use strict';

  const supported = (function () {
    try {
      const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
      const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Opera/i.test(b.brand));
      return chromium && CSS.supports('backdrop-filter', 'url(#x)');
    } catch (e) {
      return false;
    }
  })();

  const filters = new Map();   // key → id
  const tracked = new Map();   // element → options
  let counter = 0;
  let ro = null;
  let defs = null;

  function displacementMap(w, h, radius, bezel) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const r = Math.min(radius, w / 2, h / 2);
    const hw = w / 2, hh = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + .5 - hw, py = y + .5 - hh;
        const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const outside = Math.hypot(ox, oy);
        const sdf = outside + Math.min(Math.max(qx, qy), 0) - r; // < 0 inside
        const dist = -sdf;
        let dx = 0, dy = 0;
        if (dist < bezel) {
          let nx, ny;
          if (qx > 0 && qy > 0) { nx = ox / (outside || 1); ny = oy / (outside || 1); }
          else if (qx > qy) { nx = 1; ny = 0; }
          else { nx = 0; ny = 1; }
          nx *= px < 0 ? -1 : 1;
          ny *= py < 0 ? -1 : 1;
          const t = 1 - OS.clamp(dist, 0, bezel) / bezel;   // 1 at the rim → 0 inside
          const k = t * t * (3 - 2 * t);                      // smoothstep bevel
          dx = -nx * k;
          dy = -ny * k;
        }
        const i = (y * w + x) * 4;
        d[i] = 128 + dx * 127;
        d[i + 1] = 128 + dy * 127;
        d[i + 2] = 128;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function filterFor(w, h, radius, opts) {
    const blur = opts.blur == null ? 3 : opts.blur;
    const sat = opts.saturate == null ? 1.45 : opts.saturate;
    const bezel = Math.max(6, Math.min(opts.bezel || 22, Math.min(w, h) / 2));
    const scale = opts.strength == null ? Math.min(48, Math.min(w, h) * .45) : opts.strength;
    const key = [w, h, radius, blur, sat, bezel, scale].join('|');
    if (filters.has(key)) return filters.get(key);
    const id = 'lg-' + (++counter);
    const href = displacementMap(w, h, radius, bezel);
    const svg = `<filter xmlns="http://www.w3.org/2000/svg" id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="blur"/>
      <feImage href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="blur" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="disp"/>
      <feColorMatrix in="disp" type="saturate" values="${sat}"/>
    </filter>`;
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tmp.innerHTML = svg;
    defs.appendChild(tmp.firstElementChild);
    filters.set(key, id);
    return id;
  }

  function enabled() {
    return supported && OS.settings.refraction;
  }

  /*
   * The filter lives on an inner ".lg-lens" layer, not on the element itself:
   * Chromium offsets SVG backdrop filters by the element's ink overflow
   * (e.g. an outer box-shadow), so the lens must be a child without shadows.
   */
  function lensOf(el) {
    let lens = el.querySelector(':scope > .lg-lens');
    if (!lens) {
      lens = document.createElement('div');
      lens.className = 'lg-lens';
      el.insertBefore(lens, el.firstChild);
    }
    return lens;
  }

  function update(el) {
    const opts = tracked.get(el);
    if (!opts) return;
    if (!el.isConnected) { if (opts.seen) forget(el); return; }
    opts.seen = true;
    if (!enabled()) {
      el.classList.remove('lg-on');
      const lens = el.querySelector(':scope > .lg-lens');
      if (lens) lens.style.removeProperty('backdrop-filter');
      return;
    }
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 8 || h < 8) return;
    const radius = opts.radius != null ? opts.radius : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const id = filterFor(w, h, Math.min(radius, w / 2, h / 2), opts);
    const lens = lensOf(el);
    lens.style.setProperty('backdrop-filter', `url(#${id})`);
    el.classList.add('lg-host', 'lg-on');
  }

  function forget(el) {
    tracked.delete(el);
    if (ro) ro.unobserve(el);
    const mo = observers.get(el);
    if (mo) { mo.disconnect(); observers.delete(el); }
  }

  const observers = new Map();

  function attach(el, opts) {
    if (!el) return;
    tracked.set(el, opts || {});
    if (!supported) return;
    if (!ro) ro = new ResizeObserver((entries) => entries.forEach((e) => update(e.target)));
    ro.observe(el);
    if (!observers.has(el)) {
      // innerHTML re-renders drop the lens: put it back
      const mo = new MutationObserver(() => {
        if (el.classList.contains('lg-on') && !el.querySelector(':scope > .lg-lens')) update(el);
      });
      mo.observe(el, { childList: true });
      observers.set(el, mo);
    }
    requestAnimationFrame(() => update(el));
  }

  function refreshAll() {
    tracked.forEach((_, el) => update(el));
  }

  /* iOS 26 interactive glass: touching a glass control lights it up from under
     the finger, and the light follows the finger until it lifts */
  const TOUCHABLE = 'button.glass, .glass button, .gbtn, .glass[data-t], .glass[data-a], .glass[role="button"], .notif, .tabbar-pill, .sp-field, .home-search, .library-search, .pill-btn, .lock-quick';

  function installTouchLight() {
    let lit = null;
    let id = null;
    const aim = (e) => {
      const r = OS.rectOf(lit);
      const p = OS.point(e);
      const kx = lit.offsetWidth / Math.max(1, r.width), ky = lit.offsetHeight / Math.max(1, r.height);
      lit.style.setProperty('--lx', ((p.x - r.x) * kx).toFixed(1) + 'px');
      lit.style.setProperty('--ly', ((p.y - r.y) * ky).toFixed(1) + 'px');
    };
    const release = (e) => {
      if (!lit || (e && e.pointerId !== id)) return;
      lit.classList.remove('touching');
      lit = null;
    };
    document.addEventListener('pointerdown', (e) => {
      release();
      const hit = e.target.closest && e.target.closest(TOUCHABLE);
      const g = hit && (hit.classList.contains('glass') ? hit : hit.closest('.glass'));
      if (!g || !OS.screenEl.contains(g)) return;
      lit = g;
      id = e.pointerId;
      aim(e);
      g.classList.add('touching');
    }, true);
    window.addEventListener('pointermove', (e) => { if (lit && e.pointerId === id) aim(e); }, { passive: true });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  function init() {
    defs = document.querySelector('#svg-defs defs');
    OS.on('setting:refraction', refreshAll);
    installTouchLight();
  }

  OS.Glass = { supported, attach, refreshAll, init, update };
})();
