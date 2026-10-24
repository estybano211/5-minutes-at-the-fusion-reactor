# COLD FISSION: team guide / 团队指南

You are alone in the control room of a nuclear plant. It is already leaking and will melt down completely at **01:00**. Your crew can fetch what the escape ship needs, but only if you talk them through every locked door. 8-minute run. Plain HTML + JavaScript, **no build step, no install**.
你被困在核电站的控制室里。电站已经泄漏，会在 **01:00** 彻底融毁。队友可以去取逃生飞船需要的东西，但每扇锁住的门都要你远程帮他们打开。一局 8 分钟，纯 HTML + JavaScript，不用安装、不用编译。

## Run it / 运行

| What | How |
|---|---|
| Whole game | Double-click `index.html` (or `python3 -m http.server` and open `localhost:8000`) |
| One module alone | Open `dev/cameras.html`, `dev/tasks.html`, `dev/board.html` or `dev/atmosphere.html` |
| Fast test | Add `?speed=5` to the URL (clock runs 5x faster) |
| Cannot be caught | Add `?god=1` |
| Fewer crew | Add `?crew=2` (start with only 2 crew; try `?crew=1` to see it is unwinnable) |

Dev pages load **core + your module only**. The dev panel (bottom right, click its title to collapse) jumps between phases and **pretends to be every module that is not loaded**: on `dev/board.html` it plays the support engine, on `dev/tasks.html` it plays the board, and so on. You never wait for the real game to reach your part.
开发页只加载「核心 + 你的模块」。右下角的开发面板可以跳转阶段，并且**会模拟没有加载的其他模块**，不用等游戏跑到你的部分。

## The game / 玩法

The whole game is `CF.config.schedule` in `core/config.js`: 480 seconds = 8 real minutes. A wall clock runs from **15:43 to 01:00** across it (about 1.16 game-minutes per real second). On screen the phases are **SHIFT** and **LOCKDOWN**; in code they are `day` and `night`. Never write "day" or "night" in text the player sees.

`shift 1 (90 s) → lockdown 1 (50 s) → shift 2 (90 s) → lockdown 2 (60 s) → shift 3 (90 s) → lockdown 3 (100 s)`

- **Shift:** the player picks a crew member on the Escape Board, then an objective. The crew member walks there, works, and gets **stuck at every obstacle**. A request appears on the Support Terminal. The player clicks HELP and plays a **mini Tetris** (clear the target rows before the timer ends). Success: the crew member carries on. Fail or ignore it: they lose 1 HP, and at 0 HP they **die**.
- **Lockdown:** the crew takes cover (everything pauses). The player defends the control room: watch the two hall cameras, close the right shutter when the creature reaches a door, manage power, use flares.
- **Checklist (6):** Nav Core, Fuel Cell, Thruster Coupler (items); Purge coolant loop, Reroute hangar power, Prime the ignition (operations; ignition needs Fuel Cell and the power reroute first). Some trips bring back a spare flare or battery.
- **Win:** every objective done, then press LAUNCH. **You can launch early**, any time. If the checklist is complete at 01:00 you launch anyway.
- **Lose:** the creature gets in; or 01:00 arrives with the checklist unfinished (MELTDOWN); or every crew member is dead (ABANDONED).

**Balance (all numbers live in `core/config.js` and the top of each module).** A scripted player that solves each puzzle in 8 s finishes with 4 or 3 crew around 19:30 (end of shift 2), with 2 crew around 20:00 to 21:50 (shift 3, tight), and cannot finish with 1 crew. With a quarter of attempts failing, 4 crew either win late (about 22:00) or run out of time; with half failing, most of the crew dies. That is the intended shape: enough time if things go well, not enough if several crew are lost.

## Who owns what / 分工

