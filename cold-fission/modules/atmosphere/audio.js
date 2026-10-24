/* Synthesised audio. There are no audio files.
   To use real recordings later, replace the body of a function in SFX with an <audio> or buffer play. */
(function () {
  const CF = window.CF;
  let ac = null, master = null, drone = null, muted = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
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

  function tone(freq, dur, type, vol, slideTo) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, kind) {
    if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
    s.buffer = buf; f.type = kind || 'lowpass'; f.frequency.value = freq || 1200;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  const later = (fn, ms) => setTimeout(fn, ms);
  const SFX = {
    click()     { tone(880, 0.04, 'square', 0.07); },
    beep()      { tone(1200, 0.08, 'square', 0.08); later(() => tone(1200, 0.08, 'square', 0.08), 140); },
    ok()        { tone(660, 0.08, 'square', 0.09); later(() => tone(990, 0.14, 'square', 0.09), 90); },
    deny()      { tone(140, 0.18, 'sawtooth', 0.12); },
    chime()     { tone(520, 0.06, 'square', 0.09); later(() => tone(780, 0.06, 'square', 0.09), 70); later(() => tone(1040, 0.12, 'square', 0.09), 140); },
    knock()     { noise(0.12, 0.5, 300); later(() => noise(0.12, 0.5, 260), 170); },
    shutter()   { noise(0.35, 0.25, 900); tone(90, 0.3, 'sawtooth', 0.1, 60); },
    powerdown() { tone(220, 1.2, 'sawtooth', 0.18, 30); },
    geiger()    { noise(0.015, 0.25, 3000, 'highpass'); },
    static()    { noise(0.25, 0.14, 2000); },
    alarm()     { tone(520, 0.35, 'square', 0.08); later(() => tone(390, 0.35, 'square', 0.08), 380); },
    scare()     { noise(0.6, 0.6, 1800); tone(70, 0.9, 'sawtooth', 0.3, 25); },
    win()       { [523, 659, 784, 1046].forEach((f, i) => later(() => tone(f, 0.22, 'square', 0.1), i * 140)); },
    lose()      { tone(110, 1.4, 'sawtooth', 0.22, 28); },
    death()     { noise(0.5, 0.45, 500); tone(60, 0.8, 'sawtooth', 0.25, 30); },
  };

  CF.audio = {
    init: init,
    play(name) { try { if (SFX[name]) SFX[name](); } catch (e) { console.warn('[audio]', name, e); } },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    droneLevel(level) { if (drone) drone.gain.setTargetAtTime(0.03 + level * 0.05, ac.currentTime, 0.6); },
  };
})();
