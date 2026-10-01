/* ==========================================================================
   Home screen widgets: Meteo, Calendario, Musica, Orologio, Batterie
   ========================================================================== */
(function () {
  'use strict';

  const KINDS = {
    weather: { name: 'Meteo', sizes: ['2x2'], app: 'weather' },
    calendar: { name: 'Calendario', sizes: ['2x2'], app: 'calendar' },
    music: { name: 'Musica', sizes: ['4x2'], app: 'music' },
    clock: { name: 'Orologio', sizes: ['2x2'], app: 'clock' },
    battery: { name: 'Batterie', sizes: ['2x2'], app: 'settings' },
  };

  function weatherHTML() {
    const S = OS.WeatherService;
    const d = S && S.data;
    if (!d) return '<div class="wd-city">Meteo</div><div class="wd-temp">--°</div>';
    const c = d.current;
    return `<div class="wd-city">${OS.esc(d.city)} ${OS.sym('location', { size: 11 })}</div>
      <div class="wd-temp">${Math.round(c.temp)}°</div>
      <div class="wd-cond">${S.icon(c.code, c.isDay)}<div>${OS.esc(S.label(c.code))}</div>
      <div class="wd-hl">Max ${Math.round(d.daily[0].max)}° Min ${Math.round(d.daily[0].min)}°</div></div>`;
  }

  function weatherBg() {
    const S = OS.WeatherService;
    return S && S.data ? S.gradient(S.data.current.code, S.data.current.isDay) : 'linear-gradient(180deg,#2f7fe0,#5aa6f0)';
  }

  function calendarHTML() {
    const d = new Date();
    const C = OS.CalendarService;
    const ev = C ? C.nextToday() : null;
    return `<div class="wd-day">${OS.esc(OS.fmt.weekday(d))}</div>
      <div class="wd-num">${d.getDate()}</div>
      ${ev ? `<div class="wd-ev" style="--c:${ev.color}"><b>${OS.esc(ev.title)}</b><span>${OS.esc(ev.time)}</span></div>`
        : '<div class="wd-ev" style="--c:var(--gray)"><b>Nessun evento</b><span>oggi</span></div>'}`;
  }

  function musicHTML() {
    const M = OS.Audio.Music;
    const L = OS.MusicLibrary;
    const song = M.song || (L && L.songs[0]);
    if (!song) return '';
    const playing = M.playing;
    return `<div class="wd-art">${L ? L.cover(song.album, 128) : ''}</div>
      <div class="wd-info">
        <div class="wd-label">${playing ? 'In riproduzione' : 'Ascoltato di recente'}</div>
        <div class="wd-title">${OS.esc(song.title)}</div>
        <div class="wd-artist">${OS.esc(song.artist)}</div>
        <div class="wd-ctrl">
          <button data-act="prev" aria-label="Precedente">${OS.sym('backward', { size: 26 })}</button>
          <button data-act="toggle" aria-label="Riproduci/Pausa">${OS.sym(playing ? 'pause' : 'play', { size: 30 })}</button>
          <button data-act="next" aria-label="Successivo">${OS.sym('forward', { size: 26 })}</button>
        </div>
      </div>`;
  }

  function musicBg() {
    const L = OS.MusicLibrary;
    const M = OS.Audio.Music;
    const song = M.song || (L && L.songs[0]);
    if (!L || !song) return '#333';
    const a = L.albums[song.album];
    return `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})`;
  }

  function clockHTML() {
    const a = OS.Icons.clockHands();
    return `<svg viewBox="0 0 100 100" class="live-clock"><circle cx="50" cy="50" r="48" fill="#fff"/>${OS.Icons.ticks(60, 41, 45, '#c7c7cc', .7, 5, 38)}
      ${[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n, i) => {
        const ang = (i / 12) * Math.PI * 2;
        return `<text x="${(50 + Math.sin(ang) * 31).toFixed(1)}" y="${(50 - Math.cos(ang) * 31 + 4.2).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="500" fill="#111" font-family="-apple-system,Inter,sans-serif">${n}</text>`;
      }).join('')}
      <g class="ck-h" transform="rotate(${a.h} 50 50)"><rect x="48" y="28" width="4" height="25" rx="2" fill="#111"/></g>
      <g class="ck-m" transform="rotate(${a.m} 50 50)"><rect x="48.6" y="14" width="2.8" height="39" rx="1.4" fill="#111"/></g>
      <g class="ck-s" transform="rotate(${a.s} 50 50)"><rect x="49.4" y="12" width="1.2" height="46" fill="#ff9500"/><circle cx="50" cy="50" r="2.6" fill="#ff9500"/></g>
      <circle cx="50" cy="50" r="1" fill="#fff"/></svg>`;
  }

  function ring(pct, color) {
    const c = 2 * Math.PI * 25;
    return `<svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="5"/><circle cx="29" cy="29" r="25" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
  }

  function batteryHTML() {
    const b = OS.state.battery;
    const color = b < .2 ? '#ff453a' : '#30d158';
    return `<div class="ring">${ring(b, color)}<span>${OS.sym('phone', { size: 20 })}</span></div>
      <div class="ring">${ring(.64, '#30d158')}<span>${OS.sym('headphones', { size: 20 })}</span></div>
      <div class="pct">${Math.round(b * 100)}%</div><div class="pct">64%</div>`;
  }

  function boxHTML(kind) {
    switch (kind) {
      case 'weather': return `<div class="widget-box wd-weather" data-kind="weather" style="background:${weatherBg()}">${weatherHTML()}</div>`;
      case 'calendar': return `<div class="widget-box wd-calendar" data-kind="calendar">${calendarHTML()}</div>`;
      case 'music': return `<div class="widget-box wd-music" data-kind="music" style="background:${musicBg()}">${musicHTML()}</div>`;
      case 'clock': return `<div class="widget-box wd-clock" data-kind="clock">${clockHTML()}</div>`;
      case 'battery': return `<div class="widget-box wd-battery glass" data-kind="battery">${batteryHTML()}</div>`;
      default: return '<div class="widget-box"></div>';
    }
  }

  function refresh(kind) {
    document.querySelectorAll(`.widget-box[data-kind${kind ? `="${kind}"` : ''}]`).forEach((el) => {
      const k = el.dataset.kind;
      if (k === 'weather') { el.style.background = weatherBg(); el.innerHTML = weatherHTML(); }
      if (k === 'calendar') el.innerHTML = calendarHTML();
      if (k === 'music') { el.style.background = musicBg(); el.innerHTML = musicHTML(); }
      if (k === 'battery') el.innerHTML = batteryHTML();
    });
  }

  /** handles taps inside a widget; returns true if consumed */
  function handleTap(target) {
    const btn = target.closest('[data-act]');
    if (!btn) return false;
    const M = OS.Audio.Music;
    const L = OS.MusicLibrary;
    const act = btn.dataset.act;
    if (act === 'toggle') {
      if (!M.song && L) M.load(L.songs[0], true); else M.toggle();
    } else if (act === 'next' && L) L.next();
    else if (act === 'prev' && L) L.prev();
    return true;
  }

  function init() {
    OS.on('weather', () => refresh('weather'));
    OS.on('music:change', () => refresh('music'));
    OS.on('music:state', () => refresh('music'));
    OS.on('battery', () => refresh('battery'));
    OS.on('calendar', () => refresh('calendar'));
    OS.on('daychange', () => refresh('calendar'));
    setInterval(() => refresh('calendar'), 60000);
  }

  OS.Widgets = { KINDS, boxHTML, refresh, handleTap, init };
})();
