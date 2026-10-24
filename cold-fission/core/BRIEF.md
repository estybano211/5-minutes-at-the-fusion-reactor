# Part A: Core (integration owner)

**You may edit:** everything in `core/`, `index.html`, `README.md`, `CLAUDE.md`, `AGENTS.md`, and every `BRIEF.md`.
**Run:** `index.html` (whole game). Add `?speed=5&god=1` for fast testing, `?crew=2` to test with fewer crew.

## What you own
- `core/bus.js`: the event bus (`CF.bus`), shared state (`CF.state`), module registry (`CF.register`).
- `core/config.js`: the schedule (6 phases, 480 s = 8 real minutes), the wall clock (`clock.start` 15:43, `clock.end` 01:00, `fmtClock`), the crew roster, the six escape objectives (places, trip times, obstacles, minigame options, bonuses), HP and the support timers.
- `core/director.js`: the game clock, phase changes, win and lose.
- `core/shell.js` + `shell.css`: the stage layout, HUD (clock, checklist, crew, power), start / intro / end screens, mounting of modules.
- `core/devkit.js`: the fake director used by the pages in `dev/`. It also pretends to be any module that is not loaded (support engine, board, cameras). Keep it in step with the contract.
- `index.html` and the contract in `README.md`.

## You are the only person who may
- Rename, add or remove an event or state key. Update the tables in `README.md` when you do, and tell the others.
- Change `CF.config.schedule`. Durations must still add up to 480 seconds (8 minutes). The clock is stretched across the whole schedule, so the game always ends at `clock.end` (01:00). To change the start or end time, edit `CF.config.clock` (minutes since midnight; 01:00 the next day is 25 * 60).
- Change the layout slots (`cameras`, `tasks`, `board`, `controls`, `fx`, `hud`, `ending`).
- Change the win and lose rules (`director.js`).

## The game data in `config.js`
- `objectives`: each has `travel` and `work` seconds, `requires`, an optional `bonus` (`'flare'` or `'battery'`) and `stages` (one obstacle each, with the line the crew member says, the minigame id `game`, and the minigame `opts` such as `{rows, garbage}`).
- `crewHp` (2), `supportPatience` and `supportLimit` (per shift: how long a stuck crew member waits, how long the player has to solve the puzzle).
- Everything else is read by the modules; the engine (Person C) never hard-codes these numbers.

## Your job during the hackathon
1. Keep `index.html` working at all times. After each teammate hands in, run the integration check in `README.md`.
2. Own the balance. Target: all crew alive means the checklist is done around the end of shift 2 with a decent player; two crew is tight; one crew is impossible. Test with `?crew=4,3,2,1`. Tune `travel`, `work`, shift lengths and `supportLimit` here.
3. Answer contract questions. When someone needs a new event, agree the name and payload, add it to `README.md`, then tell both sides.
4. Add a `<script>` / `<link>` line to `index.html` when a teammate adds a new file (or let them add it themselves).

## Ideas, in priority order
1. A pause key (P): stop the director's clock and show a pause overlay.
2. Keyboard focus and Enter key on the start and intro buttons.
3. Remember the best run in `localStorage` (wrap every read and write in try/catch).
4. A short "how to play" panel on the start screen.
5. A second ending, or a stat line on the end screen (crew saved, time of launch).

## Done means
`index.html` plays from start screen to win and to each lose reason (`caught`, `late`, `alone`) with no console errors, at normal speed and at `?speed=5`.
