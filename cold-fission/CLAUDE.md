# 5 Minutes at Fusion Reactor: development guide

Read `README.md` for the current contract. One developer may edit any part of this project. Keep `AGENTS.md` and `CLAUDE.md` current as architecture or rules change. The `BRIEF.md` files are historical.

The player spends one continuous 300-second run in a fusion reactor control room. Crew trips, support minigames, cameras, gates and creatures all run together. The wall clock goes from 18:00 to 00:00 (the meltdown); the alert ramp changes at 100 and 200 game-seconds. The sixth objective is the player's own: once the five crew objectives are done they board the ship and play the cockpit finale in `modules/cockpit/` (the run clock stops). A win then plays the launch film in `modules/ending/`, then credits.

- Plain HTML and classic scripts on `window.CF`; no build tools, npm or ES modules. `index.html` must open over `file://`.
- Player-visible text and code comments use English. The creatures appear only as silhouettes, sounds or sensor readings.
- Game rules advance on `tick` game time, including `?speed=`. `requestAnimationFrame` is for drawing only (a minigame may animate itself in real time, because the support time limit around it runs on `tick`; the cockpit finale runs on real time too, with the run clock frozen). Minigames never use the keys `1`, `2`, `A`, `D`: those are the cameras and gates. Every minigame has a `tips` object; the first use in a run opens a modal that sets state `paused`, which stops the director's ticks. Creature sounds are organic (breath, footsteps, claws, growls, panned to the hall); never use beeps or alarm tones for creatures.
- Prefix module CSS classes with `cam-`, `ctl-`, `tk-`, `bk-`, `bd-`, `fx-`, `ck-` or `en-`. Avoid bare tag selectors and stage-wide styling.
- Keep the 300-second ending and the current win/lose rules. Crew have 2 HP; one wound sends a crew member to rest for two wall-clock hours (status `injured`), a second one kills. Every new intercom line goes through `say()` in the tasks module, which plays a sound and lights the NEW MESSAGE tag. Keep new work simple and tests focused.

Run by double-clicking `index.html`. `dev/*.html` opens each module with `core/devkit.js`, which can jump to alert levels and spawn creatures. URL options: `?speed=5`, `?god=1`, `?crew=2` or `?crew=1`. Before finishing, check touched JavaScript with `node --check` and load the game and dev pages once when a browser is available.
