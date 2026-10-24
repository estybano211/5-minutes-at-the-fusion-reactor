/* The winning ending: a countdown, the ship lifting off the Moon while the plant melts down behind it, a turn toward
   Earth, then the credits. It is a short film, so it runs on real time and not on game ticks. The picture is a 320x180
   pixel canvas scaled over the whole stage; the captions and credits are DOM text.
   Test hooks: CF.ending.seek(seconds) draws the film at that time, CF.ending.start() plays it. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  const W = 320, H = 180, TAU = Math.PI * 2, GROUND = 140, PAD_X = 170, REACTOR_X = 56;
  const T = { ignite: 3.8, lift: 6.2, melt: 10.2, turn: 13.5, credits: 18.5 };   // film seconds

  let root, cv, g, cap, info, credits, roll, skipBtn, againBtn, endCard;
  let running = false, raf = 0, last = 0, mode = 'film', fired = {}, quiet = false;
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sfx = (name) => { if (!quiet) bus.emit('sfx', name); };
  let ft = 0, alt = 0, vel = 0, flame = 0, flash = 0, boom = -1, parts = [], steam = [], stars = [], seed = 1;

  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };   // deterministic scenery
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

  /* ── scenery ──────────────────────────────────────────────────────── */
  function reset() {
    seed = 7;
    stars = Array.from({ length: 90 }, () => ({ x: rnd() * W, y: rnd() * H, b: .3 + rnd() * .7, p: rnd() * TAU, big: rnd() < .12 }));
    ft = 0; alt = 0; vel = 0; flame = 0; flash = 0; boom = -1; parts = []; steam = []; fired = {};
  }

  /* Where things are on screen at the current altitude: the ship stays near the middle and the Moon drops away,
     shrinking and curving into a limb at the bottom. */
  function view() {
    const up = Math.max(0, alt - 60);
    const by = alt < 60 ? GROUND - alt : 80 - 12 * (1 - Math.exp(-up / 250));
    const gy = alt < 60 ? GROUND : by + 60 + 35 * (1 - Math.exp(-up / 90));
    const u = clamp((alt - 40) / 900, 0, 1);
    return { by: by, gy: gy, sc: 1 / (1 + up / 260), R: Math.exp(Math.log(1e6) * (1 - u) + Math.log(240) * u) };
  }
  const sag = (v, x) => (v.R > 5e4 ? 0 : v.R - Math.sqrt(Math.max(0, v.R * v.R - (x - W / 2) * (x - W / 2))));
  /* Draw something in ground coordinates (x as in the world, y = GROUND is the surface), centred on world x `cx`. */
  function onGround(v, cx, fn) {
    const sx = W / 2 + (cx - W / 2) * v.sc;
    g.save(); g.translate(sx, v.gy - sag(v, sx)); g.scale(v.sc, v.sc); g.translate(-cx, -GROUND); fn(); g.restore();
  }

  function drawStars(t) {
    stars.forEach((s) => {
      const tw = .55 + .45 * Math.sin(t * 2 + s.p), y = (s.y + alt * .02) % H;
      g.fillStyle = 'rgba(190,225,220,' + (s.b * tw).toFixed(2) + ')';
      g.fillRect(Math.round(s.x), Math.round(y), s.big ? 2 : 1, s.big ? 2 : 1);
    });
  }

  function drawEarth() {
    const x = 268, y = 30 + alt * .004;
    g.fillStyle = 'rgba(111,183,176,.16)'; g.beginPath(); g.arc(x, y, 11.5, 0, TAU); g.fill();
    g.fillStyle = '#17475c'; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(x, y, 9, 0, TAU); g.clip();
    g.fillStyle = '#3f8f9b'; g.beginPath(); g.arc(x - 3, y - 3, 8, 0, TAU); g.fill();     // sunlit side
    g.fillStyle = '#8f7646'; g.fillRect(x - 6, y - 4, 5, 3); g.fillRect(x - 2, y + 1, 4, 4); g.fillRect(x + 2, y - 5, 4, 2);   // land
    g.fillStyle = 'rgba(5,9,10,.55)'; g.beginPath(); g.arc(x + 5, y + 5, 9, 0, TAU); g.fill();                                // night side
    g.restore();
  }

  function drawGround(v, t) {
    const surface = '#121b1b';
    g.fillStyle = surface;
    if (v.R > 5e4) g.fillRect(0, Math.round(v.gy), W, H);
    else { g.beginPath(); g.arc(W / 2, v.gy + v.R, v.R, 0, TAU); g.fill(); }
    if (v.gy >= H) return;
    // rim of faint starlight along the horizon
    g.strokeStyle = '#2a403d'; g.lineWidth = 1; g.beginPath();
    if (v.R > 5e4) { g.moveTo(0, Math.round(v.gy) + .5); g.lineTo(W, Math.round(v.gy) + .5); }
    else g.arc(W / 2, v.gy + v.R + .5, v.R, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    // craters and rocks in the world, fixed to the surface
    [[20, 156, 24, 4], [92, 168, 30, 5], [140, 150, 14, 2.5], [214, 162, 28, 5], [282, 152, 22, 3.5], [300, 172, 20, 4], [60, 176, 16, 3]].forEach((c) => {
      onGround(v, c[0], () => {
        g.fillStyle = '#0c1313'; g.beginPath(); g.ellipse(c[0], c[1], c[2], c[3], 0, 0, TAU); g.fill();
        g.strokeStyle = '#22332f'; g.lineWidth = 1; g.beginPath(); g.ellipse(c[0], c[1], c[2], c[3], 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      });
    });
    [[8, 146], [118, 145], [246, 147], [312, 146]].forEach((r) => onGround(v, r[0], () => { g.fillStyle = '#0a1010'; poly([[r[0] - 4, GROUND + 5], [r[0] - 2, GROUND + 1], [r[0] + 3, GROUND + 2], [r[0] + 5, GROUND + 5]]); }));
  }

  /* The plant: a dome and two stacks, drawn like the creatures in the cameras (a rim of light, then the black shape). */
  function drawReactor(t) {
    const shape = (dx, dy) => {
      g.beginPath(); g.ellipse(REACTOR_X + dx, GROUND + dy, 24, 17, 0, Math.PI, TAU); g.fill();
      poly([[14 + dx, GROUND + dy], [32 + dx, GROUND + dy], [28 + dx, 100 + dy], [18 + dx, 100 + dy]]);
      poly([[80 + dx, GROUND + dy], [96 + dx, GROUND + dy], [93 + dx, 116 + dy], [83 + dx, 116 + dy]]);
      g.fillRect(30 + dx, 131 + dy, 54, 4);
    };
    g.fillStyle = '#27504a'; shape(-1, -1);
    g.fillStyle = '#05090a'; shape(0, 0);
    [[42, 127], [50, 124], [58, 124], [66, 127], [46, 133], [62, 133]].forEach((w, i) => { g.fillStyle = Math.sin(t * 3 + i * 2) > -.5 ? '#a07e2a' : '#3b3012'; g.fillRect(w[0], w[1], 3, 2); });
    if ((t * 1.3 | 0) % 2) { g.fillStyle = '#e5484d'; g.fillRect(22, 97, 3, 3); }
    g.fillStyle = 'rgba(111,183,176,.3)'; steam.forEach((p) => g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2));
  }

  function drawPad(v, t) {
    onGround(v, PAD_X, () => {
      g.fillStyle = '#1d2b29'; g.beginPath(); g.ellipse(PAD_X, GROUND + 1, 46, 4, 0, 0, TAU); g.fill();    // floodlit patch of ground
      rect(PAD_X - 24, GROUND, 48, 3, '#3b4a48'); rect(PAD_X - 24, GROUND, 48, 1, '#5d7a75');
      rect(PAD_X - 9, GROUND, 18, 3, flame > 0 ? '#f0c860' : '#070b0c');                                   // the flame trench under the ship
      for (let x = PAD_X - 24; x < PAD_X + 24; x += 8) rect(x, GROUND + 3, 4, 2, '#a07e2a');
      const tx = PAD_X - 24, arm = 6 * (1 - ease((ft - 3) / .8));                                         // gantry tower and its arm
      g.fillStyle = '#2a3438'; g.fillRect(tx, 92, 3, 48); g.fillRect(tx + 8, 92, 3, 48);
      g.strokeStyle = '#2a3438'; g.lineWidth = 1;
      for (let y = 96; y < 138; y += 14) { g.beginPath(); g.moveTo(tx + 3, y); g.lineTo(tx + 8, y + 14); g.moveTo(tx + 8, y); g.lineTo(tx + 3, y + 14); g.stroke(); }
      g.fillStyle = '#5d7a75'; g.fillRect(tx, 92, 1, 48);
      if (arm > .5) rect(tx + 11, 106, arm, 3, '#3b4a48');
      if (ft < T.lift) { g.fillStyle = 'rgba(232,230,200,.07)'; poly([[tx + 11, 92], [tx + 11, 96], [PAD_X + 14, 130], [PAD_X + 14, 100]]); }
      rect(tx - 1, 90, 5, 2, '#e8b45a');
    });
  }

  /* The ship: origin at the centre of the nozzle, nose pointing up. */
  function drawShip(burn, t) {
    g.fillStyle = '#8f7646'; poly([[-7, -22], [-16, -3], [-7, -9]]); poly([[7, -22], [16, -3], [7, -9]]);
    g.fillStyle = '#2a3438'; poly([[-5, -9], [5, -9], [7, 0], [-7, 0]]);
    g.fillStyle = '#8f7646'; g.fillRect(-7, -1, 14, 1);
    g.fillStyle = '#c9d3d1'; g.fillRect(-7, -43, 14, 35);
    g.fillStyle = '#e6eeec'; g.fillRect(-7, -43, 3, 35);
    g.fillStyle = '#8ea09d'; g.fillRect(4, -43, 3, 35);
    g.fillStyle = '#e8b45a'; g.fillRect(-7, -30, 14, 3);
    g.fillStyle = '#a07e2a'; g.fillRect(4, -30, 3, 3);
    g.fillStyle = '#12171a'; g.fillRect(-3, -39, 6, 6);
    g.fillStyle = '#6fb7b0'; g.fillRect(-2, -38, 3, 3);
    g.fillStyle = '#e8b45a'; poly([[-7, -43], [0, -59], [7, -43]]);
    g.fillStyle = '#a07e2a'; poly([[0, -59], [7, -43], [1, -43]]);
    if (burn > 0) {                                                      // a wide bell of flame; there is no air to squeeze it
      const L = (5 + 30 * burn) * (.85 + Math.random() * .3), w = 5 + 5 * burn;
      [['rgba(232,180,90,.6)', 1], ['#f0c860', .72], ['#fff7d6', .4]].forEach((l) => {
        g.fillStyle = l[0]; const k = l[1];
        poly([[-5 * k, 0], [-w * k, L * .5 * k], [-3 * k, L * k], [3 * k, L * k], [w * k, L * .5 * k], [5 * k, 0]]);
      });
    }
  }

  function drawShipAt(v, t) {
    const q = ease((ft - T.turn) / 6);
    const x = lerp(PAD_X, 262, q), y = lerp(v.by, 46, q), s = 1 - .82 * q;
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(q * .95); g.scale(s, s);
    drawShip(flame, t);
    g.restore();
  }

  /* The meltdown: a white flash, a fireball over the plant and a shock ring along the ground. */
  function drawMeltdown(v) {
    if (boom < 0) return;
    const k = boom, grow = 1 - Math.exp(-k * 1.6);
    onGround(v, REACTOR_X, () => {
      const r = 8 + 52 * grow, fade = clamp(1.2 - k / 6, 0, 1);
      [['rgba(122,29,29,', 1.0, .35], ['rgba(229,72,77,', .78, .5], ['rgba(240,200,96,', .55, .7], ['rgba(255,247,214,', .3, .9]].forEach((b) => {
        g.fillStyle = b[0] + (b[2] * fade).toFixed(2) + ')';
        g.beginPath(); g.ellipse(REACTOR_X, GROUND - 6 * grow, r * b[1], r * b[1] * .85, 0, Math.PI, TAU); g.fill();
      });
      g.strokeStyle = 'rgba(240,200,96,' + (.6 * fade).toFixed(2) + ')'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(REACTOR_X, GROUND + 1, 10 + 130 * grow, 2 + 8 * grow, 0, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(229,72,77,' + (.35 * fade).toFixed(2) + ')'; g.beginPath(); g.ellipse(REACTOR_X, GROUND + 2, 30 + 70 * grow, 4, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(229,72,77,' + (.22 + .08 * Math.sin(ft * 5)).toFixed(2) + ')'; g.beginPath(); g.ellipse(REACTOR_X, GROUND + 1, 26, 3, 0, 0, TAU); g.fill();   // embers
    });
  }

  function frame() {
    const v = view(), t = ft;
    const shk = flame * (alt < 40 ? 1 : clamp(1 - (alt - 40) / 80, 0, 1)) + (boom >= 0 && boom < 1.2 ? .6 : 0);
    g.setTransform(1, 0, 0, 1, Math.round((Math.random() - .5) * 2 * shk * 1.5), Math.round((Math.random() - .5) * 2 * shk * 1.5));
    g.fillStyle = '#05090a'; g.fillRect(-4, -4, W + 8, H + 8);
    drawStars(t); drawEarth();
    drawShipAt(v, t);                        // drawn before the ground, so the ground hides the flame below the pad
    drawGround(v, t);
    if (boom < 0) onGround(v, REACTOR_X, () => drawReactor(t));
    drawPad(v, t);
    // blast pit under the engine, and the dust it throws
    if (flame > 0 && alt < 25) onGround(v, PAD_X, () => {
      const hot = clamp(1 - alt / 25, 0, 1) * flame, jet = 16 + 34 * hot;
      g.fillStyle = 'rgba(240,200,96,' + (.35 * hot).toFixed(2) + ')'; g.beginPath(); g.ellipse(PAD_X, GROUND + 1, 14 + 30 * hot, 3, 0, 0, TAU); g.fill();
      [-1, 1].forEach((d) => {                                      // the flame is thrown sideways along the ground
        g.fillStyle = 'rgba(232,180,90,' + (.7 * hot).toFixed(2) + ')'; poly([[PAD_X + d * 6, GROUND - 3], [PAD_X + d * jet, GROUND - 1 - Math.random() * 2], [PAD_X + d * 6, GROUND + 1]]);
        g.fillStyle = 'rgba(255,247,214,' + (.8 * hot).toFixed(2) + ')'; poly([[PAD_X + d * 6, GROUND - 2], [PAD_X + d * jet * .55, GROUND - 1], [PAD_X + d * 6, GROUND]]);
      });
    });
    parts.forEach((p) => onGround(v, PAD_X, () => { g.fillStyle = 'rgba(' + (p.warm ? '150,160,140' : '95,115,110') + ',' + clamp(p.life / p.max, 0, 1).toFixed(2) + ')'; g.fillRect(Math.round(p.x), Math.round(p.y), p.big ? 2 : 1, p.big ? 2 : 1); }));
    drawMeltdown(v);
    if (flash > 0) { g.fillStyle = 'rgba(255,250,230,' + clamp(flash, 0, 1).toFixed(2) + ')'; g.fillRect(-4, -4, W + 8, H + 8); }
    const fade = clamp(1 - ft / .8, 0, 1);
    if (fade > 0) { g.fillStyle = 'rgba(5,9,10,' + fade.toFixed(2) + ')'; g.fillRect(-4, -4, W + 8, H + 8); }   // fade in from black
  }

  /* ── the film clock ───────────────────────────────────────────────── */
  const EVENTS = [
    { t: .2, run: () => note('LAUNCH PAD · DARK SIDE OF THE MOON') },
    { t: 1.0, run: () => { big('T-3'); sfx('click'); } },
    { t: 2.0, run: () => { big('T-2'); sfx('click'); } },
    { t: 3.0, run: () => { big('T-1'); sfx('click'); } },
    { t: T.ignite, run: () => { big('IGNITION'); sfx('rumble'); } },
    { t: 5.4, run: () => big('') },
    { t: T.lift, run: () => note('LIFTOFF') },
    { t: T.melt, run: () => { boom = 0; flash = calm() ? .3 : .8; sfx('boom'); } },
    { t: T.melt + .6, run: () => note('THE PLANT MELTS DOWN BEHIND YOU') },
    { t: T.turn, run: () => note(aboard() + ' OF ' + cfg.crew.length + ' CREW ABOARD · COURSE FOR EARTH') },
    { t: T.credits, run: () => showCredits() },
  ];

  function step(dt) {
    ft += dt;
    flame = ft < T.ignite ? 0 : clamp((ft - T.ignite) / 2.2, 0, 1);
    if (ft >= T.lift) { vel += (12 + alt * .02) * dt; alt += vel * dt; }
    if (boom >= 0) boom += dt;
    flash = Math.max(0, flash - dt * .9);
    EVENTS.forEach((e) => { if (ft >= e.t && !fired[e.t]) { fired[e.t] = true; e.run(); } });
    // dust: ballistic, because there is no air to carry it
    if (flame > 0 && alt < 45) {
      for (let i = 0, n = Math.round(flame * 200 * dt + Math.random()); i < n; i++) {
        const dir = Math.random() < .5 ? -1 : 1, life = 2.4 + Math.random() * 1.6;
        parts.push({ x: PAD_X + dir * (4 + Math.random() * 6), y: GROUND - 1, vx: dir * (25 + Math.random() * 90), vy: -(2 + Math.random() * 14), life: life, max: life, big: Math.random() < .3, warm: Math.random() < .3 });
      }
    }
    parts.forEach((p) => {
      p.vy += 7 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.y >= GROUND) { p.y = GROUND; p.vy *= -.3; p.vx *= .8; }
    });
    parts = parts.filter((p) => p.life > 0);
    if (boom < 0 && Math.random() < dt * 3) steam.push({ x: 23, y: 98, vx: Math.random() * 3 - 1, vy: -(6 + Math.random() * 6), life: 3 });
    steam.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
    steam = steam.filter((p) => p.life > 0);
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    step(dt); frame();
  }

  /* Draw the film as it looks at film time `sec`, without any pause (used by tests and by SKIP). */
  function seek(sec) {
    if (!g) return;
    reset();
    quiet = true;                                                  // no sounds while fast-forwarding
    try { while (ft < sec) step(1 / 30); } finally { quiet = false; }
    frame();
  }

  /* ── captions and credits ─────────────────────────────────────────── */
  const aboard = () => S.get('team').filter((t) => t.status !== 'dead').length;
  function big(text) { cap.textContent = text; cap.classList.remove('go'); void cap.offsetWidth; if (text) cap.classList.add('go'); }
  function note(text) { info.textContent = text; info.classList.remove('go'); void info.offsetWidth; info.classList.add('go'); }

  function showCredits() {
    if (mode === 'credits') return;
    mode = 'credits';
    big(''); info.textContent = '';
    const team = S.get('team'), objs = S.get('objectives');
    const lost = team.filter((t) => t.status === 'dead').length;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    roll.innerHTML =
      '<h1>5 MINUTES AT<br>FUSION REACTOR</h1><p class="en-dim">Halcyon Fusion Reactor · dark side of the Moon</p>' +
      '<h2>THE CREW</h2>' + team.map((t) => '<p class="en-crew' + (t.status === 'dead' ? ' en-lost' : '') + '"><i style="background:' + t.color + '"></i>' + esc(t.name) + '<span>' + (t.status === 'dead' ? 'LEFT BEHIND' : 'ABOARD') + '</span></p>').join('') +
      '<p class="en-dim">' + (lost ? 'The ship was lighter than it should have been.' : 'Nobody was left behind.') + '</p>' +
      '<h2>THE ESCAPE LIST</h2>' + objs.map((o) => '<p>' + esc(o.name) + '</p>').join('') +
      '<h2>LAUNCHED AT ' + cfg.fmtClock(S.get('clock')) + '</h2><p class="en-dim">The plant melted down at ' + cfg.fmtClock(cfg.clock.end) + ', as it always would.</p>' +
      '<h2>AT THE CONTROL ROOM</h2><p>You</p><p class="en-dim">The one who could not leave, until now.</p>' +
      '<h2>FROM THE COMPANY</h2><p class="en-dim">The payroll system is still running.</p>' +
      '<h2>A VOICE ON THE RADIO, VERY CLOSE TO YOUR EAR</h2><p class="en-voice">“Thank you for taking me with you.”</p>';
    credits.hidden = false;
    root.classList.add('en-credits-on');
    if (calm()) { credits.classList.add('en-static'); endCard.classList.add('en-corner'); endCard.hidden = false; return; }
    // scroll speed is about 55 px per second whatever the length
    const px = 720 + roll.offsetHeight;
    roll.style.animationDuration = Math.round(px / 55) + 's';
    roll.classList.add('go');
  }

  function finish() { endCard.hidden = false; skipBtn.hidden = true; againBtn.focus(); }
  function skip() {
    if (mode === 'film') { seek(T.credits); }          // jumps to the credits with the final sky behind them
    else if (mode === 'credits') { roll.classList.remove('go'); roll.style.display = 'none'; finish(); }
  }

  function start() {
    if (!root || running) return;
    reset(); mode = 'film';
    credits.hidden = true; roll.classList.remove('go'); roll.style.display = ''; roll.innerHTML = '';
    endCard.hidden = true; skipBtn.hidden = false; cap.textContent = ''; info.textContent = '';
    root.classList.remove('en-credits-on');
    credits.classList.remove('en-static'); endCard.classList.remove('en-corner');
    root.hidden = false; void root.offsetWidth; root.classList.add('on');
    running = true; last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stopFilm() {
    running = false; cancelAnimationFrame(raf);
    if (root) { root.classList.remove('on'); root.hidden = true; }
  }

  function mount() {
    CF.cinematic = true;
    const stage = (CF.ui && CF.ui.stage) || document.body;
    root = document.createElement('div');
    root.className = 'en';
    root.hidden = true;
    root.innerHTML = '<canvas class="en-canvas" width="' + W + '" height="' + H + '"></canvas><div class="en-shade"></div>' +
      '<div class="en-info"></div><div class="en-cap"></div>' +
      '<div class="en-credits" hidden><div class="en-roll"></div></div>' +
      '<div class="en-end" hidden><h1>THE END</h1><button class="en-btn en-again">PLAY AGAIN</button></div>' +
      '<button class="en-skip">SKIP ▸</button>';
    stage.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    cap = root.querySelector('.en-cap'); info = root.querySelector('.en-info');
    credits = root.querySelector('.en-credits'); roll = root.querySelector('.en-roll');
    skipBtn = root.querySelector('.en-skip'); endCard = root.querySelector('.en-end'); againBtn = root.querySelector('.en-again');
    skipBtn.addEventListener('click', skip);
    againBtn.addEventListener('click', () => location.reload());
    roll.addEventListener('animationend', finish);
    document.addEventListener('keydown', (e) => {
      if (!running || root.hidden) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!endCard.hidden) location.reload(); else skip(); }
    });
    reset();
    bus.on('phase:change', (e) => { if (e.phase === 'win') start(); else stopFilm(); });
  }

  // hold(sec): show the film frozen at `sec` (for looking at a frame).
  function hold(sec) {
    running = false; cancelAnimationFrame(raf);
    root.hidden = false; root.classList.add('on'); mode = 'film';
    seek(sec);
  }

  CF.ending = { start: start, seek: seek, skip: skip, hold: hold };
  CF.register({ id: 'ending', slots: [], mount: mount });
})();
