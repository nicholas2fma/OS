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

    push(page, animated) {
      animated = animated !== false && this.stack.length > 0;
      const prev = this.current;
      const el = this.build(page);
      this.stack.push(page);
      this.root.appendChild(el);
      if (animated) {
        el.classList.add('offright', 'shadow');
        void el.offsetWidth;
        el.classList.add('anim');
        el.classList.remove('offright');
        if (prev) { prev.el.classList.add('anim', 'under'); }
        setTimeout(() => {
          el.classList.remove('anim', 'shadow');
          if (prev) prev.el.style.visibility = 'hidden';
        }, 460);
      } else if (prev) {
        prev.el.classList.add('under');
        prev.el.style.visibility = 'hidden';
      }
      if (page.onShow) page.onShow(page);
      return page;
    }

    pop(animated) {
      if (this.stack.length < 2) return;
      const page = this.stack.pop();
      const prev = this.current;
      prev.el.style.visibility = '';
      if (animated === false) {
        page.el.remove();
        prev.el.classList.remove('under', 'anim');
      } else {
        page.el.classList.add('anim', 'shadow');
        prev.el.classList.add('anim');
        requestAnimationFrame(() => {
          page.el.style.transform = '';
          page.el.classList.add('offright');
          prev.el.style.transform = '';
          prev.el.classList.remove('under');
        });
        setTimeout(() => { page.el.remove(); prev.el.classList.remove('anim'); }, 460);
      }
      if (page.onHide) page.onHide(page);
      if (prev.onShow) prev.onShow(prev);
    }

    popToRoot() {
      while (this.stack.length > 1) this.pop(false);
    }

    installEdgeSwipe() {
      let start = null;
      this.root.addEventListener('pointerdown', (e) => {
        if (this.stack.length < 2) return;
        const p = OS.point(e);
        const r = OS.rectOf(this.root);
        if (p.x - r.x > 22) return;
        start = { x: p.x, y: p.y, id: e.pointerId, moved: false };
      });
      const onMove = (e) => {
        if (!this.root.isConnected) { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); return; }
        if (!start || e.pointerId !== start.id) return;
        const p = OS.point(e);
        const dx = Math.max(0, p.x - start.x);
        if (!start.moved && dx > 8) start.moved = true;
        if (!start.moved) return;
        const page = this.current, prev = this.stack[this.stack.length - 2];
        prev.el.style.visibility = '';
        page.el.style.transform = `translateX(${dx}px)`;
        prev.el.style.transform = `translateX(${-28 + (dx / OS.state.width) * 28}%)`;
      };
      const onUp = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const p = OS.point(e);
        const dx = p.x - start.x;
        const moved = start.moved;
        start = null;
        if (!moved) return;
        if (dx > 90) {
          this.pop();
        } else {
          const page = this.current, prev = this.stack[this.stack.length - 2];
          page.el.classList.add('anim'); prev.el.classList.add('anim');
          page.el.style.transform = ''; prev.el.style.transform = '';
          setTimeout(() => { page.el.classList.remove('anim'); prev.el.classList.remove('anim'); prev.el.style.visibility = 'hidden'; }, 460);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  }

  /* ---------------- Controls ---------------- */

  function toggle(on, onChange) {
    const el = OS.el(`<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}"><span class="knob"></span></button>`);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = !el.classList.contains('on');
      el.classList.toggle('on', v);
      el.setAttribute('aria-checked', v);
      OS.haptic(6);
      if (onChange) onChange(v);
    });
    el.set = (v) => { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', !!v); };
    return el;
  }

  function segmented(options, value, onChange) {
    const el = OS.el(`<div class="segmented"><div class="seg-thumb"></div>${options.map((o) =>
      `<button data-v="${OS.esc(o.value)}" class="${o.value === value ? 'on' : ''}">${OS.esc(o.label)}</button>`).join('')}</div>`);
    const thumb = el.querySelector('.seg-thumb');
    const place = () => {
      const b = el.querySelector('button.on');
      if (!b) return;
      thumb.style.left = b.offsetLeft + 'px';
      thumb.style.width = b.offsetWidth + 'px';
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      place();
      OS.haptic(5);
      if (onChange) onChange(b.dataset.v);
    });
    requestAnimationFrame(() => requestAnimationFrame(place));
    new ResizeObserver(place).observe(el);
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
    const ind = el.querySelector('.tab-indicator');
    const place = () => {
      const b = el.querySelector('.tab.on');
      if (!b) return;
      ind.style.left = b.offsetLeft + 'px';
      ind.style.width = b.offsetWidth + 'px';
    };
    el.querySelector('.tabbar-pill').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
      place();
      OS.haptic(5);
      if (onChange) onChange(b.dataset.id);
    });
    if (opts.search) el.querySelector('.tabbar-search').addEventListener('click', opts.search);
    requestAnimationFrame(() => requestAnimationFrame(place));
    new ResizeObserver(place).observe(el);
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
    const body = wrap.querySelector('.sheet-body');
    let closed = false;
    const api = {
      el: wrap, body,
      close(result) {
        if (closed) return;
        closed = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        wrap.classList.remove('show');
        setTimeout(() => wrap.remove(), 500);
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
    wrap.querySelector('.sheet-dim').addEventListener('click', () => api.close());

    // drag down to dismiss
    let drag = null;
    sh.querySelector('.sheet-grabber').parentElement.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sheet-body') || e.target.closest('button')) return;
      drag = { y: OS.point(e).y, id: e.pointerId };
      sh.style.transition = 'none';
    });
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = Math.max(0, OS.point(e).y - drag.y);
      sh.style.transform = `translateY(${dy}px)`;
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = OS.point(e).y - drag.y;
      drag = null;
      sh.style.transition = '';
      sh.style.transform = '';
      if (dy > 120) api.close();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    if (o.render) o.render(body, api);
    container.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('show')));
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
    if (opts.preview !== false) {
      const prev = anchorEl.cloneNode(true);
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
    m.style.left = left + 'px';
    if (below) { m.style.top = (r.y + r.height + 14) + 'px'; m.style.transformOrigin = 'top center'; }
    else { m.style.top = Math.max(60, r.y - 14 - menuH) + 'px'; m.style.transformOrigin = 'bottom center'; }
    const close = () => {
      wrap.classList.remove('show');
      setTimeout(() => { wrap.remove(); if (!overlay.children.length) overlay.classList.remove('active'); }, 260);
      if (opts.onClose) opts.onClose();
    };
    wrap.querySelector('.menu-dim').addEventListener('click', close);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const it = items[+b.dataset.i];
      close();
      if (it && it.onTap) setTimeout(() => it.onTap(), 120);
    });
    overlay.appendChild(wrap);
    overlay.classList.add('active');
    OS.haptic(12);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('show')));
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
