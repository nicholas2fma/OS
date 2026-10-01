/* ==========================================================================
   Boot
   ========================================================================== */
(function () {
  'use strict';

  function applyTheme() {
    const sc = OS.screenEl;
    const dark = OS.isDark();
    sc.classList.toggle('dark', dark);
    sc.classList.toggle('light', !dark);
    sc.style.setProperty('--gt', String(OS.clamp(+OS.settings.glassLevel || 0, 0, 1)));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#000000');
    OS.chrome();
    OS.emit('theme', dark);
  }

  function boot() {
    OS.screenEl = document.getElementById('screen');
    // every CSS transition below now runs on real spring curves
    OS.motion.installCSS(document.documentElement);
    OS.motion.installCSS(OS.screenEl);
    OS.Gestures.resize();

    OS.Glass.init();
    OS.Audio.init();
    applyTheme();
    OS.Wallpapers.apply();
    OS.StatusBar.init();
    OS.Island.init();
    OS.Siri.init();
    OS.Notifications.init();
    OS.Apps.init();
    OS.Widgets.init();
    OS.Home.init();
    OS.Spotlight.init();
    OS.Lock.init();
    OS.CC.init();
    OS.Gestures.init();
    OS.Scroll.init();

    OS.on('setting:reduceMotion', () => { OS.motion.installCSS(document.documentElement); OS.motion.installCSS(OS.screenEl); });
    OS.on('setting:appearance', applyTheme);
    OS.on('setting:glassLevel', applyTheme);
    OS.on('setting:wallpaper', () => { OS.Wallpapers.apply(); OS.chrome(); });
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (OS.settings.appearance === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }

    OS.bootTasks.forEach((fn) => {
      try { fn(); } catch (e) { console.error('[boot]', e); }
    });

    setInterval(OS.Icons.tickLive, 1000);
    OS.chrome();

    // first run: a friendly hello
    if (!OS.store.get('welcomed', false)) {
      OS.store.set('welcomed', true);
      setTimeout(() => OS.notify({
        app: 'messages',
        title: 'Benvenuto',
        body: 'Scorri verso l\'alto per sbloccare. Tieni premuto il tasto laterale per Siri.',
        data: { chat: 'benvenuto' },
        silent: true,
      }), 1200);
    }

    // expose for debugging
    window.iOS = OS;
  }

  boot();
})();
