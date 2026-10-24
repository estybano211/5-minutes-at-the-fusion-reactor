/* ─────────────────────────────────────────────────────────────────────────
   MODULE: tasks      OWNER: Person C (Crew and Support)
   Owns   the crew simulation (this is the "engine"), the intercom log, the support requests and the
          minigame runner. It is the ONLY writer of the `team` and `objectives` state.
   Reads  state: phase, day         config: crew, objectives, crewHp, supportPatience, supportLimit
   Writes state: team, objectives, flares / battery (bonus finds)
   Listens dispatch:request {crew, objective}   from the board (Person D)
           phase:change, tick, intercom:say {who, text, static?}
   Emits  team:dispatched {crew, objective}, team:hurt {id}, team:died {id, name}, objective:done {id, kind},
          support:done {crew, objective}, support:failed {crew, objective}, sfx <name>, fx:flash <colour>

   A trip: travel -> work -> OBSTACLE -> work -> OBSTACLE ... -> work -> done.
   At each obstacle the crew member is stuck and asks for help. The player plays a minigame to get them through.
   Fail it, or let the request run out, and the crew member loses 1 HP. At 0 HP they die.
   During a LOCKDOWN (phase 'night') everything here is paused: the crew takes cover.
   A minigame is { id, title, start(el, done, opts) -> { cancel() } } registered on CF.minigames (see minigames/blocks.js).
   opts = { day, ...the stage's opts from core/config.js }.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  CF.minigames = CF.minigames || {};

  const SLOW = 1.4;                                   // a hurt crew member walks and works this much slower
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const LINES = {
    go: ['On my way.', 'Heading out.', 'Moving.'],
    thanks: ['Thanks. Moving on.', 'That did it.', 'Good. I am through.'],
    hurt: ['Ow. I am still here. Please be quicker.', 'That hurt. Do not do that again.', 'I do not like it down here.'],
    last: ['No, no, there is something in the vent...', 'It is right behind me. It is...', 'Tell them I tried to...'],
  };
  // Lines from the crew while they hide during a lockdown. who: a crew id, 'any' (a living one) or 'sys'.
  const NIGHT_LINES = {
    1: [{ t: 12, who: 'any', text: 'I am in a locker. I can hear something outside.' }],
    2: [{ t: 14, who: 'any', text: 'It is so quiet. Why is it so quiet?' },
        { t: 50, who: 'any', text: 'Do not open the shutters for anyone. Anyone.' }],
    3: [{ t: 10, who: 'any', text: 'I saw someone I know in the corridor. They were not walking right.' },
        { t: 60, who: 'any', text: 'They are asking me to come out. I think I would like to.' },
        { t: 105, who: 'sys', text: 'REACTOR RESPONSE NOMINAL. THE COMPANY THANKS YOU FOR YOUR CONTINUED SERVICE.' }],
  };

  let el = {}, team = [], objs = [], reqs = [], cards = {}, log = [];
  let mode = 'shift', cur = null, game = null, workLeft = 0, workMax = 1, nightT = 0, nightLines = [];

  const tm = (id) => team.find((t) => t.id === id);
  const ob = (id) => objs.find((o) => o.id === id);
  const def = (id) => cfg.objectives.find((o) => o.id === id);
  const slow = (t) => (t.hp < cfg.crewHp ? SLOW : 1);
  const shiftIdx = () => Math.max(0, Math.min(2, S.get('day') - 1));

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
    const ok = S.get('phase') === 'day' && t && o && t.status === 'idle' && !o.done && !o.by && !o.locked;
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
      S.add(d.bonus === 'flare' ? 'flares' : 'battery', 1);
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
    const patience = cfg.supportPatience[shiftIdx()];
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
    if (mode !== 'shift' || S.get('phase') !== 'day') return;
    const mg = CF.minigames[r.game];
    cur = r; mode = 'working'; el.root.dataset.mode = 'working';
    workMax = workLeft = cfg.supportLimit[shiftIdx()];
    el.title.textContent = (mg ? mg.title : 'SUPPORT') + ' · ' + tm(r.tid).name.toUpperCase();
    bus.emit('sfx', 'click');
    if (!mg) { finishSupport(true); return; }
    game = mg.start(el.game, (ok) => finishSupport(ok), r.opts);
  }

  function endGame() {
    if (game && game.cancel) game.cancel();
    game = null; cur = null;
    if (el.game) el.game.innerHTML = '';
    if (mode === 'working') { mode = 'shift'; el.root.dataset.mode = 'shift'; }
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
      hurt(t, r);
    }
    publish();
  }

  function hurt(t, r) {
    t.hp -= 1;
    if (t.hp <= 0) { die(t); return; }
    r.patience = r.max;
    say(t.id, pick(LINES.hurt));
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
    if (e.phase === 'night') {
      nightT += e.dt;
      while (nightLines.length && nightT >= nightLines[0].t) {
        const l = nightLines.shift();
        const alive = team.filter((t) => t.status !== 'dead');
        if (l.who === 'any') { if (alive.length) say(pick(alive).id, l.text, true); }
        else say(l.who, l.text, true);
        bus.emit('sfx', 'static');
      }
      return;
    }
    if (e.phase !== 'day') return;

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
      if (r.patience <= 0) hurt(tm(r.tid), r);
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
    endGame();                                      // a minigame in progress is dropped without penalty
    if (e.phase === 'day') {
      team.forEach((t) => { t.cover = false; });
      nightLines = [];
      mode = 'shift'; el.root.dataset.mode = 'shift';
      say('sys', 'Shift ' + e.day + '. Pick a crew member on the board, then an objective.');
      publish();
    } else if (e.phase === 'night') {
      team.forEach((t) => { t.cover = t.status !== 'dead'; });
      nightT = 0; nightLines = (NIGHT_LINES[e.day] || []).slice();
      mode = 'locked'; el.root.dataset.mode = 'locked';
      say('sys', 'LOCKDOWN. The crew is taking cover. Defend the control room.', true);
      publish();
    }
  }

  /* ── UI ─────────────────────────────────────────────────────────────── */
  function mount(slots) {
    const root = slots.tasks;
    root.innerHTML = `
      <div class="tk" data-mode="shift">
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
        <div class="tk-lock">LOCKDOWN<br><small>The crew is taking cover.</small></div>
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
    say('sys', 'Control room online. Crew standing by.');
  }

  CF.register({ id: 'tasks', slots: ['tasks'], mount: mount });
})();
