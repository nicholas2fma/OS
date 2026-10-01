/* ==========================================================================
   Note — persistent notes with search, pinning, rich first-line titles
   ========================================================================== */
(function () {
  'use strict';

  const now = Date.now();
  const Service = {
    notes: OS.store.get('notes', [
      { id: 'n1', pinned: true, updated: now - 3600000, text: 'Benvenuto in Note\nScrivi idee, liste e appunti. Le note vengono salvate nel browser.\n\nTieni premuta una nota per fissarla o eliminarla.' },
      { id: 'n2', pinned: false, updated: now - 86400000, text: 'Lista della spesa\n• Pane\n• Pomodori\n• Mozzarella di bufala\n• Basilico\n• Olio extravergine' },
      { id: 'n3', pinned: false, updated: now - 4 * 86400000, text: 'Idee viaggio\nCinque Terre a maggio, Sicilia in estate, Dolomiti a settembre.' },
      { id: 'n4', pinned: false, updated: now - 20 * 86400000, text: 'Ricetta carbonara\nGuanciale, tuorli, pecorino romano, pepe nero. Niente panna!' },
    ]),
    all() { return this.notes.slice().sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated)); },
    get(id) { return this.notes.find((n) => n.id === id); },
    create() {
      const n = { id: 'n' + Date.now(), pinned: false, updated: Date.now(), text: '' };
      this.notes.push(n);
      return n;
    },
    update(n, text) { n.text = text; n.updated = Date.now(); this.save(); },
    remove(id) { this.notes = this.notes.filter((n) => n.id !== id); this.save(); },
    save() { OS.store.set('notes', this.notes); OS.emit('notes'); },
  };
  OS.NotesService = Service;

  const title = (n) => (n.text.split('\n')[0] || '').trim() || 'Nuova nota';
  const preview = (n) => (n.text.split('\n').slice(1).join(' ').trim() || 'Nessun testo aggiuntivo');

  function dateLabel(ts) {
    const d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return OS.fmt.time(d);
    const diff = (t - d) / 86400000;
    if (diff < 7) return OS.fmt.weekday(d);
    return OS.pad(d.getDate()) + '/' + OS.pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
  }

  function bucket(n) {
    if (n.pinned) return 'Fissate';
    const diff = (Date.now() - n.updated) / 86400000;
    if (new Date(n.updated).toDateString() === new Date().toDateString()) return 'Oggi';
    if (diff < 7) return 'Ultimi 7 giorni';
    if (diff < 30) return 'Ultimi 30 giorni';
    return 'Precedenti';
  }

  OS.registerApp({
    id: 'notes',
    name: 'Note',
    keywords: 'note appunti testo',
    quickActions: [{ label: 'Nuova nota', icon: 'compose', data: { new: true } }],
    mount(root) {
      const nav = new OS.UI.Nav(root);
      let query = '';

      const listPage = {
        title: 'Note', large: true, grouped: true, cls: 'notes-list',
        render(body, page) {
          body.innerHTML = `<div class="search-field">${OS.sym('search')}<input type="search" placeholder="Cerca"></div><div class="notes-sections"></div>`;
          const input = body.querySelector('input');
          input.addEventListener('input', () => { query = input.value.toLowerCase(); paint(); });
          const sections = body.querySelector('.notes-sections');
          function paint() {
            const items = Service.all().filter((n) => !query || n.text.toLowerCase().includes(query));
            const groups = {};
            items.forEach((n) => { (groups[bucket(n)] = groups[bucket(n)] || []).push(n); });
            const order = ['Fissate', 'Oggi', 'Ultimi 7 giorni', 'Ultimi 30 giorni', 'Precedenti'];
            sections.innerHTML = items.length ? order.filter((k) => groups[k]).map((k) => `<div class="section"><div class="section-head big">${k}</div><div class="list">${groups[k].map((n) =>
              `<div class="row tap note-row" data-id="${n.id}"><div class="row-main"><div class="row-title" style="font-weight:600">${n.pinned ? OS.sym('star-fill', { size: 12, style: 'display:inline;color:var(--orange);margin-right:4px' }) : ''}${OS.esc(title(n))}</div><div class="row-sub"><span style="color:var(--label)">${dateLabel(n.updated)}</span>  ${OS.esc(preview(n))}</div></div></div>`).join('')}</div></div>`).join('')
              : `<div class="empty-state">${OS.sym('doc-text')}<b>Nessuna nota</b><span>${query ? 'Nessun risultato' : 'Tocca il pulsante per crearne una'}</span></div>`;
            countEl.textContent = Service.notes.length === 1 ? '1 nota' : Service.notes.length + ' note';
          }
          page.paint = paint;
          sections.addEventListener('click', (e) => {
            const r = e.target.closest('.note-row');
            if (r && !r.dataset.held) open(Service.get(r.dataset.id));
            if (r) delete r.dataset.held;
          });
          // long press → menu
          let t = null;
          sections.addEventListener('pointerdown', (e) => {
            const r = e.target.closest('.note-row');
            if (!r) return;
            t = setTimeout(() => {
              r.dataset.held = '1';
              const n = Service.get(r.dataset.id);
              OS.UI.menu(r, [
                { label: n.pinned ? 'Rimuovi dalle fissate' : 'Fissa nota', icon: 'star', onTap: () => { n.pinned = !n.pinned; Service.save(); } },
                { label: 'Condividi', icon: 'share', onTap: () => share(n) },
                { label: 'Elimina', icon: 'trash', destructive: true, onTap: () => Service.remove(n.id) },
              ]);
            }, 500);
          });
          ['pointerup', 'pointercancel', 'pointermove'].forEach((ev) => sections.addEventListener(ev, (e) => { if (ev !== 'pointermove' || Math.abs(e.movementY) > 2) clearTimeout(t); }));
          paint();
        },
      };

      const toolbar = OS.el(`<div class="toolbar"><div style="width:44px"></div><div class="notes-count glass" style="padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600"></div><button class="gbtn glass tint" aria-label="Nuova nota">${OS.sym('compose')}</button></div>`);
      const countEl = toolbar.querySelector('.notes-count');
      toolbar.querySelector('button').addEventListener('click', () => open(Service.create(), true));

      nav.push(listPage, false);
      root.appendChild(toolbar);

      function share(n) {
        if (navigator.share) navigator.share({ title: title(n), text: n.text }).catch(() => {});
        else if (navigator.clipboard) { navigator.clipboard.writeText(n.text).catch(() => {}); OS.Island.flash({ left: OS.sym('square-on-square', { size: 18 }), right: '<span>Nota copiata</span>', width: 220 }); }
      }

      function open(n, isNew) {
        if (!n) return;
        toolbar.style.display = 'none';
        nav.push({
          title: '', cls: 'note-editor',
          render(body, page) {
            page.right.appendChild(OS.UI.gbtn('share', 'Condividi', () => share(n)));
            page.right.appendChild(OS.UI.gbtn('ellipsis', 'Altro', (e) => {
              OS.UI.menu(e.currentTarget, [
                { label: n.pinned ? 'Rimuovi dalle fissate' : 'Fissa', icon: 'star', onTap: () => { n.pinned = !n.pinned; Service.save(); } },
                { label: 'Elimina', icon: 'trash', destructive: true, onTap: () => { Service.remove(n.id); nav.pop(); } },
              ], { preview: false });
            }));
            body.innerHTML = `<div class="note-date">${OS.esc(OS.fmt.dateLong(new Date(n.updated)))} alle ore ${OS.fmt.time(new Date(n.updated))}</div>
              <div class="note-text" contenteditable="true" spellcheck="false" data-ph="Titolo"></div>`;
            const tools = OS.el(`<div class="toolbar note-tools"><div class="gbtn-group glass">
                <button class="gbtn" aria-label="Elenco">${OS.sym('checkmark-circle')}</button>
                <button class="gbtn" aria-label="Formato">${OS.sym('textformat')}</button>
                <button class="gbtn" aria-label="Foto">${OS.sym('camera')}</button>
              </div><button class="gbtn glass tint" data-new aria-label="Nuova nota">${OS.sym('compose')}</button></div>`);
            page.el.appendChild(tools);
            const ed = body.querySelector('.note-text');
            ed.innerText = n.text;
            ed.addEventListener('input', () => Service.update(n, ed.innerText.replace(/\n$/, '')));
            ed.addEventListener('keydown', (e) => e.stopPropagation());
            tools.querySelector('[data-new]').addEventListener('click', () => { nav.pop(false); open(Service.create(), true); });
            if (isNew) setTimeout(() => ed.focus(), 480);
          },
          onHide() {
            if (!n.text.trim()) Service.remove(n.id);
            toolbar.style.display = '';
            if (listPage.paint) listPage.paint();
          },
        });
      }

      const off = OS.on('notes', () => { if (listPage.paint) listPage.paint(); });
      return {
        onShow(data) {
          if (data && data.new) { nav.popToRoot(); open(Service.create(), true); }
          if (data && data.note) { nav.popToRoot(); open(Service.get(data.note)); }
        },
        onDestroy() { off(); },
      };
    },
  });
})();
