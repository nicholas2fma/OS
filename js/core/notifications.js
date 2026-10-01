/* ==========================================================================
   Notifications: store, banners, Notification Center (pull-down coversheet)
   ========================================================================== */
(function () {
  'use strict';

  const list = OS.store.get('notifications', []).filter((n) => Date.now() - n.time < 3 * 86400000);
  let nc, sheet, ncList, ncTime, ncDate, ncHead;
  let bannerTimer = null;
  let progress = 0;

  function save() { OS.store.set('notifications', list.slice(0, 40)); }

  function cardHTML(n, cls) {
    const app = OS.apps[n.app];
    const hidePreview = !OS.settings.previews && OS.state.locked;
    return `<button class="notif glass ${cls || ''}" data-id="${n.id}">
      ${OS.icon(n.app)}
      <div class="n-title">${OS.esc(n.title || (app ? app.name : ''))}</div>
      <div class="n-time">${OS.esc(OS.fmt.relative(n.time))}</div>
      <div class="n-body">${hidePreview ? 'Notifica' : OS.esc(n.body || '')}</div>
    </button>`;
  }

  function notify(o) {
    const n = {
      id: OS.uid(),
      app: o.app,
      title: o.title,
      body: o.body,
      time: Date.now(),
      data: o.data || null,
    };
    list.unshift(n);
    if (list.length > 40) list.length = 40;
    save();
    OS.emit('notifications');

    const quiet = OS.settings.focus;
    const inSameApp = OS.Apps.mode === 'app' && OS.Apps.current && OS.Apps.current.id === n.app && !OS.state.locked;
    if (inSameApp && !o.force) return n;

    if (!quiet || o.force) {
      if (!o.silent) OS.sound(o.sound || 'notify');
      OS.haptic([10, 40, 10]);
    }
    if (!OS.state.screenOn) OS.Lock.wake();
    if (!OS.state.locked && !OS.state.ncOpen && (!quiet || o.force)) banner(n);
    return n;
  }

  function remove(id) {
    const i = list.findIndex((n) => n.id === id);
    if (i >= 0) { list.splice(i, 1); save(); OS.emit('notifications'); }
  }

  function clearAll() {
    list.length = 0;
    save();
    OS.emit('notifications');
  }

  function activate(n) {
    remove(n.id);
    const app = OS.apps[n.app];
    if (!app) return;
    if (OS.state.ncOpen) close();
    const go = () => OS.Apps.open(n.app, { data: n.data });
    if (OS.state.locked) OS.Lock.unlock(go); else go();
  }

  /* ---------- banners ---------- */

  function banner(n) {
    const host = document.getElementById('banners');
    host.querySelectorAll('.notif').forEach((b) => { if (b.dismiss) b.dismiss(); else b.remove(); });
    const el = OS.el(cardHTML(n));
    const fromLeft = !!OS.settings.siriAI;
    if (fromLeft) el.classList.add('from-left');
    el.style.transition = 'none';
    host.appendChild(el);
    const away = (dir) => dir === 'left' ? { x: -(OS.state.width + 30), y: 0 } : { x: 0, y: -(el.offsetTop + el.offsetHeight + 30) };
    let pos = away(fromLeft ? 'left' : 'up');
    let anim = null;
    let gone = false;
    const paint = () => { el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`; };
    const springTo = (to, velocity, preset, done) => {
      if (anim) anim.stop();
      anim = OS.motion.animate({
        from: Object.assign({}, pos), to, velocity: velocity || { x: 0, y: 0 }, preset,
        onUpdate(v) { pos = { x: v.x, y: v.y }; paint(); },
        onComplete() { anim = null; if (done) done(); },
      });
    };
    const dismiss = (dir, velocity) => {
      if (gone) return;
      gone = true;
      clearTimeout(bannerTimer);
      el.style.pointerEvents = 'none';
      springTo(away(dir || (fromLeft ? 'left' : 'up')), velocity, { response: .36, damping: 1 }, () => el.remove());
    };
    el.dismiss = () => dismiss();
    paint();
    // drops in with a soft bounce, like the system banner
    springTo({ x: 0, y: 0 }, null, { response: .5, damping: .76 });

    let g = null;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (gone) return;
      if (anim) anim.stop();
      clearTimeout(bannerTimer);
      const p = OS.point(e);
      g = { x: p.x, y: p.y, base: Object.assign({}, pos), tr: OS.motion.tracker(), moved: false, id: e.pointerId };
      g.tr.add(p.x, p.y);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = OS.point(e);
      g.tr.add(p.x, p.y);
      const dx = p.x - g.x, dy = p.y - g.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      const rb = OS.motion.rubber;
      const y = g.base.y + dy;
      const x = g.base.x + dx;
      pos = {
        // up and (from the left) leftwards follow the finger, the other ways resist
        y: y < 0 ? y : rb(y, 90),
        x: fromLeft ? (x < 0 ? x : rb(x, 60)) : rb(x, 120) * .5,
      };
      paint();
    });
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      const v = s.tr.velocity();
      const P = OS.motion.project;
      if (!s.moved) { dismiss(); activate(n); return; }
      if (pos.y + P(v.y, .99) < -40 && v.y < 200) { dismiss('up', v); return; }
      if (fromLeft && pos.x + P(v.x, .99) < -90 && v.x < 200) { dismiss('left', v); return; }
      springTo({ x: 0, y: 0 }, v, { response: .4, damping: .78 });
      bannerTimer = setTimeout(() => dismiss(), 4000);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => dismiss(), 5000);
  }

  /* ---------- Notification Center ---------- */

  function renderNC() {
    if (!nc) return;
    ncTime.textContent = OS.fmt.time();
    ncDate.textContent = OS.fmt.dateLong();
    if (!list.length) {
      ncList.innerHTML = '<div class="nc-empty">Nessuna notifica precedente</div>';
      return;
    }
    ncList.innerHTML = `<div class="nc-head"><span>Centro Notifiche</span><button class="nc-clear glass" aria-label="Cancella tutto">${OS.sym('xmark', { size: 14, stroke: 3 })}</button></div>
      <div class="nc-scroll scroll" style="display:flex;flex-direction:column;gap:8px;min-height:0">${list.map((n) => cardHTML(n)).join('')}</div>`;
    ncList.querySelector('.nc-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      ncList.querySelectorAll('.notif').forEach((el, i) => setTimeout(() => el.classList.add('leaving'), i * 40));
      setTimeout(clearAll, 300);
    });
    bindSwipe(ncList);
  }

  /** swipe a card left to dismiss (it flies off, then the list closes the gap), tap to open */
  function bindSwipe(root) {
    root.querySelectorAll('.notif').forEach((el) => {
      let s = null;
      let x = 0;
      let anim = null;
      const paint = () => { el.style.transform = Math.abs(x) < .1 ? '' : `translate3d(${x}px, 0, 0)`; };
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (anim) anim.stop();
        const p = OS.point(e);
        s = { x: p.x, base: x, moved: false, id: e.pointerId, tr: OS.motion.tracker() };
        s.tr.add(p.x, p.y);
        el.style.transition = 'none';
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      });
      el.addEventListener('pointermove', (e) => {
        if (!s || e.pointerId !== s.id) return;
        const p = OS.point(e);
        s.tr.add(p.x, p.y);
        const dx = p.x - s.x;
        if (Math.abs(dx) > 6) s.moved = true;
        if (!s.moved) return;
        const nx = s.base + dx;
        x = nx < 0 ? nx : OS.motion.rubber(nx, 50);
        paint();
      });
      const end = (e) => {
        if (!s || e.pointerId !== s.id) return;
        const g = s;
        s = null;
        const v = g.tr.velocity().x;
        const W = OS.state.width;
        if (!g.moved) {
          const n = list.find((it) => it.id === el.dataset.id);
          if (n) activate(n);
          return;
        }
        if (x + OS.motion.project(v, .99) < -W * .38 && v < 300) {
          // fly off with the finger's speed, then collapse the gap
          anim = OS.motion.animate({
            from: x, to: -(W + 40), velocity: Math.min(v, -800), preset: { response: .3, damping: 1 },
            onUpdate(nx) { x = nx; paint(); },
            onComplete() {
              const h = el.offsetHeight;
              OS.motion.animate({
                from: 0, to: 1, preset: 'smooth',
                onUpdate(k) { el.style.height = (h * (1 - k)) + 'px'; el.style.marginBottom = (-8 * k) + 'px'; el.style.opacity = String(1 - k); },
                onComplete() { remove(el.dataset.id); },
              });
            },
          });
          return;
        }
        anim = OS.motion.animate({
          from: x, to: 0, velocity: v, preset: 'snappy',
          onUpdate(nx) { x = nx; paint(); },
        });
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
  }

  /* ---------- motion: the sheet follows the finger and settles on a spring ---------- */

  const value = OS.motion.value(0, paint);

  function paint(p) {
    progress = p;
    const H = OS.state.height;
    const over = Math.max(0, p - 1);
    nc.style.visibility = p <= .001 ? 'hidden' : '';
    sheet.style.transform = p >= 1 ? 'none' : `translate3d(0, ${(p - 1) * H}px, 0)`;
    // pulled past the end, the content stretches instead of the sheet
    ncList.style.transform = over ? `translateY(${over * H * .35}px)` : '';
    ncHead.style.transform = over ? `translateY(${over * H * .2}px)` : '';
  }

  function setProgress(p, animate) {
    if (animate) value.spring(OS.clamp(p, 0, 1), { preset: 'smooth' });
    else value.set(p);
  }

  function open(velocity) {
    if (!OS.state.ncOpen && !nc.classList.contains('open')) renderNC();
    OS.state.ncOpen = true;
    nc.classList.add('open');
    value.spring(1, { preset: { response: .46, damping: .86 }, velocity });
    OS.chrome();
  }

  function close(velocity) {
    OS.state.ncOpen = false;
    nc.classList.remove('open');
    value.spring(0, { preset: { response: .4, damping: 1 }, velocity });
    OS.chrome();
  }

  function fromDrag(dy, base) {
    const H = OS.state.height;
    const raw = base * H + dy;
    if (raw <= H) return raw / H;
    return 1 + OS.motion.rubber(raw - H, H) / H;
  }

  function release(vy) {
    const H = OS.state.height;
    const projected = value.value + OS.motion.project(vy, .99) / H;
    if (vy > 450 || (vy > -450 && projected > .42)) open(vy / H);
    else close(vy / H);
  }

  function init() {
    nc = document.getElementById('nc');
    nc.innerHTML = `<div class="nc-sheet">
        <div class="nc-wall" style="position:absolute;inset:0;background-image:var(--wallpaper);background-size:cover;background-position:center"></div>
        <div class="nc-wall-dim" style="position:absolute;inset:0;background:rgba(0,0,0,.08)"></div>
        <div class="nc-clock" style="position:relative;display:flex;flex-direction:column;align-items:center;width:100%">
          <div class="lock-date nc-date" style="margin-top:84px"></div>
          <div class="lock-time glass-text nc-time"></div>
        </div>
        <div class="nc-list"></div>
        <div style="position:absolute;bottom:8px;left:50%;margin-left:-70px;width:140px;height:5px;border-radius:3px;background:#fff"></div>
      </div>`;
    sheet = nc.querySelector('.nc-sheet');
    ncList = nc.querySelector('.nc-list');
    ncTime = nc.querySelector('.nc-time');
    ncDate = nc.querySelector('.nc-date');
    ncHead = nc.querySelector('.nc-clock');
    value.set(0);

    // swipe up on the sheet closes it; tapping the empty wallpaper does too
    let s = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.notif') || e.target.closest('button')) return;
      s = { y: OS.point(e).y, id: e.pointerId, tr: OS.motion.tracker(), moved: false };
      s.tr.add(0, s.y);
    });
    window.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const y = OS.point(e).y;
      s.tr.add(0, y);
      const dy = y - s.y;
      if (!s.moved && Math.abs(dy) < 8) return;
      if (!s.moved) { s.moved = true; value.stop(); }
      value.set(fromDrag(dy, 1));
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const g = s;
      s = null;
      if (!g.moved) { if (!e.target.closest('.nc-list')) close(); return; }
      const vy = g.tr.velocity().y;
      const H = OS.state.height;
      if (vy < -350 || value.value < .8) close(vy / H);
      else open(vy / H);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    OS.on('notifications', () => { if (OS.state.ncOpen) renderNC(); });
    setInterval(() => { if (OS.state.ncOpen) { ncTime.textContent = OS.fmt.time(); } }, 1000);
  }

  OS.Notifications = { init, list, remove, clearAll, activate, cardHTML, bindSwipe };
  OS.NC = {
    open: () => open(), close: () => close(), setProgress,
    /** top-left edge pull */
    beginDrag() { renderNC(); nc.classList.add('open'); value.stop(); },
    drag(dy) { value.set(fromDrag(dy, 0)); },
    release(dy, vy) { release(vy); },
    endDrag(open_) { if (open_) open(); else close(); },
    get progress() { return progress; },
  };
  OS.notify = notify;
})();
