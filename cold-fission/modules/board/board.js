/* ─────────────────────────────────────────────────────────────────────────
   MODULE: board      OWNER: Person D (Board and Atmosphere)
   Owns   the Escape Board screen (right): the crew list, the escape checklist, dispatching and LAUNCH.
   Reads  state: team, objectives, phase       (written by the tasks module; you never change them)
   Emits  dispatch:request {crew, objective}   the tasks module starts the trip
          launch:request                       Core wins the game if every objective is done
          sfx <name>
   Flow: click a crew member to select them, then click an objective to send them there.
   The rows are built once and updated in place, so a click is never lost to a re-render.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;

  const STATUS = { idle: 'READY', travel: 'EN ROUTE', work: 'WORKING', stuck: 'NEEDS HELP', dead: 'LOST' };

  let sel = null, hintOverride = '';
  const crewEl = {}, objEl = {};
  let hint, launch, count;

  const nameOf = (id) => { const t = S.get('team').find((x) => x.id === id); return t ? t.name : id; };
  const objName = (id) => { const o = cfg.objectives.find((x) => x.id === id); return o ? o.name : id; };

  function render() {
    const team = S.get('team'), objs = S.get('objectives');
    const day = S.get('phase') === 'day';
    const done = objs.filter((o) => o.done).length;
    const alive = team.filter((t) => t.status !== 'dead');
    const all = objs.length > 0 && done === objs.length;

    team.forEach((t) => {
      const e = crewEl[t.id];
      if (!e) return;
      const free = t.status === 'idle' && !t.cover && day;
      e.btn.disabled = !free;
      e.btn.classList.toggle('is-sel', sel === t.id);
      e.btn.classList.toggle('is-dead', t.status === 'dead');
      e.btn.classList.toggle('is-stuck', t.status === 'stuck' && !t.cover);
      e.btn.classList.toggle('is-cover', !!t.cover);
      e.pips.forEach((p, i) => p.classList.toggle('on', i < t.hp));
      const place = t.at ? (cfg.objectives.find((o) => o.id === t.at) || {}).place : '';
      e.st.textContent = t.cover ? 'COVER' : (t.status === 'travel' || t.status === 'work' ? STATUS[t.status] + ' · ' + place : STATUS[t.status]);
    });
    if (sel && !team.some((t) => t.id === sel && t.status === 'idle' && !t.cover) ) sel = null;

    objs.forEach((o) => {
      const e = objEl[o.id];
      if (!e) return;
      const avail = !o.done && !o.by && !o.locked && day;
      e.btn.disabled = !(avail && sel);
      e.btn.classList.toggle('is-done', o.done);
      e.btn.classList.toggle('is-locked', o.locked && !o.done);
      e.btn.classList.toggle('is-avail', avail && !!sel);
      e.bar.style.width = Math.round(o.progress * 100) + '%';
      e.st.textContent = o.done ? 'DONE'
        : o.by ? nameOf(o.by).toUpperCase()
        : o.locked ? 'NEEDS ' + o.requires.map((id) => objName(id)).join(' + ').toUpperCase()
        : o.place.toUpperCase();
    });

    count.textContent = done + '/' + objs.length;
    launch.disabled = !all;
    launch.classList.toggle('ready', all);

    if (hintOverride) hint.textContent = hintOverride;
    else if (all) hint.textContent = 'Checklist complete. Launch when ready.';
    else if (!alive.length && team.length) hint.textContent = 'Nobody is left to send.';
    else if (S.get('phase') === 'night') hint.textContent = 'Lockdown: the crew is taking cover.';
    else if (S.get('phase') !== 'day') hint.textContent = '';
    else hint.textContent = sel ? 'Now pick an objective.' : 'Select a crew member, then an objective.';
  }

  function mount(slots) {
    const root = slots.board;
    const pips = Array(cfg.crewHp).fill('<b></b>').join('');
    root.innerHTML = `
      <div class="bd">
        <div class="bd-sec"><span>CREW</span></div>
        <div class="bd-crew">${cfg.crew.map((c) =>
          `<button class="bd-member" data-id="${c.id}"><i class="bd-sw" style="background:${c.color}"></i><span class="bd-name">${c.name}</span><span class="bd-hp">${pips}</span><span class="bd-st">READY</span></button>`).join('')}</div>
        <div class="bd-sec"><span>ESCAPE CHECKLIST</span><span class="bd-count">0/${cfg.objectives.length}</span></div>
        <div class="bd-objs">${cfg.objectives.map((o) =>
          `<button class="bd-obj" data-id="${o.id}"><span class="bd-kind">${o.kind === 'item' ? 'ITEM' : 'OP'}</span><span class="bd-oname">${o.name}</span><span class="bd-ost"></span><span class="bd-prog"><i></i></span></button>`).join('')}</div>
        <div class="bd-hint"></div>
        <button class="bd-launch" disabled>LAUNCH</button>
      </div>`;

    hint = root.querySelector('.bd-hint');
    launch = root.querySelector('.bd-launch');
    count = root.querySelector('.bd-count');

    root.querySelectorAll('.bd-member').forEach((b) => {
      crewEl[b.dataset.id] = { btn: b, pips: [...b.querySelectorAll('.bd-hp b')], st: b.querySelector('.bd-st') };
      b.addEventListener('click', () => { sel = sel === b.dataset.id ? null : b.dataset.id; bus.emit('sfx', 'click'); render(); });
    });
    root.querySelectorAll('.bd-obj').forEach((b) => {
      objEl[b.dataset.id] = { btn: b, st: b.querySelector('.bd-ost'), bar: b.querySelector('.bd-prog i') };
      b.addEventListener('click', () => {
        if (!sel) return;
        bus.emit('dispatch:request', { crew: sel, objective: b.dataset.id });
        sel = null;
        render();
      });
    });
    launch.addEventListener('click', () => bus.emit('launch:request'));

    ['team', 'objectives', 'phase'].forEach((k) => bus.on('state:' + k, render));
    bus.on('phase:change', render);
    render();
  }

  CF.register({ id: 'board', slots: ['board'], mount: mount });
})();
