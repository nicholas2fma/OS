/* ==========================================================================
   Foto — procedurally painted library + camera captures, viewer, albums
   ========================================================================== */
(function () {
  'use strict';

  const W = 480, H = 640;

  /* ---------------- procedural photography ---------------- */

  function grad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }

  function ridge(ctx, r, baseY, amp, color, rough) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    let y = baseY;
    for (let x = 0; x <= W; x += 8) {
      y += (r() - .5) * (rough || 18);
      y = Math.max(baseY - amp, Math.min(baseY + amp * .4, y));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  const PAINTERS = {
    sunset(ctx, r) {
      const hue = r() * 40;
      ctx.fillStyle = grad(ctx, 0, H * .62, [[0, `hsl(${250 + hue} 50% 25%)`], [.5, `hsl(${330 + hue} 70% 55%)`], [1, `hsl(${25 + hue / 2} 95% 62%)`]]);
      ctx.fillRect(0, 0, W, H);
      const sx = W * (.3 + r() * .4), sy = H * .55;
      const g = ctx.createRadialGradient(sx, sy, 5, sx, sy, 160);
      g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.25, 'rgba(255,200,120,.8)'); g.addColorStop(1, 'rgba(255,150,80,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad(ctx, H * .62, H, [[0, `hsl(${280 + hue} 40% 30%)`], [1, `hsl(${230 + hue} 50% 12%)`]]);
      ctx.fillRect(0, H * .62, W, H);
      for (let i = 0; i < 40; i++) {
        const y = H * .63 + r() * H * .35;
        const w = 20 + r() * 120 * (1 - (y - H * .62) / H);
        ctx.fillStyle = `rgba(255,200,140,${.15 + r() * .35})`;
        ctx.fillRect(sx - w / 2 + (r() - .5) * 60, y, w, 2);
      }
    },
    mountains(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H * .7, [[0, '#4f8fe0'], [.7, '#a9cdf2'], [1, '#e8f1f8']]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) {
        const l = 70 - i * 14;
        ridge(ctx, r, H * (.45 + i * .11), 120 - i * 15, `hsl(${210 - i * 8} ${25 + i * 6}% ${l}%)`, 26);
      }
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(0, H * .4, W, H * .2);
    },
    city(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H, [[0, '#070b1e'], [.6, '#1b1f45'], [1, '#2b2350']]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 80; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .7})`; ctx.fillRect(r() * W, r() * H * .5, 1.4, 1.4); }
      let x = 0;
      while (x < W) {
        const bw = 30 + r() * 60, bh = H * (.2 + r() * .45);
        ctx.fillStyle = `hsl(${230 + r() * 20} 25% ${10 + r() * 8}%)`;
        ctx.fillRect(x, H - bh, bw, bh);
        for (let wy = H - bh + 8; wy < H - 6; wy += 12) {
          for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
            if (r() > .55) { ctx.fillStyle = `hsla(${40 + r() * 20} 100% ${60 + r() * 25}% / ${.5 + r() * .5})`; ctx.fillRect(wx, wy, 4, 6); }
          }
        }
        x += bw + 2;
      }
    },
    aurora(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H, [[0, '#020812'], [1, '#0a2a3a']]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .8})`; ctx.fillRect(r() * W, r() * H * .6, 1.3, 1.3); }
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const hue = [140, 170, 280][k];
        for (let x = 0; x < W; x += 3) {
          const top = H * (.15 + .1 * Math.sin(x / (60 + k * 20) + k * 2 + r() * .1));
          const len = H * (.25 + .1 * Math.sin(x / 40 + k));
          const g = ctx.createLinearGradient(0, top, 0, top + len);
          g.addColorStop(0, `hsla(${hue} 100% 60% / 0)`); g.addColorStop(.6, `hsla(${hue} 100% 60% / .18)`); g.addColorStop(1, `hsla(${hue} 100% 60% / 0)`);
          ctx.fillStyle = g; ctx.fillRect(x, top, 3, len);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ridge(ctx, r, H * .8, 40, '#01060c', 14);
    },
    dunes(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H * .5, [[0, '#f6c28b'], [1, '#fde9c9']]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const y0 = H * (.45 + i * .11);
        ctx.moveTo(0, y0);
        ctx.bezierCurveTo(W * .3, y0 - 60 * r(), W * .6, y0 + 50 * r(), W, y0 - 30 * r());
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fillStyle = `hsl(${28 + i * 2} ${60 + i * 4}% ${70 - i * 9}%)`;
        ctx.fill();
      }
    },
    bokeh(ctx, r) {
      const hue = r() * 360;
      ctx.fillStyle = grad(ctx, 0, H, [[0, `hsl(${hue} 50% 12%)`], [1, `hsl(${hue + 60} 50% 20%)`]]);
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const x = r() * W, y = r() * H, rad = 10 + r() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const c = `hsla(${hue + r() * 120} 90% 65%`;
        g.addColorStop(0, c + ' / .5)'); g.addColorStop(.8, c + ' / .25)'); g.addColorStop(1, c + ' / 0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    },
    forest(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H * .6, [[0, '#9fd3f5'], [1, '#e9f6e9']]);
      ctx.fillRect(0, 0, W, H);
      for (let layer = 0; layer < 4; layer++) {
        const base = H * (.45 + layer * .13);
        ridge(ctx, r, base + 20, 30, `hsl(${120 + layer * 6} ${30 + layer * 8}% ${55 - layer * 11}%)`, 10);
        for (let i = 0; i < 26; i++) {
          const x = r() * W, h = 40 + r() * 70 + layer * 20;
          ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x - h * .28, base + 10); ctx.lineTo(x + h * .28, base + 10); ctx.closePath();
          ctx.fillStyle = `hsl(${130 + layer * 5} ${35 + layer * 8}% ${45 - layer * 10}%)`; ctx.fill();
        }
      }
    },
    beach(ctx, r) {
      ctx.fillStyle = grad(ctx, 0, H * .45, [[0, '#2a8de6'], [1, '#9fd8ff']]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = grad(ctx, H * .45, H * .72, [[0, '#0e7fb8'], [1, '#3fd0d4']]);
      ctx.fillRect(0, H * .45, W, H * .27);
      ctx.beginPath(); ctx.moveTo(0, H * .7);
      for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * .7 + Math.sin(x / 30 + r()) * 6);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = '#f2dfb6'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * .7 + Math.sin(x / 30) * 6 - 2); ctx.stroke();
      for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(r() * W, H * .1 + r() * H * .2, 30 + r() * 40, 10 + r() * 8, 0, 0, Math.PI * 2); ctx.fill(); }
    },
  };
  const KINDS = Object.keys(PAINTERS);
  const KIND_NAMES = { sunset: 'Tramonti', mountains: 'Montagne', city: 'Città', aurora: 'Aurore', dunes: 'Deserto', bokeh: 'Luci', forest: 'Natura', beach: 'Mare' };

  function paint(kind, seed, w, h) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    PAINTERS[kind](ctx, OS.rng(seed));
    // subtle film grain
    const r = OS.rng(seed + 99);
    for (let i = 0; i < 1200; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * .05})`; ctx.fillRect(r() * W, r() * H, 1, 1); }
    if (w && h) {
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const s = Math.max(w / W, h / H);
      t.getContext('2d').drawImage(c, (w - W * s) / 2, (h - H * s) / 2, W * s, H * s);
      return t.toDataURL('image/jpeg', .82);
    }
    return c.toDataURL('image/jpeg', .86);
  }

  /* ---------------- service ---------------- */

  const Service = {
    items: null,
    favs: new Set(OS.store.get('photos:favs', [])),
    deleted: new Set(OS.store.get('photos:deleted', [])),
    captured: OS.store.get('photos:captured', []),
    build() {
      if (this.items) return this.items;
      const now = Date.now();
      const gen = Array.from({ length: 36 }, (_, i) => ({
        id: 'p' + i,
        kind: KINDS[i % KINDS.length],
        seed: i * 7919 + 13,
        date: now - (36 - i) * 86400000 * 1.7 - (i * 3600000 * 5) % 86400000,
      }));
      this.items = gen.concat(this.captured.map((c) => ({ id: c.id, src: c.src, date: c.date, kind: 'camera' })))
        .filter((p) => !this.deleted.has(p.id))
        .sort((a, b) => a.date - b.date);
      return this.items;
    },
    src(p) {
      if (!p.src) p.src = paint(p.kind, p.seed);
      return p.src;
    },
    thumb(p) {
      if (p.kind === 'camera') return p.src;
      if (!p.thumb) p.thumb = paint(p.kind, p.seed, 160, 160);
      return p.thumb;
    },
    count() { return this.build().length; },
    add(src) {
      const p = { id: 'c' + Date.now(), src, date: Date.now(), kind: 'camera' };
      this.build().push(p);
      this.captured.push({ id: p.id, src, date: p.date });
      while (this.captured.length > 12) this.captured.shift();
      try { OS.store.set('photos:captured', this.captured); } catch (e) { /* quota */ }
      OS.emit('photos');
      return p;
    },
    remove(p) {
      this.items = this.build().filter((x) => x !== p);
      if (p.kind === 'camera') {
        this.captured = this.captured.filter((c) => c.id !== p.id);
        OS.store.set('photos:captured', this.captured);
      } else {
        this.deleted.add(p.id);
        OS.store.set('photos:deleted', Array.from(this.deleted));
      }
      OS.emit('photos');
    },
    toggleFav(p) {
      if (this.favs.has(p.id)) this.favs.delete(p.id); else this.favs.add(p.id);
      OS.store.set('photos:favs', Array.from(this.favs));
      OS.emit('photos');
    },
    last() { const it = this.build(); return it[it.length - 1]; },
  };
  OS.PhotosService = Service;
  OS.paintPhoto = paint;

  /* ---------------- app ---------------- */

  OS.registerApp({
    id: 'photos',
    name: 'Foto',
    keywords: 'foto immagini galleria album',
    mount(root) {
      root.innerHTML = `<div class="ph-app">
        <section class="ph-view on" data-v="library">
          <header class="ph-head"><div><h1>Libreria</h1><span class="ph-count"></span></div><div style="display:flex;gap:8px"><button class="gbtn glass" data-a="select">Seleziona</button></div></header>
          <div class="ph-scroll scroll"><div class="ph-grid"></div></div>
        </section>
        <section class="ph-view" data-v="albums"><div class="ph-scroll scroll ph-albums"></div></section>
      </div>`;
      const grid = root.querySelector('.ph-grid');
      const scroller = root.querySelector('[data-v="library"] .ph-scroll');
      const albumsEl = root.querySelector('.ph-albums');
      let current = Service.build();

      const tb = OS.UI.tabBar([
        { id: 'library', label: 'Libreria', icon: 'photo' },
        { id: 'albums', label: 'Raccolte', icon: 'photo-stack' },
      ], 'library', (id) => {
        root.querySelectorAll('.ph-view').forEach((v) => v.classList.toggle('on', v.dataset.v === id));
        if (id === 'albums') paintAlbums();
      }, { search: () => OS.Island.flash({ left: OS.sym('search', { size: 18 }), right: '<span>Cerca in Foto</span>', width: 220 }) });
      root.querySelector('.ph-app').appendChild(tb);

      function paintGrid(scrollBottom) {
        const items = Service.build();
        current = items;
        root.querySelector('.ph-count').textContent = items.length + ' elementi';
        const ready = (p) => p.kind === 'camera' || p.thumb;
        grid.innerHTML = items.map((p, i) => `<button class="ph-cell" data-i="${i}" style="${ready(p) ? `background-image:url('${Service.thumb(p)}')` : ''}">${Service.favs.has(p.id) ? `<span class="ph-fav">${OS.sym('heart-fill', { size: 12 })}</span>` : ''}</button>`).join('');
        if (scrollBottom) requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
        // paint missing thumbnails progressively, newest first, without blocking the launch animation
        const todo = items.map((p, i) => [p, i]).filter(([p]) => !ready(p)).reverse();
        const step = () => {
          const t0 = performance.now();
          while (todo.length && performance.now() - t0 < 12) {
            const [p, i] = todo.shift();
            const cell = grid.querySelector(`.ph-cell[data-i="${i}"]`);
            if (cell) cell.style.backgroundImage = `url('${Service.thumb(p)}')`;
          }
          if (todo.length) setTimeout(step, 16);
        };
        setTimeout(step, 420);
      }

      function paintAlbums() {
        const all = Service.build();
        const albums = [
          { name: 'Recenti', items: all },
          { name: 'Preferiti', items: all.filter((p) => Service.favs.has(p.id)) },
          { name: 'Scattate', items: all.filter((p) => p.kind === 'camera') },
        ].concat(Object.keys(KIND_NAMES).map((k) => ({ name: KIND_NAMES[k], items: all.filter((p) => p.kind === k) })));
        albumsEl.innerHTML = `<h1 class="large-title" style="padding:60px 20px 10px">Raccolte</h1>
          <div class="section-head big" style="padding:0 20px 10px">Album</div>
          <div class="ph-album-grid">${albums.map((a, i) => `<button class="ph-album" data-a="${i}">
            <div class="ph-album-cover" style="${a.items.length ? `background-image:url('${Service.thumb(a.items[a.items.length - 1])}')` : ''}">${a.items.length ? '' : OS.sym(i === 1 ? 'heart' : 'photo', { size: 34 })}</div>
            <b>${OS.esc(a.name)}</b><span>${a.items.length}</span></button>`).join('')}</div>`;
        albumsEl.querySelectorAll('.ph-album').forEach((b) => b.addEventListener('click', () => {
          const a = albums[+b.dataset.a];
          if (a.items.length) openViewer(a.items, a.items.length - 1);
        }));
      }

      grid.addEventListener('click', (e) => {
        const c = e.target.closest('.ph-cell');
        if (c) openViewer(current, +c.dataset.i, c);
      });
      root.querySelector('[data-a="select"]').addEventListener('click', () => OS.Island.flash({ left: OS.sym('checkmark-circle', { size: 18 }), right: '<span>Tieni premuto per azioni</span>', width: 260 }));

      /* viewer: the photo grows out of its thumbnail (a shared-element zoom), can be
         paged sideways and flicked down to fly back into the grid */
      function openViewer(list, index, fromEl) {
        let i = index;
        const v = OS.el(`<div class="ph-viewer">
          <div class="ph-v-bg"></div>
          <div class="ph-v-top"><button class="gbtn glass" data-a="close" aria-label="Chiudi">${OS.sym('chevron-left', { stroke: 2.4 })}</button><div class="ph-v-date"></div><button class="gbtn glass" data-a="more" aria-label="Altro">${OS.sym('ellipsis')}</button></div>
          <div class="ph-v-stage"><img alt=""></div>
          <div class="ph-v-bottom"><button class="gbtn glass" data-a="share" aria-label="Condividi">${OS.sym('share')}</button>
            <div class="gbtn-group glass"><button class="gbtn" data-a="fav" aria-label="Preferito"></button><button class="gbtn" data-a="info" aria-label="Info">${OS.sym('info')}</button></div>
            <button class="gbtn glass" data-a="del" aria-label="Elimina">${OS.sym('trash')}</button></div>
        </div>`);
        const img = v.querySelector('img');
        const stage = v.querySelector('.ph-v-stage');
        const bg = v.querySelector('.ph-v-bg');
        const chrome = [v.querySelector('.ph-v-top'), v.querySelector('.ph-v-bottom')];
        // vis: x/y offset of the photo centre, s scale, cx/cy crop (fraction cut from each side), b backdrop
        let vis = { x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 };
        let anim = null;
        let closing = false;

        function fitted() {
          const sw = stage.clientWidth || OS.state.width, sh = stage.clientHeight || OS.state.height;
          const nw = img.naturalWidth || W, nh = img.naturalHeight || H;
          const k = Math.min(sw / nw, sh / nh);
          return { w: nw * k, h: nh * k, sw, sh };
        }
        function size() {
          const f = fitted();
          img.style.width = f.w + 'px';
          img.style.height = f.h + 'px';
        }
        function paint() {
          const cx = Math.max(0, vis.cx) * 100, cy = Math.max(0, vis.cy) * 100;
          img.style.transform = `translate3d(${vis.x}px, ${vis.y}px, 0) scale(${vis.s})`;
          img.style.clipPath = cx || cy ? `inset(${cy}% ${cx}% ${cy}% ${cx}% round ${4 / Math.max(.05, vis.s)}px)` : '';
          bg.style.opacity = String(OS.clamp(vis.b, 0, 1));
          chrome.forEach((el) => { el.style.opacity = vis.b >= 1 ? '' : String(OS.motion.segment(vis.b, .6, 1)); });
        }
        /** where the photo sits when it is folded back into a grid cell */
        function cellVis(cell) {
          if (!cell || !cell.isConnected) return null;
          const r = OS.rectOf(cell), sr = OS.rectOf(stage);
          if (r.y + r.height < sr.y || r.y > sr.y + sr.height) return null;
          const f = fitted();
          const s0 = Math.max(r.width / f.w, r.height / f.h);
          return {
            x: r.x + r.width / 2 - (sr.x + sr.width / 2), y: r.y + r.height / 2 - (sr.y + sr.height / 2), s: s0,
            cx: (1 - r.width / (f.w * s0)) / 2, cy: (1 - r.height / (f.h * s0)) / 2, b: 0,
          };
        }
        function springTo(to, velocity, preset, done) {
          if (anim) anim.stop();
          anim = OS.motion.animate({
            from: Object.assign({}, vis), to, velocity: velocity || {}, preset,
            onUpdate(nv) { vis = Object.assign({}, nv); paint(); },
            onComplete() { anim = null; if (done) done(); },
          });
        }
        const cellFor = () => (list === current ? grid.querySelector(`.ph-cell[data-i="${i}"]`) : null);

        function show() {
          const p = list[i];
          img.src = Service.src(p);
          size();
          const d = new Date(p.date);
          v.querySelector('.ph-v-date').innerHTML = `<b>${d.getDate()} ${OS.fmt.MONTHS[d.getMonth()]} ${d.getFullYear()}</b><span>${OS.fmt.time(d)}</span>`;
          v.querySelector('[data-a="fav"]').innerHTML = OS.sym(Service.favs.has(p.id) ? 'heart-fill' : 'heart');
        }
        img.addEventListener('load', size);
        show();
        root.querySelector('.ph-app').appendChild(v);
        const start = cellVis(fromEl);
        if (start) { vis = start; paint(); springTo({ x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 }, null, { response: .46, damping: .86 }); }
        else { vis = { x: 0, y: 40, s: .94, cx: 0, cy: 0, b: 0 }; paint(); springTo({ x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 }, null, 'smooth'); }

        function close(velocity) {
          if (closing) return;
          closing = true;
          v.style.pointerEvents = 'none';
          const back = cellVis(cellFor());
          const gone = () => {
            v.remove();
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
          };
          if (back) springTo(back, velocity, { response: .42, damping: .88 }, gone);
          else springTo({ x: vis.x, y: OS.state.height * .6, s: vis.s * .8, cx: 0, cy: 0, b: 0 }, velocity, { response: .36, damping: 1 }, gone);
        }

        v.addEventListener('click', (e) => {
          const a = e.target.closest('[data-a]');
          if (!a) { if (e.target === stage || e.target === img) v.classList.toggle('bare'); return; }
          const p = list[i];
          switch (a.dataset.a) {
            case 'close': close(); break;
            case 'fav': Service.toggleFav(p); show(); OS.haptic(10); break;
            case 'del':
              OS.UI.alert({ title: 'Elimina foto', message: 'Questa foto verrà eliminata dalla libreria.', buttons: [{ label: 'Annulla' }, { label: 'Elimina', style: 'destructive', onTap: () => { Service.remove(p); list = list.filter((x) => x !== p); if (!list.length) close(); else { i = Math.min(i, list.length - 1); show(); } } }] });
              break;
            case 'share': if (navigator.share) navigator.share({ title: 'Foto', text: 'Foto da iOS 27 Web' }).catch(() => {}); break;
            case 'info': OS.Island.flash({ left: OS.sym('info', { size: 18 }), right: `<span>${p.kind === 'camera' ? 'Fotocamera' : KIND_NAMES[p.kind]} · ${W}×${H}</span>`, width: 260 }); break;
            case 'more': OS.UI.menu(a, [{ label: 'Imposta come sfondo', icon: 'photo', onTap: () => { const id = 'custom'; OS.Island.flash({ left: OS.sym('photo', { size: 18 }), right: '<span>Usa Impostazioni › Sfondo</span>', width: 260 }); return id; } }, { label: 'Copia', icon: 'square-on-square' }], { preview: false }); break;
            default:
          }
        });

        // drag: sideways pages through the library, down shrinks the photo and lets the grid show through
        let s = null;
        let draggedAt = 0;
        stage.addEventListener('pointerdown', (e) => {
          if (closing || e.button > 0) return;
          if (anim) anim.stop();
          const p = OS.point(e);
          s = { x: p.x, y: p.y, axis: null, base: Object.assign({}, vis), tr: OS.motion.tracker(), id: e.pointerId };
          s.tr.add(p.x, p.y);
        });
        stage.addEventListener('click', (e) => { if (performance.now() - draggedAt < 90) e.stopPropagation(); }, true);
        const move = (e) => {
          if (!s || e.pointerId !== s.id) return;
          const p = OS.point(e);
          s.tr.add(p.x, p.y);
          const dx = p.x - s.x, dy = p.y - s.y;
          if (!s.axis) {
            if (Math.hypot(dx, dy) < 8) return;
            s.axis = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'down' : 'x';
          }
          const Hh = OS.state.height;
          if (s.axis === 'down') {
            const k = OS.clamp(dy / Hh, 0, 1);
            vis = { x: s.base.x + dx, y: s.base.y + Math.max(0, dy), s: 1 - .45 * k, cx: 0, cy: 0, b: 1 - k * 2.2 };
          } else {
            const edge = (dx > 0 && i === 0) || (dx < 0 && i === list.length - 1);
            vis = Object.assign({}, s.base, { x: s.base.x + (edge ? OS.motion.rubber(dx, OS.state.width * .5) : dx) });
          }
          paint();
        };
        const end = (e) => {
          if (!s || e.pointerId !== s.id) return;
          const g = s;
          s = null;
          if (!g.axis) return;
          draggedAt = performance.now();
          const vel = g.tr.velocity();
          if (g.axis === 'down') {
            if (vel.y > 300 || (vel.y > -200 && vis.y + OS.motion.project(vel.y, .99) > 160)) { close({ x: vel.x, y: vel.y }); return; }
            springTo({ x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 }, { x: vel.x, y: vel.y }, { response: .38, damping: .82 });
            return;
          }
          const Wd = OS.state.width;
          const projected = vis.x + OS.motion.project(vel.x, .99);
          const dir = projected < -Wd * .35 && i < list.length - 1 ? 1 : projected > Wd * .35 && i > 0 ? -1 : 0;
          if (!dir) { springTo({ x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 }, { x: vel.x }, 'snappy'); return; }
          // the photo slides out with the finger's speed, the next one follows it in
          springTo(Object.assign({}, vis, { x: -dir * (Wd + 24) }), { x: vel.x }, { response: .3, damping: 1 }, () => {
            i += dir;
            show();
            vis = Object.assign({}, vis, { x: dir * (Wd * .55) });
            paint();
            springTo({ x: 0, y: 0, s: 1, cx: 0, cy: 0, b: 1 }, { x: vel.x * .5 }, { response: .34, damping: 1 });
          });
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
      }

      const off = OS.on('photos', () => paintGrid(false));
      paintGrid(true);
      return {
        onShow(data) { if (data && data.last) { const it = Service.build(); openViewer(it, it.length - 1); } },
        onDestroy() { off(); },
      };
    },
  });
})();
