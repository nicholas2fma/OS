/* ==========================================================================
   Fotocamera — real camera via getUserMedia, simulated viewfinder fallback.
   iOS 27: customizable controls panel (six dots) and the new Siri mode,
   which here analyses the frame on-device (colours, light, sky, greenery).
   ========================================================================== */
(function () {
  'use strict';

  const MODES = ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'FOTO', 'RITRATTO', 'PANO', 'SIRI'];

  /* controls: each cycles through its values; pinned ones live in the top bar */
  const CONTROLS = {
    flash: { label: 'Flash', icon: 'bolt-fill', values: ['Auto', 'Sì', 'No'] },
    live: { label: 'Live', icon: 'scope', values: ['Sì', 'No'] },
    timer: { label: 'Timer', icon: 'timer', values: ['No', '3 s', '10 s'] },
    exposure: { label: 'Esposizione', icon: 'sun', values: ['−1', '−0,5', '0', '+0,5', '+1'] },
    style: { label: 'Stile', icon: 'sparkles', values: ['Standard', 'Caldo', 'Freddo', 'Vivido', 'Bianco e nero'] },
    grid: { label: 'Griglia', icon: 'square-grid', values: ['No', 'Sì'] },
    ratio: { label: 'Formato', icon: 'photo', values: ['4:3', '1:1', '16:9'] },
  };
  const DEFAULT_STATE = { flash: 0, live: 0, timer: 0, exposure: 2, style: 0, grid: 0, ratio: 0, pinned: ['flash', 'live', 'timer'] };

  const STYLE_FILTER = ['', 'sepia(.22) saturate(1.25) brightness(1.03)', 'hue-rotate(-14deg) saturate(1.08) brightness(1.02)', 'saturate(1.55) contrast(1.06)', 'grayscale(1) contrast(1.12)'];
  const EV = [-1, -.5, 0, .5, 1];
  const RATIOS = { '4:3': [480, 640], '1:1': [480, 480], '16:9': [480, 853] };

  /* ---------- on-device "visual intelligence" ---------- */

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > .5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function colorName(h, s, l) {
    if (l < .14) return 'nero';
    if (s < .14) return l > .8 ? 'bianco' : 'grigio';
    if (h < 15 || h >= 340) return 'rosso';
    if (h < 40) return 'arancione';
    if (h < 65) return 'giallo';
    if (h < 160) return 'verde';
    if (h < 200) return 'azzurro';
    if (h < 250) return 'blu';
    if (h < 290) return 'viola';
    return 'rosa';
  }

  function analyse(canvas) {
    const w = 48, h = Math.round(48 * canvas.height / canvas.width);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let lum = 0, sat = 0, dark = 0, warm = 0, green = 0, skyTop = 0, topN = 0, brightSpots = 0;
    const names = {};
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [hh, ss, ll] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        lum += ll; sat += ss;
        if (ll < .16) dark++;
        if (ll > .8) brightSpots++;
        if (ss > .35 && (hh < 45 || hh > 330) && ll > .3) warm++;
        if (ss > .2 && hh >= 70 && hh < 165 && ll > .12) green++;
        if (y < h / 3) { topN++; if (hh >= 185 && hh < 235 && ss > .22 && ll > .4) skyTop++; }
        const n = colorName(hh, ss, ll);
        names[n] = (names[n] || 0) + 1;
      }
    }
    const N = w * h;
    lum /= N; sat /= N;
    const f = { dark: dark / N, warm: warm / N, green: green / N, sky: skyTop / Math.max(1, topN), bright: brightSpots / N };
    const top = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    let title, query;
    if (f.dark > .5 && f.bright > .02) { title = 'Una scena notturna con luci'; query = 'città di notte'; }
    else if (f.dark > .5) { title = 'Una scena notturna'; query = 'cielo notturno'; }
    else if (f.warm > .25) { title = 'Luce calda, forse un tramonto'; query = 'tramonto'; }
    else if (f.sky > .35 && f.green > .12) { title = 'Un paesaggio con cielo e vegetazione'; query = 'paesaggio naturale'; }
    else if (f.sky > .35) { title = 'Un paesaggio all\'aperto con il cielo'; query = 'paesaggio cielo'; }
    else if (f.green > .3) { title = 'Piante o vegetazione'; query = 'piante'; }
    else if (sat < .12) { title = 'Toni neutri, forse un interno o un documento'; query = 'interni'; }
    else { title = `Colori prevalenti: ${top.slice(0, 2).join(' e ')}`; query = top[0]; }
    return { title, query, colors: top, light: Math.round(lum * 100), sat: Math.round(sat * 100) };
  }

  const SWATCH = { nero: '#111', bianco: '#f5f5f5', grigio: '#8e8e93', rosso: '#ff3b30', arancione: '#ff9500', giallo: '#ffcc00', verde: '#34c759', azzurro: '#5ac8fa', blu: '#0a84ff', viola: '#af52de', rosa: '#ff2d55' };

  OS.registerApp({
    id: 'camera',
    name: 'Fotocamera',
    dark: true,
    background: '#000',
    statusBar: 'light',
    keywords: 'fotocamera foto scatto camera siri',
    quickActions: [
      { label: 'Scatta un selfie', icon: 'person-circle', data: { front: true } },
      { label: 'Modalità Siri', icon: 'sparkles', data: { mode: 'SIRI' } },
    ],
    mount(root) {
      const st = Object.assign({}, DEFAULT_STATE, OS.store.get('camera:controls', {}));
      const save = () => OS.store.set('camera:controls', st);
      const val = (k) => CONTROLS[k].values[st[k]];

      root.innerHTML = `<div class="cam-app">
        <div class="cam-top"></div>
        <div class="cam-view">
          <video playsinline muted autoplay></video>
          <canvas class="cam-sim"></canvas>
          <div class="cam-grid"></div>
          <div class="cam-count"></div>
          <div class="cam-flash"></div>
          <div class="cam-zoom glass"><button data-z=".5">,5</button><button data-z="1" class="on">1×</button><button data-z="2">2</button></div>
          <div class="cam-msg"></div>
          <div class="cam-siri-hint"><span class="siri-orb"></span>Inquadra qualcosa e tocca per chiedere a Siri</div>
          <div class="cam-siri-card"></div>
        </div>
        <div class="cam-panel glass surface-dark"></div>
        <div class="cam-bottom">
          <div class="cam-modes"><div class="cam-modes-track">${MODES.map((m) => `<button class="${m === 'FOTO' ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div>
            <button class="cam-dots" data-a="panel" aria-label="Controlli"><i></i><i></i><i></i><i></i><i></i><i></i></button></div>
          <div class="cam-ctrl">
            <button class="cam-thumb" data-a="last" aria-label="Ultima foto"></button>
            <button class="cam-shutter" data-a="shoot" aria-label="Scatta"><i></i></button>
            <button class="cam-flip glass" data-a="flip" aria-label="Cambia fotocamera">${OS.sym('arrow-clockwise', { size: 22, stroke: 2.2 })}</button>
          </div>
        </div>
      </div>`;

      const app = root.querySelector('.cam-app');
      const video = root.querySelector('video');
      const sim = root.querySelector('.cam-sim');
      const flashEl = root.querySelector('.cam-flash');
      const thumb = root.querySelector('.cam-thumb');
      const msg = root.querySelector('.cam-msg');
      const view = root.querySelector('.cam-view');
      const topBar = root.querySelector('.cam-top');
      const panel = root.querySelector('.cam-panel');
      const countEl = root.querySelector('.cam-count');
      const siriCard = root.querySelector('.cam-siri-card');
      let stream = null;
      let facing = 'environment';
      let zoom = 1;
      let simRaf = null;
      let simImg = null;
      let mode = 'FOTO';
      let editing = false;
      let counting = false;

      /* ----- controls ----- */

      function applyControls() {
        const ev = EV[st.exposure];
        const filter = [`brightness(${(1 + ev * .28).toFixed(2)})`, STYLE_FILTER[st.style]].filter(Boolean).join(' ');
        video.style.filter = filter;
        sim.style.filter = filter;
        view.classList.toggle('show-grid', val('grid') === 'Sì');
        const [w, h] = RATIOS[val('ratio')];
        view.style.aspectRatio = `${w} / ${h}`;
        paintTop();
        if (panel.classList.contains('open')) paintPanel();
      }

      function paintTop() {
        topBar.innerHTML = st.pinned.map((k) => {
          const c = CONTROLS[k];
          const v = val(k);
          const on = !(v === 'No' || v === '0' || v === 'Standard' || v === '4:3');
          return `<button class="cam-ic ${on ? 'on' : ''}" data-c="${k}" aria-label="${c.label}">${OS.sym(c.icon, { size: 18 })}${k === 'timer' || k === 'exposure' || k === 'ratio' ? `<small>${OS.esc(v)}</small>` : ''}</button>`;
        }).join('') || '<span></span>';
      }

      function paintPanel() {
        panel.innerHTML = `<div class="cp-head"><b>${editing ? 'Scegli i controlli in alto' : 'Controlli'}</b><button data-a="edit">${editing ? 'Fine' : 'Modifica'}</button></div>
          <div class="cp-grid">${Object.keys(CONTROLS).map((k) => {
            const c = CONTROLS[k];
            const pinned = st.pinned.includes(k);
            return `<button class="cp-tile ${editing && pinned ? 'pinned' : ''}" data-c="${k}">
              ${editing ? `<span class="cp-pin">${OS.sym(pinned ? 'checkmark-circle-fill' : 'circle', { size: 18 })}</span>` : ''}
              ${OS.sym(c.icon, { size: 22 })}<span class="cp-label">${c.label}</span><span class="cp-val">${OS.esc(val(k))}</span></button>`;
          }).join('')}</div>`;
      }

      function cycle(k) {
        st[k] = (st[k] + 1) % CONTROLS[k].values.length;
        save();
        applyControls();
        OS.haptic(6);
      }

      function togglePanel(open) {
        const o = open == null ? !panel.classList.contains('open') : open;
        editing = false;
        if (o) paintPanel();
        panel.classList.toggle('open', o);
        root.querySelector('.cam-dots').classList.toggle('on', o);
      }

      /* ----- viewfinder ----- */

      function paintThumb() {
        const p = OS.PhotosService && OS.PhotosService.last();
        thumb.style.backgroundImage = p ? `url('${OS.PhotosService.thumb(p)}')` : '';
      }

      async function start() {
        stop();
        msg.textContent = '';
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1706 } }, audio: false });
            if (!root.isConnected || !visible) { stop(); return; }
            video.srcObject = stream;
            video.style.display = 'block';
            sim.style.display = 'none';
            video.style.transform = `scale(${Math.max(1, zoom)})${facing === 'user' ? ' scaleX(-1)' : ''}`;
            await video.play().catch(() => {});
            return;
          } catch (e) {
            msg.textContent = 'Fotocamera non disponibile: anteprima simulata';
          }
        } else {
          msg.textContent = 'Anteprima simulata';
        }
        startSim();
      }

      function startSim() {
        video.style.display = 'none';
        sim.style.display = 'block';
        sim.width = 480; sim.height = 853;
        if (!simImg) {
          simImg = new Image();
          simImg.src = OS.paintPhoto(['mountains', 'beach', 'forest', 'sunset'][Math.floor(Math.random() * 4)], Math.floor(Math.random() * 1000));
        }
        const ctx = sim.getContext('2d');
        const t0 = performance.now();
        const loop = (t) => {
          const k = (t - t0) / 1000;
          ctx.save();
          const s = 1.45 * zoom;
          ctx.translate(240 + Math.sin(k * .6) * 18, 426 + Math.cos(k * .45) * 12);
          ctx.rotate(Math.sin(k * .3) * .01);
          ctx.scale(s, s);
          if (simImg.complete) ctx.drawImage(simImg, -240, -320, 480, 640);
          ctx.restore();
          simRaf = requestAnimationFrame(loop);
        };
        cancelAnimationFrame(simRaf);
        simRaf = requestAnimationFrame(loop);
      }

      function stop() {
        cancelAnimationFrame(simRaf);
        if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
        video.srcObject = null;
      }

      /** draws the current frame with format, exposure and style applied */
      function grab() {
        const [W, H] = RATIOS[val('ratio')];
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.filter = video.style.filter || 'none';
        const src = stream && video.videoWidth ? video : sim;
        const sw = src === video ? video.videoWidth : sim.width;
        const sh = src === video ? video.videoHeight : sim.height;
        const s = Math.max(W / sw, H / sh) * (src === video ? Math.max(1, zoom) : 1);
        ctx.save();
        if (src === video && facing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
        ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
        ctx.restore();
        return c;
      }

      function shoot() {
        if (mode === 'SIRI') { askSiri(); return; }
        if (mode !== 'FOTO' && mode !== 'RITRATTO') {
          OS.Island.flash({ left: OS.sym('video-fill', { size: 18 }), right: '<span>Solo modalità Foto</span>', width: 240 });
          return;
        }
        const delay = { No: 0, '3 s': 3, '10 s': 10 }[val('timer')];
        if (delay && !counting) {
          counting = true;
          let n = delay;
          countEl.textContent = n;
          countEl.classList.add('on');
          const iv = setInterval(() => {
            n--;
            if (n > 0) { countEl.textContent = n; OS.sound('click'); return; }
            clearInterval(iv);
            countEl.classList.remove('on');
            counting = false;
            capture();
          }, 1000);
          return;
        }
        if (!counting) capture();
      }

      function capture() {
        const c = grab();
        if (mode === 'RITRATTO') {
          const ctx = c.getContext('2d');
          ctx.filter = 'none';
          ctx.globalCompositeOperation = 'saturation';
          ctx.fillStyle = 'hsl(0 0% 50%)';
          ctx.fillRect(0, 0, c.width, c.height);
        }
        flashEl.style.background = val('flash') === 'Sì' ? '#fff' : '#000';
        flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
        OS.sound('shutter');
        OS.haptic(15);
        const src = c.toDataURL('image/jpeg', .85);
        OS.PhotosService.add(src);
        thumb.style.backgroundImage = `url('${src}')`;
        thumb.classList.remove('pop'); void thumb.offsetWidth; thumb.classList.add('pop');
      }

      /* ----- Siri mode ----- */

      function askSiri() {
        const c = grab();
        const r = analyse(c);
        const shot = c.toDataURL('image/jpeg', .8);
        OS.sound('click');
        siriCard.innerHTML = `<div class="csc-top"><span class="siri-orb"></span><b>Siri</b><button data-a="siri-close" aria-label="Chiudi">${OS.sym('xmark', { size: 14, stroke: 3 })}</button></div>
          <div class="csc-body"><div class="csc-img" style="background-image:url('${shot}')"></div>
            <div><div class="csc-title">${OS.esc(r.title)}</div>
            <div class="csc-colors">${r.colors.map((n) => `<span><i style="background:${SWATCH[n]}"></i>${n}</span>`).join('')}</div>
            <div class="csc-meta">Luce ${r.light}% · Saturazione ${r.sat}%</div></div></div>
          <div class="csc-actions"><button data-siri="web" data-q="${OS.esc(r.query)}">Cerca sul web</button><button data-siri="save">Salva in Foto</button></div>
          <div class="csc-note">Analisi dei colori eseguita sul dispositivo.</div>`;
        siriCard.dataset.shot = shot;
        siriCard.classList.add('on');
      }

      /* ----- events ----- */

      app.addEventListener('click', (e) => {
        const z = e.target.closest('[data-z]');
        if (z) {
          zoom = +z.dataset.z;
          root.querySelectorAll('[data-z]').forEach((b) => { b.classList.toggle('on', b === z); b.textContent = b === z ? (b.dataset.z === '.5' ? '0,5×' : b.dataset.z + '×') : (b.dataset.z === '.5' ? ',5' : b.dataset.z); });
          video.style.transform = `scale(${Math.max(1, zoom)})${facing === 'user' ? ' scaleX(-1)' : ''}`;
          return;
        }
        const ctl = e.target.closest('[data-c]');
        if (ctl) {
          const k = ctl.dataset.c;
          if (editing && ctl.closest('.cam-panel')) {
            st.pinned = st.pinned.includes(k) ? st.pinned.filter((x) => x !== k) : st.pinned.concat(k).slice(-4);
            save();
            paintPanel();
            paintTop();
          } else cycle(k);
          return;
        }
        const sb = e.target.closest('[data-siri]');
        if (sb) {
          if (sb.dataset.siri === 'web') OS.Apps.open('safari', { data: { search: sb.dataset.q } });
          if (sb.dataset.siri === 'save') { OS.PhotosService.add(siriCard.dataset.shot); paintThumb(); OS.Island.flash({ left: OS.sym('photo', { size: 18 }), right: '<span>Salvata in Foto</span>', width: 220 }); }
          return;
        }
        const m = e.target.closest('[data-m]');
        if (m) {
          mode = m.dataset.m;
          root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b === m));
          centerMode();
          const shutter = root.querySelector('.cam-shutter');
          shutter.classList.toggle('video', mode === 'VIDEO' || mode === 'SLO-MO' || mode === 'TIME-LAPSE');
          shutter.classList.toggle('siri', mode === 'SIRI');
          app.classList.toggle('siri-mode', mode === 'SIRI');
          siriCard.classList.remove('on');
          return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        switch (a.dataset.a) {
          case 'shoot': shoot(); break;
          case 'flip': facing = facing === 'user' ? 'environment' : 'user'; a.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 350 }); start(); break;
          case 'last': if (OS.PhotosService.last()) OS.Apps.open('photos', { data: { last: true } }); break;
          case 'panel': togglePanel(); break;
          case 'edit': editing = !editing; paintPanel(); break;
          case 'siri-close': siriCard.classList.remove('on'); break;
          default:
        }
      });

      const centerMode = () => {
        const m = root.querySelector('[data-m].on');
        const track = root.querySelector('.cam-modes-track');
        if (m && track.parentElement.offsetWidth) track.style.transform = `translateX(${-(m.offsetLeft + m.offsetWidth / 2) + track.parentElement.offsetWidth / 2}px)`;
      };

      applyControls();
      let visible = false;
      return {
        onShow(data) {
          visible = true;
          if (data && data.front) facing = 'user';
          if (data && data.mode) { const b = root.querySelector(`[data-m="${data.mode}"]`); if (b) b.click(); }
          if (data && data.controls) { togglePanel(true); editing = true; paintPanel(); }
          paintThumb();
          requestAnimationFrame(centerMode);
          start();
        },
        onHide() { visible = false; stop(); togglePanel(false); },
        onDestroy() { visible = false; stop(); },
      };
    },
  });
})();
