/* MINIGAME: pipes. Rotate a scrambled, guaranteed route from source to cell. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const BIT = [1, 2, 4, 8], OPP = [4, 8, 1, 2];
  const rotate = (m) => ((m << 1) & 15) | (m >> 3);

  CF.minigames.pipes = {
    id: 'pipes', title: 'FUEL PIPELINE',
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const cols = [0, 3, 4, 5][level], rows = [0, 3, 4, 4][level];
      const cells = Array(cols * rows).fill(0), masks = Array(cols * rows).fill(0);
      const at = (x, y) => y * cols + x;
      let y = (Math.random() * rows) | 0;
      const source = y;
      let current = at(0, y);
      masks[current] |= 8;
      for (let x = 0; x < cols; x++) {
        current = at(x, y);
        if (x) { masks[current] |= 8; masks[at(x - 1, y)] |= 2; }
        if (x < cols - 1) {
          const step = Math.random() < (level === 1 ? .25 : .45) ? (Math.random() < .5 ? -1 : 1) : 0;
          const ny = Math.max(0, Math.min(rows - 1, y + step));
          if (ny !== y) {
            masks[current] |= ny > y ? 4 : 1;
            masks[at(x, ny)] |= ny > y ? 1 : 4;
            y = ny; current = at(x, y);
          }
        }
      }
      const target = y;
      masks[at(cols - 1, target)] |= 2;
      for (let i = 0; i < cells.length; i++) {
        let m = masks[i] || [5, 10, 3, 6, 12, 9, 7][(Math.random() * 7) | 0];
        const turns = (Math.random() * 4) | 0;
        for (let k = 0; k < turns; k++) m = rotate(m);
        cells[i] = m;
      }
      while (cells[source * cols] & 8) cells[source * cols] = rotate(cells[source * cols]);
      el.innerHTML = '<div class="pp"><div class="pp-instruction">Arrows select. Space or click rotates a pipe.</div><div class="pp-board"></div><div class="pp-status">SOURCE → FUEL CELL</div></div>';
      const board = el.querySelector('.pp-board'), status = el.querySelector('.pp-status');
      board.style.setProperty('--pp-cols', cols);
      let cursor = source * cols, lit = new Set(), stopped = false;

      function trace() {
        const seen = new Set(), queue = [];
        if (cells[source * cols] & 8) { seen.add(source * cols); queue.push(source * cols); }
        for (let q = 0; q < queue.length; q++) {
          const i = queue[q], x = i % cols, row = (i / cols) | 0;
          [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => {
            const nx = x + dx, ny = row + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !(cells[i] & BIT[d])) return;
            const ni = at(nx, ny);
            if (!seen.has(ni) && cells[ni] & OPP[d]) { seen.add(ni); queue.push(ni); }
          });
        }
        lit = seen;
        return seen.has(at(cols - 1, target)) && !!(cells[at(cols - 1, target)] & 2);
      }
      function render() {
        board.innerHTML = cells.map((m, i) => '<button class="pp-tile' + (i === cursor ? ' pp-selected' : '') + (lit.has(i) ? ' pp-lit' : '') + (i === source * cols ? ' pp-source' : '') + (i === at(cols - 1, target) ? ' pp-drain' : '') + '" data-i="' + i + '" aria-label="Rotate pipe">' +
          '<span class="pp-center"></span>' + BIT.map((b, d) => m & b ? '<span class="pp-arm pp-arm-' + d + '"></span>' : '').join('') + '</button>').join('');
        status.textContent = 'SOURCE → FUEL CELL · ' + lit.size + ' LIT';
      }
      function turn(i) {
        if (stopped) return;
        cursor = i; cells[i] = rotate(cells[i]); bus.emit('sfx', 'click');
        const solved = trace(); render();
        if (solved) { stopped = true; status.textContent = 'FLOW CONNECTED'; bus.emit('sfx', 'chime'); done(true); }
      }
      function onKey(e) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
        e.preventDefault(); if (e.repeat) return;
        if (e.key === ' ') { turn(cursor); return; }
        const x = cursor % cols, y = (cursor / cols) | 0;
        cursor = at(Math.max(0, Math.min(cols - 1, x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0))),
          Math.max(0, Math.min(rows - 1, y + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))));
        render();
      }
      function onClick(e) { const tile = e.target.closest('[data-i]'); if (tile && board.contains(tile)) turn(Number(tile.dataset.i)); }
      trace(); render();
      document.addEventListener('keydown', onKey); board.addEventListener('click', onClick);
      return { cancel() { stopped = true; document.removeEventListener('keydown', onKey); board.removeEventListener('click', onClick); } };
    },
  };
})();
