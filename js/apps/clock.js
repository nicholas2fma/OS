/* ==========================================================================
   Orologio — world clock, alarms, stopwatch, timer (+ Dynamic Island)
   ========================================================================== */
(function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- Clock service (runs even when the app is closed) ---------------- */

  const Service = {
    alarms: OS.store.get('alarms', [
      { id: 'a1', h: 7, m: 0, label: 'Sveglia', on: false },
      { id: 'a2', h: 7, m: 30, label: 'Lavoro', on: true },
      { id: 'a3', h: 9, m: 15, label: 'Weekend', on: false },
    ]),
    timer: { state: 'idle', duration: 300, endAt: 0, remaining: 0 }, // idle | running | paused
    sw: { running: false, start: 0, elapsed: 0, laps: [] },
    firedKey: null,

    save() { OS.store.set('alarms', this.alarms); OS.emit('alarms'); },

    nextAlarm() {
      const on = this.alarms.filter((a) => a.on);
      if (!on.length) return null;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      on.sort((a, b) => ((a.h * 60 + a.m - nowMin + 1440) % 1440) - ((b.h * 60 + b.m - nowMin + 1440) % 1440));
      const a = on[0];
      return OS.fmt.time(new Date(2000, 0, 1, a.h, a.m));
    },

    /* timer */
    timerRemaining() {
      const t = this.timer;
      if (t.state === 'running') return Math.max(0, (t.endAt - Date.now()) / 1000);
      if (t.state === 'paused') return t.remaining;
      return t.duration;
    },
    startTimer(sec) {
      this.timer = { state: 'running', duration: sec, endAt: Date.now() + sec * 1000, remaining: sec };
      this.island();
      OS.emit('timer');
    },
    pauseTimer() {
      const t = this.timer;
      if (t.state !== 'running') return;
      t.remaining = this.timerRemaining();
      t.state = 'paused';
      this.island();
      OS.emit('timer');
    },
    resumeTimer() {
      const t = this.timer;
      if (t.state !== 'paused') return;
      t.endAt = Date.now() + t.remaining * 1000;
      t.state = 'running';
      this.island();
      OS.emit('timer');
    },
    cancelTimer() {
      this.timer = { state: 'idle', duration: this.timer.duration, endAt: 0, remaining: 0 };
      OS.Island.clear('timer');
      OS.emit('timer');
    },
    island() {
      const self = this;
      const fmt = () => OS.fmt.duration(Math.ceil(self.timerRemaining()));
      OS.Island.set('timer', {
        priority: 2,
        width: 200,
        left: () => `<span style="color:var(--orange);display:flex">${OS.sym('timer-fill', { size: 20 })}</span>`,
        right: () => `<span style="color:var(--orange)" class="tnum">${fmt()}</span>`,
        bubble: () => `<span style="color:var(--orange);display:flex">${OS.sym('timer-fill', { size: 18 })}</span>`,
        expandedHeight: 120,
        expanded(el) {
          const paused = self.timer.state === 'paused';
          el.innerHTML = `<div class="isl-row" style="height:100%">
            <button class="isl-btn orange" data-a="toggle">${OS.sym(paused ? 'play' : 'pause', { size: 20 })}</button>
            <button class="isl-btn" data-a="cancel">${OS.sym('xmark', { size: 18, stroke: 2.6 })}</button>
            <div style="margin-left:auto;text-align:right"><div class="isl-sub">Timer</div><div class="isl-big" style="color:var(--orange)">${fmt()}</div></div></div>`;
          el.querySelector('[data-a="toggle"]').onclick = (e) => { e.stopPropagation(); paused ? self.resumeTimer() : self.pauseTimer(); };
          el.querySelector('[data-a="cancel"]').onclick = (e) => { e.stopPropagation(); OS.Island.collapse(); self.cancelTimer(); };
        },
        refreshExpanded(el) {
          const big = el.querySelector('.isl-big');
          if (big) big.textContent = fmt(); else this.expanded(el);
        },
        onTap() { OS.Apps.open('clock', { data: { tab: 'timer' } }); },
      });
    },

    /* stopwatch */
    swElapsed() { const s = this.sw; return s.elapsed + (s.running ? Date.now() - s.start : 0); },

    tick() {
      // timer
      if (this.timer.state === 'running') {
        if (this.timerRemaining() <= 0) {
          this.timer.state = 'idle';
          OS.Island.clear('timer');
          OS.sound('alarm', 4);
          OS.notify({ app: 'clock', title: 'Timer', body: 'Il timer è terminato.', data: { tab: 'timer' }, force: true, silent: true });
          OS.Island.flash({ left: `<span style="color:var(--orange)">${OS.sym('timer-fill', { size: 20 })}</span>`, right: '<span style="color:var(--orange)">Timer terminato</span>', width: 250, duration: 3500 });
          OS.emit('timer');
        } else {
          OS.Island.update('timer');
        }
      }
      // alarms
      const now = new Date();
      if (now.getSeconds() < 2) {
        const key = now.getHours() + ':' + now.getMinutes();
        if (this.firedKey !== key) {
          const a = this.alarms.find((x) => x.on && x.h === now.getHours() && x.m === now.getMinutes());
          if (a) {
            this.firedKey = key;
            this.ring(a);
          }
        }
      }
    },

    ring(a) {
      if (!OS.state.screenOn) OS.Lock.wake();
      OS.sound('alarm', 8);
      OS.notify({ app: 'clock', title: 'Sveglia', body: `${a.label} · ${OS.fmt.time(new Date(2000, 0, 1, a.h, a.m))}`, data: { tab: 'alarms' }, force: true, silent: true });
      OS.UI.alert({
        title: a.label || 'Sveglia',
        message: OS.fmt.time(new Date(2000, 0, 1, a.h, a.m)),
        buttons: [
          { label: 'Posticipa', onTap: () => { const d = new Date(Date.now() + 9 * 60000); this.alarms.push({ id: 'snooze' + Date.now(), h: d.getHours(), m: d.getMinutes(), label: 'Posticipata', on: true, once: true }); this.save(); } },
          { label: 'Interrompi', style: 'default', onTap: () => { if (a.once) { this.alarms = this.alarms.filter((x) => x !== a); this.save(); } } },
        ],
      });
    },
  };
  OS.ClockService = Service;
  OS.onBoot(() => setInterval(() => Service.tick(), 500));

  /* ---------------- World clock data ---------------- */

  const CITIES = [
    { name: 'Roma', tz: 'Europe/Rome' },
    { name: 'Londra', tz: 'Europe/London' },
    { name: 'New York', tz: 'America/New_York' },
    { name: 'Los Angeles', tz: 'America/Los_Angeles' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'Sydney', tz: 'Australia/Sydney' },
  ];

  function tzInfo(tz) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('it-IT', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => +parts.find((p) => p.type === t).value;
    const local = new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    const diffH = Math.round((local - new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())) / 3600000);
    const dayDiff = local.getDate() !== now.getDate() ? (local > now ? 'Domani' : 'Ieri') : 'Oggi';
    return { time: OS.fmt.time(local), offset: `${dayDiff}, ${diffH >= 0 ? '+' : ''}${diffH} h`, hour: local.getHours(), minute: local.getMinutes() };
  }

  /* ---------------- App ---------------- */

  OS.registerApp({
    id: 'clock',
    name: 'Orologio',
    keywords: 'orologio sveglia timer cronometro',
    quickActions: [
      { label: 'Crea sveglia', icon: 'alarm', data: { tab: 'alarms', add: true } },
      { label: 'Avvia cronometro', icon: 'stopwatch', data: { tab: 'stopwatch', start: true } },
      { label: 'Avvia timer', icon: 'timer', data: { tab: 'timer' } },
    ],
    mount(root) {
      root.innerHTML = `<div class="clock-app">
        <section class="clock-view" data-v="world"></section>
        <section class="clock-view" data-v="alarms"></section>
        <section class="clock-view" data-v="stopwatch"></section>
        <section class="clock-view" data-v="timer"></section>
      </div>`;
      const views = {};
      root.querySelectorAll('.clock-view').forEach((v) => { views[v.dataset.v] = v; });
      let tab = OS.store.get('clock:tab', 'world');
      let raf = null;

      const tb = OS.UI.tabBar([
        { id: 'world', label: 'Mondo', icon: 'globe' },
        { id: 'alarms', label: 'Sveglie', icon: 'alarm-fill' },
        { id: 'stopwatch', label: 'Cronometro', icon: 'stopwatch-fill' },
        { id: 'timer', label: 'Timer', icon: 'timer-fill' },
      ], tab, (id) => show(id));
      root.querySelector('.clock-app').appendChild(tb);

      function show(id) {
        tab = id;
        OS.store.set('clock:tab', id);
        tb.set(id);
        Object.keys(views).forEach((k) => views[k].classList.toggle('on', k === id));
        render[id]();
      }

      const header = (title, left, right) => `<header class="cv-head"><div class="cv-btns"><div>${left || ''}</div><div>${right || ''}</div></div><h1 class="large-title" style="padding:0">${title}</h1></header>`;

      const render = {
        world() {
          const v = views.world;
          v.innerHTML = header('Ora internazionale', '<button class="gbtn glass tint" data-a="edit">Modifica</button>', `<button class="gbtn glass" data-a="add">${OS.sym('plus', { stroke: 2.4 })}</button>`)
            + `<div class="cv-body scroll">${CITIES.map((c) => {
              const i = tzInfo(c.tz);
              return `<div class="wc-row"><div><div class="wc-off">${i.offset}</div><div class="wc-city">${c.name}</div></div><div class="wc-time tnum">${i.time}</div></div>`;
            }).join('')}</div>`;
          v.querySelector('[data-a="add"]').onclick = () => OS.UI.alert({ title: 'Aggiungi città', message: 'Le città disponibili sono già nell\'elenco.', buttons: [{ label: 'OK', style: 'default' }] });
          v.querySelector('[data-a="edit"]').onclick = () => {};
        },

        alarms() {
          const v = views.alarms;
          v.innerHTML = header('Sveglie', '', `<button class="gbtn glass" data-a="add">${OS.sym('plus', { stroke: 2.4 })}</button>`)
            + `<div class="cv-body scroll"><div class="al-section">${OS.sym('bed', { size: 18 })} Riposo | Sveglia</div>
              <div class="al-row muted"><div><div class="al-time">Nessuna sveglia</div></div><button class="btn" style="height:32px;padding:0 14px;font-size:14px">Configura</button></div>
              <div class="al-section">Altre</div>
              <div class="al-list"></div></div>`;
          const list = v.querySelector('.al-list');
          Service.alarms.slice().sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)).forEach((a) => {
            const row = OS.el(`<div class="al-row ${a.on ? '' : 'muted'}"><div class="al-main"><div class="al-time tnum">${OS.fmt.time(new Date(2000, 0, 1, a.h, a.m))}</div><div class="al-label">${OS.esc(a.label)}</div></div></div>`);
            row.appendChild(OS.UI.toggle(a.on, (on) => { a.on = on; row.classList.toggle('muted', !on); Service.save(); }));
            row.querySelector('.al-main').addEventListener('click', () => editAlarm(a));
            list.appendChild(row);
          });
          v.querySelector('[data-a="add"]').onclick = () => editAlarm(null);
        },

        stopwatch() {
          const v = views.stopwatch;
          v.innerHTML = `<div class="sw-display tnum">00:00,00</div>
            <div class="sw-btns"><button class="round-btn gray" data-a="lap">Giro</button><button class="round-btn green" data-a="start">Avvia</button></div>
            <div class="sw-laps scroll"></div>`;
          v.querySelector('[data-a="lap"]').onclick = () => {
            const s = Service.sw;
            if (s.running) { s.laps.unshift(Service.swElapsed()); }
            else { s.elapsed = 0; s.laps = []; }
            paintSW(true);
          };
          v.querySelector('[data-a="start"]').onclick = () => {
            const s = Service.sw;
            if (s.running) { s.elapsed = Service.swElapsed(); s.running = false; }
            else { s.start = Date.now(); s.running = true; }
            paintSW(true);
          };
          paintSW(true);
        },

        timer() {
          const v = views.timer;
          v.innerHTML = '<div class="tm-wrap"></div>';
          paintTimer();
        },
      };

      function swFmt(ms) {
        const cs = Math.floor(ms / 10) % 100;
        const s = Math.floor(ms / 1000) % 60;
        const m = Math.floor(ms / 60000);
        return `${pad(m)}:${pad(s)},${pad(cs)}`;
      }

      function paintSW(full) {
        const v = views.stopwatch;
        const s = Service.sw;
        const disp = v.querySelector('.sw-display');
        if (!disp) return;
        disp.textContent = swFmt(Service.swElapsed());
        if (!full) return;
        const lap = v.querySelector('[data-a="lap"]');
        const start = v.querySelector('[data-a="start"]');
        lap.textContent = s.running || !s.elapsed ? 'Giro' : 'Azzera';
        lap.disabled = !s.running && !s.elapsed;
        start.textContent = s.running ? 'Stop' : 'Avvia';
        start.className = 'round-btn ' + (s.running ? 'red' : 'green');
        const laps = s.laps.map((t, i, arr) => (i === arr.length - 1 ? t : t - arr[i + 1]));
        const min = Math.min(...laps), max = Math.max(...laps);
        v.querySelector('.sw-laps').innerHTML = (s.running ? `<div class="lap-row"><span>Giro ${s.laps.length + 1}</span><span class="tnum cur-lap">${swFmt(Service.swElapsed() - (s.laps[0] || 0))}</span></div>` : '')
          + laps.map((t, i) => `<div class="lap-row ${laps.length > 1 && t === min ? 'best' : ''} ${laps.length > 1 && t === max ? 'worst' : ''}"><span>Giro ${laps.length - i}</span><span class="tnum">${swFmt(t)}</span></div>`).join('');
      }

      let wheels = null;
      function paintTimer() {
        const v = views.timer.querySelector('.tm-wrap');
        if (!v) return;
        const t = Service.timer;
        if (t.state === 'idle') {
          const d = t.duration || 300;
          v.innerHTML = `<div class="tm-pick wheel-picker"></div>
            <div class="sw-btns"><button class="round-btn gray" disabled>Annulla</button><button class="round-btn green" data-a="start">Avvia</button></div>
            <div class="section" style="margin-top:28px"><div class="list"><div class="row"><div class="row-main">Al termine del timer</div><div class="row-value">Radar</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div></div></div>
            <div class="section"><div class="section-head">Recenti</div><div class="list">${[[0, 5, 0], [0, 10, 0], [0, 25, 0]].map(([h, m, s]) => `<div class="row tap" data-recent="${h * 3600 + m * 60 + s}"><div class="row-main"><div style="font-size:28px;font-weight:300">${h ? h + ':' : ''}${pad(m)}:${pad(s)}</div><div class="row-sub">${m} min</div></div><button class="mini-play">${OS.sym('play', { size: 16 })}</button></div>`).join('')}</div></div>`;
          const pick = v.querySelector('.tm-pick');
          const H = Array.from({ length: 24 }, (_, i) => String(i));
          const M = Array.from({ length: 60 }, (_, i) => String(i));
          wheels = [
            OS.UI.wheel(H, Math.floor(d / 3600), null, { unit: 'ore' }),
            OS.UI.wheel(M, Math.floor(d / 60) % 60, null, { unit: 'min' }),
            OS.UI.wheel(M, d % 60, null, { unit: 's' }),
          ];
          wheels.forEach((w) => pick.appendChild(w.fragment || w));
          v.querySelector('[data-a="start"]').onclick = () => {
            const sec = wheels[0].get() * 3600 + wheels[1].get() * 60 + wheels[2].get();
            if (sec > 0) Service.startTimer(sec);
          };
          v.querySelectorAll('[data-recent]').forEach((r) => r.addEventListener('click', () => Service.startTimer(+r.dataset.recent)));
        } else {
          const rem = Service.timerRemaining();
          const C = 2 * Math.PI * 140;
          v.innerHTML = `<div class="tm-ring"><svg viewBox="0 0 300 300"><circle cx="150" cy="150" r="140" fill="none" stroke="var(--fill)" stroke-width="8"/>
              <circle class="tm-arc" cx="150" cy="150" r="140" fill="none" stroke="var(--orange)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - rem / t.duration)}" transform="rotate(-90 150 150)"/></svg>
              <div class="tm-center"><div class="tm-left tnum">${OS.fmt.duration(Math.ceil(rem))}</div><div class="tm-end">${OS.sym('bell-fill', { size: 14 })} ${OS.fmt.time(new Date(Date.now() + rem * 1000))}</div></div></div>
            <div class="sw-btns"><button class="round-btn gray" data-a="cancel">Annulla</button><button class="round-btn ${t.state === 'running' ? 'orange' : 'green'}" data-a="toggle">${t.state === 'running' ? 'Pausa' : 'Riprendi'}</button></div>`;
          v.querySelector('[data-a="cancel"]').onclick = () => Service.cancelTimer();
          v.querySelector('[data-a="toggle"]').onclick = () => (t.state === 'running' ? Service.pauseTimer() : Service.resumeTimer());
        }
      }

      function tickTimerUI() {
        const v = views.timer;
        const left = v.querySelector('.tm-left');
        if (!left) return;
        const t = Service.timer;
        const rem = Service.timerRemaining();
        left.textContent = OS.fmt.duration(Math.ceil(rem));
        const C = 2 * Math.PI * 140;
        const arc = v.querySelector('.tm-arc');
        if (arc && t.duration) arc.setAttribute('stroke-dashoffset', String(C * (1 - rem / t.duration)));
      }

      function editAlarm(a) {
        const isNew = !a;
        const draft = a ? Object.assign({}, a) : { id: 'a' + Date.now(), h: new Date().getHours(), m: new Date().getMinutes(), label: 'Sveglia', on: true };
        let hw = null, mw = null;
        OS.UI.sheet(root, {
          title: isNew ? 'Aggiungi sveglia' : 'Modifica sveglia',
          left: { icon: 'xmark', label: 'Annulla' },
          right: {
            icon: 'check', label: 'Salva', primary: true,
            onTap(api) {
              draft.h = hw.get(); draft.m = mw.get();
              draft.label = api.body.querySelector('.al-input').value || 'Sveglia';
              draft.on = true;
              if (isNew) Service.alarms.push(draft); else Object.assign(a, draft);
              Service.save();
              api.close();
              render.alarms();
            },
          },
          render(body, api) {
            const pick = OS.el('<div class="wheel-picker" style="margin:4px 0 20px"></div>');
            hw = OS.UI.wheel(Array.from({ length: 24 }, (_, i) => pad(i)), draft.h);
            mw = OS.UI.wheel(Array.from({ length: 60 }, (_, i) => pad(i)), draft.m);
            pick.appendChild(hw);
            pick.appendChild(OS.el('<div style="align-self:center;font-size:22px">:</div>'));
            pick.appendChild(mw);
            body.appendChild(pick);
            body.appendChild(OS.el(`<div class="section"><div class="list">
              <div class="row"><div class="row-main">Ripeti</div><div class="row-value">Mai</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div>
              <div class="row"><div class="row-main">Etichetta</div><input class="al-input" value="${OS.esc(draft.label)}" style="border:0;outline:0;background:transparent;text-align:right;color:var(--label2);font-size:17px;width:160px"></div>
              <div class="row"><div class="row-main">Suono</div><div class="row-value">Radar</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div>
            </div></div>`));
            if (!isNew) {
              const del = OS.el('<div class="section"><div class="list"><button class="row destructive">Elimina sveglia</button></div></div>');
              del.querySelector('button').addEventListener('click', () => {
                Service.alarms = Service.alarms.filter((x) => x.id !== a.id);
                Service.save();
                api.close();
                render.alarms();
              });
              body.appendChild(del);
            }
          },
        });
      }

      const onTimer = () => { if (tab === 'timer') paintTimer(); };
      const offTimer = OS.on('timer', onTimer);
      const offUnit = OS.on('setting:use24h', () => render[tab]());

      function loop() {
        if (tab === 'stopwatch') {
          paintSW(false);
          const cur = views.stopwatch.querySelector('.cur-lap');
          if (cur) cur.textContent = swFmt(Service.swElapsed() - (Service.sw.laps[0] || 0));
        }
        if (tab === 'timer') tickTimerUI();
        raf = requestAnimationFrame(loop);
      }
      let worldT = setInterval(() => { if (tab === 'world') render.world(); }, 15000);

      show(tab);
      return {
        onShow(data) {
          if (data && data.tab) show(data.tab);
          if (data && data.add) editAlarm(null);
          if (data && data.start && !Service.sw.running) { Service.sw.start = Date.now(); Service.sw.running = true; paintSW(true); }
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(loop);
          if (tab === 'world') render.world();
        },
        onHide() { cancelAnimationFrame(raf); },
        onDestroy() { cancelAnimationFrame(raf); clearInterval(worldT); offTimer(); offUnit(); },
      };
    },
  });
})();
