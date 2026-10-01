/* ==========================================================================
   Meteo — live data from Open-Meteo (no API key), deterministic offline
   fallback, glass cards on condition-based gradients
   ========================================================================== */
(function () {
  'use strict';

  const CITIES = [
    { id: 'roma', name: 'Roma', lat: 41.9028, lon: 12.4964, base: 22 },
    { id: 'milano', name: 'Milano', lat: 45.4642, lon: 9.19, base: 18 },
    { id: 'napoli', name: 'Napoli', lat: 40.8518, lon: 14.2681, base: 23 },
    { id: 'firenze', name: 'Firenze', lat: 43.7696, lon: 11.2558, base: 21 },
  ];

  const LABELS = {
    0: 'Sereno', 1: 'Prevalentemente sereno', 2: 'Parzialmente nuvoloso', 3: 'Nuvoloso',
    45: 'Nebbia', 48: 'Nebbia', 51: 'Pioviggine', 53: 'Pioviggine', 55: 'Pioviggine',
    56: 'Pioviggine gelata', 57: 'Pioviggine gelata', 61: 'Pioggia leggera', 63: 'Pioggia', 65: 'Pioggia forte',
    66: 'Pioggia gelata', 67: 'Pioggia gelata', 71: 'Neve debole', 73: 'Neve', 75: 'Neve forte', 77: 'Nevischio',
    80: 'Rovesci', 81: 'Rovesci', 82: 'Rovesci forti', 85: 'Rovesci di neve', 86: 'Rovesci di neve',
    95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale con grandine',
  };

  function kind(code) {
    if (code === 0 || code === 1) return 'clear';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 80 && code <= 82) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloudy';
  }

  /* colored weather glyphs (24×24) */
  const SUN = '<circle cx="12" cy="12" r="4.6" fill="#ffd60a"/><g stroke="#ffd60a" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>';
  const MOON = '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" fill="#f2f2f7"/>';
  const CLOUD = (y, c) => `<path d="M7 ${18 + (y || 0)}a4.3 4.3 0 0 1-.5-8.6A5.8 5.8 0 0 1 17.6 10a4.1 4.1 0 0 1-.4 8.2z" fill="${c || '#fff'}"/>`;
  function icon(code, isDay, size) {
    const k = kind(code);
    const sz = size ? ` width="${size}" height="${size}"` : '';
    let b;
    switch (k) {
      case 'clear': b = isDay ? SUN : MOON; break;
      case 'partly': b = `<g transform="translate(-3 -3) scale(.8)">${isDay ? SUN : MOON}</g>` + CLOUD(1); break;
      case 'cloudy': b = `<g opacity=".7" transform="translate(4 -4) scale(.75)">${CLOUD(0, '#d1d1d6')}</g>` + CLOUD(0); break;
      case 'fog': b = CLOUD(-3) + '<g stroke="#e5e5ea" stroke-width="1.8" stroke-linecap="round"><path d="M5 19h14M7 22h10"/></g>'; break;
      case 'rain': b = CLOUD(-3) + '<g stroke="#64d2ff" stroke-width="1.9" stroke-linecap="round"><path d="M8 18.5l-1 3M12 18.5l-1 3M16 18.5l-1 3"/></g>'; break;
      case 'snow': b = CLOUD(-3) + '<g fill="#fff"><circle cx="8" cy="20" r="1.2"/><circle cx="12" cy="21.5" r="1.2"/><circle cx="16" cy="20" r="1.2"/></g>'; break;
      case 'storm': b = CLOUD(-3) + '<path d="M12.5 15.5 9.8 20h2.6l-1.2 3.5 3.6-5h-2.6l1.3-3z" fill="#ffd60a"/>'; break;
      default: b = CLOUD(0);
    }
    return `<svg viewBox="0 0 24 24"${sz} aria-hidden="true">${b}</svg>`;
  }

  function gradient(code, isDay) {
    const k = kind(code);
    if (!isDay) return k === 'clear' || k === 'partly' ? 'linear-gradient(180deg,#0b1026 0%,#1c2350 60%,#2b3470 100%)' : 'linear-gradient(180deg,#1a1d26 0%,#2c3140 100%)';
    switch (k) {
      case 'clear': return 'linear-gradient(180deg,#2f80e5 0%,#5ba7f2 55%,#8cc7f7 100%)';
      case 'partly': return 'linear-gradient(180deg,#4a83c8 0%,#7aa6d6 60%,#a6c3e2 100%)';
      case 'cloudy': return 'linear-gradient(180deg,#6b7c90 0%,#8d9cad 60%,#aab6c3 100%)';
      case 'fog': return 'linear-gradient(180deg,#8a939c 0%,#a9b0b7 100%)';
      case 'rain': return 'linear-gradient(180deg,#46576b 0%,#5f7186 60%,#7a8a9c 100%)';
      case 'snow': return 'linear-gradient(180deg,#7f93ab 0%,#a8b8cb 100%)';
      case 'storm': return 'linear-gradient(180deg,#2c3341 0%,#454d5e 100%)';
      default: return 'linear-gradient(180deg,#3d7bd0,#6ea3e0)';
    }
  }

  /* deterministic fallback so the app always has something to show */
  function mock(city) {
    const now = new Date();
    const r = OS.rng(city.id + now.toDateString());
    const codes = [0, 1, 2, 3, 61, 2, 1, 0, 80, 3];
    const curCode = codes[Math.floor(r() * 5)];
    const hour = now.getHours();
    // daily cycle: warmest around 15:00, coolest around 03:00
    const tempAt = (h, d) => city.base - 4 + 5 * Math.cos(((h - 15) / 24) * Math.PI * 2) + (d || 0);
    const hourly = Array.from({ length: 26 }, (_, i) => {
      const h = (hour + i) % 24;
      return { time: new Date(now.getTime() + i * 3600000), temp: tempAt(h, r() * 1.5), code: i < 6 ? curCode : codes[Math.floor(r() * codes.length)], isDay: h >= 7 && h < 19 };
    });
    const daily = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(now.getTime() + i * 86400000);
      const base = city.base - i * .2 + (r() * 4 - 2);
      return { date: d, min: base - 8 - r() * 2, max: base + r() * 2, code: i === 0 ? curCode : codes[Math.floor(r() * codes.length)], rain: Math.round(r() * 60) };
    });
    return {
      city: city.name,
      current: { temp: tempAt(hour, 0), feels: tempAt(hour, -1), code: curCode, isDay: hour >= 7 && hour < 19, humidity: 55 + Math.round(r() * 30), wind: 6 + Math.round(r() * 15), uv: hour >= 9 && hour < 17 ? 2 + Math.round(r() * 4) : 0, pressure: 1008 + Math.round(r() * 15), visibility: 10 + Math.round(r() * 15) },
      hourly, daily,
      sunrise: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 9),
      sunset: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 54),
      source: 'offline',
    };
  }

  function parse(city, j) {
    const now = Date.now();
    const hourly = [];
    for (let i = 0; i < j.hourly.time.length && hourly.length < 26; i++) {
      const t = new Date(j.hourly.time[i]);
      if (t.getTime() < now - 3600000) continue;
      hourly.push({ time: t, temp: j.hourly.temperature_2m[i], code: j.hourly.weather_code[i], isDay: !!j.hourly.is_day[i] });
    }
    const daily = j.daily.time.map((d, i) => ({
      date: new Date(d), min: j.daily.temperature_2m_min[i], max: j.daily.temperature_2m_max[i],
      code: j.daily.weather_code[i], rain: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : 0,
    }));
    const c = j.current;
    return {
      city: city.name,
      current: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, isDay: !!c.is_day, humidity: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), uv: Math.round(c.uv_index || 0), pressure: Math.round(c.pressure_msl), visibility: Math.round((c.visibility || 20000) / 1000) },
      hourly, daily,
      sunrise: new Date(j.daily.sunrise[0]),
      sunset: new Date(j.daily.sunset[0]),
      source: 'open-meteo',
    };
  }

  const Service = {
    cache: {},
    data: null,
    label: (code) => LABELS[code] || 'Variabile',
    icon,
    gradient,
    cities: CITIES,
    get(id) { return this.cache[id] || (this.cache[id] = mock(CITIES.find((c) => c.id === id) || CITIES[0])); },
    async fetch(city) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,uv_index,pressure_msl,visibility'
        + '&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max'
        + '&timezone=auto&forecast_days=10';
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = parse(city, await res.json());
        this.cache[city.id] = d;
        if (city.id === CITIES[0].id) { this.data = d; OS.emit('weather'); }
        OS.emit('weather:' + city.id);
        return d;
      } catch (e) {
        return this.get(city.id);
      }
    },
    refreshAll() { CITIES.forEach((c) => this.fetch(c)); },
  };
  Service.data = Service.get(CITIES[0].id);
  OS.WeatherService = Service;
  OS.onBoot(() => {
    OS.emit('weather');
    if (!OS.settings.airplane) Service.refreshAll();
    setInterval(() => { if (!OS.settings.airplane) Service.refreshAll(); }, 30 * 60000);
  });

  /* ---------------- App ---------------- */

  function pageHTML(d) {
    const c = d.current;
    const allMin = Math.min(...d.daily.map((x) => x.min));
    const allMax = Math.max(...d.daily.map((x) => x.max));
    const span = Math.max(1, allMax - allMin);
    const t = (v) => Math.round(v) + '°';
    const hm = (dt) => OS.fmt.time(dt);
    return `<div class="wx-scroll scroll">
      <div class="wx-hero">
        <div class="wx-city">${OS.esc(d.city)}</div>
        <div class="wx-temp">${t(c.temp)}</div>
        <div class="wx-cond">${OS.esc(Service.label(c.code))}</div>
        <div class="wx-hl">Max: ${t(d.daily[0].max)}  Min: ${t(d.daily[0].min)}</div>
      </div>
      <div class="wx-card glass">
        <div class="wx-card-text">${OS.esc(Service.label(c.code))} per il resto della giornata. Raffiche di vento fino a ${c.wind + 8} km/h.</div>
        <div class="wx-hours scroll-x">${d.hourly.slice(0, 24).map((h, i) => `<div class="wx-hour"><span>${i === 0 ? 'Ora' : OS.pad(h.time.getHours())}</span>${icon(h.code, h.isDay, 26)}<b>${t(h.temp)}</b></div>`).join('')}</div>
      </div>
      <div class="wx-card glass">
        <div class="wx-card-head">${OS.sym('calendar', { size: 14 })} PREVISIONI A 10 GIORNI</div>
        ${d.daily.map((x, i) => {
          const l = ((x.min - allMin) / span) * 100, w = ((x.max - x.min) / span) * 100;
          return `<div class="wx-day"><span class="wx-dname">${i === 0 ? 'Oggi' : OS.cap(OS.fmt.WEEKDAYS[x.date.getDay()].slice(0, 3))}</span>
            <span class="wx-dicon">${icon(x.code, true, 24)}${x.rain >= 30 ? `<small>${x.rain}%</small>` : ''}</span>
            <span class="wx-min">${t(x.min)}</span><span class="wx-bar"><i style="left:${l}%;width:${Math.max(6, w)}%"></i>${i === 0 ? `<b style="left:${((c.temp - allMin) / span) * 100}%"></b>` : ''}</span><span class="wx-max">${t(x.max)}</span></div>`;
        }).join('')}
      </div>
      <div class="wx-tiles">
        ${tile('sun', 'INDICE UV', String(c.uv), c.uv < 3 ? 'Basso' : c.uv < 6 ? 'Moderato' : 'Alto', 'Usa la protezione solare dalle 11 alle 16.')}
        ${tile('sunrise', 'TRAMONTO', hm(d.sunset), '', 'Alba: ' + hm(d.sunrise))}
        ${tile('wind', 'VENTO', c.wind + ' km/h', '', 'Raffiche fino a ' + (c.wind + 8) + ' km/h')}
        ${tile('drop', 'UMIDITÀ', c.humidity + '%', '', 'Il punto di rugiada è ' + Math.round(c.temp - (100 - c.humidity) / 5) + '° ora.')}
        ${tile('thermometer', 'PERCEPITA', t(c.feels), '', c.feels < c.temp ? 'Il vento la fa percepire più fredda.' : 'Simile alla temperatura reale.')}
        ${tile('gauge', 'PRESSIONE', c.pressure + ' hPa', '', '')}
        ${tile('eye', 'VISIBILITÀ', c.visibility + ' km', '', 'Visibilità perfetta.')}
        ${tile('aqi', 'QUALITÀ ARIA', '32', 'Buona', 'Qualità dell\'aria simile a ieri.')}
      </div>
      <div class="wx-source">${d.source === 'open-meteo' ? 'Dati meteo: Open-Meteo.com' : 'Dati dimostrativi (offline)'}</div>
    </div>`;
  }

  function tile(ic, label, value, sub, foot) {
    return `<div class="wx-tile glass"><div class="wx-card-head">${OS.sym(ic, { size: 14 })} ${label}</div><div class="wx-tval">${OS.esc(value)}</div>${sub ? `<div class="wx-tsub">${OS.esc(sub)}</div>` : ''}<div class="wx-tfoot">${OS.esc(foot)}</div></div>`;
  }

  OS.registerApp({
    id: 'weather',
    name: 'Meteo',
    dark: true,
    statusBar: 'light',
    background: '#2f80e5',
    keywords: 'meteo tempo previsioni pioggia',
    mount(root) {
      root.innerHTML = `<div class="wx-app">
        <div class="wx-bg"></div>
        <div class="wx-fx"></div>
        <div class="wx-pages scroll-x"></div>
        <div class="toolbar wx-toolbar">
          <button class="gbtn glass" data-a="map" aria-label="Mappa">${OS.sym('map')}</button>
          <div class="wx-dots glass"></div>
          <button class="gbtn glass" data-a="list" aria-label="Città">${OS.sym('list')}</button>
        </div>
      </div>`;
      const pagesEl = root.querySelector('.wx-pages');
      const bg = root.querySelector('.wx-bg');
      const fx = root.querySelector('.wx-fx');
      const dots = root.querySelector('.wx-dots');
      let idx = 0;

      function renderAll() {
        pagesEl.innerHTML = CITIES.map((c) => `<section class="wx-page" data-city="${c.id}">${pageHTML(Service.get(c.id))}</section>`).join('');
        dots.innerHTML = CITIES.map((_, i) => `<i class="${i === idx ? 'on' : ''}">${i === 0 ? OS.sym('location', { size: 9 }) : ''}</i>`).join('');
        paintBg();
      }

      function paintBg() {
        const d = Service.get(CITIES[idx].id);
        bg.style.background = gradient(d.current.code, d.current.isDay);
        const k = kind(d.current.code);
        fx.className = 'wx-fx ' + k + (d.current.isDay ? ' day' : ' night');
        dots.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i === idx));
      }

      pagesEl.addEventListener('scroll', () => {
        const i = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth);
        if (i !== idx && i >= 0 && i < CITIES.length) { idx = i; paintBg(); }
      }, { passive: true });

      // mouse drag paging on desktop
      let drag = null;
      pagesEl.addEventListener('mousedown', (e) => { drag = { x: e.clientX, left: pagesEl.scrollLeft, moved: false }; pagesEl.style.scrollSnapType = 'none'; });
      const mm = (e) => { if (!drag) return; const dx = (e.clientX - drag.x) / OS.state.scale; if (Math.abs(dx) > 4) drag.moved = true; pagesEl.scrollLeft = drag.left - dx; };
      const mu = () => {
        if (!drag) return;
        const target = Math.round(pagesEl.scrollLeft / pagesEl.clientWidth + (pagesEl.scrollLeft > drag.left ? .3 : pagesEl.scrollLeft < drag.left ? -.3 : 0));
        drag = null;
        pagesEl.scrollTo({ left: OS.clamp(target, 0, CITIES.length - 1) * pagesEl.clientWidth, behavior: 'smooth' });
        setTimeout(() => { pagesEl.style.scrollSnapType = ''; }, 450);
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);

      root.querySelector('[data-a="list"]').addEventListener('click', () => {
        OS.UI.sheet(root, {
          title: 'Meteo', large: true, left: { icon: 'xmark', label: 'Chiudi' },
          render(body, api) {
            body.classList.add('surface-dark');
            body.innerHTML = CITIES.map((c, i) => {
              const d = Service.get(c.id);
              return `<button class="wx-citycard" data-i="${i}" style="background:${gradient(d.current.code, d.current.isDay)}">
                <div><b>${OS.esc(c.name)}</b><span>${OS.fmt.time()}</span><small>${OS.esc(Service.label(d.current.code))}</small></div>
                <div style="text-align:right"><em>${Math.round(d.current.temp)}°</em><small>Max: ${Math.round(d.daily[0].max)}° Min: ${Math.round(d.daily[0].min)}°</small></div></button>`;
            }).join('');
            body.addEventListener('click', (e) => {
              const b = e.target.closest('[data-i]');
              if (!b) return;
              idx = +b.dataset.i;
              pagesEl.scrollTo({ left: idx * pagesEl.clientWidth });
              paintBg();
              api.close();
            });
          },
        });
      });
      root.querySelector('[data-a="map"]').addEventListener('click', () => OS.Apps.open('maps', { data: { query: CITIES[idx].name } }));

      const offs = CITIES.map((c) => OS.on('weather:' + c.id, () => {
        const sec = pagesEl.querySelector(`[data-city="${c.id}"]`);
        if (sec) sec.innerHTML = pageHTML(Service.get(c.id));
        paintBg();
      }));
      renderAll();
      return {
        onShow() { if (!OS.settings.airplane) Service.refreshAll(); },
        onDestroy() { offs.forEach((f) => f()); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); },
      };
    },
  });
})();
