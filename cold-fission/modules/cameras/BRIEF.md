# Part B: Night (cameras, shutters, creature, power)

**You may edit:** `modules/cameras/` and `dev/cameras.html`. Nothing else.
**Run:** open `dev/cameras.html`, click `N1`, `N2` or `N3` in the dev panel (bottom right) to start a lockdown. Add `?speed=3` to speed it up.

## What you own
- The camera screen (2 hall feeds, west and east, drawn on a canvas; the old workshop feed is gone because the crew is out in the ship), the camera tab buttons (keys `1` and `2`), the RADIATION and DOOR readouts.
- The two shutters, the flare, and the power drain.
- The creature: when it appears, how it moves, when it catches the player.

Everything is in `cameras.js` (logic and drawing) and `cameras.css`. Tuning numbers are at the top of `cameras.js`: `NIGHT` (creature speed, grace time and base power drain per lockdown) and `DRAIN` (extra power per closed shutter). Lockdowns last 50 / 60 / 100 seconds (see `core/config.js`), so lockdown 3 is long: keep its power use survivable. During a lockdown the crew is hiding and the support terminal is locked, so this is the only thing the player does. On screen they are called LOCKDOWN, never "night".

## How the creature works now
It has four stages: 0 away, 1 far end of a hall, 2 close to the door, 3 at the door. On each side hall it walks 1, 2, 3. At stage 3 the player must have that side's shutter closed. A closed shutter holds it for 2.5 s, then it leaves. An open one for longer than `grace` seconds means the player is caught.
It is only ever drawn as a black silhouette with two uneven eyes. Keep it that way: no detailed model, no animation frames.

## Contract (what you may use)
| Direction | Name | Detail |
|---|---|---|
| Read state | `phase`, `day`, `power`, `battery`, `flares` | |
| Write state | `power` (night only), `flares` (when one is used) | Nobody else writes these |
| Listen | `tick` `{dt, phase}`, `phase:change` | Use `dt`, not timers |
| Emit | `night:caught` `{by, side}` | Core ends the game. You never end it yourself |
| Emit | `night:threat` `{level 0..3, side}` | Person D uses it for Geiger sound |
| Emit | `night:blackout` | Power hit zero |
| Emit | `sfx` | `'click' 'knock' 'shutter' 'flare' 'powerdown' 'deny' 'scare'` exist. A new name needs Person D to add it |
| Emit | `fx:flash` | A CSS colour string |

## Ideas, in priority order
1. **Real art:** replace the canvas shapes in `drawHall` and `drawMonster` with pixel sprites (`new Image()` from `modules/cameras/img/`). Keep the 220x130 pixelated look.
2. **Second creature in lockdown 3** that uses the opposite side, so the player must juggle both shutters.
3. **A third camera** (vent) where the creature is seen sooner but power drains faster while it is on screen.
4. Make switching cameras cost a little power.
5. A small tell on the camera before stage 3: a flicker of the lights.

## Done means
- A lockdown is winnable and losable, on all three difficulty levels.
- Idle in lockdown 3 gets the player caught in under 30 s. A good player survives lockdown 1 with power to spare.
- `dev/cameras.html` and `index.html?speed=5&god=1` show no console errors.
- All visible text is in English.
