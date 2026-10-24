/* MINIGAME: flow. Lay queued pipes ahead of slow coolant; leaks only pause it. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const BIT = [1, 2, 4, 8];
  function pipe(m) {
    return '<span class="fl-center"></span>' + BIT.map((b, d) => m & b ? '<span class="fl-arm fl-arm-' + d + '"></span>' : '').join('');
  }

  CF.minigames.flow = {
    id: 'flow', title: 'COOLANT LOOP',
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const day = Math.max(1, Math.min(3, opts.day || 1));
      const cols = [0, 5, 6, 7][level], rows = 3;
      const startRow = 1, bendRow = level === 2 ? 2 : 0;
      const path = [];
      for (let x = 0; x < cols; x++) {
        path.push([x, x < 2 ? startRow : bendRow]);
        if (x === 1) path.push([x, bendRow]);
      }
      const at = (x, y) => y * cols + x;
      const route = path.map(([x, y]) => at(x, y));
      const need = Array(cols * rows).fill(0), placed = Array(cols * rows).fill(0);
      path.forEach(([x, y], i) => {
        const before = path[i - 1] || [-1, startRow], after = path[i + 1] || [cols, bendRow];
        for (const [nx, ny] of [before, after]) {
          if (nx > x) need[at(x, y)] |= 2;
          if (nx < x) need[at(x, y)] |= 8;
          if (ny > y) need[at(x, y)] |= 4;
          if (ny < y) need[at(x, y)] |= 1;
        }
      });
      if (level === 3) need[route[3]] = 15;
      const speed = [0, 1.75, 1.4, 1.13][level] * (1 - (day - 1) * .025);
      el.innerHTML = '<div class="fl"><div class="fl-instruction">Arrows select. Space or click places the next pipe.</div><div class="fl-board"></div><div class="fl-footer"><span class="fl-state">FLOW STARTING</span><span class="fl-progress"></span></div><div class="fl-queue"></div></div>';
      const board = el.querySelector('.fl-board'), state = el.querySelector('.fl-state');
      const progress = el.querySelector('.fl-progress'), preview = el.querySelector('.fl-queue');
      board.style.setProperty('--fl-cols', cols);
      let cursor = route[0], flowed = -1, clock = 2.1, leak = 0, stopped = false, raf = 0, last = performance.now();
      function pending() { return route.map((i, n) => n).filter((n) => n > flowed && placed[route[n]] !== need[route[n]]); }
      function render() {
        const waiting = pending(), next = waiting.length ? waiting[0] : -1;
        board.innerHTML = placed.map((m, i) => {
          const n = route.indexOf(i), onPath = n >= 0;
          return '<button class="fl-tile' + (cursor === i ? ' fl-selected' : '') + (onPath ? ' fl-route' : '') + (n >= 0 && n <= flowed ? ' fl-wet' : '') + (n === next ? ' fl-target' : '') + (n === 0 ? ' fl-source' : '') + (n === route.length - 1 ? ' fl-drain' : '') + '" data-i="' + i + '" aria-label="Place pipe">' + (m ? pipe(m) : '') + '</button>';
        }).join('');
        preview.innerHTML = '<span>NEXT</span>' + [0, 1, 2].map((offset) => {
          const n = waiting[offset] == null ? route.length - 1 : waiting[offset];
          return '<span class="fl-preview">' + pipe(need[route[n]]) + '</span>';
        }).join('');
        state.textContent = leak > 0 ? 'LEAK · HOLD' : clock > 0 && flowed < 0 ? 'FLOW STARTING' : 'COOLANT FLOWING';
        progress.textContent = Math.max(0, flowed + 1) + ' / ' + route.length;
      }
      function place(i) {
        if (stopped) return;
        cursor = i;
        const next = pending()[0];
        if (next == null || route.indexOf(i) <= flowed) { bus.emit('sfx', 'deny'); render(); return; }
        placed[i] = need[route[next]];
        bus.emit('sfx', 'click'); render();
      }
      function onKey(e) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
        e.preventDefault(); if (e.repeat) return;
        if (e.key === ' ') { place(cursor); return; }
        const x = cursor % cols, y = (cursor / cols) | 0;
        cursor = at(Math.max(0, Math.min(cols - 1, x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0))),
          Math.max(0, Math.min(rows - 1, y + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))));
        render();
      }
      function onClick(e) { const tile = e.target.closest('[data-i]'); if (tile && board.contains(tile)) place(Number(tile.dataset.i)); }
      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        let changed = false;
        if (leak > 0) { leak -= dt; changed = leak <= 0; }
        else {
          clock -= dt;
          if (clock <= 0) {
            const n = flowed + 1;
            if (placed[route[n]] === need[route[n]]) {
              flowed = n; bus.emit('sfx', 'ok');
              if (flowed === route.length - 1) { stopped = true; render(); bus.emit('sfx', 'chime'); done(true); return; }
              clock = speed;
            } else { leak = 1.5; clock = .2; bus.emit('sfx', 'deny'); }
            changed = true;
          }
        }
        if (changed) render();
        raf = requestAnimationFrame(frame);
      }
      render(); document.addEventListener('keydown', onKey); board.addEventListener('click', onClick);
      raf = requestAnimationFrame(frame);
      return { cancel() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); board.removeEventListener('click', onClick); } };
    },
  };
})();
