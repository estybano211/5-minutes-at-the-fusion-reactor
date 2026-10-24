/* Crew trips, support requests, intercom and minigame timing. All run during play. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  CF.minigames = CF.minigames || {};

  const SLOW = 1.4;                                   // a hurt crew member walks and works this much slower
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const LINES = {
    go: ['On my way.', 'Heading out.', 'Moving.'],
    thanks: ['Thanks. Moving on.', 'That did it.', 'Good. I am through.'],
    hurt: ['I missed the support window. I am hurt, but still here.', 'That attempt failed. I am hurt; please try again.', 'I waited too long and got hurt. Help me through.'],
    last: ['No, no, there is something in the vent...', 'It is right behind me. It is...', 'Tell them I tried to...'],
  };
  const TIMED_LINES = [
    { t: 115, text: 'Something crossed the service hall. I am keeping my head down.' },
    { t: 275, text: 'I heard a knock from inside the wall. Nobody is working there.' },
    { t: 405, text: 'The intercom picked up my voice before I spoke.' },
  ];

  let el = {}, team = [], objs = [], reqs = [], cards = {}, log = [];
  let mode = 'idle', cur = null, game = null, workLeft = 0, workMax = 1, nextLine = 0, lastWarning = -100, elapsed = 0;

  const tm = (id) => team.find((t) => t.id === id);
  const ob = (id) => objs.find((o) => o.id === id);
  const def = (id) => cfg.objectives.find((o) => o.id === id);
  const slow = (t) => (t.hp < cfg.crewHp ? SLOW : 1);
  const rampIdx = () => Math.max(0, Math.min(2, S.get('day') - 1));

  /* ── state out ──────────────────────────────────────────────────────── */
  function publish() {
    objs.forEach((o) => {
      o.locked = !o.requires.every((id) => ob(id).done);
      o.progress = o.done ? 1 : Math.min(0.99, (o.step + o.frac) / (2 * o.stagesTotal + 1));
    });
    S.set('team', team.map((t) => Object.assign({}, t)));
    S.set('objectives', objs.map((o) => Object.assign({}, o)));
  }

  /* ── intercom log ───────────────────────────────────────────────────── */
  function say(who, text, staticFx) {
    const p = tm(who) || cfg.crew.find((c) => c.id === who) || { name: 'COMPANY', color: '#8f7646' };
    log.unshift({ name: p.name.toUpperCase(), color: p.color, text: text, staticFx: !!staticFx });
    log = log.slice(0, 4);
    el.log.innerHTML = '';
    log.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'tk-line' + (i === 0 ? ' new' : '') + (l.staticFx ? ' static' : '');
      const b = document.createElement('b');
      b.textContent = l.name;
      b.style.color = l.color;
      row.appendChild(b);
      row.appendChild(document.createTextNode(' ' + l.text));
      el.log.appendChild(row);
    });
  }

  /* ── the trip ───────────────────────────────────────────────────────── */
  function dispatch(e) {
    const t = tm(e.crew), o = ob(e.objective);
    const ok = S.get('phase') === 'play' && t && o && t.status === 'idle' && !o.done && !o.by && !o.locked;
    if (!ok) { bus.emit('sfx', 'deny'); return; }
    t.status = 'travel'; t.at = o.id; t.timer = def(o.id).travel * slow(t); o.by = t.id;
    bus.emit('sfx', 'beep');
    say(t.id, pick(LINES.go) + ' (' + o.place + ')');
    publish();
    bus.emit('team:dispatched', { crew: t.id, objective: o.id });
  }

  function beginStep(t) {
    const o = ob(t.at);
    if (o.step % 2 === 0) { t.status = 'work'; t.timer = def(o.id).work * slow(t); o.frac = 0; }
    else { t.status = 'stuck'; addRequest(t, o); }
  }

  function finishObjective(o, t) {
    const d = def(o.id);
    o.done = true; o.by = null; o.frac = 0; t.status = 'idle'; t.at = null; t.timer = 0;
    say(t.id, d.kind === 'item' ? 'I have the ' + o.name + '.' : o.name + ': done.');
    if (d.bonus) {
      S.add('battery', 1);
      say(t.id, 'Found a spare ' + d.bonus + ' on the way back. It is yours.');
    }
    bus.emit('sfx', 'chime');
    publish();
    bus.emit('objective:done', { id: o.id, kind: o.kind });
  }

  /* ── support requests ───────────────────────────────────────────────── */
  function addRequest(t, o) {
    const stage = def(o.id).stages[(o.step - 1) / 2];
    const game = CF.minigames[stage.game] ? stage.game : Object.keys(CF.minigames)[0];
    const patience = cfg.supportPatience[rampIdx()];
    const r = { tid: t.id, oid: o.id, say: stage.say, game: game, opts: Object.assign({ day: S.get('day') }, stage.opts), patience: patience, max: patience };
    reqs.push(r);

    const card = document.createElement('div');
    card.className = 'tk-req';
    card.innerHTML = '<div class="tk-req-head"><i class="tk-dot"></i><b></b><span></span></div>' +
      '<div class="tk-req-text"></div><div class="tk-req-bar"><i></i></div><button class="tk-btn tk-help">HELP</button>';
    card.querySelector('.tk-dot').style.background = t.color;
    card.querySelector('b').textContent = t.name.toUpperCase();
    card.querySelector('span').textContent = ' · ' + o.place;
    card.querySelector('.tk-req-text').textContent = r.say;
    card.querySelector('button').addEventListener('click', () => startSupport(r));
    el.list.appendChild(card);
    cards[r.tid] = { card: card, bar: card.querySelector('.tk-req-bar i') };
    el.root.classList.add('has-reqs');

    bus.emit('sfx', 'beep');
    say(t.id, r.say);
  }

  function dropRequest(r) {
    reqs = reqs.filter((x) => x !== r);
    if (cards[r.tid]) { cards[r.tid].card.remove(); delete cards[r.tid]; }
    el.root.classList.toggle('has-reqs', reqs.length > 0);
  }

  function startSupport(r) {
    if (mode !== 'idle' || S.get('phase') !== 'play' || !reqs.includes(r)) return;
    const mg = CF.minigames[r.game];
    cur = r; mode = 'working'; el.root.dataset.mode = 'working';
    workMax = workLeft = cfg.supportLimit[rampIdx()];
    el.title.textContent = (mg ? mg.title : 'SUPPORT') + ' · ' + tm(r.tid).name.toUpperCase();
    bus.emit('sfx', 'click');
    if (!mg) { finishSupport(true); return; }
    const started = mg.start(el.game, (ok) => finishSupport(ok), r.opts);
    if (mode === 'working') game = started;
  }

  function endGame() {
    if (game && game.cancel) game.cancel();
    game = null; cur = null;
    if (el.game) el.game.innerHTML = '';
    if (mode === 'working') { mode = 'idle'; el.root.dataset.mode = 'idle'; }
  }

  function finishSupport(ok) {
    if (mode !== 'working' || !cur) return;
    const r = cur, t = tm(r.tid), o = ob(r.oid);
    endGame();
    if (ok) {
      dropRequest(r);
      o.step++; o.frac = 0; t.status = 'work'; t.timer = def(o.id).work * slow(t);
      say(t.id, pick(LINES.thanks));
      bus.emit('sfx', 'ok');
      bus.emit('support:done', { crew: t.id, objective: o.id });
    } else {
      bus.emit('support:failed', { crew: t.id, objective: o.id });
      hurt(t, r, 'failed');
    }
    publish();
  }

  function hurt(t, r, reason) {
    t.hp -= 1;
    if (t.hp <= 0) { die(t); return; }
    r.patience = r.max;
    say(t.id, reason === 'missed' ? 'I waited too long for help. I am hurt; please answer.' : pick(LINES.hurt));
    bus.emit('sfx', 'deny');
    bus.emit('fx:flash', '#6a1010');
    bus.emit('team:hurt', { id: t.id });
    publish();
  }

  function die(t) {
    const o = t.at ? ob(t.at) : null;
    if (o) { o.by = null; o.frac = 0; }            // the objective keeps its progress; someone else can finish it
    const r = reqs.find((x) => x.tid === t.id);
    if (r) { if (cur === r) endGame(); dropRequest(r); }
    t.status = 'dead'; t.hp = 0; t.at = null; t.timer = 0;
    say(t.id, pick(LINES.last), true);
    bus.emit('sfx', 'death');
    bus.emit('fx:flash', '#7a0c0c');
    publish();                                      // publish first: Core checks the state when it hears team:died
    bus.emit('team:died', { id: t.id, name: t.name });
  }

  /* ── clock ──────────────────────────────────────────────────────────── */
  function onTick(e) {
    if (e.phase !== 'play') return;
    elapsed = e.t;
    while (nextLine < TIMED_LINES.length && elapsed >= TIMED_LINES[nextLine].t) {
      const alive = team.filter((t) => t.status !== 'dead');
      if (alive.length) say(pick(alive).id, TIMED_LINES[nextLine].text, true);
      nextLine++;
      bus.emit('sfx', 'static');
    }

    team.forEach((t) => {
      if (t.status === 'travel') {
        t.timer -= e.dt;
        if (t.timer <= 0) beginStep(t);
      } else if (t.status === 'work') {
        const o = ob(t.at), full = def(o.id).work * slow(t);
        t.timer -= e.dt;
        o.frac = Math.max(0, Math.min(1, 1 - t.timer / full));
        if (t.timer <= 0) {
          o.step++; o.frac = 0;
          if (o.step > 2 * o.stagesTotal) finishObjective(o, t); else beginStep(t);
        }
      }
    });

    reqs.slice().forEach((r) => {
      if (cur === r) return;                        // the minigame has its own timer
      r.patience -= e.dt;
      const c = cards[r.tid];
      if (c) { c.bar.style.width = Math.max(0, (r.patience / r.max) * 100) + '%'; c.card.classList.toggle('urgent', r.patience < 8); }
      if (r.patience <= 0) hurt(tm(r.tid), r, 'missed');
    });

    if (mode === 'working') {
      workLeft -= e.dt;
      el.bar.style.width = Math.max(0, (workLeft / workMax) * 100) + '%';
      el.time.textContent = Math.max(0, Math.ceil(workLeft)) + 's';
      if (workLeft <= 0) finishSupport(false);
    }
    publish();
  }

  function onPhase(e) {
    if (e.phase === 'play') {
      if (mode === 'working') endGame();
      mode = 'idle'; el.root.dataset.mode = 'idle';
      nextLine = 0; elapsed = 0; lastWarning = -100;
      say('sys', 'Crew and shutters are live. Send a crew member, then watch both halls.');
    } else if (e.phase === 'win' || e.phase === 'lose') {
      endGame(); mode = 'idle'; el.root.dataset.mode = 'idle';
    }
  }

  function onThreat(e) {
    if (S.get('phase') !== 'play' || e.level < 2 || elapsed - lastWarning < 24) return;
    lastWarning = elapsed;
    const alive = team.filter((t) => t.status !== 'dead');
    if (alive.length) say(pick(alive).id, 'I hear movement near the ' + (e.side === 'L' ? 'west' : 'east') + ' hall. Watch the shutter.', true);
  }

  /* ── UI ─────────────────────────────────────────────────────────────── */
  function mount(slots) {
    const root = slots.tasks;
    root.innerHTML = `
      <div class="tk" data-mode="idle">
        <div class="tk-log"></div>
        <div class="tk-reqs">
          <div class="tk-sec">SUPPORT REQUESTS</div>
          <div class="tk-list"></div>
          <div class="tk-empty">Nobody needs help right now.</div>
        </div>
        <div class="tk-work">
          <div class="tk-work-head"><span class="tk-title"></span><span class="tk-time"></span></div>
          <div class="tk-bar"><i></i></div>
          <div class="tk-game"></div>
        </div>
      </div>`;
    el = {
      root: root.querySelector('.tk'), log: root.querySelector('.tk-log'), list: root.querySelector('.tk-list'),
      title: root.querySelector('.tk-title'), time: root.querySelector('.tk-time'),
      bar: root.querySelector('.tk-bar i'), game: root.querySelector('.tk-game'),
    };

    team = cfg.initialCrew().map((t) => Object.assign(t, { timer: 0 }));
    objs = cfg.initialObjectives().map((o) => Object.assign(o, { step: 0, frac: 0 }));
    publish();

    bus.on('dispatch:request', dispatch);
    bus.on('intercom:say', (e) => say(e.who || 'sys', e.text, e.static));
    bus.on('tick', onTick);
    bus.on('phase:change', onPhase);
    bus.on('creature:threat', onThreat);
    window.addEventListener('keydown', (e) => {
      if (mode !== 'working') return;
      if (e.code === 'Space') e.preventDefault();
      if (['1', '2', 'a', 'd'].includes(e.key.toLowerCase())) e.stopImmediatePropagation();
    }, true);
    say('sys', 'Control room online. Crew standing by.');
  }

  CF.register({ id: 'tasks', slots: ['tasks'], mount: mount });
})();
