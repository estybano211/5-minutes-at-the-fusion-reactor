/* CORE (Person A). Shared numbers and game data only. Module-specific tuning lives in each module's own file. */
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
  //   requires ids that must be done first bonus  'flare' | 'battery' | null, a spare the crew finds on the way
  //   stages   one obstacle each; `game` is the minigame id that solves it, `opts` is passed to that minigame
  const OBJECTIVES = [
    { id: 'navcore', name: 'Nav Core', kind: 'item', place: 'Navigation deck', travel: 12, work: 7, requires: [], bonus: null,
      stages: [
        { say: 'The navigation deck hatch is sealed. Can you override the lock?', game: 'blocks', opts: { rows: 1, garbage: 2 } },
        { say: 'The core sits in a cage with a dead relay. Reroute the power, please.', game: 'blocks', opts: { rows: 2, garbage: 3 } },
      ] },
    { id: 'fuelcell', name: 'Fuel Cell', kind: 'item', place: 'Engine bay', travel: 14, work: 7, requires: [], bonus: 'battery',
      stages: [
        { say: 'Coolant is flooding the engine bay. The pressure lock needs clearing.', game: 'blocks', opts: { rows: 2, garbage: 3 } },
        { say: 'The cell housing is jammed behind a shorted panel.', game: 'blocks', opts: { rows: 1, garbage: 2 } },
      ] },
    { id: 'coupler', name: 'Thruster Coupler', kind: 'item', place: 'Cargo hold', travel: 10, work: 7, requires: [], bonus: null,
      stages: [
        { say: 'The cargo door is stuck. Can you cut the lock circuit?', game: 'blocks', opts: { rows: 1, garbage: 2 } },
        { say: 'The coupler rack is on a dead circuit. Reconnect it.', game: 'blocks', opts: { rows: 2, garbage: 3 } },
      ] },
    { id: 'purge', name: 'Purge coolant loop', kind: 'op', place: 'Reactor annex', travel: 14, work: 6, requires: [], bonus: 'flare',
      stages: [
        { say: 'The purge controls are locked out. I need the sequence cleared.', game: 'blocks', opts: { rows: 2, garbage: 3 } },
        { say: 'The second loop is locked out as well. Same again, please.', game: 'blocks', opts: { rows: 2, garbage: 3 } },
      ] },
    { id: 'power', name: 'Reroute hangar power', kind: 'op', place: 'Power junction', travel: 10, work: 6, requires: [], bonus: null,
      stages: [
        { say: 'The junction box is fried. Can you reroute the cables?', game: 'blocks', opts: { rows: 2, garbage: 3 } },
      ] },
    { id: 'ignition', name: 'Prime the ignition', kind: 'op', place: 'Flight deck', travel: 8, work: 6, requires: ['fuelcell', 'power'], bonus: null,
      stages: [
        { say: 'The ignition panel has no power. Reconnect it.', game: 'blocks', opts: { rows: 1, garbage: 2 } },
        { say: 'The final interlock is the hardest lock on the ship. Ready?', game: 'blocks', opts: { rows: 3, garbage: 4 } },
      ] },
  ];

  CF.config = {
    stageW: 1280,
    stageH: 720,

    // URL options for testing: ?speed=5 (clock 5x faster), ?god=1 (cannot be caught), ?crew=2 (start with only 2 crew).
    speed: Math.max(0.1, Number(q.get('speed')) || 1),
    god: q.get('god') === '1',

    // The whole game is this list: 480 game-seconds = 8 real minutes at speed 1.
    // On screen the phases are called SHIFT (day) and LOCKDOWN (night); in code they stay 'day' and 'night'.
    // During a SHIFT the player dispatches and supports the crew. During a LOCKDOWN the crew takes cover
    // and the player defends the control room.
    schedule: [
      { phase: 'day',   day: 1, duration: 90 },
      { phase: 'night', day: 1, duration: 50 },
      { phase: 'day',   day: 2, duration: 90 },
      { phase: 'night', day: 2, duration: 60 },
      { phase: 'day',   day: 3, duration: 90 },
      { phase: 'night', day: 3, duration: 100 },
    ],

    // The wall clock runs from `start` to `end` across the whole schedule (minutes since midnight).
    // The plant melts down at `end` (01:00 the next day), so the game ends then at the latest.
    clock: { start: 15 * 60 + 43, end: 25 * 60 },
    fmtClock(min) {
      const m = ((Math.round(min) % 1440) + 1440) % 1440;
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    },

    crew: CREW.slice(0, Math.max(1, Math.min(CREW.length, Number(q.get('crew')) || CREW.length))),
    crewHp: 2,                          // each failed or missed support request costs 1; at 0 the crew member dies
    objectives: OBJECTIVES,
    supportPatience: [30, 26, 22],      // seconds a stuck crew member can wait for help, per shift
    supportLimit: [14, 12, 10],         // seconds the player gets to solve the minigame, per shift

    // Fresh runtime records. Only the tasks module (the "engine") changes them after this.
    initialCrew() {
      return this.crew.map((c) => ({ id: c.id, name: c.name, color: c.color, hp: this.crewHp, status: 'idle', at: null, cover: false }));
    },
    initialObjectives() {
      return this.objectives.map((o) => ({
        id: o.id, name: o.name, kind: o.kind, place: o.place, requires: o.requires.slice(),
        stagesTotal: o.stages.length, progress: 0, done: false, by: null, locked: o.requires.length > 0,
      }));
    },
  };
})();
