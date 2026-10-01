/* ==========================================================================
   Status bar + "chrome" (status bar / home indicator colour) coordination
   ========================================================================== */
(function () {
  'use strict';

  let sb, homebar, timeEl, batEl, lvlEl;

  function render() {
    sb = document.getElementById('statusbar');
    homebar = document.getElementById('homebar');
    sb.innerHTML = `
      <div class="sb-left tnum"></div>
      <div class="sb-right">
        <svg class="sb-airplane" width="17" height="17" viewBox="0 0 24 24"><path d="M21.2 15.6v-1.9l-7.7-4.8V3.9a1.5 1.5 0 0 0-3 0v5L2.8 13.7v1.9l7.7-2.4v5.2l-2.2 1.6v1.5L12 20.4l3.7 1.1V20l-2.2-1.6v-5.2z"/></svg>
        <svg class="sb-signal" width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx=".9"/><rect x="5" y="5.5" width="3.2" height="6.5" rx=".9"/><rect x="10" y="3" width="3.2" height="9" rx=".9"/><rect x="15" y="0" width="3.2" height="12" rx=".9"/></svg>
        <svg class="sb-wifi" width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5.2.2.5.2.7 0l1.2-1.2c.2-.2.2-.5 0-.7A11.3 11.3 0 0 0 .3 2.9c-.2.2-.2.5 0 .7l1.2 1.2c.2.2.5.2.7 0a9 9 0 0 1 6.3-2.5zm0 3.8c1.3 0 2.6.5 3.6 1.4.2.2.5.2.7 0L14 6.3c.2-.2.2-.5 0-.7a8 8 0 0 0-11 0c-.2.2-.2.5 0 .7l1.2 1.2c.2.2.5.2.7 0 1-.9 2.3-1.4 3.6-1.4zm2.3 3.1c.2-.2.2-.5 0-.7a3.5 3.5 0 0 0-4.6 0c-.2.2-.2.5 0 .7l2 2c.2.2.5.2.7 0z"/></svg>
        <div class="sb-battery"><div class="lvl"></div></div>
      </div>`;
    timeEl = sb.querySelector('.sb-left');
    batEl = sb.querySelector('.sb-battery');
    lvlEl = sb.querySelector('.lvl');
  }

  function tick() {
    timeEl.textContent = OS.fmt.time();
  }

  function battery() {
    const b = OS.state.battery;
    lvlEl.style.width = Math.round(b * 100) + '%';
    batEl.classList.toggle('low', b < .2 && !OS.state.charging);
    batEl.classList.toggle('charging', OS.state.charging);
  }

  function connectivity() {
    sb.classList.toggle('airplane', OS.settings.airplane);
    sb.classList.toggle('no-wifi', !OS.settings.wifi);
  }

  /** Decides whether status bar / home indicator use light or dark content */
  function refresh() {
    const s = OS.state;
    const Apps = OS.Apps;
    let dark = false;
    let homebarOff = false;
    const overlay = s.ccOpen || s.ncOpen || s.spotlightOpen || s.locked || (Apps && Apps.mode === 'switcher');
    if (overlay) {
      dark = false;
    } else if (Apps && Apps.mode === 'app' && Apps.current) {
      dark = Apps.chromeStyle() === 'dark';
    } else {
      dark = !!OS.Wallpapers.get(OS.settings.wallpaper).light;
      homebarOff = true;
    }
    if (s.locked && !s.ncOpen && !s.ccOpen) homebarOff = false;
    if (Apps && Apps.mode === 'switcher') homebarOff = true;
    sb.classList.toggle('dark-content', dark);
    homebar.classList.toggle('dark-content', dark);
    homebar.classList.toggle('off', homebarOff || s.ccOpen || s.spotlightOpen);
    sb.classList.toggle('no-time', s.locked && !s.ccOpen);
  }

  function init() {
    render();
    tick();
    battery();
    connectivity();
    setInterval(tick, 1000);
    OS.on('settings', (k) => {
      if (k === 'airplane' || k === 'wifi') connectivity();
      if (k === 'use24h') tick();
      if (k === 'appearance' || k === 'wallpaper') refresh();
    });
    OS.on('battery', battery);
    OS.on('chrome', refresh);

    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        const upd = () => {
          OS.state.battery = b.level;
          OS.state.charging = b.charging;
          OS.emit('battery');
        };
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      }).catch(() => {});
    }
  }

  OS.StatusBar = { init, refresh };
  OS.chrome = () => OS.emit('chrome');
})();
