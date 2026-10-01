/* ==========================================================================
   Promemoria — lists, smart lists, inline editing, flags, due today
   ========================================================================== */
(function () {
  'use strict';

  const today = () => new Date().toDateString();
  const D = {
    lists: [
      { id: 'l1', name: 'Promemoria', color: '#0a84ff' },
      { id: 'l2', name: 'Spesa', color: '#30d158' },
      { id: 'l3', name: 'Lavoro', color: '#ff9f0a' },
    ],
    items: [
      { id: 'r1', list: 'l1', title: 'Chiamare il dentista', done: false, flagged: true, due: today() },
      { id: 'r2', list: 'l1', title: 'Pagare la bolletta della luce', done: false, flagged: false, due: today() },
      { id: 'r3', list: 'l1', title: 'Rinnovare l\'abbonamento in palestra', done: false, flagged: false, due: null },
      { id: 'r4', list: 'l2', title: 'Caffè', done: false, flagged: false, due: null },
      { id: 'r5', list: 'l2', title: 'Parmigiano', done: false, flagged: false, due: null },
      { id: 'r6', list: 'l2', title: 'Uova', done: true, flagged: false, due: null },
      { id: 'r7', list: 'l3', title: 'Preparare la presentazione', done: false, flagged: true, due: null },
      { id: 'r8', list: 'l3', title: 'Rispondere alle email', done: false, flagged: false, due: today() },
    ],
  };

  const Store = {
    data: OS.store.get('reminders', D),
    save() { OS.store.set('reminders', this.data); OS.emit('reminders'); updateBadge(); },
    list(id) { return this.data.lists.find((l) => l.id === id); },
  };

  function updateBadge() {
    const n = Store.data.items.filter((i) => !i.done && i.due === today()).length;
    if (OS.Home && OS.Home.setBadge) OS.Home.setBadge('reminders', n);
  }
  OS.onBoot(updateBadge);

  const SMART = [
    { id: 'today', name: 'Oggi', icon: 'calendar-today', color: '#0a84ff', filter: (i) => i.due === today() },
    { id: 'scheduled', name: 'Programmati', icon: 'calendar', color: '#ff453a', filter: (i) => !!i.due },
    { id: 'all', name: 'Tutti', icon: 'tray', color: '#3a3a3c', filter: () => true },
    { id: 'flagged', name: 'Contrassegnati', icon: 'flag-fill', color: '#ff9f0a', filter: (i) => i.flagged },
  ];

  OS.registerApp({
    id: 'reminders',
    name: 'Promemoria',
    keywords: 'promemoria cose da fare todo lista',
    quickActions: [{ label: 'Nuovo promemoria', icon: 'plus-circle-fill', data: { add: true } }],
    mount(root) {
      const nav = new OS.UI.Nav(root);

      const home = {
        title: 'Promemoria', grouped: true, cls: 'rem-home',
        render(body, page) {
          page.right.appendChild(OS.UI.gbtn('ellipsis', 'Altro', () => {}));
          page.paint = () => {
            const items = Store.data.items;
            body.innerHTML = `<div class="search-field">${OS.sym('search')}<input type="search" placeholder="Cerca"></div>
              <div class="rem-smart">${SMART.map((s) => `<button class="rem-card" data-smart="${s.id}"><span class="rem-ico" style="background:${s.color}">${OS.sym(s.icon, { size: 18, stroke: 2.2 })}</span><b>${items.filter((i) => !i.done && s.filter(i)).length}</b><span>${s.name}</span></button>`).join('')}
                <button class="rem-card wide" data-smart="done"><span class="rem-ico" style="background:#8e8e93">${OS.sym('check', { size: 18, stroke: 2.6 })}</span><span>Completati</span><b style="position:static;margin-left:auto">${items.filter((i) => i.done).length}</b></button></div>
              <div class="section"><div class="section-head big">I miei elenchi</div><div class="list">${Store.data.lists.map((l) =>
                `<div class="row tap" data-list="${l.id}"><span class="rem-ico" style="background:${l.color}">${OS.sym('list', { size: 17, stroke: 2.2 })}</span><div class="row-main">${OS.esc(l.name)}</div><div class="row-value">${items.filter((i) => i.list === l.id && !i.done).length}</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div>`).join('')}</div></div>`;
            const input = body.querySelector('input');
            input.addEventListener('input', () => {
              const q = input.value.trim().toLowerCase();
              if (q.length > 1) { input.blur(); openList({ id: 'search', name: `Risultati per "${input.value}"`, color: 'var(--accent)', filter: (i) => i.title.toLowerCase().includes(q), showDone: true }); input.value = ''; }
            });
          };
          page.paint();
          page.refresh = page.paint;
          body.addEventListener('click', (e) => {
            const sm = e.target.closest('[data-smart]');
            if (sm) {
              if (sm.dataset.smart === 'done') openList({ id: 'done', name: 'Completati', color: '#8e8e93', filter: (i) => i.done, showDone: true, readOnly: true });
              else { const s = SMART.find((x) => x.id === sm.dataset.smart); openList({ id: s.id, name: s.name, color: s.color, filter: s.filter }); }
              return;
            }
            const l = e.target.closest('[data-list]');
            if (l) { const list = Store.list(l.dataset.list); openList({ id: list.id, name: list.name, color: list.color, list: list.id, filter: (i) => i.list === list.id }); }
          });
        },
      };

      const bottom = OS.el(`<div class="toolbar rem-bottom"><button class="rem-new">${OS.sym('plus-circle-fill', { size: 24 })} Nuovo promemoria</button><button class="rem-addlist">Aggiungi elenco</button></div>`);
      bottom.querySelector('.rem-new').addEventListener('click', () => {
        const l = Store.data.lists[0];
        openList({ id: l.id, name: l.name, color: l.color, list: l.id, filter: (i) => i.list === l.id }, true);
      });
      bottom.querySelector('.rem-addlist').addEventListener('click', () => {
        OS.UI.alert({
          title: 'Nuovo elenco', input: { placeholder: 'Nome elenco' },
          buttons: [{ label: 'Annulla' }, { label: 'Crea', style: 'default', onTap: (v) => {
            if (!v || !v.trim()) return;
            const colors = ['#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68'];
            Store.data.lists.push({ id: 'l' + Date.now(), name: v.trim(), color: colors[Store.data.lists.length % colors.length] });
            Store.save();
            home.paint();
          } }],
        });
      });

      function openList(spec, addNow) {
        bottom.style.display = 'none';
        nav.push({
          title: spec.name, large: true, cls: 'rem-listpage',
          render(body, page) {
            if (page.largeEl) page.largeEl.style.color = spec.color;
            let showDone = !!spec.showDone;
            page.right.appendChild(OS.UI.gbtn('ellipsis', 'Altro', (e) => {
              OS.UI.menu(e.currentTarget, [
                { label: showDone ? 'Nascondi completati' : 'Mostra completati', icon: 'eye', onTap: () => { showDone = !showDone; paint(); } },
                { label: 'Elimina completati', icon: 'trash', destructive: true, onTap: () => { Store.data.items = Store.data.items.filter((i) => !(i.done && spec.filter(i))); Store.save(); paint(); } },
              ], { preview: false });
            }));
            const listEl = OS.el('<div class="rem-items"></div>');
            body.appendChild(listEl);

            function rowHTML(i) {
              const l = Store.list(i.list) || { color: spec.color };
              const sub = [i.due === today() ? 'Oggi' : i.due ? new Date(i.due).toLocaleDateString('it-IT') : '', spec.list ? '' : (Store.list(i.list) || {}).name].filter(Boolean).join(' · ');
              return `<div class="rem-item ${i.done ? 'done' : ''}" data-id="${i.id}">
                <button class="rem-check" style="--c:${l.color}" aria-label="Completa"></button>
                <div class="rem-body"><input class="rem-title" value="${OS.esc(i.title)}" ${spec.readOnly ? 'readonly' : ''}>${sub ? `<div class="rem-sub">${OS.esc(sub)}</div>` : ''}</div>
                ${i.flagged ? `<span class="rem-flag">${OS.sym('flag-fill', { size: 16 })}</span>` : ''}
                <button class="rem-info" aria-label="Dettagli">${OS.sym('info', { size: 20 })}</button></div>`;
            }

            function paint() {
              const items = Store.data.items.filter((i) => spec.filter(i) && (showDone || !i.done));
              listEl.innerHTML = items.map(rowHTML).join('')
                + (spec.readOnly || spec.id === 'search' ? '' : `<button class="rem-add">${OS.sym('plus-circle-fill', { size: 22 })}<span>Nuovo promemoria</span></button>`);
              if (!items.length && (spec.readOnly || spec.id === 'search')) listEl.innerHTML = `<div class="empty-state"><b>Nessun promemoria</b></div>`;
            }

            function add() {
              const i = { id: 'r' + Date.now(), list: spec.list || Store.data.lists[0].id, title: '', done: false, flagged: spec.id === 'flagged', due: spec.id === 'today' || spec.id === 'scheduled' ? today() : null };
              Store.data.items.push(i);
              paint();
              const inp = listEl.querySelector(`[data-id="${i.id}"] .rem-title`);
              if (inp) inp.focus();
            }

            listEl.addEventListener('click', (e) => {
              if (e.target.closest('.rem-add')) { add(); return; }
              const item = e.target.closest('.rem-item');
              if (!item) return;
              const it = Store.data.items.find((x) => x.id === item.dataset.id);
              if (!it) return;
              if (e.target.closest('.rem-check')) {
                it.done = !it.done;
                item.classList.toggle('done', it.done);
                OS.haptic(10);
                if (it.done) OS.sound('sent');
                Store.save();
                if (it.done && !showDone) setTimeout(() => { item.style.opacity = '0'; setTimeout(paint, 250); }, 900);
              }
              if (e.target.closest('.rem-info')) {
                OS.UI.menu(item, [
                  { label: it.flagged ? 'Rimuovi contrassegno' : 'Contrassegna', icon: 'flag', onTap: () => { it.flagged = !it.flagged; Store.save(); paint(); } },
                  { label: it.due === today() ? 'Rimuovi scadenza' : 'Scadenza: oggi', icon: 'calendar', onTap: () => { it.due = it.due === today() ? null : today(); Store.save(); paint(); } },
                  { label: 'Elimina', icon: 'trash', destructive: true, onTap: () => { Store.data.items = Store.data.items.filter((x) => x !== it); Store.save(); paint(); } },
                ], { preview: false });
              }
            });
            listEl.addEventListener('focusout', (e) => {
              const inp = e.target.closest('.rem-title');
              if (!inp) return;
              const it = Store.data.items.find((x) => x.id === inp.closest('.rem-item').dataset.id);
              if (!it) return;
              const v = inp.value.trim();
              if (!v) { Store.data.items = Store.data.items.filter((x) => x !== it); Store.save(); paint(); return; }
              if (v !== it.title) { it.title = v; Store.save(); }
            });
            listEl.addEventListener('keydown', (e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && e.target.closest('.rem-title')) { e.preventDefault(); e.target.blur(); if (e.target.value.trim()) add(); }
            });
            paint();
            if (addNow) setTimeout(add, 480);
          },
          onHide() { bottom.style.display = ''; home.paint(); },
        });
      }

      nav.push(home, false);
      root.appendChild(bottom);
      return {
        onShow(data) {
          if (data && data.add) { nav.popToRoot(); bottom.querySelector('.rem-new').click(); }
          else if (nav.stack.length === 1) home.paint();
        },
      };
    },
  });
})();
