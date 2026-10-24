/* Sound, CRT look, threat lighting and ending text. */
(function () {
  const CF = window.CF, bus = CF.bus;

  const GEIGER_PER_SEC = [0.4, 2.5, 6, 12];        // ticks per second at threat level 0..3
  const ENDINGS = {
    win: [
      'Launch sequence complete. The ship lifts off as the plant melts down behind it.',
      'A voice on the radio, very close to your ear:',
      '“Thank you for taking me with you.”',
    ],
    caught: ['Nobody opens the shutters after that.', 'The clock keeps running. Someone will see the light from Earth.'],
    late: ['The reactor does what it was always going to do.', 'The Company will be informed of your absence.'],
    alone: ['The control room is very quiet.', 'The reactor does not mind.'],
  };

  let threatLevel = 0;

  function mount(slots) {
    const fx = slots.fx;
    fx.innerHTML = '<div class="fx-scan"></div><div class="fx-vignette"></div><div class="fx-alert"></div><div class="fx-flash"></div>';
    const flash = fx.querySelector('.fx-flash');
    const alert = fx.querySelector('.fx-alert');

    // The mute button lives in the HUD slot.
    if (slots.hud) {
      slots.hud.innerHTML = '<button class="fx-mute" title="Mute (M)">SND ON</button>';
      const btn = slots.hud.querySelector('button');
      const toggle = () => { CF.audio.setMuted(!CF.audio.isMuted()); btn.textContent = CF.audio.isMuted() ? 'SND OFF' : 'SND ON'; };
      btn.addEventListener('click', toggle);
      document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'm' && !e.repeat) toggle(); });
    }

    // Browsers only allow sound after a click; game:start is a click, and in /dev pages we wait for the first one.
    bus.on('game:start', () => CF.audio.init());
    document.addEventListener('pointerdown', () => CF.audio.init(), { once: true });

    bus.on('sfx', (n) => CF.audio.play(typeof n === 'string' ? n : n && n.name));

    bus.on('fx:flash', (color) => {
      flash.style.background = color || '#fff';
      flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
    });

    bus.on('creature:threat', (e) => {
      if (e.level === 3 && threatLevel < 3) CF.audio.play('alarm');
      threatLevel = e.level;
      alert.classList.toggle('on', e.level >= 2);
      CF.audio.droneLevel(e.level >= 2 ? 0.8 : 0.2);
    });
    bus.on('creature:blackout', () => bus.emit('fx:flash', '#300'));

    bus.on('tick', (e) => {
      if (e.phase !== 'play') return;
      if (Math.random() < GEIGER_PER_SEC[threatLevel] * e.dt) CF.audio.play('geiger');
    });

    bus.on('phase:change', (e) => {
      threatLevel = 0;
      alert.classList.remove('on');
      CF.audio.droneLevel(e.phase === 'play' ? 0.2 : 0);
      if (e.phase === 'win') { CF.audio.play('win'); showEnding(slots.ending, ENDINGS.win); }
      if (e.phase === 'lose') { CF.audio.play('lose'); showEnding(slots.ending, ENDINGS[e.reason] || []); }
    });
  }

  function showEnding(el, lines) {
    if (!el) return;
    el.innerHTML = lines.map((l, i) => '<p style="margin:0 0 6px;opacity:0;animation:rise .9s ease forwards;animation-delay:' + (0.5 + i * 1.4) + 's">' + l + '</p>').join('');
  }

  CF.register({ id: 'atmosphere', slots: ['fx', 'hud', 'ending'], mount: mount });
})();
