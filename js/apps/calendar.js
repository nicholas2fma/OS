/* ==========================================================================
   Calendario — month grid, day agenda, add events
   ========================================================================== */
(function () {
  'use strict';

  const pad = OS.pad;
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function defaults() {
    const t = new Date();
    return [
      { id: 'e1', date: iso(t), start: '09:30', end: '10:30', title: 'Riunione di team', place: 'Sala Vetro', color: '#5e5ce6' },
      { id: 'e2', date: iso(t), start: '13:00', end: '14:00', title: 'Pranzo con Giulia', place: 'Trattoria da Mario', color: '#ff9f0a' },
      { id: 'e3', date: iso(t), start: '18:30', end: '19:30', title: 'Palestra', place: '', color: '#30d158' },
      { id: 'e4', date: iso(addDays(t, 1)), start: '11:00', end: '12:00', title: 'Chiamata con il cliente', place: 'FaceTime', color: '#0a84ff' },
      { id: 'e5', date: iso(addDays(t, 3)), start: '20:30', end: '23:00', title: 'Cena da Marco', place: 'Via Roma 12', color: '#ff375f' },
      { id: 'e6', date: iso(addDays(t, 5)), start: '', end: '', title: 'Compleanno di Sara', place: '', color: '#bf5af2' },
      { id: 'e7', date: iso(addDays(t, -2)), start: '16:00', end: '17:00', title: 'Dentista', place: 'Studio Bianchi', color: '#64d2ff' },
      { id: 'e8', date: iso(addDays(t, 9)), start: '10:00', end: '18:00', title: 'Gita fuori porta', place: 'Lago di Bracciano', color: '#30d158' },
    ];
  }

  const Service = {
    events: OS.store.get('events', null) || defaults(),
    save() { OS.store.set('events', this.events); OS.emit('calendar'); },
    on(dateStr) {
      return this.events.filter((e) => e.date === dateStr).sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'));
    },
    nextToday() {
      const now = new Date();
      const hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
      const ev = this.on(iso(now)).find((e) => !e.start || e.end > hm || e.start > hm);
      if (!ev) return null;
      return { title: ev.title, time: ev.start ? `${ev.start}–${ev.end}` : 'Tutto il giorno', color: ev.color };
    },
  };
  OS.CalendarService = Service;

  OS.registerApp({
    id: 'calendar',
    name: 'Calendario',
    keywords: 'calendario eventi agenda appuntamenti',
    quickActions: [{ label: 'Nuovo evento', icon: 'plus', data: { add: true } }],
    mount(root) {
      let view = new Date();
      view.setDate(1);
      let selected = new Date();

      root.innerHTML = `<div class="cal-app">
        <header class="cal-head">
          <div class="cal-top">
            <button class="gbtn glass tint" data-a="year">${OS.sym('chevron-left', { stroke: 2.4 })}<span class="cal-year"></span></button>
            <div style="display:flex;gap:8px"><div class="gbtn-group glass"><button class="gbtn" data-a="prev" aria-label="Mese precedente">${OS.sym('chevron-up', { stroke: 2.4 })}</button><button class="gbtn" data-a="next" aria-label="Mese successivo">${OS.sym('chevron-down', { stroke: 2.4 })}</button></div>
            <button class="gbtn glass" data-a="add" aria-label="Nuovo evento">${OS.sym('plus', { stroke: 2.4 })}</button></div>
          </div>
          <h1 class="cal-month"></h1>
          <div class="cal-wd">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => `<span class="${i > 4 ? 'we' : ''}">${d}</span>`).join('')}</div>
        </header>
        <div class="cal-grid"></div>
        <div class="cal-agenda scroll"></div>
        <div class="toolbar"><button class="gbtn glass tint" data-a="today">Oggi</button><button class="gbtn glass tint" data-a="cals">Calendari</button><button class="gbtn glass tint" data-a="inbox">${OS.sym('tray')}</button></div>
      </div>`;
      const grid = root.querySelector('.cal-grid');
      const agenda = root.querySelector('.cal-agenda');
      const monthEl = root.querySelector('.cal-month');
      const yearEl = root.querySelector('.cal-year');

      function paint() {
        yearEl.textContent = view.getFullYear();
        monthEl.textContent = OS.fmt.month(view.getMonth());
        const first = new Date(view.getFullYear(), view.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7;
        const start = addDays(first, -offset);
        const todayS = iso(new Date()), selS = iso(selected);
        let html = '';
        for (let i = 0; i < 42; i++) {
          const d = addDays(start, i);
          const ds = iso(d);
          const out = d.getMonth() !== view.getMonth();
          const evs = Service.on(ds);
          html += `<button class="cal-day ${out ? 'out' : ''} ${ds === todayS ? 'today' : ''} ${ds === selS ? 'sel' : ''} ${(i % 7) > 4 ? 'we' : ''}" data-d="${ds}">
            <span>${d.getDate()}</span>${evs.length ? `<i style="background:${evs[0].color}"></i>` : '<i style="opacity:0"></i>'}</button>`;
        }
        grid.innerHTML = html;
        paintAgenda();
      }

      function paintAgenda() {
        const evs = Service.on(iso(selected));
        const label = iso(selected) === iso(new Date()) ? 'Oggi' : OS.fmt.weekday(selected);
        agenda.innerHTML = `<div class="cal-ag-head">${label} – ${selected.getDate()} ${OS.fmt.MONTHS[selected.getMonth()]} ${selected.getFullYear()}</div>`
          + (evs.length ? evs.map((e) => `<div class="cal-ev" data-id="${e.id}" style="--c:${e.color}">
              <div class="cal-ev-main"><b>${OS.esc(e.title)}</b>${e.place ? `<span>${OS.esc(e.place)}</span>` : ''}</div>
              <div class="cal-ev-time">${e.start ? `<span>${e.start}</span><span>${e.end}</span>` : '<span>tutto il</span><span>giorno</span>'}</div></div>`).join('')
            : '<div class="cal-empty">Nessun evento</div>');
      }

      function addEvent(dateStr) {
        OS.UI.sheet(root, {
          title: 'Nuovo evento',
          left: { icon: 'xmark', label: 'Annulla' },
          right: {
            icon: 'check', label: 'Aggiungi', primary: true,
            onTap(api) {
              const b = api.body;
              const title = b.querySelector('[name=title]').value.trim() || 'Nuovo evento';
              const allDay = b.querySelector('.switch').classList.contains('on');
              const ev = {
                id: 'e' + Date.now(), title,
                place: b.querySelector('[name=place]').value.trim(),
                date: b.querySelector('[name=date]').value || dateStr,
                start: allDay ? '' : b.querySelector('[name=start]').value || '09:00',
                end: allDay ? '' : b.querySelector('[name=end]').value || '10:00',
                color: b.querySelector('.cal-col.on').dataset.c,
              };
              Service.events.push(ev);
              Service.save();
              selected = new Date(ev.date + 'T12:00');
              view = new Date(selected.getFullYear(), selected.getMonth(), 1);
              paint();
              api.close();
            },
          },
          render(body) {
            const now = new Date();
            const h = pad((now.getHours() + 1) % 24);
            const colors = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#5e5ce6', '#bf5af2'];
            body.innerHTML = `<div class="section"><div class="list">
                <div class="row"><input name="title" class="cal-input" placeholder="Titolo"></div>
                <div class="row"><input name="place" class="cal-input" placeholder="Luogo o videochiamata"></div></div></div>
              <div class="section"><div class="list">
                <div class="row cal-allday"><div class="row-main">Tutto il giorno</div></div>
                <div class="row"><div class="row-main">Data</div><input type="date" name="date" class="cal-pill" value="${dateStr}"></div>
                <div class="row"><div class="row-main">Inizio</div><input type="time" name="start" class="cal-pill" value="${h}:00"></div>
                <div class="row"><div class="row-main">Fine</div><input type="time" name="end" class="cal-pill" value="${pad((+h + 1) % 24)}:00"></div></div></div>
              <div class="section"><div class="section-head">Colore</div><div class="list"><div class="row" style="justify-content:space-between;padding:12px 16px">${colors.map((c, i) => `<button class="cal-col ${i === 5 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div></div>`;
            body.querySelector('.cal-allday').appendChild(OS.UI.toggle(false));
            body.addEventListener('click', (e) => {
              const c = e.target.closest('.cal-col');
              if (c) body.querySelectorAll('.cal-col').forEach((x) => x.classList.toggle('on', x === c));
            });
            body.addEventListener('keydown', (e) => e.stopPropagation());
            setTimeout(() => body.querySelector('[name=title]').focus(), 450);
          },
        });
      }

      root.querySelector('.cal-app').addEventListener('click', (e) => {
        const day = e.target.closest('.cal-day');
        if (day && grid.dataset.swiped) { delete grid.dataset.swiped; return; }
        if (day) {
          selected = new Date(day.dataset.d + 'T12:00');
          if (selected.getMonth() !== view.getMonth()) view = new Date(selected.getFullYear(), selected.getMonth(), 1);
          paint();
          return;
        }
        const ev = e.target.closest('.cal-ev');
        if (ev) {
          const item = Service.events.find((x) => x.id === ev.dataset.id);
          OS.UI.menu(ev, [{ label: 'Elimina evento', icon: 'trash', destructive: true, onTap: () => { Service.events = Service.events.filter((x) => x !== item); Service.save(); paint(); } }]);
          return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        const act = a.dataset.a;
        if (act === 'prev') { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); paint(); }
        if (act === 'next') { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); paint(); }
        if (act === 'today') { selected = new Date(); view = new Date(selected.getFullYear(), selected.getMonth(), 1); paint(); }
        if (act === 'add') addEvent(iso(selected));
        if (act === 'year' || act === 'cals' || act === 'inbox') OS.Island.flash({ left: OS.sym('calendar', { size: 18 }), right: `<span>${act === 'inbox' ? 'Nessun invito' : 'Calendario personale'}</span>`, width: 250 });
      });

      // swipe vertically/horizontally on the grid to change month
      let sw = null;
      grid.addEventListener('pointerdown', (e) => { sw = OS.point(e); });
      grid.addEventListener('pointerup', (e) => {
        if (!sw) return;
        const p = OS.point(e);
        const dx = p.x - sw.x, dy = p.y - sw.y;
        sw = null;
        const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (Math.abs(d) > 50) {
          grid.dataset.swiped = '1';
          setTimeout(() => { delete grid.dataset.swiped; }, 50);
          view = new Date(view.getFullYear(), view.getMonth() + (d < 0 ? 1 : -1), 1);
          paint();
        }
      });

      const off = OS.on('calendar', paint);
      paint();
      return {
        onShow(data) { if (data && data.add) addEvent(iso(selected)); else paint(); },
        onDestroy() { off(); },
      };
    },
  });
})();
