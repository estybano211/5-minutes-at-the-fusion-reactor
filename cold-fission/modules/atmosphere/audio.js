/* Synthesised audio. There are no audio files.
   Interface sounds are simple beeps. Creatures are built from breath, footsteps, claws and growls (filtered noise and
   slow, wobbling low tones), never beeps or alarms, and each one is panned to the hall it is in.
   To use real recordings later, replace the body of a function in SFX or CREATURE with an <audio> or buffer play. */
(function () {
  const CF = window.CF;
  let ac = null, master = null, drone = null, noiseBuf = null, muted = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startDrone();
  }

  function startDrone() {
    const a = ac.createOscillator(), b = ac.createOscillator(), f = ac.createBiquadFilter();
    a.type = 'sawtooth'; a.frequency.value = 48;
    b.type = 'sine'; b.frequency.value = 96.7;
    f.type = 'lowpass'; f.frequency.value = 180;
    drone = ac.createGain(); drone.gain.value = 0.04;
    a.connect(f); b.connect(f); f.connect(drone); drone.connect(master);
    a.start(); b.start();
  }

  // Where a sound goes: straight to the master, or through a stereo panner (-1 west hall, +1 east hall).
  function dest(pan) {
    if (!pan || !ac.createStereoPanner) return master;
    const p = ac.createStereoPanner();
    p.pan.value = pan; p.connect(master);
    return p;
  }

  function tone(freq, dur, type, vol, slideTo, pan) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, kind, pan, q) {
    if (!ac) return;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = noiseBuf; f.type = kind || 'lowpass'; f.frequency.value = freq || 1200;
    if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest(pan));
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  /* Breath, hiss and whisper: band-passed noise that swells in and out. `wobble` (Hz) chops it like a throat. */
  function breath(o) {
    if (!ac) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q || 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + o.dur * (o.attack || .4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g);
    let out = g;
    if (o.wobble) {
      const w = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      w.gain.value = .55; l.frequency.value = o.wobble; lg.gain.value = .45;
      l.connect(lg); lg.connect(w.gain); g.connect(w); out = w;
      l.start(t); l.stop(t + o.dur + .05);
    }
    out.connect(dest(o.pan));
    s.start(t, Math.random() * 1.5); s.stop(t + o.dur + .05);
  }

  /* Growl, groan and wail: a few detuned oscillators through a low-pass, with a pitch glide, vibrato and tremolo. */
  function voice(o) {
    if (!ac) return;
    const t = ac.currentTime, f = ac.createBiquadFilter(), tg = ac.createGain(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = o.cut || 400;
    tg.gain.value = o.trem ? 1 - o.depth / 2 : 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + o.dur * (o.attack || .3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    f.connect(tg); tg.connect(g); g.connect(dest(o.pan));
    const oscs = o.freqs.map((fr) => {
      const os = ac.createOscillator();
      os.type = o.type || 'sawtooth';
      os.frequency.setValueAtTime(fr, t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(fr * o.to, t + o.dur);
      os.connect(f); os.start(t); os.stop(t + o.dur + .05);
      return os;
    });
    const lfo = (rate, depth, target) => {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = rate; lg.gain.value = depth;
      l.connect(lg); target(lg);
      l.start(t); l.stop(t + o.dur + .05);
    };
    if (o.vib) lfo(o.vibRate || 5.5, o.vib, (lg) => oscs.forEach((os) => lg.connect(os.frequency)));
    if (o.trem) lfo(o.trem, o.depth / 2, (lg) => lg.connect(tg.gain));
  }

  const later = (fn, ms) => setTimeout(fn, ms);

  /* Footfalls: a soft low thud plus a little wet slap. `w` is the weight. */
  function step(pan, w, delay) {
    later(() => {
      tone(86 + Math.random() * 12, 0.16, 'sine', 0.5 * w, 36, pan);
      noise(0.09, 0.28 * w, 240, 'lowpass', pan);
      noise(0.05, 0.07 * w, 750, 'bandpass', pan, 1.5);
    }, delay || 0);
  }
  /* Claws on metal: rapid irregular ticks. */
  function skitter(pan, n, vol) {
    let at = 0;
    for (let i = 0; i < n; i++) {
      at += 22 + Math.random() * 55 + (i % 5 === 4 ? 110 : 0);
      later(() => noise(0.02, vol * (0.6 + Math.random() * 0.6), 2600 + Math.random() * 1800, 'bandpass', pan, 4), at);
    }
  }
  /* A long scrape across a door. */
  function scratch(pan, vol, delay) {
    later(() => {
      if (!ac) return;
      const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.55);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      s.connect(f); f.connect(g); g.connect(dest(pan));
      s.start(t, Math.random() * 1.5); s.stop(t + 0.65);
    }, delay || 0);
  }
  /* Something heavy hits a door. */
  function slam(pan, w) {
    tone(58, 0.45, 'sine', 0.65 * w, 30, pan);
    noise(0.28, 0.55 * w, 150, 'lowpass', pan);
    noise(0.1, 0.2 * w, 1100, 'bandpass', pan, 1);
  }
  const groan = (pan, f, vol, dur) => voice({ freqs: [f, f * 1.5, f * 2.02], dur: dur || 1.3, to: 0.8, cut: 420, vol: vol, vib: 4, attack: 0.4, pan: pan });
  const growl = (pan, vol) => voice({ freqs: [57, 60.5, 116], dur: 1.0, to: 0.78, cut: 260, vol: vol, trem: 23, depth: 0.9, attack: 0.25, pan: pan });
  const whisper = (pan, vol) => breath({ freq: 2300, q: 4, dur: 1.1, vol: vol, wobble: 7, pan: pan, attack: 0.5 });
  const wail = (pan, vol) => voice({ freqs: [640, 962], type: 'sine', dur: 1.4, to: 0.7, cut: 1800, vol: vol, vib: 14, vibRate: 6.5, attack: 0.5, pan: pan });

  // What each creature sounds like at each stage: 1 far away, 2 near the shutter, 3 at the shutter. `again` is a repeat while it waits.
  const CREATURE = {
    walker(stage, p, again) {
      if (again) { step(p, 0.55); breath({ freq: 800, dur: 0.9, vol: 0.06, pan: p }); return; }
      if (stage === 1) { step(p, 0.4); step(p, 0.4, 560); breath({ freq: 900, dur: 1.2, vol: 0.04, pan: p }); }
      else if (stage === 2) { step(p, 0.8); step(p, 0.8, 430); step(p, 0.9, 880); groan(p, 92, 0.1); }
      else { slam(p, 0.6); groan(p, 70, 0.12, 1.5); }
    },
    crawler(stage, p, again) {
      if (again) { scratch(p, 0.12); skitter(p, 6, 0.1); return; }
      if (stage === 1) skitter(p, 9, 0.07);
      else if (stage === 2) { skitter(p, 18, 0.12); breath({ freq: 4200, q: 0.8, dur: 0.9, vol: 0.05, pan: p }); }
      else { scratch(p, 0.16); scratch(p, 0.14, 380); scratch(p, 0.16, 760); breath({ freq: 4200, q: 0.8, dur: 1.2, vol: 0.06, pan: p }); }
    },
    brute(stage, p, again) {
      if (again) { slam(p, 0.9); return; }
      if (stage === 1) { step(p, 1); step(p, 1, 900); }
      else if (stage === 2) { step(p, 1.1); step(p, 1.1, 800); growl(p, 0.22); }
      else { slam(p, 1.1); growl(p, 0.3); }
    },
    stalker(stage, p, again) {
      if (again) { whisper(p, 0.08); return; }
      if (stage === 1) whisper(p, 0.05);
      else if (stage === 2) { whisper(p, 0.09); wail(p, 0.05); }
      else { scratch(p, 0.1); whisper(p, 0.1, 500); wail(p, 0.06); }
    },
  };

  const SFX = {
    click()     { tone(880, 0.04, 'square', 0.07); },
    beep()      { tone(1200, 0.08, 'square', 0.08); later(() => tone(1200, 0.08, 'square', 0.08), 140); },
    ok()        { tone(660, 0.08, 'square', 0.09); later(() => tone(990, 0.14, 'square', 0.09), 90); },
    deny()      { tone(140, 0.18, 'sawtooth', 0.12); },
    chime()     { tone(520, 0.06, 'square', 0.09); later(() => tone(780, 0.06, 'square', 0.09), 70); later(() => tone(1040, 0.12, 'square', 0.09), 140); },
    knock()     { slam(0, 0.5); },
    shutter()   { noise(0.35, 0.25, 900); tone(90, 0.3, 'sawtooth', 0.1, 60); },
    powerdown() { tone(220, 1.2, 'sawtooth', 0.18, 30); },
    static()    { noise(0.25, 0.14, 2000); },
    heart()     { tone(54, 0.14, 'sine', 0.4, 38); later(() => tone(48, 0.16, 'sine', 0.3, 34), 190); },
    // The catch: a roar, a rush of breath and a thin scream.
    scare()     { voice({ freqs: [58, 61, 117], dur: 1.3, to: 0.7, cut: 700, vol: 0.55, trem: 24, depth: 0.8, attack: 0.1 }); noise(0.8, 0.5, 1500, 'bandpass', 0, 0.8); wail(0, 0.16); },
    win()       { [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, 0.22, 'square', 0.1), i * 140)); },
    lose()      { tone(110, 1.4, 'sawtooth', 0.22, 28); },
    death()     { noise(0.5, 0.45, 500); tone(60, 0.8, 'sawtooth', 0.25, 30); },
  };

  CF.audio = {
    init: init,
    play(name) { try { if (ac && SFX[name]) SFX[name](); } catch (e) { console.warn('[audio]', name, e); } },
    creature(kind, stage, side, again) {
      try { if (ac && CREATURE[kind]) CREATURE[kind](stage, side === 'L' ? -0.75 : 0.75, again); } catch (e) { console.warn('[audio]', kind, e); }
    },
    leave(kind, side) {
      if (!ac) return;
      const p = side === 'L' ? -0.75 : 0.75;
      try { groan(p, 66, 0.08, 1.4); step(p, 0.5, 300); step(p, 0.3, 900); step(p, 0.15, 1500); } catch (e) { console.warn('[audio]', e); }
    },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    droneLevel(level) { if (drone) drone.gain.setTargetAtTime(0.03 + level * 0.05, ac.currentTime, 0.6); },
  };
})();
