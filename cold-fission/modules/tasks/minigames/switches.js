/* MINIGAME: switches. Set cockpit controls to their printed target positions. */
(function () {
  const CF = window.CF, bus = CF.bus;
  CF.minigames = CF.minigames || {};
  const DEF = [
    { id: 'fuel', name: 'FUEL PUMP', type: 'switch' },
    { id: 'igniter', name: 'IGNITER', type: 'switch' },
    { id: 'bus', name: 'BUS TIE', type: 'switch' },
    { id: 'coolant', name: 'COOLANT', type: 'switch' },
    { id: 'vent', name: 'VENT', type: 'switch' },
    { id: 'throttle', name: 'THROTTLE', type: 'lever' },
    { id: 'mixture', name: 'MIXTURE', type: 'lever' },
  ];

  CF.minigames.switches = {
    id: 'switches', title: 'IGNITION PANEL',
    start(el, done, opts) {
      opts = opts || {};
      const level = Math.max(1, Math.min(3, opts.difficulty || 1));
      const chosen = level === 1 ? DEF.slice(0, 4) : level === 2 ? DEF.slice(0, 4).concat(DEF[5]) : DEF;
      const controls = chosen.map((d) => {
        const target = d.type === 'lever' ? (Math.random() * 3) | 0 : (Math.random() * 2) | 0;
        return Object.assign({}, d, { target: target, value: Math.random() < .32 ? target : (target + 1) % (d.type === 'lever' ? 3 : 2) });
      });
      if (level === 3) {
        controls[0].target = 1; controls[0].value = 0;
        controls[1].target = 1; controls[1].value = 0;
      }
      if (controls.every((c) => c.value !== c.target)) controls[controls.length - 1].value = controls[controls.length - 1].target;
      if (controls.every((c) => c.value === c.target)) controls[0].value = (controls[0].target + 1) % 2;
      el.innerHTML = '<div class="sw"><div class="sw-instruction">← → select. Space flips or advances. Match each target.</div><div class="sw-panel"></div><div class="sw-note">' + (level === 3 ? 'INTERLOCK: FUEL PUMP ON before IGNITER.' : 'GREEN LAMPS = READY') + '</div></div>';
      const panel = el.querySelector('.sw-panel');
      let cursor = 0, ready = 0, stopped = false, raf = 0, last = performance.now();
      function name(c, v) { return c.type === 'lever' ? ['LOW', 'MID', 'HIGH'][v] : v ? 'ON' : 'OFF'; }
      function render() {
        panel.innerHTML = controls.map((c, i) => '<div class="sw-control' + (cursor === i ? ' sw-selected' : '') + '" data-i="' + i + '">' +
          '<div class="sw-lamp' + (c.value === c.target ? ' sw-good' : '') + '"></div><div class="sw-label">' + c.name + '</div>' +
          '<div class="sw-target">REQUIRED: ' + name(c, c.target) + '</div>' +
          (c.type === 'switch' ? '<button class="sw-toggle" data-i="' + i + '">' + (c.value ? 'ON' : 'OFF') + '</button>' :
            '<div class="sw-notches">' + [0, 1, 2].map((v) => '<button class="sw-notch' + (c.value === v ? ' sw-active' : '') + '" data-i="' + i + '" data-v="' + v + '">' + name(c, v) + '</button>').join('') + '</div>') + '</div>').join('');
      }
      function change(i, value) {
        if (stopped) return;
        cursor = i;
        const c = controls[i];
        const v = value == null ? (c.value + 1) % (c.type === 'lever' ? 3 : 2) : value;
        if (level === 3 && c.id === 'igniter' && v === 1 && controls[0].value !== 1) { bus.emit('sfx', 'deny'); render(); return; }
        c.value = v; ready = 0; bus.emit('sfx', 'click'); render();
      }
      function onKey(e) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
        e.preventDefault(); if (e.repeat) return;
        if (e.key === 'ArrowLeft') cursor = Math.max(0, cursor - 1);
        else if (e.key === 'ArrowRight') cursor = Math.min(controls.length - 1, cursor + 1);
        else if (e.key === ' ') { change(cursor); return; }
        else cursor = Math.max(0, Math.min(controls.length - 1, cursor + (e.key === 'ArrowDown' ? 4 : -4)));
        render();
      }
      function onClick(e) {
        const node = e.target.closest('[data-i]');
        if (!node || !panel.contains(node)) return;
        const i = Number(node.dataset.i);
        if (node.dataset.v != null) change(i, Number(node.dataset.v));
        else change(i);
      }
      function frame(now) {
        if (stopped) return;
        const dt = Math.min(.05, (now - last) / 1000); last = now;
        ready = controls.every((c) => c.value === c.target) ? ready + dt : 0;
        if (ready >= .4) { stopped = true; bus.emit('sfx', 'chime'); done(true); return; }
        raf = requestAnimationFrame(frame);
      }
      render(); document.addEventListener('keydown', onKey); panel.addEventListener('click', onClick);
      raf = requestAnimationFrame(frame);
      return { cancel() { stopped = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); panel.removeEventListener('click', onClick); } };
    },
  };
})();
