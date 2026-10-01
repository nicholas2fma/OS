/* ==========================================================================
   Messaggi — conversations, bubbles, typing indicator, simulated replies
   ========================================================================== */
(function () {
  'use strict';

  OS.Contacts = [
    { name: 'Mamma', initials: 'M', color: 'linear-gradient(180deg,#ff8fa3,#ff4d6d)', phone: '+39 333 123 4567', fav: true },
    { name: 'Giulia Rossi', initials: 'GR', color: 'linear-gradient(180deg,#b388ff,#7c4dff)', phone: '+39 347 555 0192', fav: true },
    { name: 'Marco Bianchi', initials: 'MB', color: 'linear-gradient(180deg,#64b5f6,#1e88e5)', phone: '+39 320 444 8811', fav: true },
    { name: 'Sara Verdi', initials: 'SV', color: 'linear-gradient(180deg,#81c784,#43a047)', phone: '+39 339 222 7730' },
    { name: 'Luca Ferrari', initials: 'LF', color: 'linear-gradient(180deg,#ffb74d,#fb8c00)', phone: '+39 328 900 1122' },
    { name: 'Nonna', initials: 'N', color: 'linear-gradient(180deg,#f48fb1,#ec407a)', phone: '+39 06 555 1234', fav: true },
    { name: 'Alessandro Conti', initials: 'AC', color: 'linear-gradient(180deg,#90a4ae,#546e7a)', phone: '+39 345 678 9012' },
    { name: 'Chiara Romano', initials: 'CR', color: 'linear-gradient(180deg,#4dd0e1,#00acc1)', phone: '+39 331 246 8100' },
  ];
  const contact = (name) => OS.Contacts.find((c) => c.name === name);

  const now = Date.now();
  const m = (from, text, ago) => ({ from, text, time: now - ago * 60000 });
  const DEFAULT = {
    benvenuto: { id: 'benvenuto', name: 'iOS 27 Web', avatar: 'linear-gradient(180deg,#5ac8fa,#007aff)', initials: '27', unread: 1, bot: 'help', messages: [
      m('them', 'Ciao! 👋 Questo è un iPhone con iOS 27 ricreato con tecnologie web.', 30),
      m('them', 'Novità: tieni premuto il tasto laterale (o premi S) per Siri, oppure scorri giù dal centro in alto per «Cerca o chiedi».', 30),
      m('them', 'Scorri in alto dalla barra in basso per tornare alla Home, tieni premuta un\'icona per modificare la schermata, e prova il Centro di Controllo dall\'angolo in alto a destra.', 29),
      m('them', 'Scrivimi "aiuto" per altri suggerimenti.', 29),
    ] },
    mamma: { id: 'mamma', name: 'Mamma', unread: 0, messages: [
      m('them', 'Domenica vieni a pranzo?', 180), m('me', 'Certo! Porto il dolce 🍰', 175), m('them', 'Perfetto, ti aspettiamo alle 13 ❤️', 170),
    ] },
    giulia: { id: 'giulia', name: 'Giulia Rossi', unread: 0, messages: [
      m('me', 'Hai visto il nuovo design Liquid Glass?', 1440 + 60), m('them', 'Sì, è bellissimo! Tutto trasparente ✨', 1440 + 55), m('them', 'Ci vediamo stasera per l\'aperitivo?', 50),
    ] },
    marco: { id: 'marco', name: 'Marco Bianchi', unread: 0, messages: [
      m('them', 'Mi mandi le foto della gita?', 2 * 1440), m('me', 'Appena torno a casa!', 2 * 1440 - 10),
    ] },
    calcetto: { id: 'calcetto', name: 'Calcetto del giovedì', group: ['Luca Ferrari', 'Alessandro Conti', 'Marco Bianchi'], avatar: 'linear-gradient(180deg,#a5d6a7,#388e3c)', initials: '⚽', unread: 0, messages: [
      m('them', 'Giovedì alle 21, campo 3. Chi c\'è?', 4 * 1440), m('me', 'Io ci sono 💪', 4 * 1440 - 30),
    ] },
  };

  const Store = {
    chats: (function () {
      const c = OS.store.get('messages', DEFAULT);
      // conversation saved by the iOS 26 version
      if (c.benvenuto && c.benvenuto.name === 'iOS 26 Web') { c.benvenuto.name = 'iOS 27 Web'; c.benvenuto.initials = '27'; }
      return c;
    })(),
    save() { OS.store.set('messages', this.chats); updateBadge(); OS.emit('messages'); },
    sorted() { return Object.values(this.chats).sort((a, b) => last(b).time - last(a).time); },
  };
  const last = (c) => c.messages[c.messages.length - 1] || { text: '', time: 0 };

  function updateBadge() {
    const n = Object.values(Store.chats).reduce((s, c) => s + (c.unread || 0), 0);
    if (OS.Home && OS.Home.setBadge) OS.Home.setBadge('messages', n);
  }
  OS.onBoot(updateBadge);

  const REPLIES = {
    help: [
      [/aiuto|help|suggeriment/i, 'Ecco qualche idea: chiedi a Siri «imposta un timer di 5 minuti», aggiungi un widget extra-large tenendo premuto sulla Home, regola il Liquid Glass in Impostazioni › Aspetto, e prova la modalità Siri nella Fotocamera.'],
      [/glass|vetro|liquid/i, 'Il Liquid Glass usa backdrop-filter e, nei browser Chromium, un filtro SVG che piega la luce ai bordi. Puoi cambiare stile in Impostazioni › Schermo e luminosità.'],
      [/ciao|salve|hey/i, 'Ciao! Come posso aiutarti? Scrivi "aiuto" 😊'],
      [/grazie/i, 'Figurati! Buon divertimento 🎉'],
    ],
    generic: [
      [/^(ciao|hey|ehi|salve)/i, ['Ciao! Come stai? 😊', 'Ehi! Tutto bene?', 'Ciao!! 👋']],
      [/come stai|come va/i, ['Tutto bene, grazie! E tu?', 'Bene dai, un po\' stanco 😅', 'Alla grande! Tu?']],
      [/stasera|cena|aperitivo|pranzo/i, ['Per me va benissimo, a che ora?', 'Ci sto! Dove?', 'Stasera non riesco, facciamo domani?']],
      [/grazie/i, ['Di niente! 😊', 'Figurati ❤️']],
      [/\?$/, ['Bella domanda 🤔', 'Direi di sì!', 'Non saprei, ti faccio sapere', 'Mmm, forse 😄']],
      [/foto|immagin/i, ['Mandamele appena puoi 📸', 'Che belle!']],
      [/^disegno$/i, ['Che bel disegno! 🎨', 'Ahah, sei un artista 😄', 'Lo stampo e lo appendo al frigo 😂']],
      [/.*/, ['Ahah 😂', 'Ok perfetto 👍', 'Davvero?', 'Ci sentiamo dopo!', 'Va bene ❤️', 'Fantastico!', 'Hai ragione']],
    ],
  };

  function replyFor(chat, text) {
    const rules = chat.bot === 'help' ? REPLIES.help : REPLIES.generic;
    for (const [re, out] of rules) {
      if (re.test(text)) return Array.isArray(out) ? out[Math.floor(Math.random() * out.length)] : out;
    }
    return chat.bot === 'help' ? 'Scrivi "aiuto" per qualche suggerimento su cosa provare.' : 'Ok!';
  }

  function avatarHTML(chat, size) {
    const c = contact(chat.name);
    const bg = chat.avatar || (c && c.color) || 'linear-gradient(180deg,#a5a5ac,#84848b)';
    const ini = chat.initials || (c && c.initials) || chat.name[0];
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px;background:${bg}">${OS.esc(ini)}</div>`;
  }

  function timeLabel(ts) {
    const d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return OS.fmt.time(d);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Ieri';
    if ((t - d) / 86400000 < 6) return OS.fmt.weekday(d);
    return OS.pad(d.getDate()) + '/' + OS.pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
  }

  let instance = null; // live app instance (for deciding notifications)

  /** called by the bot after a delay */
  function deliver(chatId, text) {
    const chat = Store.chats[chatId];
    if (!chat) return;
    const sender = chat.group ? chat.group[Math.floor(Math.random() * chat.group.length)] : null;
    chat.messages.push({ from: 'them', text, time: Date.now(), sender });
    const viewing = instance && instance.viewing() === chatId;
    if (!viewing) chat.unread = (chat.unread || 0) + 1;
    Store.save();
    if (viewing) { OS.sound('received'); return; }
    OS.notify({ app: 'messages', title: sender ? `${chat.name}` : chat.name, body: (sender ? sender.split(' ')[0] + ': ' : '') + text, data: { chat: chatId }, sound: 'received', force: !!instance && OS.Apps.current && OS.Apps.current.id === 'messages' });
  }

  OS.registerApp({
    id: 'messages',
    name: 'Messaggi',
    keywords: 'messaggi sms chat imessage',
    quickActions: [{ label: 'Nuovo messaggio', icon: 'compose', data: { compose: true } }],
    mount(root, ctx) {
      const nav = new OS.UI.Nav(root);
      let openChat = null;
      const typingTimers = {};

      const listPage = {
        title: 'Messaggi', large: true, cls: 'msg-list',
        render(body, page) {
          page.left.appendChild(OS.UI.gbtn(null, 'Modifica', () => {}, 'tint'));
          page.left.firstChild.textContent = 'Modifica';
          page.right.appendChild(OS.UI.gbtn('compose', 'Nuovo messaggio', () => compose()));
          page.paint = () => {
            body.innerHTML = `<div class="search-field">${OS.sym('search')}<input type="search" placeholder="Cerca"></div>
              <div class="msg-rows">${Store.sorted().map((c) => `<div class="msg-row" data-id="${c.id}">
                <span class="msg-unread ${c.unread ? 'on' : ''}"></span>${avatarHTML(c, 52)}
                <div class="msg-main"><div class="msg-top"><b>${OS.esc(c.name)}</b><span>${timeLabel(last(c).time)} ${OS.sym('chevron-right', { size: 12, stroke: 2.8 })}</span></div>
                <div class="msg-prev">${OS.esc((last(c).from === 'me' ? 'Tu: ' : '') + (last(c).img ? 'Disegno' : last(c).text))}</div></div></div>`).join('')}</div>`;
            const input = body.querySelector('input');
            input.addEventListener('input', () => {
              const q = input.value.toLowerCase();
              body.querySelectorAll('.msg-row').forEach((r) => {
                const c = Store.chats[r.dataset.id];
                r.style.display = !q || c.name.toLowerCase().includes(q) || c.messages.some((x) => x.text.toLowerCase().includes(q)) ? '' : 'none';
              });
            });
          };
          body.addEventListener('click', (e) => {
            const r = e.target.closest('.msg-row');
            if (r) openConversation(r.dataset.id);
          });
          page.paint();
        },
      };

      function compose() {
        OS.UI.sheet(root, {
          title: 'Nuovo messaggio', large: true, left: { icon: 'xmark', label: 'Annulla' },
          render(body, api) {
            body.innerHTML = `<div class="section"><div class="section-head">A:</div><div class="list">${OS.Contacts.map((c) => `<div class="row tap" data-n="${OS.esc(c.name)}"><div class="avatar" style="width:36px;height:36px;font-size:14px;background:${c.color}">${OS.esc(c.initials)}</div><div class="row-main"><div class="row-title">${OS.esc(c.name)}</div><div class="row-sub">${OS.esc(c.phone)}</div></div></div>`).join('')}</div></div>`;
            body.addEventListener('click', (e) => {
              const r = e.target.closest('[data-n]');
              if (!r) return;
              const name = r.dataset.n;
              let chat = Object.values(Store.chats).find((c) => c.name === name);
              if (!chat) {
                const id = 'c' + Date.now();
                chat = Store.chats[id] = { id, name, unread: 0, messages: [] };
                Store.save();
              }
              api.close();
              setTimeout(() => openConversation(chat.id), 200);
            });
          },
        });
      }

      function bubblesHTML(chat) {
        let html = '';
        let prevTime = 0;
        chat.messages.forEach((msg, i) => {
          if (msg.time - prevTime > 3600000) html += `<div class="msg-stamp">${timeLabel(msg.time) === OS.fmt.time(new Date(msg.time)) ? 'Oggi ' + OS.fmt.time(new Date(msg.time)) : timeLabel(msg.time) + ' ' + OS.fmt.time(new Date(msg.time))}</div>`;
          prevTime = msg.time;
          const next = chat.messages[i + 1];
          const tail = !next || next.from !== msg.from || next.time - msg.time > 60000;
          if (chat.group && msg.from === 'them' && msg.sender && (i === 0 || chat.messages[i - 1].sender !== msg.sender)) html += `<div class="msg-sender">${OS.esc(msg.sender)}</div>`;
          if (msg.img) { html += `<div class="bubble ${msg.from} img ${tail ? 'tail' : ''}"><img src="${OS.esc(msg.img)}" alt="Disegno"></div>`; return; }
          const emojiOnly = /^(\p{Extended_Pictographic}|\s){1,3}$/u.test(msg.text);
          html += `<div class="bubble ${msg.from} ${tail ? 'tail' : ''} ${emojiOnly ? 'emoji' : ''}">${OS.esc(msg.text)}</div>`;
        });
        const lastMe = chat.messages.length && chat.messages[chat.messages.length - 1].from === 'me';
        if (lastMe) html += '<div class="msg-delivered">Consegnato</div>';
        return html;
      }

      function openConversation(id) {
        const chat = Store.chats[id];
        if (!chat) return;
        if (nav.stack.length > 1) nav.popToRoot();
        openChat = id;
        chat.unread = 0;
        Store.save();
        nav.push({
          title: '', cls: 'msg-chat',
          render(body, page) {
            page.titleEl.innerHTML = `<div class="chat-title">${avatarHTML(chat, 38)}<span>${OS.esc(chat.name)} ${OS.sym('chevron-right', { size: 10, stroke: 3 })}</span></div>`;
            page.right.appendChild(OS.UI.gbtn('video', 'FaceTime', () => OS.Apps.open('phone', { data: { call: chat.name, video: true } })));
            body.innerHTML = `<div class="msg-thread"></div>`;
            const thread = body.querySelector('.msg-thread');
            const bar = OS.el(`<div class="msg-bar">
              <button class="gbtn glass msg-plus" aria-label="Allegati">${OS.sym('plus', { stroke: 2.4 })}</button>
              <div class="msg-field glass"><textarea rows="1" placeholder="iMessage"></textarea><button class="msg-send" aria-label="Invia">${OS.sym('arrow-up-circle-fill', { size: 30 })}</button><span class="msg-mic">${OS.sym('waveform', { size: 20 })}</span></div>
            </div>`);
            page.el.appendChild(bar);
            const ta = bar.querySelector('textarea');
            const sendBtn = bar.querySelector('.msg-send');
            const paint = (smooth) => {
              thread.innerHTML = bubblesHTML(chat) + (typingTimers[id] ? '<div class="bubble them tail typing"><i></i><i></i><i></i></div>' : '');
              requestAnimationFrame(() => page.scroller.scrollTo({ top: page.scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
            };
            page.paint = paint;
            paint(false);
            const sync = () => {
              bar.classList.toggle('has-text', !!ta.value.trim());
              ta.style.height = 'auto';
              ta.style.height = Math.min(110, ta.scrollHeight) + 'px';
            };
            ta.addEventListener('input', sync);
            ta.addEventListener('keydown', (e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            });
            sendBtn.addEventListener('click', () => send());
            bar.querySelector('.msg-plus').addEventListener('click', (e) => {
              OS.UI.menu(e.currentTarget, [
                { label: 'Disegno', icon: 'compose', onTap: () => openDrawing() },
                { label: 'Foto', icon: 'photo', onTap: () => { ta.value = '📷 Foto'; send(); } },
                { label: 'Posizione', icon: 'location-outline', onTap: () => { ta.value = '📍 Sono qui: Roma, Piazza Navona'; send(); } },
                { label: 'Adesivi', icon: 'star', onTap: () => { ta.value = '✨'; send(); } },
              ], { preview: false });
            });
            /** iOS 27: quick sketches from the "+" menu */
            function openDrawing() {
              const COLORS = ['#000000', '#ff3b30', '#ff9500', '#34c759', '#0a84ff', '#af52de', '#ffffff'];
              let color = OS.isDark() ? '#ffffff' : '#000000';
              let cv = null;
              let dirty = false;
              OS.UI.sheet(root, {
                title: 'Disegno',
                left: { icon: 'xmark', label: 'Annulla' },
                right: {
                  icon: 'arrow-up', label: 'Invia', primary: true,
                  onTap(api) { if (dirty) send(cv.toDataURL('image/png')); api.close(); },
                },
                render(body) {
                  body.innerHTML = `<div class="draw-wrap"><canvas class="draw-canvas"></canvas></div>
                    <div class="draw-tools">${COLORS.map((c) => `<button class="draw-col ${c === color ? 'on' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}<button class="draw-clear" aria-label="Cancella">${OS.sym('trash', { size: 20 })}</button></div>`;
                  cv = body.querySelector('canvas');
                  requestAnimationFrame(() => {
                    const r = cv.getBoundingClientRect();
                    cv.width = Math.round(r.width * 2);
                    cv.height = Math.round(r.height * 2);
                  });
                  const ctx = cv.getContext('2d');
                  let last = null;
                  const pos = (e) => { const r = OS.rectOf(cv); const p = OS.point(e); return { x: (p.x - r.x) / r.width * cv.width, y: (p.y - r.y) / r.height * cv.height }; };
                  cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); cv.setPointerCapture(e.pointerId); last = pos(e); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fill(); dirty = true; });
                  cv.addEventListener('pointermove', (e) => {
                    if (!last) return;
                    const p = pos(e);
                    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
                    last = p;
                  });
                  const up = () => { last = null; };
                  cv.addEventListener('pointerup', up);
                  cv.addEventListener('pointercancel', up);
                  body.addEventListener('click', (e) => {
                    const c = e.target.closest('[data-col]');
                    if (c) { color = c.dataset.col; body.querySelectorAll('.draw-col').forEach((x) => x.classList.toggle('on', x === c)); }
                    if (e.target.closest('.draw-clear')) { ctx.clearRect(0, 0, cv.width, cv.height); dirty = false; }
                  });
                },
              });
            }

            function send(img) {
              if (typeof img !== 'string') img = null;
              const text = img ? 'Disegno' : ta.value.trim();
              if (!text) return;
              chat.messages.push(img ? { from: 'me', text: '', img, time: Date.now() } : { from: 'me', text, time: Date.now() });
              ta.value = '';
              sync();
              Store.save();
              OS.sound('sent');
              paint(true);
              // simulated reply
              clearTimeout(typingTimers[id]);
              const delay = 700 + Math.random() * 900;
              setTimeout(() => {
                typingTimers[id] = setTimeout(() => {
                  typingTimers[id] = null;
                  deliver(id, replyFor(chat, text));
                  if (openChat === id && page.paint) page.paint(true);
                }, 1300 + Math.random() * 1500);
                if (openChat === id && page.paint) page.paint(true);
              }, delay);
            }
          },
          onHide() { openChat = null; if (listPage.paint) listPage.paint(); },
        });
      }

      nav.push(listPage, false);
      const off = OS.on('messages', () => {
        if (nav.stack.length === 1 && listPage.paint) listPage.paint();
        const cur = nav.current;
        if (openChat && cur && cur.paint && cur !== listPage) cur.paint(true);
      });
      instance = { viewing: () => (ctx.isVisible() ? openChat : null) };
      return {
        onShow(data) {
          if (data && data.chat) openConversation(data.chat);
          if (data && data.compose) { nav.popToRoot(); compose(); }
          if (openChat) { const c = Store.chats[openChat]; if (c && c.unread) { c.unread = 0; Store.save(); } }
        },
        onDestroy() { off(); instance = null; },
      };
    },
  });

  // occasional incoming messages so the system feels alive
  OS.onBoot(() => {
    const pool = [
      ['giulia', 'Allora confermato per le 19:30? 🍹'],
      ['mamma', 'Hai mangiato? 😊'],
      ['marco', 'Partita stasera?'],
      ['calcetto', 'Manca uno per giovedì, qualcuno porta un amico?'],
    ];
    let k = 0;
    setTimeout(function tick() {
      if (!OS.state.locked || OS.store.get('welcomed')) {
        const [id, text] = pool[k++ % pool.length];
        deliver(id, text);
      }
      if (k < pool.length) setTimeout(tick, 120000 + Math.random() * 120000);
    }, 75000);
  });
  OS.MessagesStore = Store;

  /** used by Siri: "scrivi a Giulia che arrivo tardi" */
  OS.Messages = {
    sendTo(name, text) {
      let chat = Object.values(Store.chats).find((c) => c.name === name);
      if (!chat) {
        const id = 'c' + Date.now();
        chat = Store.chats[id] = { id, name, unread: 0, messages: [] };
      }
      chat.messages.push({ from: 'me', text, time: Date.now() });
      Store.save();
      OS.sound('sent');
      setTimeout(() => deliver(chat.id, replyFor(chat, text)), 2500 + Math.random() * 2000);
      return chat.id;
    },
  };
})();
