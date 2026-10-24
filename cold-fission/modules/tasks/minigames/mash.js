/* MINIGAME: mash. Follow changing prompts to seat the thruster coupler. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const KEYS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', ' '];
  const LABELS = ['←', '↑', '↓', '→', 'SPACE'];

  CF.minigames.mash = {
    id: 'mash', title: 'THRUSTER COUPLER',
    tips: {
      goal: 'The coupler release is jammed. Enter 12 key prompts to slide the coupler into its socket.',
      keys: [
        'A big key prompt shows what to press: an ARROW KEY or SPACE.',
        'Press it, and the next prompt appears. The prompts keep changing.',
        'A wrong key shakes the prompt, and on the harder rounds it pushes the coupler back one step.',
      ],
      hint: 'The small row under the prompt shows what comes next, so you can read ahead.',
    },
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const goal = 12;                                  // always 12 correct inputs
      const pool = level === 1 ? 4 : 5;
      el.innerHTML = '<div class="ms"><div class="ms-instruction">Press the shown arrow or Space. Keep the coupler moving.</div><div class="ms-track"><div class="ms-coupler"></div><div class="ms-socket">SOCKET</div></div><div class="ms-main"><span class="ms-prompt"></span><span class="ms-count"></span></div><div class="ms-next"></div><div class="ms-pad">' + LABELS.slice(0, pool).map((s, i) => '<button data-key="' + i + '">' + s + '</button>').join('') + '</div></div>';
      const root = el.querySelector('.ms'), coupler = el.querySelector('.ms-coupler');
      const prompt = el.querySelector('.ms-prompt'), count = el.querySelector('.ms-count'), next = el.querySelector('.ms-next');
      let queue = [], progress = 0, correct = 0, doubleLeft = 0, doubleTime = 0;
      let last = performance.now(), raf = 0, stopped = false, shake = 0;
      function makeNext() {
        let n;
        do { n = (Math.random() * pool) | 0; } while (queue.length && n === queue[queue.length - 1]);
        queue.push(n);
      }
      function render() {
        prompt.textContent = LABELS[queue[0]];
        count.textContent = Math.floor(progress) + ' / ' + goal;
        next.textContent = (doubleLeft ? 'DOUBLE BEAT · ' : 'NEXT  ') + queue.slice(1).map((n) => LABELS[n]).join('   ');
        coupler.style.left = (4 + Math.min(1, progress / goal) * 72) + '%';
        root.classList.toggle('ms-shake', shake > 0);
      }
      function press(n) {
        if (stopped) return;
        if (n !== queue[0]) { shake = .18; if (level > 1) progress = Math.max(0, progress - 1); bus.emit('sfx', 'deny'); render(); return; }
        progress += 1; correct++;
        if (doubleLeft) doubleLeft--;
        if (level === 3 && correct === 6) { doubleLeft = 2; doubleTime = 1.6; }
        bus.emit('sfx', 'click');
        queue.shift(); makeNext();
        if (progress >= goal) { stopped = true; render(); bus.emit('sfx', 'chime'); done(true); return; }
        render();
      }
      function onKey(e) { const n = KEYS.indexOf(e.key); if (n < 0 || n >= pool) return; e.preventDefault(); if (!e.repeat) press(n); }
      function onClick(e) { const b = e.target.closest('[data-key]'); if (b && root.contains(b)) press(Number(b.dataset.key)); }
      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        if (doubleLeft) {
          doubleTime -= dt;
          if (doubleTime <= 0) { doubleLeft = 0; progress = Math.max(0, progress - .5); }
        }
        shake = Math.max(0, shake - dt); render();
        raf = requestAnimationFrame(frame);
      }
      makeNext(); makeNext(); makeNext(); makeNext(); render();
      document.addEventListener('keydown', onKey); root.addEventListener('click', onClick);
      raf = requestAnimationFrame(frame);
      return { cancel() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); root.removeEventListener('click', onClick); } };
    },
  };
})();
