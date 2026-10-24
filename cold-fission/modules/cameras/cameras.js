/* ─────────────────────────────────────────────────────────────────────────
   MODULE: cameras      OWNER: Person B (Night)
   Owns   the camera screen, the two shutters, the flare, power drain and the creature.
   Reads  state: phase, day, power, battery, flares        events: tick, phase:change
   Writes state: power (night only), flares (when one is used)
   Emits  night:caught {by}      the creature got in -> Core ends the game
          night:threat {level 0..3, side}   how close it is (Atmosphere uses it for sound)
          night:blackout         power hit zero
          sfx <name>, fx:flash <colour>
   The creature has NO model: it is a silhouette, a sound and a sensor reading. Keep it that way.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;

  const W = 220, H = 130;                       // internal canvas size, scaled up with pixelated rendering
  const CAMS = [
    { label: 'CAM 1 · WEST HALL', short: 'WEST HALL', side: 'L' },
    { label: 'CAM 2 · EAST HALL', short: 'EAST HALL', side: 'R' },
  ];
  // Tuning per night: seconds between creature moves, seconds the door may stay open once it is there,
  // seconds before the first appearance, and the power drained per second with no shutter closed.
  // Lockdowns last 70 / 85 / 125 s (see core/config.js), so the base drain falls on the later, longer ones.
  const NIGHT = {
    1: { move: [6.5, 9.5], grace: 3.2, first: 6, base: 0.40 },
    2: { move: [5, 7.5],   grace: 2.6, first: 4, base: 0.33 },
    3: { move: [4, 6.5],   grace: 2.1, first: 3, base: 0.28 },
  };
  const DRAIN = { shutter: 1.5 };               // extra power per second for each closed shutter
  const rand = (a, b) => a + Math.random() * (b - a);

  let root, ctl, cv, g, ui = {};
  let cam = 0, active = false, blackout = false, switchFx = 0, lastDraw = 0;
  let shut = { L: false, R: false };
  let m = { side: null, stage: 0, timer: 0, blocked: 0, open: 0 };   // stage: 0 away, 1 far, 2 near, 3 at the door

  const night = () => S.get('phase') === 'night';
  const params = () => NIGHT[S.get('day')] || NIGHT[3];

  /* ── game logic ─────────────────────────────────────────────────────── */
  function startNight() {
    shut = { L: false, R: false };
    blackout = false;
    active = true;
    m = { side: null, stage: 0, timer: params().first, blocked: 0, open: 0 };
    S.set('power', 100);
    threat();
    refresh();
  }

  function stopNight() {
    active = false;
    blackout = false;
    shut = { L: false, R: false };
    m.stage = 0;
    threat();
    refresh();
  }

  function threat() { bus.emit('night:threat', { level: m.stage, side: m.side }); }

  function powerOut() {
    blackout = true;
    shut = { L: false, R: false };
    bus.emit('sfx', 'powerdown');
    bus.emit('night:blackout');
    refresh();
  }

  function toggleShutter(side) {
    if (!active || blackout) return;
    shut[side] = !shut[side];
    bus.emit('sfx', 'shutter');
    refresh();
  }

  function useFlare() {
    if (!active || blackout) return;
    if (S.get('flares') < 1 || m.stage < 1) { bus.emit('sfx', 'deny'); return; }
    S.add('flares', -1);
    m.stage = 0;
    m.timer = rand(params().move[0], params().move[1]) + 4;
    bus.emit('sfx', 'flare');
    bus.emit('fx:flash', '#fff2c0');
    threat();
    refresh();
  }

  function selectCam(i) {
    if (i === cam) return;
    cam = i;
    switchFx = 0.25;
    bus.emit('sfx', 'click');
    refresh();
  }

  function onTick(e) {
    if (e.phase !== 'night' || !active) return;
    const dt = e.dt, p = params();

    if (!blackout) {
      let d = p.base + (shut.L ? DRAIN.shutter : 0) + (shut.R ? DRAIN.shutter : 0);
      d *= Math.pow(0.85, S.get('battery'));
      const left = Math.max(0, S.get('power') - d * dt);
      S.set('power', left);
      if (left <= 0) powerOut();
    }

    m.timer -= dt * (blackout ? 1.6 : 1);
    if (m.stage === 0) {
      if (m.timer <= 0) { m.side = Math.random() < 0.5 ? 'L' : 'R'; m.stage = 1; m.timer = rand(p.move[0], p.move[1]); threat(); }
    } else if (m.stage < 3) {
      if (m.timer <= 0) {
        m.stage++; m.timer = rand(p.move[0], p.move[1]);
        if (m.stage === 3) { m.blocked = 0; m.open = 0; bus.emit('sfx', 'knock'); }
        threat();
      }
    } else {
      if (shut[m.side]) {
        m.open = 0; m.blocked += dt;
        if (m.blocked > 2.5) { bus.emit('sfx', 'knock'); m.stage = 0; m.timer = rand(p.move[0], p.move[1]) + 2; threat(); }
      } else {
        m.blocked = 0; m.open += dt;
        if (m.open > p.grace) {
          active = false;
          bus.emit('sfx', 'scare');
          bus.emit('fx:flash', '#ff2a2a');
          bus.emit('night:caught', { by: 'infected', side: m.side });
        }
      }
    }
  }

  /* ── drawing (all placeholder art; swap for real sprites when you have them) ── */
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

  function drawMonster(x, baseY, h) {
    const w = h * 0.28;
    g.fillStyle = '#010202'; g.strokeStyle = '#1f3a36';
    const parts = [
      [x - w / 2, baseY - h * 0.72, w, h * 0.5],                     // torso
      [x - w / 2, baseY - h * 0.24, w * 0.35, h * 0.24],             // legs
      [x + w * 0.15, baseY - h * 0.24, w * 0.35, h * 0.24],
      [x - w / 2 - w * 0.3, baseY - h * 0.7, w * 0.3, h * 0.68],     // arms, too long
      [x + w / 2, baseY - h * 0.7, w * 0.3, h * 0.68],
    ];
    parts.forEach((r) => { g.fillRect(r[0], r[1], r[2], r[3]); g.strokeRect(r[0] + .5, r[1] + .5, r[2], r[3]); });
    g.beginPath(); g.arc(x, baseY - h * 0.8, h * 0.13, 0, 6.3); g.fill(); g.stroke();
    g.fillStyle = '#e8e8b0';                                          // two uneven eyes
    const e = Math.max(1, h * 0.03);
    g.fillRect(x - h * 0.06, baseY - h * 0.83, e, e);
    g.fillRect(x + h * 0.03, baseY - h * 0.81, e, e);
  }

  function drawHall(side, t) {
    const dark = night();
    g.fillStyle = '#08100f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0f1d1b'; poly([[0, H], [W, H], [130, 62], [90, 62]]);
    g.fillStyle = '#0c1615'; poly([[0, 0], [90, 40], [90, 62], [0, H]]); poly([[W, 0], [130, 40], [130, 62], [W, H]]);
    g.fillStyle = '#1a2f2c'; g.fillRect(90, 40, 40, 22);              // lit far doorway
    g.strokeStyle = '#27403c'; g.lineWidth = 1;
    line(0, 0, 90, 40); line(W, 0, 130, 40); line(0, H, 90, 62); line(W, H, 130, 62);
    const flick = dark && Math.random() < 0.12;
    [[4, 30], [14, 20], [24, 12]].forEach((l) => {
      g.fillStyle = flick ? '#16302c' : '#3d7a70'; g.fillRect(110 - l[1] / 2, l[0], l[1], 3);
    });
    if (dark && m.side === side) {
      if (m.stage === 1 && Math.random() > 0.05) drawMonster(110 + Math.sin(t * 2) * 1.5, 62, 20);
      if (m.stage === 2 && Math.random() > 0.08) drawMonster(110 + Math.sin(t * 3) * 3, 116, 82);
      if (m.stage === 3) {                                            // at the door: only a tear in the picture
        g.fillStyle = 'rgba(111,183,176,.5)';
        for (let i = 0; i < 4; i++) g.fillRect(0, (Math.random() * H) | 0, W, 1 + ((Math.random() * 3) | 0));
      }
    }
  }

  function noise(n) {
    g.fillStyle = 'rgba(180,255,240,.45)';
    for (let i = 0; i < n; i++) g.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - lastDraw < 66) return;                                  // ~15 fps on purpose: feels like a bad feed
    const dt = (now - lastDraw) / 1000; lastDraw = now;
    const t = now / 1000, c = CAMS[cam];
    if (switchFx > 0) switchFx -= dt;
    g.clearRect(0, 0, W, H);
    if (blackout) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); noise(30); return; }
    drawHall(c.side, t);
    if (night()) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, W, H); }
    g.fillStyle = 'rgba(111,183,176,.06)'; g.fillRect(0, (t * 40) % H, W, 10);
    noise(switchFx > 0 ? 900 : 40 + (m.stage === 2 && night() ? 160 : 0));
  }

  /* ── UI ─────────────────────────────────────────────────────────────── */
  function refresh() {
    if (!ui.tabs) return;
    ui.label.textContent = CAMS[cam].label;
    ui.tabs.forEach((b, i) => b.classList.toggle('on', i === cam));
    ui.view.classList.toggle('off', blackout);
    ['L', 'R'].forEach((s) => {
      ui['door' + s].textContent = shut[s] ? 'SEALED' : 'OPEN';
      ui['door' + s].classList.toggle('sealed', shut[s]);
      ui['btn' + s].classList.toggle('sealed', shut[s]);
    });
    ui.rad.forEach((el, i) => el.classList.toggle('on', night() && i < m.stage));
    ui.flareCount.textContent = S.get('flares');
    ctl.classList.toggle('idle', !active);
  }

  function mount(slots) {
    root = slots.cameras; ctl = slots.controls;
    root.innerHTML = `
      <div class="cam-view">
        <canvas class="cam-canvas" width="${W}" height="${H}"></canvas>
        <div class="cam-label"></div><div class="cam-rec">● REC</div><div class="cam-off">NO POWER</div>
      </div>
      <div class="cam-tabs">${CAMS.map((c, i) => `<button class="cam-tab" data-cam="${i}"><kbd>${i + 1}</kbd> ${c.short}</button>`).join('')}</div>
      <div class="cam-status">
        <div class="cam-row"><span>RADIATION</span><span class="rad"><i></i><i></i><i></i></span></div>
        <div class="cam-row"><span>WEST DOOR</span><b class="door-L">OPEN</b></div>
        <div class="cam-row"><span>EAST DOOR</span><b class="door-R">OPEN</b></div>
      </div>`;
    ctl.innerHTML = `
      <div class="ctl">
        <button class="ctl-btn" data-act="L"><span>◀ WEST SHUTTER</span><kbd>A</kbd></button>
        <button class="ctl-btn flare" data-act="F"><span>FLARE ×<b class="flare-n">0</b></span><kbd>F</kbd></button>
        <button class="ctl-btn" data-act="R"><span>EAST SHUTTER ▶</span><kbd>D</kbd></button>
      </div>`;

    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    ui = {
      view: root.querySelector('.cam-view'), label: root.querySelector('.cam-label'),
      tabs: [...root.querySelectorAll('.cam-tab')], rad: [...root.querySelectorAll('.rad i')],
      doorL: root.querySelector('.door-L'), doorR: root.querySelector('.door-R'),
      btnL: ctl.querySelector('[data-act="L"]'), btnR: ctl.querySelector('[data-act="R"]'),
      flareCount: ctl.querySelector('.flare-n'),
    };
    ui.tabs.forEach((b, i) => b.addEventListener('click', () => selectCam(i)));
    ctl.querySelector('[data-act="L"]').addEventListener('click', () => toggleShutter('L'));
    ctl.querySelector('[data-act="R"]').addEventListener('click', () => toggleShutter('R'));
    ctl.querySelector('[data-act="F"]').addEventListener('click', useFlare);

    document.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === '2') selectCam(Number(k) - 1);
      else if (k === 'a') toggleShutter('L');
      else if (k === 'd') toggleShutter('R');
      else if (k === 'f') useFlare();
    });

    bus.on('tick', onTick);
    bus.on('state:flares', refresh);
    bus.on('phase:change', (e) => { if (e.phase === 'night') startNight(); else stopNight(); });
    refresh();
    requestAnimationFrame(frame);
  }

  CF.register({ id: 'cameras', slots: ['cameras', 'controls'], mount: mount });
})();
