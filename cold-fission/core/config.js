/* Shared numbers and game data. Module tuning lives with each module. */
(function () {
  const CF = window.CF;
  const q = new URLSearchParams(location.search);

  const CREW = [
    { id: 'dave',  name: 'Dave',  color: '#d98c5f' },
    { id: 'priya', name: 'Priya', color: '#7fb8d9' },
    { id: 'chen',  name: 'Chen',  color: '#a6d97f' },
    { id: 'mo',    name: 'Mo',    color: '#d97fb2' },
  ];

  // What must be done before the escape ship can fly. Each objective is a trip: the crew member travels there,
  // does some work, and gets stuck at every obstacle until the player helps over the intercom.
  //   kind     'item' (bring something back) or 'op' (do something on site)
  //   travel   seconds to get there        work   seconds of work before each obstacle and after the last one
  //   requires ids that must be done first bonus  'power' (+25 power) | 'battery' (-15% drain) | null, found on the way back
  //   stages   one obstacle each; `game` is the minigame id that solves it, `opts` is passed to that minigame
  const OBJECTIVES = [
    { id: 'navcore', name: 'Nav Core', kind: 'item', place: 'Navigation deck', travel: 22, work: 11, requires: [], bonus: null,
      stages: [
        { say: 'Debris is hitting the core cage. Cover me!', game: 'shield', opts: { difficulty: 1 } },
        { say: 'Sparks are flying at the cage. Keep them off me!', game: 'shield', opts: { difficulty: 2 } },
      ] },
    { id: 'fuelcell', name: 'Fuel Cell', kind: 'item', place: 'Engine bay', travel: 25, work: 11, requires: [], bonus: 'power',
      stages: [
        { say: 'The fuel line is broken. Join the pipes for me.', game: 'pipes', opts: { difficulty: 1 } },
        { say: 'Another fuel line is split. Patch this one too.', game: 'pipes', opts: { difficulty: 2 } },
      ] },
    { id: 'coupler', name: 'Thruster Coupler', kind: 'item', place: 'Cargo hold', travel: 18, work: 11, requires: [], bonus: null,
      stages: [
        { say: 'The coupler release keeps changing. Hit the prompts!', game: 'mash', opts: { difficulty: 1 } },
        { say: 'The final catches are moving fast. Keep up!', game: 'mash', opts: { difficulty: 2 } },
      ] },
    { id: 'purge', name: 'Purge coolant loop', kind: 'op', place: 'Reactor annex', travel: 25, work: 10, requires: [], bonus: 'battery',
      stages: [
        { say: 'Coolant pressure is dropping. Pump the tubes up to the green band!', game: 'flow', opts: { difficulty: 1 } },
        { say: 'The second loop is leaking. Keep every tube in the green!', game: 'flow', opts: { difficulty: 2 } },
      ] },
    { id: 'power', name: 'Reroute hangar power', kind: 'op', place: 'Power junction', travel: 18, work: 10, requires: [], bonus: null,
      stages: [
        { say: 'The power grid is jammed. Clear a row to reroute it.', game: 'blocks', opts: { rows: 1, garbage: 2, difficulty: 1 } },
      ] },
    { id: 'ignition', name: 'Prime the ignition', kind: 'op', place: 'Flight deck', travel: 15, work: 10, requires: ['fuelcell', 'power'], bonus: null,
      stages: [
        { say: 'Set the ignition switches in the right order.', game: 'switches', opts: { difficulty: 2 } },
        { say: 'Final ignition check. Set every lever now!', game: 'switches', opts: { difficulty: 3 } },
      ] },
  ];

  CF.config = {
    stageW: 1280,
    stageH: 720,

    // URL options for testing: ?speed=5 (clock 5x faster), ?god=1 (cannot be caught), ?crew=2 (start with only 2 crew).
    speed: Math.max(0.1, Number(q.get('speed')) || 1),
    god: q.get('god') === '1',

    // One continuous run. `day` remains the internal ramp value for minigame compatibility.
    schedule: [{ phase: 'play', duration: 480 }],
    rampAt: [160, 320],

    // The wall clock runs from `start` to `end` across the whole schedule (minutes since midnight).
    // The plant melts down at `end` (01:00 the next day), so the game ends then at the latest.
    clock: { start: 15 * 60 + 43, end: 25 * 60 },
    fmtClock(min) {
      const m = ((Math.round(min) % 1440) + 1440) % 1440;
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    },

    crew: CREW.slice(0, Math.max(1, Math.min(CREW.length, Number(q.get('crew')) || CREW.length))),
    crewHp: 3,                          // each failed or missed support request costs 1; at 0 the crew member dies
    objectives: OBJECTIVES,
    supportPatience: [45, 40, 35],      // seconds a stuck crew member can wait for help, per ramp level
    supportLimit: [25, 22, 20],         // seconds the player gets to solve the minigame, per ramp level

    // Fresh runtime records. Only the tasks module (the "engine") changes them after this.
    initialCrew() {
      return this.crew.map((c) => ({ id: c.id, name: c.name, color: c.color, hp: this.crewHp, status: 'idle', at: null }));
    },
    initialObjectives() {
      return this.objectives.map((o) => ({
        id: o.id, name: o.name, kind: o.kind, place: o.place, requires: o.requires.slice(),
        stagesTotal: o.stages.length, progress: 0, done: false, by: null, locked: o.requires.length > 0,
      }));
    },
  };
})();
