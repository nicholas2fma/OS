/* ==========================================================================
   Musica — generative songs (Web Audio), mini player, full player,
   Now Playing in the Dynamic Island / Control Center / lock screen
   ========================================================================== */
(function () {
  'use strict';

  const ALBUMS = {
    a1: { title: 'Vetro Liquido', artist: 'Aurora Nova', year: 2026, colors: ['#3a7bd5', '#00d2ff'], shape: 'waves' },
    a2: { title: 'Notti Italiane', artist: 'I Lampioni', year: 2025, colors: ['#f857a6', '#ff5858'], shape: 'sun' },
    a3: { title: 'Onde Lente', artist: 'Marea', year: 2024, colors: ['#11998e', '#38ef7d'], shape: 'rings' },
    a4: { title: 'Città di Luce', artist: 'Neon Riviera', year: 2026, colors: ['#7f00ff', '#e100ff'], shape: 'grid' },
  };

  const SONGS = [
    { id: 's1', album: 'a1', title: 'Rifrazione', bpm: 104, key: 'D', scale: 'major', prog: [0, 4, 5, 3], style: 'arp', lead: 'triangle', duration: 142, seed: 11 },
    { id: 's2', album: 'a1', title: 'Trasparenze', bpm: 92, key: 'A', scale: 'major', prog: [0, 5, 3, 4], style: 'soft', lead: 'sine', duration: 128, seed: 12 },
    { id: 's3', album: 'a2', title: 'Lungotevere', bpm: 118, key: 'F', scale: 'minor', prog: [0, 5, 2, 6], style: 'four', lead: 'square', duration: 156, seed: 21 },
    { id: 's4', album: 'a2', title: 'Vespa Blu', bpm: 124, key: 'G', scale: 'major', prog: [0, 3, 4, 4], style: 'four', lead: 'sawtooth', duration: 134, seed: 22 },
    { id: 's5', album: 'a3', title: 'Bassa Marea', bpm: 84, key: 'E', scale: 'dorian', prog: [0, 3, 0, 4], style: 'soft', lead: 'sine', duration: 150, seed: 31 },
    { id: 's6', album: 'a3', title: 'Conchiglie', bpm: 96, key: 'C', scale: 'major', prog: [5, 3, 0, 4], style: 'arp', lead: 'triangle', duration: 138, seed: 32 },
    { id: 's7', album: 'a4', title: 'Neon', bpm: 128, key: 'B', scale: 'minor', prog: [0, 6, 5, 6], style: 'four', lead: 'square', duration: 146, seed: 41 },
    { id: 's8', album: 'a4', title: 'Sopraelevata', bpm: 110, key: 'C#', scale: 'minor', prog: [0, 3, 6, 4], style: 'arp', lead: 'sawtooth', duration: 132, seed: 42 },
  ];
  SONGS.forEach((s) => { s.artist = ALBUMS[s.album].artist; });

  let coverN = 0;
  function cover(albumId, size) {
    const a = ALBUMS[albumId];
    const id = 'cv' + (++coverN);
    const r = OS.rng(albumId);
    let shape = '';
    if (a.shape === 'waves') {
      for (let i = 0; i < 6; i++) shape += `<path d="M-10 ${40 + i * 14}C20 ${30 + i * 14} 40 ${55 + i * 14} 60 ${42 + i * 14}S95 ${30 + i * 14} 110 ${45 + i * 14}" fill="none" stroke="rgba(255,255,255,${.15 + i * .1})" stroke-width="3"/>`;
    } else if (a.shape === 'sun') {
      shape = `<circle cx="50" cy="52" r="24" fill="rgba(255,240,200,.9)"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="20" y="${60 + i * 7}" width="60" height="3" fill="${a.colors[0]}"/>`).join('')}<rect x="0" y="80" width="100" height="20" fill="rgba(40,10,40,.35)"/>`;
    } else if (a.shape === 'rings') {
      shape = [0, 1, 2, 3, 4].map((i) => `<circle cx="${50 + (r() - .5) * 8}" cy="${50 + (r() - .5) * 8}" r="${10 + i * 9}" fill="none" stroke="rgba(255,255,255,${.6 - i * .1})" stroke-width="2.5"/>`).join('');
    } else {
      for (let i = 0; i < 6; i++) shape += `<path d="M${i * 20 - 10} 100L50 45" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><path d="M0 ${60 + i * 8}H100" stroke="rgba(255,255,255,${.1 + i * .06})" stroke-width="1.5"/>`;
      shape += '<rect x="0" y="0" width="100" height="45" fill="rgba(0,0,0,.15)"/><circle cx="50" cy="40" r="10" fill="rgba(255,255,255,.85)"/>';
    }
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block;width:100%;height:100%" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.colors[0]}"/><stop offset="1" stop-color="${a.colors[1]}"/></linearGradient></defs>
      <rect width="100" height="100" fill="url(#${id})"/>${shape}
      <text x="8" y="16" font-size="7" font-weight="700" fill="rgba(255,255,255,.9)" font-family="-apple-system,Inter,sans-serif" letter-spacing=".5">${OS.esc(a.artist.toUpperCase())}</text></svg>`;
  }

  const M = () => OS.Audio.Music;
  const Library = {
    songs: SONGS,
    albums: ALBUMS,
    cover,
    play(song) { M().load(song, true); },
    next() {
      const cur = M().song;
      const i = cur ? SONGS.indexOf(cur) : -1;
      M().load(SONGS[(i + 1) % SONGS.length], true);
    },
    prev() {
      const cur = M().song;
      if (cur && M().position() > 3) { M().seek(0); return; }
      const i = cur ? SONGS.indexOf(cur) : 0;
      M().load(SONGS[(i - 1 + SONGS.length) % SONGS.length], true);
    },
  };
  OS.MusicLibrary = Library;

  /* Dynamic Island live activity */
  function islandActivity() {
    const mu = M();
    if (!mu.song) { OS.Island.clear('music'); return; }
    if (!mu.playing && !OS.Island.has('music') && mu.position() === 0) return;
    if (!mu.playing && !OS.Island.has('music')) return;
    OS.Island.set('music', {
      priority: 1,
      width: 200,
      left: () => `<div class="isl-art">${cover(mu.song.album, 24)}</div>`,
      right: () => `<div class="isl-bars ${mu.playing ? '' : 'paused'}" style="--c:${ALBUMS[mu.song.album].colors[1]}"><i></i><i></i><i></i><i></i></div>`,
      bubble: () => `<div class="isl-art" style="width:22px;height:22px;border-radius:50%">${cover(mu.song.album, 22)}</div>`,
      expandedHeight: 178,
      expanded(el) {
        const s = mu.song;
        el.innerHTML = `<div class="isl-row"><div class="isl-art" style="width:52px;height:52px;border-radius:12px">${cover(s.album, 52)}</div>
          <div style="min-width:0;flex:1"><div class="isl-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${OS.esc(s.title)}</div><div class="isl-sub">${OS.esc(s.artist)}</div></div>
          <div class="isl-bars ${mu.playing ? '' : 'paused'}" style="--c:${ALBUMS[s.album].colors[1]}"><i></i><i></i><i></i><i></i></div></div>
          <div class="isl-row" style="gap:8px;font-size:11px;color:rgba(255,255,255,.55)"><span class="tnum isl-pos">${OS.fmt.duration(mu.position())}</span><div class="isl-progress" style="flex:1"><i style="width:${(mu.position() / s.duration) * 100}%"></i></div><span class="tnum">-${OS.fmt.duration(s.duration - mu.position())}</span></div>
          <div class="isl-row" style="justify-content:center;gap:44px">
            <button data-a="prev" style="color:#fff">${OS.sym('backward', { size: 26 })}</button>
            <button data-a="toggle" style="color:#fff">${OS.sym(mu.playing ? 'pause' : 'play', { size: 32 })}</button>
            <button data-a="next" style="color:#fff">${OS.sym('forward', { size: 26 })}</button></div>`;
        el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (b.dataset.a === 'toggle') mu.toggle();
          if (b.dataset.a === 'next') Library.next();
          if (b.dataset.a === 'prev') Library.prev();
        }));
      },
      refreshExpanded(el) {
        const s = mu.song;
        const pos = el.querySelector('.isl-pos');
        const bar = el.querySelector('.isl-progress i');
        if (pos && s) { pos.textContent = OS.fmt.duration(mu.position()); bar.style.width = (mu.position() / s.duration) * 100 + '%'; }
      },
      onTap() { OS.Apps.open('music', { data: { player: true } }); },
    });
  }

  OS.onBoot(() => {
    OS.on('music:change', islandActivity);
    OS.on('music:state', () => {
      islandActivity();
      OS.Island.update('music');
      if ('mediaSession' in navigator && M().song) {
        const s = M().song;
        try { navigator.mediaSession.metadata = new window.MediaMetadata({ title: s.title, artist: s.artist, album: ALBUMS[s.album].title }); } catch (e) { /* unsupported */ }
      }
    });
    OS.on('music:ended', () => Library.next());
    setInterval(() => { if (M().playing && OS.Island.expanded) OS.Island.update('music'); }, 1000);
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => M().play());
        navigator.mediaSession.setActionHandler('pause', () => M().pause());
        navigator.mediaSession.setActionHandler('nexttrack', () => Library.next());
        navigator.mediaSession.setActionHandler('previoustrack', () => Library.prev());
      } catch (e) { /* unsupported */ }
    }
  });

  /* ---------------- app ---------------- */

  OS.registerApp({
    id: 'music',
    name: 'Musica',
    keywords: 'musica canzoni brani album playlist',
    quickActions: [{ label: 'Riproduci in ordine casuale', icon: 'shuffle', data: { shuffle: true } }],
    mount(root) {
      root.innerHTML = `<div class="mu-app"><div class="mu-nav"></div></div>`;
      const app = root.querySelector('.mu-app');
      const navRoot = root.querySelector('.mu-nav');
      let nav = null;
      let tab = 'home';

      const tb = OS.UI.tabBar([
        { id: 'home', label: 'Home', icon: 'house' },
        { id: 'new', label: 'Novità', icon: 'square-grid' },
        { id: 'radio', label: 'Radio', icon: 'antenna' },
        { id: 'library', label: 'Libreria', icon: 'music-note' },
      ], tab, (id) => { tab = id; rebuild(); }, { search: () => { tab = 'library'; tb.set('library'); rebuild(); } });
      const mini = OS.el(`<button class="mu-mini glass"><div class="mu-mini-art"></div><div class="mu-mini-title"></div><span class="mu-mini-btn" data-a="toggle"></span><span class="mu-mini-btn" data-a="next">${OS.sym('forward', { size: 22 })}</span></button>`);
      app.appendChild(mini);
      app.appendChild(tb);
      OS.Glass.attach(mini, { bezel: 16, strength: 22 });

      function paintMini() {
        const mu = M();
        const s = mu.song || SONGS[0];
        mini.querySelector('.mu-mini-art').innerHTML = cover(s.album, 36);
        mini.querySelector('.mu-mini-title').textContent = mu.song ? s.title : 'Non in riproduzione';
        mini.querySelector('[data-a="toggle"]').innerHTML = OS.sym(mu.playing ? 'pause' : 'play', { size: 22 });
      }
      mini.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (b) {
          if (b.dataset.a === 'toggle') { if (!M().song) Library.play(SONGS[0]); else M().toggle(); }
          if (b.dataset.a === 'next') Library.next();
          return;
        }
        openPlayer();
      });

      const albumCard = (id) => `<button class="mu-card" data-album="${id}"><div class="mu-card-art">${cover(id, 160)}</div><b>${OS.esc(ALBUMS[id].title)}</b><span>${OS.esc(ALBUMS[id].artist)}</span></button>`;
      const songRow = (s, i) => `<div class="mu-song" data-song="${s.id}">${i != null ? `<span class="mu-num">${i + 1}</span>` : `<div class="mu-song-art">${cover(s.album, 44)}</div>`}
        <div class="mu-song-main"><b>${OS.esc(s.title)}</b><span>${OS.esc(s.artist)}</span></div>${M().song === s && M().playing ? '<div class="isl-bars" style="--c:var(--pink)"><i></i><i></i><i></i><i></i></div>' : ''}<span class="mu-more">${OS.sym('ellipsis', { size: 18 })}</span></div>`;

      function rebuild() {
        navRoot.innerHTML = '';
        const holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;inset:0';
        navRoot.appendChild(holder);
        nav = new OS.UI.Nav(holder);
        const pages = {
          home: {
            title: 'Home', large: true,
            render(body) {
              body.innerHTML = `<div class="mu-sec"><h2>Ascoltati di recente ${OS.sym('chevron-right', { size: 16, stroke: 2.8 })}</h2><div class="mu-row scroll-x">${Object.keys(ALBUMS).map(albumCard).join('')}</div></div>
                <div class="mu-sec"><h2>Brani consigliati</h2><div class="mu-songs">${SONGS.slice(0, 5).map((s) => songRow(s)).join('')}</div></div>
                <div class="mu-sec"><h2>Creato per te</h2><div class="mu-row scroll-x">${['Mix preferiti', 'Mix relax', 'Nuove uscite'].map((t, i) => `<button class="mu-card mix" data-mix="${i}"><div class="mu-card-art" style="background:linear-gradient(135deg,${['#ff375f,#ff9f0a', '#30d158,#64d2ff', '#5e5ce6,#bf5af2'][i]})"><b>${t}</b></div><span>Aggiornato oggi</span></button>`).join('')}</div></div>`;
            },
          },
          new: {
            title: 'Novità', large: true,
            render(body) {
              body.innerHTML = `<div class="mu-hero" style="background:linear-gradient(135deg,${ALBUMS.a4.colors.join(',')})"><span>NUOVO ALBUM</span><b>${ALBUMS.a4.title}</b><small>${ALBUMS.a4.artist}</small></div>
                <div class="mu-sec"><h2>Ultime uscite</h2><div class="mu-row scroll-x">${['a4', 'a1', 'a2', 'a3'].map(albumCard).join('')}</div></div>
                <div class="mu-sec"><h2>Classifiche</h2><div class="mu-songs">${SONGS.slice().reverse().slice(0, 6).map((s, i) => songRow(s, i)).join('')}</div></div>`;
            },
          },
          radio: {
            title: 'Radio', large: true,
            render(body) {
              body.innerHTML = `<div class="mu-hero" style="background:linear-gradient(135deg,#ff375f,#5e5ce6)"><span>IN DIRETTA</span><b>Radio Vetro</b><small>Musica generativa, 24 ore su 24</small></div>
                <div class="mu-sec"><h2>Stazioni</h2><div class="mu-songs">${SONGS.slice(2, 7).map((s) => songRow(s)).join('')}</div></div>`;
            },
          },
          library: {
            title: 'Libreria', large: true,
            render(body) {
              body.innerHTML = `<div class="section"><div class="list">${[['list', 'Playlist'], ['person-fill', 'Artisti'], ['square-grid', 'Album'], ['music-note', 'Brani'], ['arrow-down-circle', 'Scaricati']].map(([ic, t]) => `<div class="row tap" data-libtab="${t}"><span style="color:var(--pink)">${OS.sym(ic, { size: 22 })}</span><div class="row-main">${t}</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div>`).join('')}</div></div>
                <div class="mu-sec"><h2>Aggiunti di recente</h2><div class="mu-grid">${Object.keys(ALBUMS).map(albumCard).join('')}</div></div>`;
            },
          },
        };
        nav.push(pages[tab], false);
        bindPage(nav.current);
      }

      function bindPage(page) {
        page.el.addEventListener('click', (e) => {
          const al = e.target.closest('[data-album]');
          if (al) { openAlbum(al.dataset.album); return; }
          const sg = e.target.closest('[data-song]');
          if (sg && !e.target.closest('.mu-more')) { Library.play(SONGS.find((s) => s.id === sg.dataset.song)); return; }
          const mx = e.target.closest('[data-mix]');
          if (mx) { const list = SONGS.slice().sort(() => Math.random() - .5); Library.play(list[0]); return; }
          const lt = e.target.closest('[data-libtab]');
          if (lt) openList(lt.dataset.libtab);
        });
      }

      function openAlbum(id) {
        const a = ALBUMS[id];
        const songs = SONGS.filter((s) => s.album === id);
        nav.push({
          title: a.title, cls: 'mu-album',
          render(body) {
            body.innerHTML = `<div class="mu-album-head"><div class="mu-album-art">${cover(id, 260)}</div><h1>${OS.esc(a.title)}</h1><h2>${OS.esc(a.artist)}</h2><span>Pop · ${a.year}</span>
              <div class="mu-album-btns"><button class="btn" data-play>${OS.sym('play', { size: 18 })} Riproduci</button><button class="btn" data-shuffle>${OS.sym('shuffle', { size: 18 })} Casuale</button></div></div>
              <div class="mu-songs">${songs.map((s, i) => songRow(s, i)).join('')}</div>
              <div class="mu-foot">${songs.length} brani, ${Math.round(songs.reduce((t, s) => t + s.duration, 0) / 60)} minuti</div>`;
            body.querySelector('[data-play]').addEventListener('click', () => Library.play(songs[0]));
            body.querySelector('[data-shuffle]').addEventListener('click', () => Library.play(songs[Math.floor(Math.random() * songs.length)]));
          },
        });
        bindPage(nav.current);
      }

      function openList(kind) {
        nav.push({
          title: kind, large: true,
          render(body) {
            if (kind === 'Album') body.innerHTML = `<div class="mu-grid" style="padding-top:6px">${Object.keys(ALBUMS).map(albumCard).join('')}</div>`;
            else if (kind === 'Artisti') body.innerHTML = `<div class="section"><div class="list">${Object.keys(ALBUMS).map((id) => `<div class="row tap" data-album="${id}"><div class="avatar" style="width:44px;height:44px;overflow:hidden">${cover(id, 44)}</div><div class="row-main">${OS.esc(ALBUMS[id].artist)}</div>${OS.sym('chevron-right', { cls: 'chev', stroke: 2.8 })}</div>`).join('')}</div></div>`;
            else body.innerHTML = `<div class="mu-songs">${SONGS.map((s) => songRow(s)).join('')}</div>`;
          },
        });
        bindPage(nav.current);
      }

      /* full screen player */
      let player = null;
      function openPlayer() {
        const mu = M();
        if (!mu.song) Library.play(SONGS[0]);
        if (player) return;
        player = OS.el(`<div class="mu-player">
          <div class="mu-p-bg"></div>
          <div class="mu-p-grab"></div>
          <div class="mu-p-art"></div>
          <div class="mu-p-info"><div><b class="mu-p-title"></b><span class="mu-p-artist"></span></div><button class="gbtn glass" aria-label="Preferito">${OS.sym('star')}</button></div>
          <div class="mu-p-seek"><div class="mu-p-track"><i></i></div><div class="mu-p-times tnum"><span class="t0"></span><span class="t1"></span></div></div>
          <div class="mu-p-ctrl"><button data-a="prev">${OS.sym('backward', { size: 40 })}</button><button data-a="toggle" class="big"></button><button data-a="next">${OS.sym('forward', { size: 40 })}</button></div>
          <div class="mu-p-vol">${OS.sym('speaker-slash', { size: 16 })}<div class="mu-p-volbar"><i></i></div>${OS.sym('speaker', { size: 18 })}</div>
          <div class="mu-p-bottom">${OS.sym('text-bubble', { size: 22 })}${OS.sym('waveform', { size: 22 })}${OS.sym('list', { size: 22 })}</div>
        </div>`);
        app.appendChild(player);
        paintPlayer(true);
        requestAnimationFrame(() => player.classList.add('show'));
        player.addEventListener('click', (e) => {
          const b = e.target.closest('[data-a]');
          if (!b) return;
          if (b.dataset.a === 'toggle') M().toggle();
          if (b.dataset.a === 'next') Library.next();
          if (b.dataset.a === 'prev') Library.prev();
        });
        // seek + volume scrubbing
        const scrub = (sel, fn) => {
          const el = player.querySelector(sel);
          let on = false;
          const set = (e) => { const r = OS.rectOf(el); fn(OS.clamp((OS.point(e).x - r.x) / r.width, 0, 1)); };
          el.addEventListener('pointerdown', (e) => { on = true; e.stopPropagation(); el.classList.add('active'); set(e); });
          window.addEventListener('pointermove', (e) => { if (on) set(e); });
          window.addEventListener('pointerup', () => { on = false; el.classList.remove('active'); });
        };
        scrub('.mu-p-track', (p) => { if (M().song) M().seek(p * M().song.duration); paintPlayer(); });
        scrub('.mu-p-volbar', (p) => { OS.set('volume', p); paintPlayer(); });
        // drag down to close
        let s = null;
        player.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button, .mu-p-track, .mu-p-volbar')) return;
          s = OS.point(e).y; player.style.transition = 'none';
        });
        player.addEventListener('pointermove', (e) => { if (s != null) { const dy = Math.max(0, OS.point(e).y - s); player.style.transform = `translateY(${dy}px)`; } });
        const end = (e) => {
          if (s == null) return;
          const dy = OS.point(e).y - s;
          s = null;
          player.style.transition = '';
          player.style.transform = '';
          if (dy > 120) closePlayer();
        };
        player.addEventListener('pointerup', end);
        player.addEventListener('pointercancel', end);
      }

      function closePlayer() {
        if (!player) return;
        const p = player;
        player = null;
        p.classList.remove('show');
        setTimeout(() => p.remove(), 450);
      }

      function paintPlayer(full) {
        if (!player) return;
        const mu = M();
        const s = mu.song;
        if (!s) return;
        const a = ALBUMS[s.album];
        if (full || player.dataset.song !== s.id) {
          player.dataset.song = s.id;
          player.querySelector('.mu-p-bg').style.background = `radial-gradient(120% 80% at 30% 20%, ${a.colors[1]}, transparent 60%), radial-gradient(120% 80% at 80% 90%, ${a.colors[0]}, transparent 60%), #1c1c1e`;
          player.querySelector('.mu-p-art').innerHTML = cover(s.album, 320);
          player.querySelector('.mu-p-title').textContent = s.title;
          player.querySelector('.mu-p-artist').textContent = s.artist;
        }
        player.querySelector('.mu-p-art').classList.toggle('paused', !mu.playing);
        player.querySelector('[data-a="toggle"]').innerHTML = OS.sym(mu.playing ? 'pause' : 'play', { size: 50 });
        const pos = mu.position();
        player.querySelector('.mu-p-track i').style.width = (pos / s.duration) * 100 + '%';
        player.querySelector('.t0').textContent = OS.fmt.duration(pos);
        player.querySelector('.t1').textContent = '-' + OS.fmt.duration(s.duration - pos);
        player.querySelector('.mu-p-volbar i').style.width = OS.settings.volume * 100 + '%';
      }

      const refresh = () => {
        paintMini();
        paintPlayer();
        // update "now playing" bars in visible lists
        if (nav && nav.current) nav.current.el.querySelectorAll('.mu-song').forEach((row) => {
          const s = SONGS.find((x) => x.id === row.dataset.song);
          const bars = row.querySelector('.isl-bars');
          const on = M().song === s && M().playing;
          if (on && !bars) row.querySelector('.mu-more').insertAdjacentHTML('beforebegin', '<div class="isl-bars" style="--c:var(--pink)"><i></i><i></i><i></i><i></i></div>');
          if (!on && bars) bars.remove();
        });
      };
      const offs = [OS.on('music:change', refresh), OS.on('music:state', refresh), OS.on('setting:volume', () => paintPlayer())];
      const iv = setInterval(() => { if (M().playing) paintPlayer(); }, 500);

      rebuild();
      paintMini();
      return {
        onShow(data) {
          if (data && data.player) openPlayer();
          if (data && data.shuffle) Library.play(SONGS[Math.floor(Math.random() * SONGS.length)]);
          paintMini();
        },
        onDestroy() { offs.forEach((f) => f()); clearInterval(iv); },
      };
    },
  });
})();
