# Part C: Crew and Support (the crew engine, support requests, minigames)

**You may edit:** `modules/tasks/` (including `minigames/`) and `dev/tasks.html`. Nothing else, except one `<script>` line for each new minigame file in `index.html` and `dev/tasks.html`.
**Run:** open `dev/tasks.html`. The dev panel plays the board for you: click `send next crew`. Use `speed` in the URL (`?speed=3`) to make trips shorter. Use `?crew=1` to test with one crew member.

## What you own
- `tasks.js`: **the crew engine**. It is the only writer of the `team` and `objectives` state. It runs every trip, every request, every HP point and every death. It also owns the intercom log, the support request cards, and the minigame runner.
- `minigames/blocks.js`: the mini Tetris used to get a stuck crew member through an obstacle.
- `tasks.css`.

## How a trip works now
1. The board (Person D) sends `dispatch:request {crew, objective}`. You check that the crew member is idle and alive, the objective is free and unlocked, and it is a shift. Then the crew member walks (`travel` seconds), and works (`work` seconds).
2. The first work segment is followed by an **obstacle**: the crew member becomes `stuck` and a request card appears (their line, a timer bar, a HELP button).
3. The player clicks HELP and plays the minigame. **Success:** the crew member works on to the next obstacle, and after the last obstacle and a final work segment the objective is **done** (`objective:done`). **Fail or time out:** they lose 1 HP and the request restarts. At 0 HP they **die** (`team:died`). The objective keeps its progress and another crew member can finish it.
4. A hurt crew member (below full HP) walks and works 1.4x slower.
5. During a lockdown (`phase 'night'`) everything is paused: crew take cover, requests freeze, a minigame in progress is dropped without a penalty. Hidden crew send creepy lines (`NIGHT_LINES`).
6. Finishing an objective can drop a bonus (`flares` or `battery` +1). The numbers, places, lines and bonuses are all in `core/config.js` (Person A's file): ask Person A for a change, or propose it.

## Contract (what you may use)
| Direction | Name | Detail |
|---|---|---|
| Read state | `phase`, `day` | |
| Write state | `team`, `objectives` | **Only you.** Publish copies: `S.set('team', team.map(...))` |
| Write state | `flares`, `battery` | `+1` when a trip brings a bonus back (Person B subtracts when a flare is used) |
| Listen | `dispatch:request` `{crew, objective}` | From the board |
| Listen | `tick`, `phase:change`, `intercom:say` `{who, text, static?}` | |
| Emit | `team:dispatched`, `team:hurt`, `team:died` `{id, name}`, `objective:done` `{id, kind}`, `support:done`, `support:failed` | Publish state **before** you emit `team:died` and `objective:done`: Core reads the state when it hears them |
| Emit | `sfx` | `'beep' 'click' 'ok' 'deny' 'chime' 'death' 'static'` exist. A new name needs Person D |

## Add or change a minigame (the main job)
`minigames/blocks.js` is the template. A minigame is registered on `CF.minigames`:
```js
CF.minigames.shapes = {
  id: 'shapes',
  title: 'FIT THE SHAPES',                           // shown above the game
  start(el, done, opts) {                            // build your UI inside el
    // opts = { day, ...the stage's opts from core/config.js }
    // when solved: done(true)
    return { cancel() { /* stop every timer, frame and key listener */ } };
  },
};
```
Add `<script src="modules/tasks/minigames/shapes.js"></script>` before `tasks.js` in `index.html` and `dev/tasks.html`. A stage picks it with `game: 'shapes'` in `core/config.js` (ask Person A to change that line). You never call `done(false)`: the runner owns the time limit (14 / 12 / 10 s by shift), calls `cancel()` when time is up, and takes 1 HP.
Rules: solvable in under 10 s by someone who knows it. Mouse or keyboard, never keys `1`, `2`, `F` (Person B uses them in lockdowns; `A`/`D` are fine during a shift because shutters only work in lockdowns). Prefix your CSS (`bk-` is taken by blocks). No sound files: emit `sfx` with `'click'`, `'ok'` or `'deny'`.

## The Tetris minigame now
8 x 10 board, 7 pieces from a shuffled bag, a ghost piece, next-piece preview. It starts with `garbage` half-built rows; clear `rows` to win. Fall speed rises each shift. If the stack reaches the top the board resets (the clock keeps running). Controls: arrows or WASD (move, rotate, soft drop), Space to hard drop, or the on-screen buttons.

## Ideas, in priority order
1. **Tune the feel:** is clearing 1 row (garbage 2) in about 6 s and 3 rows (garbage 4) in about 12 s right? Watch a real player and adjust `opts` with Person A.
2. **A second minigame variant** (fill a target shape, or a falling-pipe puzzle) so the obstacles are not all the same. Different obstacles could use different ones.
3. **Crew personalities:** each crew member has their own lines for going out, being hurt, and being thanked. Keep them short and slightly off.
4. **A recall action** (a crew member abandons a trip and comes back) if you and Person D agree a new event.
5. Better last words when a crew member dies. Do not make them gory: one cut-off line is scarier.

## Done means
- All the trips, hurts and deaths work. A dead crew member's objective can be finished by someone else.
- With `?crew=4` the checklist is finishable; with `?crew=1` it is not.
- A minigame in progress when a lockdown starts is dropped cleanly (no stuck screen, no penalty).
- `dev/tasks.html` and `index.html?speed=5&god=1` show no console errors.
- All visible text is in English, and says SHIFT and LOCKDOWN, never "day" or "night".
