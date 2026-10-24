/* MINIGAME: flow. Coolant tubes leak slowly; pump each one back into the green band and hold them there together. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const NAMES = ['A', 'B', 'C'];

  CF.minigames.flow = {
    id: 'flow', title: 'COOLANT LOOP',
    tips: {
      goal: 'The coolant loop is losing pressure. Every tube must sit inside the green band at the same time.',
      keys: [
        'Each tube slowly leaks. Pick one with ← → (or click it).',
        'HOLD SPACE (or hold the mouse button on a tube) to pump coolant into it. Let go to stop.',
        'Stop pumping when the level is inside the green band. Do not overfill: past the top the tube vents and drops.',
        'When all tubes are green together, a bar fills. Keep them there until it is full.',
      ],
      hint: 'Pump one tube up, then move to the next. The first tubes sink while you work, so top them up again.',
    },
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const day = Math.max(1, Math.min(3, opts.day || 1));
      const count = [0, 2, 3, 3][level];
      const leak = [0, 7, 6, 9][level] * (1 + (day - 1) * .04);        // percent per second
      const band = [null, [38, 74], [42, 74], [48, 72]][level];
      const holdNeed = [0, .55, .7, .85][level];                 // seconds all tubes must stay green (70% of the earlier .8 / 1 / 1.2)
      const PUMP = 62;
      el.innerHTML = '<div class="fl"><div class="fl-instruction">← → pick a tube · hold Space or the mouse to pump · all tubes in the green</div>' +
        '<div class="fl-tubes">' + Array.from({ length: count }, (_, i) =>
          '<div class="fl-tube" data-i="' + i + '"><div class="fl-glass"><div class="fl-band" style="bottom:' + band[0] + '%;height:' + (band[1] - band[0]) + '%"></div><div class="fl-level"></div></div>' +
          '<div class="fl-name">' + NAMES[i] + '</div><div class="fl-pump">▲</div></div>').join('') + '</div>' +
        '<div class="fl-footer"><span class="fl-state">PUMP THE TUBES UP</span><span class="fl-hold"><i></i></span></div></div>';
      const tubes = [...el.querySelectorAll('.fl-tube')], levels = [...el.querySelectorAll('.fl-level')];
      const state = el.querySelector('.fl-state'), holdBar = el.querySelector('.fl-hold i');
      const amount = Array.from({ length: count }, () => 8 + Math.random() * 28);
      let sel = 0, pumping = false, heldKey = false, hold = 0, vent = 0, stopped = false, raf = 0, last = performance.now();

      const inBand = (v) => v >= band[0] && v <= band[1];
      function select(i) { if (i !== sel) { sel = i; bus.emit('sfx', 'click'); } }
      function onKey(e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); if (!e.repeat) select(Math.max(0, sel - 1)); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); if (!e.repeat) select(Math.min(count - 1, sel + 1)); }
        else if (e.key === ' ') { e.preventDefault(); heldKey = true; pumping = true; }
      }
      function onKeyUp(e) { if (e.key === ' ') { e.preventDefault(); heldKey = false; pumping = false; } }
      function onDown(e) {
        const t = e.target.closest('.fl-tube');
        if (!t || !el.contains(t)) return;
        e.preventDefault();
        select(Number(t.dataset.i)); pumping = true;
      }
      function onUp() { if (!heldKey) pumping = false; }
      function onBlur() { heldKey = false; pumping = false; }

      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        for (let i = 0; i < count; i++) amount[i] = Math.max(0, amount[i] - leak * dt);
        if (pumping) amount[sel] += PUMP * dt;
        if (amount[sel] > 100) { amount[sel] = 22; vent = .5; bus.emit('sfx', 'deny'); }
        vent = Math.max(0, vent - dt);
        const good = amount.every(inBand);
        hold = good ? hold + dt : Math.max(0, hold - dt);
        tubes.forEach((t, i) => {
          levels[i].style.height = Math.min(100, amount[i]) + '%';
          t.classList.toggle('fl-selected', i === sel);
          t.classList.toggle('fl-pumping', pumping && i === sel);
          t.classList.toggle('fl-green', inBand(amount[i]));
          t.classList.toggle('fl-high', amount[i] > band[1]);
        });
        holdBar.style.width = Math.min(100, hold / holdNeed * 100) + '%';
        const low = amount.findIndex((v) => v < band[0]), high = amount.findIndex((v) => v > band[1]);
        state.textContent = vent > 0 ? 'OVERPRESSURE · VENTED' : good ? 'HOLD IT THERE' : high >= 0 ? 'TUBE ' + NAMES[high] + ' IS TOO HIGH' : 'PUMP TUBE ' + NAMES[low];
        state.classList.toggle('fl-warn', vent > 0);
        if (hold >= holdNeed) { stopped = true; bus.emit('sfx', 'chime'); done(true); return; }
        raf = requestAnimationFrame(frame);
      }
      document.addEventListener('keydown', onKey);
      document.addEventListener('keyup', onKeyUp);
      el.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('blur', onBlur);
      raf = requestAnimationFrame(frame);
      return {
        cancel() {
          stopped = true; cancelAnimationFrame(raf);
          document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp);
          el.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp); window.removeEventListener('blur', onBlur);
        },
      };
    },
  };
})();
