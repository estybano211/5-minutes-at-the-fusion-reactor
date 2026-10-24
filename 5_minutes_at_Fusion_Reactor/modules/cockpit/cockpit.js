/* The finale. When the crew are aboard the ship, the whole screen becomes its cockpit: no cameras, no crew, no warnings.
   The power is out. The only light is a flashlight that follows the mouse; a control can only be used while the beam is on it.
   Prime the ignition by setting the controls in the order printed on the launch card, then hold PRIME. Things walk up to the
   windscreen in the dark and pound on the glass; shine the light on one and it screams and goes. Cracks stay, and a pane that
   breaks ends the run. It is one 320x180 pixel canvas scaled over the stage, and it runs on real time (like a minigame).
   Test hook: CF.cockpit.test (see the bottom). */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  const W = 320, H = 180, TAU = Math.PI * 2, BEAM = 26;
  const PAN = [-0.7, 0, 0.7];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // The three panes of the windscreen: left and right are angled a little. `cx` is where a creature stands in front of it.
  const PANES = [
    { cx: 53,  quad: [[12, 20], [94, 12], [94, 86], [12, 86]] },
    { cx: 160, quad: [[100, 12], [220, 12], [220, 86], [100, 86]] },
    { cx: 267, quad: [[226, 12], [308, 20], [308, 86], [226, 86]] },
  ];

  // What each creature is and does at the glass. `come` = seconds to walk up, `tough` = seconds of light it takes to drive
  // it off, `hit` = seconds between blows (first, fastest), `dmg` = damage to the pane per blow (a pane breaks at 1).
  const KIND = {
    walker:  { come: 3.4, tough: 0.55, hit: [1.15, 0.7],  dmg: 0.05,  head: 72, size: 1,    stepGap: 0.8,  walk: 'ckstep',    blow: 'slap' },
    crawler: { come: 1.9, tough: 0.4,  hit: [0.5, 0.35],  dmg: 0.03, head: 19, size: 1.15, stepGap: 0.55, walk: 'ckcrawl',   blow: 'crack' },
    brute:   { come: 4.0, tough: 0.8,  hit: [2.0, 1.3],   dmg: 0.12,   head: 69, size: 0.92, stepGap: 1.0,  walk: 'ckbrute',   blow: 'slap' },
    stalker: { come: 4.6, tough: 0.5,  hit: [1.5, 1.0],   dmg: 0.06,  head: 99, size: 0.8,  stepGap: 1.6,  walk: 'ckwhisper', blow: 'tap' },
  };
  const HEAD_AT = { walker: [0, 42], brute: [0, 46], crawler: [0, 35], stalker: [-12, 36] };   // the head while it presses on the glass

  /* ── a tiny 3x5 pixel font for the panel labels and the launch card ── */
  const FONT = {};
  ('A:010/101/111/101/101 B:110/101/110/101/110 C:011/100/100/100/011 D:110/101/101/101/110 E:111/100/110/100/111 F:111/100/110/100/100 ' +
   'G:011/100/101/101/011 H:101/101/111/101/101 I:111/010/010/010/111 J:001/001/001/101/010 K:101/101/110/101/101 L:100/100/100/100/111 ' +
   'M:101/111/111/101/101 N:110/101/101/101/101 O:010/101/101/101/010 P:110/101/110/100/100 Q:010/101/101/110/011 R:110/101/110/101/101 ' +
   'S:011/100/010/001/110 T:111/010/010/010/010 U:101/101/101/101/111 V:101/101/101/101/010 W:101/101/111/111/101 X:101/101/010/101/101 ' +
   'Y:101/101/010/010/010 Z:111/001/010/100/111 0:111/101/101/101/111 1:010/110/010/010/111 2:110/001/010/100/111 3:110/001/010/001/110 ' +
   '4:101/101/111/001/001 5:111/100/110/001/110 6:011/100/111/101/111 7:111/001/010/010/010 8:111/101/111/101/111 9:111/101/111/001/110 ' +
   '-:000/000/111/000/000 .:000/000/000/000/010 >:100/010/001/010/100').split(' ').forEach((d) => { FONT[d[0]] = d.slice(2).split('/'); });

  let root, cv, g, mk, mg, introEl, introGo;
  let mode = 'off';                       // off | intro | live | win | lose
  let controls = [], seq = [], stage = 0, primeHold = 0, holding = false, forceSpawn = false;
  let panes = [], mons = [], marks = [], shards = [], stars = [], glow = [];
  let aim = { x: 160, y: 130 }, target = { x: 160, y: 130 }, dark = 0, blink = 6, keys = {};
  let T = 0, runT = 0, spawnT = 0, shake = 0, flash = 0, flashCol = '255,255,255', endT = 0, sent = false, raf = 0, last = 0, ambient = 0;

  const sfx = (name, pane, vol) => bus.emit('sfx', pane == null ? name : { name: name, pan: PAN[pane], vol: vol == null ? 1 : vol });

  /* ── drawing helpers ──────────────────────────────────────────────── */
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  const limb = (pts, w) => { g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); };
  const blob = (cx, cy, rx, ry, rot) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); g.fill(); };
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  function text(s, x, y, col, align) {
    const w = s.length * 4 - 1;
    x = Math.round(align === 'c' ? x - w / 2 : align === 'r' ? x - w : x);
    g.fillStyle = col;
    for (let i = 0; i < s.length; i++) {
      const gl = FONT[s[i]];
      if (!gl) continue;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (gl[r][c] === '1') g.fillRect(x + i * 4 + c, y + r, 1, 1);
    }
  }
  /* Creatures are drawn twice, like in the cameras: a faint rim light, then the black body. */
  function sil(fn) {
    g.save(); g.translate(-1, -1); g.fillStyle = g.strokeStyle = '#2c5a54'; fn(); g.restore();
    g.fillStyle = g.strokeStyle = '#020505'; fn();
  }
  const eye = (x, y, w, h, c, a) => glow.push({ x: x, y: y, w: w, h: h, c: c, a: a == null ? 1 : a });

  /* ── the panel: controls ──────────────────────────────────────────── */
  const NAMES = { batt: 'BATT ON', pump: 'PUMP ON', cool: 'COOL ON', arm: 'ARM ON', thr: 'THR HIGH', prime: 'PRIME' };
  function build() {
    controls = [];
    const add = (c) => { controls.push(Object.assign({ on: 0, pos: 0, flash: 0, open: false }, c)); return c; };
    for (let i = 0; i < 22; i++) add({ id: 'oh' + i, kind: 'toggle', x: Math.round(22 + i * 12.5), y: 3, w: 4, h: 6 });
    const bank = (x0, y0, labels) => labels.forEach((l, i) => add({ id: l + i + x0, kind: 'toggle', x: x0 + (i % 4) * 11, y: y0 + 7, w: 8, h: 9, label: l, lx: x0 + (i % 4) * 11 + 4, ly: y0 }));
    bank(56, 100, ['LT', 'O2', 'CAB', 'DOC']); bank(56, 121, ['COM', 'NAV', 'RAD', 'AUX']);
    bank(222, 100, ['GYR', 'TRM', 'FLP', 'ENG']); bank(222, 121, ['HYD', 'PWR', 'LND', 'WNG']);
    [60, 76, 92, 228, 244, 260].forEach((x, i) => add({ id: 'dial' + i, kind: 'dial', x: x - 5, y: 142, w: 10, h: 10, dead: true }));
    for (let i = 0; i < 6; i++) add({ id: 'pb' + i, kind: 'push', x: 34 + i * 10, y: 163, w: 7, h: 7, cap: i });
    for (let i = 0; i < 4; i++) add({ id: 'pr' + i, kind: 'push', x: 278 + i * 9, y: 168, w: 7, h: 7, cap: i + 2 });
    [226, 242, 258].forEach((x, i) => add({ id: 'kn' + i, kind: 'knob', x: x - 4, y: 161, w: 9, h: 9 }));
    add({ id: 'lv0', kind: 'lever', x: 282, y: 100, w: 5, h: 50, label: 'TR', lx: 284, ly: 154 });
    add({ id: 'lv1', kind: 'lever', x: 294, y: 100, w: 5, h: 50, label: 'FL', lx: 296, ly: 154 });
    add({ id: 'scr', kind: 'screen', x: 122, y: 106, w: 76, h: 26, dead: true });
    // the six that matter
    add({ id: 'batt', real: true, kind: 'toggle', x: 14, y: 164, w: 10, h: 12, label: 'BATT', lx: 19, ly: 157 });
    add({ id: 'pump', real: true, kind: 'toggle', x: 120, y: 142, w: 10, h: 12, label: 'PUMP', lx: 125, ly: 135 });
    add({ id: 'arm', real: true, kind: 'guard', x: 148, y: 141, w: 14, h: 13, label: 'ARM', lx: 155, ly: 135 });
    add({ id: 'cool', real: true, kind: 'toggle', x: 196, y: 142, w: 10, h: 12, label: 'COOL', lx: 201, ly: 135 });
    add({ id: 'thr', real: true, kind: 'lever', x: 306, y: 100, w: 5, h: 50, label: 'THR', lx: 308, ly: 154 });
    add({ id: 'prime', real: true, kind: 'prime', x: 152, y: 160, w: 16, h: 16, cx: 160, cy: 168 });
    const order = ['batt', 'pump', 'cool', 'arm', 'thr'];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    seq = order.concat('prime');
    stage = 0; primeHold = 0; holding = false;
  }
  const byId = (id) => controls.find((c) => c.id === id);
  const under = (x, y) => { let best = null; controls.forEach((c) => { const pad = c.real ? 3 : 1; if (!c.dead && x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) best = c; }); return best; };

  function drawControl(c) {
    const on = c.on, x = c.x, y = c.y, w = c.w, h = c.h;
    if (c.kind === 'toggle') {
      rect(x, y, w, h, '#182224'); rect(x, y, w, 1, '#2d3d3f'); rect(x, y + h - 1, w, 1, '#0a1011');
      const kx = x + (w >> 1) - 1;
      rect(kx, on ? y + 1 : y + (h >> 1), 3, (h >> 1) - 1, c.real ? '#e8b45a' : '#b9c4c2');
      rect(kx, on ? y + 1 : y + h - 3, 3, 2, on ? '#f6e6b8' : '#6a7573');
    } else if (c.kind === 'push') {
      const caps = ['#7a2a2a', '#2a5a4a', '#8f7646', '#2a3d5a', '#5a3a6a', '#6a6a3a'];
      rect(x, y, w, h, '#101819');
      rect(x + 1, y + 1 + (c.flash > 0 ? 1 : 0), w - 2, h - 2 - (c.flash > 0 ? 1 : 0), caps[c.cap % caps.length]);
      rect(x + 1, y + 1, w - 2, 1, 'rgba(255,255,255,.25)');
    } else if (c.kind === 'knob') {
      g.fillStyle = '#101819'; blob(x + 4.5, y + 4.5, 4.6, 4.6);
      g.fillStyle = '#3a4a4c'; blob(x + 4.5, y + 4.5, 3.4, 3.4);
      const a = c.pos * (Math.PI / 2) - Math.PI / 4;
      g.strokeStyle = '#d9bd70'; g.lineWidth = 1; line(x + 4.5, y + 4.5, x + 4.5 + Math.cos(a) * 3.4, y + 4.5 + Math.sin(a) * 3.4);
    } else if (c.kind === 'dial') {
      g.fillStyle = '#0a1011'; blob(x + 5, y + 5, 5.4, 5.4); g.fillStyle = '#16221f'; blob(x + 5, y + 5, 4.4, 4.4);
      g.strokeStyle = '#4d6f68'; g.lineWidth = 1; line(x + 5, y + 5, x + 1.8, y + 7.4);
      rect(x + 4, y + 2, 1, 1, '#6a5a28');
    } else if (c.kind === 'lever') {
      rect(x, y, w, h, '#0b1112'); rect(x + 2, y + 2, 1, h - 4, '#000');
      const hy = y + h - 6 - c.pos * ((h - 8) / 2);
      rect(x - 2, Math.round(hy), w + 4, 5, c.real ? '#e8b45a' : '#b9c4c2');
      rect(x - 2, Math.round(hy), w + 4, 1, 'rgba(255,255,255,.35)');
      [0, 1, 2].forEach((n) => rect(x + w + 3, y + h - 4 - n * ((h - 8) / 2), 2, 1, '#6a5a28'));
    } else if (c.kind === 'guard') {
      rect(x, y, w, h, '#161f20');
      for (let i = 0; i < w; i += 4) rect(x + i, y, 2, 2, '#a07e2a');
      const kx = x + (w >> 1) - 1;
      rect(kx, c.on ? y + 4 : y + 8, 3, 4, '#e8b45a');
      if (!c.open) { rect(x + 1, y + 2, w - 2, h - 3, 'rgba(160,50,46,.78)'); rect(x + 1, y + 2, w - 2, 1, 'rgba(255,170,150,.5)'); }
      else { g.strokeStyle = 'rgba(160,50,46,.9)'; g.lineWidth = 1; line(x + 1, y + 2, x + 1, y - 5); line(x + w - 2, y + 2, x + w - 2, y - 5); line(x + 1, y - 5, x + w - 2, y - 5); }
    } else if (c.kind === 'prime') {
      g.fillStyle = '#1a1212'; blob(c.cx, c.cy, 9.5, 9.5);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#a07e2a' : '#0a0606'; g.beginPath(); g.moveTo(c.cx, c.cy); g.arc(c.cx, c.cy, 9.5, i * TAU / 12, (i + 1) * TAU / 12); g.fill(); }
      g.fillStyle = '#240c0c'; blob(c.cx, c.cy, 7.2, 7.2);
      g.fillStyle = holding ? '#8a1c1c' : '#b32a26'; blob(c.cx, c.cy + (holding ? 1 : 0), 6, 6);
      g.fillStyle = 'rgba(255,200,180,.35)'; blob(c.cx - 2, c.cy - 2, 2.2, 1.6);
    } else if (c.kind === 'screen') {
      rect(x, y, w, h, '#050909'); rect(x, y, w, 1, '#1a2a2a'); rect(x, y + h - 1, w, 1, '#1a2a2a');
      g.fillStyle = 'rgba(160,200,195,.05)'; poly([[x + 4, y + h - 2], [x + 20, y + 1], [x + 28, y + 1], [x + 12, y + h - 2]]);
    }
    if (c.label) text(c.label, c.lx, c.ly, c.real ? '#e6c57a' : '#8a7a4c', 'c');
  }

  /* ── the scene ────────────────────────────────────────────────────── */
  function outside() {
    rect(0, 11, W, 53, '#050a0c'); rect(0, 50, W, 8, '#08120f'); rect(0, 57, W, 7, '#0d1b19');
    stars.forEach((s) => { g.fillStyle = 'rgba(190,225,220,' + (s.b * (0.55 + 0.45 * Math.sin(T * 2 + s.p))).toFixed(2) + ')'; g.fillRect(s.x, s.y, s.big ? 2 : 1, s.big ? 2 : 1); });
    rect(0, 64, W, 40, '#0b1514'); rect(0, 78, W, 30, '#08100f'); rect(0, 64, W, 1, '#24403b');
    g.fillStyle = '#060c0b'; [[40, 74, 26, 3], [128, 82, 34, 4], [210, 72, 22, 3], [276, 80, 30, 4], [86, 70, 14, 2]].forEach((c) => blob(c[0], c[1], c[2], c[3]));
    g.strokeStyle = '#162623'; g.lineWidth = 1; [[160, 64, 40, 90], [160, 64, 120, 92], [160, 64, 200, 92], [160, 64, 280, 90]].forEach((l) => line(l[0], l[1], l[2], l[3]));
    // the plant, far off on the left, the way it looked from the cameras: a dome, two stacks, blinking lamps
    g.fillStyle = '#04080a'; g.beginPath(); g.ellipse(34, 64, 15, 10, 0, Math.PI, TAU); g.fill();
    poly([[10, 64], [18, 64], [17, 44], [12, 44]]); poly([[52, 64], [60, 64], [59, 49], [54, 49]]); rect(18, 61, 34, 3, '#04080a');
    if ((T * 1.2 | 0) % 2) rect(14, 42, 2, 2, '#e5484d');
    if ((T * 0.7 | 0) % 3 === 0) rect(56, 47, 2, 2, '#e5484d');
    [[26, 60], [32, 58], [40, 59], [46, 61]].forEach((p, i) => rect(p[0], p[1], 2, 1, Math.sin(T * 3 + i * 2) > -0.3 ? '#a07e2a' : '#3b3012'));
  }

  /* The creatures far off, walking up to the glass. They are drawn like the ones in the cameras. */
  const FIG = {
    walker(t, s) {
      const sway = Math.sin(t * 2.1 + s) * 3, stride = Math.sin(t * 3.4 + s);
      sil(() => {
        limb([[-5, -34], [-6 + stride * 4, -17], [-5 + stride * 6, 0]], 6); limb([[5, -34], [6 - stride * 4, -17], [5 - stride * 6, 0]], 6);
        poly([[-9, -34], [9, -34], [12 + sway * .3, -63], [-12 + sway * .3, -63]]);
        limb([[sway * .3, -62], [sway * .8 + 2, -68]], 5); blob(sway * .8 + 3, -72, 6, 7.5, .25);
        limb([[-11 + sway * .3, -60], [-16 + sway, -42], [-15 + sway * 1.5, -21]], 4.5); limb([[11 + sway * .3, -60], [16 + sway, -42], [15 + sway * 1.5, -21]], 4.5);
      });
      return [];
    },
    crawler(t, s) {
      const k = t * 11 + s;
      sil(() => {
        [-1, 1].forEach((d) => {
          for (let i = 0; i < 3; i++) limb([[d * 9, -11], [d * (20 + i * 5), -27 + i * 2], [d * (30 + i * 6) + Math.sin(k + i * 2.1 + (d > 0 ? 1.6 : 0)) * 3, 0]], 2.4);
          limb([[d * 6, -9], [d * 12 + Math.sin(k * .8) * 2, -4], [d * 10, 1]], 3);
        });
        blob(0, -12, 14, 9); blob(0, -19, 6, 6);
      });
      return [[-3, -20, '#ff3b3b'], [3, -20, '#ff3b3b'], [-1.2, -23.5, '#ff3b3b'], [1.2, -23.5, '#ff3b3b']];
    },
    brute(t, s) {
      const br = Math.sin(t * 1.5 + s) * 1.6, swing = Math.sin(t * 1.2 + s) * 3;
      sil(() => {
        limb([[-10, -32], [-11, -16], [-12, 0]], 11); limb([[10, -32], [11, -16], [12, 0]], 11);
        poly([[-18, -30], [18, -30], [27, -62 + br], [-27, -62 + br]]); blob(0, -62 + br, 25, 10); blob(0, -69 + br, 8.5, 7.5);
        limb([[-25, -60 + br], [-36 + swing, -42], [-34 + swing, -20]], 11); limb([[25, -60 + br], [36 - swing, -42], [34 - swing, -20]], 11);
        blob(-34 + swing, -14, 8, 9); blob(34 - swing, -14, 8, 9);
      });
      return [[-3.5, -70 + br, '#e8a030'], [3.5, -70 + br, '#e8a030']];
    },
    stalker(t, s) {
      const sw = Math.sin(t * 1.3 + s) * 4, tilt = Math.sin(t * .9 + s) * .35;
      sil(() => {
        limb([[-3, -50], [-4, -25], [-3, 0]], 3); limb([[3, -50], [4, -25], [3, 0]], 3);
        poly([[-5, -50], [5, -50], [6.5, -82], [-6.5, -82]]); limb([[0, -82], [sw * .5, -93]], 3); blob(sw * .5, -99, 4.2, 7.5, tilt);
        limb([[-6, -80], [-13 + sw, -52], [-11 + sw * 1.4, -14]], 2.4); limb([[6, -80], [13 + sw, -52], [11 + sw * 1.4, -14]], 2.4);
      });
      return [[sw * .5 - 1.6, -100, '#dff'], [sw * .5 + 1.6, -100, '#dff']];
    },
  };

  /* Where a creature that is still walking up stands: d = 1 far away at the horizon, 0 at the glass. */
  function comePose(m, d) {
    const k = 1 - d, p = PANES[m.pane];
    return { x: p.cx + Math.sin(T * 0.6 + m.seed) * 18 * d + m.off * d, gy: 64 + 36 * Math.pow(k, 1.3), s: (0.2 + 0.95 * Math.pow(k, 1.5)) * KIND[m.kind].size };
  }
  function headPos(m) {
    if (m.st === 'press' || (m.st === 'flee' && m.fromPress && m.ft < 0.35)) { const h = HEAD_AT[m.kind]; return { x: PANES[m.pane].cx + h[0], y: h[1] }; }
    const d = m.st === 'flee' ? lerp(m.d0, 1, ease((m.ft - (m.fromPress ? 0.35 : 0)) / 0.65)) : m.d, c = comePose(m, d);
    return { x: c.x, y: c.gy - KIND[m.kind].head * c.s };
  }

  /* A creature at the glass, face to face: the pale head, the hands flat on the pane. `o.scream` opens the face. */
  const PRESS = {
    walker(o) {
      const sw = Math.sin(T * 1.3 + o.seed) * 1.5, hx = o.hit * 3;
      sil(() => {
        poly([[-22, 18], [22, 18], [30, 80], [-30, 80]]); limb([[0, 8], [0, 18]], 7); blob(sw, 0, 8, 10, .12);
        [-1, 1].forEach((d) => { limb([[d * 20, 22], [d * (34 + hx), 22], [d * 28, 6]], 5); blob(d * 28, 3, 4, 5); });
      });
      g.fillStyle = '#aebfb9'; blob(sw, 0, 6.6, 8.6, .12);
      g.strokeStyle = '#8fa6a0'; [-1, 1].forEach((d) => { for (let i = 0; i < 5; i++) limb([[d * 28, 3], [d * (28 + (i - 2) * 3.6), -9 + Math.abs(i - 2) * 2.2]], 1.4); });
      if (o.scream > 0) {
        g.fillStyle = '#020505'; blob(sw - 2.7, -1.8, 1.9, 2.8); blob(sw + 2.7, -1.8, 1.9, 2.8); blob(sw, 5.2, 2.6, 4.6 + o.scream * 1.4);
        eye(sw - 2.7, -1.8, 1, 1, '#ffffff'); eye(sw + 2.7, -1.8, 1, 1, '#ffffff');
      }
    },
    brute(o) {
      const sw = Math.sin(T * 1.1 + o.seed), p = o.hit * 6;
      sil(() => {
        poly([[-30, 20], [30, 20], [40, 90], [-40, 90]]); blob(0, 18, 33, 9); blob(0, 2, 10, 9);
        [-1, 1].forEach((d) => { limb([[d * 30, 24], [d * 46, 34 - p], [d * 36, 10 - p]], 10); blob(d * 34, 6 - p, 8 + o.hit * 2, 9 + o.hit * 2); });
      });
      g.fillStyle = '#9fb0aa'; blob(0, 3, 6, 5.4);
      eye(-3.5 + sw * .3, 0, 2, 2, o.scream > 0 ? '#ffe9a8' : '#e8a030'); eye(3.5 + sw * .3, 0, 2, 2, o.scream > 0 ? '#ffe9a8' : '#e8a030');
      if (o.scream > 0) { g.fillStyle = '#020505'; blob(0, 7, 4, 3 + o.scream); }
    },
    crawler(o) {
      const k = T * 13 + o.seed, j = Math.sin(k) * (o.hit > 0 ? 1.4 : .4);
      g.save(); g.translate(j, 0);
      sil(() => {
        [-1, 1].forEach((d) => { for (let i = 0; i < 3; i++) limb([[d * 8, -22], [d * (22 + i * 6), -26 + i * 6], [d * (32 + i * 6) + Math.sin(k + i) * 2, -10 + i * 15]], 2.4); });
        blob(0, -22, 15, 8); blob(0, -10, 6, 7);
      });
      g.fillStyle = '#7d8e88'; blob(0, -9, 4.6, 5.4);
      [[-3, -10], [3, -10], [-1.2, -6.5], [1.2, -6.5]].forEach((e) => eye(e[0] + j, e[1], 1.4, 1.4, o.scream > 0 ? '#ffd0c0' : '#ff3b3b'));
      if (o.scream > 0) { g.fillStyle = '#020505'; blob(0, -4, 3, 2 + o.scream); }
      g.restore();
    },
    stalker(o) {
      const sw = Math.sin(T * 1.1 + o.seed) * 1.6, tap = o.hit * 4;
      sil(() => {
        limb([[-12, 80], [-14 + sw, 40], [-12, 10]], 3.5); blob(-12 + sw, 0, 5, 8, .5);
        limb([[-8, 70], [8, 50], [22, 22 + tap]], 2.4); limb([[22, 22 + tap], [24, 11 + tap]], 1.3); limb([[22, 22 + tap], [27, 13 + tap]], 1.1);
      });
      g.fillStyle = '#c9d4d0'; blob(-12 + sw, 0, 3.8, 6.8, .5);
      g.fillStyle = '#020505'; blob(-14 + sw, -1, 1.5, 2.6, .3); blob(-9.5 + sw, -1.6, 1.5, 2.6, .3);
      eye(-14 + sw, -1, 1, 1, '#ffffff'); eye(-9.5 + sw, -1.6, 1, 1, '#ffffff');
      if (o.scream > 0) { g.fillStyle = '#020505'; blob(-11 + sw, 4.5, 1.8, 3 + o.scream * 2); }
    },
  };
  const PRESS_AT = { walker: [0, 42], brute: [0, 46], crawler: [0, 30], stalker: [0, 36] };

  function drawMon(m) {
    const p = PANES[m.pane], alpha = m.st === 'flee' ? 1 - clamp((m.ft - 0.35) / 0.65, 0, 1) : 1;
    g.save(); g.globalAlpha = alpha;
    if (m.st === 'press' || (m.st === 'flee' && m.fromPress && m.ft < 0.35)) {
      const at = PRESS_AT[m.kind], scream = m.st === 'flee' ? 1 : m.face > 0 ? 0.6 : 0;
      const jit = m.lit > 0 || scream ? 1.1 : 0;
      g.save(); g.translate(p.cx + at[0] + (Math.random() - .5) * jit * 2, at[1] + (Math.random() - .5) * jit);
      glow.mark = glow.length; PRESS[m.kind]({ seed: m.seed, hit: m.pulse, scream: scream });
      g.restore();
      for (let i = glow.mark; i < glow.length; i++) { glow[i].x += p.cx + at[0]; glow[i].y += at[1]; }
    } else {
      const d = m.st === 'flee' ? lerp(m.d0, 1, ease((m.ft - (m.fromPress ? 0.35 : 0)) / 0.65)) : m.d, c = comePose(m, d);
      g.save(); g.translate(c.x, c.gy); g.scale(c.s, c.s);
      g.globalAlpha = alpha * 0.45; g.fillStyle = '#000'; blob(0, 1, 27, 5); g.globalAlpha = alpha;
      const eyes = FIG[m.kind](T, m.seed);
      g.restore();
      const squint = m.lit > 0 ? 0.5 : 1;
      eyes.forEach((e) => eye(c.x + e[0] * c.s, c.gy + e[1] * c.s, Math.max(1.6, 1.1), Math.max(1.4, 1.1 * squint), e[2], alpha));
    }
    g.restore();
  }

  function drawCracks(i) {
    const pn = panes[i];
    if (pn.broken) return;
    g.strokeStyle = 'rgba(205,235,228,.5)'; g.lineWidth = 1;
    pn.cracks.forEach((c) => { g.beginPath(); c.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); });
  }

  function scene() {
    glow.length = 0;
    outside();
    mons.forEach(drawMon);
    // the glass
    PANES.forEach((p, i) => {
      if (panes[i].broken) return;
      g.fillStyle = 'rgba(120,190,180,.05)'; poly(p.quad);
      g.fillStyle = 'rgba(200,240,230,.05)'; poly([[p.cx - 30, 14], [p.cx - 22, 14], [p.cx - 40, 84], [p.cx - 48, 84]]);
      g.fillStyle = 'rgba(200,240,230,.035)'; poly([[p.cx - 12, 14], [p.cx - 8, 14], [p.cx - 26, 84], [p.cx - 30, 84]]);
    });
    marks.forEach((m) => {
      g.fillStyle = 'rgba(170,195,188,' + (0.35 * clamp(m.life / 3, 0, 1)).toFixed(2) + ')'; blob(m.x, m.y, 3.4, 4.2);
      g.strokeStyle = g.fillStyle; for (let i = 0; i < 5; i++) line(m.x, m.y - 3, m.x + (i - 2) * 2.4, m.y - 9 + Math.abs(i - 2));
    });
    PANES.forEach((p, i) => drawCracks(i));
    shards.forEach((s) => { g.fillStyle = 'rgba(190,225,218,' + clamp(s.life, 0, 1).toFixed(2) + ')'; poly([[s.x, s.y], [s.x + s.w, s.y + 1], [s.x + 1, s.y + s.h]]); });
    // the cockpit around it
    rect(0, 0, W, 11, '#080d0e'); rect(0, 10, W, 1, '#1d2a2b');
    g.fillStyle = '#080d0e'; poly([[0, 11], [12, 20], [12, 86], [0, 95]]); poly([[W, 11], [308, 20], [308, 86], [W, 95]]);
    [[94, 12], [220, 12]].forEach((s) => { rect(s[0], s[1] - 1, 6, 76, '#0a1112'); rect(s[0], s[1] - 1, 1, 76, '#243436'); rect(s[0] + 5, s[1] - 1, 1, 76, '#04080a'); for (let y = 20; y < 80; y += 14) rect(s[0] + 2, y, 2, 1, '#1c2a2b'); });
    g.strokeStyle = '#1d2a2b'; g.lineWidth = 1; line(12, 20, 94, 12); line(226, 12, 308, 20);
    rect(0, 86, W, 9, '#060a0b'); rect(0, 86, W, 1, '#2a3a3a'); rect(0, 94, W, 1, '#16201f');
    rect(0, 95, W, 85, '#0d1517');
    [104, 214].forEach((x) => { rect(x, 95, 1, 85, '#1a2628'); rect(x + 1, 95, 1, 85, '#070c0d'); });
    rect(0, 95, W, 1, '#2a3b3d');
    // panel furniture
    drawCard();
    controls.forEach(drawControl);
    // launch lamps (always lit as far as the sequence has got: they glow in the dark)
    text('SEQ', 117, 99, '#8a7a4c', 'l');
    for (let i = 0; i < 6; i++) {
      rect(132 + i * 10, 98, 6, 3, '#14191a');
      const on = i < stage || (i === 5 && primeHold > 0 && Math.sin(T * 30) > -0.2);
      if (on) { g.globalAlpha = 1; glow.push({ x: 132 + i * 10, y: 98, w: 6, h: 3, c: '#e8b45a', a: 1 }); }
    }
  }

  function drawCard() {
    rect(6, 97, 46, 56, '#cfc7a8'); rect(6, 97, 46, 1, '#e8e1c6'); rect(6, 152, 46, 1, '#9a9378'); rect(22, 95, 14, 4, '#6a6a68');
    const ink = '#2a2418';
    text('START-UP', 9, 101, '#8a2a22', 'l');
    seq.forEach((id, i) => text((i + 1) + ' ' + NAMES[id], 9, 109 + i * 7, i < stage ? '#8a8570' : ink, 'l'));
    for (let i = 0; i < Math.min(stage, 5); i++) rect(9, 111 + i * 7, 40, 1, '#5a5548');
  }

  /* ── the darkness: only the beam and a little starlight in the windscreen get through ── */
  function darkness() {
    mg.globalCompositeOperation = 'source-over';
    mg.clearRect(0, 0, W, H);
    mg.fillStyle = 'rgba(3,6,7,' + clamp(0.93 - ambient * 0.6, 0, 1).toFixed(2) + ')'; mg.fillRect(0, 0, W, H);
    mg.globalCompositeOperation = 'destination-out';
    mg.fillStyle = 'rgba(0,0,0,.34)';                                        // starlight and the plant's glow through the glass
    PANES.forEach((p, i) => { if (!panes[i].broken) { mg.beginPath(); p.quad.forEach((q, k) => (k ? mg.lineTo(q[0], q[1]) : mg.moveTo(q[0], q[1]))); mg.closePath(); mg.fill(); } });
    if (!dark) {
      const r = BEAM + (mons.length ? (Math.random() - .5) * 3 : 0), ox = 160, oy = H + 6;
      const dx = aim.x - ox, dy = aim.y - oy, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
      mg.fillStyle = 'rgba(0,0,0,.2)';
      mg.beginPath(); mg.moveTo(ox + px * 6, oy + py * 6); mg.lineTo(aim.x + px * r, aim.y + py * r); mg.lineTo(aim.x - px * r, aim.y - py * r); mg.lineTo(ox - px * 6, oy - py * 6); mg.closePath(); mg.fill();
      mg.fillStyle = 'rgba(0,0,0,.45)';
      [1, .78, .55, .3].forEach((k) => { mg.beginPath(); mg.arc(aim.x, aim.y, r * k, 0, TAU); mg.fill(); });
    }
    g.drawImage(mk, 0, 0);
  }

  function frame() {
    const s = shake > 0 && !calm() ? shake : 0;
    g.setTransform(1, 0, 0, 1, Math.round((Math.random() - .5) * 2 * s * 2), Math.round((Math.random() - .5) * 2 * s * 2));
    g.fillStyle = '#020405'; g.fillRect(-4, -4, W + 8, H + 8);
    scene();
    darkness();
    // things that glow in the dark: eyes, lamps, and the fire of the engines
    glow.forEach((e) => { g.globalAlpha = e.a * 0.25; g.fillStyle = e.c; g.fillRect(Math.round(e.x - e.w), Math.round(e.y - e.h), e.w * 2 + 1, e.h * 2 + 1); g.globalAlpha = e.a; g.fillRect(Math.round(e.x - e.w / 2), Math.round(e.y - e.h / 2), Math.max(1, Math.round(e.w)), Math.max(1, Math.round(e.h))); });
    g.globalAlpha = 1;
    if (mode === 'win' || (mode === 'live' && primeHold > 0)) {
      const k = mode === 'win' ? clamp(endT / 1.2, 0, 1) : primeHold * 0.4;
      const gr = g.createLinearGradient(0, H, 0, 20); gr.addColorStop(0, 'rgba(240,170,70,' + (0.55 * k).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(240,170,70,0)');
      g.fillStyle = gr; g.fillRect(0, 20, W, H - 20);
    }
    if (!dark && mode !== 'off') {                                             // the torch on the glass, and the pointer itself
      if (aim.y < 86) { g.fillStyle = 'rgba(255,248,225,.2)'; blob(aim.x, aim.y, 7, 3); }
      g.fillStyle = 'rgba(255,240,200,.55)'; g.fillRect(Math.round(aim.x) - 3, Math.round(aim.y), 7, 1); g.fillRect(Math.round(aim.x), Math.round(aim.y) - 3, 1, 7);
    }
    if (mode === 'lose') {                                                      // what comes through
      const k = ease(endT / 0.9);
      panes.forEach((pn, i) => {
        if (!pn.broken) return;
        g.save(); g.translate(PANES[i].cx, 60); g.scale(1 + k * 1.6, 1 + k * 1.6); g.fillStyle = 'rgba(2,5,5,' + (k * 0.96).toFixed(2) + ')'; blob(0, 20, 34, 52); g.restore();
        if (k > 0.5) { g.fillStyle = 'rgba(255,255,255,' + (0.9 * (k - 0.5) * 2).toFixed(2) + ')'; g.fillRect(PANES[i].cx - 12, 52, 3, 2); g.fillRect(PANES[i].cx + 9, 52, 3, 2); }
      });
    }
    if (flash > 0) { g.fillStyle = 'rgba(' + flashCol + ',' + clamp(flash, 0, 1).toFixed(2) + ')'; g.fillRect(-4, -4, W + 8, H + 8); }
    if (mode === 'win' && endT > 2.4) { g.fillStyle = 'rgba(255,248,225,' + clamp((endT - 2.4) / 0.7, 0, 1).toFixed(2) + ')'; g.fillRect(-4, -4, W + 8, H + 8); }
  }

  /* ── the rules ────────────────────────────────────────────────────── */
  const free = () => PANES.map((p, i) => i).filter((i) => !panes[i].broken && !mons.some((m) => m.pane === i));
  function spawn() {
    const open = free();
    if (!open.length) return false;
    const pool = runT < 12 ? ['walker', 'crawler'] : runT < 28 ? ['walker', 'crawler', 'brute'] : ['walker', 'crawler', 'brute', 'stalker', 'walker'];
    const kind = pick(pool), K = KIND[kind];
    mons.push({ pane: pick(open), kind: kind, st: 'come', t: 0, d: 1, lit: 0, seed: Math.random() * 10, off: rand(-14, 14), face: 0, pulse: 0, stepT: 0.4, gap: K.hit[0], nextHit: 0, ft: 0, d0: 1, fromPress: false });
    return true;
  }

  function crack(pn, i, dmg, first) {
    const o = [PANES[i].cx + rand(-26, 26), rand(30, 66)], arms = Math.max(1, Math.round(dmg * 22)) + (first ? 1 : 0), len = 7 + pn.damage * 14;
    for (let a = 0; a < arms; a++) {
      let x = o[0], y = o[1], ang = rand(0, TAU); const pts = [[x, y]];
      for (let s = 0; s < 3; s++) { ang += rand(-0.6, 0.6); x += Math.cos(ang) * len * rand(0.3, 0.6); y += Math.sin(ang) * len * rand(0.3, 0.6); pts.push([x, y]); }
      pn.cracks.push(pts);
    }
    if (pn.cracks.length > 40) pn.cracks.splice(0, 4);
  }

  function strike(m, first) {
    const K = KIND[m.kind], pn = panes[m.pane];
    pn.damage = Math.min(cfg.god ? 0.97 : 1, pn.damage + K.dmg * (first ? 1.4 : 1));
    crack(pn, m.pane, K.dmg, first);
    m.pulse = 1; m.face = first ? 0.22 : 0.12;
    shake = Math.max(shake, m.kind === 'brute' ? 1.1 : first ? 1.2 : 0.5);
    sfx(first ? 'slap' : K.blow, m.pane, first ? 1.2 : 0.9);
    if (first) { flash = 0.28; flashCol = '210,235,228'; }
    if (Math.random() < 0.3) dark = Math.max(dark, rand(0.07, 0.18));
    [0.35, 0.6, 0.85].forEach((lv, k) => { if (pn.damage >= lv && pn.creak <= k) { pn.creak = k + 1; sfx('creak', m.pane, 1); } });
    if (pn.damage >= 1) breakPane(m.pane);
  }

  function breakPane(i) {
    if (mode !== 'live') return;
    mode = 'lose'; endT = 0; sent = false; panes[i].broken = true; holding = false;
    const p = PANES[i];
    for (let n = 0; n < 46; n++) shards.push({ x: rand(p.quad[0][0], p.quad[1][0]), y: rand(14, 80), w: rand(3, 8), h: rand(3, 9), vx: rand(-20, 20), vy: rand(-30, 20), life: rand(1, 1.8) });
    sfx('shatter'); sfx('shriek', i, 1); shake = 3; flash = 0.9; flashCol = '255,60,50'; bus.emit('fx:flash', '#ff2a2a');
  }

  function startFlee(m) {
    m.fromPress = m.st === 'press'; m.d0 = m.fromPress ? 0 : m.d; m.st = 'flee'; m.ft = 0;
    sfx('shriek', m.pane, 1); shake = Math.max(shake, 0.9);
    if (mode === 'live') { flash = 0.22; flashCol = '230,245,240'; }
    if (m.fromPress) { const p = PANES[m.pane]; marks.push({ x: p.cx - 28, y: 48, life: 7 }, { x: p.cx + 28, y: 48, life: 7 }); }
  }

  function updateMon(m, dt) {
    const K = KIND[m.kind];
    m.face = Math.max(0, m.face - dt); m.pulse = Math.max(0, m.pulse - dt * 6);
    if (m.st === 'come' || m.st === 'press') {
      const hp = headPos(m), hit = !dark && mode === 'live' && Math.hypot(aim.x - hp.x, aim.y - hp.y) < BEAM * 0.85 + 7;
      m.lit = hit ? m.lit + dt : Math.max(0, m.lit - dt * 1.4);
      if (m.lit >= K.tough) { startFlee(m); return; }
    }
    if (m.st === 'come') {
      m.t += dt; const k = clamp(m.t / K.come, 0, 1); m.d = 1 - k;
      m.stepT -= dt;
      if (m.stepT <= 0) { sfx(K.walk, m.pane, 0.25 + 0.75 * k); m.stepT = K.stepGap * (1.2 - 0.6 * k); }
      if (k >= 1) { m.st = 'press'; m.t = 0; strike(m, true); m.nextHit = m.gap; }
    } else if (m.st === 'press') {
      m.nextHit -= dt;
      if (m.nextHit <= 0) { strike(m, false); m.gap = Math.max(K.hit[1], m.gap * 0.94); m.nextHit = m.gap; }
    } else if (m.st === 'flee') {
      m.ft += dt; if (m.ft >= 1) m.dead = true;
    }
  }

  function surge() {                                   // a control was touched out of turn: the panel dumps everything
    controls.forEach((c) => { if (c.real) { c.on = 0; c.pos = 0; c.open = false; } });
    stage = 0; primeHold = 0; holding = false; shake = 1.3; flash = 0.4; flashCol = '255,70,50';
    sfx('ckreset'); forceSpawn = true;
  }
  function advance() { stage++; }

  function operate(c) {
    if (!c.real) {
      if (c.kind === 'push') { c.flash = 0.15; sfx('dead'); return; }
      if (c.kind === 'knob') c.pos = (c.pos + 1) % 4; else if (c.kind === 'lever') c.pos = (c.pos + 1) % 3; else c.on = c.on ? 0 : 1;
      sfx('flip', null, 1); return;
    }
    if (c.id === 'prime') return;
    if (c.id === 'arm' && !c.open) { c.open = true; sfx('flip'); return; }                // lifting the guard is harmless
    if (c.id !== seq[stage]) { surge(); return; }
    sfx('flip');
    if (c.kind === 'lever') { c.pos++; if (c.pos >= 2) advance(); } else { c.on = 1; advance(); }
  }

  function press() {
    if (mode !== 'live') return;
    const c = under(aim.x, aim.y);
    if (dark) { sfx('dead'); return; }
    if (!c) { sfx('dead'); return; }
    if (c.id === 'prime') { if (stage === 5) { holding = true; sfx('flip'); } else surge(); return; }
    operate(c);
  }
  function release() { holding = false; }

  function win() {
    mode = 'win'; endT = 0; sent = false; holding = false; primeHold = 1; ambient = 0;
    mons.forEach((m) => { if (m.st !== 'flee') startFlee(m); });
    sfx('ignite'); shake = 1.4;
  }

  function update(dt) {
    T += dt;
    shake = Math.max(0, shake - dt * 2.4); flash = Math.max(0, flash - dt * 1.6); dark = Math.max(0, dark - dt);
    marks.forEach((m) => { m.life -= dt; }); marks = marks.filter((m) => m.life > 0);
    shards.forEach((s) => { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 90 * dt; s.life -= dt * 0.7; }); shards = shards.filter((s) => s.life > 0);
    controls.forEach((c) => { if (c.flash > 0) c.flash -= dt; });
    // the torch follows the pointer a little late, like a hand
    const sp = Math.min(1, dt * 26);
    if (keys.ArrowLeft) target.x -= 110 * dt; if (keys.ArrowRight) target.x += 110 * dt; if (keys.ArrowUp) target.y -= 110 * dt; if (keys.ArrowDown) target.y += 110 * dt;
    target.x = clamp(target.x, 0, W); target.y = clamp(target.y, 0, H);
    aim.x += (target.x - aim.x) * sp; aim.y += (target.y - aim.y) * sp;

    if (mode === 'live') {
      runT += dt;
      blink -= dt; if (blink <= 0) { blink = rand(5, 9); if (!calm()) dark = Math.max(dark, 0.1); }
      spawnT -= dt;
      if (forceSpawn) { forceSpawn = false; if (mons.length < 3) spawn(); }
      if (spawnT <= 0) {
        const cap = runT < 14 ? 1 : runT < 35 ? 2 : 3;
        if (mons.length < cap && spawn()) spawnT = Math.max(3.4, 6 - runT * 0.04) + Math.random() * 1.2; else spawnT = 1.2;
      }
      const prime = byId('prime');
      if (holding && !dark && stage === 5 && Math.hypot(aim.x - prime.cx, aim.y - prime.cy) < 12) primeHold += dt / 1.5;
      else primeHold = Math.max(0, primeHold - dt * 1.2);
      if (primeHold >= 1) win();
    }
    mons.forEach((m) => updateMon(m, dt));
    mons = mons.filter((m) => !m.dead);

    if (mode === 'win') {
      endT += dt; ambient = clamp(endT / 1.4, 0, 1); shake = Math.max(shake, 0.8 + endT * 0.3);
      if (endT >= 3.1 && !sent) { sent = true; bus.emit('finale:done'); }
    } else if (mode === 'lose') {
      endT += dt;
      if (endT >= 1.9 && !sent) { sent = true; bus.emit('finale:failed'); }
    }
  }

  /* ── life cycle ───────────────────────────────────────────────────── */
  function loop(now) {
    if (mode === 'off') return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode !== 'intro') update(dt);
    frame();
  }

  function reset() {
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    stars = Array.from({ length: 70 }, () => ({ x: Math.floor(rnd() * W), y: 12 + Math.floor(rnd() * 48), b: .3 + rnd() * .7, p: rnd() * TAU, big: rnd() < .1 }));
    panes = PANES.map(() => ({ damage: 0, cracks: [], broken: false, creak: 0 }));
    mons = []; marks = []; shards = []; glow = []; build();
    aim = { x: 160, y: 130 }; target = { x: 160, y: 130 }; dark = 0; blink = rand(5, 9);
    T = 0; runT = 0; spawnT = 2; shake = 0; flash = 0; endT = 0; sent = false; ambient = 0; forceSpawn = false;
  }

  function start() {
    if (!root) return;
    reset(); mode = 'intro';
    introEl.hidden = false; root.hidden = false; void root.offsetWidth; root.classList.add('on');
    cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
    sfx('powerdown');
  }
  function begin() {
    if (mode !== 'intro') return;
    introEl.hidden = true; mode = 'live'; sfx('torch');
    cv.focus && cv.focus();
  }
  // After the ignition the screen is white. Freeze it there and let the launch film fade in over it before taking it away.
  function freezeThenHide() {
    mode = 'off'; cancelAnimationFrame(raf); holding = false; keys = {};
    setTimeout(() => { if (mode === 'off' && root) { root.classList.remove('on'); root.hidden = true; } }, 1200);
  }
  function stop() {
    mode = 'off'; cancelAnimationFrame(raf); holding = false; keys = {};
    if (root) { root.classList.remove('on'); root.hidden = true; }
  }

  function toCanvas(e) {
    const r = cv.getBoundingClientRect(), sc = Math.max(r.width / W, r.height / H);
    return { x: (e.clientX - r.left - (r.width - W * sc) / 2) / sc, y: (e.clientY - r.top - (r.height - H * sc) / 2) / sc };
  }

  function mount() {
    const stage = (CF.ui && CF.ui.stage) || document.body;
    root = document.createElement('div');
    root.className = 'ck';
    root.hidden = true;
    root.innerHTML = '<canvas class="ck-canvas" width="' + W + '" height="' + H + '" tabindex="0"></canvas>' +
      '<div class="ck-intro" hidden><div class="ck-box"><div class="ck-tag">THE SHIP · COCKPIT</div><h2>POWER IS OUT</h2>' +
      '<p>The crew are aboard and waiting for you to prime the ignition. There are no warnings and no safety systems left.</p>' +
      '<ul><li>You have a flashlight. Move the <b>mouse</b> to aim it; it is the only light.</li>' +
      '<li><b>Click</b> a control while the beam is on it. Follow the order on the <b>launch card</b>. Touch a live control out of turn and the panel dumps everything.</li>' +
      '<li>Finish with the PRIME button: <b>hold</b> it in the light until it catches.</li>' +
      '<li>Things are walking up to the windscreen. <b>Shine the light on them</b> and they run. Cracks stay; a broken pane is the end.</li></ul>' +
      '<p class="ck-keys">Keyboard: arrows aim, Space presses.</p><button class="ck-go">ENTER THE COCKPIT <kbd>ENTER</kbd></button></div></div>';
    stage.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    mk = document.createElement('canvas'); mk.width = W; mk.height = H; mg = mk.getContext('2d');
    introEl = root.querySelector('.ck-intro'); introGo = root.querySelector('.ck-go');
    introGo.addEventListener('click', begin);
    root.addEventListener('pointermove', (e) => { if (mode === 'off') return; const p = toCanvas(e); target.x = p.x; target.y = p.y; });
    root.addEventListener('pointerdown', (e) => { if (mode !== 'live') return; const p = toCanvas(e); target.x = aim.x = p.x; target.y = aim.y = p.y; e.preventDefault(); press(); });
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    document.addEventListener('keydown', (e) => {
      if (mode === 'off') return;
      if (mode === 'intro') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); begin(); } return; }
      if (e.key.indexOf('Arrow') === 0) { e.preventDefault(); keys[e.key] = true; }
      else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); }
    }, true);
    document.addEventListener('keyup', (e) => { delete keys[e.key]; if (e.key === ' ' || e.key === 'Enter') release(); });
    bus.on('phase:change', (e) => {
      if (e.phase === 'finale') start();
      else if (e.phase === 'win') { if (mode === 'win') freezeThenHide(); else stop(); }
      else stop();
    });
  }

  CF.cockpit = {
    start: start, begin: begin,
    // Test hooks: read the state, aim the beam and press, without a mouse.
    test: {
      get: () => ({ mode: mode, controls: controls, seq: seq, stage: stage, mons: mons, panes: panes, aim: aim, dark: dark, primeHold: primeHold, runT: runT }),
      aimAt: (x, y) => { target.x = aim.x = x; target.y = aim.y = y; },
      press: press, release: release, update: update, frame: frame,
    },
  };
  CF.register({ id: 'cockpit', slots: [], mount: mount });
})();
