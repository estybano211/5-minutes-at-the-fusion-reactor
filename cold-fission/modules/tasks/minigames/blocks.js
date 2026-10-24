/* MINIGAME: blocks. A tiny Tetris. Clear target rows before the tasks timer runs out. Options:
   { rows: how many rows to clear, garbage: how many half-built rows to start with }. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};

  const COLS = 8, ROWS = 10, CELL = 22;
  const SHAPES = {
    I: ['0000', '1111', '0000', '0000'],
    O: ['11', '11'],
    T: ['010', '111', '000'],
    S: ['011', '110', '000'],
    Z: ['110', '011', '000'],
    J: ['100', '111', '000'],
    L: ['001', '111', '000'],
  };
  const COLORS = { I: '#6fb7b0', O: '#e8b45a', T: '#9a7fe0', S: '#7fcf8a', Z: '#e5484d', J: '#7fb8d9', L: '#d98c5f', G: '#33524d' };
  const DROP = [1.0, 0.85, 0.7];                    // seconds per row, by difficulty

  const matrix = (rows) => rows.map((r) => r.split('').map(Number));
  const rotateCW = (m) => m.map((_, r) => m.map((__, c) => m[m.length - 1 - c][r]));
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
  const topRow = (m) => m.findIndex((r) => r.some(Boolean));

  CF.minigames.blocks = {
    id: 'blocks',
    title: 'CIRCUIT BLOCKS',
    tips: {
      goal: 'The power grid is jammed with loose circuit blocks. Fill a full row with no gaps to clear it and reroute the power.',
      keys: [
        '← → move the falling block. SPACE rotates it.',
        '↓ drops it faster. ↑ drops it all the way down at once.',
        'A row with no gaps disappears. Clear the number shown beside the board.',
      ],
      hint: 'If the stack reaches the top, the board resets, so you do not lose. Look for the gaps in the bottom rows first.',
    },
    start(el, done, opts) {
      opts = opts || {};
      const goal = opts.rows || 1;
      const garbage = Math.min(opts.garbage || 2, ROWS - 5);
      const difficulty = Math.max(1, Math.min(3, opts.difficulty || 1));
      const day = Math.max(1, Math.min(3, opts.day || 1));
      const dropEvery = DROP[difficulty - 1] * (1 - (day - 1) * .025);

      el.innerHTML = `
        <div class="bk">
          <div class="bk-main">
            <canvas class="bk-board" width="${COLS * CELL}" height="${ROWS * CELL}"></canvas>
            <div class="bk-side">
              <div class="bk-label">CLEAR</div><div class="bk-rows">0/${goal}</div>
              <div class="bk-label">NEXT</div><canvas class="bk-next" width="66" height="44"></canvas>
              <div class="bk-msg"></div>
            </div>
          </div>
          <div class="bk-pad">
            <button class="bk-btn" data-k="left">◀</button><button class="bk-btn" data-k="rot">ROTATE</button>
            <button class="bk-btn" data-k="right">▶</button><button class="bk-btn" data-k="drop">DROP</button>
          </div>
          <div class="bk-keys">← → move · ↓ soft drop · ↑ hard drop · Space rotate</div>
        </div>`;
      const g = el.querySelector('.bk-board').getContext('2d');
      const gn = el.querySelector('.bk-next').getContext('2d');
      const rowsEl = el.querySelector('.bk-rows'), msgEl = el.querySelector('.bk-msg');

      let board, piece = null, next = null, bag = [], cleared = 0, acc = 0, lockWait = 0, freeze = 0, soft = false, stopped = false, last = performance.now(), raf = 0;

      const fresh = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      function resetBoard() {
        board = fresh();
        for (let i = 0; i < garbage; i++) {
          const row = Array(COLS).fill('G');
          const gaps = 1 + (Math.random() < 0.4 ? 1 : 0);
          for (let k = 0; k < gaps; k++) row[(Math.random() * COLS) | 0] = 0;
          board[ROWS - 1 - i] = row;
        }
      }
      function makePiece() {
        if (!bag.length) bag = shuffle(Object.keys(SHAPES));
        const k = bag.pop(), m = matrix(SHAPES[k]);
        return { k: k, m: m, x: Math.floor((COLS - m.length) / 2), y: -topRow(m) };
      }
      const collide = (m, x, y) => m.some((row, r) => row.some((v, c) => {
        if (!v) return false;
        const bx = x + c, by = y + r;
        return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx]);
      }));

      function spawn() {
        piece = next || makePiece();
        next = makePiece();
        lockWait = 0;
        if (collide(piece.m, piece.x, piece.y)) {
          // The stack reached the top: start over from the opening board and pause briefly, instead of
          // locking a fresh piece every frame.
          resetBoard();
          freeze = .9; acc = 0; soft = false;
          msgEl.textContent = 'STACK FULL · RESET';
          bus.emit('sfx', 'deny');
        }
      }

      function lock() {
        piece.m.forEach((row, r) => row.forEach((v, c) => { if (v && piece.y + r >= 0) board[piece.y + r][piece.x + c] = piece.k; }));
        let n = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (board[r].every(Boolean)) { board.splice(r, 1); board.unshift(Array(COLS).fill(0)); n++; r++; }
        }
        bus.emit('sfx', n ? 'ok' : 'click');
        if (n) {
          cleared += n;
          rowsEl.textContent = Math.min(cleared, goal) + '/' + goal;
          msgEl.textContent = '';
          if (cleared >= goal) { stopped = true; draw(); done(true); return; }
        }
        spawn();
      }

      const move = (dx) => { if (!stopped && freeze <= 0 && !collide(piece.m, piece.x + dx, piece.y)) { piece.x += dx; lockWait = 0; } };
      function rot() {
        if (stopped || freeze > 0) return;
        const m = rotateCW(piece.m);
        for (const dx of [0, -1, 1, -2, 2]) { if (!collide(m, piece.x + dx, piece.y)) { piece.m = m; piece.x += dx; lockWait = 0; return; } }
      }
      function step() { if (!collide(piece.m, piece.x, piece.y + 1)) { piece.y++; lockWait = 0; } }
      function hardDrop() { if (stopped || freeze > 0) return; while (!collide(piece.m, piece.x, piece.y + 1)) piece.y++; lock(); }

      function cell(ctx, x, y, color, s) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
      }
      function draw() {
        g.fillStyle = '#050909'; g.fillRect(0, 0, COLS * CELL, ROWS * CELL);
        g.strokeStyle = '#122220';
        for (let c = 1; c < COLS; c++) { g.beginPath(); g.moveTo(c * CELL + .5, 0); g.lineTo(c * CELL + .5, ROWS * CELL); g.stroke(); }
        board.forEach((row, r) => row.forEach((v, c) => { if (v) cell(g, c, r, COLORS[v], CELL); }));
        if (piece && !stopped) {
          let gy = piece.y;
          while (!collide(piece.m, piece.x, gy + 1)) gy++;
          g.globalAlpha = 0.25;
          piece.m.forEach((row, r) => row.forEach((v, c) => { if (v && gy + r >= 0) cell(g, piece.x + c, gy + r, COLORS[piece.k], CELL); }));
          g.globalAlpha = 1;
          piece.m.forEach((row, r) => row.forEach((v, c) => { if (v && piece.y + r >= 0) cell(g, piece.x + c, piece.y + r, COLORS[piece.k], CELL); }));
        }
        gn.fillStyle = '#050909'; gn.fillRect(0, 0, 66, 44);
        if (next) {
          const m = next.m, off = (4 - m.length) * 5;
          m.forEach((row, r) => row.forEach((v, c) => { if (v) cell(gn, c + 0.4, r + 0.2 + off / 11, COLORS[next.k], 11); }));
        }
      }

      function frame(now) {
        if (stopped) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.25); last = now;
        if (freeze > 0) {
          freeze -= dt;
          if (freeze <= 0) { msgEl.textContent = ''; acc = 0; }
          draw();
          return;
        }
        acc += dt;
        const every = soft ? 0.05 : dropEvery;
        while (acc >= every && !stopped) { acc -= every; step(); }
        if (collide(piece.m, piece.x, piece.y + 1)) {
          lockWait += dt;
          if (lockWait >= .38) lock();
        }
        draw();
      }

      const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'drop', ' ': 'rot', ArrowDown: 'down' };
      const act = (k) => { if (k === 'left') move(-1); else if (k === 'right') move(1); else if (k === 'rot') rot(); else if (k === 'drop') hardDrop(); };
      function onKey(e) {
        const k = KEYS[e.key];
        if (!k) return;
        e.preventDefault();
        if (k === 'down') { soft = true; return; }
        if (!e.repeat || k === 'left' || k === 'right') act(k);
      }
      const onUp = (e) => { if (KEYS[e.key] === 'down') { e.preventDefault(); soft = false; } };
      const onClick = (e) => { const b = e.target.closest('.bk-btn'); if (b && el.contains(b)) act(b.dataset.k); };
      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onUp);
      el.addEventListener('click', onClick);

      resetBoard();
      spawn();
      raf = requestAnimationFrame(frame);

      return {
        cancel() {
          stopped = true;
          cancelAnimationFrame(raf);
          document.removeEventListener('keydown', onKey);
          document.removeEventListener('keyup', onUp);
          el.removeEventListener('click', onClick);
        },
      };
    },
  };
})();
