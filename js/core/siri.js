/* ==========================================================================
   Siri (iOS 27) — answers are computed in the browser with Italian rules.
   Voice input (optional) relies on the browser's speech service.
   · OS.Siri.ask(text)        → understands a request, may act, returns an answer
   · answers appear as a dark glass card that grows out of the Dynamic Island
   · OS.Siri.activate()       → side-button long press: voice if available, else typing
   · OS.NL.parseWhen(text)    → natural-language dates ("domani alle 9") for Promemoria
   ========================================================================== */
(function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- natural language dates ---------------- */

  const WD = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const NUM = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, quindici: 15, venti: 20, trenta: 30, quaranta: 40, mezz: .5, mezzo: .5, mezza: .5 };
  const num = (s) => (s == null ? null : /^\d+([.,]\d+)?$/.test(s) ? parseFloat(s.replace(',', '.')) : NUM[s.toLowerCase()] != null ? NUM[s.toLowerCase()] : null);

  function parseWhen(input) {
    let t = ' ' + input + ' ';
    const now = new Date();
    let day = null;     // Date (midnight) or null
    let time = null;    // 'HH:MM' or null
    const strip = (re) => { t = t.replace(re, ' '); };

    // "tra 10 minuti", "fra 2 ore", "tra 3 giorni"
    let m = t.match(/\b(?:tra|fra)\s+(\d+|un|uno|una|due|tre|cinque|dieci|quindici|venti|trenta|mezz)'?\s*(minut[oi]|or[ae]|giorn[oi]|settiman[ae])\b/i);
    if (m) {
      const n = num(m[1]) || 1;
      const unit = m[2].toLowerCase();
      const d = new Date(now);
      if (unit.startsWith('minut')) d.setMinutes(d.getMinutes() + n);
      else if (unit.startsWith('or')) d.setMinutes(d.getMinutes() + Math.round(n * 60));
      else if (unit.startsWith('giorn')) d.setDate(d.getDate() + n);
      else d.setDate(d.getDate() + n * 7);
      day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (!unit.startsWith('giorn') && !unit.startsWith('settiman')) time = pad(d.getHours()) + ':' + pad(d.getMinutes());
      strip(m[0]);
    }

    // time of day
    m = t.match(/\b(?:alle|all'|ore|per le|verso le)\s*(?:ore\s*)?(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:di|del)\s*(sera|pomeriggio|mattina|notte))?/i);
    if (m) {
      let h = +m[1];
      const min = m[2] ? +m[2] : 0;
      if (m[3] && /sera|pomeriggio/i.test(m[3]) && h < 12) h += 12;
      if (h < 24 && min < 60) time = pad(h) + ':' + pad(min);
      strip(m[0]);
    } else if (/\ba mezzogiorno\b/i.test(t)) { time = '12:00'; strip(/\ba mezzogiorno\b/i); }
    else if (/\ba mezzanotte\b/i.test(t)) { time = '00:00'; strip(/\ba mezzanotte\b/i); }

    // relative days
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const plus = (n) => new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() + n);
    if (/\bdopodomani\b/i.test(t)) { day = plus(2); strip(/\bdopodomani\b/i); }
    else if (/\bdomattina\b/i.test(t)) { day = plus(1); time = time || '09:00'; strip(/\bdomattina\b/i); }
    else if (/\bdomani\b/i.test(t)) { day = plus(1); strip(/\bdomani\b/i); }
    else if (/\bstasera\b/i.test(t)) { day = plus(0); time = time || '21:00'; strip(/\bstasera\b/i); }
    else if (/\bstamattina\b/i.test(t)) { day = plus(0); time = time || '09:00'; strip(/\bstamattina\b/i); }
    else if (/\boggi\b/i.test(t)) { day = plus(0); strip(/\boggi\b/i); }

    // weekday ("lunedì", "venerdì prossimo")
    if (!day) {
      // JS \b is ASCII-only, so "venerdì" needs an explicit end-of-word check
      const re = new RegExp('\\b(' + WD.map((w) => w.replace('ì', '[iì]')).join('|') + ')(\\s+prossimo)?(?![a-zàèéìòù])', 'i');
      m = t.match(re);
      if (m) {
        const target = WD.findIndex((w) => w.replace('ì', 'i') === m[1].toLowerCase().replace('ì', 'i'));
        let diff = (target - now.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        day = plus(diff);
        strip(m[0]);
      }
    }

    // "il 15", "il 15 ottobre", "15/10"
    if (!day) {
      m = t.match(new RegExp('\\b(?:il\\s+)?(\\d{1,2})\\s+(' + MONTHS.join('|') + ')\\b', 'i')) || t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (m) {
        const d = +m[1];
        const mo = isNaN(+m[2]) ? MONTHS.indexOf(m[2].toLowerCase()) : +m[2] - 1;
        let y = now.getFullYear();
        if (new Date(y, mo, d) < today0) y++;
        day = new Date(y, mo, d);
        strip(m[0]);
      }
    }

    if (time && !day) {
      const [h, mi] = time.split(':').map(Number);
      day = (h * 60 + mi) <= now.getHours() * 60 + now.getMinutes() ? plus(1) : plus(0);
    }

    // clean the remaining text into a title
    let title = t
      .replace(/\b(ricordami|ricordarmi|ricorda(?:mi)?|promemoria|crea(?:re)? un promemoria|aggiungi(?:re)?|devo|dovrei|per favore)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(di|che|per|a)\s+/i, '')
      .replace(/[.!?,;:]+$/, '')
      .trim();
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    return { title, day, time };
  }

  function whenLabel(day, time) {
    if (!day) return time || '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    const d = diff === 0 ? 'Oggi' : diff === 1 ? 'Domani' : diff === 2 ? 'Dopodomani' : diff > 0 && diff < 7 ? OS.cap(WD[day.getDay()]) : `${day.getDate()} ${MONTHS[day.getMonth()]}`;
    return time ? `${d}, ${time}` : d;
  }

  OS.NL = { parseWhen, whenLabel };

  /* ---------------- intents ---------------- */

  function evalMath(q) {
    const expr = q.toLowerCase()
      .replace(/quanto fa|quanto è|calcola|risultato di|\?/g, '')
      .replace(/più/g, '+').replace(/meno/g, '-').replace(/per|×|x/g, '*').replace(/diviso(?: per)?|÷|:/g, '/')
      .replace(/alla seconda|al quadrato/g, '^2').replace(/al cubo/g, '^3')
      .replace(/,/g, '.').replace(/\s+/g, '');
    if (!/^[\d.+\-*/()^%]+$/.test(expr) || !/\d/.test(expr) || !/[+\-*/^%]/.test(expr)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict";return (' + expr.replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)') + ')')();
      return typeof v === 'number' && isFinite(v) ? v : null;
    } catch (e) { return null; }
  }

  function findApp(text) {
    const t = text.toLowerCase();
    return OS.appOrder.find((id) => t.includes(OS.apps[id].name.toLowerCase()));
  }

  function findContact(text) {
    const t = text.toLowerCase();
    return (OS.Contacts || []).find((c) => t.includes(c.name.toLowerCase()) || t.includes(c.name.split(' ')[0].toLowerCase()));
  }

  function durationOf(text) {
    let total = 0;
    const re = /(\d+(?:[.,]\d+)?|un|uno|una|due|tre|quattro|cinque|dieci|quindici|venti|trenta|mezz)'?\s*(or[ae]|minut[oi]|second[oi])/gi;
    let m;
    while ((m = re.exec(text))) {
      const n = num(m[1]) || 0;
      const u = m[2].toLowerCase();
      total += u.startsWith('or') ? n * 3600 : u.startsWith('minut') ? n * 60 : n;
    }
    if (/mezz'?ora/i.test(text) && !total) total = 1800;
    return Math.round(total);
  }

  const on = (t) => /\b(accendi|attiva|abilita|metti|apri)\b/i.test(t);
  const off = (t) => /\b(spegni|disattiva|disabilita|togli|chiudi)\b/i.test(t);

  const INTENTS = [
    // greetings & identity
    [/^(ehi |hey |ciao )?siri\??$|^(ciao|ehi|hey|buongiorno|buonasera)\b/i, () => ({ text: pick(['Ciao! Come posso aiutarti?', 'Eccomi. Cosa posso fare per te?', 'Ciao, dimmi pure.']) })],
    [/come stai/i, () => ({ text: 'Tutto bene, grazie! Pronta ad aiutarti.' })],
    [/chi sei|cosa sei|cosa sai fare|aiuto/i, () => ({ text: 'Sono Siri. In questa versione web funziono offline: posso impostare timer e sveglie, creare promemoria e note, controllare musica, torcia e Wi-Fi, dirti il meteo, fare calcoli, aprire app, chiamare e scrivere messaggi.' })],
    [/grazie/i, () => ({ text: pick(['Figurati!', 'Di niente.', 'È un piacere.']) })],

    // time & date
    [/che ore sono|che ora è|\bl'ora\b/i, () => ({ text: `Sono le ${OS.fmt.time()}.`, big: OS.fmt.time() })],
    [/che giorno|che data|quanti ne abbiamo/i, () => { const d = new Date(); return { text: `Oggi è ${OS.fmt.dateLong(d).toLowerCase()} ${d.getFullYear()}.` }; }],

    // weather
    [/meteo|che tempo|pioverà|piove|temperatura|fa caldo|fa freddo/i, (t) => {
      const S = OS.WeatherService;
      if (!S) return null;
      const city = S.cities.find((c) => t.toLowerCase().includes(c.name.toLowerCase())) || S.cities[0];
      const d = S.get(city.id);
      const tomorrow = /domani/i.test(t);
      if (tomorrow && d.daily[1]) {
        const x = d.daily[1];
        return { text: `Domani a ${city.name}: ${S.label(x.code).toLowerCase()}, massima ${Math.round(x.max)}°, minima ${Math.round(x.min)}°${x.rain >= 30 ? `, ${x.rain}% di probabilità di pioggia` : ''}.`, app: 'weather', icon: S.icon(x.code, true, 30) };
      }
      const c = d.current;
      return { text: `A ${city.name} ci sono ${Math.round(c.temp)}° e ${S.label(c.code).toLowerCase()}. Massima ${Math.round(d.daily[0].max)}°, minima ${Math.round(d.daily[0].min)}°.`, app: 'weather', big: Math.round(c.temp) + '°', icon: S.icon(c.code, c.isDay, 30) };
    }],

    // timer
    [/timer|conto alla rovescia/i, (t) => {
      const C = OS.ClockService;
      if (/annulla|ferma|cancella|stop/i.test(t)) { C.cancelTimer(); return { text: 'Ho annullato il timer.' }; }
      const s = durationOf(t);
      if (!s) return { text: 'Per quanto tempo? Ad esempio: «timer di 5 minuti».' };
      C.startTimer(s);
      return { text: `Ok, timer di ${OS.fmt.duration(s)} avviato.`, app: 'clock', data: { tab: 'timer' } };
    }],

    // alarm
    [/sveglia|svegliami/i, (t) => {
      const C = OS.ClockService;
      const w = parseWhen(t);
      if (!w.time) return { text: 'A che ora vuoi la sveglia?' };
      const [h, m] = w.time.split(':').map(Number);
      C.alarms.push({ id: 'a' + Date.now(), h, m, label: 'Sveglia', on: true });
      C.save();
      return { text: `Sveglia impostata per le ${w.time}${w.day ? ' (' + whenLabel(w.day).toLowerCase() + ')' : ''}.`, app: 'clock', data: { tab: 'alarms' } };
    }],

    // reminders
    [/ricordami|ricordarmi|promemoria/i, (t) => {
      if (!OS.RemindersStore) return null;
      const w = parseWhen(t);
      if (!w.title) return { text: 'Cosa vuoi che ti ricordi?' };
      OS.RemindersStore.addNatural(w);
      return { text: `Ok, te lo ricorderò: «${w.title}»${w.day || w.time ? ', ' + whenLabel(w.day, w.time).toLowerCase() : ''}.`, app: 'reminders' };
    }],

    // notes
    [/(crea|nuova|scrivi|prendi) (una )?nota|annota/i, (t) => {
      const N = OS.NotesService;
      const body = t.replace(/.*?(nota|annota)(\s+che|\s*:)?/i, '').trim();
      const n = N.create();
      N.update(n, body ? OS.cap(body) : 'Nota da Siri');
      return { text: body ? `Ho creato la nota «${OS.cap(body)}».` : 'Ho creato una nuova nota.', app: 'notes', data: { note: n.id } };
    }],

    // calls
    [/^(chiama|telefona)/i, (t) => {
      const c = findContact(t);
      if (!c) return { text: 'Chi vuoi chiamare?' };
      OS.Call.start(c.name);
      OS.Apps.open('phone');
      return { text: `Chiamo ${c.name}.` };
    }],

    // messages
    [/^(scrivi|manda|invia)( un messaggio)?( a)?/i, (t) => {
      const c = findContact(t) || (/benvenuto|siri/i.test(t) ? null : null);
      if (!c || !OS.Messages) return { text: 'A chi vuoi scrivere?' };
      const body = t.replace(/^(scrivi|manda|invia)( un messaggio)?( a)?/i, '').replace(new RegExp(c.name + '|' + c.name.split(' ')[0], 'i'), '').replace(/^\s*(che|:|dicendo)\s*/i, '').trim();
      if (!body) return { text: `Cosa vuoi scrivere a ${c.name}?` };
      OS.Messages.sendTo(c.name, OS.cap(body));
      return { text: `Inviato a ${c.name}: «${OS.cap(body)}».`, app: 'messages' };
    }],

    // music
    [/\b(pausa|stop musica|ferma la musica|interrompi la musica)\b/i, () => { OS.Audio.Music.pause(); return { text: 'Musica in pausa.' }; }],
    [/(prossim|success|salta|avanti)/i, (t) => (/brano|canzone|traccia|musica|salta|avanti/i.test(t) ? (OS.MusicLibrary.next(), { text: `Ecco «${OS.Audio.Music.song.title}».`, app: 'music', data: { player: true } }) : null)],
    [/(riproduci|metti|suona|fammi sentire|ascolta).*(musica|canzone|brano|album|playlist|qualcosa)|^riproduci/i, (t) => {
      const L = OS.MusicLibrary;
      const s = L.songs.find((x) => t.toLowerCase().includes(x.title.toLowerCase()) || t.toLowerCase().includes(x.artist.toLowerCase())) || L.songs[Math.floor(Math.random() * L.songs.length)];
      L.play(s);
      return { text: `Riproduco «${s.title}» di ${s.artist}.`, app: 'music', data: { player: true } };
    }],
    [/\b(riprendi|continua)\b.*musica|^play$/i, () => { OS.Audio.Music.play(); return { text: 'Riprendo la musica.' }; }],

    // device controls
    [/torcia|luce/i, (t) => { const v = off(t) ? false : on(t) ? true : !OS.state.torch; OS.Lock.setTorch(v); return { text: v ? 'Torcia accesa.' : 'Torcia spenta.' }; }],
    [/wi-?fi/i, (t) => { const v = off(t) ? false : on(t) ? true : !OS.settings.wifi; OS.set('wifi', v); return { text: `Wi-Fi ${v ? 'attivato' : 'disattivato'}.` }; }],
    [/bluetooth/i, (t) => { const v = off(t) ? false : on(t) ? true : !OS.settings.bluetooth; OS.set('bluetooth', v); return { text: `Bluetooth ${v ? 'attivato' : 'disattivato'}.` }; }],
    [/uso in aereo|modalità aereo/i, (t) => { const v = off(t) ? false : on(t) ? true : !OS.settings.airplane; OS.set('airplane', v); return { text: `Uso in aereo ${v ? 'attivato' : 'disattivato'}.` }; }],
    [/non disturbare|full immersione|concentrazione/i, (t) => { const v = off(t) ? false : on(t) ? true : !OS.settings.focus; OS.set('focus', v); return { text: `Non disturbare ${v ? 'attivato' : 'disattivato'}.` }; }],
    [/modalità scura|tema scuro|dark mode/i, (t) => { const v = !off(t); OS.set('appearance', v ? 'dark' : 'light'); return { text: v ? 'Modalità scura attivata.' : 'Modalità chiara attivata.' }; }],
    [/modalità chiara|tema chiaro/i, () => { OS.set('appearance', 'light'); return { text: 'Modalità chiara attivata.' }; }],
    [/silenzios/i, (t) => { const v = !off(t); OS.set('silent', v); return { text: v ? 'Modalità silenziosa attivata.' : 'Suoneria attivata.' }; }],
    [/luminosità/i, (t) => {
      const up = /alza|aumenta|più|massim/i.test(t);
      const v = /massim/i.test(t) ? 1 : /minim/i.test(t) ? .15 : OS.clamp(OS.settings.brightness + (up ? .25 : -.25), .15, 1);
      OS.set('brightness', Math.round(v * 100) / 100);
      return { text: `Luminosità al ${Math.round(v * 100)}%.` };
    }],
    [/volume/i, (t) => {
      const up = /alza|aumenta|più|massim/i.test(t);
      const v = /massim/i.test(t) ? 1 : /muto|zero/i.test(t) ? 0 : OS.clamp(OS.settings.volume + (up ? .2 : -.2), 0, 1);
      OS.set('volume', Math.round(v * 100) / 100);
      return { text: `Volume al ${Math.round(v * 100)}%.` };
    }],
    [/liquid glass|trasparen/i, (t) => {
      const v = /più trasparent|trasparent/i.test(t) && !/meno/i.test(t) ? .05 : .9;
      OS.set('glassLevel', v);
      return { text: v < .5 ? 'Ho reso il Liquid Glass più trasparente.' : 'Ho reso il Liquid Glass più colorato.' };
    }],
    [/batteria/i, () => ({ text: `La batteria è al ${Math.round(OS.state.battery * 100)}%${OS.state.charging ? ' ed è in carica' : ''}.`, big: Math.round(OS.state.battery * 100) + '%' })],

    // calendar
    [/(cosa|che) (ho|c'è) (in programma|in agenda|da fare)|appuntament|impegni|eventi/i, (t) => {
      const C = OS.CalendarService;
      if (!C) return null;
      const d = /domani/i.test(t) ? new Date(Date.now() + 86400000) : new Date();
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const evs = C.on(iso);
      const when = /domani/i.test(t) ? 'Domani' : 'Oggi';
      if (!evs.length) return { text: `${when} non hai eventi in calendario.`, app: 'calendar' };
      return { text: `${when} hai ${evs.length === 1 ? 'un evento' : evs.length + ' eventi'}: ` + evs.map((e) => `${e.title}${e.start ? ' alle ' + e.start : ''}`).join(', ') + '.', app: 'calendar' };
    }],

    // open apps
    [/^(apri|avvia|lancia|vai (su|a|in))\b/i, (t) => {
      const id = findApp(t);
      if (!id) return null;
      return { text: `Apro ${OS.apps[id].name}.`, open: id };
    }],
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function ask(raw) {
    const text = String(raw || '').trim();
    if (!text) return { text: 'Dimmi pure.' };
    // math first ("quanto fa 12 per 4")
    const math = evalMath(text);
    if (math != null) return { text: `Fa ${OS.fmt.number(math, 8)}.`, big: OS.fmt.number(math, 8), app: 'calculator' };
    for (const [re, fn] of INTENTS) {
      if (re.test(text)) {
        try {
          const r = fn(text);
          if (r) return r;
        } catch (e) {
          console.error('[siri]', e);
          return { text: 'Si è verificato un problema. Riprova.' };
        }
      }
    }
    const app = findApp(text);
    if (app && text.split(/\s+/).length <= 3) return { text: `Apro ${OS.apps[app].name}.`, open: app };
    return { text: `Non sono sicura di aver capito. Ecco cosa ho trovato sul web per «${text}».`, web: text };
  }

  /* ---------------- conversation + Dynamic Island card ---------------- */

  const history = OS.store.get('siri:history', []);
  let root, shape, pillLabel, card;
  let hideT = null;
  let state = 'off';

  function remember(from, text) {
    history.push({ from, text, time: Date.now() });
    while (history.length > 60) history.shift();
    OS.store.set('siri:history', history);
    OS.emit('siri:history');
  }

  function setState(s, label) {
    state = s;
    root.className = s === 'off' ? '' : 'on ' + s;
    if (label) pillLabel.textContent = label;
    if (s === 'off') {
      shape.style.width = '';
      shape.style.height = '';
    }
  }

  function showAnswer(q, r) {
    clearTimeout(hideT);
    const actions = [];
    if (r.open) actions.push(`<button data-open="${r.open}">Apri ${OS.esc(OS.apps[r.open].name)}</button>`);
    else if (r.app && OS.apps[r.app]) actions.push(`<button data-open="${r.app}">${OS.esc(OS.apps[r.app].name)}</button>`);
    if (r.web) actions.push('<button data-web="1">Cerca sul web</button>');
    actions.push('<button data-more="1">Continua</button>');
    card.innerHTML = `<div class="siri-q">${OS.esc(q)}</div>
      <div class="siri-a">${r.icon ? `<span class="siri-ic">${r.icon}</span>` : ''}${r.big ? `<b class="siri-big">${OS.esc(r.big)}</b>` : ''}<p>${OS.esc(r.text)}</p></div>
      <div class="siri-actions">${actions.join('')}</div>`;
    card.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
      if (b.dataset.open) OS.Apps.open(b.dataset.open, { data: r.data });
      if (b.dataset.web) OS.Apps.open('safari', { data: { search: r.web } });
      if (b.dataset.more) OS.Apps.open('siri');
    }));
    setState('answer');
    const W = OS.state.width - 20;
    shape.style.width = W + 'px';
    card.style.width = W + 'px';
    requestAnimationFrame(() => { shape.style.height = (card.scrollHeight) + 'px'; });
    hideT = setTimeout(dismiss, 9000);
    speak(r.text);
  }

  function speak(text) {
    if (!OS.settings.siriVoice || !('speechSynthesis' in window) || OS.settings.silent) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      u.volume = OS.settings.volume;
      speechSynthesis.speak(u);
    } catch (e) { /* unsupported */ }
  }

  function dismiss() {
    clearTimeout(hideT);
    if (state === 'off') return;
    setState('closing');
    setTimeout(() => { if (state === 'closing') setState('off'); }, 380);
  }

  /** full round trip: glow in the island, think, answer in a card */
  function run(question, opts) {
    opts = opts || {};
    const q = String(question || '').trim();
    if (!q) return null;
    remember('me', q);
    setState('thinking', 'Sto cercando…');
    shape.style.width = '';
    shape.style.height = '';
    const r = ask(q);
    remember('siri', r.text);
    setTimeout(() => {
      if (r.open && !opts.inApp) {
        dismiss();
        OS.Apps.open(r.open, { data: r.data });
        return;
      }
      if (opts.inApp) { setState('off'); speak(r.text); return; }
      showAnswer(q, r);
    }, opts.inApp ? 450 : 750);
    return r;
  }

  /* ---------------- voice (Web Speech API when the browser has it) ---------------- */

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen(onText, fallback) {
    if (!SR) return false;
    let rec;
    try {
      rec = new SR();
    } catch (e) { return false; }
    rec.lang = 'it-IT';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = '';
    setState('listening', 'Sto ascoltando…');
    rec.onresult = (e) => {
      const res = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      pillLabel.textContent = res || 'Sto ascoltando…';
      if (e.results[e.results.length - 1].isFinal) finalText = res;
    };
    // no microphone permission, no network for the speech service, or silence:
    // fall back to typing instead of leaving the pill stuck
    const giveUp = setTimeout(() => { try { rec.abort(); } catch (e) { /* ignore */ } }, 8000);
    rec.onerror = () => {};
    rec.onend = () => {
      clearTimeout(giveUp);
      if (finalText) { if (onText) onText(finalText); else run(finalText); return; }
      if (state === 'listening') setState('off');
      if (fallback) fallback();
    };
    try { rec.start(); } catch (e) { clearTimeout(giveUp); setState('off'); return false; }
    return true;
  }

  /** side button long press / "S" key */
  function activate() {
    if (!OS.state.screenOn) OS.Lock.wake();
    OS.haptic(20);
    if (!OS.settings.siriAI) { OS.Island.flash({ left: OS.sym('sparkles', { size: 18 }), right: '<span>Siri è disattivata</span>', width: 230 }); return; }
    if (OS.state.locked) { OS.Lock.unlock(() => activate()); return; }
    const typing = () => OS.Spotlight.open();
    if (listen(null, typing)) return;
    typing();
  }

  function init() {
    root = OS.el(`<div id="siri"><div class="siri-shape">
        <div class="siri-pill"><span class="siri-orb"></span><span class="siri-label">Sto cercando…</span></div>
        <div class="siri-card"></div>
      </div></div>`);
    OS.screenEl.appendChild(root);
    shape = root.querySelector('.siri-shape');
    pillLabel = root.querySelector('.siri-label');
    card = root.querySelector('.siri-card');
    shape.addEventListener('click', () => { if (state === 'answer') { dismiss(); OS.Apps.open('siri'); } });
    // swipe the card down for the full conversation, up to dismiss
    let y0 = null;
    shape.addEventListener('pointerdown', (e) => { if (state === 'answer') { y0 = OS.point(e).y; e.stopPropagation(); } });
    window.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      const dy = OS.point(e).y - y0;
      y0 = null;
      if (dy > 40) { dismiss(); OS.Apps.open('siri'); }
      else if (dy < -30) dismiss();
    });
    OS.screenEl.addEventListener('pointerdown', (e) => {
      if (state === 'answer' && !e.target.closest('#siri')) dismiss();
    }, true);
  }

  OS.Siri = { init, ask, run, listen, activate, dismiss, history, speechSupported: !!SR, get state() { return state; } };
})();
