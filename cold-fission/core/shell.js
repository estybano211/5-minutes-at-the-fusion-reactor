/* CORE (Person A). Builds the control-room frame, the HUD and the start/intro/end overlay,
   scales the stage to the window, then mounts every registered module into its slots.
   A module that throws in mount() is logged and skipped; the rest of the game keeps running. */
(function () {
  const CF = window.CF, S = CF.state, bus = CF.bus, cfg = CF.config;
  const endClock = cfg.fmtClock(cfg.clock.end);

  const LABEL = {
    boot: () => 'STANDBY',
    intro: () => 'BRIEFING',
    day: (d) => 'SHIFT ' + d,
    night: (d) => 'LOCKDOWN ' + d,
    win: () => 'LAUNCHED',
    lose: () => 'LOST',
  };
  const INTRO = [
    'An asteroid strike has taken out every satellite. Earth cannot hear you.',
    'The plant is already leaking. At ' + endClock + ' it melts down completely. It is ' + cfg.fmtClock(cfg.clock.start) + ' now.',
    'The escape ship needs ' + cfg.objectives.length + ' things done before it can fly. Your crew can do them. You cannot leave the control room.',
    'Send them out, then talk them through every locked door.',
    ['The payroll system is still running.', 'dim'],
  ];
  const aliveCrew = () => { const t = S.get('team'); return t.length ? t.filter((x) => x.status !== 'dead').length : cfg.crew.length; };
  const END = {
    launched: { title: 'SHIP LAUNCHED', text: () => 'The ship clears the Moon with ' + aliveCrew() + ' of ' + cfg.crew.length + ' crew aboard.' },
    caught:   { title: 'OVERRUN',       text: () => 'A shutter stayed open one second too long.' },
    late:     { title: 'MELTDOWN',      text: () => 'The clock reached ' + endClock + '. The checklist was not finished.' },
    alone:    { title: 'ABANDONED',     text: () => 'Nobody is left to send. The ship will never fly.' },
  };

  function build(root) {
    root.innerHTML = `
      <div id="stage" class="phase-boot">
        <header id="hud">
          <div id="hud-left"><span id="hud-phase">STANDBY</span><span id="hud-slot" data-slot="hud"></span></div>
          <div id="hud-center"><span class="hud-label">MELTDOWN AT ${endClock}</span><span id="hud-timer">${cfg.fmtClock(S.get('clock'))}</span></div>
          <div id="hud-right">
            <span>CHECKLIST <b id="hud-done">0</b>/${cfg.objectives.length}</span>
            <span>CREW <b id="hud-crew">${cfg.crew.length}</b>/${cfg.crew.length}</span>
            <span>POWER<span id="hud-power" class="bar"><i></i></span></span>
          </div>
        </header>
        <main id="screens">
          <section class="screen"><div class="screen-title">CAMERAS</div><div class="slot" data-slot="cameras"></div></section>
          <section class="screen"><div class="screen-title">SUPPORT TERMINAL</div><div class="slot" data-slot="tasks"></div></section>
          <section class="screen"><div class="screen-title">ESCAPE BOARD</div><div class="slot" data-slot="board"></div></section>
        </main>
        <footer id="controls"><div class="slot" data-slot="controls"></div></footer>
        <div id="fx" data-slot="fx"></div>
        <div id="overlay" data-mode="none">
          <div class="ov-panel" id="ov-start">
            <h1 class="ov-title">COLD FISSION</h1>
            <p class="ov-sub">Control room, Halcyon Reactor, dark side of the Moon.</p>
            <button class="ov-btn" id="btn-start">BEGIN SHIFT</button>
            <p class="ov-keys">Click the screens · <kbd>1</kbd><kbd>2</kbd> cameras · <kbd>A</kbd><kbd>D</kbd> shutters · <kbd>F</kbd> flare</p>
          </div>
          <div class="ov-panel" id="ov-intro">
            ${INTRO.map((l, i) => {
              const [text, cls] = Array.isArray(l) ? l : [l, ''];
              return `<p class="${cls}" style="animation-delay:${0.4 + i * 1.3}s">${text}</p>`;
            }).join('')}
            <button class="ov-btn" id="btn-intro">START SHIFT</button>
          </div>
          <div class="ov-panel" id="ov-end">
            <h1 class="ov-title" id="ov-title"></h1>
            <p id="ov-reason"></p>
            <div id="ov-ending" data-slot="ending"></div>
            <button class="ov-btn" id="btn-again">PLAY AGAIN</button>
          </div>
        </div>
      </div>`;
  }

  function fit() {
    const wrap = document.getElementById('game-wrap');
    const stage = document.getElementById('stage');
    if (!wrap || !stage) return;
    const w = wrap.clientWidth;
    let h = wrap.clientHeight;
    if (h < 100) h = Infinity;   // host gave no usable height: fit to width
    stage.style.setProperty('--s', Math.min(w / cfg.stageW, h / cfg.stageH));
  }

  function wireHud() {
    const $ = (id) => document.getElementById(id);
    const paint = {
      clock: (v) => { $('hud-timer').textContent = cfg.fmtClock(v); },
      timeLeft: (v) => { $('hud-timer').classList.toggle('low', v <= 60); },
      power: (v) => {
        const p = Math.max(0, Math.min(100, v));
        $('hud-power').firstElementChild.style.width = p + '%';
        $('hud-power').classList.toggle('low', p < 25);
      },
      objectives: (v) => { $('hud-done').textContent = v.filter((o) => o.done).length; },
      team: () => { $('hud-crew').textContent = aliveCrew(); },
    };
    Object.keys(paint).forEach((k) => { paint[k](S.get(k)); bus.on('state:' + k, paint[k]); });
  }

  function wireOverlay() {
    const $ = (id) => document.getElementById(id);
    const overlay = $('overlay');
    const stage = $('stage');
    overlay.dataset.mode = CF.dev ? 'none' : 'start';

    $('btn-start').addEventListener('click', () => bus.emit('game:start'));
    $('btn-intro').addEventListener('click', () => bus.emit('intro:done'));
    $('btn-again').addEventListener('click', () => location.reload());

    bus.on('phase:change', ({ phase, day, reason }) => {
      [...stage.classList].forEach((c) => { if (c.indexOf('phase-') === 0) stage.classList.remove(c); });
      stage.classList.add('phase-' + phase);
      stage.dataset.day = day;
      $('hud-phase').textContent = (LABEL[phase] || (() => phase))(day);

      if (phase === 'intro') overlay.dataset.mode = 'intro';
      else if (phase === 'win' || phase === 'lose') {
        const e = END[reason] || { title: phase === 'win' ? 'SHIP LAUNCHED' : 'MELTDOWN', text: () => '' };
        $('ov-title').textContent = e.title;
        $('ov-title').className = 'ov-title ' + phase;
        $('ov-reason').textContent = e.text();
        overlay.dataset.mode = 'end';
      } else overlay.dataset.mode = 'none';
    });
  }

  function mountModules(root) {
    const els = {};
    root.querySelectorAll('[data-slot]').forEach((el) => { els[el.dataset.slot] = el; });
    CF.ui = { stage: document.getElementById('stage'), slots: els };
    CF.modules.forEach((m) => {
      const mine = {};
      (m.slots || []).forEach((n) => { if (els[n]) mine[n] = els[n]; else console.warn('[shell] unknown slot "' + n + '" requested by ' + m.id); });
      try { m.mount(mine); } catch (e) { console.error('[shell] module "' + m.id + '" failed to mount', e); }
    });
  }

  function init() {
    const root = document.getElementById('game-wrap');
    build(root);
    wireHud();
    wireOverlay();
    mountModules(root);
    fit();
    window.addEventListener('resize', fit);
    bus.emit('shell:ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
