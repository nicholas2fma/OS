/* ==========================================================================
   Control Center: connectivity, Now Playing, sliders, focus, quick toggles
   ========================================================================== */
(function () {
  'use strict';

  let cc, backdrop, body, grid;
  let progress = 0;

  const sym = (n, s) => OS.sym(n, { size: s || 26, stroke: 2.1 });

  function html() {
    const s = OS.settings;
    return `
      <div class="cc-mod cc-conn glass">
        <button class="cc-round ${s.airplane ? 'on orange' : ''}" data-t="airplane" aria-label="Uso in aereo">${sym('airplane')}</button>
        <button class="cc-round ${s.cellular && !s.airplane ? 'on green' : ''}" data-t="cellular" aria-label="Dati cellulare">${sym('antenna')}</button>
        <button class="cc-round ${s.wifi ? 'on blue' : ''}" data-t="wifi" aria-label="Wi-Fi">${sym('wifi')}</button>
        <button class="cc-round ${s.bluetooth ? 'on blue' : ''}" data-t="bluetooth" aria-label="Bluetooth">${sym('bluetooth')}</button>
      </div>
      <div class="cc-mod cc-media glass" data-t="media"></div>
      <button class="cc-round glass ${s.rotationLock ? 'on red' : ''}" data-t="rotationLock" aria-label="Blocco rotazione">${sym('rotation-lock')}</button>
      <button class="cc-round glass" data-t="mirroring" aria-label="Duplica schermo">${sym('mirroring')}</button>
      <div class="cc-mod cc-slider glass" data-slider="brightness" aria-label="Luminosità"><div class="fill"></div>${sym('sun-fill')}</div>
      <div class="cc-mod cc-slider glass" data-slider="volume" aria-label="Volume"><div class="fill"></div>${sym('speaker')}</div>
      <button class="cc-mod cc-focus glass ${s.focus ? 'on' : ''}" data-t="focus"><span class="ico">${sym('moon', 22)}</span><span>Full immersione<span class="sub">${s.focus ? 'Non disturbare' : 'Disattivata'}</span></span></button>
      <button class="cc-round glass ${OS.state.torch ? 'on' : ''}" data-t="torch" aria-label="Torcia">${sym(OS.state.torch ? 'flashlight-fill' : 'flashlight')}</button>
      <button class="cc-round glass" data-t="timer" aria-label="Timer">${sym('timer')}</button>
      <button class="cc-round glass" data-t="calculator" aria-label="Calcolatrice">${sym('calculator')}</button>
      <button class="cc-round glass" data-t="camera" aria-label="Fotocamera">${sym('camera')}</button>
      <button class="cc-round glass ${OS.isDark() ? 'on' : ''}" data-t="dark" aria-label="Modalità scura">${sym('circle-half')}</button>
      <button class="cc-round glass ${s.silent ? 'on red' : ''}" data-t="silent" aria-label="Modalità silenziosa">${sym(s.silent ? 'bell-slash' : 'bell')}</button>
      <button class="cc-round glass ${s.lowPower ? 'on' : ''}" data-t="lowPower" aria-label="Risparmio energetico" style="${s.lowPower ? 'background:var(--yellow);color:#000' : ''}">${sym('battery')}</button>
      <button class="cc-round glass ${s.glassLevel > .5 ? 'on' : ''}" data-t="glass" aria-label="Liquid Glass colorato">${sym('sparkles')}</button>`;
  }

  function mediaHTML() {
    const M = OS.Audio.Music, L = OS.MusicLibrary;
    const song = M.song;
    return `<div class="ccm-art">${song && L ? L.cover(song.album, 48) : `<div style="display:grid;place-items:center;height:100%">${OS.sym('music-note', { size: 22 })}</div>`}</div>
      <div class="ccm-title">${song ? OS.esc(song.title) : 'Non in riproduzione'}</div>
      <div class="ccm-artist">${song ? OS.esc(song.artist) : 'Musica'}</div>
      <div class="ccm-ctrl">
        <button data-m="prev">${OS.sym('backward', { size: 22 })}</button>
        <button data-m="toggle">${OS.sym(M.playing ? 'pause' : 'play', { size: 26 })}</button>
        <button data-m="next">${OS.sym('forward', { size: 22 })}</button>
      </div>`;
  }

  function render() {
    const slot = cc.querySelector('.cc-appset-slot');
    const app = OS.Apps.mode === 'app' && OS.Apps.current && OS.Apps.current.id !== 'settings' ? OS.Apps.current.def : null;
    slot.innerHTML = app ? `<button class="cc-appset glass" data-top="appset">${OS.icon(app.id, 'xs')}<span>Impostazioni di ${OS.esc(app.name)}</span></button>` : '';
    grid.innerHTML = html();
    grid.querySelector('.cc-media').innerHTML = mediaHTML();
    paintSliders();
  }

  function paintSliders() {
    grid.querySelectorAll('[data-slider]').forEach((el) => {
      const v = OS.settings[el.dataset.slider];
      el.querySelector('.fill').style.height = (v * 100) + '%';
    });
  }

  function applyBrightness() {
    document.getElementById('dimmer').style.opacity = String((1 - OS.settings.brightness) * .72);
  }

  function setProgress(p, animate) {
    progress = OS.clamp(p, 0, 1);
    const t = animate ? 'opacity .4s ease, transform .5s var(--ease-spring)' : 'none';
    backdrop.style.transition = animate ? 'opacity .4s ease' : 'none';
    body.style.transition = t;
    backdrop.style.opacity = progress;
    body.style.opacity = progress;
    body.style.transform = `translateY(${(1 - progress) * -40}px) scale(${.9 + .1 * progress})`;
  }

  function open() {
    if (!OS.state.ccOpen) render();
    OS.state.ccOpen = true;
    cc.classList.add('open');
    setProgress(1, true);
    OS.chrome();
  }

  function close() {
    OS.state.ccOpen = false;
    cc.classList.remove('open');
    setProgress(0, true);
    OS.chrome();
  }

  function act(t, el) {
    const s = OS.settings;
    OS.haptic(8);
    switch (t) {
      case 'airplane': OS.toggle('airplane'); break;
      case 'cellular': OS.toggle('cellular'); break;
      case 'wifi': OS.toggle('wifi'); break;
      case 'bluetooth': OS.toggle('bluetooth'); break;
      case 'rotationLock':
        OS.toggle('rotationLock');
        OS.Island.flash({ left: OS.sym('rotation-lock', { size: 20 }), right: `<span>Rotazione: ${s.rotationLock ? 'bloccata' : 'sbloccata'}</span>`, width: 270 });
        break;
      case 'mirroring':
        OS.Island.flash({ left: OS.sym('mirroring', { size: 20 }), right: '<span>Nessun dispositivo</span>', width: 240 });
        return;
      case 'focus':
        OS.toggle('focus');
        break;
      case 'torch': OS.Lock.setTorch(!OS.state.torch); break;
      case 'timer': close(); OS.Apps.open('clock', { data: { tab: 'timer' } }); return;
      case 'calculator': close(); OS.Apps.open('calculator'); return;
      case 'camera': close(); OS.Apps.open('camera'); return;
      case 'dark': OS.set('appearance', OS.isDark() ? 'light' : 'dark'); break;
      case 'silent': OS.toggle('silent'); break;
      case 'lowPower': OS.toggle('lowPower'); break;
      case 'glass': OS.set('glassLevel', s.glassLevel > .5 ? .2 : .85); break;
      case 'media': close(); OS.Apps.open('music'); return;
      default: return;
    }
    render();
  }

  function installSliders() {
    let d = null;
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-slider]');
      if (!el) return;
      e.stopPropagation();
      const r = OS.rectOf(el);
      d = { el, key: el.dataset.slider, y: OS.point(e).y, v0: OS.settings[el.dataset.slider], h: r.height, id: e.pointerId };
      el.style.transform = 'scale(1.04)';
      el.style.transition = 'transform .3s var(--ease-bounce)';
    });
    window.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dy = OS.point(e).y - d.y;
      const min = d.key === 'brightness' ? .15 : 0;
      const v = OS.clamp(d.v0 - dy / d.h, min, 1);
      OS.set(d.key, Math.round(v * 100) / 100);
      d.el.querySelector('.fill').style.height = (OS.settings[d.key] * 100) + '%';
    });
    window.addEventListener('pointerup', (e) => {
      if (!d || e.pointerId !== d.id) return;
      d.el.style.transform = '';
      d = null;
    });
  }

  function init() {
    cc = document.getElementById('cc');
    cc.innerHTML = `<div class="cc-backdrop"></div><div class="cc-body">
      <div class="cc-top"><button class="glass" data-top="edit" aria-label="Modifica">${OS.sym('plus', { size: 18, stroke: 2.4 })}</button><div class="cc-appset-slot"></div><button class="glass" data-top="power" aria-label="Spegni">${OS.sym('power', { size: 18, stroke: 2.4 })}</button></div>
      <div class="cc-grid"></div></div>`;
    backdrop = cc.querySelector('.cc-backdrop');
    body = cc.querySelector('.cc-body');
    grid = cc.querySelector('.cc-grid');
    setProgress(0);
    render();
    installSliders();
    applyBrightness();

    grid.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]');
      if (m) {
        const M = OS.Audio.Music, L = OS.MusicLibrary;
        if (m.dataset.m === 'toggle') { if (!M.song && L) M.load(L.songs[0], true); else M.toggle(); }
        if (m.dataset.m === 'next' && L) L.next();
        if (m.dataset.m === 'prev' && L) L.prev();
        return;
      }
      const el = e.target.closest('[data-t]');
      if (el) act(el.dataset.t, el);
    });
    cc.querySelector('.cc-top').addEventListener('click', (e) => {
      const b = e.target.closest('[data-top]');
      if (!b) return;
      if (b.dataset.top === 'power') { close(); setTimeout(() => OS.Lock.sleep(), 200); }
      if (b.dataset.top === 'appset') { const id = OS.Apps.current && OS.Apps.current.id; close(); if (id) OS.Apps.open('settings', { data: { page: 'app', app: id } }); }
      if (b.dataset.top === 'edit') OS.Island.flash({ left: OS.sym('square-grid', { size: 18 }), right: '<span>Personalizzazione presto</span>', width: 280 });
    });

    // tap outside modules or swipe up to dismiss
    let s = null;
    body.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cc-mod, .cc-round, .cc-top button')) return;
      s = { y: OS.point(e).y, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dy = OS.point(e).y - s.y;
      if (dy < 0) setProgress(1 + dy / 300);
    });
    window.addEventListener('pointerup', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dy = OS.point(e).y - s.y;
      s = null;
      if (dy < -60 || Math.abs(dy) < 6) close();
      else setProgress(1, true);
    });

    OS.on('settings', (k) => {
      if (k === 'brightness') applyBrightness();
      if (OS.state.ccOpen && k !== 'brightness' && k !== 'volume' && k !== 'glassLevel') render();
    });
    const refreshMedia = () => { const m = grid.querySelector('.cc-media'); if (m) m.innerHTML = mediaHTML(); };
    OS.on('music:change', refreshMedia);
    OS.on('music:state', refreshMedia);
    OS.on('torch', () => { if (OS.state.ccOpen) render(); });
  }

  OS.CC = {
    init, open, close, setProgress,
    beginDrag() { render(); cc.classList.add('open'); },
    endDrag(o) { if (o) open(); else close(); },
    get progress() { return progress; },
  };
})();
