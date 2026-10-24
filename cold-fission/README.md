# 5 Minutes at Fusion Reactor

A browser game set in a leaking fusion reactor on the dark side of the Moon. You direct a four-person crew through five escape-ship objectives while defending the control room; the sixth, priming the ignition, you do yourself in the dark ship cockpit. Crew travel, work, support requests, cameras and gates all remain active during one 300-second run. The wall clock moves from **18:00** to **00:00** (1.2 clock minutes per game-second). The alert level rises from 1 to 2 at 100 seconds, and to 3 at 200 seconds.

## Run and controls

Double-click `index.html` to play over `file://`, or serve this folder with `python3 -m http.server`. Each `dev/*.html` page loads one module and a panel that simulates the others. The panel can jump to alert levels, set state and spawn a creature.

| Input | Action |
|---|---|
| Mouse | Choose crew and objective; open a support request; operate controls |
| `1`, `2` | Select west or east camera, even during a minigame |
| `A`, `D` | Drop or raise the west or east gate, even during a minigame |
| Arrows, Space, Enter, mouse | Minigame controls; see each puzzle's hints |

URL options: `?speed=5` advances game time five times faster; `?god=1` prevents creature catches (and cockpit panes from breaking); `?finale=1` starts with the five crew objectives done so the cockpit can be tried at once; `?crew=1..4` changes the starting crew count. All game logic uses game-time `tick`, so speed affects crew and threats together.

## Play

Select an idle crew member on the Escape Board, then an available objective. Each trip has travel, work and one or two obstacles. At an obstacle, the crew member asks for support. Click **HELP** and solve the matching minigame before its timer expires. The first time each minigame appears in a run, a tips window opens and **the whole run is paused** (the director sends no ticks, and the gate and camera keys are ignored) until the player presses Enter or Space. Other crew continue working and other requests keep losing patience while you solve it. Every crew member has **2 HP**. A failed or ignored request costs 1 HP and sends that crew member back to rest for **two clock hours** (100 game-seconds): they cannot be sent out until the board shows READY again, and the objective keeps its progress and can be resumed by anyone. A second failure kills. While they are out in the plant, crew sometimes radio in something unsettling (a sound, a door that is not on the map); these are only flavour. Every new intercom line makes a sound, flashes the new line and lights a NEW MESSAGE tag in the terminal title. Fuel Cell adds 25 power to the pool when it is finished; Purge coolant loop grants a battery (drain ×0.85). Prime the ignition is not a trip: once the other five are done the crew are aboard the ship, the board row turns amber, and clicking it starts the **cockpit finale**.

**Cockpit finale** (`modules/cockpit/`): the run clock stops and the whole screen becomes the ship's cockpit. No cameras, no crew, no warnings. The power is out, and the only light is a flashlight that follows the mouse (arrows and Space also work). A control can only be used while the beam is on it. Set the five controls on the panel (BATT, PUMP, COOL, ARM, THR) in the order printed on the launch card (different each run; ARM has a guard cover to lift first, THR is a lever that needs two clicks), then hold the PRIME button in the light for 1.5 seconds. Touching a live control out of turn dumps every switch back and calls another creature; the rest of the panel is decoys. Creatures (walker, crawler, brute, stalker) walk up to the windscreen in the dark, press on the glass and pound it. Shine the beam on one for about half a second and it screams and leaves. Every blow adds permanent cracks; a pane at full damage breaks and the run ends (BREACH). Blows also make the beam flicker. The three panes have 1 damage each; a walker hits for 0.05, crawler 0.03, brute 0.12, stalker 0.06, and spawn gaps run from about 6 s down to 3.4 s with up to three at once after 35 s. Not human-playtested; a scripted player taking 4 to 6 s per control wins most runs.

**Win:** complete the five crew objectives, board the ship and prime the ignition in the cockpit (the checklist must be finished by 00:00; the clock is frozen once you board). A win plays a pixel-art launch (countdown, liftoff from the Moon, the plant melting down behind the ship, the turn toward Earth) and then the credits; Enter, Space, Escape or SKIP jumps ahead. **Lose:** a creature enters, all crew die, 00:00 arrives before the checklist is complete, or a cockpit pane breaks.

