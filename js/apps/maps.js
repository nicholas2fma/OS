/* ==========================================================================
   Mappe — OpenStreetMap embed, Nominatim search, glass bottom sheet
   ========================================================================== */
(function () {
  'use strict';

  const PLACES = [
    { name: 'Colosseo', sub: 'Roma', lat: 41.8902, lon: 12.4922, icon: 'star-fill', color: '#ff9f0a' },
    { name: 'Duomo di Milano', sub: 'Milano', lat: 45.4641, lon: 9.1919, icon: 'star-fill', color: '#ff9f0a' },
    { name: 'Ponte Vecchio', sub: 'Firenze', lat: 43.768, lon: 11.2531, icon: 'star-fill', color: '#ff9f0a' },
    { name: 'Piazza San Marco', sub: 'Venezia', lat: 45.4341, lon: 12.3388, icon: 'star-fill', color: '#ff9f0a' },
  ];
  const LAYERS = [['mapnik', 'Esplora'], ['cyclemap', 'Ciclismo'], ['transportmap', 'Trasporti'], ['hot', 'Umanitaria']];

  OS.registerApp({
    id: 'maps',
    name: 'Mappe',
    keywords: 'mappe mappa indicazioni luoghi navigazione',
    background: '#e8e4d8',
    quickActions: [{ label: 'Cerca un luogo', icon: 'search', data: { focus: true } }],
    mount(root) {
      let center = { lat: 41.8986, lon: 12.4769 };
      let span = .03;
      let layer = 'mapnik';
      let marker = null;

      root.innerHTML = `<div class="mp-app">
        <iframe class="mp-map" title="Mappa" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin"></iframe>
        <div class="mp-shield"></div>
        <div class="mp-ctrls"><div class="gbtn-group glass mp-col"><button class="gbtn" data-a="layer" aria-label="Tipo di mappa">${OS.sym('map')}</button><button class="gbtn" data-a="locate" aria-label="Posizione">${OS.sym('location-outline')}</button></div>
          <div class="gbtn-group glass mp-col"><button class="gbtn" data-a="in" aria-label="Ingrandisci">${OS.sym('plus')}</button><button class="gbtn" data-a="out" aria-label="Riduci">${OS.sym('minus')}</button></div></div>
        <div class="mp-sheet glass">
          <div class="sheet-grabber"></div>
          <div class="mp-search">${OS.sym('search', { size: 18 })}<input type="search" placeholder="Cerca in Mappe" enterkeyhint="search"><button class="mp-mic">${OS.sym('mic', { size: 18 })}</button></div>
          <div class="mp-results"></div>
        </div>
      </div>`;
      const frame = root.querySelector('iframe');
      const sheet = root.querySelector('.mp-sheet');
      const input = root.querySelector('.mp-search input');
      const results = root.querySelector('.mp-results');

      function update() {
        const bbox = [center.lon - span, center.lat - span * .75, center.lon + span, center.lat + span * .75].map((v) => v.toFixed(5)).join(',');
        frame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=${layer}${marker ? `&marker=${marker.lat},${marker.lon}` : ''}`;
      }

      function suggestions() {
        results.innerHTML = `<div class="mp-h">Luoghi</div><div class="mp-places">
            <button data-place="home"><span style="background:var(--blue)">${OS.sym('house', { size: 20 })}</span><b>Casa</b><small>Aggiungi</small></button>
            <button data-place="work"><span style="background:#8e6e4e">${OS.sym('bag', { size: 20 })}</span><b>Lavoro</b><small>Aggiungi</small></button>
            <button data-place="food"><span style="background:var(--orange)">${OS.sym('fork-knife', { size: 20 })}</span><b>Ristoranti</b><small>Vicino</small></button>
            <button data-place="fuel"><span style="background:var(--teal)">${OS.sym('fuel', { size: 20 })}</span><b>Benzina</b><small>Vicino</small></button></div>
          <div class="mp-h">Recenti</div><div class="mp-list">${PLACES.map((p, i) => `<button class="mp-row" data-i="${i}"><span style="background:${p.color}">${OS.sym(p.icon, { size: 16 })}</span><div><b>${OS.esc(p.name)}</b><small>${OS.esc(p.sub)}</small></div></button>`).join('')}</div>`;
      }

      async function search(q) {
        results.innerHTML = '<div class="mp-h" style="display:flex;gap:8px;align-items:center">Ricerca… <span class="spinner" style="width:14px;height:14px;border-width:2px"></span></div>';
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=it&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
          const list = await res.json();
          if (!list.length) { results.innerHTML = '<div class="mp-h">Nessun risultato</div>'; return; }
          results.innerHTML = `<div class="mp-list">${list.map((r, i) => `<button class="mp-row" data-r="${i}" data-lat="${r.lat}" data-lon="${r.lon}"><span style="background:var(--red)">${OS.sym('location', { size: 14 })}</span><div><b>${OS.esc(r.display_name.split(',')[0])}</b><small>${OS.esc(r.display_name.split(',').slice(1, 3).join(','))}</small></div></button>`).join('')}</div>`;
        } catch (e) {
          const local = PLACES.filter((p) => (p.name + ' ' + p.sub).toLowerCase().includes(q.toLowerCase()));
          results.innerHTML = local.length ? `<div class="mp-list">${local.map((p) => `<button class="mp-row" data-lat="${p.lat}" data-lon="${p.lon}"><span style="background:${p.color}">${OS.sym(p.icon, { size: 16 })}</span><div><b>${OS.esc(p.name)}</b><small>${OS.esc(p.sub)}</small></div></button>`).join('')}</div>`
            : '<div class="mp-h">Ricerca non disponibile offline</div>';
        }
      }

      function goTo(lat, lon) {
        center = { lat: +lat, lon: +lon };
        marker = { lat: +lat, lon: +lon };
        span = .012;
        update();
        sheet.classList.remove('tall');
        input.blur();
      }

      input.addEventListener('focus', () => sheet.classList.add('tall'));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && input.value.trim()) search(input.value.trim());
      });
      input.addEventListener('input', () => { if (!input.value.trim()) suggestions(); });

      root.querySelector('.mp-app').addEventListener('click', (e) => {
        const row = e.target.closest('.mp-row');
        if (row) {
          if (row.dataset.lat) goTo(row.dataset.lat, row.dataset.lon);
          else { const p = PLACES[+row.dataset.i]; goTo(p.lat, p.lon); }
          return;
        }
        const pl = e.target.closest('[data-place]');
        if (pl) { if (pl.dataset.place === 'food' || pl.dataset.place === 'fuel') { input.value = pl.dataset.place === 'food' ? 'ristorante Roma' : 'distributore Roma'; search(input.value); } return; }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'in') { span = Math.max(.002, span / 2); update(); }
        if (a.dataset.a === 'out') { span = Math.min(8, span * 2); update(); }
        if (a.dataset.a === 'layer') {
          OS.UI.menu(a, LAYERS.map(([id, label]) => ({ label: (id === layer ? '✓ ' : '') + label, onTap: () => { layer = id; update(); } })), { preview: false });
        }
        if (a.dataset.a === 'locate') {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition((pos) => goTo(pos.coords.latitude, pos.coords.longitude), () => {
            OS.Island.flash({ left: OS.sym('location', { size: 16 }), right: '<span>Posizione non disponibile</span>', width: 260 });
          }, { timeout: 8000 });
        }
      });

      // drag sheet up/down
      let d = null;
      sheet.querySelector('.sheet-grabber').addEventListener('pointerdown', (e) => { d = OS.point(e).y; });
      window.addEventListener('pointerup', (e) => {
        if (d == null) return;
        const dy = OS.point(e).y - d;
        d = null;
        if (dy < -30) sheet.classList.add('tall');
        else if (dy > 30) { sheet.classList.remove('tall'); input.blur(); }
        else sheet.classList.toggle('tall');
      });

      suggestions();
      update();
      return {
        onShow(data) {
          if (data && data.query) { input.value = data.query; search(data.query); sheet.classList.add('tall'); }
          if (data && data.focus) setTimeout(() => input.focus(), 500);
        },
      };
    },
  });
})();
