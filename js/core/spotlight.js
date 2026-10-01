/* ==========================================================================
   Spotlight search (swipe down on the Home Screen)
   ========================================================================== */
(function () {
  'use strict';

  let root, body, input, results, backdrop;
  let pulling = false;

  function evalMath(q) {
    const expr = q.replace(/,/g, '.').replace(/×|x/gi, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    if (!/^[\d.+\-*/()%^]+$/.test(expr) || !/[+\-*/^%]/.test(expr) || !/\d/.test(expr)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict";return (' + expr.replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)') + ')')();
      if (typeof v !== 'number' || !isFinite(v)) return null;
      return OS.fmt.number(v, 8);
    } catch (e) {
      return null;
    }
  }

  function search(q) {
    q = q.trim();
    const lc = q.toLowerCase();
    let html = '';
    if (!q) {
      const recent = Array.from(OS.Apps.running.values()).sort((a, b) => b.lastUsed - a.lastUsed).map((r) => r.id);
      const sugg = recent.concat(['messages', 'photos', 'notes', 'music', 'safari', 'settings', 'weather', 'clock']).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
      html += `<div class="sp-section"><h3>Suggerimenti di Siri</h3><div class="sp-apps glass">${sugg.map(appItem).join('')}</div></div>`;
      results.innerHTML = html;
      return;
    }
    const calc = evalMath(q);
    if (calc != null) html += `<div class="sp-section"><h3>Calcolatrice</h3><button class="sp-calc glass" data-open="calculator" style="width:100%;text-align:left">= ${OS.esc(calc)}</button></div>`;

    const apps = OS.appOrder.filter((id) => OS.apps[id].name.toLowerCase().includes(lc) || (OS.apps[id].keywords || '').includes(lc));
    if (apps.length) html += `<div class="sp-section"><h3>App</h3><div class="sp-apps glass">${apps.slice(0, 8).map(appItem).join('')}</div></div>`;

    const contacts = (OS.Contacts || []).filter((c) => c.name.toLowerCase().includes(lc)).slice(0, 4);
    if (contacts.length) {
      html += `<div class="sp-section"><h3>Contatti</h3><div class="sp-list glass">${contacts.map((c) =>
        `<button class="sp-row" data-contact="${OS.esc(c.name)}"><div class="avatar" style="width:36px;height:36px;font-size:14px;background:${c.color}">${OS.esc(c.initials)}</div><div><div class="t">${OS.esc(c.name)}</div><div class="s">${OS.esc(c.phone)}</div></div></button>`).join('')}</div></div>`;
    }

    const notes = (OS.NotesService ? OS.NotesService.all() : []).filter((n) => n.text.toLowerCase().includes(lc)).slice(0, 4);
    if (notes.length) {
      html += `<div class="sp-section"><h3>Note</h3><div class="sp-list glass">${notes.map((n) =>
        `<button class="sp-row" data-note="${n.id}">${OS.icon('notes', 'xs')}<div style="min-width:0"><div class="t">${OS.esc(n.text.split('\n')[0] || 'Nuova nota')}</div><div class="s">${OS.esc(OS.fmt.relative(n.updated))}</div></div></button>`).join('')}</div></div>`;
    }

    html += `<div class="sp-section"><h3>Cerca sul web</h3><div class="sp-list glass"><button class="sp-row" data-web="${OS.esc(q)}">${OS.icon('safari', 'xs')}<div class="t">${OS.esc(q)}</div></button></div></div>`;
    results.innerHTML = html;
  }

  function appItem(id) {
    return `<div class="home-item" data-app="${id}">${OS.icon(id, 'md')}<span class="home-label">${OS.esc(OS.apps[id].name)}</span></div>`;
  }

  function setProgress(p, animate) {
    p = OS.clamp(p, 0, 1);
    backdrop.style.transition = animate ? '' : 'none';
    body.style.transition = animate ? '' : 'none';
    backdrop.style.opacity = p;
    body.style.opacity = p;
    body.style.transform = `translateY(${(p - 1) * 30}px)`;
  }

  function open() {
    if (OS.state.spotlightOpen) return;
    OS.state.spotlightOpen = true;
    root.classList.add('open');
    setProgress(1, true);
    input.value = '';
    search('');
    document.getElementById('home').classList.add('blurred');
    OS.chrome();
    setTimeout(() => input.focus({ preventScroll: true }), 120);
  }

  function close(instant) {
    if (!OS.state.spotlightOpen && !pulling) return;
    OS.state.spotlightOpen = false;
    pulling = false;
    root.classList.remove('open');
    setProgress(0, !instant);
    input.blur();
    document.getElementById('home').classList.remove('blurred');
    OS.chrome();
  }

  function init() {
    root = document.getElementById('spotlight');
    root.innerHTML = `<div class="sp-backdrop"></div>
      <div class="sp-body">
        <div class="sp-results"></div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="sp-field glass" style="flex:1">${OS.sym('search', { size: 18 })}<input type="search" placeholder="Cerca" enterkeyhint="search" autocomplete="off" spellcheck="false"></div>
          <button class="sp-cancel" style="margin:10px 0 34px">Annulla</button>
        </div>
      </div>`;
    backdrop = root.querySelector('.sp-backdrop');
    body = root.querySelector('.sp-body');
    input = root.querySelector('input');
    results = root.querySelector('.sp-results');
    setProgress(0);

    input.addEventListener('input', () => search(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector('[data-app], [data-open], [data-web]');
        if (first) first.click();
      }
      if (e.key === 'Escape') close();
    });
    root.querySelector('.sp-cancel').addEventListener('click', () => close());
    backdrop.addEventListener('click', () => close());
    results.addEventListener('click', (e) => {
      const a = e.target.closest('[data-app]');
      if (a) { close(true); OS.Apps.open(a.dataset.app); return; }
      const o = e.target.closest('[data-open]');
      if (o) { close(true); OS.Apps.open(o.dataset.open); return; }
      const w = e.target.closest('[data-web]');
      if (w) { close(true); OS.Apps.open('safari', { data: { search: w.dataset.web } }); return; }
      const n = e.target.closest('[data-note]');
      if (n) { close(true); OS.Apps.open('notes', { data: { note: n.dataset.note } }); return; }
      const c = e.target.closest('[data-contact]');
      if (c) { close(true); OS.Apps.open('phone', { data: { contact: c.dataset.contact } }); }
    });
    results.addEventListener('click', (e) => { if (e.target === results) close(); });
  }

  OS.Spotlight = {
    init, open, close,
    beginPull() { pulling = true; root.classList.add('open'); search(''); },
    pull(dy) { setProgress(dy / 160); },
    endPull(dy, v) {
      pulling = false;
      if (dy > 70 || v > .4) { root.classList.remove('open'); open(); }
      else { root.classList.remove('open'); setProgress(0, true); }
    },
  };
})();
