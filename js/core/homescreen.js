/* ==========================================================================
   Home screen: pages, widgets, dock, search pill, App Library,
   jiggle (edit) mode with drag & drop, context menus
   ========================================================================== */
(function () {
  'use strict';

  const DEFAULT_LAYOUT = {
    pages: [
      [{ w: 'weather', size: '2x2' }, { w: 'calendar', size: '2x2' },
        'photos', 'camera', 'calendar', 'clock',
        'weather', 'maps', 'notes', 'reminders',
        'calculator', 'compass', 'siri', 'settings'],
      [{ w: 'music', size: '4x2' }, { w: 'clock', size: '2x2' }, { w: 'battery', size: '2x2' }],
      [{ w: 'photos', size: '4x6' }],
    ],
    dock: ['phone', 'safari', 'messages', 'music'],
  };

  const LIBRARY = [
    { name: 'Suggerimenti', apps: null },
    { name: 'Aggiunte di recente', apps: 'recent' },
    { name: 'Utility', apps: ['siri', 'calculator', 'compass', 'clock', 'settings'] },
    { name: 'Produttività e finanza', apps: ['notes', 'reminders', 'calendar'] },
    { name: 'Creatività', apps: ['photos', 'camera'] },
    { name: 'Social', apps: ['messages', 'phone'] },
    { name: 'Intrattenimento', apps: ['music'] },
    { name: 'Viaggi', apps: ['maps', 'weather', 'safari'] },
  ];

  let home, pagesEl, dockEl, dotsEl, searchBtn;
  let layout;
  let page = 0;
  let jiggle = false;
  const badges = OS.store.get('badges', {});
  let pagingTimer = null;

  /* ---------- layout persistence ---------- */

  function loadLayout() {
    const saved = OS.store.get('home', null);
    layout = saved && Array.isArray(saved.pages) ? saved : JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    // make sure every registered (non hidden) app appears somewhere
    const present = new Set(layout.dock.slice());
    layout.pages.forEach((p) => p.forEach((it) => { if (typeof it === 'string') present.add(it); }));
    const hidden = new Set(OS.settings.hiddenApps || []);
    OS.appOrder.forEach((id) => {
      if (!present.has(id) && !hidden.has(id)) {
        if (!layout.pages.length) layout.pages.push([]);
        layout.pages[layout.pages.length - 1].push(id);
      }
    });
    // drop unknown apps
    layout.pages = layout.pages.map((p) => p.filter((it) => typeof it !== 'string' || OS.apps[it]));
    layout.dock = layout.dock.filter((id) => OS.apps[id]);
    if (!layout.pages.length) layout.pages.push([]);
    fitPages();
    // layouts saved by the iOS 26 version: show off the new extra-large widget once
    if (saved && !OS.store.get('home:ios27', false)) layout.pages.push([{ w: 'photos', size: '4x6' }]);
    OS.store.set('home:ios27', true);
    if (saved) saveLayout(); // keep migrations (new apps, the iOS 27 widget page) across reloads
  }

  function saveLayout() { OS.store.set('home', layout); }

  const CELLS = { '2x2': 4, '4x2': 8, '4x6': 24 };
  const cost = (it) => (typeof it === 'string' ? 1 : CELLS[it.size] || 4);
  /** a page holds 4×6 cells: overflowing items move to the following page */
  function fitPages() {
    for (let i = 0; i < layout.pages.length; i++) {
      const pg = layout.pages[i];
      while (pg.length > 1 && pg.reduce((s, it) => s + cost(it), 0) > 24) {
        if (!layout.pages[i + 1]) layout.pages.push([]);
        layout.pages[i + 1].unshift(pg.pop());
      }
    }
  }

  /* ---------- rendering ---------- */

  function itemHTML(it, i) {
    if (typeof it === 'string') {
      const app = OS.apps[it];
      if (!app) return '';
      const b = badges[it];
      return `<div class="home-item" data-app="${it}" data-idx="${i}">
        <button class="remove-btn" aria-label="Rimuovi">${OS.sym('minus', { size: 12, stroke: 3.4 })}</button>
        ${OS.icon(it)}
        ${b ? `<span class="badge">${b > 99 ? '99+' : b}</span>` : ''}
        <span class="home-label">${OS.esc(app.name)}</span>
      </div>`;
    }
    const k = OS.Widgets.KINDS[it.w];
    if (!k) return '';
    return `<div class="home-item widget w${it.size}" data-widget="${it.w}" data-size="${it.size}" data-idx="${i}">
      <button class="remove-btn" aria-label="Rimuovi">${OS.sym('minus', { size: 12, stroke: 3.4 })}</button>
      ${k.sizes.length > 1 ? `<button class="resize-handle" aria-label="Ridimensiona">${OS.sym('arrow-up-arrow-down', { size: 13, stroke: 2.6, style: 'transform:rotate(-45deg)' })}</button>` : ''}
      ${OS.Widgets.boxHTML(it.w, it.size)}
      <span class="home-label">${OS.esc(k.name)}</span>
    </div>`;
  }

  function libraryHTML() {
    const shown = new Set(OS.appOrder);
    const recent = Array.from(OS.Apps.running.values()).sort((a, b) => b.lastUsed - a.lastUsed).map((r) => r.id);
    const sugg = recent.concat(['photos', 'messages', 'safari', 'music']).filter((v, i, a) => a.indexOf(v) === i);
    const box = (apps) => {
      apps = apps.filter((id) => shown.has(id));
      const big = apps.slice(0, 3).map((id) => `<div class="lib-app" data-app="${id}">${OS.icon(id)}</div>`).join('');
      const rest = apps.slice(3, 7);
      const mini = rest.length ? `<div class="lib-mini">${rest.map((id) => OS.icon(id)).join('')}</div>` : '';
      return big + mini;
    };
    return `<div class="library">
      <div class="library-search glass">${OS.sym('search', { size: 18 })}<span>Libreria app</span></div>
      <div class="library-grid">${LIBRARY.map((c) => {
        const apps = c.apps === null ? sugg.slice(0, 4) : c.apps === 'recent' ? ['calculator', 'compass', 'maps', 'reminders'] : c.apps;
        return `<div class="lib-folder"><div class="lib-box glass">${box(apps)}</div><span class="home-label">${OS.esc(c.name)}</span></div>`;
      }).join('')}</div>
    </div>`;
  }

  function render() {
    const nPages = layout.pages.length;
    pagesEl.innerHTML = layout.pages.map((items, p) =>
      `<div class="home-page" data-page="${p}"><div class="home-grid">${items.map(itemHTML).join('')}</div></div>`).join('')
      + `<div class="home-page lib-page" data-page="${nPages}">${libraryHTML()}</div>`;
    dockEl.innerHTML = layout.dock.map(itemHTML).join('');
    dotsEl.innerHTML = layout.pages.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('') + `<i class="lib ${page === nPages ? 'on' : ''}"></i>`;
    page = Math.min(page, nPages);
    applyPage(false);
    if (jiggle) seedJiggle();
  }

  /* ---------- paging: follows the finger, rubber-bands at the ends, settles on a spring ---------- */

  const pageX = OS.motion.value(0, paintPages);
  let litDot = -1;
  let lastLib = 0;

  function paintPages(x) {
    const W = OS.state.width;
    pagesEl.style.transform = `translate3d(${x}px, 0, 0)`;
    // the dock and the search pill step aside for the App Library
    const lib = OS.motion.clamp01((-x - (layout.pages.length - 1) * W) / W);
    if (lib || lastLib) {
      lastLib = lib;
      dockEl.style.opacity = lib ? String(1 - lib) : '';
      dockEl.style.transform = lib ? `translate3d(0, ${lib * 40}px, 0) scale(${1 - lib * .06})` : '';
      dockEl.style.pointerEvents = lib > .5 ? 'none' : '';
    }
    const nearest = OS.clamp(Math.round(-x / W), 0, layout.pages.length);
    if (nearest !== litDot) {
      litDot = nearest;
      dotsEl.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === nearest));
    }
  }

  function applyPage(animate, velocity) {
    const target = -page * OS.state.width;
    litDot = -1;
    if (animate) pageX.spring(target, { preset: { response: .42, damping: 1 }, velocity: velocity || 0 });
    else pageX.set(target);
  }

  function goToPage(p, animate, velocity) {
    const max = layout.pages.length;
    page = OS.clamp(p, 0, max);
    applyPage(animate !== false, velocity);
    flashDots();
  }

  function flashDots() {
    home.classList.add('paging');
    clearTimeout(pagingTimer);
    pagingTimer = setTimeout(() => home.classList.remove('paging'), 1100);
  }

  /* ---------- public helpers used by the app manager ---------- */

  function iconFor(id) {
    if (OS.state.locked) return null;
    const onPage = pagesEl.querySelector(`.home-page[data-page="${page}"] .home-grid > .home-item[data-app="${id}"] .app-icon`);
    return onPage || dockEl.querySelector(`.home-item[data-app="${id}"] .app-icon`);
  }

  function restRect(el) {
    const prevTransition = home.style.transition;
    const prevTransform = home.style.transform;
    home.style.transition = 'none';
    home.style.transform = 'none';
    const r = OS.rectOf(el);
    home.style.transform = prevTransform;
    void home.offsetWidth;
    home.style.transition = prevTransition;
    return r;
  }

  /* ---------- zoom: the Home Screen recedes toward the icon of the app that opens ---------- */

  let zoomVal = 1;
  let zoomAnim = null;
  let zoomOrigin = null;

  function paintZoom() {
    home.style.transition = 'opacity .35s ease, filter .35s ease';
    home.style.transformOrigin = zoomOrigin ? `${zoomOrigin.x}px ${zoomOrigin.y}px` : '50% 50%';
    home.style.transform = Math.abs(zoomVal - 1) < .0005 ? '' : `scale(${zoomVal})`;
  }

  /** an app launching mid-unlock takes over the zoom */
  function settleReveal() {
    if (!revealV.animating) return;
    revealV.stop();
    pagesEl.style.opacity = '';
    searchBtn.style.opacity = '';
    if (!lastLib) dockEl.style.opacity = '';
    pagesEl.style.filter = '';
  }

  function zoom(scale, origin) {
    settleReveal();
    if (zoomAnim) { zoomAnim.stop(); zoomAnim = null; }
    zoomVal = scale;
    if (origin) zoomOrigin = origin;
    paintZoom();
  }

  function springZoom(target, velocity, preset) {
    settleReveal();
    if (zoomAnim) zoomAnim.stop();
    zoomAnim = OS.motion.animate({
      from: zoomVal, to: target, velocity: velocity || 0, preset: preset || 'smooth',
      onUpdate(v) { zoomVal = v; paintZoom(); },
      onComplete() { zoomAnim = null; },
    });
    return zoomAnim;
  }

  function setBehind(b) { springZoom(b ? 1.16 : 1); }
  function setProgress(p) { if (p == null) springZoom(1); else zoom(1 + .16 * OS.clamp(p, 0, 1)); }

  /* ---------- unlock: icons fly in from slightly larger, fading in and coming into focus ---------- */

  const revealV = OS.motion.value(1, paintReveal);

  function paintReveal(u) {
    if (zoomAnim) { zoomAnim.stop(); zoomAnim = null; }
    zoomOrigin = null;
    zoomVal = 1 + .2 * (1 - u);
    paintZoom();
    const done = u >= 1 && !revealV.animating;
    const o = done ? '' : String(OS.motion.segment(u, 0, .55));
    pagesEl.style.opacity = o;
    searchBtn.style.opacity = o;
    if (!lastLib) dockEl.style.opacity = o;
    pagesEl.style.filter = u >= .8 || done ? '' : `blur(${(1 - u / .8) * 12}px)`;
  }

  /** u = 0 hidden behind the Lock Screen … 1 in place */
  function reveal(u) { revealV.set(u); }
  function springReveal(to, velocity) {
    return revealV.spring(to, { preset: { response: .5, damping: .86 }, velocity: velocity || 0, onComplete: () => paintReveal(revealV.value) });
  }
  function zoomIn() { revealV.set(0); springReveal(1); }

  function setBadge(id, n) {
    if (n) badges[id] = n; else delete badges[id];
    OS.store.set('badges', badges);
    document.querySelectorAll(`#home .home-item[data-app="${id}"]`).forEach((item) => {
      let b = item.querySelector('.badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = OS.el('<span class="badge"></span>'); item.appendChild(b); }
      b.textContent = n > 99 ? '99+' : n;
    });
  }

  /* ---------- jiggle mode ---------- */

  /** random phase and period per icon so they never wobble in sync */
  function seedJiggle() {
    home.querySelectorAll('.home-item').forEach((el) => {
      if (el.style.getPropertyValue('--jd')) return;
      el.style.setProperty('--jd', (-Math.random() * .3).toFixed(3) + 's');
      el.style.setProperty('--jdur', (.24 + Math.random() * .07).toFixed(3) + 's');
    });
  }

  function enterJiggle() {
    if (jiggle) return;
    jiggle = true;
    seedJiggle();
    home.classList.add('jiggle');
    OS.haptic(15);
  }

  function exitJiggle() {
    if (!jiggle) return;
    jiggle = false;
    home.classList.remove('jiggle');
    syncFromDOM();
  }

  function syncFromDOM() {
    const pages = [];
    pagesEl.querySelectorAll('.home-page:not(.lib-page) .home-grid').forEach((g) => {
      const items = [];
      g.querySelectorAll(':scope > .home-item').forEach((el) => {
        if (el.dataset.app) items.push(el.dataset.app);
        else if (el.dataset.widget) items.push({ w: el.dataset.widget, size: el.dataset.size });
      });
      pages.push(items);
    });
    // drop empty trailing pages (keep at least one)
    while (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
    layout.pages = pages;
    fitPages();
    layout.dock = Array.from(dockEl.querySelectorAll(':scope > .home-item')).map((el) => el.dataset.app).filter(Boolean);
    saveLayout();
    render();
  }

  function removeItem(item) {
    const isApp = !!item.dataset.app;
    const name = isApp ? OS.apps[item.dataset.app].name : OS.Widgets.KINDS[item.dataset.widget].name;
    OS.UI.alert({
      title: isApp ? `Rimuovere "${name}"?` : `Rimuovere il widget "${name}"?`,
      message: isApp ? "L'app resterà disponibile nella Libreria app." : 'Potrai aggiungerlo di nuovo con il pulsante +.',
      buttons: [
        { label: 'Annulla' },
        {
          label: 'Rimuovi', style: 'destructive', onTap: () => {
            if (isApp) {
              const h = new Set(OS.settings.hiddenApps || []);
              h.add(item.dataset.app);
              OS.set('hiddenApps', Array.from(h));
            }
            item.style.transition = 'transform .25s, opacity .25s';
            item.style.transform = 'scale(.2)';
            item.style.opacity = '0';
            setTimeout(() => { item.remove(); syncFromDOM(); if (jiggle) home.classList.add('jiggle'); }, 260);
          },
        },
      ],
    });
  }

  function restoreApp(id) {
    const h = (OS.settings.hiddenApps || []).filter((x) => x !== id);
    OS.set('hiddenApps', h);
    loadLayout();
    saveLayout();
    render();
  }

  function addWidgetSheet() {
    const overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    OS.UI.sheet(overlay, {
      title: 'Aggiungi widget',
      large: true,
      left: { icon: 'xmark', label: 'Chiudi' },
      render(body, api) {
        const W = OS.Widgets;
        Object.keys(W.KINDS).forEach((kind) => {
          const k = W.KINDS[kind];
          let size = k.sizes[k.sizes.length - 1];
          const sec = OS.el(`<div class="wpick surface-dark">
            <div class="wpick-head">${OS.icon(k.app, 'xs')}<b>${OS.esc(k.name)}</b></div>
            <div class="wpick-sizes">${k.sizes.map((s) => `<button data-s="${s}">${W.SIZE_NAMES[s]}</button>`).join('')}</div>
            <div class="wpick-prev"></div>
            <button class="btn filled wpick-add">Aggiungi widget</button></div>`);
          const prev = sec.querySelector('.wpick-prev');
          const paint = () => {
            sec.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === size));
            prev.className = 'wpick-prev p' + size;
            prev.innerHTML = W.boxHTML(kind, size);
          };
          sec.addEventListener('click', (e) => {
            const b = e.target.closest('[data-s]');
            if (b) { size = b.dataset.s; paint(); return; }
            if (!e.target.closest('.wpick-add')) return;
            let target = Math.min(page, layout.pages.length - 1);
            if (size === '4x6') { layout.pages.splice(target + 1, 0, [{ w: kind, size }]); target++; }
            else layout.pages[target].unshift({ w: kind, size });
            fitPages();
            saveLayout();
            render();
            goToPage(target, false);
            if (jiggle) home.classList.add('jiggle');
            api.close();
          });
          paint();
          body.appendChild(sec);
        });
      },
      onClose() { setTimeout(() => { if (!overlay.children.length) overlay.classList.remove('active'); }, 520); },
    });
  }

  /** iOS 27: drag the corner handle (or tap it) to change a widget's size */
  function resizeWidget(item, dir) {
    const k = OS.Widgets.KINDS[item.dataset.widget];
    const i = k.sizes.indexOf(item.dataset.size);
    const next = dir === 0 ? k.sizes[(i + 1) % k.sizes.length] : k.sizes[OS.clamp(i + dir, 0, k.sizes.length - 1)];
    if (!next || next === item.dataset.size) return;
    item.dataset.size = next;
    syncFromDOM();
    home.classList.add('jiggle');
    OS.haptic(12);
    const pageWith = layout.pages.findIndex((pg) => pg.some((it) => typeof it !== 'string' && it.w === item.dataset.widget && it.size === next));
    if (pageWith >= 0 && pageWith !== page) goToPage(pageWith);
  }

  function customizeSheet() {
    const overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    OS.UI.sheet(overlay, {
      title: 'Personalizza',
      left: { icon: 'xmark', label: 'Chiudi' },
      render(body) {
        const opts = [['default', 'Predefinito'], ['dark', 'Scuro'], ['clear', 'Trasparente'], ['tinted', 'Colorato']];
        const seg = OS.UI.segmented(opts.map(([value, label]) => ({ value, label })), OS.settings.iconStyle, (v) => OS.set('iconStyle', v));
        seg.style.margin = '6px 20px 18px';
        body.appendChild(seg);
        const prev = OS.el(`<div style="display:flex;justify-content:center;gap:18px;padding:6px 0 18px" class="icon-preview">${['phone', 'safari', 'messages', 'music'].map((id) => OS.icon(id)).join('')}</div>`);
        body.appendChild(prev);
        const hue = OS.UI.slider(OS.settings.tintHue, (v) => { OS.set('tintHue', Math.round(v)); OS.Wallpapers.apply(); }, { min: 0, max: 360, step: 1 });
        hue.style.margin = '0 24px';
        hue.style.setProperty('--accent', 'transparent');
        hue.style.background = 'linear-gradient(90deg,hsl(0 80% 60%),hsl(60 80% 60%),hsl(120 80% 50%),hsl(180 80% 50%),hsl(240 80% 60%),hsl(300 80% 60%),hsl(360 80% 60%))';
        hue.style.borderRadius = '14px';
        const hueWrap = OS.el('<div><div class="section-head" style="padding:0 24px 8px">Tinta (stile Colorato)</div></div>');
        hueWrap.appendChild(hue);
        body.appendChild(hueWrap);
      },
      onClose() { setTimeout(() => { if (!overlay.children.length) overlay.classList.remove('active'); }, 520); },
    });
  }

  /* ---------- context menu ---------- */

  function showMenu(item) {
    const icon = item.querySelector('.app-icon, .widget-box');
    if (item.dataset.app) {
      const app = OS.apps[item.dataset.app];
      const qa = (app.quickActions || []).map((q) => ({ label: q.label, icon: q.icon, onTap: () => OS.Apps.open(app.id, { data: q.data }) }));
      OS.UI.menu(icon, qa.concat(qa.length ? ['-'] : [], [
        { label: 'Modifica schermata Home', icon: 'square-grid', onTap: enterJiggle },
        { label: 'Rimuovi app', icon: 'minus-circle-fill', destructive: true, onTap: () => removeItem(item) },
      ]));
    } else {
      OS.UI.menu(icon, [
        { label: 'Modifica schermata Home', icon: 'square-grid', onTap: enterJiggle },
        { label: 'Rimuovi widget', icon: 'minus-circle-fill', destructive: true, onTap: () => removeItem(item) },
      ]);
    }
  }

  /* ---------- gestures ---------- */

  function installGestures() {
    let g = null;
    let lpTimer = null;

    home.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      if (OS.Apps.mode !== 'home' || OS.state.locked) return;
      const p = OS.point(e);
      const item = e.target.closest('.home-item, .lib-app');
      g = {
        id: e.pointerId, x: p.x, y: p.y, t: performance.now(), item, target: e.target,
        axis: null, page0: page, long: false, dragging: false, tr: OS.motion.tracker(),
        resize: jiggle && e.target.closest('.resize-handle') ? item : null,
        // a finger landing on moving pages catches them (and does not tap)
        caught: pageX.animating, x0: pageX.value,
      };
      g.tr.add(p.x, p.y);
      if (g.caught) pageX.stop();
      clearTimeout(lpTimer);
      if (!jiggle) {
        lpTimer = setTimeout(() => {
          if (!g || g.axis) return;
          g.long = true;
          if (item && item.classList.contains('home-item')) showMenu(item);
          else if (!item && !e.target.closest('.dock, .home-search, .library')) enterJiggle();
        }, 480);
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = OS.point(e);
      g.tr.add(p.x, p.y);
      const dx = p.x - g.x, dy = p.y - g.y;
      if (g.dragging) { dragMove(p); return; }
      if (g.resize) {
        const box = g.resize.querySelector('.widget-box');
        box.style.transform = `scale(${OS.clamp(1 + (dx + dy) / 600, .85, 1.15)})`;
        box.style.transformOrigin = 'top left';
        return;
      }
      if (!g.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        clearTimeout(lpTimer);
        if (g.long) { g = null; return; }
        if (jiggle && g.item && g.item.classList.contains('home-item') && !e.target.closest('.remove-btn')) {
          g.dragging = true;
          dragBegin(g.item, p);
          return;
        }
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : (dy > 0 ? 'down' : 'up');
        if (g.axis === 'down' && (jiggle || page === layout.pages.length)) g.axis = 'none';
        if (g.axis === 'down') OS.Spotlight.beginPull();
      }
      if (g.axis === 'x') {
        const W = OS.state.width;
        const minOff = -layout.pages.length * W;
        let off = g.x0 + dx;
        if (off > 0) off = OS.motion.rubber(off, W);
        if (off < minOff) off = minOff + OS.motion.rubber(off - minOff, W);
        pageX.set(off);
        home.classList.add('paging');
        clearTimeout(pagingTimer);
      } else if (g.axis === 'down') {
        OS.Spotlight.pull(dy);
      }
    });

    const end = (e) => {
      clearTimeout(lpTimer);
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      const p = OS.point(e);
      const dx = p.x - s.x, dy = p.y - s.y;
      s.tr.add(p.x, p.y);
      const vel = s.tr.velocity();
      if (s.dragging) { dragEnd(); return; }
      if (s.resize) {
        s.resize.querySelector('.widget-box').style.transform = '';
        const d = dx + dy;
        resizeWidget(s.resize, Math.abs(d) < 12 ? 0 : d > 0 ? 1 : -1);
        return;
      }
      if (s.axis === 'x') {
        // like a paging scroll view: a flick goes one page its way, a slow drag picks the nearest
        const W = OS.state.width;
        const x = pageX.value;
        const from = Math.round(-s.x0 / W);
        let target;
        if (Math.abs(vel.x) > 300) target = from + (vel.x < 0 ? 1 : -1);
        else target = Math.round(-(x + OS.motion.project(vel.x, .99)) / W);
        target = OS.clamp(target, from - 1, from + 1);
        goToPage(target, true, vel.x);
        return;
      }
      if (s.axis === 'down') { OS.Spotlight.endPull(dy, vel.y); return; }
      if (s.caught && !s.axis) { goToPage(Math.round(-pageX.value / OS.state.width)); return; }
      if (s.axis || s.long || e.type === 'pointercancel') return;
      tap(s);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // mouse wheel / trackpad paging on desktop
    let wheelLock = 0;
    home.addEventListener('wheel', (e) => {
      if (OS.Apps.mode !== 'home' || OS.state.locked) return;
      const now = Date.now();
      if (now < wheelLock) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (Math.abs(d) > 25) { goToPage(page + (d > 0 ? 1 : -1)); wheelLock = now + 450; }
      else if (e.deltaY < -40 && !jiggle) { OS.Spotlight.open(); wheelLock = now + 600; }
    }, { passive: true });
  }

  function tap(s) {
    const t = s.target;
    if (jiggle) {
      const rm = t.closest('.remove-btn');
      if (rm) { removeItem(rm.closest('.home-item')); return; }
      if (t.closest('.pill-btn')) return;
      if (!s.item) exitJiggle();
      return;
    }
    if (t.closest('.home-search')) { OS.Spotlight.open(); return; }
    if (t.closest('.library-search')) { OS.Spotlight.open(); return; }
    if (!s.item) return;
    if (s.item.dataset.widget) {
      if (OS.Widgets.handleTap(t)) return;
      const k = OS.Widgets.KINDS[s.item.dataset.widget];
      if (k && k.app && OS.apps[k.app]) OS.Apps.open(k.app, { from: s.item.querySelector('.widget-box') });
      return;
    }
    const id = s.item.dataset.app;
    if (!id) return;
    if (s.item.classList.contains('lib-app') && (OS.settings.hiddenApps || []).includes(id)) restoreApp(id);
    OS.Apps.open(id, { from: s.item.querySelector('.app-icon') });
  }

  /* ---------- drag & drop in jiggle mode ---------- */

  let drag = null;
  function dragBegin(item, p) {
    const r = OS.rectOf(item);
    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.left = r.x + 'px';
    ghost.style.top = r.y + 'px';
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    ghost.style.animation = 'none';
    ghost.style.display = 'flex';
    home.appendChild(ghost);
    item.classList.add('dragging');
    drag = { item, ghost, ox: p.x - r.x, oy: p.y - r.y, edgeT: null, lastSwap: 0 };
    OS.haptic(10);
  }

  function dragMove(p) {
    if (!drag) return;
    drag.ghost.style.left = (p.x - drag.ox) + 'px';
    drag.ghost.style.top = (p.y - drag.oy) + 'px';

    // paging when dragging to the edge
    const W = OS.state.width;
    if (p.x < 18 || p.x > W - 18) {
      if (!drag.edgeT) {
        drag.edgeT = setTimeout(() => {
          drag && (drag.edgeT = null);
          if (!drag) return;
          const dir = p.x < 18 ? -1 : 1;
          const target = OS.clamp(page + dir, 0, layout.pages.length);
          if (target === layout.pages.length) {
            // create a new page on the fly
            const newPage = OS.el(`<div class="home-page" data-page="${layout.pages.length}"><div class="home-grid"></div></div>`);
            pagesEl.insertBefore(newPage, pagesEl.querySelector('.lib-page'));
            layout.pages.push([]);
          }
          page = target;
          applyPage(true);
          const grid = pagesEl.querySelector(`.home-page[data-page="${page}"] .home-grid`);
          if (grid && drag.item.dataset.app) grid.appendChild(drag.item);
          else if (grid && drag.item.dataset.widget) grid.appendChild(drag.item);
        }, 650);
      }
    } else if (drag.edgeT) { clearTimeout(drag.edgeT); drag.edgeT = null; }

    const now = performance.now();
    if (now - drag.lastSwap < 160) return;
    drag.ghost.style.display = 'none';
    const sr = OS.screenEl.getBoundingClientRect();
    const under = document.elementFromPoint(sr.left + p.x * OS.state.scale, sr.top + p.y * OS.state.scale);
    drag.ghost.style.display = 'flex';
    if (!under) return;
    const other = under.closest('.home-item');
    const inDock = under.closest('.dock');
    if (inDock && drag.item.dataset.app) {
      if (other && other !== drag.item && other.parentElement === dockEl) {
        swapInto(other);
      } else if (drag.item.parentElement !== dockEl && dockEl.querySelectorAll(':scope > .home-item').length < 4) {
        dockEl.appendChild(drag.item);
        drag.lastSwap = now;
      }
      return;
    }
    if (other && other !== drag.item && !other.classList.contains('drag-ghost')) {
      swapInto(other);
    } else if (!other && under.closest('.home-grid') && drag.item.parentElement === dockEl) {
      under.closest('.home-grid').appendChild(drag.item);
      drag.lastSwap = now;
    }
  }

  function swapInto(other) {
    const parent = other.parentElement;
    const items = Array.from(parent.children);
    const from = items.indexOf(drag.item);
    const to = items.indexOf(other);
    if (from >= 0 && from < to) parent.insertBefore(drag.item, other.nextSibling);
    else parent.insertBefore(drag.item, other);
    drag.lastSwap = performance.now();
  }

  function dragEnd() {
    if (!drag) return;
    clearTimeout(drag.edgeT);
    const { item, ghost } = drag;
    drag = null;
    const r = OS.rectOf(item);
    ghost.style.transition = 'left .25s var(--ease-spring), top .25s var(--ease-spring), transform .25s';
    ghost.style.left = r.x + 'px';
    ghost.style.top = r.y + 'px';
    ghost.style.transform = 'scale(1)';
    setTimeout(() => {
      ghost.remove();
      item.classList.remove('dragging');
      syncFromDOM();
      if (jiggle) home.classList.add('jiggle');
    }, 260);
  }

  /* ---------- init ---------- */

  function init() {
    home = document.getElementById('home');
    home.innerHTML = `
      <div class="home-pages"></div>
      <div class="home-edit-bar">
        <button class="pill-btn glass" data-edit="customize">Modifica</button>
        <div style="display:flex;gap:8px"><button class="pill-btn glass" data-edit="add" aria-label="Aggiungi widget">${OS.sym('plus', { size: 18, stroke: 2.6 })}</button>
        <button class="pill-btn glass" data-edit="done">Fine</button></div>
      </div>
      <button class="home-search glass">${OS.sym('search', { size: 14, stroke: 2.6 })}<span>Cerca</span></button>
      <div class="page-dots glass"></div>
      <div class="dock glass"></div>`;
    pagesEl = home.querySelector('.home-pages');
    dockEl = home.querySelector('.dock');
    dotsEl = home.querySelector('.page-dots');
    searchBtn = home.querySelector('.home-search');

    home.querySelector('.home-edit-bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit]');
      if (!b) return;
      if (b.dataset.edit === 'done') exitJiggle();
      if (b.dataset.edit === 'add') addWidgetSheet();
      if (b.dataset.edit === 'customize') customizeSheet();
    });
    home.querySelector('.home-edit-bar').addEventListener('pointerdown', (e) => e.stopPropagation());

    loadLayout();
    render();
    installGestures();

    OS.Glass.attach(dockEl, { bezel: 26, strength: 44 });
    OS.Glass.attach(searchBtn, { bezel: 12, strength: 18 });

    OS.on('setting:iconStyle', applyIconStyle);
    const wallTone = () => home.classList.toggle('light-wall', !!OS.Wallpapers.get(OS.settings.wallpaper).light);
    OS.on('wallpaper', wallTone);
    wallTone();
    OS.on('app:open', () => { if (page === layout.pages.length) refreshLibrary(); });
    OS.on('resize', () => applyPage(false));
    applyIconStyle();
  }

  function refreshLibrary() {
    const lib = pagesEl.querySelector('.lib-page');
    if (lib) lib.innerHTML = libraryHTML();
  }

  function applyIconStyle() {
    const sc = OS.screenEl;
    ['icons-dark', 'icons-clear', 'icons-tinted'].forEach((c) => sc.classList.remove(c));
    if (OS.settings.iconStyle !== 'default') sc.classList.add('icons-' + OS.settings.iconStyle);
    OS.Wallpapers.apply();
  }

  OS.Home = {
    init, render, iconFor, restRect, setBehind, setProgress, zoomIn, reveal, springReveal, goToPage, zoom, springZoom,
    enterJiggle, exitJiggle, setBadge, restoreApp,
    get page() { return page; },
    get jiggle() { return jiggle; },
  };
})();
