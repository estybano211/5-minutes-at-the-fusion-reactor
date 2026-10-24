/* CORE (Person A). Used ONLY by the pages in /dev. Stands in for director.js so one module can be
   developed alone: it fakes the clock ('tick'), lets you jump between phases, and pretends to be
   whichever module is NOT loaded on the page (the support engine, the board, the cameras), so you can
   test your module in isolation. It never ships in index.html. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  CF.dev = true;

  const steps = cfg.schedule;
  const total = steps.reduce((a, s) => a + s.duration, 0);
  let idx = 0, left = 0, last = performance.now();
  const before = (i) => steps.slice(0, i).reduce((a, s) => a + s.duration, 0);
  const clockAt = (sec) => Math.floor(cfg.clock.start + (sec / total) * (cfg.clock.end - cfg.clock.start));

  function enter(i) {
    idx = i;
    const st = steps[i];
    left = st.duration;
    S.set('day', st.day);
    S.set('phase', st.phase);
    S.set('timeLeft', total - before(i));
    S.set('clock', clockAt(before(i)));
    bus.emit('phase:change', { phase: st.phase, day: st.day, duration: st.duration, index: i });
  }

  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.5) * cfg.speed;
    last = now;
    if (S.get('phase') === 'win' || S.get('phase') === 'lose') return;
    left -= dt;
    if (left <= 0) { enter(idx); return; }   // loop the current phase forever
    S.set('phaseTimeLeft', Math.ceil(left));
    S.set('clock', clockAt(before(idx) + steps[idx].duration - left));
    bus.emit('tick', { dt: dt, phase: S.get('phase'), day: S.get('day'), t: steps[idx].duration - left, phaseTimeLeft: left });
  }, 100);

  document.addEventListener('DOMContentLoaded', () => {
    const has = (id) => CF.modules.some((m) => m.id === id);
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:999;max-width:340px;padding:8px;background:rgba(0,0,0,.85);' +
      'border:1px solid #555;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#ddd;';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin:2px;padding:2px 6px;font:inherit;color:#111;background:#ccc;border:0;cursor:pointer;';
      b.addEventListener('click', fn);
      return b;
    };
    const row = (title) => {
      const d = document.createElement('div');
      d.innerHTML = '<div style="color:#8a8;margin-top:4px">' + title + '</div>';
      panel.appendChild(d);
      return d;
    };

    const head = document.createElement('div');
    head.innerHTML = '<b>DEV KIT</b> (not part of the game)';
    panel.appendChild(head);

    const r1 = row('Jump to phase (D = shift, N = lockdown)');
    steps.forEach((s, i) => r1.appendChild(btn(s.phase[0].toUpperCase() + s.day, () => enter(i))));
    r1.appendChild(btn('WIN', () => { S.set('phase', 'win'); bus.emit('phase:change', { phase: 'win', day: S.get('day'), reason: 'launched' }); }));
    r1.appendChild(btn('LOSE', () => { S.set('phase', 'lose'); bus.emit('phase:change', { phase: 'lose', day: S.get('day'), reason: 'late' }); }));

    const r2 = row('State');
    r2.appendChild(btn('+1 flare', () => S.add('flares', 1)));
    r2.appendChild(btn('+1 battery', () => S.add('battery', 1)));
    r2.appendChild(btn('power 100', () => S.set('power', 100)));

    // ── pretend to be the support engine (tasks module) ──
    if (!has('tasks')) {
      let team = cfg.initialCrew(), objs = cfg.initialObjectives();
      const push = () => {
        objs.forEach((o) => { o.locked = !o.requires.every((id) => objs.find((x) => x.id === id).done); });
        S.set('team', team.map((t) => Object.assign({}, t)));
        S.set('objectives', objs.map((o) => Object.assign({}, o)));
      };
      push();
      const r = row('Pretend to be the support engine (tasks module)');
      r.appendChild(btn('next crew: working', () => { const t = team.find((x) => x.status === 'idle'); if (t) { t.status = 'work'; push(); } }));
      r.appendChild(btn('next crew: stuck', () => { const t = team.find((x) => x.status === 'idle' || x.status === 'work'); if (t) { t.status = 'stuck'; push(); } }));
      r.appendChild(btn('hurt next crew', () => { const t = team.find((x) => x.status !== 'dead' && x.hp > 1); if (t) { t.hp--; push(); } }));
      r.appendChild(btn('kill next crew', () => {
        const t = team.find((x) => x.status !== 'dead');
        if (t) { t.status = 'dead'; t.hp = 0; push(); bus.emit('team:died', { id: t.id, name: t.name }); }
      }));
      r.appendChild(btn('finish next objective', () => {
        const o = objs.find((x) => !x.done && !x.locked);
        if (o) { o.done = true; o.progress = 1; o.by = null; push(); bus.emit('objective:done', { id: o.id, kind: o.kind }); }
      }));
      r.appendChild(btn('reset crew + checklist', () => { team = cfg.initialCrew(); objs = cfg.initialObjectives(); push(); }));
      bus.on('dispatch:request', (e) => {
        const t = team.find((x) => x.id === e.crew), o = objs.find((x) => x.id === e.objective);
        if (t && o && t.status === 'idle' && !o.done && !o.by && !o.locked) { t.status = 'travel'; t.at = o.id; o.by = t.id; push(); }
      });
    }

    // ── pretend to be the board (mission board module) ──
    if (!has('board')) {
      const r = row('Pretend to be the board (sends dispatches)');
      const sendOne = () => {
        const t = S.get('team').find((x) => x.status === 'idle');
        const o = S.get('objectives').find((x) => !x.done && !x.by && !x.locked);
        if (t && o) bus.emit('dispatch:request', { crew: t.id, objective: o.id });
        return !!(t && o);
      };
      r.appendChild(btn('send next crew', sendOne));
      r.appendChild(btn('send all', () => { for (let i = 0; i < 8 && sendOne(); i++); }));
      r.appendChild(btn('LAUNCH', () => bus.emit('launch:request')));
    }

    // ── pretend to be the cameras ──
    if (!has('cameras')) {
      const r = row('Pretend to be the cameras');
      [0, 1, 2, 3].forEach((l) => r.appendChild(btn('threat ' + l, () => bus.emit('night:threat', { level: l, side: 'L' }))));
      r.appendChild(btn('blackout', () => bus.emit('night:blackout')));
    }

    const log = document.createElement('div');
    log.style.cssText = 'margin-top:6px;max-height:90px;overflow:auto;color:#aaa;white-space:pre-wrap;';
    log.textContent = 'event log:';
    panel.appendChild(log);
    const add = (s) => { log.textContent += '\n' + s; log.scrollTop = log.scrollHeight; };
    ['night:caught', 'night:blackout', 'team:died', 'team:hurt', 'team:dispatched', 'objective:done', 'dispatch:request', 'launch:request']
      .forEach((evt) => bus.on(evt, (d) => add(evt + ' ' + JSON.stringify(d || {}))));
    bus.on('sfx', (n) => add('sfx ' + (n && n.name || n)));

    head.style.cursor = 'pointer';
    head.title = 'click to collapse / expand';
    head.addEventListener('click', () => { [...panel.children].slice(1).forEach((c) => { c.hidden = !c.hidden; }); });

    document.body.appendChild(panel);
    enter(0);
  });
})();