The first creature appears at about 28 seconds. Level 1 has only walkers and one threat at a time. Crawler and brute join at level 2; stalker joins at level 3. A second threat can overlap at level 3 only occasionally. Watch the feed, radiation sensor, gate lamps, camera tabs and KNOCKING banner. A closed gate must hold a threat long enough to make it leave.

| Creature | Tell | Counter |
|---|---|---|
| Walker | Stooped humanoid with long arms; slow footsteps and a groan; motion signal | Close its hall gate until it leaves |
| Crawler | Low six-legged shape with red eyes that skitters in bursts; clicking claws; LOW MOTION signal, usually east | React quickly; a brief seal repels it |
| Brute | Hulking shape with amber eyes; heavy footfalls, a growl, HEAVY IMPACT and a shaking gate, usually west | Keep the gate sealed for 5 seconds |
| Stalker | Tall thin figure seen only in glitches with colour ghosting; whispers and a faint wail; static, flickering lamps and SIGNAL GHOST on the sensor | Trust the sensor and seal its hall |

Each hall has a portcullis gate that drops over the whole camera picture; the bars are thin, so a creature behind it can still be seen in the gaps, shaking the gate or leaving marks. Both gates behave the same: 0.5 seconds to come down (it protects only once it is all the way down), 0.45 seconds to rise, 2.5 power/s while down. The halls differ only in looks: the west hall is a clean ribbed spine with pipes and a hazard line, the east hall is a darker, wet service tunnel with cables, a side alcove, a drain and a dead lamp, and its feed is noisier. Power is one pool for the whole run. Base drain is 0.18/s, each battery multiplies drain by 0.85, and both gates open add 0.32/s recharge. At zero power, cameras fail and gates open for 8 seconds; creatures move 1.6 times faster. Power returns at 20.

## Tuning

| Value | Alert 1 | Alert 2 | Alert 3 |
|---|---:|---:|---:|
| Crew HP | 2 | 2 | 2 |
| Request patience | 45 s | 40 s | 35 s |
| Minigame limit | 17.5 s | 15.4 s | 14 s |
| Creature movement multiplier | 1.15 | 1.00 | 0.90 |
| Creature grace multiplier | 1.00 | 0.92 | 0.84 |

Creature base move ranges in seconds: walker 10–13, crawler 5.5–7, brute 12–15, stalker 8–11. Base grace windows: 5.4, 4.2, 6.0 and 5.0 seconds respectively. A walker holds against a closed gate for 2.5 seconds, crawler 1.4, brute 5, stalker 3. The first appearance is at 28 seconds; subsequent spawn gaps are 36–46 / 28–36 / 26–34 seconds by alert level.

Objective travel and work segments are in `core/config.js`. Their aggregate crew time is about 302 seconds of crew walking and working before support puzzles or injury (an objective with N stages has N+1 work segments plus the trip), spread over four crew in a 300-second run. This is a schedule number only; human puzzle times and a full playthrough have not been measured. The minigame time limits and the work in `shield` and `flow` were cut to 70% of their earlier values.

| Objective | Stages | Minigame |
|---|---:|---|
| Nav Core | 2 | `shield`, difficulty 1 / 2 (4 / 5 / 6 bounces needed at difficulty 1 / 2 / 3) |
| Fuel Cell | 2 | `pipes`, difficulty 1 / 2 |
| Thruster Coupler | 2 | `mash`, difficulty 1 / 2 |
| Purge coolant loop | 2 | `flow`: leaking tubes, pump each into the green band (hold 0.55 / 0.7 / 0.85 s), difficulty 1 / 2 |
| Reroute hangar power | 1 | `blocks`, rows 1, garbage 2 |
| Prime the ignition | finale | not a minigame: the cockpit (`modules/cockpit/`). `switches` is no longer used in a run; `dev/minigames.html` still loads it |

## Architecture and contract

