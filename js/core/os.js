/* ==========================================================================
   OS core: global namespace, settings, persistence, event bus, helpers
   ========================================================================== */
(function () {
  'use strict';

  const NS = 'ios26:';
  const listeners = Object.create(null);

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem(NS + key); } catch (e) { /* storage unavailable */ }
    },
  };

  const DEFAULTS = {
    appearance: 'auto',      // 'light' | 'dark' | 'auto'
    wallpaper: 'liquido',
    glassLevel: .25,         // iOS 27 Liquid Glass slider: 0 = trasparente … 1 = colorato
    refraction: true,
    iconStyle: 'default',    // 'default' | 'dark' | 'clear' | 'tinted'
    tintHue: 215,
    wifi: true,
    bluetooth: true,
    airplane: false,
    cellular: true,
    focus: false,
    silent: false,
    rotationLock: true,
    brightness: 1,
    volume: 0.6,
    keyClicks: true,
    previews: true,
    use24h: true,
    deviceName: 'iPhone',
    userName: 'Il tuo nome',
    lowPower: false,
    siriAI: true,            // iOS 27: Siri in the Dynamic Island, "Cerca o chiedi", banners from the left
    reduceMotion: false,     // Accessibilità › Riduci movimento: no bounce, apps cross-fade
    hiddenApps: [],
  };

  /** settings saved by the iOS 26 version used a two-state glass preset */
  function migrate(saved) {
    if (saved && saved.glass && saved.glassLevel == null) saved.glassLevel = saved.glass === 'tinted' ? .85 : .2;
    if (saved) delete saved.glass;
    return saved || {};
  }

  const OS = {
    version: '27.0',
    settings: Object.assign({}, DEFAULTS, migrate(store.get('settings', {}))),
    defaults: DEFAULTS,
    state: {
      locked: true,
      screenOn: true,
      scale: 1,
      width: 402,
      height: 874,
      fullscreen: false,
      battery: 0.87,
      charging: false,
    },
    store,
    apps: Object.create(null),
    appOrder: [],

    on(evt, fn) {
      (listeners[evt] || (listeners[evt] = [])).push(fn);
      return () => OS.off(evt, fn);
    },
    off(evt, fn) {
      const list = listeners[evt];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, a, b) {
      const list = listeners[evt];
      if (!list) return;
      list.slice().forEach((fn) => {
        try { fn(a, b); } catch (e) { console.error('[OS] listener for', evt, e); }
      });
    },

    set(key, value) {
      if (OS.settings[key] === value) return;
      OS.settings[key] = value;
      store.set('settings', OS.settings);
      OS.emit('setting:' + key, value);
      OS.emit('settings', key, value);
    },

    toggle(key) {
      OS.set(key, !OS.settings[key]);
      return OS.settings[key];
    },

    registerApp(def) {
      if (!def || !def.id) throw new Error('registerApp: missing id');
      OS.apps[def.id] = def;
      if (!OS.appOrder.includes(def.id)) OS.appOrder.push(def.id);
    },

    /** Background services (alarms, weather fetch, message bots…) start after the shell is built */
    bootTasks: [],
    onBoot(fn) { OS.bootTasks.push(fn); },

    isDark() {
      const a = OS.settings.appearance;
      if (a === 'auto') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return a === 'dark';
    },
  };

  /* ---------- DOM helpers ---------- */

  OS.$ = (sel, root) => (root || document).querySelector(sel);
  OS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  OS.el = function (html) {
    const t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };

  OS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  OS.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  OS.lerp = (a, b, t) => a + (b - a) * t;
  OS.uid = () => Math.random().toString(36).slice(2, 10);
  OS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  OS.haptic = function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* not supported */ }
  };

  /** Seeded PRNG (mulberry32) for procedural content */
  OS.rng = function (seed) {
    let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h;
  }

  /* ---------- Geometry relative to the (possibly scaled) screen ---------- */

  OS.screenEl = null;
  OS.point = function (e) {
    const r = OS.screenEl.getBoundingClientRect();
    const s = OS.state.scale;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };
  OS.rectOf = function (el) {
    const r = OS.screenEl.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const s = OS.state.scale;
    return {
      x: (b.left - r.left) / s,
      y: (b.top - r.top) / s,
      width: b.width / s,
      height: b.height / s,
    };
  };

  /* ---------- Formatting (Italian locale) ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  OS.pad = pad;
  OS.cap = cap;

  const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const WEEKDAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  OS.fmt = {
    WEEKDAYS, WEEKDAYS_SHORT, MONTHS,
    time(d, opts) {
      d = d || new Date();
      let h = d.getHours();
      if (!OS.settings.use24h) h = h % 12 || 12;
      const lead = opts && opts.lead === false ? String(h) : (OS.settings.use24h ? pad(h) : String(h));
      return lead + ':' + pad(d.getMinutes());
    },
    dateLong(d) {
      d = d || new Date();
      return cap(WEEKDAYS[d.getDay()]) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    },
    dayShort(d) { return WEEKDAYS_SHORT[(d || new Date()).getDay()]; },
    weekday(d) { return cap(WEEKDAYS[(d || new Date()).getDay()]); },
    month(m) { return cap(MONTHS[m]); },
    relative(ts) {
      const diff = (Date.now() - ts) / 1000;
      if (diff < 60) return 'ora';
      if (diff < 3600) return Math.floor(diff / 60) + ' min fa';
      const d = new Date(ts);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return OS.fmt.time(d);
      const y = new Date(); y.setDate(y.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return 'Ieri';
      if (diff < 6 * 86400) return OS.fmt.weekday(d);
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
    },
    duration(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    },
    number(n, maxFrac) {
      return new Intl.NumberFormat('it-IT', { maximumFractionDigits: maxFrac == null ? 2 : maxFrac }).format(n);
    },
  };

  window.OS = OS;
})();
