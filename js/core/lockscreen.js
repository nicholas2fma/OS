/* ==========================================================================
   Lock screen: clock, widgets, notifications, Now Playing, flashlight/camera,
   swipe-up to unlock, simulated Face ID, screen sleep/wake
   ========================================================================== */
(function () {
  'use strict';

  let lock, timeEl, dateEl, iconEl, widgetsEl, notifsEl, mediaEl, hintEl, torchBtn, camBtn, volEl;
  let faceTimer = null;
  let faceOk = false;

  function tick() {
    timeEl.textContent = OS.fmt.time();
    dateEl.textContent = OS.fmt.dateLong();
    const mini = widgetsEl && widgetsEl.querySelector('.lock-clock-mini');
    if (mini) mini.textContent = OS.fmt.time();
  }

  /** iOS 27 Lock Screen options: compact clock, volume slider */
  function layout() {
    const compact = !!OS.settings.lockCompactClock;
    lock.classList.toggle('compact', compact);
    volEl.classList.toggle('hidden', !OS.settings.lockVolume);
    volEl.querySelector('.lv-fill').style.width = (OS.settings.volume * 100) + '%';
    widgets();
  }

  function widgets() {
    const S = OS.WeatherService;
    const d = S && S.data;
    const b = OS.state.battery;
    const c = 2 * Math.PI * 25;
    const next = OS.ClockService && OS.ClockService.nextAlarm();
    widgetsEl.innerHTML = (OS.settings.lockCompactClock ? `<div class="lock-clock-mini glass-text tnum">${OS.fmt.time()}</div>` : '') + `
      <div class="lock-widget glass">${d ? S.icon(d.current.code, d.current.isDay) : OS.sym('sun')}<span class="big">${d ? Math.round(d.current.temp) + '°' : '--'}</span></div>
      <div class="lock-widget glass ring"><svg class="ring-svg" viewBox="0 0 58 58"><circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="4"/><circle cx="29" cy="29" r="25" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * b).toFixed(1)} ${c.toFixed(1)}"/></svg>${OS.sym(OS.state.charging ? 'bolt-fill' : 'battery', { size: 16 })}<span>${Math.round(b * 100)}</span></div>
      <div class="lock-widget glass">${next ? OS.sym('alarm-fill', { size: 18 }) + `<span>${OS.esc(next)}</span>` : `<span style="font-size:11px;opacity:.8">${OS.esc(OS.fmt.dayShort())}</span><span class="big">${new Date().getDate()}</span>`}</div>`;
  }

  function notifs() {
    const list = OS.Notifications.list.slice(0, 3);
    notifsEl.innerHTML = list.map((n, i) => OS.Notifications.cardHTML(n, i ? '' : '')).join('');
    notifsEl.querySelectorAll('.notif').forEach((el, i) => {
      el.style.zIndex = 10 - i;
      if (i > 0) { el.classList.add('stacked'); el.style.transform = `scale(${1 - i * .05})`; el.style.opacity = String(1 - i * .3); }
    });
    OS.Notifications.bindSwipe(notifsEl);
  }

  function media() {
    const M = OS.Audio.Music;
    const L = OS.MusicLibrary;
    if (!M.song || !L) { mediaEl.classList.add('hidden'); return; }
    mediaEl.classList.remove('hidden');
    const s = M.song;
    mediaEl.classList.remove('swiped');
    mediaEl.innerHTML = `<button class="lm-clear" data-m="clear">Cancella</button><div class="lm-inner"><div class="lm-top"><div class="lm-art">${L.cover(s.album, 46)}</div>
      <div style="min-width:0;flex:1"><div class="lm-title">${OS.esc(s.title)}</div><div class="lm-artist">${OS.esc(s.artist)}</div></div>
      <div class="isl-bars ${M.playing ? '' : 'paused'}" style="--c:#fff"><i></i><i></i><i></i><i></i></div></div>
      <div class="lm-progress"><i style="width:${(M.position() / s.duration) * 100}%"></i></div>
      <div class="lm-ctrl"><button data-m="prev">${OS.sym('backward', { size: 26 })}</button><button data-m="toggle">${OS.sym(M.playing ? 'pause' : 'play', { size: 30 })}</button><button data-m="next">${OS.sym('forward', { size: 26 })}</button></div></div>`;
  }

  function customize() {
    const overlay = document.getElementById('overlay');
    overlay.classList.add('active');
    OS.UI.sheet(overlay, {
      title: 'Personalizza',
      left: { icon: 'xmark', label: 'Chiudi' },
      render(body) {
        body.appendChild(OS.UI.section([
          { icon: 'clock', color: 'var(--indigo)', title: 'Orologio compatto', sub: 'Lascia più spazio allo sfondo', toggle: { on: !!OS.settings.lockCompactClock, onChange: (v) => OS.set('lockCompactClock', v) } },
          { icon: 'speaker', color: 'var(--pink)', title: 'Cursore del volume', toggle: { on: !!OS.settings.lockVolume, onChange: (v) => OS.set('lockVolume', v) } },
        ], 'Schermata di blocco'));
        const walls = OS.el(`<div class="lock-walls scroll-x">${OS.Wallpapers.list.map((w) => `<button data-w="${w.id}" class="${w.id === OS.settings.wallpaper ? 'on' : ''}" style="background-image:${OS.Wallpapers.url(w.id)}"></button>`).join('')}</div>`);
        walls.addEventListener('click', (e) => {
          const b = e.target.closest('[data-w]');
          if (!b) return;
          OS.set('wallpaper', b.dataset.w);
          walls.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        });
        body.appendChild(OS.el('<div class="section-head" style="padding:0 32px 8px">Sfondo</div>'));
        body.appendChild(walls);
      },
      onClose() { setTimeout(() => { if (!overlay.children.length) overlay.classList.remove('active'); }, 520); },
    });
  }

  function faceID() {
    faceOk = false;
    iconEl.innerHTML = OS.sym('lock-fill', { size: 22 });
    iconEl.classList.remove('open');
    clearTimeout(faceTimer);
    faceTimer = setTimeout(() => {
      faceOk = true;
      iconEl.innerHTML = OS.sym('lock-open-fill', { size: 22, stroke: 2.2 });
      iconEl.classList.add('open');
    }, 700);
  }

  /* ---------- state changes ---------- */

  /* the Lock Screen is a sheet: it follows the finger and leaves on a spring */
  const paintLock = () => {
    const y = lockY.value, k = wakeZoom.value;
    lock.style.transform = Math.abs(y) < .1 && Math.abs(k - 1) < .0005 ? '' : `translate3d(0, ${y}px, 0) scale(${k})`;
  };
  const lockY = OS.motion.value(0, paintLock);
  // waking the screen: the Lock Screen settles from slightly closer, like the wallpaper zoom
  const wakeZoom = OS.motion.value(1, paintLock);
  const revealSpan = () => OS.state.height * .55;

  function unlock(cb, opts) {
    opts = opts || {};
    if (!OS.state.locked) { if (cb) cb(); return; }
    OS.state.locked = false;
    if (OS.state.ncOpen) OS.NC.close();
    const H = OS.state.height;
    const v = opts.velocity || 0;
    lock.style.pointerEvents = 'none';
    lockY.spring(-H - 12, {
      preset: { response: .42, damping: 1 },
      velocity: Math.min(v, -600),
      onComplete() { lock.classList.add('unlocked'); },
    });
    if (OS.Apps.mode !== 'app') {
      if (!opts.fromDrag) OS.Home.reveal(0);
      OS.Home.springReveal(1, -v / revealSpan());
    } else {
      OS.Home.reveal(1);
    }
    OS.chrome();
    OS.emit('unlock');
    if (cb) setTimeout(cb, 260);
  }

  function lockNow() {
    if (OS.state.ccOpen) OS.CC.close();
    if (OS.state.ncOpen) OS.NC.close();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    OS.Home.exitJiggle();
    if (OS.Apps.mode === 'switcher') OS.Apps.home();
    const wasLocked = OS.state.locked;
    OS.state.locked = true;
    lock.classList.remove('unlocked');
    lock.style.pointerEvents = '';
    lockY.set(0);
    tick(); widgets(); notifs(); media();
    faceID();
    OS.chrome();
    if (!wasLocked) { OS.sound('lock'); OS.emit('lock'); }
  }

  function sleep() {
    lockNow();
    OS.state.screenOn = false;
    OS.screenEl.classList.add('off');
    OS.emit('screen', false);
  }

  function wake() {
    if (OS.state.screenOn) return;
    OS.state.screenOn = true;
    OS.screenEl.classList.remove('off');
    if (OS.state.locked) { wakeZoom.set(1.06); wakeZoom.spring(1, { preset: { response: .7, damping: 1 } }); }
    faceID();
    widgets(); notifs(); media();
    OS.emit('screen', true);
  }

  function power() {
    if (OS.state.screenOn) sleep(); else wake();
  }

  function setTorch(on) {
    OS.state.torch = on;
    OS.screenEl.classList.toggle('torch', on);
    torchBtn.classList.toggle('on', on);
    torchBtn.innerHTML = OS.sym(on ? 'flashlight-fill' : 'flashlight', { size: 22 });
    OS.emit('torch', on);
  }

  /* ---------- gestures ---------- */

  function installGestures() {
    let g = null;
    let pressT = null;
    lock.addEventListener('pointerdown', (e) => {
      if (!OS.state.locked || e.button > 0) return;
      if (e.target.closest('button, .notif, .lock-media')) return;
      const p = OS.point(e);
      if (p.y < 44) return; // top edge belongs to Control/Notification Center
      g = { y: p.y, x: p.x, id: e.pointerId, moved: false, tr: OS.motion.tracker(), y0: lockY.value };
      g.tr.add(p.x, p.y);
      clearTimeout(pressT);
      pressT = setTimeout(() => { if (g && !g.moved) { g = null; OS.haptic(15); customize(); } }, 650);
    });
    window.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const p = OS.point(e);
      g.tr.add(p.x, p.y);
      const dy = p.y - g.y;
      if (Math.abs(dy) > 6 && !g.moved) { g.moved = true; clearTimeout(pressT); lockY.stop(); }
      if (!g.moved) return;
      const y = g.y0 + dy;
      // up follows the finger; down only stretches a little
      lockY.set(y < 0 ? y : OS.motion.rubber(y, OS.state.height * .3, .4));
      if (OS.Apps.mode !== 'app') OS.Home.reveal(OS.motion.clamp01(-lockY.value / revealSpan()));
    });
    const end = (e) => {
      clearTimeout(pressT);
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      if (!s.moved) { showHint(); return; }
      const vy = s.tr.velocity().y;
      const H = OS.state.height;
      const projected = -(lockY.value + OS.motion.project(vy, .99));
      if (vy < -450 || (vy < 300 && projected > H * .3)) { unlock(null, { velocity: vy, fromDrag: true }); return; }
      lockY.spring(0, { preset: 'snappy', velocity: vy });
      if (OS.Apps.mode !== 'app') OS.Home.springReveal(0, vy / revealSpan());
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    torchBtn.addEventListener('click', () => { setTorch(!OS.state.torch); OS.haptic(20); });
    camBtn.addEventListener('click', () => { OS.haptic(20); unlock(() => OS.Apps.open('camera')); });
    let ms = null;
    mediaEl.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) ms = { x: OS.point(e).x, open: mediaEl.classList.contains('swiped') }; });
    mediaEl.addEventListener('pointermove', (e) => {
      if (!ms) return;
      const dx = OS.point(e).x - ms.x + (ms.open ? -96 : 0);
      const inner = mediaEl.querySelector('.lm-inner');
      if (inner) { inner.style.transition = 'none'; inner.style.transform = `translateX(${OS.clamp(dx, -130, 0)}px)`; }
    });
    const msEnd = (e) => {
      if (!ms) return;
      const dx = OS.point(e).x - ms.x + (ms.open ? -96 : 0);
      ms = null;
      const inner = mediaEl.querySelector('.lm-inner');
      if (inner) { inner.style.transition = ''; inner.style.transform = ''; }
      mediaEl.classList.toggle('swiped', dx < -50);
    };
    mediaEl.addEventListener('pointerup', msEnd);
    mediaEl.addEventListener('pointercancel', msEnd);
    // volume slider
    let vd = null;
    volEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); vd = OS.rectOf(volEl.querySelector('.lv-track')); setVol(e); });
    const setVol = (e) => { const v = OS.clamp((OS.point(e).x - vd.x) / vd.width, 0, 1); OS.set('volume', Math.round(v * 100) / 100); volEl.querySelector('.lv-fill').style.width = v * 100 + '%'; };
    window.addEventListener('pointermove', (e) => { if (vd) setVol(e); });
    window.addEventListener('pointerup', () => { vd = null; });
    mediaEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const M = OS.Audio.Music, L = OS.MusicLibrary;
      if (b.dataset.m === 'clear') { M.clear(); return; }
      if (b.dataset.m === 'toggle') M.toggle();
      if (b.dataset.m === 'next') L.next();
      if (b.dataset.m === 'prev') L.prev();
    });
  }

  let hintT = null;
  function showHint() {
    // a tap makes the Lock Screen hop, hinting that it slides up
    if (!lockY.animating) lockY.spring(0, { preset: { response: .42, damping: .62 }, velocity: -520 });
    hintEl.classList.remove('show');
    void hintEl.offsetWidth;
    hintEl.classList.add('show');
    clearTimeout(hintT);
    hintT = setTimeout(() => hintEl.classList.remove('show'), 2400);
  }

  function init() {
    lock = document.getElementById('lock');
    lock.innerHTML = `
      <div class="lock-icon"></div>
      <div class="lock-date"></div>
      <div class="lock-time glass-text"></div>
      <div class="lock-widgets"></div>
      <div class="lock-volume glass hidden">${OS.sym('speaker-slash', { size: 15 })}<div class="lv-track"><i class="lv-fill"></i></div>${OS.sym('speaker', { size: 17 })}</div>
      <div class="lock-bottom"><div class="lock-media glass hidden"></div><div class="lock-notifs"></div></div>
      <button class="lock-quick left glass" aria-label="Torcia">${OS.sym('flashlight', { size: 22 })}</button>
      <button class="lock-quick right glass" aria-label="Fotocamera">${OS.sym('camera-fill', { size: 22 })}</button>
      <div class="lock-hint">Scorri verso l'alto per aprire</div>`;
    timeEl = lock.querySelector('.lock-time');
    dateEl = lock.querySelector('.lock-date');
    iconEl = lock.querySelector('.lock-icon');
    widgetsEl = lock.querySelector('.lock-widgets');
    notifsEl = lock.querySelector('.lock-notifs');
    mediaEl = lock.querySelector('.lock-media');
    hintEl = lock.querySelector('.lock-hint');
    torchBtn = lock.querySelector('.lock-quick.left');
    volEl = lock.querySelector('.lock-volume');
    camBtn = lock.querySelector('.lock-quick.right');

    OS.Glass.attach(torchBtn, { bezel: 14, strength: 20 });
    OS.Glass.attach(camBtn, { bezel: 14, strength: 20 });

    tick(); layout(); notifs(); media(); faceID();
    setInterval(() => { if (OS.state.locked) tick(); }, 1000);
    // only the progress bar moves every second: a full re-render would undo a swipe on Now Playing
    setInterval(() => {
      const M = OS.Audio.Music;
      if (!OS.state.locked || !M.playing || !M.song) return;
      const bar = mediaEl.querySelector('.lm-progress i');
      if (bar) bar.style.width = (M.position() / M.song.duration) * 100 + '%';
    }, 1000);
    installGestures();

    OS.on('notifications', () => { if (OS.state.locked) notifs(); });
    OS.on('weather', widgets);
    OS.on('battery', widgets);
    OS.on('alarms', widgets);
    OS.on('music:change', media);
    OS.on('music:state', media);
    OS.on('setting:use24h', tick);
    OS.on('settings', (k) => { if (k === 'lockCompactClock' || k === 'lockVolume') layout(); if (k === 'volume' && !OS.state.ccOpen) volEl.querySelector('.lv-fill').style.width = (OS.settings.volume * 100) + '%'; });
    OS.screenEl.querySelector('#screen-off').addEventListener('click', wake);
  }

  OS.Lock = { init, unlock, lock: lockNow, sleep, wake, power, setTorch, showHint };
})();
