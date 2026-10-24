# 8 Minutes at Fusion Reactor

A browser game set in a leaking fusion reactor on the dark side of the Moon. You direct a four-person crew through six escape-ship objectives while defending the control room. Crew travel, work, support requests, cameras and shutters all remain active during one 480-second run. The wall clock moves from **15:43** to **01:00**. The alert level rises from 1 to 2 at 160 seconds, and to 3 at 320 seconds.

## Run and controls

Double-click `index.html` to play over `file://`, or serve this folder with `python3 -m http.server`. Each `dev/*.html` page loads one module and a panel that simulates the others. The panel can jump to alert levels, set state and spawn a creature.

| Input | Action |
|---|---|
| Mouse | Choose crew and objective; open a support request; operate controls |
| `1`, `2` | Select west or east camera, even during a minigame |
| `A`, `D` | Toggle west or east shutter, even during a minigame |
| Arrows, Space, Enter, mouse | Minigame controls; see each puzzle's hints |

URL options: `?speed=5` advances game time five times faster; `?god=1` prevents creature catches; `?crew=1..4` changes the starting crew count. All game logic uses game-time `tick`, so speed affects crew and threats together.

## Play

Select an idle crew member on the Escape Board, then an available objective. Each trip has travel, work and one or two obstacles. At an obstacle, the crew member asks for support. Click **HELP** and solve the matching minigame before its timer expires. The first time each minigame appears in a run, a tips window opens and **the whole run is paused** (the director sends no ticks, and the shutter and camera keys are ignored) until the player presses Enter or Space. Other crew continue working and other requests keep losing patience while you solve it. A failed or ignored request costs 1 HP and resets that request; completed objective progress remains. At 0 HP the crew member dies. Fuel Cell adds 25 power to the pool when it is finished; Purge coolant loop grants a battery (drain ×0.85). Prime the ignition requires Fuel Cell and Reroute hangar power.

**Win:** complete all six objectives and press LAUNCH at any time, or finish the checklist by 01:00. **Lose:** a creature enters, all crew die, or 01:00 arrives before the checklist is complete.

The first creature appears at about 45 seconds. Level 1 has only walkers and one threat at a time. Crawler and brute join at level 2; stalker joins at level 3. A second threat can overlap at level 3 only occasionally. Watch the feed, radiation sensor, door lamps, camera tabs and KNOCKING banner. A closed shutter must hold a threat long enough to make it leave.

| Creature | Tell | Counter |
|---|---|---|
| Walker | Stooped humanoid with long arms; slow footsteps and a groan; motion signal | Close its hall shutter until it leaves |
| Crawler | Low six-legged shape with red eyes that skitters in bursts; clicking claws; LOW MOTION signal, usually east | React quickly; a brief seal repels it |
| Brute | Hulking shape with amber eyes; heavy footfalls, a growl, HEAVY IMPACT and a shaking door, usually west | Keep the shutter sealed for 5 seconds |
| Stalker | Tall thin figure seen only in glitches with colour ghosting; whispers and a faint wail; static, flickering lamps and SIGNAL GHOST on the sensor | Trust the sensor and seal its hall |

West is heavy: immediate protection, 3.2 power/s while closed, and a 0.7-second latch before reopening. Its feed is clear. East is light: 1.8 power/s, but its shutter takes 0.8 seconds to protect you; its feed is darker and noisier. The control buttons show these differences. Power is one pool for the whole run. Base drain is 0.18/s, each battery multiplies drain by 0.85, and both shutters open add 0.32/s recharge. At zero power, cameras fail and shutters open for 8 seconds; creatures move 1.6 times faster. Power returns at 20.

## Tuning

| Value | Alert 1 | Alert 2 | Alert 3 |
|---|---:|---:|---:|
| Crew HP | 3 | 3 | 3 |
| Request patience | 45 s | 40 s | 35 s |
| Minigame limit | 25 s | 22 s | 20 s |
| Creature movement multiplier | 1.15 | 1.00 | 0.90 |
| Creature grace multiplier | 1.00 | 0.92 | 0.84 |

Creature base move ranges in seconds: walker 10–13, crawler 5.5–7, brute 12–15, stalker 8–11. Base grace windows: 5.4, 4.2, 6.0 and 5.0 seconds respectively. A walker holds against a closed shutter for 2.5 seconds, crawler 1.4, brute 5, stalker 3. The first appearance is at 45 seconds; subsequent spawn gaps are 55–70 / 43–55 / 40–52 seconds by alert level.