Classic scripts attach to `window.CF`. `core/bus.js` provides `CF.bus`, `CF.state` and `CF.register`. `core/config.js` stores the schedule, objectives and support tuning. `core/director.js` sends ticks and decides endings. `core/shell.js` mounts registered modules into `cameras`, `tasks`, `board`, `controls`, `fx`, `hud` and `ending` slots. `modules/cockpit/` and `modules/ending/` are registered modules without a slot (the cockpit sits over the control room and under the CRT layer; the ending over everything). When the ending is loaded it sets `CF.cinematic`, and the shell then leaves the win screen to it. `core/devkit.js` replaces the director on standalone dev pages. The atmosphere module draws a faint CRT look over the whole stage (scanlines, vignette, a slow roll bar and sparse TV snow that gets stronger with the alert level). The radiation trefoil in the top-left of the HUD marks the reactor and pulses faster, turning red, as the alert rises. Each module owns its own UI; communication uses state or bus events.

| State key | Meaning | Writer |
|---|---|---|
| `phase` | `boot`, `intro`, `play`, `finale` (in the cockpit; the run clock is frozen), `win`, `lose` | Core |
| `day` | Internal alert level 1–3, also passed as `opts.day` to minigames | Core |
| `clock`, `timeLeft`, `phaseTimeLeft` | Wall-clock minutes and remaining game-seconds | Core |
| `team` | Crew `{id,name,color,hp,status,at,timer}`; status `idle/travel/work/stuck/injured/dead`; for `injured`, `timer` is the game-seconds of rest left | Tasks |
| `objectives` | Checklist `{id,name,kind,place,requires,stagesTotal,progress,done,by,locked}` | Tasks |
| `power` | Continuous 0–100 pool | Cameras |
| `battery` | Battery count; each reduces drain by 15% | Tasks |
| `paused` | True while a minigame tip is open: no ticks are sent and the camera and gate keys are ignored | Tasks |

| Event | Payload | Purpose |
|---|---|---|
| `game:start`, `intro:done` | none | Start and dismiss briefing |
| `phase:change` | `{phase,day,duration?,reason?}` | Enter play or an ending |
| `tick` | `{dt,phase,day,t,phaseTimeLeft,clock}` | Advance all gameplay; `t` is elapsed run time |
| `dispatch:request` | `{crew,objective}` | Board asks Tasks to start a trip |
| `finale:request` | none | Board asks Core to enter the cockpit once the other objectives are done |
| `finale:done`, `finale:failed` | none | Cockpit won (Tasks marks the last objective and asks for the launch) or a pane broke (Core loses with reason `glass`) |
| `launch:request` | none | Board asks Core to win if checklist is done |
| `team:dispatched`, `team:hurt`, `team:died` | Crew and objective IDs as applicable | Crew status notifications |
| `objective:done` | `{id,kind}` | Checklist progress notification |
| `support:done`, `support:failed` | `{crew,objective}` | Support result |
| `creature:threat` | `{level,side,kind,threats}` | Proximity, intercom and effects; each threat has `{kind,side,level}` |
| `creature:blackout` | none | Power failed |
| `creature:caught` | `{by,side}` | Core ends the run |
| `dev:spawn` | `{kind}` | Dev panel asks Cameras to spawn a threat |
| `intercom:say` | `{who,text,static?}` | Show a crew or system line |
| `creature:step` | `{kind,side,stage,again}` | A creature spawned, moved closer (stage 1 far, 2 near, 3 at the gate) or `again` repeats at the door; Atmosphere plays its sound, panned to the hall |
| `creature:leave` | `{kind,side}` | A creature gave up at a sealed gate |
| `power:gain` | `{amount,by}` | Tasks asks Cameras to add power to the pool (Fuel Cell: +25) |
| `game:pause` | `{paused}` | A modal tip opened or closed; `paused` state also set |
| `sfx`, `fx:flash` | Sound name (or `{name,pan,vol}`) or CSS color | Sound and screen flash |

Minigames register `CF.minigames[id] = { id, title, tips, start(el, done, opts) }`; `tips` is `{ goal, keys: [..], hint }` and is shown in the pause window the first time that minigame appears in a run. `start` returns `{ cancel() }`. Call `done(true)` on success. Tasks owns the time limit and falls back to the first registered minigame if a stage ID is unavailable. `opts` always includes `day` and `difficulty`. Minigames use arrows, Space, Enter and mouse; `1`, `2`, `A`, `D` are reserved globally.
