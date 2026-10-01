/* ==========================================================================
   Audio: system sounds + a small generative music engine (Web Audio)
   ========================================================================== */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let musicBus = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = .55;
    musicBus.connect(master);
    applyVolume();
    return ctx;
  }

  function applyVolume() {
    if (!master) return;
    const v = OS.settings.volume;
    master.gain.setTargetAtTime(v * v, ctx.currentTime, .03);
  }

  /** System sound: respects the silent switch */
  function tone(freq, dur, opts) {
    opts = opts || {};
    if (OS.settings.silent && !opts.force) return;
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const vol = opts.vol == null ? .2 : opts.vol;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + .02);
  }

  const sounds = {
    click() { if (OS.settings.keyClicks) tone(2400, .025, { type: 'square', vol: .03 }); },
    lock() { tone(1500, .04, { type: 'square', vol: .05 }); tone(700, .05, { type: 'square', vol: .04, delay: .03 }); },
    unlock() { tone(900, .04, { type: 'triangle', vol: .05 }); },
    notify() { tone(1318.5, .18, { vol: .14 }); tone(1760, .32, { vol: .12, delay: .12 }); },
    sent() { tone(880, .08, { type: 'triangle', vol: .1, to: 1600 }); },
    received() { tone(1046.5, .12, { vol: .12 }); tone(1568, .2, { vol: .1, delay: .09 }); },
    shutter() {
      const c = ensure(); if (!c || OS.settings.silent) return;
      const len = c.sampleRate * .08;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = c.createBufferSource();
      const g = c.createGain(); g.gain.value = .35;
      src.buffer = buf; src.connect(g).connect(master); src.start();
    },
    alarm(times) {
      const n = times || 6;
      for (let i = 0; i < n; i++) {
        tone(1568, .14, { vol: .22, delay: i * .5, force: true });
        tone(1568, .14, { vol: .22, delay: i * .5 + .18, force: true });
      }
    },
    dtmf(key) {
      const map = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
      const f = map[key]; if (!f) return;
      tone(f[0], .14, { vol: .08 }); tone(f[1], .14, { vol: .08 });
    },
    ring(i) {
      tone(440, .9, { vol: .06, delay: i || 0, force: true });
      tone(480, .9, { vol: .06, delay: i || 0, force: true });
    },
  };

  /* ---------------- Generative music engine ---------------- */

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function voice(type, freq, t, dur, vol, cutoff, attack) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff || 2400;
    const a = attack || .01;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0, t + Math.max(a, dur * .6), dur * .35);
    o.connect(f).connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + dur + .5);
  }

  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + .32);
  }
  function hat(t, vol) {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || .08, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
    s.connect(f).connect(g).connect(musicBus); s.start(t, Math.random() * .5); s.stop(t + .06);
  }
  function snare(t) {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .8;
    const g = ctx.createGain(); g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
    s.connect(f).connect(g).connect(musicBus); s.start(t, Math.random() * .5); s.stop(t + .18);
  }

  const Music = {
    song: null,
    playing: false,
    step: 0,
    startedAt: 0,
    offset: 0,
    timer: null,
    nextTime: 0,

    position() {
      if (!this.song) return 0;
      if (!this.playing) return this.offset;
      return this.offset + (ctx.currentTime - this.startedAt);
    },

    load(song, autoplay) {
      this.stop(true);
      this.song = song;
      this.offset = 0;
      this.step = 0;
      OS.emit('music:change', song);
      if (autoplay) this.play();
    },

    play() {
      if (!this.song) return;
      if (!ensure()) return;
      if (this.playing) return;
      this.playing = true;
      this.startedAt = ctx.currentTime;
      const spb = 60 / this.song.bpm / 4; // seconds per 16th
      this.step = Math.floor(this.offset / spb);
      this.nextTime = ctx.currentTime + .05;
      this.timer = setInterval(() => this.schedule(), 25);
      OS.emit('music:state', true);
    },

    pause() {
      if (!this.playing) return;
      this.offset = this.position();
      this.playing = false;
      clearInterval(this.timer);
      this.timer = null;
      OS.emit('music:state', false);
    },

    toggle() { this.playing ? this.pause() : this.play(); },

    stop(silent) {
      clearInterval(this.timer);
      this.timer = null;
      const was = this.playing;
      this.playing = false;
      this.offset = 0;
      if (was && !silent) OS.emit('music:state', false);
    },

    seek(sec) {
      const was = this.playing;
      if (was) { clearInterval(this.timer); this.playing = false; }
      this.offset = OS.clamp(sec, 0, this.song ? this.song.duration : 0);
      if (was) this.play();
      OS.emit('music:seek', this.offset);
    },

    schedule() {
      const s = this.song;
      const spb = 60 / s.bpm / 4;
      if (this.position() >= s.duration) {
        this.stop();
        OS.emit('music:ended', s);
        return;
      }
      while (this.nextTime < ctx.currentTime + .12) {
        this.playStep(this.step, this.nextTime, spb);
        this.step++;
        this.nextTime += spb;
      }
    },

    playStep(step, t, spb) {
      const s = this.song;
      const root = 48 + NOTE[s.key];
      const scale = SCALES[s.scale];
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const chordDeg = s.prog[bar % s.prog.length];
      const deg = (d) => {
        const oct = Math.floor(d / 7);
        return root + scale[((d % 7) + 7) % 7] + oct * 12;
      };
      const chord = [deg(chordDeg), deg(chordDeg + 2), deg(chordDeg + 4)];
      const section = Math.floor(bar / 8) % 4; // intro / verse / chorus / bridge-ish
      const r = OS.rng(s.seed * 1000 + step);

      if (pos === 0) chord.forEach((n) => voice('sawtooth', midi(n + 12), t, spb * 16, .035, 1400, .25));
      if (pos % 4 === 0) voice('triangle', midi(chord[0] - 12), t, spb * 3.5, .2, 900);
      if (section > 0) {
        if (s.style === 'four' ? pos % 4 === 0 : (pos === 0 || pos === 10)) kick(t);
        if (pos === 4 || pos === 12) snare(t);
        if (pos % 2 === 0) hat(t, pos % 4 === 2 ? .07 : .04);
      }
      const arpOn = s.style === 'arp' ? pos % 2 === 0 : (pos % 4 === 0 || (pos % 4 === 3 && r() > .5));
      if (arpOn) {
        const n = chord[(pos / 2) % 3 | 0] + 24 + (r() > .8 ? 12 : 0);
        voice(s.lead || 'square', midi(n), t, spb * 1.6, section === 2 ? .05 : .035, 3200);
      }
      if (section === 2 && pos % 8 === 0 && r() > .3) {
        voice('sine', midi(deg(chordDeg + (r() * 5 | 0)) + 36), t, spb * 6, .04, 5000, .05);
      }
    },
  };

  function init() {
    OS.on('setting:volume', applyVolume);
    const unlockAudio = () => { ensure(); };
    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
  }

  OS.Audio = { ensure, tone, sounds, Music, init, get ctx() { return ctx; } };
  OS.sound = (name, arg) => { try { sounds[name] && sounds[name](arg); } catch (e) { /* audio unavailable */ } };
})();
