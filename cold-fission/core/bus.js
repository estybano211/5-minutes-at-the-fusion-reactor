/* CORE (Person A). The only things every module may rely on:
     CF.bus       on / off / emit       modules talk through events, never by calling each other
     CF.state     get / set / add       shared game numbers (key list is in README.md)
     CF.register  module registry       see "Module contract" in README.md
   Only Person A edits files in /core. */
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
    phase: 'boot',      // boot | intro | day | shop | night | win | lose
    day: 0,             // 1..3
    team: [],           // crew records, written ONLY by the tasks module (shape: CF.config.initialCrew)
    objectives: [],     // escape checklist, written ONLY by the tasks module (shape: CF.config.initialObjectives)
    power: 100,         // 0..100, only meaningful during a lockdown
    battery: 0,         // extra batteries found (each cuts power drain by 15%)
    flares: 0,          // flares found
    clock: 943,         // wall clock in minutes since midnight: 943 = 15:43, 1500 = 01:00 next day
    timeLeft: 480,      // game-seconds until the clock reaches its end (01:00)
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
