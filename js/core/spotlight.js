/* ==========================================================================
   Cerca o chiedi (iOS 27) — Spotlight search merged with Siri.
   Swipe down from the top centre anywhere, or from the middle of the Home Screen.
   With Siri AI turned off it behaves like the classic Spotlight.
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
    const siri = OS.settings.siriAI;
    if (!q) {
      const recent = Array.from(OS.Apps.running.values()).sort((a, b) => b.lastUsed - a.lastUsed).map((r) => r.id);
      const sugg = recent.concat(['messages', 'photos', 'notes', 'music', 'safari', 'settings', 'weather', 'clock']).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
      html += `<div class="sp-section"><h3>Suggerimenti di Siri</h3><div class="sp-apps glass">${sugg.map(appItem).join('')}</div></div>`;
      if (siri) {
        html += `<div class="sp-section"><h3>Prova a chiedere</h3><div class="sp-chips">${['Che tempo fa domani?', 'Imposta un timer di 5 minuti', 'Ricordami di chiamare Marco domani alle 9', 'Accendi la torcia', 'Riproduci musica', 'Quanto fa 18 per 24?'].map((s) =>
          `<button class="sp-chip glass" data-ask="${OS.esc(s)}">${OS.esc(s)}</button>`).join('')}</div></div>`;
      }
      results.innerHTML = html;
      return;
    }
    if (siri) {
      html += `<div class="sp-section"><button class="sp-ask glass" data-ask="${OS.esc(q)}"><span class="siri-orb"></span><div><div class="t">Chiedi a Siri</div><div class="s">«${OS.esc(q)}»</div></div>${OS.sym('arrow-up-circle-fill', { size: 26 })}</button></div>`;
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

  /* ---------- motion ---------- */

  const PULL = 170;
  const value = OS.motion.value(0, paint);

  function paint(p) {
    const seg = OS.motion.segment;
    const q = OS.motion.clamp01(p);
    const over = Math.max(0, p - 1);
    root.style.visibility = p <= .001 ? 'hidden' : '';
    backdrop.style.opacity = String(seg(p, 0, .7));
    body.style.opacity = String(seg(p, .1, .75));
    body.style.transform = `translate3d(0, ${(q - 1) * 44 + over * 70}px, 0) scale(${.94 + .06 * q})`;
  }

  function setProgress(p, animate) {
    if (animate) value.spring(OS.clamp(p, 0, 1), { preset: 'smooth' });
    else value.set(p);
  }

  function syncMode() {
    const siri = OS.settings.siriAI;
    input.placeholder = siri ? 'Cerca o chiedi' : 'Cerca';
    root.querySelector('.sp-lead').innerHTML = siri ? '<span class="siri-orb"></span>' : OS.sym('search', { size: 18 });
    root.querySelector('.sp-mic').style.display = siri ? '' : 'none';
  }

  function askSiri(q) {
    close(true);
    OS.Siri.run(q);
  }

  function open(velocity) {
    if (OS.state.spotlightOpen) return;
    OS.state.spotlightOpen = true;
    root.classList.add('open');
    value.spring(1, { preset: { response: .42, damping: .86 }, velocity });
    input.value = '';
    syncMode();
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
    if (instant) value.set(0);
    else value.spring(0, { preset: { response: .36, damping: 1 } });
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
          <div class="sp-field glass" style="flex:1"><span class="sp-lead"></span><input type="search" placeholder="Cerca" enterkeyhint="search" autocomplete="off" spellcheck="false"><button class="sp-mic" aria-label="Detta">${OS.sym('mic', { size: 18 })}</button></div>
          <button class="sp-cancel" style="margin:10px 0 34px">Annulla</button>
        </div>
      </div>`;
    backdrop = root.querySelector('.sp-backdrop');
    body = root.querySelector('.sp-body');
    input = root.querySelector('input');
    results = root.querySelector('.sp-results');
    value.set(0);

    input.addEventListener('input', () => search(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        const exactApp = OS.appOrder.find((id) => OS.apps[id].name.toLowerCase() === q.toLowerCase());
        if (OS.settings.siriAI && q && !exactApp) { askSiri(q); return; }
        const first = results.querySelector('[data-app], [data-open], [data-web]');
        if (first) first.click();
      }
      if (e.key === 'Escape') close();
    });
    root.querySelector('.sp-cancel').addEventListener('click', () => close());
    root.querySelector('.sp-mic').addEventListener('click', () => {
      const ok = OS.Siri.listen((text) => { input.value = text; search(text); askSiri(text); });
      if (!ok) OS.Island.flash({ left: OS.sym('mic-slash', { size: 18 }), right: '<span>Dettatura non disponibile</span>', width: 260 });
    });
    backdrop.addEventListener('click', () => close());
    results.addEventListener('click', (e) => {
      const q = e.target.closest('[data-ask]');
      if (q) { askSiri(q.dataset.ask); return; }
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
    init, open: () => open(), close, setProgress,
    beginPull() { pulling = true; value.stop(); root.classList.add('open'); syncMode(); search(''); },
    pull(dy) { value.set(dy <= PULL ? Math.max(0, dy) / PULL : 1 + OS.motion.rubber(dy - PULL, OS.state.height * .5) / PULL); },
    /** vy in px/s */
    endPull(dy, vy) {
      pulling = false;
      root.classList.remove('open');
      const projected = value.value + OS.motion.project(vy, .99) / PULL;
      if (vy > 300 || (vy > -300 && projected > .5)) open(vy / PULL);
      else value.spring(0, { preset: { response: .36, damping: 1 }, velocity: vy / PULL });
    },
  };
})();
