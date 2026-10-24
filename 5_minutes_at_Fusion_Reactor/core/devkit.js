/* Standalone dev pages: fake clock, alert jump, and stand-ins for unloaded modules. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  CF.dev = true;

  const total = cfg.schedule[0].duration;
  let start = 0, end = cfg.rampAt[0], elapsed = 0, last = performance.now();
  const clockAt = (sec) => Math.floor(cfg.clock.start + (sec / total) * (cfg.clock.end - cfg.clock.start));

  function enter(day) {
    start = day === 1 ? 0 : cfg.rampAt[day - 2];
    end = day === 3 ? total : cfg.rampAt[day - 1];
    elapsed = start;
    S.set('day', day);
    S.set('phase', 'play');
    S.set('timeLeft', total - elapsed);
    S.set('clock', clockAt(elapsed));
    bus.emit('phase:change', { phase: 'play', day: day, duration: total });
  }

  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.5) * cfg.speed;
    last = now;
    if (S.get('paused')) return;
    if (S.get('phase') === 'win' || S.get('phase') === 'lose' || S.get('phase') === 'finale') return;
    elapsed += dt;
    if (elapsed >= end) { enter(S.get('day')); return; }
    const left = total - elapsed, clock = clockAt(elapsed);
    S.set('timeLeft', Math.ceil(left));
    S.set('phaseTimeLeft', Math.ceil(left));
    S.set('clock', clock);
    bus.emit('tick', { dt: dt, phase: 'play', day: S.get('day'), t: elapsed, phaseTimeLeft: left, clock: clock });
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

    const r1 = row('Jump to alert level');
    [1, 2, 3].forEach((day) => r1.appendChild(btn('ALERT ' + day, () => enter(day))));
    r1.appendChild(btn('WIN', () => { S.set('phase', 'win'); bus.emit('phase:change', { phase: 'win', day: S.get('day'), reason: 'launched' }); }));
    r1.appendChild(btn('FINALE', () => { S.set('phase', 'finale'); bus.emit('phase:change', { phase: 'finale', day: S.get('day') }); }));
    r1.appendChild(btn('LOSE', () => { S.set('phase', 'lose'); bus.emit('phase:change', { phase: 'lose', day: S.get('day'), reason: 'late' }); }));

    const r2 = row('State');
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
      [0, 1, 2, 3].forEach((l) => r.appendChild(btn('threat ' + l, () => bus.emit('creature:threat', { level: l, side: 'L', kind: 'walker' }))));
      r.appendChild(btn('blackout', () => bus.emit('creature:blackout')));
    } else {
      const r = row('Spawn a creature');
      ['walker', 'crawler', 'brute', 'stalker'].forEach((kind) => r.appendChild(btn(kind, () => bus.emit('dev:spawn', { kind: kind }))));
    }

    const log = document.createElement('div');
    log.style.cssText = 'margin-top:6px;max-height:90px;overflow:auto;color:#aaa;white-space:pre-wrap;';
    log.textContent = 'event log:';
    panel.appendChild(log);
    const add = (s) => { log.textContent += '\n' + s; log.scrollTop = log.scrollHeight; };
    // Stand-in for the director's ending rules after the cockpit finale.
    bus.on('finale:done', () => { S.set('phase', 'win'); bus.emit('phase:change', { phase: 'win', day: S.get('day'), reason: 'launched' }); });
    bus.on('finale:failed', () => { S.set('phase', 'lose'); bus.emit('phase:change', { phase: 'lose', day: S.get('day'), reason: 'glass' }); });
    ['finale:request', 'finale:done', 'finale:failed', 'creature:caught', 'creature:blackout', 'team:died', 'team:hurt', 'team:dispatched', 'objective:done', 'dispatch:request', 'launch:request']
      .forEach((evt) => bus.on(evt, (d) => add(evt + ' ' + JSON.stringify(d || {}))));
    bus.on('sfx', (n) => add('sfx ' + (n && n.name || n)));

    head.style.cursor = 'pointer';
    head.title = 'click to collapse / expand';
    head.addEventListener('click', () => { [...panel.children].slice(1).forEach((c) => { c.hidden = !c.hidden; }); });

    document.body.appendChild(panel);
    enter(1);
  });
})();
