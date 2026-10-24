/* MINIGAME: shield. Face incoming sparks to advance toward the core. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const DIRS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  const VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  CF.minigames.shield = {
    id: 'shield', title: 'CORE SHIELD',
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const day = Math.max(1, Math.min(3, opts.day || 1));
      const needed = [0, 8, 11, 14][level];
      const approach = [0, 1.45, 1.15, 0.96][level] * (1 - (day - 1) * .025);
      const gap = [0, 1.05, .82, .68][level];
      el.innerHTML = '<div class="sh"><div class="sh-instruction">Arrows face · Space turns. Block sparks to reach the core.</div><div class="sh-meter"><i></i></div><canvas class="sh-arena" width="320" height="176"></canvas><div class="sh-pad"><button data-dir="0">↑</button><button data-dir="3">←</button><button data-dir="1">→</button><button data-dir="2">↓</button></div></div>';
      const canvas = el.querySelector('.sh-arena'), g = canvas.getContext('2d');
      const meter = el.querySelector('.sh-meter i');
      let facing = 0, blocks = 0, sparks = [], spawnIn = .45, last = performance.now(), raf = 0, stopped = false, flash = 0;

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
      function spawn() {
        const side = (Math.random() * 4) | 0;
        sparks.push({ side: side, t: 0 });
      }
      function draw() {
        g.fillStyle = flash > 0 ? '#29161a' : '#070e10';
        g.fillRect(0, 0, 320, 176);
        g.strokeStyle = '#2a3438';
        g.strokeRect(35, 12, 250, 152);
        g.setLineDash([4, 7]);
        g.beginPath(); g.moveTo(160, 12); g.lineTo(160, 164); g.moveTo(35, 88); g.lineTo(285, 88); g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#e8b45a'; g.fillRect(154, 82, 12, 12);
        const v = VEC[facing];
        g.fillStyle = '#6fb7b0';
        if (facing % 2) g.fillRect(160 + v[0] * 19 - 4, 68, 8, 40);
        else g.fillRect(140, 88 + v[1] * 19 - 4, 40, 8);
        sparks.forEach((s) => {
          const a = VEC[s.side], p = 1 - s.t / approach;
          g.fillStyle = '#e8b45a';
          g.fillRect(156 + a[0] * 120 * p, 84 + a[1] * 72 * p, 8, 8);
        });
      }
      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        spawnIn -= dt; flash = Math.max(0, flash - dt);
        if (spawnIn <= 0) {
          spawn();
          if (level >= 2 && Math.random() < (level === 2 ? .38 : .26)) {
            sparks.push({ side: (sparks[sparks.length - 1].side + 2) % 4, t: -.17 });
          }
          spawnIn += gap;
        }
        sparks.forEach((s) => { s.t += dt; });
        const arrived = sparks.filter((s) => s.t >= approach);
        sparks = sparks.filter((s) => s.t < approach);
        arrived.forEach((s) => {
          if (facing === s.side) { blocks++; bus.emit('sfx', 'ok'); }
          else { blocks = Math.max(0, blocks - .55); flash = .18; bus.emit('sfx', 'deny'); }
        });
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
