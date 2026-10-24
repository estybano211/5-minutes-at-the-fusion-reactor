/* MINIGAME: shield. One plasma ball at a time flies at the core; keep the shield on that side to bounce it off. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const DIRS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const CX = 160, CY = 88, GUARD = 22;                       // core position and shield distance from it
  const EDGE = [76, 128, 76, 128];                           // where the ball appears, per side

  CF.minigames.shield = {
    id: 'shield', title: 'CORE SHIELD',
    tips: {
      goal: 'Debris is flying at the nav core. Block it with the shield and the crew member can keep walking.',
      keys: [
        'One ball comes at a time, from the top, bottom, left or right.',
        'Press an ARROW KEY to put the shield on that side. SPACE turns it one step clockwise.',
        'Catch the ball on the shield to bounce it away. If it gets past, you lose progress.',
      ],
      hint: 'Watch which edge the ball appears on, then turn the shield before it arrives.',
    },
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const day = Math.max(1, Math.min(3, opts.day || 1));
      const needed = [0, 4, 5, 6][level];                       // blocks to bounce (70% of the earlier 5 / 7 / 9)
      const flight = [0, 1.15, .95, .8][level] * (1 - (day - 1) * .025);   // seconds from the edge to the shield
      const pause = [0, .45, .35, .3][level];
      el.innerHTML = '<div class="sh"><div class="sh-instruction">Arrows face the shield · Space turns it · bounce every ball</div><div class="sh-meter"><i></i></div><canvas class="sh-arena" width="320" height="176"></canvas><div class="sh-pad"><button data-dir="0">↑</button><button data-dir="3">←</button><button data-dir="1">→</button><button data-dir="2">↓</button></div></div>';
      const canvas = el.querySelector('.sh-arena'), g = canvas.getContext('2d');
      const meter = el.querySelector('.sh-meter i');
      let facing = 0, blocks = 0, ball = null, echoes = [], rest = .5, bits = [], last = performance.now(), raf = 0, stopped = false, flash = 0, pulse = 0;

      function face(n) { facing = n; bus.emit('sfx', 'click'); }
      function onKey(e) {
        const n = DIRS.indexOf(e.key);
        if (n < 0 && e.key !== ' ') return;
        e.preventDefault();
        if (e.repeat) return;
        face(n < 0 ? (facing + 1) % 4 : n);
      }
      function onClick(e) {
        const b = e.target.closest('[data-dir]');
        if (b && el.contains(b)) face(Number(b.dataset.dir));
      }
      function spark(x, y, color, n) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 70;
          bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .35 + Math.random() * .2, color: color });
        }
      }
      function ballPos(b) {
        const r = b.t == null ? GUARD + b.out : GUARD + (EDGE[b.side] - GUARD) * (1 - b.t / flight);
        const v = VEC[b.side];
        return [CX + v[0] * r, CY + v[1] * r];
      }
      function resolve() {
        const hit = ball.side === facing;
        const [x, y] = ballPos(ball);
        if (hit) {
          blocks++; pulse = .18; spark(x, y, '#9fe8df', 10);
          bus.emit('sfx', 'ok');
          echoes.push({ side: ball.side, out: 0 });             // the bounced ball flies back out
        } else {
          blocks = Math.max(0, blocks - .6); flash = .22; spark(CX, CY, '#e5484d', 12);
          bus.emit('sfx', 'deny');
        }
        ball = null;
        rest = pause;
      }
      function drawShield() {
        const v = VEC[facing], x = CX + v[0] * GUARD, y = CY + v[1] * GUARD;
        g.fillStyle = pulse > 0 ? '#d8fffa' : '#6fb7b0';
        if (facing % 2) g.fillRect(x - 3, y - 24, 7, 48); else g.fillRect(x - 24, y - 3, 48, 7);
        g.fillStyle = 'rgba(111,183,176,.25)';
        if (facing % 2) g.fillRect(x - 6 + v[0] * 4, y - 24, 4, 48); else g.fillRect(x - 24, y - 6 + v[1] * 4, 48, 4);
      }
      function draw() {
        g.fillStyle = flash > 0 ? '#2a1519' : '#070e10';
        g.fillRect(0, 0, 320, 176);
        g.strokeStyle = '#1b282b';
        g.setLineDash([3, 6]);
        g.beginPath(); g.moveTo(CX, 8); g.lineTo(CX, 168); g.moveTo(14, CY); g.lineTo(306, CY); g.stroke();
        g.setLineDash([]);
        g.strokeStyle = '#2a3438'; g.beginPath(); g.arc(CX, CY, GUARD + 10, 0, Math.PI * 2); g.stroke();
        // the nav core
        g.fillStyle = '#e8b45a'; g.fillRect(CX - 8, CY - 8, 16, 16);
        g.fillStyle = '#070e10'; g.fillRect(CX - 3, CY - 3, 6, 6);
        drawShield();
        if (ball) {
          const [x, y] = ballPos(ball), v = VEC[ball.side];
          g.fillStyle = 'rgba(232,180,90,.25)';
          for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(x + v[0] * i * 7, y + v[1] * i * 7, 5 - i, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#e8b45a';
          g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
        } else if (rest < .25 && !stopped) {
          // a small arrow on the edge shows where the next ball is about to appear
          const v = VEC[next], x = CX + v[0] * EDGE[next], y = CY + v[1] * EDGE[next];
          g.fillStyle = 'rgba(229,72,77,.8)'; g.fillRect(x - 3 - Math.abs(v[1]) * 4, y - 3 - Math.abs(v[0]) * 4, 6 + Math.abs(v[1]) * 8, 6 + Math.abs(v[0]) * 8);
        }
        echoes.forEach((b) => { const [x, y] = ballPos(b); g.fillStyle = '#9fe8df'; g.globalAlpha = Math.max(0, 1 - b.out / 110); g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
        bits.forEach((b) => { g.fillStyle = b.color; g.globalAlpha = Math.max(0, b.life * 2.5); g.fillRect(b.x | 0, b.y | 0, 2, 2); });
        g.globalAlpha = 1;
      }

      let next = (Math.random() * 4) | 0;
      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        flash = Math.max(0, flash - dt); pulse = Math.max(0, pulse - dt);
        bits.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; });
        bits = bits.filter((b) => b.life > 0);
        echoes.forEach((b) => { b.out += 170 * dt; });
        echoes = echoes.filter((b) => b.out < 110);
        if (ball) {
          ball.t += dt;
          if (ball.t >= flight) resolve();
        } else {
          rest -= dt;
          if (rest <= 0) { ball = { side: next, t: 0 }; next = (Math.random() * 4) | 0; }
        }
        meter.style.width = Math.min(100, blocks / needed * 100) + '%';
        draw();
        if (blocks >= needed) { stopped = true; bus.emit('sfx', 'chime'); done(true); return; }
        raf = requestAnimationFrame(frame);
      }
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', onClick);
      raf = requestAnimationFrame(frame);
      return { cancel() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); el.removeEventListener('click', onClick); } };
    },
  };
})();
