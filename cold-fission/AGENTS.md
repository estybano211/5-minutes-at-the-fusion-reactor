# 8 Minutes at Fusion Reactor: assistant handoff

Read `CLAUDE.md`, then `README.md`. One developer may edit the whole project. Keep this file and `CLAUDE.md` current with architecture and rules; use comments and README for functional explanations only.

The game is one 480-second `play` phase. `core/` owns clock, ramp, HUD, state and dev kit; `modules/cameras/` owns four silhouette creatures, shutters and power; `modules/tasks/` owns crew, requests and minigame timing; `modules/board/` owns dispatch and launch; `modules/atmosphere/` owns sound and effects. Modules communicate through `CF.bus` and `CF.state`.

Use classic `<script>` files on `window.CF` with no build step or npm. Keep player text and comments in English. Gameplay advances on `tick`; drawing may use `requestAnimationFrame`. Use module CSS prefixes and preserve the `file://` entry point. Open `index.html` or `dev/*.html`; `?speed=`, `?god=1`, and `?crew=1..4` are test options. Run `node --check` on touched JavaScript and one startup load when cheap.

Minigames live in `modules/tasks/minigames/` (shield, pipes, mash, flow, switches, blocks). The support time limit is on `tick`; a minigame animates its own picture in real time. They must never use the keys `1`, `2`, `A` or `D` (cameras and shutters). `dev/minigames.html` tries each one alone.
