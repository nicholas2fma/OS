/* ==========================================================================
   Impostazioni
   ========================================================================== */
(function () {
  'use strict';

  const UI = () => OS.UI;
  const S = () => OS.settings;

  const NETWORKS = [
    { name: 'Casa', secure: true, strength: 3 },
    { name: 'Casa-5G', secure: true, strength: 3 },
    { name: 'Ufficio', secure: true, strength: 2 },
    { name: 'Bar Centrale', secure: false, strength: 2 },
    { name: 'Ospiti', secure: false, strength: 1 },
  ];
  const BT = [
    { name: 'Cuffie wireless', connected: true },
    { name: 'Altoparlante cucina', connected: false },
    { name: 'Auto', connected: false },
    { name: 'Orologio', connected: true },
  ];

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  }

  OS.registerApp({
    id: 'settings',
    name: 'Impostazioni',
    keywords: 'impostazioni wifi bluetooth sfondo luminosità batteria',
    quickActions: [
      { label: 'Wi-Fi', icon: 'wifi', data: { page: 'wifi' } },
      { label: 'Batteria', icon: 'battery', data: { page: 'battery' } },
      { label: 'Sfondo', icon: 'photo', data: { page: 'wallpaper' } },
    ],
    mount(root) {
      const nav = new OS.UI.Nav(root);
      const pages = buildPages(nav);
      nav.push(pages.main(), false);
      const off = OS.on('settings', () => {
        const cur = nav.current;
        if (cur && cur.refresh) cur.refresh();
      });
      return {
        onShow(data) {
          if (data && data.page && pages[data.page]) {
            nav.popToRoot();
            nav.push(pages[data.page](), false);
          } else if (nav.current && nav.current.refresh) nav.current.refresh();
        },
        onDestroy() { off(); },
      };
    },
  });

  function buildPages(nav) {
    const P = {};
    const go = (name) => () => nav.push(P[name]());
    const groupedPage = (title, render, extra) => Object.assign({
      title, grouped: true, large: false,
      render(body, page) {
        page.refresh = () => { body.innerHTML = ''; render(body, page); };
        render(body, page);
      },
    }, extra || {});

    /* ---------- main ---------- */
    P.main = () => groupedPage('Impostazioni', (body, page) => {
      const s = S();
      const search = OS.el(`<div class="search-field">${OS.sym('search')}<input placeholder="Cerca" type="search"></div>`);
      body.appendChild(search);
      const profile = OS.el(`<div class="section"><div class="list"><div class="row tap" style="min-height:76px">
        <div class="avatar" style="width:56px;height:56px;font-size:22px;background:linear-gradient(180deg,#8e9bb5,#5f6b85)">${OS.esc(initials(s.userName))}</div>
        <div class="row-main"><div class="row-title" style="font-size:20px;font-weight:600">${OS.esc(s.userName)}</div><div class="row-sub">Account, iCloud e altro</div></div>
        ${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div></div></div>`);
      profile.querySelector('.row').addEventListener('click', go('account'));
      body.appendChild(profile);

      const groups = [
        [
          { icon: 'airplane', color: 'var(--orange)', title: 'Uso in aereo', toggle: { on: s.airplane, onChange: (v) => OS.set('airplane', v) } },
          { icon: 'wifi', color: 'var(--blue)', title: 'Wi-Fi', value: s.airplane || !s.wifi ? 'No' : (s.wifiNetwork || 'Casa'), chevron: true, onTap: go('wifi') },
          { icon: 'bluetooth', color: 'var(--blue)', title: 'Bluetooth', value: s.bluetooth ? 'Sì' : 'No', chevron: true, onTap: go('bluetooth') },
          { icon: 'antenna', color: 'var(--green)', title: 'Cellulare', chevron: true, onTap: go('cellular') },
          { icon: 'hotspot', color: 'var(--green)', title: 'Hotspot personale', value: s.hotspot ? 'Sì' : 'No', chevron: true, onTap: go('hotspot') },
          { icon: 'battery', color: 'var(--green)', title: 'Batteria', chevron: true, onTap: go('battery') },
        ],
        [
          { icon: 'gear', color: '#8e8e93', title: 'Generali', chevron: true, onTap: go('general') },
          { icon: 'accessibility', color: 'var(--blue)', title: 'Accessibilità', chevron: true, onTap: go('accessibility') },
          { icon: 'hand', color: 'var(--blue)', title: 'Tasto Azione', chevron: true, onTap: go('action') },
          { icon: 'camera', color: '#8e8e93', title: 'Fotocamera', chevron: true, onTap: go('camera') },
          { icon: 'list', color: '#8e8e93', title: 'Centro di Controllo', chevron: true, onTap: go('controlcenter') },
          { icon: 'sun', color: 'var(--blue)', title: 'Schermo e luminosità', chevron: true, onTap: go('display') },
          { icon: 'square-grid', color: 'var(--indigo)', title: 'Schermata Home e Libreria app', chevron: true, onTap: go('homescreen') },
          { icon: 'search', color: '#8e8e93', title: 'Cerca', chevron: true, onTap: go('search') },
          { icon: 'photo', color: 'var(--teal)', title: 'Sfondo', chevron: true, onTap: go('wallpaper') },
        ],
        [
          { icon: 'bell-fill', color: 'var(--red)', title: 'Notifiche', chevron: true, onTap: go('notifications') },
          { icon: 'speaker', color: 'var(--pink)', title: 'Suoni e feedback aptico', chevron: true, onTap: go('sounds') },
          { icon: 'moon', color: 'var(--indigo)', title: 'Full immersione', value: s.focus ? 'Sì' : '', chevron: true, onTap: go('focus') },
          { icon: 'hourglass', color: 'var(--indigo)', title: 'Tempo di utilizzo', chevron: true, onTap: go('screentime') },
        ],
        [
          { icon: 'hand', color: 'var(--blue)', title: 'Privacy e sicurezza', chevron: true, onTap: go('privacy') },
          { icon: 'square-grid', color: 'var(--indigo)', title: 'App', chevron: true, onTap: go('apps') },
        ],
      ];
      const sections = groups.map((g) => UI().section(g));
      sections.forEach((sec) => body.appendChild(sec));

      const input = search.querySelector('input');
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        body.querySelectorAll('.section .row').forEach((r) => {
          if (r.closest('.section') === profile) return;
          const t = (r.querySelector('.row-title') || {}).textContent || '';
          r.style.display = !q || t.toLowerCase().includes(q) ? '' : 'none';
        });
        sections.forEach((sec) => {
          const any = Array.from(sec.querySelectorAll('.row')).some((r) => r.style.display !== 'none');
          sec.style.display = any ? '' : 'none';
        });
      });
    }, { large: true });

    /* ---------- account ---------- */
    P.account = () => groupedPage('Account', (body) => {
      const s = S();
      body.appendChild(OS.el(`<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 0 26px">
        <div class="avatar" style="width:96px;height:96px;font-size:38px;background:linear-gradient(180deg,#8e9bb5,#5f6b85)">${OS.esc(initials(s.userName))}</div>
        <div style="font-size:24px;font-weight:700">${OS.esc(s.userName)}</div></div>`));
      const nameRow = UI().row({ title: 'Nome', value: s.userName, chevron: true, onTap: () => {
        UI().alert({ title: 'Il tuo nome', input: { value: s.userName, placeholder: 'Nome e cognome' }, buttons: [{ label: 'Annulla' }, { label: 'Salva', style: 'default', onTap: (v) => { if (v && v.trim()) OS.set('userName', v.trim()); } }] });
      } });
      body.appendChild(UI().section([nameRow, { title: 'Password e sicurezza', chevron: true }, { title: 'Pagamento e spedizione', value: 'Nessuno', chevron: true }, { title: 'Abbonamenti', chevron: true }]));
      body.appendChild(UI().section([{ icon: 'cloud', color: 'var(--blue)', title: 'iCloud', value: '50 GB', chevron: true }, { icon: 'location', color: 'var(--green)', title: 'Dov\'è', chevron: true }, { icon: 'person-fill', color: 'var(--blue)', title: 'In famiglia', chevron: true }]));
    });

    /* ---------- Wi-Fi ---------- */
    P.wifi = () => groupedPage('Wi-Fi', (body) => {
      const s = S();
      body.appendChild(OS.el(`<div class="settings-hero"><div class="settings-hero-icon" style="background:var(--blue)">${OS.sym('wifi', { size: 34, stroke: 2.2 })}</div><b>Wi-Fi</b><p>Connettiti al Wi-Fi, visualizza le reti disponibili e gestisci le impostazioni.</p></div>`));
      const on = s.wifi && !s.airplane;
      const rows = [{ title: 'Wi-Fi', toggle: { on, onChange: (v) => { if (v && s.airplane) OS.set('airplane', false); OS.set('wifi', v); } } }];
      if (on) rows.push(UI().row({ html: `<span style="display:flex;align-items:center;gap:8px">${OS.sym('check', { size: 18, stroke: 2.6, style: 'color:var(--accent)' })}${OS.esc(s.wifiNetwork || 'Casa')}</span>`, trailing: OS.el(`<span style="display:flex;gap:8px;color:var(--label)">${OS.sym('lock', { size: 15 })}${OS.sym('wifi', { size: 17 })}${OS.sym('info', { size: 21, style: 'color:var(--accent)' })}</span>`) }));
      body.appendChild(UI().section(rows));
      if (on) {
        const others = NETWORKS.filter((n) => n.name !== (s.wifiNetwork || 'Casa'));
        body.appendChild(UI().section(others.map((n) => UI().row({
          title: n.name,
          trailing: OS.el(`<span style="display:flex;gap:8px;color:var(--label)">${n.secure ? OS.sym('lock', { size: 15 }) : ''}<span style="opacity:${.4 + n.strength * .2}">${OS.sym('wifi', { size: 17 })}</span>${OS.sym('info', { size: 21, style: 'color:var(--accent)' })}</span>`),
          onTap: () => {
            const connect = () => { OS.set('wifiNetwork', n.name); };
            if (n.secure) UI().alert({ title: `Inserisci la password per "${n.name}"`, input: { placeholder: 'Password' }, buttons: [{ label: 'Annulla' }, { label: 'Accedi', style: 'default', onTap: connect }] });
            else connect();
          },
        })), 'Reti'));
        body.appendChild(UI().section([{ title: 'Richiedi accesso alle reti', value: 'Notifica', chevron: true }, { title: 'Accesso automatico all\'hotspot', value: 'Chiedi', chevron: true }]));
      }
    });

    /* ---------- Bluetooth ---------- */
    P.bluetooth = () => groupedPage('Bluetooth', (body) => {
      const s = S();
      body.appendChild(OS.el(`<div class="settings-hero"><div class="settings-hero-icon" style="background:var(--blue)">${OS.sym('bluetooth', { size: 34, stroke: 2.2 })}</div><b>Bluetooth</b><p>Connetti cuffie, altoparlanti, orologi e accessori.</p></div>`));
      body.appendChild(UI().section([{ title: 'Bluetooth', toggle: { on: s.bluetooth, onChange: (v) => OS.set('bluetooth', v) } }]));
      if (s.bluetooth) {
        body.appendChild(UI().section(BT.map((d) => UI().row({
          title: d.name,
          value: d.connected ? 'Connesso' : 'Non connesso',
          trailing: OS.el(`<span style="color:var(--accent);margin-left:6px">${OS.sym('info', { size: 21 })}</span>`),
          onTap: (el) => { d.connected = !d.connected; el.querySelector('.row-value').textContent = d.connected ? 'Connesso' : 'Non connesso'; },
        })), 'I miei dispositivi'));
        body.appendChild(OS.el(`<div class="section"><div class="section-head" style="display:flex;align-items:center;gap:8px">Altri dispositivi <span class="spinner" style="width:14px;height:14px;border-width:2px"></span></div></div>`));
      }
    });

    P.cellular = () => groupedPage('Cellulare', (body) => {
      const s = S();
      body.appendChild(UI().section([{ title: 'Dati cellulare', toggle: { on: s.cellular, onChange: (v) => OS.set('cellular', v) } }, { title: 'Opzioni dati cellulare', value: 'Roaming disattivato', chevron: true }]));
      body.appendChild(UI().section([{ title: 'Periodo attuale', value: '12,4 GB' }, { title: 'Roaming periodo attuale', value: '0 byte' }], 'Dati cellulare'));
      const apps = [['safari', '4,1 GB'], ['music', '3,2 GB'], ['maps', '1,8 GB'], ['messages', '940 MB'], ['weather', '120 MB']];
      body.appendChild(UI().section(apps.map(([id, v]) => UI().row({ leading: OS.icon(id, 'xs'), title: OS.apps[id] ? OS.apps[id].name : id, value: v, toggle: { on: true } }))));
    });

    P.hotspot = () => groupedPage('Hotspot personale', (body) => {
      const s = S();
      body.appendChild(UI().section([{ title: 'Consenti ad altri di connettersi', toggle: { on: !!s.hotspot, onChange: (v) => OS.set('hotspot', v) } }, { title: 'Password Wi-Fi', value: 'liquidglass26', chevron: true }],
        null, 'Altri utenti possono cercare la tua rete condivisa tramite Wi-Fi e Bluetooth con il nome "' + s.deviceName + '".'));
    });

    /* ---------- Battery ---------- */
    P.battery = () => groupedPage('Batteria', (body) => {
      const s = S();
      const pct = Math.round(OS.state.battery * 100);
      body.appendChild(OS.el(`<div class="section"><div class="list" style="padding:18px 18px 16px">
        <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:40px;font-weight:700;letter-spacing:-.02em">${pct}%</span><span style="color:var(--label2);font-size:15px">${OS.state.charging ? 'In carica' : 'Ultima carica: ieri, 23:10'}</span></div>
        <div class="battery-chart">${Array.from({ length: 24 }, (_, i) => {
          const r = OS.rng(i + 7)();
          const h = Math.round(30 + Math.sin(i / 3) * 18 + r * 30);
          return `<i style="height:${h}%;${i > 18 ? 'opacity:.35' : ''}"></i>`;
        }).join('')}</div>
        <div style="display:flex;justify-content:space-between;color:var(--label2);font-size:12px;margin-top:6px"><span>00</span><span>06</span><span>12</span><span>18</span></div>
      </div></div>`));
      body.appendChild(UI().section([{ title: 'Risparmio energetico', toggle: { on: s.lowPower, onChange: (v) => OS.set('lowPower', v) } }], null,
        'La modalità Risparmio energetico riduce temporaneamente le attività in background finché non ricarichi completamente iPhone.'));
      body.appendChild(UI().section([{ title: 'Stato e ricarica della batteria', value: '100%', chevron: true }, { title: 'Percentuale batteria', toggle: { on: true } }]));
    });

    /* ---------- General ---------- */
    P.general = () => groupedPage('Generali', (body) => {
      body.appendChild(UI().section([
        { icon: 'info', color: '#8e8e93', title: 'Info', chevron: true, onTap: go('about') },
        { icon: 'arrow-clockwise', color: '#8e8e93', title: 'Aggiornamento software', chevron: true, onTap: go('update') },
      ]));
      body.appendChild(UI().section([
        { title: 'Data e ora', chevron: true, onTap: go('datetime') },
        { title: 'Tastiera', chevron: true, onTap: go('keyboard') },
        { title: 'Lingua e zona', value: 'Italiano', chevron: true },
        { title: 'Dizionario', chevron: true },
      ]));
      body.appendChild(UI().section([
        { title: 'Trasferisci o inizializza iPhone', chevron: true, onTap: () => {
          UI().alert({
            title: 'Inizializza contenuto e impostazioni',
            message: 'Verranno cancellati note, promemoria, messaggi, foto scattate e impostazioni salvati in questo browser.',
            buttons: [{ label: 'Annulla' }, { label: 'Inizializza', style: 'destructive', onTap: () => {
              try { Object.keys(localStorage).filter((k) => k.startsWith('ios26:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
              location.reload();
            } }],
          });
        } },
        { title: 'Spegni', cls: 'accent', onTap: () => { OS.Apps.home(); setTimeout(() => OS.Lock.sleep(), 500); } },
      ]));
    });

    P.about = () => groupedPage('Info', (body) => {
      const s = S();
      const nPhotos = OS.PhotosService ? OS.PhotosService.count() : 0;
      const nSongs = OS.MusicLibrary ? OS.MusicLibrary.songs.length : 0;
      body.appendChild(UI().section([
        { title: 'Nome', value: s.deviceName, chevron: true, onTap: () => UI().alert({ title: 'Nome dispositivo', input: { value: s.deviceName }, buttons: [{ label: 'Annulla' }, { label: 'Salva', style: 'default', onTap: (v) => { if (v && v.trim()) OS.set('deviceName', v.trim()); } }] }) },
        { title: 'Versione iOS', value: OS.version },
        { title: 'Nome modello', value: 'iPhone (Web)' },
        { title: 'Numero modello', value: 'WEB26' },
        { title: 'Numero di serie', value: 'LQD' + Math.abs(OS.rng('serial')() * 1e9 | 0) },
      ]));
      body.appendChild(UI().section([
        { title: 'Brani', value: String(nSongs) },
        { title: 'Foto', value: String(nPhotos) },
        { title: 'App', value: String(OS.appOrder.length) },
        { title: 'Capacità', value: '256 GB' },
        { title: 'Disponibili', value: '187,3 GB' },
      ]));
      body.appendChild(UI().section([
        { title: 'Motore', value: 'HTML · CSS · JavaScript' },
        { title: 'Rifrazione Liquid Glass', value: OS.Glass.supported ? 'Supportata' : 'Non supportata' },
      ], null, 'Ricreazione a scopo dimostrativo. Non affiliata né approvata da Apple Inc.'));
    });

    P.update = () => groupedPage('Aggiornamento software', (body) => {
      body.appendChild(OS.el(`<div class="settings-hero" style="padding-top:60px"><div class="settings-hero-icon" style="background:linear-gradient(180deg,#c4c4ca,#86868c)">${OS.sym('gear', { size: 36 })}</div><b>iOS ${OS.version}</b><p>iOS è aggiornato</p></div>`));
      body.appendChild(UI().section([{ title: 'Aggiornamenti automatici', value: 'Sì', chevron: true }]));
    });

    P.datetime = () => groupedPage('Data e ora', (body) => {
      const s = S();
      body.appendChild(UI().section([
        { title: 'Formato 24 ore', toggle: { on: s.use24h, onChange: (v) => OS.set('use24h', v) } },
        { title: 'Imposta automaticamente', toggle: { on: true } },
        { title: 'Fuso orario', value: Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ') },
      ]));
    });

    P.keyboard = () => groupedPage('Tastiera', (body) => {
      const s = S();
      body.appendChild(UI().section([
        { title: 'Clic tastiera', toggle: { on: s.keyClicks, onChange: (v) => OS.set('keyClicks', v) } },
        { title: 'Maiuscole automatiche', toggle: { on: true } },
        { title: 'Correzione automatica', toggle: { on: true } },
        { title: 'Suggerimenti', toggle: { on: true } },
      ]));
    });

    /* ---------- Display & Liquid Glass ---------- */
    P.display = () => groupedPage('Schermo e luminosità', (body) => {
      const s = S();
      const mode = s.appearance === 'auto' ? (OS.isDark() ? 'dark' : 'light') : s.appearance;
      const pick = OS.el(`<div class="section"><div class="section-head">Aspetto</div><div class="list appearance-pick">
        ${['light', 'dark'].map((m) => `<button class="ap-opt" data-m="${m}">
          <div class="ap-prev ${m}" style="background-image:var(--wallpaper)"><div class="ap-time">9:41</div><div class="ap-dock"></div></div>
          <span>${m === 'light' ? 'Chiaro' : 'Scuro'}</span>
          <i class="ap-radio ${mode === m ? 'on' : ''}">${OS.sym('check', { size: 14, stroke: 3.2 })}</i></button>`).join('')}
      </div></div>`);
      pick.querySelectorAll('.ap-opt').forEach((b) => b.addEventListener('click', () => OS.set('appearance', b.dataset.m)));
      const list = pick.querySelector('.list');
      list.appendChild(UI().row({ title: 'Automatico', toggle: { on: s.appearance === 'auto', onChange: (v) => OS.set('appearance', v ? 'auto' : (OS.isDark() ? 'dark' : 'light')) } }));
      body.appendChild(pick);

      const bright = UI().slider(s.brightness, (v) => OS.set('brightness', Math.max(.15, v)), { min: 0, max: 1, step: .01 });
      const brow = OS.el(`<div class="row" style="gap:12px">${OS.sym('sun', { size: 18 })}<div style="flex:1"></div>${OS.sym('sun-fill', { size: 24 })}</div>`);
      brow.children[1].appendChild(bright);
      body.appendChild(UI().section([brow, { title: 'True Tone', toggle: { on: true } }], 'Luminosità'));

      const seg = UI().segmented([{ value: 'clear', label: 'Trasparente' }, { value: 'tinted', label: 'Colorato' }], s.glass, (v) => OS.set('glass', v));
      const segRow = OS.el('<div class="row" style="padding:12px 14px"></div>');
      seg.style.flex = '1';
      segRow.appendChild(seg);
      const glassRows = [segRow];
      glassRows.push(UI().row({
        title: 'Rifrazione della luce',
        sub: OS.Glass.supported ? 'Distorsione ottica ai bordi del vetro' : 'Richiede un browser basato su Chromium',
        toggle: { on: s.refraction && OS.Glass.supported, onChange: (v) => OS.set('refraction', v) },
      }));
      body.appendChild(UI().section(glassRows, 'Liquid Glass', 'Scegli un aspetto più trasparente o più opaco (con maggiore contrasto) per pulsanti, barre e controlli.'));
      body.appendChild(UI().section([{ title: 'Dimensioni testo', chevron: true }, { title: 'Testo in grassetto', toggle: { on: false } }]));
      body.appendChild(UI().section([{ title: 'Blocco automatico', value: '30 secondi', chevron: true }, { title: 'Alza per attivare', toggle: { on: true } }]));
    });

    P.homescreen = () => groupedPage('Schermata Home e Libreria app', (body) => {
      const s = S();
      const opts = [['default', 'Predefinito'], ['dark', 'Scuro'], ['clear', 'Trasparente'], ['tinted', 'Colorato']];
      const seg = UI().segmented(opts.map(([value, label]) => ({ value, label })), s.iconStyle, (v) => OS.set('iconStyle', v));
      const segRow = OS.el('<div class="row" style="padding:12px 14px"></div>');
      seg.style.flex = '1';
      segRow.appendChild(seg);
      const preview = OS.el(`<div class="row icon-preview-row" style="justify-content:space-around;padding:16px 10px;background-image:var(--wallpaper);background-size:cover;background-position:center">${['phone', 'safari', 'messages', 'music', 'photos'].map((id) => OS.icon(id, 'md')).join('')}</div>`);
      body.appendChild(UI().section([preview, segRow], 'Aspetto icone'));
      body.appendChild(UI().section([{ title: 'Aggiungi alla schermata Home', check: true }, { title: 'Solo Libreria app' }], 'App scaricate di recente'));
      const hidden = s.hiddenApps || [];
      if (hidden.length) {
        body.appendChild(UI().section(hidden.filter((id) => OS.apps[id]).map((id) => UI().row({
          leading: OS.icon(id, 'xs'), title: OS.apps[id].name,
          trailing: OS.el('<button class="btn" style="height:32px;padding:0 14px;font-size:15px">Ripristina</button>'),
          onTap: () => { OS.Home.restoreApp(id); },
        })), 'App rimosse dalla schermata Home'));
      }
      body.appendChild(UI().section([{ title: 'Mostra badge notifiche', toggle: { on: true } }]));
    });

    /* ---------- Wallpaper ---------- */
    P.wallpaper = () => groupedPage('Sfondo', (body) => {
      const s = S();
      const grid = OS.el(`<div class="wall-grid">${OS.Wallpapers.list.map((w) => `<button class="wall-opt ${w.id === s.wallpaper ? 'on' : ''}" data-w="${w.id}">
        <div class="wall-prev" style="background-image:${OS.Wallpapers.url(w.id)}"><div class="wp-time">9:41</div></div>
        <span>${OS.esc(w.name)}</span></button>`).join('')}</div>`);
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w]');
        if (!b) return;
        OS.set('wallpaper', b.dataset.w);
        grid.querySelectorAll('.wall-opt').forEach((x) => x.classList.toggle('on', x === b));
      });
      body.appendChild(OS.el('<div class="section-head" style="padding:0 32px 10px">Scegli uno sfondo</div>'));
      body.appendChild(grid);
    });

    P.notifications = () => groupedPage('Notifiche', (body) => {
      const s = S();
      body.appendChild(UI().section([
        { title: 'Mostra anteprime', value: s.previews ? 'Sempre' : 'Se sbloccato', chevron: true, onTap: () => OS.set('previews', !s.previews) },
        { title: 'Condivisione schermo', value: 'Notifiche disattivate', chevron: true },
      ]));
      body.appendChild(UI().section(OS.appOrder.map((id) => UI().row({ leading: OS.icon(id, 'xs'), title: OS.apps[id].name, sub: 'Banner, suoni, badge', chevron: true })), 'Stile notifiche'));
    });

    P.sounds = () => groupedPage('Suoni e feedback aptico', (body) => {
      const s = S();
      const vol = UI().slider(s.volume, (v) => OS.set('volume', v), { min: 0, max: 1, step: .01 });
      const vrow = OS.el(`<div class="row" style="gap:12px">${OS.sym('speaker-slash', { size: 18 })}<div style="flex:1"></div>${OS.sym('speaker', { size: 20 })}</div>`);
      vrow.children[1].appendChild(vol);
      body.appendChild(UI().section([
        { title: 'Modalità silenziosa', toggle: { on: s.silent, onChange: (v) => OS.set('silent', v) } },
      ]));
      body.appendChild(UI().section([vrow, { title: 'Modifica con i tasti', toggle: { on: true } }], 'Suoneria e avvisi'));
      body.appendChild(UI().section([
        { title: 'Suoneria', value: 'Riflessione', chevron: true },
        { title: 'Suono SMS', value: 'Nota', chevron: true },
        { title: 'Clic tastiera', toggle: { on: s.keyClicks, onChange: (v) => OS.set('keyClicks', v) } },
        { title: 'Suono di blocco', toggle: { on: true } },
      ]));
    });

    P.focus = () => groupedPage('Full immersione', (body) => {
      const s = S();
      body.appendChild(UI().section([
        { icon: 'moon', color: 'var(--indigo)', title: 'Non disturbare', toggle: { on: s.focus, onChange: (v) => OS.set('focus', v) } },
        { icon: 'person-fill', color: 'var(--orange)', title: 'Personale', chevron: true },
        { icon: 'bed', color: 'var(--teal)', title: 'Riposo', chevron: true },
        { icon: 'doc-text', color: 'var(--blue)', title: 'Lavoro', chevron: true },
      ], null, 'Con Full immersione attiva le notifiche vengono silenziate e non compaiono i banner.'));
    });

    const simple = (title, rows, foot) => groupedPage(title, (body) => {
      body.appendChild(UI().section(rows.map((r) => (typeof r === 'string' ? { title: r, toggle: { on: OS.rng(r)() > .4 } } : r)), null, foot));
    });
    P.accessibility = () => simple('Accessibilità', ['VoiceOver', 'Zoom', 'Testo più grande', 'Riduci movimento', 'Riduci trasparenza', 'Aumenta contrasto', 'AssistiveTouch']);
    P.action = () => simple('Tasto Azione', [{ title: 'Modalità silenziosa', check: true }, { title: 'Full immersione' }, { title: 'Fotocamera' }, { title: 'Torcia' }], 'Premi il tasto Azione sul lato del dispositivo per attivare o disattivare la modalità silenziosa.');
    P.camera = () => simple('Fotocamera', ['Griglia', 'Livella', 'Specchia fotocamera anteriore', 'Rileva testo']);
    P.controlcenter = () => simple('Centro di Controllo', ['Accesso nelle app', 'Mostra controlli Casa'], 'Scorri verso il basso dall\'angolo in alto a destra per aprire il Centro di Controllo.');
    P.search = () => simple('Cerca', ['Mostra suggerimenti', 'Mostra contenuti recenti', 'Mostra in Libreria app']);
    P.screentime = () => groupedPage('Tempo di utilizzo', (body) => {
      body.appendChild(OS.el(`<div class="section"><div class="list" style="padding:16px 18px">
        <div style="color:var(--label2);font-size:13px;text-transform:uppercase">Media giornaliera</div>
        <div style="font-size:30px;font-weight:700;margin:4px 0 12px">3 h 12 min</div>
        <div class="battery-chart" style="height:80px">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => `<i style="height:${40 + OS.rng(d + i)() * 55}%;background:var(--indigo)"></i>`).join('')}</div>
      </div></div>`));
      body.appendChild(UI().section(['Tempo di inattività', 'Limitazioni app', 'Sempre consentite', 'Distanza schermo'].map((t) => ({ title: t, chevron: true }))));
    });
    P.privacy = () => simple('Privacy e sicurezza', [{ title: 'Localizzazione', value: 'Sì', chevron: true }, { title: 'Tracciamento', chevron: true }, { title: 'Contatti', chevron: true }, { title: 'Calendari', chevron: true }, { title: 'Foto', chevron: true }, { title: 'Microfono', chevron: true }, { title: 'Fotocamera', chevron: true }]);
    P.apps = () => groupedPage('App', (body) => {
      const ids = OS.appOrder.slice().sort((a, b) => OS.apps[a].name.localeCompare(OS.apps[b].name, 'it'));
      body.appendChild(UI().section(ids.map((id) => UI().row({ leading: OS.icon(id, 'xs'), title: OS.apps[id].name, chevron: true, onTap: () => OS.Apps.open(id) }))));
    });

    return P;
  }
})();
