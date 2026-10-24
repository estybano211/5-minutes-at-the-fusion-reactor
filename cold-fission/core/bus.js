/* Shared bus, state, and module registry:
     CF.bus       on / off / emit       modules talk through events, never by calling each other
     CF.state     get / set / add       shared game numbers (key list is in README.md)
     CF.register  module registry       see "Module contract" in README.md
*/
(function () {
  const CF = (window.CF = window.CF || {});

  const handlers = {};
  CF.bus = {
    on(evt, fn) {
      (handlers[evt] = handlers[evt] || []).push(fn);
      return () => CF.bus.off(evt, fn);
    },
    off(evt, fn) {
      handlers[evt] = (handlers[evt] || []).filter((f) => f !== fn);
    },
    emit(evt, data) {
      (handlers[evt] || []).slice().forEach((fn) => {
        try { fn(data); } catch (e) { console.error('[bus] handler for "' + evt + '" threw', e); }
      });
    },
  };

  const initial = () => ({
    phase: 'boot',      // boot | intro | play | win | lose
    day: 0,             // ramp level 1..3; also passed to minigames as opts.day
    team: [],           // crew records (status idle/travel/work/stuck/injured/dead), written by the tasks module
    objectives: [],     // escape checklist, written by the tasks module
    power: 100,         // continuous 0..100 pool
    battery: 0,         // extra batteries found (each cuts power drain by 15%)
    paused: false,      // true while a minigame tip is open: the director sends no ticks
    clock: 1080,        // wall clock in minutes since midnight: 1080 = 18:00, 1440 = 00:00 (the meltdown)
    timeLeft: 300,      // game-seconds until the clock reaches its end
    phaseTimeLeft: 0,
  });

  let data = initial();
  CF.state = {
    get(k) { return data[k]; },
    set(k, v) {
      if (data[k] === v) return;
      data[k] = v;
      CF.bus.emit('state:' + k, v);
      CF.bus.emit('state', { key: k, value: v });
    },
    add(k, d) { CF.state.set(k, data[k] + d); },
    all() { return Object.assign({}, data); },
  };

  CF.modules = [];
  CF.register = function (def) { CF.modules.push(def); };
})();