| Person | Folders | Owns |
|---|---|---|
| **A: Core** | `core/`, `index.html` | Layout and HUD, clock, phases, win/lose, start / intro / end screens, the contract, integration |
| **B: Night** | `modules/cameras/` | Two hall cameras, shutters, flare, power, the creature (no model: silhouette, sound, sensor) |
| **C: Crew and Support** | `modules/tasks/` | The crew simulation (trips, HP, death), support requests, intercom, the Tetris minigame (`minigames/`) |
| **D: Board and Atmosphere** | `modules/board/`, `modules/atmosphere/` | The Escape Board (crew list, checklist, dispatch, LAUNCH), all sound, CRT look, alert lights, ending text |

Each part has a `BRIEF.md` in its folder with the job, the contract and a to-do list.

**The one rule: only edit your own folders.** Need something from another part? Agree an event or a state key, do not reach into their files. The only exception: when you add a NEW file, you may add its one `<script>` or `<link>` line to `index.html` and your own dev page.
**唯一的规则：只改自己的文件夹。** 需要别人的东西，就约定一个事件或状态，不要直接改别人的文件。新增文件时可以在 `index.html` 和自己的开发页里加那一行 `<script>` / `<link>`。

**Everything the player can see must be in English.** The Chinese in this README is only for the team.
**游戏里玩家能看到的所有文字都必须是英文。**

## Working with an AI assistant / 用 AI 写代码

The project contains `CLAUDE.md` and `AGENTS.md`. AI coding tools read them automatically (Claude Code reads `CLAUDE.md`; Codex, Cursor and others read `AGENTS.md`). They tell the AI which folders it may touch, the English-only rule, and the checks to run before it says "done".

**Start your first message to the AI with the line for your part** (copy it exactly, then replace the last sentence):
**第一条消息直接复制自己那一部分的话，最后一句换成你今天要做的事：**

> **Part A (Core):** I am Part A (Core) on Cold Fission. Read CLAUDE.md, README.md and core/BRIEF.md first, and only edit the files Part A owns. All player-facing text must be in English. Today I want to: ...

> **Part B (Night):** I am Part B (Night) on Cold Fission. Read CLAUDE.md, README.md and modules/cameras/BRIEF.md first, and only edit modules/cameras/ and dev/cameras.html. All player-facing text must be in English. Today I want to: ...

> **Part C (Crew and Support):** I am Part C (Crew and Support) on Cold Fission. Read CLAUDE.md, README.md and modules/tasks/BRIEF.md first, and only edit modules/tasks/ and dev/tasks.html. All player-facing text must be in English. Today I want to: ...

> **Part D (Board and Atmosphere):** I am Part D (Board and Atmosphere) on Cold Fission. Read CLAUDE.md, README.md, modules/board/BRIEF.md and modules/atmosphere/BRIEF.md first, and only edit modules/board/, modules/atmosphere/, dev/board.html and dev/atmosphere.html. All player-facing text must be in English. Today I want to: ...

If the AI says it needs something from another part, do not let it edit that part. Ask the other person, agree an event name, and let Person A add it to the tables below.
如果 AI 说需要别人那部分的东西，不要让它去改别人的文件。去问对方，约好事件名，让 A 把它写进下面的表格。

## Module contract / 模块约定

A module is one file that calls `CF.register` and builds its UI inside the slots it asks for:

```js
CF.register({ id: 'mything', slots: ['cameras'], mount(slots) { slots.cameras.innerHTML = '...'; } });
```

| Slot | Where it is | Used by |
|---|---|---|
| `cameras` | Left screen | B |
| `tasks` | Middle screen (Support Terminal) | C |
| `board` | Right screen (Escape Board) | D |
| `controls` | Bottom bar | B |
| `fx` | Full-screen overlay (clicks pass through) | D |
| `hud` | Small spot next to the phase label | D |
| `ending` | Text area on the win/lose screen | D |

If a module throws while mounting, the shell logs it and the rest of the game still runs.

### Shared state (`CF.state.get / set / add`)

Every key has one owner. Do not write a key you do not own.

