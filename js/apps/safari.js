/* ==========================================================================
   Safari — start page, favourites, compact glass address bar, iframe browsing
   ========================================================================== */
(function () {
  'use strict';

  const FAVORITES = [
    { name: 'Wikipedia', url: 'https://it.m.wikipedia.org/wiki/Pagina_principale', color: '#f2f2f2', fg: '#000', letter: 'W' },
    { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/export/embed.html?bbox=12.43,41.87,12.53,41.92&layer=mapnik', color: '#7ebc6f', fg: '#fff', letter: 'O' },
    { name: 'Example', url: 'https://example.com/', color: '#5e5ce6', fg: '#fff', letter: 'E' },
    { name: 'Info', url: 'about:ios26', color: 'linear-gradient(135deg,#5ac8fa,#007aff)', fg: '#fff', letter: '26' },
  ];

  const ABOUT = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:-apple-system,Inter,system-ui,sans-serif;margin:0;padding:72px 22px 140px;line-height:1.5;color:#1d1d1f;background:linear-gradient(180deg,#eef4ff,#fff)}
    h1{font-size:34px;letter-spacing:-.02em;margin:0 0 8px}h2{font-size:20px;margin:28px 0 6px}p,li{color:#424245}code{background:#e8e8ed;padding:1px 6px;border-radius:6px}
    .card{background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.06);border-radius:22px;padding:16px 18px;margin:14px 0;box-shadow:0 8px 24px rgba(0,0,0,.06)}
    @media (prefers-color-scheme:dark){body{background:linear-gradient(180deg,#10131c,#000);color:#f5f5f7}p,li{color:#a1a1a6}.card{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.08)}code{background:#2c2c2e}}</style></head>
    <body><h1>iOS 26 Web</h1><p>Una ricreazione dell'interfaccia di iOS 26 costruita interamente con HTML, CSS e JavaScript, senza librerie.</p>
    <div class="card"><b>Liquid Glass</b><p>Il materiale di vetro usa <code>backdrop-filter</code> con sfocatura e saturazione, un bordo speculare e, nei browser Chromium, un filtro SVG di spostamento che rifrange lo sfondo ai bordi.</p></div>
    <div class="card"><b>Cosa provare</b><ul><li>Dynamic Island: avvia un timer o un brano</li><li>Multitasking: scorri in alto dalla barra e fermati</li><li>Modifica Home: tieni premuta un'icona</li><li>Stili icone: Impostazioni › Schermata Home</li></ul></div>
    <h2>Perché il web e non Godot?</h2><p>Un'interfaccia come iOS è fatta di testo, liste, scorrimento e materiali traslucidi: il browser li offre in modo nativo (tipografia, accessibilità, sfocature hardware), gira ovunque, anche su un vero telefono, senza installare nulla.</p></body></html>`;

  function normalize(input) {
    const q = input.trim();
    if (!q) return null;
    if (q === 'about:ios26') return q;
    if (/^https?:\/\//i.test(q)) return q;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(q)) return 'https://' + q;
    return 'https://it.m.wikipedia.org/w/index.php?search=' + encodeURIComponent(q);
  }

  const host = (url) => {
    if (url === 'about:ios26') return 'iOS 26 Web';
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  };

  OS.registerApp({
    id: 'safari',
    name: 'Safari',
    keywords: 'safari browser web internet',
    quickActions: [{ label: 'Nuovo pannello', icon: 'plus', data: { home: true } }],
    mount(root) {
      root.innerHTML = `<div class="sf-app">
        <div class="sf-start scroll">
          <h1 class="large-title" style="padding:70px 22px 6px">Pagina iniziale</h1>
          <div class="section-head big" style="padding:16px 22px 10px">Preferiti</div>
          <div class="sf-favs">${FAVORITES.map((f, i) => `<button class="sf-fav" data-fav="${i}"><span style="background:${f.color};color:${f.fg}">${f.letter}</span><small>${f.name}</small></button>`).join('')}</div>
          <div class="section-head big" style="padding:24px 22px 10px">Rapporto sulla privacy</div>
          <div class="sf-privacy"><span>${OS.sym('hand', { size: 22 })}</span><div><b>Nelle ultime quattro settimane Safari ha impedito a 27 tracker di profilarti.</b></div></div>
          <div class="section-head big" style="padding:24px 22px 10px">Lista di lettura</div>
          <div class="sf-reading">${OS.sym('book', { size: 30 })}<span>Salva pagine da leggere dopo, anche offline.</span></div>
        </div>
        <div class="sf-web"><iframe title="Pagina web" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe><div class="sf-hint"></div></div>
        <div class="sf-progress"></div>
        <div class="sf-edge"></div>
        <div class="toolbar sf-bar">
          <button class="gbtn glass" data-a="back" aria-label="Indietro">${OS.sym('chevron-left', { stroke: 2.4 })}</button>
          <div class="sf-address glass"><span class="sf-host">${OS.sym('search', { size: 15 })} Cerca o inserisci sito</span><input type="url" enterkeyhint="go" placeholder="Cerca o inserisci sito" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="sf-reload" data-a="reload" aria-label="Ricarica">${OS.sym('arrow-clockwise', { size: 16, stroke: 2.4 })}</button></div>
          <button class="gbtn glass" data-a="tabs" aria-label="Pannelli">${OS.sym('ellipsis')}</button>
        </div>
      </div>`;

      const start = root.querySelector('.sf-start');
      const web = root.querySelector('.sf-web');
      const frame = root.querySelector('iframe');
      const hint = root.querySelector('.sf-hint');
      const address = root.querySelector('.sf-address');
      const input = address.querySelector('input');
      const hostEl = address.querySelector('.sf-host');
      const progress = root.querySelector('.sf-progress');
      const history = [];
      let current = null;
      let hintT = null;

      function go(url, push) {
        if (!url) return;
        if (push !== false) history.push(url);
        current = url;
        start.style.display = 'none';
        web.style.display = 'block';
        hostEl.innerHTML = (url.startsWith('https') || url === 'about:ios26' ? OS.sym('lock-fill', { size: 12 }) + ' ' : '') + OS.esc(host(url));
        progress.classList.remove('done');
        void progress.offsetWidth;
        progress.classList.add('loading');
        if (url === 'about:ios26') { frame.removeAttribute('src'); frame.srcdoc = ABOUT; }
        else { frame.removeAttribute('srcdoc'); frame.src = url; }
        clearTimeout(hintT);
        hint.classList.remove('show');
        if (url !== 'about:ios26') {
          hintT = setTimeout(() => {
            hint.innerHTML = `Se la pagina resta vuota, il sito non consente di essere incorporato. <a href="${OS.esc(url)}" target="_blank" rel="noopener">Apri in una nuova scheda</a>`;
            hint.classList.add('show');
          }, 4000);
        }
      }

      function home() {
        current = null;
        frame.removeAttribute('src');
        frame.removeAttribute('srcdoc');
        web.style.display = 'none';
        start.style.display = '';
        hostEl.innerHTML = OS.sym('search', { size: 15 }) + ' Cerca o inserisci sito';
        progress.classList.remove('loading', 'done');
      }

      frame.addEventListener('load', () => {
        progress.classList.remove('loading');
        progress.classList.add('done');
      });

      address.addEventListener('click', (e) => {
        if (e.target.closest('[data-a="reload"]')) { if (current) go(current, false); return; }
        address.classList.add('editing');
        input.value = current && current !== 'about:ios26' ? current : '';
        input.focus();
        input.select();
      });
      input.addEventListener('blur', () => setTimeout(() => address.classList.remove('editing'), 100));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const u = normalize(input.value); input.blur(); if (u) go(u); }
        if (e.key === 'Escape') input.blur();
      });

      root.querySelector('.sf-app').addEventListener('click', (e) => {
        const f = e.target.closest('[data-fav]');
        if (f) { go(FAVORITES[+f.dataset.fav].url); return; }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'back') {
          if (history.length > 1) { history.pop(); go(history[history.length - 1], false); }
          else { history.length = 0; home(); }
        }
        if (a.dataset.a === 'tabs') {
          OS.UI.menu(a, [
            { label: 'Pagina iniziale', icon: 'house', onTap: () => { history.length = 0; home(); } },
            { label: 'Apri in una nuova finestra', icon: 'square-on-square', onTap: () => { if (current && current !== 'about:ios26') window.open(current, '_blank', 'noopener'); } },
            { label: 'Copia link', icon: 'share', onTap: () => { if (current && navigator.clipboard) navigator.clipboard.writeText(current).catch(() => {}); } },
          ], { preview: false });
        }
      });

      return {
        onShow(data) {
          if (data && data.search) go(normalize(data.search));
          if (data && data.url) go(data.url);
          if (data && data.home) { history.length = 0; home(); }
        },
      };
    },
  });
})();
