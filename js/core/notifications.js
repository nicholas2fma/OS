/* ==========================================================================
   Notifications: store, banners, Notification Center (pull-down coversheet)
   ========================================================================== */
(function () {
  'use strict';

  const list = OS.store.get('notifications', []).filter((n) => Date.now() - n.time < 3 * 86400000);
  let nc, sheet, ncList, ncTime, ncDate;
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
    host.querySelectorAll('.notif').forEach((b) => { b.classList.add('hide'); setTimeout(() => b.remove(), 400); });
    const el = OS.el(cardHTML(n));
    if (OS.settings.siriAI) el.classList.add('from-left');
    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    let start = null;
    let startX = 0;
    let moved = false;
    const dismiss = () => {
      clearTimeout(bannerTimer);
      el.style.transform = '';
      el.classList.add('hide');
      setTimeout(() => el.remove(), 400);
    };
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      start = OS.point(e).y;
      startX = OS.point(e).x;
      moved = false;
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (start == null) return;
      const dy = OS.point(e).y - start;
      if (Math.abs(dy) > 5) moved = true;
      el.style.transform = el.classList.contains('from-left') ? `translate(${Math.min(0, OS.point(e).x - startX)}px, ${Math.min(dy, dy * .2)}px)` : `translateY(${Math.min(dy, dy * .2)}px)`;
    });
    el.addEventListener('pointerup', (e) => {
      if (start == null) return;
      const dy = OS.point(e).y - start;
      start = null;
      el.style.transition = '';
      if (dy < -30 || OS.point(e).x - startX < -60) { dismiss(); return; }
      el.style.transform = '';
      if (!moved) { dismiss(); activate(n); }
    });
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(dismiss, 5000);
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

  /** swipe a card left to dismiss, tap to open */
  function bindSwipe(root) {
    root.querySelectorAll('.notif').forEach((el) => {
      let s = null;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); s = { x: OS.point(e).x, moved: false }; el.style.transition = 'none'; });
      el.addEventListener('pointermove', (e) => {
        if (!s) return;
        const dx = OS.point(e).x - s.x;
        if (Math.abs(dx) > 6) s.moved = true;
        if (s.moved) el.style.transform = `translateX(${Math.min(0, dx)}px)`;
      });
      const end = (e) => {
        if (!s) return;
        const dx = OS.point(e).x - s.x;
        const moved = s.moved;
        s = null;
        el.style.transition = '';
        if (dx < -110) {
          el.classList.add('leaving');
          el.style.transform = 'translateX(-120%)';
          setTimeout(() => remove(el.dataset.id), 280);
        } else {
          el.style.transform = '';
          if (!moved) {
            const n = list.find((x) => x.id === el.dataset.id);
            if (n) activate(n);
          }
        }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
  }

  function setProgress(p, animate) {
    progress = OS.clamp(p, 0, 1);
    nc.classList.toggle('anim', !!animate);
    sheet.style.transform = `translateY(${(progress - 1) * 100}%)`;
  }

  function open() {
    renderNC();
    OS.state.ncOpen = true;
    nc.classList.add('open');
    setProgress(1, true);
    OS.chrome();
  }

  function close() {
    OS.state.ncOpen = false;
    nc.classList.remove('open');
    setProgress(0, true);
    OS.chrome();
  }

  function init() {
    nc = document.getElementById('nc');
    nc.innerHTML = `<div class="nc-sheet">
        <div class="nc-wall" style="position:absolute;inset:0;background-image:var(--wallpaper);background-size:cover;background-position:center"></div>
        <div class="nc-wall-dim" style="position:absolute;inset:0;background:rgba(0,0,0,.08)"></div>
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:100%">
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
    setProgress(0);

    // swipe up on the sheet closes it
    let s = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.notif') || e.target.closest('button')) return;
      s = { y: OS.point(e).y, t: performance.now() };
    });
    window.addEventListener('pointermove', (e) => {
      if (!s) return;
      const dy = OS.point(e).y - s.y;
      if (dy < 0) setProgress(1 + dy / OS.state.height);
    });
    window.addEventListener('pointerup', (e) => {
      if (!s) return;
      const dy = OS.point(e).y - s.y;
      const v = dy / (performance.now() - s.t);
      s = null;
      if (dy < -80 || v < -.5) close();
      else if (Math.abs(dy) < 6 && !e.target.closest('.nc-list')) close();
      else setProgress(1, true);
    });

    OS.on('notifications', () => { if (OS.state.ncOpen) renderNC(); });
    setInterval(() => { if (OS.state.ncOpen) { ncTime.textContent = OS.fmt.time(); } }, 1000);
  }

  OS.Notifications = { init, list, remove, clearAll, activate, cardHTML, bindSwipe };
  OS.NC = {
    open, close, setProgress,
    beginDrag() { renderNC(); nc.classList.add('open'); },
    endDrag(open_) { if (open_) open(); else close(); },
    get progress() { return progress; },
  };
  OS.notify = notify;
})();
