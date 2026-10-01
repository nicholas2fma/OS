/* ==========================================================================
   Lock screen: clock, widgets, notifications, Now Playing, flashlight/camera,
   swipe-up to unlock, simulated Face ID, screen sleep/wake
   ========================================================================== */
(function () {
  'use strict';

  let lock, timeEl, dateEl, iconEl, widgetsEl, notifsEl, mediaEl, hintEl, torchBtn, camBtn;
  let faceTimer = null;
  let faceOk = false;

  function tick() {
    timeEl.textContent = OS.fmt.time();
    dateEl.textContent = OS.fmt.dateLong();
  }

  function widgets() {
    const S = OS.WeatherService;
    const d = S && S.data;
    const b = OS.state.battery;
    const c = 2 * Math.PI * 25;
    const next = OS.ClockService && OS.ClockService.nextAlarm();
    widgetsEl.innerHTML = `
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
    mediaEl.innerHTML = `<div class="lm-top"><div class="lm-art">${L.cover(s.album, 46)}</div>
      <div style="min-width:0;flex:1"><div class="lm-title">${OS.esc(s.title)}</div><div class="lm-artist">${OS.esc(s.artist)}</div></div>
      <div class="isl-bars ${M.playing ? '' : 'paused'}" style="--c:#fff"><i></i><i></i><i></i><i></i></div></div>
      <div class="lm-progress"><i style="width:${(M.position() / s.duration) * 100}%"></i></div>
      <div class="lm-ctrl"><button data-m="prev">${OS.sym('backward', { size: 26 })}</button><button data-m="toggle">${OS.sym(M.playing ? 'pause' : 'play', { size: 30 })}</button><button data-m="next">${OS.sym('forward', { size: 26 })}</button></div>`;
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

  function setLockY(y, animate) {
    lock.classList.toggle('anim', !!animate);
    lock.style.transform = y ? `translateY(${y}px)` : '';
    lock.style.opacity = y ? String(1 - Math.min(1, -y / (OS.state.height * .6))) : '';
  }

  function unlock(cb) {
    if (!OS.state.locked) { if (cb) cb(); return; }
    OS.state.locked = false;
    if (OS.state.ncOpen) OS.NC.close();
    lock.classList.add('anim', 'unlocked');
    lock.style.transform = '';
    lock.style.opacity = '';
    if (OS.Apps.mode !== 'app') OS.Home.zoomIn();
    OS.chrome();
    OS.emit('unlock');
    setTimeout(() => { lock.classList.remove('anim'); if (cb) cb(); }, cb ? 260 : 0);
  }

  function lockNow() {
    if (OS.state.ccOpen) OS.CC.close();
    if (OS.state.ncOpen) OS.NC.close();
    if (OS.state.spotlightOpen) OS.Spotlight.close(true);
    OS.Home.exitJiggle();
    if (OS.Apps.mode === 'switcher') OS.Apps.home();
    const wasLocked = OS.state.locked;
    OS.state.locked = true;
    lock.classList.remove('anim', 'unlocked');
    setLockY(0);
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
    lock.addEventListener('pointerdown', (e) => {
      if (!OS.state.locked || e.button > 0) return;
      if (e.target.closest('button, .notif, .lock-media')) return;
      const p = OS.point(e);
      if (p.y < 44) return; // top edge belongs to Control/Notification Center
      g = { y: p.y, x: p.x, t: performance.now(), id: e.pointerId, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dy = OS.point(e).y - g.y;
      if (Math.abs(dy) > 6) g.moved = true;
      if (!g.moved) return;
      setLockY(Math.min(0, dy));
      if (OS.Apps.mode !== 'app') OS.Home.setProgress(1 - OS.clamp(-dy / (OS.state.height * .4), 0, 1));
    });
    window.addEventListener('pointerup', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dy = OS.point(e).y - g.y;
      const v = dy / Math.max(1, performance.now() - g.t);
      const moved = g.moved;
      g = null;
      OS.Home.setProgress(null);
      if (!moved) { showHint(); return; }
      if (dy < -OS.state.height * .16 || v < -.5) unlock();
      else setLockY(0, true);
    });

    torchBtn.addEventListener('click', () => { setTorch(!OS.state.torch); OS.haptic(20); });
    camBtn.addEventListener('click', () => { OS.haptic(20); unlock(() => OS.Apps.open('camera')); });
    mediaEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const M = OS.Audio.Music, L = OS.MusicLibrary;
      if (b.dataset.m === 'toggle') M.toggle();
      if (b.dataset.m === 'next') L.next();
      if (b.dataset.m === 'prev') L.prev();
    });
  }

  let hintT = null;
  function showHint() {
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
    camBtn = lock.querySelector('.lock-quick.right');

    OS.Glass.attach(torchBtn, { bezel: 14, strength: 20 });
    OS.Glass.attach(camBtn, { bezel: 14, strength: 20 });

    tick(); widgets(); notifs(); media(); faceID();
    setInterval(() => { if (OS.state.locked) tick(); }, 1000);
    setInterval(() => { if (OS.state.locked && OS.Audio.Music.playing) media(); }, 1000);
    installGestures();

    OS.on('notifications', () => { if (OS.state.locked) notifs(); });
    OS.on('weather', widgets);
    OS.on('battery', widgets);
    OS.on('alarms', widgets);
    OS.on('music:change', media);
    OS.on('music:state', media);
    OS.on('setting:use24h', tick);
    OS.screenEl.querySelector('#screen-off').addEventListener('click', wake);
  }

  OS.Lock = { init, unlock, lock: lockNow, sleep, wake, power, setTorch, showHint };
})();
