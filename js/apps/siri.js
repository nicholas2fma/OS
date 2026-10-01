/* ==========================================================================
   Siri (iOS 27) — the conversation app behind the Dynamic Island answers
   ========================================================================== */
(function () {
  'use strict';

  const SUGGESTIONS = [
    'Che tempo fa domani a Milano?',
    'Svegliami domani alle 7:30',
    'Ricordami di comprare il pane stasera',
    'Scrivi a Giulia che arrivo tra 10 minuti',
    'Cosa ho in programma oggi?',
    'Rendi il Liquid Glass più trasparente',
  ];

  OS.registerApp({
    id: 'siri',
    name: 'Siri',
    dark: true,
    background: '#07070c',
    statusBar: 'light',
    keywords: 'siri assistente chiedi domanda intelligenza',
    mount(root) {
      root.innerHTML = `<div class="sr-app">
        <div class="sr-glow"></div>
        <header class="sr-head"><h1>Siri</h1><button class="gbtn glass" data-a="clear" aria-label="Nuova conversazione">${OS.sym('compose')}</button></header>
        <div class="sr-thread scroll"></div>
        <div class="sr-bar">
          <div class="sr-field glass"><span class="siri-orb"></span><input placeholder="Chiedi a Siri" enterkeyhint="send" autocomplete="off"><button class="sr-mic" aria-label="Parla">${OS.sym('mic', { size: 20 })}</button></div>
        </div>
      </div>`;
      const thread = root.querySelector('.sr-thread');
      const input = root.querySelector('input');
      const H = OS.Siri.history;
      let thinking = false;

      function paint(smooth) {
        if (!H.length) {
          thread.innerHTML = `<div class="sr-empty"><span class="siri-orb big"></span><b>Come posso aiutarti?</b><p>Le risposte sono calcolate nel browser. Per la dettatura vocale serve il riconoscimento del browser.</p>
            <div class="sr-sugg">${SUGGESTIONS.map((s) => `<button class="glass" data-ask="${OS.esc(s)}">${OS.esc(s)}</button>`).join('')}</div></div>`;
          return;
        }
        thread.innerHTML = H.map((m) => `<div class="sr-msg ${m.from}">${OS.esc(m.text)}</div>`).join('')
          + (thinking ? '<div class="sr-msg siri thinking"><span class="siri-orb"></span>Sto pensando…</div>' : '');
        requestAnimationFrame(() => thread.scrollTo({ top: thread.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
      }

      function send(text) {
        const q = String(text || '').trim();
        if (!q) return;
        input.value = '';
        thinking = true;
        H.push({ from: 'me', text: q, time: Date.now() });
        paint(true);
        H.pop();
        setTimeout(() => {
          thinking = false;
          const r = OS.Siri.run(q, { inApp: true });
          paint(true);
          if (r && r.open) setTimeout(() => OS.Apps.open(r.open, { data: r.data }), 500);
        }, 650);
      }

      root.querySelector('.sr-app').addEventListener('click', (e) => {
        const a = e.target.closest('[data-ask]');
        if (a) { send(a.dataset.ask); return; }
        const b = e.target.closest('[data-a="clear"]');
        if (b) { H.length = 0; OS.store.set('siri:history', H); paint(); }
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') send(input.value);
      });
      root.querySelector('.sr-mic').addEventListener('click', () => {
        if (!OS.Siri.listen((t) => send(t))) OS.Island.flash({ left: OS.sym('mic-slash', { size: 18 }), right: '<span>Dettatura non disponibile</span>', width: 260 });
      });
      const off = OS.on('siri:history', () => { if (!thinking) paint(true); });
      paint(false);
      return {
        onShow() { paint(false); setTimeout(() => input.focus({ preventScroll: true }), 450); },
        onDestroy() { off(); },
      };
    },
  });
})();
