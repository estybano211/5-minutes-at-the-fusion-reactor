# Part D (2 of 2): Atmosphere (sound, look, ending text)

**You may edit:** `modules/atmosphere/` and `dev/atmosphere.html`. Nothing else, except one `<script>` / `<link>` line for each new file in `index.html` and `dev/atmosphere.html`. Your other half is `modules/board/BRIEF.md`.
**Run:** open `dev/atmosphere.html`, click once on the page (browsers need a click before sound), then use the dev panel (bottom right): `N1` for a lockdown, `threat 0..3` to fake the creature coming closer, `WIN` and `LOSE` to see the ending text.

## What you own
- `audio.js`: every sound. They are synthesised now (no files). `SFX` is a table of name -> function.
- `atmosphere.js`: plays every `sfx` event, the Geiger clicks, the drone volume, the screen flash, the mute button, the ending text.
- `atmosphere.css`: scanlines, vignette, red alert light in lockdown 3, flash.

## The sound table
Everyone emits `bus.emit('sfx', 'name')`. If a name is missing from `SFX` nothing happens, so nobody crashes. Current names:
`click beep ok deny chime knock shutter flare powerdown geiger static alarm scare win lose death`.
`chime` plays when a crew member finishes an objective; `death` plays when a crew member dies (the support engine emits both).
If another person asks for a new sound ("I need `thud`"), add it to `SFX` and tell them the name. The table is the whole contract: keep names lowercase and short.

## Contract (what you may use)
| Direction | Name | Detail |
|---|---|---|
| Listen | `sfx` | A name string |
| Listen | `fx:flash` | A CSS colour string |
| Listen | `night:threat` `{level 0..3}` | Drives Geiger tick rate and could drive a heartbeat |
| Listen | `night:blackout`, `phase:change`, `tick`, `game:start` | `game:start` is the click that unlocks audio |
| Write | nothing | You do not change state |

## Ideas, in priority order
1. **A real ambient track:** a looped low hum with slow movement, louder at night. Replace `startDrone` with an `<audio>` element if you have a file (put it in `modules/atmosphere/audio/`).
2. **Make the creature audible per side:** the knock should come from the left or right. Use a stereo panner and the `side` in `night:threat`.
3. **Heartbeat** that speeds up with the threat level.
4. **Better ending text** in `ENDINGS` (win, caught, late, alone). `late` is the meltdown at 01:00, `alone` is when every crew member has died. Short lines, one reveal. The win line is the only hint of the alien twist.
5. A **title sting** on `game:start` and a **shift / lockdown transition** sound on `phase:change`.
6. Subtle CRT flicker and chromatic split on the whole stage during blackout.

## Done means
- Every `sfx` name used by the other modules makes a sound (grep for `'sfx'` in the project).
- Mute button and `M` key work.
- Nothing is loud enough to hurt: check the master gain.
- `dev/atmosphere.html` and `index.html?speed=5&god=1` show no console errors.
- All visible text is in English.
