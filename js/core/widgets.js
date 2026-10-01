/* ==========================================================================
   Home screen widgets: Meteo, Calendario, Musica, Foto, Orologio, Batterie
   iOS 27 adds the extra-large size (4×6) that fills a whole Home Screen page.
   ========================================================================== */
(function () {
  'use strict';

  const KINDS = {
    weather: { name: 'Meteo', sizes: ['2x2', '4x2', '4x6'], app: 'weather' },
    calendar: { name: 'Calendario', sizes: ['2x2', '4x6'], app: 'calendar' },
    music: { name: 'Musica', sizes: ['4x2', '4x6'], app: 'music' },
    photos: { name: 'Foto', sizes: ['2x2', '4x6'], app: 'photos' },
    clock: { name: 'Orologio', sizes: ['2x2'], app: 'clock' },
    battery: { name: 'Batterie', sizes: ['2x2'], app: 'settings' },
  };
  const SIZE_NAMES = { '2x2': 'Piccolo', '4x2': 'Medio', '4x6': 'Extra-large' };
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- weather ---------------- */

  function weatherHTML(size) {
    const S = OS.WeatherService;
    const d = S && S.data;
    if (!d) return '<div class="wd-city">Meteo</div><div class="wd-temp">--°</div>';
    const c = d.current;
    const t = (v) => Math.round(v) + '°';
    const head = `<div class="wd-city">${OS.esc(d.city)} ${OS.sym('location', { size: 11 })}</div><div class="wd-temp">${t(c.temp)}</div>`;
    const cond = `<div class="wd-cond">${S.icon(c.code, c.isDay)}<div>${OS.esc(S.label(c.code))}</div><div class="wd-hl">Max ${t(d.daily[0].max)} Min ${t(d.daily[0].min)}</div></div>`;
    const hours = (n) => `<div class="wd-hours">${d.hourly.slice(0, n).map((h, i) => `<div><span>${i === 0 ? 'Ora' : pad(h.time.getHours())}</span>${S.icon(h.code, h.isDay, 22)}<b>${t(h.temp)}</b></div>`).join('')}</div>`;
    if (size === '4x2') {
      return `<div class="wd-row"><div>${head}</div><div class="wd-right">${S.icon(c.code, c.isDay, 22)}<div>${OS.esc(S.label(c.code))}</div><div class="wd-hl">Max ${t(d.daily[0].max)} Min ${t(d.daily[0].min)}</div></div></div>${hours(6)}`;
    }
    if (size === '4x6') {
      const lo = Math.min(...d.daily.map((x) => x.min)), hi = Math.max(...d.daily.map((x) => x.max)), span = Math.max(1, hi - lo);
      return `<div class="wd-row"><div>${head}</div><div class="wd-right">${S.icon(c.code, c.isDay, 26)}<div>${OS.esc(S.label(c.code))}</div><div class="wd-hl">Max ${t(d.daily[0].max)} Min ${t(d.daily[0].min)}</div></div></div>
        ${hours(6)}
        <div class="wd-days">${d.daily.slice(0, 7).map((x, i) => `<div class="wd-day"><span>${i === 0 ? 'Oggi' : OS.cap(OS.fmt.WEEKDAYS[x.date.getDay()].slice(0, 3))}</span>${S.icon(x.code, true, 20)}<em>${t(x.min)}</em><i><u style="left:${((x.min - lo) / span) * 100}%;width:${Math.max(8, ((x.max - x.min) / span) * 100)}%"></u></i><b>${t(x.max)}</b></div>`).join('')}</div>
        <div class="wd-foot">${OS.sym('drop', { size: 13 })} Umidità ${c.humidity}% · ${OS.sym('wind', { size: 13 })} ${c.wind} km/h</div>`;
    }
    return head + cond;
  }

  function weatherBg() {
    const S = OS.WeatherService;
    return S && S.data ? S.gradient(S.data.current.code, S.data.current.isDay) : 'linear-gradient(180deg,#2f7fe0,#5aa6f0)';
  }

  /* ---------------- calendar ---------------- */

  function calendarHTML(size) {
    const d = new Date();
    const C = OS.CalendarService;
    if (size === '4x6') {
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const offset = (first.getDay() + 6) % 7;
      const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < offset; i++) cells += '<span></span>';
      for (let i = 1; i <= days; i++) {
        const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(i)}`;
        const has = C && C.on(iso).length;
        cells += `<span class="${i === d.getDate() ? 'today' : ''} ${has ? 'has' : ''}">${i}</span>`;
      }
      const upcoming = [];
      if (C) {
        for (let k = 0; k < 14 && upcoming.length < 4; k++) {
          const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
          const iso = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
          C.on(iso).forEach((e) => { if (upcoming.length < 4) upcoming.push({ e, x, k }); });
        }
      }
      return `<div class="wd-day">${OS.esc(OS.fmt.month(d.getMonth()))} ${d.getFullYear()}</div>
        <div class="wd-month"><b>L</b><b>M</b><b>M</b><b>G</b><b>V</b><b>S</b><b>D</b>${cells}</div>
        <div class="wd-up">${upcoming.length ? upcoming.map(({ e, x, k }) => `<div class="wd-ev" style="--c:${e.color}"><b>${OS.esc(e.title)}</b><span>${k === 0 ? 'Oggi' : k === 1 ? 'Domani' : OS.fmt.weekday(x)} · ${e.start ? e.start + '–' + e.end : 'tutto il giorno'}</span></div>`).join('') : '<div class="wd-ev" style="--c:var(--gray)"><b>Nessun evento</b><span>nelle prossime due settimane</span></div>'}</div>`;
    }
    const ev = C ? C.nextToday() : null;
    return `<div class="wd-day">${OS.esc(OS.fmt.weekday(d))}</div>
      <div class="wd-num">${d.getDate()}</div>
      ${ev ? `<div class="wd-ev" style="--c:${ev.color}"><b>${OS.esc(ev.title)}</b><span>${OS.esc(ev.time)}</span></div>`
        : '<div class="wd-ev" style="--c:var(--gray)"><b>Nessun evento</b><span>oggi</span></div>'}`;
  }

  /* ---------------- music ---------------- */

  function musicHTML(size) {
    const M = OS.Audio.Music;
    const L = OS.MusicLibrary;
    const song = M.song || (L && L.songs[0]);
    if (!song) return '';
    const playing = M.playing;
    const ctrl = `<div class="wd-ctrl">
          <button data-act="prev" aria-label="Precedente">${OS.sym('backward', { size: 26 })}</button>
          <button data-act="toggle" aria-label="Riproduci/Pausa">${OS.sym(playing ? 'pause' : 'play', { size: 30 })}</button>
          <button data-act="next" aria-label="Successivo">${OS.sym('forward', { size: 26 })}</button>
        </div>`;
    if (size === '4x6') {
      const i = L.songs.indexOf(song);
      const next = [1, 2, 3].map((k) => L.songs[(i + k) % L.songs.length]);
      return `<div class="wd-label">${playing ? 'In riproduzione' : 'Ascoltato di recente'}</div>
        <div class="wd-art xl">${L.cover(song.album, 240)}</div>
        <div class="wd-title">${OS.esc(song.title)}</div><div class="wd-artist">${OS.esc(song.artist)}</div>
        <div class="wd-prog"><i style="width:${(M.position() / song.duration) * 100}%"></i></div>
        ${ctrl}
        <div class="wd-queue"><span>In coda</span>${next.map((s) => `<div><span class="wd-qa">${L.cover(s.album, 34)}</span><b>${OS.esc(s.title)}</b><small>${OS.esc(s.artist)}</small></div>`).join('')}</div>`;
    }
    return `<div class="wd-art">${L ? L.cover(song.album, 128) : ''}</div>
      <div class="wd-info">
        <div class="wd-label">${playing ? 'In riproduzione' : 'Ascoltato di recente'}</div>
        <div class="wd-title">${OS.esc(song.title)}</div>
        <div class="wd-artist">${OS.esc(song.artist)}</div>
        ${ctrl}
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

  /* ---------------- photos ---------------- */

  function featured() {
    const P = OS.PhotosService;
    if (!P) return null;
    const items = P.build().filter((p) => p.kind !== 'camera');
    if (!items.length) return null;
    const day = Math.floor(Date.now() / 86400000);
    return items[day % items.length];
  }

  function photosHTML(size) {
    const P = OS.PhotosService;
    const p = featured();
    if (!p) return '<div class="wd-ph-cap"><b>Foto</b></div>';
    const KIND = { sunset: 'Tramonti', mountains: 'Montagne', city: 'Città di notte', aurora: 'Aurore', dunes: 'Deserto', bokeh: 'Luci', forest: 'Natura', beach: 'Al mare' };
    const d = new Date(p.date);
    if (size === '4x6') {
      const more = P.build().filter((x) => x.kind === p.kind && x !== p).slice(0, 3);
      return `<div class="wd-ph-img" style="background-image:url('${P.src(p)}')"></div>
        <div class="wd-ph-cap xl"><span>RICORDI</span><b>${OS.esc(KIND[p.kind] || 'Ricordi')}</b><small>${d.getDate()} ${OS.fmt.MONTHS[d.getMonth()]} ${d.getFullYear()}</small>
        <div class="wd-ph-strip">${more.map((x) => `<i style="background-image:url('${P.thumb(x)}')"></i>`).join('')}</div></div>`;
    }
    return `<div class="wd-ph-img" style="background-image:url('${P.thumb(p)}')"></div><div class="wd-ph-cap"><b>${OS.esc(KIND[p.kind] || 'Ricordi')}</b><small>${OS.fmt.MONTHS[d.getMonth()]} ${d.getFullYear()}</small></div>`;
  }

  /* ---------------- clock / battery ---------------- */

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

  /* ---------------- rendering ---------------- */

  function inner(kind, size) {
    switch (kind) {
      case 'weather': return weatherHTML(size);
      case 'calendar': return calendarHTML(size);
      case 'music': return musicHTML(size);
      case 'photos': return photosHTML(size);
      case 'clock': return clockHTML();
      case 'battery': return batteryHTML();
      default: return '';
    }
  }

  function bg(kind) {
    if (kind === 'weather') return weatherBg();
    if (kind === 'music') return musicBg();
    return '';
  }

  function boxHTML(kind, size) {
    size = size || (KINDS[kind] ? KINDS[kind].sizes[0] : '2x2');
    const cls = { weather: 'wd-weather', calendar: 'wd-calendar', music: 'wd-music', photos: 'wd-photos', clock: 'wd-clock', battery: 'wd-battery glass' }[kind] || '';
    const b = bg(kind);
    return `<div class="widget-box ${cls} s${size}" data-kind="${kind}" data-size="${size}"${b ? ` style="background:${b}"` : ''}>${inner(kind, size)}</div>`;
  }

  function refresh(kind) {
    document.querySelectorAll(`.widget-box[data-kind${kind ? `="${kind}"` : ''}]`).forEach((el) => {
      const k = el.dataset.kind;
      if (k === 'clock') return; // hands tick on their own
      const b = bg(k);
      if (b) el.style.background = b;
      el.innerHTML = inner(k, el.dataset.size);
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
    OS.on('photos', () => refresh('photos'));
    OS.on('daychange', () => { refresh('calendar'); refresh('photos'); });
    setInterval(() => refresh('calendar'), 60000);
    // the extra-large music widget shows playback progress
    setInterval(() => {
      if (!OS.Audio.Music.playing) return;
      const s = OS.Audio.Music.song;
      document.querySelectorAll('.widget-box[data-kind="music"] .wd-prog i').forEach((i) => { i.style.width = (OS.Audio.Music.position() / s.duration) * 100 + '%'; });
    }, 1000);
  }

  OS.Widgets = { KINDS, SIZE_NAMES, boxHTML, refresh, handleTap, init };
})();