Objective travel and work segments are in `core/config.js`. Their aggregate crew time is about 302 seconds before support puzzles or injury (an objective with N stages has N+1 work segments plus the trip). This is a schedule number only; human puzzle times and a full playthrough have not been measured.

| Objective | Stages | Minigame |
|---|---:|---|
| Nav Core | 2 | `shield`, difficulty 1 / 2 |
| Fuel Cell | 2 | `pipes`, difficulty 1 / 2 |
| Thruster Coupler | 2 | `mash`, difficulty 1 / 2 |
| Purge coolant loop | 2 | `flow`: leaking tubes, pump each into the green band, difficulty 1 / 2 |
| Reroute hangar power | 1 | `blocks`, rows 1, garbage 2 |
| Prime the ignition | 2 | `switches`, difficulty 2 / 3 |

## Architecture and contract

Classic scripts attach to `window.CF`. `core/bus.js` provides `CF.bus`, `CF.state` and `CF.register`. `core/config.js` stores the schedule, objectives and support tuning. `core/director.js` sends ticks and decides endings. `core/shell.js` mounts registered modules into `cameras`, `tasks`, `board`, `controls`, `fx`, `hud` and `ending` slots. `core/devkit.js` replaces the director on standalone dev pages. Each module owns its own UI; communication uses state or bus events.

| State key | Meaning | Writer |
|---|---|---|
| `phase` | `boot`, `intro`, `play`, `win`, `lose` | Core |
| `day` | Internal alert level 1–3, also passed as `opts.day` to minigames | Core |
| `clock`, `timeLeft`, `phaseTimeLeft` | Wall-clock minutes and remaining game-seconds | Core |
| `team` | Crew `{id,name,color,hp,status,at,timer}`; status `idle/travel/work/stuck/dead` | Tasks |
| `objectives` | Checklist `{id,name,kind,place,requires,stagesTotal,progress,done,by,locked}` | Tasks |
| `power` | Continuous 0–100 pool | Cameras |
| `battery` | Battery count; each reduces drain by 15% | Tasks |
| `paused` | True while a minigame tip is open: no ticks are sent and the camera and shutter keys are ignored | Tasks |

| Event | Payload | Purpose |
|---|---|---|
| `game:start`, `intro:done` | none | Start and dismiss briefing |
| `phase:change` | `{phase,day,duration?,reason?}` | Enter play or an ending |
| `tick` | `{dt,phase,day,t,phaseTimeLeft,clock}` | Advance all gameplay; `t` is elapsed run time |
| `dispatch:request` | `{crew,objective}` | Board asks Tasks to start a trip |
| `launch:request` | none | Board asks Core to win if checklist is done |
| `team:dispatched`, `team:hurt`, `team:died` | Crew and objective IDs as applicable | Crew status notifications |
| `objective:done` | `{id,kind}` | Checklist progress notification |
| `support:done`, `support:failed` | `{crew,objective}` | Support result |
| `creature:threat` | `{level,side,kind,threats}` | Proximity, intercom and effects; each threat has `{kind,side,level}` |
| `creature:blackout` | none | Power failed |
| `creature:caught` | `{by,side}` | Core ends the run |
| `dev:spawn` | `{kind}` | Dev panel asks Cameras to spawn a threat |
| `intercom:say` | `{who,text,static?}` | Show a crew or system line |
| `creature:step` | `{kind,side,stage,again}` | A creature spawned, moved closer (stage 1 far, 2 near, 3 at the shutter) or `again` repeats at the door; Atmosphere plays its sound, panned to the hall |
| `creature:leave` | `{kind,side}` | A creature gave up at a sealed shutter |
| `power:gain` | `{amount,by}` | Tasks asks Cameras to add power to the pool (Fuel Cell: +25) |
| `game:pause` | `{paused}` | A modal tip opened or closed; `paused` state also set |
| `sfx`, `fx:flash` | Sound name or CSS color | Sound and screen flash |

Minigames register `CF.minigames[id] = { id, title, tips, start(el, done, opts) }`; `tips` is `{ goal, keys: [..], hint }` and is shown in the pause window the first time that minigame appears in a run. `start` returns `{ cancel() }`. Call `done(true)` on success. Tasks owns the time limit and falls back to the first registered minigame if a stage ID is unavailable. `opts` always includes `day` and `difficulty`. Minigames use arrows, Space, Enter and mouse; `1`, `2`, `A`, `D` are reserved globally.
