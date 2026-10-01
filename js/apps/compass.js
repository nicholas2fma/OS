/* ==========================================================================
   Bussola — device orientation when available, drag-to-rotate otherwise
   ========================================================================== */
(function () {
  'use strict';

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

  function dial() {
    let ticks = '';
    for (let i = 0; i < 180; i++) {
      const a = i * 2;
      const major = a % 30 === 0;
      const len = major ? 16 : 9;
      ticks += `<line x1="150" y1="${12}" x2="150" y2="${12 + len}" stroke="${major ? '#fff' : 'rgba(255,255,255,.55)'}" stroke-width="${major ? 2.4 : 1.2}" transform="rotate(${a} 150 150)"/>`;
    }
    const nums = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => `<text x="150" y="50" text-anchor="middle" font-size="12" fill="#fff" transform="rotate(${a} 150 150)" font-family="-apple-system,Inter,sans-serif">${a}</text>`).join('');
    const card = [['N', 0, '#ff453a'], ['E', 90, '#fff'], ['S', 180, '#fff'], ['O', 270, '#fff']].map(([l, a, c]) =>
      `<text x="${150 + Math.sin(a * Math.PI / 180) * 78}" y="${150 - Math.cos(a * Math.PI / 180) * 78 + 9}" text-anchor="middle" font-size="26" font-weight="500" fill="${c}" font-family="-apple-system,Inter,sans-serif">${l}</text>`).join('');
    return `<svg viewBox="0 0 300 300">${ticks}${nums}${card}<path d="M150 4l6 10h-12z" fill="#ff453a"/></svg>`;
  }

  OS.registerApp({
    id: 'compass',
    name: 'Bussola',
    dark: true,
    background: '#000',
    statusBar: 'light',
    keywords: 'bussola direzione nord orientamento',
    mount(root) {
      root.innerHTML = `<div class="cp-app">
        <div class="cp-heading"><span class="cp-deg tnum">0°</span><span class="cp-dir">N</span></div>
        <div class="cp-dial-wrap"><div class="cp-pointer"></div><div class="cp-dial">${dial()}</div><div class="cp-cross"><i></i><i></i></div><div class="cp-bubble"></div></div>
        <div class="cp-info"><div>41°53′ N  12°29′ E</div><div>Roma</div><div>Altitudine: 21 m</div></div>
        <button class="btn cp-perm">Usa i sensori del dispositivo</button>
        <div class="cp-hint">Trascina la ghiera per ruotarla</div>
      </div>`;
      const dialEl = root.querySelector('.cp-dial');
      const degEl = root.querySelector('.cp-deg');
      const dirEl = root.querySelector('.cp-dir');
      const bubble = root.querySelector('.cp-bubble');
      const permBtn = root.querySelector('.cp-perm');
      let heading = 0;
      let target = 0;
      let sensor = false;
      let raf = null;
      let last = -1;

      function paint() {
        // ease toward target along the shortest arc
        let diff = ((target - heading + 540) % 360) - 180;
        heading = (heading + diff * .15 + 360) % 360;
        dialEl.style.transform = `rotate(${-heading}deg)`;
        const h = Math.round(heading) % 360;
        if (h !== last) {
          if (last >= 0 && h % 30 === 0) OS.haptic(4);
          last = h;
          degEl.textContent = h + '°';
          dirEl.textContent = DIRS[Math.round(h / 45) % 8];
        }
        raf = requestAnimationFrame(paint);
      }

      const onOrient = (e) => {
        let h = null;
        if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
        else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;
        if (h == null) return;
        sensor = true;
        target = h;
        if (typeof e.beta === 'number') bubble.style.transform = `translate(${OS.clamp(e.gamma || 0, -30, 30)}px, ${OS.clamp(e.beta - 0, -30, 30)}px)`;
        root.querySelector('.cp-hint').style.display = 'none';
      };

      function listen() {
        window.addEventListener('deviceorientationabsolute', onOrient);
        window.addEventListener('deviceorientation', onOrient);
      }

      permBtn.addEventListener('click', () => {
        const D = window.DeviceOrientationEvent;
        if (D && typeof D.requestPermission === 'function') {
          D.requestPermission().then((r) => { if (r === 'granted') { listen(); permBtn.style.display = 'none'; } }).catch(() => {});
        } else { listen(); permBtn.style.display = 'none'; }
      });

      // drag to rotate (desktop / no sensor)
      let drag = null;
      const wrap = root.querySelector('.cp-dial-wrap');
      wrap.addEventListener('pointerdown', (e) => {
        if (sensor) return;
        const r = OS.rectOf(wrap);
        const p = OS.point(e);
        drag = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, a0: Math.atan2(p.y - (r.y + r.height / 2), p.x - (r.x + r.width / 2)), t0: target };
      });
      const mv = (e) => {
        if (!drag) return;
        const p = OS.point(e);
        const a = Math.atan2(p.y - drag.cy, p.x - drag.cx);
        target = (drag.t0 - (a - drag.a0) * 180 / Math.PI + 720) % 360;
      };
      const up = () => { drag = null; };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);

      if (!(window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function')) listen();

      return {
        onShow() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); },
        onHide() { cancelAnimationFrame(raf); },
        onDestroy() {
          cancelAnimationFrame(raf);
          window.removeEventListener('deviceorientationabsolute', onOrient);
          window.removeEventListener('deviceorientation', onOrient);
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
        },
      };
    },
  });
})();
