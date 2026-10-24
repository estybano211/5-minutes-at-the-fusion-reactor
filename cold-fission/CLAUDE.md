# Cold Fission: instructions for AI coding assistants

This is a four-person hackathon game (plain HTML + JavaScript, no build step). Each person owns one part and works with an AI assistant. **Follow these rules in every session.**

The game: the player is alone in the control room of a leaking nuclear plant that melts down at 01:00. They dispatch their crew to fetch the escape ship's parts, and help them through every locked door with a Tetris-style minigame. During lockdowns they defend the room from a creature. Crew members can die.

## 1. First, find out which part the user owns

If the user has not said, ask once: "Which part are you: A (Core), B (Night), C (Crew and Support) or D (Board and Atmosphere)?"
Then read, in this order: `README.md` (the game and the contract), then the `BRIEF.md` for that part:

| Part | Person | Folders you may edit | Brief |
|---|---|---|---|
| A | Core | `core/`, `index.html`, `README.md`, `CLAUDE.md`, `AGENTS.md`, every `BRIEF.md` | `core/BRIEF.md` |
| B | Night | `modules/cameras/`, `dev/cameras.html` | `modules/cameras/BRIEF.md` |
| C | Crew and Support | `modules/tasks/`, `dev/tasks.html` | `modules/tasks/BRIEF.md` |
| D | Board and Atmosphere | `modules/board/`, `modules/atmosphere/`, `dev/board.html`, `dev/atmosphere.html` | `modules/board/BRIEF.md`, `modules/atmosphere/BRIEF.md` |

## 2. Hard rules

1. **Only edit your own folders** (table above). The single exception: you may add one `<script>` or `<link>` line for a NEW file of yours to `index.html` and to your own dev page.
2. **Never edit another part's files.** If you need something from them (a new event, a new state key, a new sound name), do not work around it. Tell the user exactly what to ask the other person, and propose the event name and payload.
3. **Modules talk only through `CF.bus` events and `CF.state`.** Never call another module's functions, never read its variables, never query its DOM.
4. **Every state key has one owner** (see the table in `README.md`). Never write a key you do not own. In particular only the tasks module (C) writes `team` and `objectives`; the board (D) only reads them and sends `dispatch:request` and `launch:request`.
5. **Do not rename or remove** existing events or state keys. Adding new ones is allowed only if you also tell the user to add them to the tables in `README.md` (Person A edits that file).
6. **All text the player can see must be in English**: buttons, labels, dialogue, endings, error messages. Code comments in English too. On screen the phases are called SHIFT and LOCKDOWN; never write "day" or "night" in player-facing text (the code keeps `day` and `night`).
7. **No build tools, no npm, no ES modules** (`import`/`export`). The game must work by double-clicking `index.html` (`file://`). Use classic `<script>` files that attach to `window.CF`.
8. **Game logic runs on the `tick` event** (game time), not `setTimeout` or `setInterval`, so `?speed=` and the dev kit keep working. Use `requestAnimationFrame` only for drawing.
9. **Prefix every CSS class with your module's prefix** (`cam-`, `ctl-`, `tk-`, `bk-`, `bd-`, `fx-`; a new minigame picks its own). Never style bare tags or `#stage`.
10. **The creature has no model.** It is only ever a silhouette, a sound or a sensor reading. Do not add detailed monster art.
11. **Keep the whole run to 8 minutes.** There is no countdown: a wall clock runs from 15:43 to 01:00 over 480 game-seconds (`CF.config.schedule`, `CF.config.clock`), and the game ends at 01:00 at the latest. Do not add content that makes it longer.
12. **Keep the balance.** With all crew alive the checklist is finishable with time to spare; losing several crew makes it impossible. If you change trip times, shift lengths, HP or minigame limits, say so, and check with `?crew=2` and `?crew=1`.

## 3. Before you say you are done

- Open your `dev/<module>.html` page: the browser console has no red errors.
- Open `index.html?speed=5&god=1`: the game plays from the start screen to an end screen.
- Your part still works if another module's file is missing (the shell skips a module that throws).
- Tell the user, in one short list, which events or state keys you read, wrote and emitted, so Person A can check the contract.

## 4. How to run

Double-click `index.html`, or `python3 -m http.server` in this folder. Standalone module pages are in `dev/` (the dev panel pretends to be the modules that are not loaded). URL options: `?speed=5` (faster clock), `?god=1` (cannot be caught), `?crew=2` (start with 2 crew).
