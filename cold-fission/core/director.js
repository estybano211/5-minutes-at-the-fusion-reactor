/* CORE (Person A). The game clock and the phase machine.
   Walks CF.config.schedule, owns clock / timeLeft / phase / day, emits 'tick' and 'phase:change',
   and decides win / lose. Modules never change the phase themselves; they emit events.
   Win:  the player presses LAUNCH after every objective is done (any time), or the clock reaches 01:00 with all done.
   Lose: the creature gets in, the plant melts down at 01:00 with the checklist unfinished, or no crew is left to send. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  const steps = cfg.schedule;
  const total = steps.reduce((a, s) => a + s.duration, 0);
  const clk = cfg.clock;

  let idx = -1, left = 0, last = 0, running = false;
  S.set('timeLeft', total);
  S.set('clock', clk.start);

  const complete = () => { const o = S.get('objectives'); return o.length > 0 && o.every((x) => x.done); };
  const crewAlive = () => S.get('team').filter((t) => t.status !== 'dead').length;

  function enter(i) {
    idx = i;
    const st = steps[i];
    left = st.duration;
    S.set('day', st.day);
    S.set('phase', st.phase);
    bus.emit('phase:change', { phase: st.phase, day: st.day, duration: st.duration, index: i });
  }

  function finish(result, reason) {
    if (!running) return;
    running = false;
    S.set('phase', result);
    bus.emit('phase:change', { phase: result, day: S.get('day'), reason: reason });
  }

  bus.on('game:start', () => {
    S.set('phase', 'intro');
    bus.emit('phase:change', { phase: 'intro', day: 0 });
  });

  bus.on('intro:done', () => {
    if (S.get('phase') !== 'intro') return;
    running = true;
    last = performance.now();
    enter(0);
  });

  bus.on('launch:request', () => {
    if (!running) return;
    if (complete()) finish('win', 'launched');
    else bus.emit('sfx', 'deny');
  });

  bus.on('team:died', () => {
    if (running && !complete() && crewAlive() === 0) finish('lose', 'alone');
  });

  bus.on('night:caught', () => {
    if (cfg.god) return;
    if (running && S.get('phase') === 'night') finish('lose', 'caught');
  });

  setInterval(() => {
    if (!running) return;
    const now = performance.now();
    const real = Math.min((now - last) / 1000, 0.5);   // a hidden tab effectively pauses the game
    last = now;
    const dt = real * cfg.speed;
    left -= dt;

    const remaining = Math.max(0, left + steps.slice(idx + 1).reduce((a, s) => a + s.duration, 0));
    const clock = clk.start + ((total - remaining) / total) * (clk.end - clk.start);
    S.set('timeLeft', Math.ceil(remaining));
    S.set('clock', Math.floor(clock));
    S.set('phaseTimeLeft', Math.max(0, Math.ceil(left)));
    bus.emit('tick', { dt: dt, phase: S.get('phase'), day: S.get('day'), t: steps[idx].duration - left, phaseTimeLeft: left, clock: clock });
    if (!running) return;   // a tick handler may have ended the game

    if (left <= 0) {
      if (idx < steps.length - 1) enter(idx + 1);
      else if (complete()) finish('win', 'launched');
      else finish('lose', 'late');
    }
  }, 100);
})();
