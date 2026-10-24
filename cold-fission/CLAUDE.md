# 8 Minutes at Fusion Reactor: development guide

Read `README.md` for the current contract. One developer may edit any part of this project. Keep `AGENTS.md` and `CLAUDE.md` current as architecture or rules change. The `BRIEF.md` files are historical.

The player spends one continuous 480-second run in a fusion reactor control room. Crew trips, support minigames, cameras, shutters and creatures all run together. The wall clock goes from 15:43 to 01:00; the alert ramp changes at 160 and 320 game-seconds.

- Plain HTML and classic scripts on `window.CF`; no build tools, npm or ES modules. `index.html` must open over `file://`.
- Player-visible text and code comments use English. The creatures appear only as silhouettes, sounds or sensor readings.
- Game rules advance on `tick` game time, including `?speed=`. `requestAnimationFrame` is for drawing only (a minigame may animate itself in real time, because the support time limit around it runs on `tick`). Minigames never use the keys `1`, `2`, `A`, `D`: those are the cameras and shutters.
- Prefix module CSS classes with `cam-`, `ctl-`, `tk-`, `bk-`, `bd-` or `fx-`. Avoid bare tag selectors and stage-wide styling.
- Keep the 480-second ending and the current win/lose rules. Keep new work simple and tests focused.

Run by double-clicking `index.html`. `dev/*.html` opens each module with `core/devkit.js`, which can jump to alert levels and spawn creatures. URL options: `?speed=5`, `?god=1`, `?crew=2` or `?crew=1`. Before finishing, check touched JavaScript with `node --check` and load the game and dev pages once when a browser is available.
