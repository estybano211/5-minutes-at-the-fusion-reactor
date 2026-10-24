# Part D (1 of 2): Board (the Escape Board screen)

**You may edit:** `modules/board/` and `dev/board.html`. Nothing else, except one `<script>` / `<link>` line for each new file in `index.html` and `dev/board.html`. Your other half is `modules/atmosphere/BRIEF.md`.
**Run:** open `dev/board.html`. The dev panel (bottom right) plays the crew engine for you: `next crew: stuck`, `hurt next crew`, `kill next crew`, `finish next objective`. Try clicking a crew member and then an objective: the dev panel logs the `dispatch:request`.

## What you own
`board.js` and `board.css`: the Escape Board on the right of the screen.
- The **crew list**: name, colour, HP pips, and a status (READY, EN ROUTE, WORKING, NEEDS HELP, COVER during a lockdown, LOST).
- The **escape checklist**: the six objectives with a progress bar, who is working on it, and what it is waiting for if it is locked.
- **Dispatching:** click a crew member (they are highlighted), then click an objective. That sends `dispatch:request`.
- The **LAUNCH** button: lit up once every objective is done. It sends `launch:request`.
- A one-line hint at the bottom.

The rows are built once in `mount` and updated in place by `render()`. Keep it that way: rebuilding the rows on every state change (10 times a second) would lose clicks.

## Contract (what you may use)
| Direction | Name | Detail |
|---|---|---|
| Read state | `team`, `objectives`, `phase` | Written by Person C. **You never change them** |
| Listen | `state:team`, `state:objectives`, `state:phase`, `phase:change` | |
| Emit | `dispatch:request` `{crew, objective}` | Person C validates it. A refused dispatch plays `deny`, so you do not need to |
| Emit | `launch:request` | Core wins the game if everything is done, otherwise plays `deny` |
| Emit | `sfx` | `'click'` exists |

Crew record: `{id, name, color, hp, status, at, cover}`. `status` is `idle travel work stuck dead`. `cover` is true during a lockdown. Objective record: `{id, name, kind ('item' or 'op'), place, requires, progress (0..1), done, by (crew id or null), locked}`. Full definitions are in `core/config.js`.

## Ideas, in priority order
1. **Pixel portraits** for the four crew (small images in `modules/board/img/`), and a clear "hurt" look at 1 HP.
2. **A little animation:** a crew member's row slides or pulses when they are dispatched, a tick appears when an objective is done, a name is struck through when someone dies (a short flash helps the player notice).
3. **Better hints:** warn when only one crew member is left, or when an objective cannot be finished by anyone because it needs a locked one.
4. **A tiny map** of the ship above the checklist, with a dot moving between rooms as crew travel (the objectives already have a `place`).
5. A short sound for dispatch and launch (ask yourself in the atmosphere half).

## Done means
- You can dispatch every crew member to every free objective, and the board never lets you pick something that is locked, done, or taken.
- It reads clearly in 1 second: who needs help, who is dead, what is left.
- Everything fits in the screen (no cut-off rows), also with 1 and 4 crew (`?crew=1`).
- `dev/board.html` and `index.html?speed=5&god=1` show no console errors.
- All visible text is in English, and says LOCKDOWN, never "night".
