/* ==========================================================================
   Telefono — favourites, recents, contacts, keypad (DTMF), call screen,
   call live activity in the Dynamic Island
   ========================================================================== */
(function () {
  'use strict';

  const now = Date.now();
  const Recents = {
    list: OS.store.get('calls', [
      { name: 'Mamma', type: 'in', time: now - 3 * 3600000, missed: false },
      { name: 'Giulia Rossi', type: 'in', time: now - 26 * 3600000, missed: true },
      { name: 'Marco Bianchi', type: 'out', time: now - 50 * 3600000, missed: false },
      { name: '+39 02 1234 5678', type: 'in', time: now - 75 * 3600000, missed: true },
      { name: 'Nonna', type: 'out', time: now - 5 * 86400000, missed: false },
    ]),
    add(c) { this.list.unshift(c); this.list = this.list.slice(0, 40); OS.store.set('calls', this.list); },
  };

  const LETTERS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ', 0: '+' };

  /* one call at a time, shared with the Dynamic Island */
  const Call = {
    active: null, // { name, start, connected, muted, speaker, video }
    timer: null,
    ringT: null,
    start(name, video) {
      if (this.active) return;
      this.active = { name, start: 0, connected: false, muted: false, speaker: false, video: !!video };
      Recents.add({ name, type: 'out', time: Date.now(), missed: false });
      OS.sound('ring', 0); OS.sound('ring', 1.6);
      this.ringT = setTimeout(() => {
        if (!this.active) return;
        this.active.connected = true;
        this.active.start = Date.now();
        OS.emit('call');
      }, 3200);
      this.timer = setInterval(() => { OS.emit('call:tick'); OS.Island.update('call'); }, 1000);
      OS.Island.set('call', {
        priority: 3,
        width: 216,
        left: () => `<span style="color:var(--green);display:flex;gap:6px;align-items:center">${OS.sym('phone', { size: 16 })}<span class="tnum">${Call.label()}</span></span>`,
        right: () => '<div class="isl-bars" style="--c:#30d158"><i></i><i></i><i></i><i></i></div>',
        bubble: () => `<span style="color:var(--green);display:flex">${OS.sym('phone', { size: 16 })}</span>`,
        expandedHeight: 96,
        expanded(el) {
          el.innerHTML = `<div class="isl-row" style="height:100%"><div><div class="isl-sub">${Call.label()}</div><div class="isl-title">${OS.esc(Call.active ? Call.active.name : '')}</div></div>
            <button class="isl-btn" data-a="mute" style="margin-left:auto">${OS.sym(Call.active && Call.active.muted ? 'mic-slash' : 'mic', { size: 20 })}</button>
            <button class="isl-btn red" data-a="end">${OS.sym('phone-down', { size: 22 })}</button></div>`;
          el.querySelector('[data-a="end"]').onclick = (e) => { e.stopPropagation(); OS.Island.collapse(); Call.end(); };
          el.querySelector('[data-a="mute"]').onclick = (e) => { e.stopPropagation(); Call.active.muted = !Call.active.muted; OS.Island.update('call'); OS.emit('call'); };
        },
        onTap() { OS.Apps.open('phone'); },
      });
      OS.emit('call');
    },
    label() {
      const a = this.active;
      if (!a) return '';
      return a.connected ? OS.fmt.duration((Date.now() - a.start) / 1000) : 'Chiamata…';
    },
    end() {
      if (!this.active) return;
      clearInterval(this.timer);
      clearTimeout(this.ringT);
      this.active = null;
      OS.Island.clear('call');
      OS.sound('lock');
      OS.emit('call');
    },
  };
  OS.Call = Call;

  OS.registerApp({
    id: 'phone',
    name: 'Telefono',
    keywords: 'telefono chiamate contatti tastierino',
    quickActions: [
      { label: 'Tastierino', icon: 'keypad', data: { tab: 'keypad' } },
      { label: 'Chiama Mamma', icon: 'phone', data: { call: 'Mamma' } },
    ],
    mount(root) {
      root.innerHTML = `<div class="ph2-app">
        <section class="ph2-view" data-v="favorites"></section>
        <section class="ph2-view" data-v="recents"></section>
        <section class="ph2-view" data-v="contacts"></section>
        <section class="ph2-view" data-v="keypad"></section>
        <div class="call-screen"></div>
      </div>`;
      const views = {};
      root.querySelectorAll('.ph2-view').forEach((v) => { views[v.dataset.v] = v; });
      const callEl = root.querySelector('.call-screen');
      let tab = 'keypad';
      let number = '';

      const tb = OS.UI.tabBar([
        { id: 'favorites', label: 'Preferiti', icon: 'star-fill' },
        { id: 'recents', label: 'Recenti', icon: 'clock-fill' },
        { id: 'contacts', label: 'Contatti', icon: 'person-circle' },
        { id: 'keypad', label: 'Tastierino', icon: 'keypad' },
      ], tab, show);
      root.querySelector('.ph2-app').appendChild(tb);

      function show(id) {
        tab = id;
        tb.set(id);
        Object.keys(views).forEach((k) => views[k].classList.toggle('on', k === id));
        R[id]();
      }

      const avatar = (c, size) => `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px;background:${c ? c.color : 'linear-gradient(180deg,#a5a5ac,#84848b)'}">${c ? OS.esc(c.initials) : OS.sym('person-fill', { size: size * .55 })}</div>`;
      const find = (name) => OS.Contacts.find((c) => c.name === name);

      const R = {
        favorites() {
          const favs = OS.Contacts.filter((c) => c.fav);
          views.favorites.innerHTML = `<div class="ph2-head"><h1 class="large-title" style="padding:0">Preferiti</h1></div>
            <div class="scroll ph2-body"><div class="section"><div class="list">${favs.map((c) => `<div class="row tap" data-call="${OS.esc(c.name)}">${avatar(c, 40)}<div class="row-main"><div class="row-title" style="font-weight:600">${OS.esc(c.name)}</div><div class="row-sub">${OS.sym('phone', { size: 12, style: 'display:inline' })} cellulare</div></div><span class="row-info" style="color:var(--accent)">${OS.sym('info', { size: 22 })}</span></div>`).join('')}</div></div></div>`;
        },
        recents() {
          views.recents.innerHTML = `<div class="ph2-head"><h1 class="large-title" style="padding:0">Recenti</h1></div>
            <div class="scroll ph2-body"><div class="section"><div class="list">${Recents.list.map((r) => {
              const c = find(r.name);
              return `<div class="row tap" data-call="${OS.esc(r.name)}">${avatar(c, 40)}<div class="row-main"><div class="row-title" style="font-weight:600;${r.missed ? 'color:var(--red)' : ''}">${OS.esc(r.name)}</div><div class="row-sub">${r.type === 'out' ? '↗ In uscita' : r.missed ? 'Senza risposta' : '↙ In entrata'}</div></div><div class="row-value" style="font-size:15px">${OS.fmt.relative(r.time)}</div><span class="row-info" style="color:var(--accent)">${OS.sym('info', { size: 22 })}</span></div>`;
            }).join('')}</div></div></div>`;
        },
        contacts() {
          const sorted = OS.Contacts.slice().sort((a, b) => a.name.localeCompare(b.name, 'it'));
          const groups = {};
          sorted.forEach((c) => { (groups[c.name[0].toUpperCase()] = groups[c.name[0].toUpperCase()] || []).push(c); });
          views.contacts.innerHTML = `<div class="ph2-head"><h1 class="large-title" style="padding:0">Contatti</h1></div>
            <div class="scroll ph2-body"><div class="search-field">${OS.sym('search')}<input type="search" placeholder="Cerca"></div>
            <div class="section"><div class="list"><div class="row" style="min-height:76px">${avatar(null, 56)}<div class="row-main"><div class="row-title" style="font-size:20px;font-weight:600">${OS.esc(OS.settings.userName)}</div><div class="row-sub">La mia scheda</div></div></div></div></div>
            ${Object.keys(groups).map((k) => `<div class="section"><div class="section-head">${k}</div><div class="list">${groups[k].map((c) => `<div class="row tap" data-contact="${OS.esc(c.name)}"><div class="row-main">${OS.esc(c.name)}</div></div>`).join('')}</div></div>`).join('')}</div>`;
          const input = views.contacts.querySelector('input');
          input.addEventListener('input', () => {
            const q = input.value.toLowerCase();
            views.contacts.querySelectorAll('[data-contact]').forEach((r) => { r.style.display = r.dataset.contact.toLowerCase().includes(q) ? '' : 'none'; });
          });
        },
        keypad() {
          views.keypad.innerHTML = `<div class="kp">
            <div class="kp-number tnum"></div>
            <div class="kp-add">${number ? 'Aggiungi numero' : ''}</div>
            <div class="kp-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => `<button class="kp-key" data-k="${k}"><b>${k}</b><span>${LETTERS[k] || (k === '1' ? '&nbsp;' : '')}</span></button>`).join('')}
              <div></div><button class="kp-call" data-a="call" aria-label="Chiama">${OS.sym('phone', { size: 34 })}</button><button class="kp-del" data-a="del" aria-label="Cancella">${OS.sym('delete', { size: 28, stroke: 1.8 })}</button></div>
          </div>`;
          paintNumber();
        },
      };

      function paintNumber() {
        const el = views.keypad.querySelector('.kp-number');
        if (!el) return;
        el.textContent = number;
        el.style.fontSize = number.length > 12 ? '28px' : '';
        views.keypad.querySelector('.kp-del').style.visibility = number ? 'visible' : 'hidden';
        const c = OS.Contacts.find((x) => x.phone.replace(/\s/g, '') === number.replace(/\s/g, ''));
        views.keypad.querySelector('.kp-add').textContent = c ? c.name : number ? 'Aggiungi numero' : '';
      }

      function contactCard(name) {
        const c = find(name);
        if (!c) return;
        OS.UI.sheet(root, {
          title: '', large: true, left: { icon: 'xmark', label: 'Chiudi' },
          render(body, api) {
            body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 0 20px">${avatar(c, 110)}<div style="font-size:28px;font-weight:700">${OS.esc(c.name)}</div></div>
              <div class="cc-actions">${[['message-fill', 'messaggio', 'msg'], ['phone', 'chiama', 'call'], ['video-fill', 'video', 'video'], ['person-fill', 'condividi', 'share']].map(([ic, l, a]) => `<button data-a="${a}">${OS.sym(ic, { size: 22 })}<span>${l}</span></button>`).join('')}</div>
              <div class="section"><div class="list"><div class="row"><div class="row-main"><div class="row-sub" style="margin:0 0 2px">cellulare</div><div style="color:var(--accent)">${OS.esc(c.phone)}</div></div></div></div></div>
              <div class="section"><div class="list"><div class="row"><div class="row-main">Note</div></div></div></div>`;
            body.addEventListener('click', (e) => {
              const b = e.target.closest('[data-a]');
              if (!b) return;
              if (b.dataset.a === 'call' || b.dataset.a === 'video') { api.close(); Call.start(c.name, b.dataset.a === 'video'); }
              if (b.dataset.a === 'msg') {
                api.close();
                const chat = OS.MessagesStore && Object.values(OS.MessagesStore.chats).find((x) => x.name === c.name);
                OS.Apps.open('messages', { data: chat ? { chat: chat.id } : { compose: true } });
              }
            });
          },
        });
      }

      function paintCall() {
        const a = Call.active;
        callEl.classList.toggle('on', !!a);
        if (!a) return;
        const c = find(a.name);
        callEl.innerHTML = `<div class="call-bg" style="background:${c ? c.color : 'linear-gradient(180deg,#4a4a52,#1c1c1e)'}"></div>
          <div class="call-top">${avatar(c, 92)}<div class="call-name">${OS.esc(a.name)}</div><div class="call-status tnum">${a.connected ? Call.label() : (a.video ? 'FaceTime…' : 'Chiamata in corso…')}</div></div>
          <div class="call-grid">${[
            ['speaker', 'audio', a.speaker], ['video-fill', 'FaceTime', a.video], [a.muted ? 'mic-slash' : 'mic', 'muto', a.muted],
            ['person-add', 'aggiungi', false], ['xmark', 'fine', null], ['keypad', 'tastierino', false],
          ].map(([ic, l, on], i) => (i === 4 ? `<button class="call-end" data-c="end">${OS.sym('phone-down', { size: 34 })}</button>`
            : `<button class="call-btn ${on ? 'on' : ''}" data-c="${l}"><span class="glass">${OS.sym(ic, { size: 26 })}</span><small>${l}</small></button>`)).join('')}</div>`;
      }

      root.querySelector('.ph2-app').addEventListener('click', (e) => {
        const call = e.target.closest('[data-call]');
        if (call && e.target.closest('.row-info')) { contactCard(call.dataset.call); return; }
        if (call) { Call.start(call.dataset.call); return; }
        const ct = e.target.closest('[data-contact]');
        if (ct) { contactCard(ct.dataset.contact); return; }
        const k = e.target.closest('[data-k]');
        if (k) { if (number.length < 18) number += k.dataset.k; OS.sound('dtmf', k.dataset.k); paintNumber(); return; }
        const a = e.target.closest('[data-a]');
        if (a && a.dataset.a === 'del') { number = number.slice(0, -1); paintNumber(); return; }
        if (a && a.dataset.a === 'call') {
          if (!number) { number = (Recents.list.find((r) => r.type === 'out') || { name: '' }).name; paintNumber(); return; }
          const c = OS.Contacts.find((x) => x.phone.replace(/\s/g, '') === number.replace(/\s/g, ''));
          Call.start(c ? c.name : number);
          number = '';
          return;
        }
        const cb = e.target.closest('[data-c]');
        if (cb && Call.active) {
          const v = cb.dataset.c;
          if (v === 'end') Call.end();
          else if (v === 'muto') Call.active.muted = !Call.active.muted;
          else if (v === 'audio') Call.active.speaker = !Call.active.speaker;
          else if (v === 'FaceTime') Call.active.video = !Call.active.video;
          paintCall();
        }
      });

      const onKey = (e) => {
        const visible = OS.Apps.current && OS.Apps.current.id === 'phone' && OS.Apps.mode === 'app' && tab === 'keypad' && !Call.active;
        if (!visible) return;
        if (/^[\d*#]$/.test(e.key)) { number += e.key; OS.sound('dtmf', e.key); paintNumber(); }
        if (e.key === 'Backspace') { number = number.slice(0, -1); paintNumber(); }
      };
      window.addEventListener('keydown', onKey);

      const off1 = OS.on('call', () => { paintCall(); if (tab === 'recents') R.recents(); });
      const off2 = OS.on('call:tick', () => {
        const st = callEl.querySelector('.call-status');
        if (st && Call.active && Call.active.connected) st.textContent = Call.label();
      });
      show(tab);
      paintCall();
      return {
        onShow(data) {
          if (data && data.tab) show(data.tab);
          if (data && data.call) Call.start(data.call, data.video);
          if (data && data.contact) { show('contacts'); contactCard(data.contact); }
          paintCall();
        },
        onDestroy() { off1(); off2(); window.removeEventListener('keydown', onKey); },
      };
    },
  });
})();
