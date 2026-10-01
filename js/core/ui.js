/* ==========================================================================
   UI kit: navigation stack, tab bar, switches, segmented, sheets, alerts,
   context menus, wheel pickers
   ========================================================================== */
(function () {
  'use strict';

  const sym = (n, o) => OS.sym(n, o);

  /* ---------------- Navigation stack ---------------- */

  class Nav {
    constructor(root) {
      this.root = root;
      this.root.classList.add('nav');
      this.stack = [];
      this.installEdgeSwipe();
    }

    get current() { return this.stack[this.stack.length - 1]; }

    build(page) {
      const el = OS.el(`<section class="nav-page ${page.grouped ? 'grouped' : ''} ${page.large ? 'has-large' : 'no-large'} ${page.cls || ''}">
        <header class="nav-bar">
          <div class="nav-left"></div>
          <div class="nav-title">${OS.esc(page.title || '')}</div>
          <div class="nav-right"></div>
        </header>
        <div class="nav-scroll scroll">
          ${page.large ? `<h1 class="large-title">${OS.esc(page.title || '')}</h1>` : ''}
          <div class="nav-body"></div>
        </div>
      </section>`);
      page.el = el;
      page.body = el.querySelector('.nav-body');
      page.scroller = el.querySelector('.nav-scroll');
      page.left = el.querySelector('.nav-left');
      page.right = el.querySelector('.nav-right');
      page.titleEl = el.querySelector('.nav-title');
      page.largeEl = el.querySelector('.large-title');
      page.nav = this;
      page.setTitle = (t) => {
        page.title = t;
        page.titleEl.textContent = t;
        if (page.largeEl) page.largeEl.textContent = t;
      };
      page.scroller.addEventListener('scroll', () => {
        el.classList.toggle('scrolled', page.scroller.scrollTop > (page.large ? 36 : 4));
      }, { passive: true });
      if (this.stack.length > 0) {
        const back = OS.el(`<button class="gbtn glass" aria-label="Indietro">${sym('chevron-left', { stroke: 2.4 })}</button>`);
        back.addEventListener('click', () => this.pop());
        page.left.appendChild(back);
      }
      if (page.render) page.render(page.body, page);
      return el;
    }

    /** one spring per pushed page: 0 = off to the right, 1 = on top (interruptible) */
    transition(page) {
      if (!page.tv) {
        const prev = page.prev;
        const bar = page.el.querySelector('.nav-bar');
        const prevBar = prev && prev.el.querySelector('.nav-bar');
        page.tv = OS.motion.value(0, (p) => {
          const W = this.root.clientWidth || OS.state.width;
          const moving = p > 0 && p < 1;
          page.el.style.transform = p >= 1 ? '' : `translate3d(${(1 - p) * W}px, 0, 0)`;
          page.el.style.boxShadow = moving ? `0 0 32px rgba(0, 0, 0, ${(.18 * p).toFixed(3)})` : '';
          // the bars cross-fade and travel at half speed, like UINavigationBar
          bar.style.opacity = moving ? String(OS.motion.segment(p, .25, 1)) : '';
          bar.style.transform = moving ? `translate3d(${-(1 - p) * W * .5}px, 0, 0)` : '';
          if (prev) {
            prev.el.style.visibility = p >= 1 ? 'hidden' : '';
            prev.el.style.transform = p <= 0 ? '' : `translate3d(${-p * W * .3}px, 0, 0)`;
            prev.el.style.setProperty('--dim', p <= 0 ? '0' : (.1 * Math.min(1, p)).toFixed(3));
            if (prevBar) prevBar.style.opacity = moving ? String(1 - OS.motion.segment(p, 0, .6)) : '';
          }
        });
      }
      return page.tv;
    }

    push(page, animated) {
      animated = animated !== false && this.stack.length > 0;
      page.prev = this.current;
      page.tv = null;
      const el = this.build(page);
      this.stack.push(page);
      this.root.appendChild(el);
      const tv = this.transition(page);
      if (animated) { tv.set(0); tv.spring(1, { preset: 'nav' }); } else tv.set(1);
      if (page.onShow) page.onShow(page);
      return page;
    }

    /** velocity: progress units per second (from the back swipe) */
    pop(animated, velocity) {
      if (this.stack.length < 2) return;
      const page = this.stack.pop();
      const prev = this.current;
      const tv = this.transition(page);
      if (animated === false) {
        tv.set(0);
        page.el.remove();
      } else {
        tv.spring(0, { preset: 'nav', velocity, onComplete: () => { if (!this.stack.includes(page)) page.el.remove(); } });
      }
      if (page.onHide) page.onHide(page);
      if (prev.onShow) prev.onShow(prev);
    }

    popToRoot() {
      while (this.stack.length > 1) this.pop(false);
    }

    /** iOS 26: swipe back from the left edge, or from anywhere in the content */
    installEdgeSwipe() {
      let s = null;
      let endedAt = 0;
      this.root.addEventListener('pointerdown', (e) => {
        if (this.stack.length < 2 || e.button > 0) return;
        const p = OS.point(e);
        const r = OS.rectOf(this.root);
        const edge = p.x - r.x < 24;
        if (!edge && e.target.closest('input, textarea, select, [contenteditable="true"], canvas, iframe, .scroll-x, .switch, .segmented, .slider, .wheel, .no-backswipe, .notif')) return;
        s = { x: p.x, y: p.y, id: e.pointerId, active: false, tr: OS.motion.tracker(), page: this.current };
        s.tr.add(p.x, p.y);
      });
      this.root.addEventListener('click', (e) => {
        if (performance.now() - endedAt < 90) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      const onMove = (e) => {
        if (!this.root.isConnected) { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); return; }
        if (!s || e.pointerId !== s.id) return;
        const p = OS.point(e);
        s.tr.add(p.x, p.y);
        const dx = p.x - s.x, dy = p.y - s.y;
        if (!s.active) {
          if (Math.hypot(dx, dy) < 10) return;
          if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.4 || s.page !== this.current) { s = null; return; }
          s.active = true;
          s.tv = this.transition(s.page);
          s.tv.stop();
          s.p0 = s.tv.value;
          s.x = p.x;
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
        const W = this.root.clientWidth || OS.state.width;
        s.tv.set(OS.clamp(s.p0 - (p.x - s.x) / W, 0, 1));
      };
      const onUp = (e) => {
        if (!s || e.pointerId !== s.id) return;
        const g = s;
        s = null;
        if (!g.active) return;
        endedAt = performance.now();
        const W = this.root.clientWidth || OS.state.width;
        const v = g.tr.velocity().x;
        const projected = g.tv.value - OS.motion.project(v, .99) / W;
        if (g.page === this.current && (v > 400 || (v > -300 && projected < .5))) this.pop(true, -v / W);
        else g.tv.spring(1, { preset: 'nav', velocity: -v / W });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
  }

  /* ---------------- Controls ---------------- */

  function toggle(on, onChange) {
    const el = OS.el(`<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}"><span class="knob"></span></button>`);
    const knob = el.querySelector('.knob');
    let d = null;
    let draggedAt = 0;
    const commit = (v) => {
      el.classList.toggle('on', v);
      el.setAttribute('aria-checked', v);
      OS.haptic(6);
      if (onChange) onChange(v);
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (performance.now() - draggedAt < 90) return;
      commit(!el.classList.contains('on'));
    });
    // the knob can also be dragged; the track colour follows it live
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      d = { x: OS.point(e).x, on: el.classList.contains('on'), id: e.pointerId, moved: false, pos: 0 };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dx = OS.point(e).x - d.x;
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      const raw = (d.on ? 22 : 0) + dx;
      d.pos = raw < 0 ? -OS.motion.rubber(-raw, 20, .4) : raw > 22 ? 22 + OS.motion.rubber(raw - 22, 20, .4) : raw;
      el.classList.add('dragging');
      el.classList.toggle('on', d.pos > 11);
      knob.style.transform = `translateX(${d.pos}px) scale(1.25)`;
    });
    const up = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const g = d;
      d = null;
      el.classList.remove('dragging');
      knob.style.transform = '';
      if (!g.moved) return;
      draggedAt = performance.now();
      const v = g.pos > 11;
      el.classList.toggle('on', g.on);
      if (v !== g.on) commit(v);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.set = (v) => { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', !!v); };
    return el;
  }

  /**
   * The iOS 26 selection lens shared by tab bars and segmented controls: it
   * travels on a spring and stretches with its speed; pressing lifts it into a
   * glass drop that can be scrubbed across the items.
   */
  function lens(host, ind, sel, onPick) {
    let x = null, w = null, anim = null;
    const paint = (vx) => {
      const st = Math.min(26, Math.abs(vx || 0) * .018);
      ind.style.width = (w + st) + 'px';
      ind.style.transform = `translate3d(${x - st / 2}px, 0, 0) scaleY(${1 - st / 150})`;
    };
    function to(btn, velocity, instant) {
      if (!btn || !btn.offsetWidth) return;
      const tx = btn.offsetLeft, tw = btn.offsetWidth;
      const v0 = velocity != null ? velocity : (anim ? anim.velocity.x || 0 : 0);
      if (anim) { anim.stop(); anim = null; }
      if (instant || x == null) { x = tx; w = tw; paint(0); return; }
      anim = OS.motion.animate({
        from: { x, w }, to: { x: tx, w: tw }, velocity: { x: v0, w: 0 }, preset: { response: .42, damping: .72 },
        onUpdate(v, h) { x = v.x; w = v.w; paint(h.velocity.x); },
        onComplete() { anim = null; },
      });
    }
    let s = null;
    let scrubbedAt = 0;
    host.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !e.target.closest(sel)) return;
      const p = OS.point(e);
      s = { x0: p.x, id: e.pointerId, active: false, tr: OS.motion.tracker(), left: OS.rectOf(host).x, under: null };
      s.tr.add(p.x, p.y);
      ind.classList.add('lifted');
    });
    const items = () => Array.from(host.querySelectorAll(sel));
    const onMove = (e) => {
      if (!s || e.pointerId !== s.id) return;
      if (!host.isConnected) { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); return; }
      const p = OS.point(e);
      s.tr.add(p.x, p.y);
      if (!s.active && Math.abs(p.x - s.x0) < 6) return;
      if (!s.active) { s.active = true; if (anim) { anim.stop(); anim = null; } }
      const list = items();
      if (!list.length) return;
      const local = p.x - s.left;
      const under = list.find((b) => local < b.offsetLeft + b.offsetWidth) || list[list.length - 1];
      w += (under.offsetWidth - w) * .35;
      const min = list[0].offsetLeft, max = list[list.length - 1].offsetLeft + list[list.length - 1].offsetWidth - w;
      const want = local - w / 2;
      x = want < min ? min - OS.motion.rubber(min - want, 30, .5) : want > max ? max + OS.motion.rubber(want - max, 30, .5) : want;
      paint(s.tr.velocity().x);
      list.forEach((b) => b.classList.toggle('hover', b === under));
      s.under = under;
    };
    const onUp = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const g = s;
      s = null;
      ind.classList.remove('lifted');
      items().forEach((b) => b.classList.remove('hover'));
      if (!g.active || !g.under) return;
      scrubbedAt = performance.now();
      onPick(g.under, g.tr.velocity().x);
    };
    host.addEventListener('click', (e) => { if (performance.now() - scrubbedAt < 90) { e.stopPropagation(); e.preventDefault(); } }, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return { to };
  }

  function segmented(options, value, onChange) {
    const el = OS.el(`<div class="segmented"><div class="seg-thumb"></div>${options.map((o) =>
      `<button data-v="${OS.esc(o.value)}" class="${o.value === value ? 'on' : ''}">${OS.esc(o.label)}</button>`).join('')}</div>`);
    const L = lens(el, el.querySelector('.seg-thumb'), 'button', (b, v) => pick(b, v));
    const place = (instant) => L.to(el.querySelector('button.on'), 0, instant);
    function pick(b, velocity) {
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      L.to(b, velocity);
      OS.haptic(5);
      if (onChange) onChange(b.dataset.v);
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) pick(b);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => place(true)));
    new ResizeObserver(() => place(true)).observe(el);
    el.set = (v) => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); place(); };
    return el;
  }

  function slider(value, onInput, opts) {
    opts = opts || {};
    const el = OS.el(`<input type="range" class="slider" min="${opts.min || 0}" max="${opts.max || 1}" step="${opts.step || .01}" value="${value}">`);
    const paint = () => {
      const min = +el.min, max = +el.max;
      el.style.setProperty('--pct', ((el.value - min) / (max - min)) * 100 + '%');
    };
    el.addEventListener('input', () => { paint(); if (onInput) onInput(+el.value); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    paint();
    el.set = (v) => { el.value = v; paint(); };
    return el;
  }

  /* ---------------- Tab bar ---------------- */

  function tabBar(items, active, onChange, opts) {
    opts = opts || {};
    const el = OS.el(`<nav class="tabbar">
      <div class="tabbar-pill glass">
        <div class="tab-indicator"></div>
        ${items.map((it) => `<button class="tab ${it.id === active ? 'on' : ''}" data-id="${it.id}">${sym(it.icon, { stroke: 2 })}<span>${OS.esc(it.label)}</span></button>`).join('')}
      </div>
      ${opts.search ? `<button class="tabbar-search glass" aria-label="Cerca">${sym('search', { stroke: 2.2 })}</button>` : ''}
    </nav>`);
    const pill = el.querySelector('.tabbar-pill');
    const L = lens(pill, el.querySelector('.tab-indicator'), '.tab', (b, v) => pick(b, v));
    const place = (instant) => L.to(el.querySelector('.tab.on'), 0, instant);
    function pick(b, velocity) {
      el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
      L.to(b, velocity);
      OS.haptic(5);
      if (onChange) onChange(b.dataset.id);
    }
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (b) pick(b);
    });
    if (opts.search) el.querySelector('.tabbar-search').addEventListener('click', opts.search);
    requestAnimationFrame(() => requestAnimationFrame(() => place(true)));
    new ResizeObserver(() => place(true)).observe(el);
    el.set = (id) => { el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.dataset.id === id)); place(); };
    OS.Glass.attach(el.querySelector('.tabbar-pill'), { bezel: 18, strength: 30 });
    return el;
  }

  /* ---------------- Rows ---------------- */

  /**
   * Builds a list row.
   * opts: { icon, color, title, sub, value, chevron, toggle:{on,onChange}, onTap, cls, check }
   */
  function row(o) {
    const el = OS.el(`<div class="row ${o.onTap ? 'tap' : ''} ${o.icon ? 'has-icon' : ''} ${o.cls || ''}">
      ${o.icon ? `<div class="row-icon" style="--c:${o.color || 'var(--gray)'}">${sym(o.icon, { stroke: 2.2 })}</div>` : ''}
      ${o.leading || ''}
      <div class="row-main"><div class="row-title">${o.html || OS.esc(o.title || '')}</div>${o.sub ? `<div class="row-sub">${OS.esc(o.sub)}</div>` : ''}</div>
      ${o.value != null ? `<div class="row-value">${OS.esc(o.value)}</div>` : ''}
      ${o.check ? sym('check', { cls: 'check', stroke: 2.6 }) : ''}
      ${o.chevron ? sym('chevron-right', { cls: 'chev', stroke: 2.8 }) : ''}
    </div>`);
    if (o.toggle) el.appendChild(toggle(o.toggle.on, o.toggle.onChange));
    if (o.trailing) el.appendChild(o.trailing);
    if (o.onTap) el.addEventListener('click', (e) => { if (!e.target.closest('.switch')) o.onTap(el, e); });
    return el;
  }

  function section(rows, head, foot) {
    const el = OS.el(`<div class="section">${head ? `<div class="section-head">${OS.esc(head)}</div>` : ''}<div class="list"></div>${foot ? `<div class="section-foot">${OS.esc(foot)}</div>` : ''}</div>`);
    const list = el.querySelector('.list');
    rows.forEach((r) => r && list.appendChild(r.nodeType ? r : row(r)));
    return el;
  }

  /* ---------------- Sheet ---------------- */

  function sheet(container, o) {
    const wrap = OS.el(`<div class="sheet-wrap">
      <div class="sheet-dim"></div>
      <div class="sheet ${o.large ? 'large' : ''}">
        <div class="sheet-grabber"></div>
        <div class="sheet-head">
          <div class="left"></div>
          <div class="sheet-title">${OS.esc(o.title || '')}</div>
          <div class="right"></div>
        </div>
        <div class="sheet-body"></div>
      </div>
    </div>`);
    const sh = wrap.querySelector('.sheet');
    const dim = wrap.querySelector('.sheet-dim');
    const body = wrap.querySelector('.sheet-body');
    let closed = false;

    // a large sheet pushes the screen behind it back (only inside an app)
    const recede = (o.large && container.closest && container.closest('.app-content') ? Array.from(container.children) : [])
      .map((el) => ({ el, t: el.style.transform, r: el.style.borderRadius, o: el.style.overflow, to: el.style.transformOrigin }));
    const prevBg = container.style.background;
    let travel = 600;

    const sv = OS.motion.value(0, (p) => {
      const q = OS.motion.clamp01(p);
      sh.style.transform = Math.abs(p - 1) < .0005 ? 'none' : `translate3d(0, ${(1 - p) * travel}px, 0)`;
      dim.style.opacity = String(q);
      recede.forEach((b) => {
        const on = q > .001;
        b.el.style.transform = on ? `translate3d(0, ${q * 10}px, 0) scale(${1 - .06 * q})` : b.t;
        b.el.style.borderRadius = on ? (q * 28) + 'px' : b.r;
        b.el.style.overflow = on ? 'hidden' : b.o;
        b.el.style.transformOrigin = on ? '50% 0' : b.to;
      });
      if (recede.length) container.style.background = q > .001 ? '#000' : prevBg;
    });

    const api = {
      el: wrap, body,
      close(result, velocity) {
        if (closed) return;
        closed = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        wrap.style.pointerEvents = 'none';
        sv.spring(0, { preset: { response: .36, damping: 1 }, velocity, onComplete: () => wrap.remove() });
        if (o.onClose) o.onClose(result);
      },
    };
    if (o.left) {
      const b = OS.el(`<button class="gbtn glass" aria-label="${OS.esc(o.left.label || 'Chiudi')}">${o.left.icon ? sym(o.left.icon, { stroke: 2.4 }) : OS.esc(o.left.label)}</button>`);
      b.addEventListener('click', () => (o.left.onTap ? o.left.onTap(api) : api.close()));
      wrap.querySelector('.left').appendChild(b);
    }
    if (o.right) {
      const b = OS.el(`<button class="gbtn glass ${o.right.primary ? 'primary' : ''}" aria-label="${OS.esc(o.right.label || 'Fine')}">${o.right.icon ? sym(o.right.icon, { stroke: 2.6 }) : OS.esc(o.right.label)}</button>`);
      b.addEventListener('click', () => (o.right.onTap ? o.right.onTap(api) : api.close()));
      wrap.querySelector('.right').appendChild(b);
    }
    dim.addEventListener('click', () => api.close());

    // drag down to dismiss: from the header, or from the content when it is scrolled to the top
    let drag = null;
    let draggedAt = 0;
    sh.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || closed) return;
      if (e.target.closest('button, input, textarea, select, [contenteditable="true"], .slider, .switch, .wheel, canvas')) return;
      const inBody = !!e.target.closest('.sheet-body');
      if (inBody && body.scrollTop > 0) return;
      const p = OS.point(e);
      drag = { y: p.y, x: p.x, id: e.pointerId, inBody, active: false, tr: OS.motion.tracker(), p0: sv.value };
      drag.tr.add(p.x, p.y);
    });
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = OS.point(e);
      drag.tr.add(p.x, p.y);
      const dy = p.y - drag.y;
      if (!drag.active) {
        if (Math.abs(dy) < 8) return;
        // in the content only a pull down (at the top) moves the sheet; anything else scrolls
        if ((drag.inBody && dy < 0) || Math.abs(p.x - drag.x) > Math.abs(dy)) { drag = null; return; }
        drag.active = true;
        sv.stop();
        drag.y = p.y;
      }
      const d = p.y - drag.y;
      const base = (1 - drag.p0) * travel + d;
      // down follows the finger; up stretches a little
      sv.set(base >= 0 ? 1 - base / travel : 1 + OS.motion.rubber(-base, travel * .5) / travel);
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const g = drag;
      drag = null;
      if (!g.active) return;
      draggedAt = performance.now();
      const vy = g.tr.velocity().y;
      const offset = (1 - sv.value) * travel;
      if (vy > 500 || (vy > -200 && offset + OS.motion.project(vy, .99) > Math.min(220, travel * .45))) api.close(undefined, -vy / travel);
      else sv.spring(1, { preset: { response: .4, damping: .86 }, velocity: -vy / travel });
    };
    sh.addEventListener('click', (e) => { if (performance.now() - draggedAt < 90) { e.stopPropagation(); e.preventDefault(); } }, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    if (o.render) o.render(body, api);
    container.appendChild(wrap);
    travel = sh.offsetHeight + 16;
    sv.set(0);
    // presents on a soft spring, like a UISheetPresentationController
    requestAnimationFrame(() => { wrap.classList.add('show'); sv.spring(1, { preset: { response: .5, damping: .9 } }); });
    return api;
  }

  /* ---------------- Alert ---------------- */

  function alert(o) {
    const overlay = document.getElementById('overlay');
    const wrap = OS.el(`<div class="alert-wrap"><div class="alert glass">
      ${o.title ? `<h3>${OS.esc(o.title)}</h3>` : ''}
      ${o.message ? `<p>${OS.esc(o.message)}</p>` : ''}
      ${o.input ? `<input class="alert-input" placeholder="${OS.esc(o.input.placeholder || '')}" value="${OS.esc(o.input.value || '')}">` : ''}
      <div class="alert-buttons ${(o.buttons || []).length > 2 ? 'vertical' : ''}"></div>
    </div></div>`);
    const btns = wrap.querySelector('.alert-buttons');
    const input = wrap.querySelector('.alert-input');
    const close = () => {
      wrap.classList.remove('show');
      setTimeout(() => { wrap.remove(); if (!overlay.children.length) overlay.classList.remove('active'); }, 260);
    };
    (o.buttons || [{ label: 'OK', style: 'default' }]).forEach((b) => {
      const el = OS.el(`<button class="${b.style || ''}">${OS.esc(b.label)}</button>`);
      el.addEventListener('click', () => { close(); if (b.onTap) b.onTap(input ? input.value : undefined); });
      btns.appendChild(el);
    });
    overlay.appendChild(wrap);
    overlay.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('show')));
    if (input) setTimeout(() => input.focus(), 300);
    return { close };
  }

  /* ---------------- Context menu ---------------- */

  function menu(anchorEl, items, opts) {
    opts = opts || {};
    const overlay = document.getElementById('overlay');
    const r = OS.rectOf(anchorEl);
    const W = OS.state.width, H = OS.state.height;
    const wrap = OS.el('<div class="menu-wrap"><div class="menu-dim"></div></div>');
    const dim = wrap.querySelector('.menu-dim');
    let prev = null;
    if (opts.preview !== false) {
      prev = anchorEl.cloneNode(true);
      prev.classList.add('menu-preview');
      prev.style.left = r.x + 'px';
      prev.style.top = r.y + 'px';
      prev.style.width = r.width + 'px';
      prev.style.height = r.height + 'px';
      prev.style.margin = '0';
      wrap.appendChild(prev);
    }
    const m = OS.el(`<div class="menu glass">${items.map((it, i) => it === '-' ? '<hr>' :
      `<button data-i="${i}" class="${it.destructive ? 'destructive' : ''}"><span>${OS.esc(it.label)}</span>${it.icon ? sym(it.icon, { stroke: 2 }) : ''}</button>`).join('')}</div>`);
    wrap.appendChild(m);
    const menuH = items.reduce((h, it) => h + (it === '-' ? 14 : 44), 12);
    const below = r.y + r.height + 14 + menuH < H - 30;
    let left = r.x + r.width / 2 - 127;
    left = OS.clamp(left, 14, W - 254 - 14);
    const top = below ? r.y + r.height + 14 : Math.max(60, r.y - 14 - menuH);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    // the menu grows out of the element that summoned it
    m.style.transformOrigin = `${OS.clamp(r.x + r.width / 2 - left, 20, 234)}px ${below ? -14 : menuH + 14}px`;
    const rows = Array.from(m.children);

    const mv = OS.motion.value(0, (p) => {
      const q = OS.motion.clamp01(p);
      const seg = OS.motion.segment;
      // width opens a touch ahead of height, like the glass stretching out of the button
      m.style.transform = Math.abs(p - 1) < .0005 ? 'none' : `scale(${.18 + .82 * Math.min(1.04, seg(p, 0, .85) + Math.max(0, p - 1))}, ${.08 + .92 * p})`;
      m.style.opacity = String(seg(p, 0, .3));
      const c = String(seg(p, .3, .85));
      rows.forEach((el) => { el.style.opacity = c; });
      dim.style.opacity = String(q);
      if (prev) prev.style.transform = `scale(${1 + .07 * p})`;
    });

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      wrap.style.pointerEvents = 'none';
      // the screen is usable again at once, while the menu is still folding away
      if (Array.from(overlay.children).every((c) => c === wrap)) overlay.classList.remove('active');
      mv.spring(0, { preset: { response: .3, damping: 1 }, onComplete() { wrap.remove(); if (!overlay.children.length) overlay.classList.remove('active'); } });
      if (opts.onClose) opts.onClose();
    };
    const choose = (b) => {
      const it = items[+b.dataset.i];
      close();
      if (it && it.onTap) setTimeout(() => it.onTap(), 120);
    };
    dim.addEventListener('click', close);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) choose(b);
    });
    // keep the finger down after a long press and slide onto an item, then lift to choose it
    let downInMenu = false;
    m.addEventListener('pointerdown', () => { downInMenu = true; });
    const hit = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el && m.contains(el) ? el.closest('button') : null;
    };
    const onMove = (e) => {
      if (closing || !e.buttons) return;
      const b = hit(e);
      rows.forEach((x) => x.classList.toggle('hover', x === b));
    };
    const onUp = (e) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (closing || downInMenu) return;
      const b = hit(e);
      if (b) choose(b);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    overlay.appendChild(wrap);
    overlay.classList.add('active');
    OS.haptic(12);
    wrap.classList.add('show');
    mv.set(0);
    mv.spring(1, { preset: { response: .42, damping: .76 } });
    return { close };
  }

  /* ---------------- Wheel picker ---------------- */

  function wheel(values, index, onChange, opts) {
    opts = opts || {};
    const el = OS.el(`<div class="wheel" tabindex="0">${values.map((v) => `<div>${OS.esc(v)}</div>`).join('')}</div>`);
    const ITEM = 34;
    let current = index || 0;
    let t = null;
    el.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const i = OS.clamp(Math.round(el.scrollTop / ITEM), 0, values.length - 1);
        if (i !== current) {
          current = i;
          OS.sound('click');
          if (onChange) onChange(i);
        }
      }, 80);
    }, { passive: true });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // mouse users: drag to scroll
    let drag = null;
    el.addEventListener('mousedown', (e) => { drag = { y: e.clientY, top: el.scrollTop }; el.style.scrollSnapType = 'none'; });
    window.addEventListener('mousemove', (e) => { if (drag) el.scrollTop = drag.top - (e.clientY - drag.y) / OS.state.scale; });
    window.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = null;
      el.style.scrollSnapType = '';
      el.scrollTo({ top: Math.round(el.scrollTop / ITEM) * ITEM, behavior: 'smooth' });
    });
    requestAnimationFrame(() => { el.scrollTop = current * ITEM; });
    el.get = () => current;
    el.set = (i) => { current = i; el.scrollTop = i * ITEM; };
    if (opts.unit) {
      const box = document.createDocumentFragment();
      box.appendChild(el);
      box.appendChild(OS.el(`<span class="wheel-unit">${OS.esc(opts.unit)}</span>`));
      el.fragment = box;
    }
    return el;
  }

  function gbtn(icon, label, onTap, cls) {
    const el = OS.el(`<button class="gbtn glass ${cls || ''}" aria-label="${OS.esc(label || icon)}">${icon ? sym(icon, { stroke: 2.2 }) : ''}${label && !icon ? OS.esc(label) : ''}</button>`);
    if (onTap) el.addEventListener('click', onTap);
    return el;
  }

  OS.UI = { Nav, toggle, segmented, slider, tabBar, row, section, sheet, alert, menu, wheel, gbtn };
})();
