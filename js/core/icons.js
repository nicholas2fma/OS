/* ==========================================================================
   App icons — original vector artwork (100×100), rendered as live DOM
   Primary glyph parts use var(--p) and ink parts var(--ink) so the
   Dark / Clear / Tinted icon styles can recolour them via CSS.
   ========================================================================== */
(function () {
  'use strict';

  const P = 'style="fill:var(--p)"';
  const INK = 'style="fill:var(--ink)"';

  function ticks(n, r1, r2, color, width, every, r1Long) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const long = every && i % every === 0;
      const ra = long && r1Long ? r1Long : r1;
      const x1 = 50 + Math.sin(a) * ra, y1 = 50 - Math.cos(a) * ra;
      const x2 = 50 + Math.sin(a) * r2, y2 = 50 - Math.cos(a) * r2;
      s += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${long ? width * 1.6 : width}" stroke-linecap="round"/>`;
    }
    return s;
  }

  function gearPath(cx, cy, teeth, rOut, rRoot) {
    const pts = [];
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const w = step * 0.25;
      pts.push([a - step / 2 + w * .3, rRoot]);
      pts.push([a - w, rOut]);
      pts.push([a + w, rOut]);
      pts.push([a + step / 2 - w * .3, rRoot]);
    }
    return 'M' + pts.map(([a, r]) => (cx + Math.sin(a) * r).toFixed(2) + ' ' + (cy - Math.cos(a) * r).toFixed(2)).join('L') + 'Z';
  }

  function clockHands(d) {
    d = d || new Date();
    const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    return { h: h * 30, m: m * 6, s: s * 6 };
  }

  const ICONS = {
    phone: {
      bg: 'linear-gradient(180deg,#6ef08a 0%,#22c147 100%)', tint: '#30d158',
      glyph: () => `<g transform="translate(21 21) scale(2.42)"><path ${P} d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></g>`,
    },
    messages: {
      bg: 'linear-gradient(180deg,#6ef08a 0%,#22c147 100%)', tint: '#30d158',
      glyph: () => `<ellipse cx="50" cy="47" rx="31" ry="26" ${P}/><path ${P} d="M28 62c-1 7-5 12-10 15 9 .5 17-2.5 23-8z"/>`,
    },
    music: {
      bg: 'linear-gradient(180deg,#ff6b86 0%,#fa2d48 100%)', tint: '#ff375f',
      glyph: () => `<g transform="translate(12 15) scale(3.1)"><path ${P} d="M20 3v12.5a3 3 0 1 1-1.6-2.6V7.1L9.6 9V18a3 3 0 1 1-1.6-2.6V5.6c0-.5.3-.9.8-1L19 2.1a.8.8 0 0 1 1 .9z"/></g>`,
    },
    safari: {
      bg: 'linear-gradient(180deg,#ffffff 0%,#e3e3e8 100%)', tint: '#0a84ff',
      glyph: () => `<circle cx="50" cy="50" r="38" fill="#1877f2"/><circle cx="50" cy="50" r="35" fill="#2e98ff"/>${ticks(48, 29, 33, 'rgba(255,255,255,.85)', 1, 4, 27)}<g transform="rotate(45 50 50)"><path d="M50 20 55.5 50h-11z" fill="#ff3b30"/><path d="M50 80 55.5 50h-11z" fill="#fff"/></g><circle cx="50" cy="50" r="2.4" fill="#1877f2"/>`,
    },
    calculator: {
      bg: 'linear-gradient(180deg,#2c2c2e 0%,#0b0b0c 100%)', tint: '#ff9f0a',
      glyph: () => `<rect x="15" y="15" width="32" height="32" rx="16" fill="#5b5b60"/><rect x="53" y="15" width="32" height="32" rx="16" fill="#5b5b60"/><rect x="15" y="53" width="32" height="32" rx="16" fill="#5b5b60"/><rect x="53" y="53" width="32" height="32" rx="16" fill="#ff9f0a"/>
        <rect x="23.5" y="29.3" width="15" height="3.4" rx="1.7" ${P}/>
        <rect x="61.5" y="29.3" width="15" height="3.4" rx="1.7" ${P}/><rect x="67.3" y="23.5" width="3.4" height="15" rx="1.7" ${P}/>
        <g transform="rotate(45 31 69)"><rect x="23.5" y="67.3" width="15" height="3.4" rx="1.7" ${P}/><rect x="29.3" y="61.5" width="3.4" height="15" rx="1.7" ${P}/></g>
        <rect x="61.5" y="63.5" width="15" height="3.4" rx="1.7" fill="#fff"/><rect x="61.5" y="71" width="15" height="3.4" rx="1.7" fill="#fff"/>`,
    },
    clock: {
      bg: 'linear-gradient(180deg,#1c1c1e 0%,#000 100%)', tint: '#ff9f0a', live: 'clock',
      glyph: () => {
        const a = clockHands();
        return `<circle cx="50" cy="50" r="41" fill="#fff"/>${ticks(60, 36, 39, '#c7c7cc', .8, 5, 33)}
          <g class="ck-h" transform="rotate(${a.h} 50 50)"><rect x="47.8" y="27" width="4.4" height="26" rx="2.2" fill="#111"/></g>
          <g class="ck-m" transform="rotate(${a.m} 50 50)"><rect x="48.4" y="15" width="3.2" height="38" rx="1.6" fill="#111"/></g>
          <g class="ck-s" transform="rotate(${a.s} 50 50)"><rect x="49.4" y="14" width="1.2" height="44" fill="#ff9500"/><circle cx="50" cy="50" r="2.8" fill="#ff9500"/></g>
          <circle cx="50" cy="50" r="1.1" fill="#fff"/>`;
      },
    },
    weather: {
      bg: 'linear-gradient(180deg,#5cb6ff 0%,#1a6be3 100%)', tint: '#64d2ff',
      glyph: () => `<circle cx="38" cy="40" r="15" fill="#ffd60a"/><g ${P}><circle cx="45" cy="62" r="12"/><circle cx="60" cy="54" r="15.5"/><circle cx="73" cy="63" r="10"/><rect x="34" y="60" width="47" height="14" rx="7"/></g>`,
    },
    notes: {
      bg: 'linear-gradient(180deg,#ffffff 0%,#f2f2f4 100%)', tint: '#ffd60a',
      glyph: () => `<rect width="100" height="27" fill="#ffd60a"/><rect y="27" width="100" height="2" fill="rgba(0,0,0,.06)"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<circle cx="${9 + i * 8.2}" cy="35" r="1.3" fill="#c7c7cc"/>`).join('')}<g fill="#d1d1d6"><rect x="12" y="48" width="76" height="2.4" rx="1.2"/><rect x="12" y="62" width="76" height="2.4" rx="1.2"/><rect x="12" y="76" width="76" height="2.4" rx="1.2"/><rect x="12" y="90" width="50" height="2.4" rx="1.2"/></g>`,
    },
    reminders: {
      bg: 'linear-gradient(180deg,#ffffff 0%,#f2f2f4 100%)', tint: '#ff9f0a',
      glyph: () => [['#007aff', 28], ['#ff3b30', 50], ['#ff9500', 72]].map(([c, y]) =>
        `<circle cx="25" cy="${y}" r="7.5" fill="${c}"/><circle cx="25" cy="${y}" r="5.2" fill="none" stroke="#fff" stroke-width="1.6"/><rect x="40" y="${y - 2}" width="44" height="4" rx="2" fill="#d1d1d6"/>`).join(''),
    },
    calendar: {
      bg: 'linear-gradient(180deg,#ffffff 0%,#f2f2f4 100%)', tint: '#ff453a', live: 'calendar',
      glyph: () => {
        const d = new Date();
        return `<text x="50" y="30" text-anchor="middle" font-family="-apple-system,Inter,system-ui,sans-serif" font-size="13.5" font-weight="600" fill="#ff3b30">${OS.fmt.WEEKDAYS[d.getDay()]}</text>
          <text x="50" y="80" text-anchor="middle" font-family="-apple-system,Inter,system-ui,sans-serif" font-size="56" font-weight="300" letter-spacing="-2" ${INK}>${d.getDate()}</text>`;
      },
    },
    photos: {
      bg: 'linear-gradient(180deg,#ffffff 0%,#f2f2f4 100%)', tint: '#ffd60a',
      glyph: () => ['#ff9500', '#ffcc00', '#a6dd4f', '#34c759', '#5ac8fa', '#007aff', '#af52de', '#ff2d55'].map((c, i) =>
        `<ellipse cx="50" cy="30.5" rx="10.5" ry="19" fill="${c}" opacity=".82" transform="rotate(${i * 45} 50 50)" style="mix-blend-mode:multiply"/>`).join(''),
    },
    camera: {
      bg: 'linear-gradient(180deg,#ececf0 0%,#9fa0a6 100%)', tint: '#e5e5ea',
      glyph: () => `<rect x="36" y="25" width="28" height="12" rx="4" fill="#2c2c2e"/><rect x="13" y="32" width="74" height="46" rx="10" fill="#2c2c2e"/><circle cx="50" cy="55" r="16.5" fill="#8e8e93"/><circle cx="50" cy="55" r="13" fill="#141416"/><circle cx="50" cy="55" r="7" fill="#232327"/><circle cx="45" cy="50" r="3" fill="#5a5a60"/><circle cx="75" cy="40" r="2.6" fill="#ffd60a"/>`,
    },
    settings: {
      bg: 'linear-gradient(180deg,#c4c4ca 0%,#86868c 100%)', tint: '#aeaeb2',
      glyph: () => `<path d="${gearPath(50, 50, 14, 41, 34)}" fill="#3a3a3c"/><circle cx="50" cy="50" r="29" fill="#a2a2a8"/><path d="${gearPath(50, 50, 8, 23, 16)}" fill="#3a3a3c"/><circle cx="50" cy="50" r="8.5" fill="#a2a2a8"/><circle cx="50" cy="50" r="4" fill="#3a3a3c"/>`,
    },
    maps: {
      bg: 'linear-gradient(135deg,#92d77b 0%,#d9f0c4 100%)', tint: '#30d158',
      glyph: () => `<path d="M56 0h44v50C84 42 66 26 56 0z" fill="#79cdff"/><path d="M-5 76 105 30" stroke="#fff" stroke-width="11"/><path d="M27 106 63-6" stroke="#ffd60a" stroke-width="9"/><path d="M27 106 63-6" stroke="#eaa500" stroke-width="1" stroke-dasharray="4 4"/><circle cx="58" cy="60" r="12" fill="#fff"/><path d="m58 51.5 7.5 15.5-7.5-3.6-7.5 3.6z" fill="#007aff"/>`,
    },
    compass: {
      bg: 'linear-gradient(180deg,#2a2a2c 0%,#000 100%)', tint: '#ff453a',
      glyph: () => `${ticks(72, 34, 39, 'rgba(255,255,255,.85)', .8, 6, 31)}<path d="M50 20 56 50H44z" fill="#ff3b30"/><path d="M50 80 56 50H44z" ${P}/><circle cx="50" cy="50" r="3" fill="#1c1c1e"/>`,
    },
  };

  function render(id, cls) {
    const ic = ICONS[id];
    if (!ic) return `<div class="app-icon ${cls || ''}"></div>`;
    return `<div class="app-icon ${cls || ''}" data-icon="${id}" style="--ic-bg:${ic.bg};--ic-tint:${ic.tint}"><svg viewBox="0 0 100 100" aria-hidden="true">${ic.glyph()}</svg></div>`;
  }

  function glyph(id) {
    const ic = ICONS[id];
    return ic ? `<svg viewBox="0 0 100 100" aria-hidden="true">${ic.glyph()}</svg>` : '';
  }

  /* Live icons: clock hands tick, calendar date rolls over */
  let lastDay = new Date().getDate();
  function tickLive() {
    const a = clockHands();
    document.querySelectorAll('.app-icon[data-icon="clock"], .live-clock').forEach((el) => {
      const h = el.querySelector('.ck-h'), m = el.querySelector('.ck-m'), s = el.querySelector('.ck-s');
      if (h) h.setAttribute('transform', `rotate(${a.h} 50 50)`);
      if (m) m.setAttribute('transform', `rotate(${a.m} 50 50)`);
      if (s) s.setAttribute('transform', `rotate(${a.s} 50 50)`);
    });
    const day = new Date().getDate();
    if (day !== lastDay) {
      lastDay = day;
      document.querySelectorAll('.app-icon[data-icon="calendar"] svg').forEach((svg) => { svg.innerHTML = ICONS.calendar.glyph(); });
      OS.emit('daychange');
    }
  }

  OS.Icons = { render, glyph, defs: ICONS, tickLive, clockHands, ticks };
  OS.icon = render;
})();