| Key | Meaning | Written by |
|---|---|---|
| `phase` | `boot intro day night win lose` | Core only |
| `day` | 1 to 3 (the shift or lockdown number) | Core only |
| `clock` | Wall clock in minutes since midnight (943 = 15:43, 1500 = 01:00). Format with `CF.config.fmtClock(v)` | Core only |
| `timeLeft` | Game-seconds until the clock reaches 01:00 | Core only |
| `team` | Array of crew records `{id, name, color, hp, status, at, cover, timer}`. `status` is `idle travel work stuck dead`; `cover` is true during a lockdown | **C only** |
| `objectives` | Array of checklist records `{id, name, kind, place, requires, stagesTotal, progress 0..1, done, by, locked}` | **C only** |
| `power` | 0 to 100, used during a lockdown | B only |
| `flares` | Flares owned | C adds (a trip found one), B subtracts (one was used) |
| `battery` | Batteries found; each cuts power drain by 15% | C adds, B reads |

Listen with `CF.bus.on('state:team', v => ...)`. Definitions of the crew and objectives (names, places, times, obstacles) are in `core/config.js`.

### Events (`CF.bus.emit / on`)

| Event | Payload | Sent by | Used by |
|---|---|---|---|
| `game:start`, `intro:done` | | Core (buttons) | Core, D (starts audio) |
| `phase:change` | `{phase, day, duration, reason?}` | Core | everyone |
| `tick` | `{dt, phase, day, t, phaseTimeLeft, clock}` (10x/s) | Core | B, C, D |
| `dispatch:request` | `{crew, objective}` | D (board) | C starts the trip |
| `launch:request` | | D (board) | Core wins if everything is done |
| `team:dispatched` | `{crew, objective}` | C | anyone |
| `team:hurt` | `{id}` | C | anyone |
| `team:died` | `{id, name}` | C | Core (ends the game if nobody is left) |
| `objective:done` | `{id, kind}` | C | anyone |
| `support:done`, `support:failed` | `{crew, objective}` | C | anyone |
| `night:threat` | `{level 0..3, side}` | B | D (Geiger ticks) |
| `night:blackout` | | B | D |
| `night:caught` | `{by, side}` | B | Core ends the game |
| `intercom:say` | `{who, text, static?}` (`who` is a crew id or `'sys'`) | anyone | C shows it |
| `sfx` | `'click' 'beep' 'ok' 'deny' 'chime' 'knock' 'shutter' 'flare' 'powerdown' 'geiger' 'static' 'alarm' 'scare' 'win' 'lose' 'death'` | anyone | D plays it |
| `fx:flash` | CSS colour | anyone | D shows it |

**Game logic uses `tick` (game time), not `setTimeout`**, so `?speed=` and the dev kit keep working. Use `requestAnimationFrame` only for drawing. (A minigame may use real time for its own animation, because the support timer around it is on `tick`.)
**游戏逻辑用 `tick`（游戏时间），不要用 `setTimeout`。** 只有画面绘制用 `requestAnimationFrame`。

## Putting it together / 合并

Nothing to merge by hand. `index.html` already loads every module. Each module's CSS classes start with its own prefix (`cam-`, `ctl-`, `tk-`, `bk-`, `bd-`, `fx-`) so styles cannot collide.

**Integration check before you hand in (everyone):**
1. Your `dev/` page runs with no red errors in the browser console.
2. `index.html?speed=5&god=1` plays from the start screen to an end screen.
3. `index.html` without `god` still ends in a loss when you do nothing during a lockdown.

## Ideas for each person / 可以继续做的

- **A:** a pause key, remember the best run in `localStorage`, a "how to play" panel on the start screen, a second ending.
- **B:** replace the canvas shapes with pixel sprites, a second creature in lockdown 3, a vent camera.
- **C:** more minigame variants (different pieces, a target shape to fill), crew personalities and better intercom lines, a "recall" action, a harder shift 3.
- **D:** pixel portraits and icons on the board, real sound files, a heartbeat, better ending text, a short opening with the Company logo.

Not in this version (cut on purpose to fit 8 minutes): the alien-entity twist as a full level. The radio line on the win screen is the hint of it.
