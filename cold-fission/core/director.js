/* Owns the continuous clock, alert ramp and endings. Active game logic runs on tick. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  const total = cfg.schedule[0].duration;
  const clk = cfg.clock;

  let elapsed = 0, last = 0, running = false, finale = false;
  S.set('timeLeft', total);
  S.set('clock', clk.start);

  const complete = () => { const o = S.get('objectives'); return o.length > 0 && o.every((x) => x.done); };
  const readyForFinale = () => { const o = S.get('objectives'); return o.length > 0 && o.every((x) => x.done || x.finale) && o.some((x) => x.finale && !x.done); };
  const crewAlive = () => S.get('team').filter((t) => t.status !== 'dead').length;

  function finish(result, reason) {
    if (!running) return;
    running = false; finale = false;
    S.set('phase', result);
    bus.emit('phase:change', { phase: result, day: S.get('day'), reason: reason });
  }

  bus.on('game:start', () => {
    S.set('phase', 'intro');
    bus.emit('phase:change', { phase: 'intro', day: 0 });
  });

  bus.on('intro:done', () => {
    if (S.get('phase') !== 'intro') return;
    elapsed = 0;
    running = true;
    last = performance.now();
    S.set('day', 1);
    S.set('phase', 'play');
    bus.emit('phase:change', { phase: 'play', day: 1, duration: total });
  });

  bus.on('launch:request', () => {
    if (!running) return;
    if (complete()) finish('win', 'launched');
    else bus.emit('sfx', 'deny');
  });

  // The last objective is the player's own: the run clock stops while they are in the cockpit (modules/cockpit/).
  bus.on('finale:request', () => {
    if (!running || finale || S.get('phase') !== 'play' || !readyForFinale()) { bus.emit('sfx', 'deny'); return; }
    finale = true;
    S.set('phase', 'finale');
    bus.emit('phase:change', { phase: 'finale', day: S.get('day') });
  });
  bus.on('finale:failed', () => {
    if (!running || !finale || cfg.god) return;
    finish('lose', 'glass');
  });

  bus.on('team:died', () => {
    if (running && !complete() && crewAlive() === 0) finish('lose', 'alone');
  });

  bus.on('creature:caught', () => {
    if (cfg.god) return;
    if (running) finish('lose', 'caught');
  });

  setInterval(() => {
    if (!running) return;
    const now = performance.now();
    // A modal (minigame tips), the cockpit finale or a hidden tab freezes the run clock. A hidden tab stops the minigames'
    // animation frames but not this interval, so without the check the support timer would run out while nobody can play.
    if (S.get('paused') || finale || document.hidden) { last = now; return; }
    const real = Math.min((now - last) / 1000, 0.5);
    last = now;
    const dt = real * cfg.speed;
    elapsed = Math.min(total, elapsed + dt);
    const remaining = total - elapsed;
    const day = 1 + cfg.rampAt.filter((at) => elapsed >= at).length;
    if (S.get('day') !== day) S.set('day', day);
    const clock = clk.start + (elapsed / total) * (clk.end - clk.start);
    S.set('timeLeft', Math.ceil(remaining));
    S.set('clock', Math.floor(clock));
    S.set('phaseTimeLeft', Math.ceil(remaining));
    bus.emit('tick', { dt: dt, phase: 'play', day: day, t: elapsed, phaseTimeLeft: remaining, clock: clock });
    if (!running) return;   // a tick handler may have ended the game

    if (remaining <= 0) finish(complete() ? 'win' : 'lose', complete() ? 'launched' : 'late');
  }, 100);
})();
