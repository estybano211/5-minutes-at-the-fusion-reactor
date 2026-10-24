/* Two hall feeds, four silhouette threats, shutters and the continuous power pool. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus;
  const W = 220, H = 130;
  const DOORS = {
    L: { name: 'WEST', drain: 3.2, seal: 0, open: 0.55, latch: 0.7, hint: 'HEAVY · SEALS AT ONCE' },
    R: { name: 'EAST', drain: 1.8, seal: 0.8, open: 0.45, latch: 0, hint: 'LIGHT · 0.8s TO SEAL' },
  };
  const POWER = { base: 0.18, recharge: 0.32, blackout: 8, restart: 20, brutePound: 0.9 };
  const KINDS = {
    walker:  { name: 'WALKER', move: [10, 13], grace: 5.4, hold: 2.5, side: null, signal: 'MOTION' },
    crawler: { name: 'CRAWLER', move: [5.5, 7], grace: 4.2, hold: 1.4, side: 'R', signal: 'LOW MOTION' },
    brute:   { name: 'BRUTE', move: [12, 15], grace: 6.0, hold: 5, side: 'L', signal: 'HEAVY IMPACT' },
    stalker: { name: 'STALKER', move: [8, 11], grace: 5.0, hold: 3, side: null, signal: 'SIGNAL GHOST' },
  };
  const CAMS = [{ label: 'CAM 1 · WEST HALL', short: 'WEST HALL', side: 'L' },
                { label: 'CAM 2 · EAST HALL', short: 'EAST HALL', side: 'R' }];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let root, ctl, g, ui = {};
  let cam = 0, active = false, blackout = 0, drawAt = 0, switchFx = 0;
  let doors = { L: { closed: false, progress: 0, age: 0 }, R: { closed: false, progress: 0, age: 0 } };
  let monsters = [], nextSpawn = 45, overlapAt = Infinity, runTime = 0, drain = 0, restartExtra = 0, paintKey = '', threatKey = '';

  const sealed = (side) => !blackout && doors[side].closed && (side === 'L' || doors[side].progress >= 1);
  const nearby = (side) => monsters.filter((m) => m.side === side).sort((a, b) => b.stage - a.stage)[0];
  const knocking = (side) => monsters.some((m) => m.side === side && m.stage === 3 && !sealed(side));
  const level = () => Math.max(0, ...monsters.map((m) => m.stage));
  const stepEvent = (m, again) => bus.emit('creature:step', { kind: m.kind, side: m.side, stage: m.stage, again: !!again });

  function threat() {
    const threats = monsters.map((m) => ({ kind: m.kind, side: m.side, level: m.stage }));
    const key = JSON.stringify(threats);
    if (key === threatKey) return;
    threatKey = key;
    const m = monsters.slice().sort((a, b) => b.stage - a.stage)[0];
    bus.emit('creature:threat', { level: level(), side: m ? m.side : null, kind: m ? m.kind : null, threats: threats });
  }

  function reset() {
    active = true; blackout = 0; monsters = []; nextSpawn = 45; overlapAt = Infinity; runTime = 0; drain = 0; restartExtra = 0;
    doors = { L: { closed: false, progress: 0, age: 0 }, R: { closed: false, progress: 0, age: 0 } };
    S.set('power', 100);
    threat(); refresh();
  }

  function stop() {
    active = false; blackout = 0; monsters = []; drain = 0;
    doors.L.closed = doors.R.closed = false;
    threat(); refresh();
  }

  function toast(text) {
    if (!ui.toast) return;
    ui.toast.textContent = text;
    ui.toast.classList.remove('go'); void ui.toast.offsetWidth; ui.toast.classList.add('go');
  }

  function toggle(side) {
    if (!active || blackout || S.get('paused')) return;
    const d = doors[side], spec = DOORS[side];
    if (d.closed && d.age < spec.latch) { toast(spec.name + ' SHUTTER LATCHED'); bus.emit('sfx', 'deny'); return; }
    d.closed = !d.closed; d.age = 0;
    bus.emit('sfx', 'shutter');
    toast(spec.name + ' SHUTTER ' + (d.closed ? (side === 'L' ? 'SEALED' : 'CLOSING') : 'OPENING'));
    refresh();
  }

  function selectCam(i) {
    if (i === cam || S.get('paused')) return;
    cam = i; switchFx = 0.25;
    bus.emit('sfx', 'click'); refresh();
  }

  function spawn(kind, t, extra) {
    if (!KINDS[kind]) return;
    const p = KINDS[kind];
    let side = p.side || (Math.random() < 0.5 ? 'L' : 'R');
    if (monsters.some((m) => m.side === side)) side = side === 'L' ? 'R' : 'L';
    if (monsters.some((m) => m.side === side)) return;
    monsters.push({ kind: kind, side: side, stage: 1, timer: 0, held: 0, exposed: 0, seed: Math.random() * 10, snd: 0 });
    const m = monsters[monsters.length - 1];
    m.timer = moveTime(m, S.get('day'));
    stepEvent(m);
    if (!extra) {
      nextSpawn = t + (S.get('day') === 1 ? rand(55, 70) : S.get('day') === 2 ? rand(43, 55) : rand(40, 52));
      overlapAt = S.get('day') === 3 && Math.random() < 0.2 ? t + rand(12, 16) : Infinity;
    }
    threat(); refresh();
  }

  function moveTime(m, day) {
    const p = KINDS[m.kind], factor = day === 1 ? 1.15 : day === 2 ? 1 : 0.9;
    return rand(p.move[0], p.move[1]) * factor;
  }

  function pickKind(day) {
    const pool = day === 1 ? ['walker'] : day === 2 ? ['walker', 'walker', 'crawler', 'brute']
      : ['walker', 'crawler', 'brute', 'stalker', 'stalker'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function powerGain(e) {
    if (!active) return;
    if (blackout) restartExtra += e.amount;
    else S.set('power', clamp(S.get('power') + e.amount, 0, 100));
    toast('+' + e.amount + ' POWER' + (e.by ? ' · ' + e.by.toUpperCase() : ''));
    bus.emit('sfx', 'chime');
    paintDoors();
  }

  function powerOut() {
    blackout = POWER.blackout; drain = 0;
    ['L', 'R'].forEach((s) => { doors[s].closed = false; doors[s].progress = 0; });
    bus.emit('sfx', 'powerdown'); bus.emit('creature:blackout');
    toast('POWER FAILURE · SHUTTERS OPEN'); refresh();
  }

  function onTick(e) {
    if (e.phase !== 'play' || !active) return;
    const dt = e.dt, day = e.day;
    runTime = e.t;
    if (blackout) {
      blackout = Math.max(0, blackout - dt);
      if (!blackout) { S.set('power', Math.min(100, POWER.restart + restartExtra)); restartExtra = 0; toast('POWER RESTORED'); bus.emit('sfx', 'beep'); refresh(); }
    } else {
      ['L', 'R'].forEach((s) => {
        const d = doors[s], p = DOORS[s];
        d.age += dt;
        d.progress = clamp(d.progress + (d.closed ? dt / Math.max(0.3, p.seal) : -dt / p.open), 0, 1);
      });
      let d = POWER.base + (doors.L.closed ? DOORS.L.drain : 0) + (doors.R.closed ? DOORS.R.drain : 0);
      d += monsters.filter((m) => m.kind === 'brute' && m.stage === 3 && sealed(m.side)).length * POWER.brutePound;
      d *= Math.pow(0.85, S.get('battery'));
      if (!doors.L.closed && !doors.R.closed) d -= POWER.recharge;
      drain = d;
      const power = clamp(S.get('power') - d * dt, 0, 100);
      S.set('power', power);
      if (power <= 0) powerOut();
    }

    if (e.t >= nextSpawn) {
      if (monsters.length === 0) spawn(pickKind(day), e.t);
      else nextSpawn = e.t + (day === 3 ? 18 : 12);
    }
    if (e.t >= overlapAt) {
      overlapAt = Infinity;
      if (day === 3 && monsters.length === 1) spawn(pickKind(day), e.t, true);
    }
    monsters.slice().forEach((m) => {
      const spec = KINDS[m.kind];
      if (m.stage < 3) {
        m.timer -= dt * (blackout ? 1.6 : 1);
        if (m.timer <= 0) {
          m.stage++; m.timer = moveTime(m, day);
          if (m.stage === 3) { m.held = 0; m.exposed = 0; m.snd = 1.4; }
          stepEvent(m);
          threat(); refresh();
        }
      } else if (sealed(m.side)) {
        m.exposed = 0; m.held += dt;
        m.snd -= dt;
        if (m.snd <= 0) { m.snd = m.kind === 'brute' ? 1.1 : m.kind === 'crawler' ? 1.5 : 2.2; stepEvent(m, true); }
        if (m.held >= spec.hold) {
          monsters.splice(monsters.indexOf(m), 1);
          bus.emit('creature:leave', { kind: m.kind, side: m.side });
          threat(); refresh();
        }
      } else {
        m.held = 0; m.exposed += dt;
        m.snd -= dt;
        if (m.snd <= 0) { m.snd = m.kind === 'brute' ? 1.6 : 2.4; stepEvent(m, true); }
        const grace = spec.grace * (day === 1 ? 1 : day === 2 ? 0.92 : 0.84);
        if (m.exposed >= grace) {
          if (CF.config.god) { monsters.splice(monsters.indexOf(m), 1); threat(); refresh(); }
          else {
            active = false;
            bus.emit('sfx', 'scare'); bus.emit('fx:flash', '#ff2a2a');
            bus.emit('creature:caught', { by: m.kind, side: m.side });
          }
        }
      }
    });
    paintDoors();
  }

  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

  const TAU = Math.PI * 2;
  const limb = (pts, w) => { g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); };
  const blob = (cx, cy, rx, ry, rot) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); g.fill(); };

  /* Each figure is drawn in local units with its feet at (0,0), facing the camera, and returns where its eyes are.
     The shapes are drawn twice (a faint rim light, then the black body), so only the outline reads. */
  const FIGURES = {
    // Upright and faceless: a stooped head, a swaying torso and arms that hang past the knees.
    walker(t, s) {
      const sway = Math.sin(t * 2.1 + s) * 3, stride = Math.sin(t * 3.4 + s);
      limb([[-5, -34], [-6 + stride * 4, -17], [-5 + stride * 6, 0]], 6);
      limb([[5, -34], [6 - stride * 4, -17], [5 - stride * 6, 0]], 6);
      g.beginPath(); g.moveTo(-9, -34); g.lineTo(9, -34); g.lineTo(12 + sway * .3, -63); g.lineTo(-12 + sway * .3, -63); g.closePath(); g.fill();
      limb([[sway * .3, -62], [sway * .8 + 2, -68]], 5);
      blob(sway * .8 + 3, -72, 6, 7.5, .25);
      limb([[-11 + sway * .3, -60], [-16 + sway, -42], [-15 + sway * 1.5, -21]], 4.5);
      limb([[11 + sway * .3, -60], [16 + sway, -42], [15 + sway * 1.5, -21]], 4.5);
      return { eyes: [], color: '', top: -80 };
    },
    // Low and wide: six jointed legs, two forelegs and a cluster of red eyes.
    crawler(t, s) {
      const k = t * 11 + s;
      [-1, 1].forEach((d) => {
        for (let i = 0; i < 3; i++) {
          const ph = Math.sin(k + i * 2.1 + (d > 0 ? 1.6 : 0)) * 3;
          limb([[d * 9, -11], [d * (20 + i * 5), -27 + i * 2], [d * (30 + i * 6) + ph, 0]], 2.4);
        }
        limb([[d * 6, -9], [d * 12 + Math.sin(k * .8) * 2, -4], [d * 10, 1]], 3);
      });
      blob(0, -12, 14, 9);
      blob(0, -19, 6, 6);
      return { eyes: [[-3, -20], [3, -20], [-1.2, -23.5], [1.2, -23.5]], color: '#ff3b3b', top: -30 };
    },
    // Heavy: shoulders wider than it is tall, a head sunk between them and fists that almost reach the floor.
    brute(t, s) {
      const br = Math.sin(t * 1.5 + s) * 1.6, swing = Math.sin(t * 1.2 + s) * 3;
      limb([[-10, -32], [-11, -16], [-12, 0]], 11);
      limb([[10, -32], [11, -16], [12, 0]], 11);
      g.beginPath(); g.moveTo(-18, -30); g.lineTo(18, -30); g.lineTo(27, -62 + br); g.lineTo(-27, -62 + br); g.closePath(); g.fill();
      blob(0, -62 + br, 25, 10);
      blob(0, -69 + br, 8.5, 7.5);
      limb([[-25, -60 + br], [-36 + swing, -42], [-34 + swing, -20]], 11);
      limb([[25, -60 + br], [36 - swing, -42], [34 - swing, -20]], 11);
      blob(-34 + swing, -14, 8, 9); blob(34 - swing, -14, 8, 9);
      return { eyes: [[-3.5, -70 + br], [3.5, -70 + br]], color: '#e8a030', top: -78 };
    },
    // Too tall and too thin: a long neck, a tilted head and fingers that trail on the floor.
    stalker(t, s) {
      const sw = Math.sin(t * 1.3 + s) * 4, tilt = Math.sin(t * .9 + s) * .35;
      limb([[-3, -50], [-4, -25], [-3, 0]], 3);
      limb([[3, -50], [4, -25], [3, 0]], 3);
      g.beginPath(); g.moveTo(-5, -50); g.lineTo(5, -50); g.lineTo(6.5, -82); g.lineTo(-6.5, -82); g.closePath(); g.fill();
      limb([[0, -82], [sw * .5, -93]], 3);
      blob(sw * .5, -99, 4.2, 7.5, tilt);
      limb([[-6, -80], [-13 + sw, -52], [-11 + sw * 1.4, -14]], 2.4);
      limb([[6, -80], [13 + sw, -52], [11 + sw * 1.4, -14]], 2.4);
      [-1, 0, 1].forEach((f) => { limb([[-11 + sw * 1.4, -14], [-11 + sw * 1.4 + f * 2, -4]], 1.2); limb([[11 + sw * 1.4, -14], [11 + sw * 1.4 + f * 2, -4]], 1.2); });
      return { eyes: [[sw * .5 - 1.6, -100], [sw * .5 + 1.6, -100]], color: '#dff', top: -108 };
    },
  };
  const SIZE = { walker: 1, crawler: 1.15, brute: .92, stalker: .8 };

  function creature(m, t) {
    // Stage 1 stands at the far end of the hall, stage 2 near the shutter, stage 3 fills the doorway.
    const spot = m.stage === 1 ? { y: 61, s: .3, wob: 5 } : m.stage === 2 ? { y: 117, s: .86, wob: 14 } : { y: 142, s: 1.28, wob: 3 };
    const sc = spot.s * SIZE[m.kind] * (m.stage === 3 ? 1 + Math.sin(t * 4 + m.seed) * .02 : 1);
    let x = 110 + Math.sin(t * .55 + m.seed) * spot.wob;
    if (m.kind === 'crawler' && m.stage < 3) x += Math.sin(t * 19 + m.seed) * 1.6 * (Math.sin(t * 2.3 + m.seed) > 0 ? 1 : .2);   // skitters in bursts
    let alpha = m.stage === 1 ? .85 : 1;
    let ghost = 0;
    if (m.kind === 'stalker') {
      // Visible only in glitches: it fades in and out, and its image splits into colour ghosts.
      alpha = Math.max(0, Math.min(.85, Math.sin(t * 1.7 + m.seed) + Math.sin(t * 4.3) * .6 - .35 + (Math.random() < .05 ? .6 : 0)));
      ghost = 2.2;
      if (alpha <= 0) return;
    }
    g.save();
    g.translate(x, spot.y); g.scale(sc, sc);
    g.globalAlpha = .45 * alpha; g.fillStyle = '#000'; blob(0, 1, 27, 5);
    g.globalAlpha = alpha;
    let info;
    if (ghost) {
      g.save(); g.translate(-ghost, 0); g.fillStyle = g.strokeStyle = 'rgba(229,72,77,.55)'; FIGURES.stalker(t, m.seed); g.restore();
      g.save(); g.translate(ghost, 0); g.fillStyle = g.strokeStyle = 'rgba(111,183,176,.55)'; FIGURES.stalker(t, m.seed); g.restore();
    } else {
      g.save(); g.translate(-1.3 / sc, -1 / sc); g.fillStyle = g.strokeStyle = '#27504a'; FIGURES[m.kind](t, m.seed); g.restore();
    }
    g.fillStyle = g.strokeStyle = '#010303';
    info = FIGURES[m.kind](t, m.seed);
    g.fillStyle = info.color;
    const e = Math.max(1.6, 1.1 / sc);
    info.eyes.forEach((p) => g.fillRect(p[0] - e / 2, p[1] - e / 2, e, e));
    g.restore();
  }

  /* A creature behind a closed shutter shakes it and leaves marks. Returns the offset to draw the door with. */
  function pound(side, t) {
    const m = monsters.find((x) => x.side === side && x.stage === 3 && sealed(side));
    if (!m) return { x: 0, y: 0, m: null };
    const rate = { brute: 2.2, walker: 1.1, crawler: 6, stalker: 0 }[m.kind], amp = { brute: 2.4, walker: 1.2, crawler: .6, stalker: 0 }[m.kind];
    const hit = rate ? Math.pow(Math.max(0, Math.sin(t * rate * TAU + m.seed)), 8) * amp : 0;
    return { x: hit * (Math.random() < .5 ? -1 : 1), y: hit * .5, m: m };
  }

  function marks(m, t) {
    g.save();
    if (m.kind === 'crawler') {
      g.strokeStyle = 'rgba(190,215,210,.45)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { const x = 78 + i * 14 + (m.seed * 7 | 0) % 6; line(x, 50 + i * 3, x + 8, 82 + i * 5); }
    } else if (m.kind === 'brute') {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(86, 58, 48, 34);
      g.strokeStyle = 'rgba(190,215,210,.4)'; g.lineWidth = 1;
      line(110, 60, 100, 78); line(100, 78, 108, 90); line(110, 60, 124, 74);
    } else if (m.kind === 'walker') {
      g.fillStyle = 'rgba(0,0,0,.4)'; blob(96, 76, 5, 8); blob(124, 70, 5, 8);
    }
    g.restore();
  }

  function drawHall(side, t) {
    g.fillStyle = '#08100f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0f1d1b'; poly([[0, H], [W, H], [130, 62], [90, 62]]);
    g.fillStyle = '#0c1615'; poly([[0, 0], [90, 40], [90, 62], [0, H]]); poly([[W, 0], [130, 40], [130, 62], [W, H]]);
    g.fillStyle = '#1a2f2c'; g.fillRect(90, 40, 40, 22);
    g.strokeStyle = '#27403c'; g.lineWidth = 1;
    line(0, 0, 90, 40); line(W, 0, 130, 40); line(0, H, 90, 62); line(W, H, 130, 62);
    const close = monsters.filter((m) => m.side === side), flick = close.some((m) => m.kind === 'stalker' || (m.stage >= 2 && Math.random() < (m.stage === 3 ? .3 : .12))) && Math.random() < .5;
    [[4, 30], [14, 20], [24, 12]].forEach((l) => {
      g.fillStyle = flick ? '#102421' : '#3d7a70'; g.fillRect(110 - l[1] / 2, l[0], l[1], 3);
    });
    monsters.filter((m) => m.side === side).forEach((m) => {
      creature(m, t);
      if (m.stage === 3 && m.kind !== 'stalker') { g.fillStyle = 'rgba(111,183,176,.35)'; for (let i = 0; i < 3; i++) g.fillRect(0, Math.random() * H | 0, W, 1); }
    });
    if (side === 'R') { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, W, H); noise(80); }
  }

  function drawDoor(side, t) {
    const p = doors[side].progress, ease = p * p * (3 - 2 * p), moving = p > 0 && p < 1;
    const x1 = 56, x2 = 164, jamb = 6, top = 26;
    g.fillStyle = '#1b2a28';
    g.fillRect(x1, 16, x2 - x1, top - 16); g.fillRect(x1, 16, jamb, H - 16); g.fillRect(x2 - jamb, 16, jamb, H - 16);
    for (let y = top; y < H; y += 8) { g.fillStyle = (y / 8) % 2 ? '#a07e2a' : '#161c1b'; g.fillRect(x1, y, jamb, 4); g.fillRect(x2 - jamb, y, jamb, 4); }
    const depth = Math.round((H - top) * ease);
    for (let y = top; y < top + depth; y += 6) {
      g.fillStyle = '#2d4541'; g.fillRect(x1 + jamb, y, x2 - x1 - 2 * jamb, Math.min(5, top + depth - y));
      g.fillStyle = '#4a6b65'; g.fillRect(x1 + jamb, y, x2 - x1 - 2 * jamb, 1);
    }
    if (depth) { g.fillStyle = moving ? '#f0c860' : '#a07e2a'; g.fillRect(x1 + jamb, top + depth - 3, x2 - x1 - 2 * jamb, 3); }
    let lamp = '#2a4a44';
    if (knocking(side)) lamp = (t * 6 | 0) % 2 ? '#ff3b3b' : '#4a1212';
    else if (moving && !sealed(side)) lamp = '#e8b45a';
    else if (sealed(side)) lamp = '#7fcf8a';
    g.fillStyle = lamp; g.fillRect(104, 18, 12, 6);
  }

  function noise(n) {
    g.fillStyle = 'rgba(180,255,240,.45)';
    for (let i = 0; i < n; i++) g.fillRect(Math.random() * W | 0, Math.random() * H | 0, 1, 1);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - drawAt < 66) return;
    drawAt = now;
    const t = now / 1000, side = CAMS[cam].side;
    if (switchFx > 0) switchFx -= 0.066;
    g.clearRect(0, 0, W, H);
    if (blackout) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); noise(30); return; }
    const hit = pound(side, t);
    g.save(); g.translate(hit.x, hit.y);
    drawHall(side, t); drawDoor(side, t);
    if (hit.m) marks(hit.m, t);
    g.restore();
    g.fillStyle = 'rgba(111,183,176,.06)'; g.fillRect(0, (t * 40) % H, W, 10);
    noise(switchFx > 0 ? 900 : 40 + (nearby(side) && nearby(side).kind === 'stalker' ? 170 : 0));
  }

  function refresh() {
    if (!ui.tabs) return;
    ui.label.textContent = CAMS[cam].label;
    ui.tabs.forEach((b, i) => b.classList.toggle('on', i === cam));
    ui.view.classList.toggle('off', !!blackout);
    const m = monsters.slice().sort((a, b) => b.stage - a.stage)[0];
    ui.sensor.textContent = m ? KINDS[m.kind].signal : 'CLEAR';
    ui.rad.forEach((el, i) => el.classList.toggle('on', i < level()));
    ctl.classList.toggle('idle', !active);
    paintDoors();
  }

  function paintDoors() {
    if (!ui.tabs) return;
    const txt = {};
    ['L', 'R'].forEach((s) => {
      const d = doors[s];
      txt[s] = knocking(s) ? 'KNOCKING' : sealed(s) ? 'SEALED' : d.closed ? 'CLOSING' : d.progress > 0 ? 'OPENING' : 'OPEN';
    });
    const p = S.get('power');
    const bat = S.get('battery');
    const pwr = active ? Math.round(p) + '%  ' + (drain >= 0 ? '-' : '+') + Math.abs(drain).toFixed(1) + '/s' + (bat ? ' · B' + bat : '') : '--';
    const key = [txt.L, txt.R, pwr, !!blackout].join('|');
    if (key === paintKey) return;
    paintKey = key;
    ['L', 'R'].forEach((s) => {
      const d = ui['door' + s], alarm = knocking(s);
      d.textContent = txt[s];
      d.classList.toggle('sealed', sealed(s));
      d.classList.toggle('moving', txt[s] === 'CLOSING' || txt[s] === 'OPENING');
      d.classList.toggle('alarm', alarm);
      ui['btn' + s].classList.toggle('sealed', sealed(s));
      ui['btn' + s].classList.toggle('closing', doors[s].closed && !sealed(s));
      ui['btn' + s].classList.toggle('alarm', alarm);
    });
    ui.tabs.forEach((b, i) => b.classList.toggle('alert', knocking(CAMS[i].side)));
    const alarmSides = ['L', 'R'].filter(knocking);
    ui.alert.hidden = !alarmSides.length;
    ui.alert.textContent = alarmSides.length === 2 ? '! BOTH DOORS · CLOSE SHUTTERS [A] [D]'
      : alarmSides.length ? '! ' + DOORS[alarmSides[0]].name + ' DOOR · CLOSE SHUTTER [' + (alarmSides[0] === 'L' ? 'A' : 'D') + ']' : '';
    ui.pwr.textContent = pwr;
    ui.pwr.classList.toggle('low', active && p < 25);
  }

  function mount(slots) {
    root = slots.cameras; ctl = slots.controls;
    root.innerHTML = `
      <div class="cam-view">
        <canvas class="cam-canvas" width="${W}" height="${H}"></canvas>
        <div class="cam-label"></div><div class="cam-rec">● REC</div><div class="cam-off">NO POWER</div>
        <div class="cam-toast"></div><div class="cam-alert" hidden></div>
      </div>
      <div class="cam-tabs">${CAMS.map((c, i) => `<button class="cam-tab" data-cam="${i}"><kbd>${i + 1}</kbd> ${c.short}</button>`).join('')}</div>
      <div class="cam-status">
        <div class="cam-row"><span>RADIATION <em class="cam-sensor">CLEAR</em></span><span class="rad"><i></i><i></i><i></i></span></div>
        <div class="cam-row"><span>WEST DOOR</span><b class="door-L">OPEN</b></div>
        <div class="cam-row"><span>EAST DOOR</span><b class="door-R">OPEN</b></div>
        <div class="cam-row"><span>POWER</span><b class="cam-pwr">--</b></div>
      </div>`;
    ctl.innerHTML = `<div class="ctl">
      <button class="ctl-btn ctl-west" data-act="L"><span>◀ WEST SHUTTER<small>${DOORS.L.hint}</small></span><kbd>A</kbd></button>
      <button class="ctl-btn ctl-east" data-act="R"><span>EAST SHUTTER ▶<small>${DOORS.R.hint}</small></span><kbd>D</kbd></button>
    </div>`;
    g = root.querySelector('canvas').getContext('2d');
    ui = {
      view: root.querySelector('.cam-view'), label: root.querySelector('.cam-label'),
      tabs: [...root.querySelectorAll('.cam-tab')], rad: [...root.querySelectorAll('.rad i')],
      sensor: root.querySelector('.cam-sensor'), doorL: root.querySelector('.door-L'), doorR: root.querySelector('.door-R'),
      toast: root.querySelector('.cam-toast'), alert: root.querySelector('.cam-alert'), pwr: root.querySelector('.cam-pwr'),
      btnL: ctl.querySelector('[data-act="L"]'), btnR: ctl.querySelector('[data-act="R"]'),
    };
    ui.tabs.forEach((b, i) => b.addEventListener('click', () => selectCam(i)));
    ui.btnL.addEventListener('click', () => toggle('L'));
    ui.btnR.addEventListener('click', () => toggle('R'));
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || S.get('paused')) return;
      const k = e.key.toLowerCase();
      if (!['1', '2', 'a', 'd'].includes(k)) return;
      e.preventDefault();
      if (k === '1' || k === '2') selectCam(Number(k) - 1);
      else toggle(k === 'a' ? 'L' : 'R');
    }, true);
    bus.on('tick', onTick);
    bus.on('state:power', paintDoors);
    bus.on('power:gain', powerGain);
    bus.on('phase:change', (e) => { if (e.phase === 'play') reset(); else stop(); });
    bus.on('dev:spawn', (e) => { if (active) spawn(e.kind, runTime); });
    refresh(); requestAnimationFrame(frame);
  }

  CF.register({ id: 'cameras', slots: ['cameras', 'controls'], mount: mount });
})();
