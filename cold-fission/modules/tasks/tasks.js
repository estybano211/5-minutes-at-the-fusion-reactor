/* Crew trips, support requests, intercom and minigame timing. All run during play. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  CF.minigames = CF.minigames || {};

  const POWER_BONUS = 25;                             // power points a finished Fuel Cell adds to the pool
  const REST = cfg.injuryMinutes / cfg.minutesPerSecond();   // game-seconds a hurt crew member rests (two wall-clock hours)
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const LINES = {
    go: ['On my way.', 'Heading out.', 'Moving.'],
    thanks: ['Thanks. Moving on.', 'That did it.', 'Good. I am through.'],
    hurt: ['That attempt failed and I am hurt. I am coming back to rest.', 'I cannot go on. Pulling back to the control room.', 'I am hurt. Give me two hours, then send me out again.'],
    missed: ['Nobody answered. I am hurt. Coming back.', 'I waited too long and got hurt. Retreating.'],
    back: ['Patched up. I can go out again, but one more wound and I am done.', 'Rested. Send me if you must.', 'I am fine. Mostly.'],
    last: ['No, no, there is something in the vent...', 'It is right behind me. It is...', 'Tell them I tried to...'],
  };
  // Unsettling lines a crew member sends from the field. Any can come at any time; a few belong to one place.
  const HORROR = [
    'Did you hear that? Something just moved behind the wall.',
    'The lights here flicker in a pattern. Like they are counting.',
    'I swear someone said my name. Very quietly.',
    'There are wet footprints on the floor. They go in, not out.',
    'It smells like a hospital in here. Why does it smell like a hospital?',
    'Something is breathing in the vent. Slowly. In time with me.',
    'My radio says there are five of us in this corridor. I count one.',
    'I just passed a handprint on the glass. It is still warm.',
    'Please do not look at the cameras on my side. Please.',
    'I keep hearing scratching. It stops when I stop.',
    'There is a door here that is not on the map.',
    'Something is tapping on the other side of this panel. Three times. Pause. Three times.',
    'Somebody is standing right behind me. Nobody is there.',
    'The intercom just whispered my name back to me.',
    'If you hear a voice that sounds like me asking to come in, do not open the gate.',
    'It is so quiet. Even the reactor stopped humming.',
    'My shadow moved a little late.',
    'Was that the vent, or did it laugh?',
    'I heard a knock from inside the wall. Nobody is working there.',
    'The intercom picked up my voice before I spoke.',
  ];
  const HORROR_AT = {
    'Navigation deck': ['The nav screen shows a dot moving toward us. It has no name.', 'Every console on this deck just turned to face me.'],
    'Engine bay': ['Something is knocking inside the engine casing. From inside.', 'The pipes here are warm, like a body.'],
    'Cargo hold': ['The crates are stacked differently than a minute ago.', 'One of the crates is breathing. I am not opening it.'],
    'Reactor annex': ['The coolant is the temperature of skin. It should not be.', 'The glass on the reactor shows a face. It is not mine.'],
    'Power junction': ['Every cable here hums one low note. Like a voice.', 'The breaker I just threw clicked back on by itself.'],
    'Flight deck': ['The pilot seat is turned toward me. Something just got up from it.', 'Someone has written our names on the windshield. From the outside.'],
  };

  let el = {}, team = [], objs = [], reqs = [], cards = {}, log = [], bag = [], badgeTimer = 0;
  let seen = {}, tip = null, tipOpen = null;
  let mode = 'idle', cur = null, game = null, workLeft = 0, workMax = 1, nextWhisper = 20, lastWarning = -100, elapsed = 0;

  const tm = (id) => team.find((t) => t.id === id);
  const ob = (id) => objs.find((o) => o.id === id);
  const def = (id) => cfg.objectives.find((o) => o.id === id);
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
  // Every new line makes a sound and lights up the terminal title, so it is noticed even while the player is busy.
  // `snd` overrides the sound ('none' for housekeeping lines); radio whispers (`staticFx`) get their own.
  function say(who, text, staticFx, snd) {
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
    notify(snd || (staticFx ? 'radio' : 'msg'), !!staticFx);
  }

  function notify(snd, staticFx) {
    if (snd !== 'none') bus.emit('sfx', snd);
    el.root.classList.remove('tk-ping'); void el.root.offsetWidth; el.root.classList.add('tk-ping');
    if (!el.badge || snd === 'none') return;
    el.badge.hidden = false;
    el.badge.classList.toggle('tk-badge-radio', staticFx);
    el.badge.classList.remove('go'); void el.badge.offsetWidth; el.badge.classList.add('go');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { el.badge.hidden = true; }, 3200);
  }

  /* ── the trip ───────────────────────────────────────────────────────── */
  function dispatch(e) {
    const t = tm(e.crew), o = ob(e.objective);
    const ok = S.get('phase') === 'play' && t && o && t.status === 'idle' && !o.done && !o.by && !o.locked;
    if (!ok) { bus.emit('sfx', 'deny'); return; }
    t.status = 'travel'; t.at = o.id; t.timer = def(o.id).travel; o.by = t.id;
    say(t.id, pick(LINES.go) + ' (' + o.place + ')');
    publish();
    bus.emit('team:dispatched', { crew: t.id, objective: o.id });
  }

  function beginStep(t) {
    const o = ob(t.at);
    if (o.step % 2 === 0) { t.status = 'work'; t.timer = def(o.id).work; o.frac = 0; }
    else { t.status = 'stuck'; addRequest(t, o); }
  }

  function finishObjective(o, t) {
    const d = def(o.id);
    o.done = true; o.by = null; o.frac = 0; t.status = 'idle'; t.at = null; t.timer = 0;
    say(t.id, d.kind === 'item' ? 'I have the ' + o.name + '.' : o.name + ': done.');
    if (d.bonus === 'power') {
      bus.emit('power:gain', { amount: POWER_BONUS, by: o.name });
      say(t.id, 'The cell is still hot. I patched its charge into the grid: +' + POWER_BONUS + ' power.');
    } else if (d.bonus === 'battery') {
      S.add('battery', 1);
      say(t.id, 'Found a spare battery on the way back. Power drain is a little lower.');
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

    say(t.id, r.say, false, 'beep');
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
    const begin = () => {
      if (mode !== 'working' || cur !== r) return;
      const started = mg.start(el.game, (ok) => finishSupport(ok), r.opts);
      if (mode === 'working' && cur === r) game = started;
    };
    if (mg.tips && !seen[r.game]) { seen[r.game] = true; openTip(mg, begin); }
    else begin();
  }

  /* ── first-use tips: a modal that freezes the whole run until it is dismissed ── */
  function setPaused(on) {
    S.set('paused', on);
    bus.emit('game:pause', { paused: on });
  }

  function openTip(mg, begin) {
    const t = mg.tips;
    tip.title.textContent = mg.title;
    tip.goal.textContent = t.goal;
    tip.list.innerHTML = '';
    t.keys.forEach((k) => { const li = document.createElement('li'); li.textContent = k; tip.list.appendChild(li); });
    tip.hint.textContent = t.hint || '';
    tip.hint.hidden = !t.hint;
    tip.root.hidden = false;
    tipOpen = { begin: begin };
    setPaused(true);
    bus.emit('sfx', 'beep');
  }

  function closeTip() {
    if (!tipOpen) return;
    const begin = tipOpen.begin;
    tipOpen = null;
    tip.root.hidden = true;
    // Let the key that closed the tip finish before the minigame starts listening.
    setTimeout(() => { setPaused(false); begin(); }, 120);
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
      o.step++; o.frac = 0; t.status = 'work'; t.timer = def(o.id).work;
      say(t.id, pick(LINES.thanks), false, 'ok');
      bus.emit('support:done', { crew: t.id, objective: o.id });
    } else {
      bus.emit('support:failed', { crew: t.id, objective: o.id });
      hurt(t, r, 'failed');
    }
    publish();
  }

  /* The first wound sends the crew member back to the control room for two wall-clock hours. The second one kills. */
  function hurt(t, r, reason) {
    t.hp -= 1;
    if (t.hp <= 0) { die(t); return; }
    const o = t.at ? ob(t.at) : null;
    if (o) { o.by = null; o.frac = 0; }            // the objective keeps its progress; the next trip resumes at the same obstacle
    if (cur === r) endGame();
    dropRequest(r);
    t.status = 'injured'; t.at = null; t.timer = REST;
    say(t.id, pick(reason === 'missed' ? LINES.missed : LINES.hurt), false, 'deny');
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
    if (elapsed >= nextWhisper) whisper();

    team.forEach((t) => {
      if (t.status === 'travel') {
        t.timer -= e.dt;
        if (t.timer <= 0) beginStep(t);
      } else if (t.status === 'injured') {
        t.timer -= e.dt;
        if (t.timer <= 0) { t.status = 'idle'; t.timer = 0; say(t.id, pick(LINES.back), false, 'chime'); }
      } else if (t.status === 'work') {
        const o = ob(t.at), full = def(o.id).work;
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

  /* A crew member who is out in the plant sends something they should not have heard. */
  function whisper() {
    const out = team.filter((t) => t.status === 'travel' || t.status === 'work');
    if (!out.length) { nextWhisper = elapsed + 5; return; }      // nobody is out there to hear anything
    const t = pick(out), here = t.at ? HORROR_AT[def(t.at).place] : null;
    let text;
    if (here && Math.random() < 0.4) text = pick(here);
    else { if (!bag.length) bag = HORROR.slice().sort(() => Math.random() - 0.5); text = bag.pop(); }
    say(t.id, text, true);
    nextWhisper = elapsed + rand(15, 24) * [1, 0.85, 0.7][rampIdx()];
  }

  function onPhase(e) {
    if (e.phase === 'play') {
      if (mode === 'working') endGame();
      mode = 'idle'; el.root.dataset.mode = 'idle';
      nextWhisper = 20; elapsed = 0; lastWarning = -100; seen = {}; bag = [];
      say('sys', 'Crew and gates are live. Send a crew member, then watch both halls.', false, 'none');
    } else if (e.phase === 'win' || e.phase === 'lose') {
      endGame(); mode = 'idle'; el.root.dataset.mode = 'idle';
      if (tipOpen) { tipOpen = null; tip.root.hidden = true; setPaused(false); }
    }
  }

  function onThreat(e) {
    if (S.get('phase') !== 'play' || e.level < 2 || elapsed - lastWarning < 24) return;
    lastWarning = elapsed;
    const alive = team.filter((t) => t.status !== 'dead');
    if (alive.length) say(pick(alive).id, 'I hear movement near the ' + (e.side === 'L' ? 'west' : 'east') + ' hall. Watch the gate.', true);
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

    const stage = (CF.ui && CF.ui.stage) || root;
    const tipRoot = document.createElement('div');
    tipRoot.className = 'tk-tip';
    tipRoot.hidden = true;
    tipRoot.innerHTML = '<div class="tk-tip-box"><div class="tk-tip-tag">NEW TASK · GAME PAUSED</div><h2 class="tk-tip-title"></h2>' +
      '<p class="tk-tip-goal"></p><ul class="tk-tip-keys"></ul><p class="tk-tip-hint"></p>' +
      '<button class="tk-btn tk-tip-go">START <kbd>ENTER</kbd> <kbd>SPACE</kbd></button></div>';
    stage.appendChild(tipRoot);
    const title = root.closest('.screen') && root.closest('.screen').querySelector('.screen-title');
    if (title) {
      el.badge = document.createElement('span');
      el.badge.className = 'tk-badge';
      el.badge.hidden = true;
      el.badge.textContent = '✉ NEW MESSAGE';
      title.appendChild(el.badge);
    }
    tip = { root: tipRoot, title: tipRoot.querySelector('.tk-tip-title'), goal: tipRoot.querySelector('.tk-tip-goal'),
      list: tipRoot.querySelector('.tk-tip-keys'), hint: tipRoot.querySelector('.tk-tip-hint') };
    tipRoot.querySelector('.tk-tip-go').addEventListener('click', closeTip);

    team = cfg.initialCrew().map((t) => Object.assign(t, { timer: 0 }));
    objs = cfg.initialObjectives().map((o) => Object.assign(o, { step: 0, frac: 0 }));
    publish();

    bus.on('dispatch:request', dispatch);
    bus.on('intercom:say', (e) => say(e.who || 'sys', e.text, e.static));
    bus.on('tick', onTick);
    bus.on('phase:change', onPhase);
    bus.on('creature:threat', onThreat);
    window.addEventListener('keydown', (e) => {
      if (tipOpen) {
        // Everything is frozen behind the tip: only Enter or Space dismisses it.
        e.stopImmediatePropagation();
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) closeTip(); }
        return;
      }
      if (mode !== 'working') return;
      if (e.code === 'Space') e.preventDefault();
      if (['1', '2', 'a', 'd'].includes(e.key.toLowerCase())) e.stopImmediatePropagation();
    }, true);
    say('sys', 'Control room online. Crew standing by.', false, 'none');
  }

  CF.register({ id: 'tasks', slots: ['tasks'], mount: mount });
})();
