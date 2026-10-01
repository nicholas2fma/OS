/* ==========================================================================
   Fotocamera — real camera via getUserMedia, simulated viewfinder fallback
   ========================================================================== */
(function () {
  'use strict';

  const MODES = ['TIME-LAPSE', 'SLO-MO', 'VIDEO', 'FOTO', 'RITRATTO', 'PANO'];

  OS.registerApp({
    id: 'camera',
    name: 'Fotocamera',
    dark: true,
    background: '#000',
    statusBar: 'light',
    keywords: 'fotocamera foto scatto camera',
    quickActions: [{ label: 'Scatta un selfie', icon: 'person-circle', data: { front: true } }],
    mount(root) {
      root.innerHTML = `<div class="cam-app">
        <div class="cam-top">
          <button class="cam-ic" data-a="flash" aria-label="Flash">${OS.sym('bolt-fill', { size: 20 })}</button>
          <div class="cam-pill glass">${OS.sym('chevron-up', { size: 16, stroke: 2.6 })}</div>
          <button class="cam-ic" data-a="live" aria-label="Live">${OS.sym('scope', { size: 20 })}</button>
        </div>
        <div class="cam-view">
          <video playsinline muted autoplay></video>
          <canvas class="cam-sim"></canvas>
          <div class="cam-grid"></div>
          <div class="cam-flash"></div>
          <div class="cam-zoom glass"><button data-z=".5">,5</button><button data-z="1" class="on">1×</button><button data-z="2">2</button></div>
          <div class="cam-msg"></div>
        </div>
        <div class="cam-bottom">
          <div class="cam-modes"><div class="cam-modes-track">${MODES.map((m) => `<button class="${m === 'FOTO' ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div></div>
          <div class="cam-ctrl">
            <button class="cam-thumb" data-a="last" aria-label="Ultima foto"></button>
            <button class="cam-shutter" data-a="shoot" aria-label="Scatta"><i></i></button>
            <button class="cam-flip glass" data-a="flip" aria-label="Cambia fotocamera">${OS.sym('arrow-clockwise', { size: 22, stroke: 2.2 })}</button>
          </div>
        </div>
      </div>`;

      const video = root.querySelector('video');
      const sim = root.querySelector('.cam-sim');
      const flashEl = root.querySelector('.cam-flash');
      const thumb = root.querySelector('.cam-thumb');
      const msg = root.querySelector('.cam-msg');
      const view = root.querySelector('.cam-view');
      let stream = null;
      let facing = 'environment';
      let zoom = 1;
      let simRaf = null;
      let simImg = null;
      let flash = false;
      let mode = 'FOTO';

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
            video.style.transform = `scale(${zoom})${facing === 'user' ? ' scaleX(-1)' : ''}`;
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
        sim.width = 480; sim.height = 640;
        if (!simImg) {
          simImg = new Image();
          simImg.src = OS.paintPhoto(['mountains', 'beach', 'forest', 'sunset'][Math.floor(Math.random() * 4)], Math.floor(Math.random() * 1000));
        }
        const ctx = sim.getContext('2d');
        const t0 = performance.now();
        const loop = (t) => {
          const k = (t - t0) / 1000;
          ctx.save();
          const s = 1.25 * zoom;
          ctx.translate(240 + Math.sin(k * .6) * 18, 320 + Math.cos(k * .45) * 12);
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

      function shoot() {
        if (mode !== 'FOTO' && mode !== 'RITRATTO') {
          OS.Island.flash({ left: OS.sym('video-fill', { size: 18 }), right: '<span>Solo modalità Foto</span>', width: 240 });
          return;
        }
        const c = document.createElement('canvas');
        c.width = 480; c.height = 640;
        const ctx = c.getContext('2d');
        if (stream && video.videoWidth) {
          const vw = video.videoWidth, vh = video.videoHeight;
          const s = Math.max(480 / vw, 640 / vh) * zoom;
          ctx.save();
          if (facing === 'user') { ctx.translate(480, 0); ctx.scale(-1, 1); }
          ctx.drawImage(video, (480 - vw * s) / 2, (640 - vh * s) / 2, vw * s, vh * s);
          ctx.restore();
        } else {
          ctx.drawImage(sim, 0, 0);
        }
        if (mode === 'RITRATTO') { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'hsl(0 0% 50%)'; ctx.fillRect(0, 0, 480, 640); }
        if (flash) { flashEl.style.background = '#fff'; }
        flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
        OS.sound('shutter');
        OS.haptic(15);
        const src = c.toDataURL('image/jpeg', .85);
        OS.PhotosService.add(src);
        thumb.style.backgroundImage = `url('${src}')`;
        thumb.classList.remove('pop'); void thumb.offsetWidth; thumb.classList.add('pop');
      }

      root.querySelector('.cam-app').addEventListener('click', (e) => {
        const z = e.target.closest('[data-z]');
        if (z) {
          zoom = +z.dataset.z;
          root.querySelectorAll('[data-z]').forEach((b) => { b.classList.toggle('on', b === z); b.textContent = b === z ? (b.dataset.z === '.5' ? '0,5×' : b.dataset.z + '×') : (b.dataset.z === '.5' ? ',5' : b.dataset.z); });
          video.style.transform = `scale(${Math.max(1, zoom)})${facing === 'user' ? ' scaleX(-1)' : ''}`;
          return;
        }
        const m = e.target.closest('[data-m]');
        if (m) {
          mode = m.dataset.m;
          root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b === m));
          const track = root.querySelector('.cam-modes-track');
          track.style.transform = `translateX(${-(m.offsetLeft + m.offsetWidth / 2) + track.parentElement.offsetWidth / 2}px)`;
          root.querySelector('.cam-shutter').classList.toggle('video', mode === 'VIDEO' || mode === 'SLO-MO' || mode === 'TIME-LAPSE');
          return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        switch (a.dataset.a) {
          case 'shoot': shoot(); break;
          case 'flip': facing = facing === 'user' ? 'environment' : 'user'; a.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 350 }); start(); break;
          case 'last': if (OS.PhotosService.last()) OS.Apps.open('photos', { data: { last: true } }); break;
          case 'flash': flash = !flash; a.classList.toggle('on', flash); break;
          case 'live': a.classList.toggle('on'); break;
          default:
        }
      });

      const centerMode = () => {
        const m = root.querySelector('[data-m].on');
        const track = root.querySelector('.cam-modes-track');
        if (m && track.parentElement.offsetWidth) track.style.transform = `translateX(${-(m.offsetLeft + m.offsetWidth / 2) + track.parentElement.offsetWidth / 2}px)`;
      };

      let visible = false;
      return {
        onShow(data) {
          visible = true;
          if (data && data.front) facing = 'user';
          paintThumb();
          requestAnimationFrame(centerMode);
          start();
        },
        onHide() { visible = false; stop(); },
        onDestroy() { visible = false; stop(); },
      };
    },
  });
})();
