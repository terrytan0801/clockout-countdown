// Cave Cartoons (v83): a one-minute cartoon in the cinema, a different episode every week (Monday to Sunday,
// Singapore time), starring the cave's own monsters plus Eugene, the boss. Loaded with cartoons.css when the cinema opens.
// Episodes are short scripts: scenes, moves, speech bubbles, effects and sounds. Sound is made in the browser
// (Web Audio), so there is nothing to download. Uses the app's monEl() to draw the monsters.
(() => {
  const STOP = new Error("stopped");
  const EPOCH = Date.parse("2026-01-05T00:00:00Z"); // a Monday

  /* ---------------- sound ---------------- */
  function audio(ac) {
    if (!ac) return { sfx() {}, music() {}, stop() {} };
    const out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
    const tone = (f, d, { type = "sine", vol = 0.3, to = null, at = 0, att = 0.006 } = {}) => {
      const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.03);
    };
    let buf = null;
    const noise = (d, { vol = 0.3, f = 1200, q = 1, type = "bandpass", at = 0, to = null } = {}) => {
      if (!buf) { buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const c = buf.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; }
      const t = ac.currentTime + at, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d); fl.Q.value = q;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(out); s.start(t); s.stop(t + d + 0.03);
    };
    const S = {
      boing: () => { tone(140, 0.45, { to: 520, vol: 0.4 }); tone(280, 0.45, { to: 900, type: "triangle", vol: 0.12 }); },
      pop: () => tone(900, 0.12, { to: 180, vol: 0.35 }),
      whoosh: () => noise(0.45, { f: 400, to: 3000, q: 0.8, vol: 0.35 }),
      ding: () => { tone(1318, 0.9, { vol: 0.25 }); tone(1975, 0.7, { vol: 0.12, at: 0.01 }); },
      tick: () => tone(2200, 0.03, { type: "square", vol: 0.12 }),
      tock: () => tone(1500, 0.04, { type: "square", vol: 0.12 }),
      honk: () => { tone(233, 0.35, { type: "sawtooth", vol: 0.25 }); tone(277, 0.35, { type: "sawtooth", vol: 0.18 }); },
      sad: () => [392, 370, 349, 330].forEach((f, i) => tone(f, i < 3 ? 0.42 : 1.3, { type: "sawtooth", vol: 0.18, at: i * 0.45, to: i < 3 ? null : f * 0.93 })),
      rimshot: () => { tone(180, 0.12, { to: 120, vol: 0.4 }); tone(150, 0.14, { to: 100, vol: 0.4, at: 0.18 }); noise(0.55, { f: 7000, type: "highpass", vol: 0.25, at: 0.36 }); },
      roar: () => { noise(1.1, { f: 160, to: 90, type: "lowpass", vol: 0.6 }); tone(70, 1.1, { type: "sawtooth", vol: 0.22, to: 45 }); tone(105, 0.9, { type: "square", vol: 0.08, to: 60 }); },
      dun: () => [[147, 0.35, 0], [139, 0.35, 0.45], [110, 1.3, 0.9]].forEach(([f, d, a]) => { tone(f, d, { type: "sawtooth", vol: 0.25, at: a }); tone(f / 2, d, { type: "square", vol: 0.12, at: a }); }),
      scratch: () => noise(0.35, { f: 3000, to: 300, q: 3, vol: 0.45 }),
      beep: () => tone(1046, 0.09, { type: "square", vol: 0.15 }),
      buzz: () => tone(90, 0.5, { type: "sawtooth", vol: 0.3 }),
      clang: () => [523, 1187, 1690, 2310].forEach((f, i) => tone(f, 0.8, { type: "triangle", vol: 0.24 / (i + 1) })),
      squeak: () => tone(1300, 0.14, { to: 2100, vol: 0.25 }),
      typing: () => { for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 900, 0.025, { type: "square", vol: 0.07, at: i * 0.07 + Math.random() * 0.03 }); },
      up: () => tone(500, 0.6, { to: 1600, vol: 0.25 }),
      fall: () => tone(1500, 0.9, { to: 220, vol: 0.25 }),
      thud: () => { tone(90, 0.25, { to: 50, vol: 0.5 }); noise(0.15, { f: 300, type: "lowpass", vol: 0.3 }); },
      spin: () => { for (let i = 0; i < 14; i++) tone(300 + i * 60, 0.08, { type: "triangle", vol: 0.12, at: i * 0.09 }); },
      drumroll: () => { for (let i = 0; i < 24; i++) noise(0.06, { f: 900, vol: 0.16 + i * 0.01, at: i * 0.07 }); },
      fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i < 3 ? 0.16 : 0.7, { type: "square", vol: 0.13, at: i * 0.15 })),
      chime: () => { tone(784, 0.5, { vol: 0.22 }); tone(988, 0.8, { vol: 0.22, at: 0.4 }); },
      snore: () => { noise(1.1, { f: 200, to: 500, type: "lowpass", vol: 0.35 }); tone(70, 1.1, { type: "sawtooth", vol: 0.08 }); },
      alarm: () => { for (let i = 0; i < 4; i++) { tone(1568, 0.08, { type: "square", vol: 0.14, at: i * 0.18 }); tone(1568, 0.08, { type: "square", vol: 0.14, at: i * 0.18 + 0.09 }); } },
      chomp: () => { for (let i = 0; i < 3; i++) noise(0.08, { f: 900, vol: 0.35, at: i * 0.18 }); },
      crack: () => noise(0.3, { f: 2500, q: 0.5, vol: 0.5 }),
      gasp: () => noise(0.4, { f: 800, to: 2400, vol: 0.25 }),
      tiptoe: () => [0, 0.2, 0.4, 0.6].forEach((a, i) => tone(i % 2 ? 660 : 880, 0.06, { type: "triangle", vol: 0.15, at: a })),
      bugle: () => [392, 523, 659, 784, 659, 784].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.18, { type: "square", vol: 0.11, at: i * 0.2 })),
      whistle: () => [784, 988, 880, 1175].forEach((f, i) => tone(f, 0.25, { vol: 0.18, at: i * 0.28 })),
      splat: () => { noise(0.25, { f: 500, type: "lowpass", vol: 0.5 }); tone(200, 0.2, { to: 60, vol: 0.3 }); },
      paper: () => { for (let i = 0; i < 10; i++) noise(0.07, { f: 5000, q: 0.7, vol: 0.18, at: i * 0.06 }); },
      phone: () => { for (let i = 0; i < 2; i++) [1319, 1568].forEach((f, j) => tone(f, 0.06, { type: "square", vol: 0.12, at: i * 0.4 + j * 0.07 })); },
      sparkle: () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, { vol: 0.1, at: i * 0.07 })),
    };
    let timer = null;
    // A little loop: "happy" (bouncy), "tense" (low and slow) or "sneaky" (tiptoe staccato).
    function music(kind) {
      clearInterval(timer); timer = null;
      if (!kind) return;
      const bpm = { happy: 132, tense: 88, sneaky: 110 }[kind] || 120, step = 60 / bpm / 2;
      const bass = { happy: [131, 131, 165, 165, 175, 175, 196, 147], tense: [110, 110, 104, 104, 98, 98, 104, 92], sneaky: [147, 0, 175, 0, 156, 0, 131, 0] }[kind];
      let n = 0, next = ac.currentTime + 0.05;
      timer = setInterval(() => {
        while (next < ac.currentTime + 0.3) {
          const at = Math.max(0, next - ac.currentTime), b = bass[Math.floor(n / 2) % bass.length];
          if (b && n % 2 === 0) tone(b, step * 0.9, { type: "triangle", vol: kind === "tense" ? 0.16 : 0.12, at });
          if (b && n % 2 === 1 && kind === "happy") tone(b * 2, step * 0.45, { type: "square", vol: 0.03, at });
          if (kind === "sneaky" && n % 2 === 0) tone(b ? b * 4 : 523, 0.05, { type: "triangle", vol: 0.04, at });
          if (kind === "happy" && n % 4 === 2) noise(0.05, { f: 6000, type: "highpass", vol: 0.05, at });
          n++; next += step;
        }
      }, 100);
    }
    return { sfx: (name) => { try { (S[name] || (() => {}))(); } catch (e) { /* audio is a nice-to-have */ } }, music, stop: () => music(null) };
  }

  /* ---------------- the stage ---------------- */
  const BG = {
    office: '<div class="ct-win"></div><div class="ct-desk"></div>',
    pantry: '<div class="ct-fridge"></div><div class="ct-counter"></div>',
    mrt: '<div class="ct-win"></div><div class="ct-pole" style="left:16%"></div><div class="ct-pole" style="left:82%"></div><div class="ct-bench"></div>',
    bedroom: '<div class="ct-win"></div><div class="ct-bed"></div>',
    hawker: '<div class="ct-stall"></div><div class="ct-counter"></div>',
    title: "", dark: "",
  };
  // Eugene, the boss: not one of the cave's monsters. Huge, horned, red-eyed, all fangs, and always in a tie.
  const EUGENE = `<svg class="ct-eugene" viewBox="0 0 120 130" aria-hidden="true">
    <path d="M34 42 L20 4 L48 32Z M86 42 L100 4 L72 32Z" fill="#efe6cf" stroke="#120d18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M24 78 Q2 88 6 114" stroke="#33244a" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path d="M96 78 Q118 88 114 114" stroke="#33244a" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path d="M0 112 l4 10 l4 -9 l4 10 l3 -10Z M105 113 l4 9 l3 -10 l4 10 l4 -9Z" fill="#efe6cf"/>
    <path d="M18 130 Q6 72 30 44 Q60 18 90 44 Q114 72 102 130Z" fill="#3a2b52" stroke="#120d18" stroke-width="3"/>
    <path d="M40 130 Q38 98 60 92 Q82 98 80 130Z" fill="#54407a"/>
    <path d="M54 88 L66 88 L63 96 L70 122 L60 129 L50 122 L57 96Z" fill="#d62828" stroke="#120d18" stroke-width="2"/>
    <g class="eu-eyes"><path d="M33 50 L57 60 L34 64Z M87 50 L63 60 L86 64Z" fill="#ff2a2a"/><circle cx="45" cy="59" r="2.6" fill="#ffe066"/><circle cx="75" cy="59" r="2.6" fill="#ffe066"/></g>
    <g class="eu-sleep" stroke="#120d18" stroke-width="3" stroke-linecap="round"><path d="M36 59 L54 61 M66 61 L84 59"/></g>
    <path d="M28 44 L58 56 M92 44 L62 56" stroke="#120d18" stroke-width="7" stroke-linecap="round"/>
    <path d="M36 72 Q60 90 84 72 Q60 80 36 72Z" fill="#120d18"/>
    <path d="M40 74 L44 81 L48 76 L52 83 L56 77 L60 84 L64 77 L68 83 L72 76 L76 81 L80 74Z" fill="#fff"/>
    <text class="eu-z" x="92" y="30" font-size="16" font-weight="900" fill="#fff">Z</text>
  </svg>`;
  const el = (cls, html) => { const e = document.createElement("div"); e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function makeKit(stage, cast, job, snd) {
    stage.innerHTML = '<div class="ct-world"><div class="ct-bg"></div><div class="ct-props"></div><div class="ct-cast"></div><div class="ct-talk"></div></div><div class="ct-cap" hidden></div>';
    const world = stage.firstChild, bg = world.children[0], props = world.children[1], castL = world.children[2], talk = world.children[3], cap = stage.lastChild;
    const actors = {}, things = {};
    const wait = (s) => new Promise((ok, no) => {
      if (job.cancel) return no(STOP);
      const t = setTimeout(() => (job.cancel ? no(STOP) : ok()), s * 1000); job.timers.push(t);
    });
    const restart = (e, cls) => { e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); };
    const k = {
      A: "A", B: "B", C: "C", BOSS: "BOSS",
      n: Object.fromEntries(Object.entries(cast).map(([r, p]) => [r, p.name])),
      wait, sfx: snd.sfx, music: snd.music,
      scene(name, opts = {}) {
        castL.replaceChildren(); props.replaceChildren(); talk.replaceChildren(); world.className = "ct-world";
        world.querySelectorAll(".ct-card").forEach((c) => c.remove()); // the title card
        Object.keys(actors).forEach((r) => delete actors[r]); Object.keys(things).forEach((r) => delete things[r]);
        bg.className = "ct-bg " + name; bg.innerHTML = BG[name] || "";
        if (opts.sign) bg.querySelector(".ct-stall").textContent = opts.sign;
        k.caption(null);
      },
      caption(t) { cap.hidden = !t; if (t) { cap.textContent = t; restart(cap, "ct-cap"); } },
      put(role, x, mood = "", { y = 12, flip = false } = {}) {
        const p = cast[role], a = el("ct-actor" + (role === "BOSS" ? " boss" : "")), fx = el("ct-fx" + (flip ? " flip" : ""));
        if (role === "BOSS") { fx.innerHTML = EUGENE; fx.firstChild.classList.toggle("nap", mood === "nap"); }
        else fx.appendChild(monEl(p.monster, p.color, mood));
        a.append(fx, Object.assign(el("ct-tag"), { textContent: p.name }));
        a.style.left = x + "%"; a.style.bottom = y + "%";
        castL.appendChild(a); actors[role] = { a, fx, x, y, mood };
        return a;
      },
      async enter(role, x, from = "left", mood = "", opts = {}) {
        if (role === "BOSS") { snd.sfx("roar"); k.shake(); } // Eugene never just walks in
        k.put(role, from === "left" ? -20 : from === "right" ? 120 : x, mood, { ...opts, y: from === "bottom" ? -30 : opts.y ?? 12 });
        void actors[role].a.offsetWidth;
        await k.move(role, x, opts.dur ?? 0.9, from === "bottom" ? opts.y ?? 12 : undefined);
      },
      move(role, x, dur = 0.8, y) {
        const r = actors[role]; if (!r) return wait(0);
        r.a.style.setProperty("--mv", dur + "s"); r.a.style.left = x + "%"; r.x = x;
        if (y != null) { r.a.style.bottom = y + "%"; r.y = y; }
        return wait(dur);
      },
      mood(role, mood) {
        const r = actors[role], p = cast[role]; if (!r) return;
        if (role === "BOSS") { const e = r.fx.querySelector(".ct-eugene"); e.classList.toggle("nap", mood === "nap"); e.classList.toggle("dance", mood === "dance"); r.mood = mood; return; }
        const m = monEl(p.monster, p.color, mood); r.fx.querySelector(".mon").replaceWith(m); r.mood = mood;
      },
      fx(role, ...cls) { const r = actors[role]; if (r) cls.forEach((c) => restart(r.fx, c)); },
      unfx(role, ...cls) { const r = actors[role]; if (r) r.fx.classList.remove(...cls); },
      gone(role) { const r = actors[role]; if (r) { r.a.remove(); delete actors[role]; } },
      async say(role, text, { secs, kind = "" } = {}) {
        const r = actors[role]; if (!r) return;
        const b = el("ct-bubble" + (kind ? " " + kind : ""), esc(text));
        const x = Math.max(24, Math.min(76, r.x));
        b.style.left = x + "%"; b.style.bottom = r.y + (role === "BOSS" ? 40 : 25) + "%"; b.style.setProperty("--tail", 50 + (r.x - x) * 1.6 + "%");
        talk.replaceChildren(b);
        await wait(secs ?? 1.5 + text.length * 0.065);
        b.remove();
      },
      prop(id, html, x, y, size = 10, cls = "") {
        const e = el("ct-prop" + (cls ? " " + cls : ""), html);
        e.style.left = x + "%"; e.style.bottom = y + "%"; e.style.setProperty("--sz", size + "cqw");
        props.appendChild(e); things[id] = e; restart(e, "pop"); return e;
      },
      pmove(id, x, y, dur = 0.6) { const e = things[id]; if (!e) return wait(0); e.style.setProperty("--mv", dur + "s"); e.style.left = x + "%"; e.style.bottom = y + "%"; return wait(dur); },
      pset(id, html) { if (things[id]) things[id].innerHTML = html; },
      pfx(id, cls, on = true) { if (things[id]) things[id].classList.toggle(cls, on); },
      pgone(id) { if (things[id]) { things[id].remove(); delete things[id]; } },
      zoom(on) { world.classList.toggle("zoom", on); },
      shake() { restart(world, "shake"); },
      card(html, cls = "title") { k.scene(cls); stage.querySelector(".ct-world").appendChild(el("ct-card", html)); },
      monHTML(role) { const p = cast[role]; return monEl(p.monster, p.color, "dance").outerHTML; },
    };
    return k;
  }

  /* ---------------- episodes ---------------- */
  const EPISODES = [
    { title: "The Last Curry Puff", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("pantry"); k.caption("3:00 PM. The pantry."); k.music("happy");
      k.prop("puff", "🥟", 50, 34, 12, "glow"); k.sfx("sparkle");
      await k.enter(A, 18, "left");
      await k.say(A, "Wah... the LAST curry puff.");
      await k.enter(B, 82, "right", "", { flip: true });
      await k.say(B, "Eh. I saw it first leh.");
      await k.say(A, "You already ate two just now!");
      await k.say(B, "That one count as breakfast!", { kind: "shout" });
      await k.say(A, "OK OK. I give you my Milo.");
      await k.say(B, "Milo AND kaya toast.");
      await k.say(A, "...deal. NO WAIT. Not deal.", { kind: "shout" });
      k.music(null); k.caption("..."); k.zoom(true); k.sfx("whistle");
      k.prop("weed", "🌾", -10, 18, 9); k.pmove("weed", 115, 18, 3); k.pfx("weed", "spin");
      await k.wait(3);
      k.zoom(false); k.caption(null); k.music("tense");
      k.move(A, 38, 3); await k.move(B, 62, 3);
      k.sfx("up"); await k.enter(C, 50, "bottom", "eat");
      k.pmove("puff", 50, 22, 0.2); k.sfx("chomp"); await k.wait(0.4); k.pgone("puff");
      await k.say(C, "Shiok.", { secs: 1.2 });
      k.music(null); k.fx(A, "freeze"); k.fx(B, "freeze"); k.sfx("sad"); await k.wait(2.2);
      k.unfx(A, "freeze"); k.unfx(B, "freeze");
      await k.enter(BOSS, 50, "right", "", { dur: 0.6 });
      k.gone(C);
      k.prop("box", "🥡", 50, 36, 12);
      await k.say(BOSS, "Who wants curry puff? I bought fifty.");
      k.fx(A, "faint"); k.fx(B, "faint"); k.sfx("fall"); await k.wait(0.9); k.sfx("thud"); k.shake();
      await k.wait(0.8);
      k.sfx("up"); await k.enter(C, 80, "bottom", "eat");
      await k.say(C, k.n.BOSS + ", can tapau three?", { secs: 2.2 });
      k.sfx("rimshot"); await k.wait(1.6);
    } },
    { title: "5:59 PM", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("office"); k.caption("5:57 PM.");
      k.prop("clock", '<div class="ct-clock">5:57</div>', 70, 74, 10);
      k.put(A, 20, "work"); k.put(B, 50, "work"); k.put(C, 80, "work");
      for (let i = 0; i < 3; i++) { k.sfx(i % 2 ? "tock" : "tick"); await k.wait(0.5); }
      await k.say(A, "Three more minutes...");
      await k.say(B, "Two minutes fifty-nine...");
      k.mood(C, "dance"); k.prop("bag", "🎒", 80, 36, 9); k.sfx("pop");
      await k.say(C, "Bag packed since 3 o'clock.");
      await k.say(A, "If boss come now, I pretend go toilet.", { kind: "think" });
      await k.say(B, "I pretend MC. Cough cough.", { kind: "think" });
      k.caption("5:58 PM."); k.pset("clock", '<div class="ct-clock">5:58</div>');
      await k.say(C, "My shoes already on.");
      k.zoom(true);
      for (let i = 0; i < 4; i++) { k.sfx(i % 2 ? "tock" : "tick"); await k.wait(0.9); }
      k.zoom(false); k.caption("5:59 PM."); k.pset("clock", '<div class="ct-clock">5:59</div>');
      k.sfx("whoosh"); await k.enter(BOSS, 50, "right", "", { dur: 0.4 });
      k.sfx("dun"); k.music("tense");
      await k.say(BOSS, "Eh, quick meeting? Five minutes only.", { kind: "shout" });
      k.caption("Nobody has ever survived a \"five minutes only\".");
      k.fx(A, "shake"); k.fx(B, "shake"); k.fx(C, "shake"); await k.wait(2);
      k.caption(null); k.mood(A, "tired"); k.sfx("phone");
      await k.say(A, "Hello? WHAT? My cat on fire?!", { kind: "shout" });
      k.sfx("whoosh"); await k.move(A, -30, 0.35);
      await k.say(B, "Wah... my plant also on fire!", { kind: "shout" });
      k.sfx("whoosh"); await k.move(B, -30, 0.35);
      await k.say(C, "My aircon... also on fire!", { kind: "shout" });
      k.sfx("whoosh"); await k.move(C, 130, 0.35);
      k.music(null); await k.wait(0.8);
      await k.say(BOSS, "...the meeting was about fire safety.", { secs: 2.6 });
      k.pset("clock", '<div class="ct-clock red">6:00</div>'); k.sfx("ding"); await k.wait(0.6);
      k.sfx("rimshot"); await k.wait(1.8);
    } },
    { title: "Aircon Wars", async run(k) {
      const { A, B, C } = k;
      k.scene("office"); k.caption("Office temperature: 24°C."); k.music("happy");
      k.prop("ac", '<div class="ct-clock">24°C</div>', 50, 82, 10);
      k.put(A, 22, "tired"); k.put(B, 78, "", { flip: true });
      await k.say(A, "So hot... my keyboard melting sia.");
      k.sfx("beep"); k.pset("ac", '<div class="ct-clock">18°C</div>'); await k.wait(0.6);
      k.fx(B, "shiver"); k.sfx("gasp");
      await k.say(B, "Who put 18?! I can see my breath!", { kind: "shout" });
      k.sfx("beep"); k.pset("ac", '<div class="ct-clock red">26°C</div>'); k.unfx(B, "shiver"); await k.wait(0.6);
      await k.say(A, "Walao eh.");
      k.prop("peng", "🐧", 86, 40, 10); k.sfx("squeak");
      await k.say(A, "Bro, it's 18. Not Antarctica.");
      await k.say(B, "Then why got penguin on my desk?!", { kind: "shout" });
      k.pgone("peng");
      k.caption("The war begins."); k.music("tense");
      for (let i = 0; i < 10; i++) {
        const cold = i % 2 === 0; k.sfx("beep");
        k.pset("ac", `<div class="ct-clock${cold ? "" : " red"}">${cold ? 18 - (i >> 1) : 26 + (i >> 1)}°C</div>`);
        k.fx(cold ? A : B, "jump"); await k.wait(Math.max(0.18, 0.6 - i * 0.05));
      }
      k.prop("remote", "🎛️", 30, 40, 9); k.sfx("whoosh");
      await k.pmove("remote", 70, 50, 0.4); k.sfx("whoosh"); await k.pmove("remote", 30, 46, 0.35); k.sfx("whoosh");
      await k.pmove("remote", 25, 120, 0.6); k.sfx("crack"); k.shake(); k.music(null);
      k.caption("The remote is gone. The aircon is stuck at..."); k.sfx("drumroll"); await k.wait(1.8);
      k.pset("ac", '<div class="ct-clock">16°C</div>'); k.sfx("crack");
      k.fx(A, "freeze"); k.fx(B, "freeze"); k.caption("16°C. Forever.");
      await k.wait(1.8);
      k.mood(C, "eat"); await k.enter(C, 50, "right", "eat");
      await k.say(C, "Wah, finally shiok. Perfect for hot pot.", { secs: 2.6 });
      await k.say(C, "Eh, why you two so quiet today?");
      k.fx(A, "shake"); k.fx(B, "shake"); k.sfx("crack");
      await k.say(A, "mmph mmmph!!", { secs: 1.6 });
      k.sfx("rimshot"); await k.wait(1.8);
    } },
    { title: "The Chope", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("mrt"); k.caption("Jurong East. Peak hour."); k.music("sneaky");
      k.prop("seat", '<div class="ct-sign">EMPTY SEAT</div>', 50, 44, 6, "glow"); k.sfx("sparkle");
      k.put(A, 12); k.put(B, 88, "", { flip: true });
      await k.say(A, "(Don't look at the seat. Don't look at the seat.)", { kind: "think" });
      await k.say(B, "(Very casual. Very casual.)", { kind: "think" });
      k.sfx("whistle"); await k.wait(1.2);
      await k.say(A, "(If I sit, people will judge me.)", { kind: "think" });
      await k.say(B, "(If I don't sit, my legs will judge me.)", { kind: "think" });
      for (let i = 0; i < 3; i++) { k.sfx("tiptoe"); k.move(A, 18 + i * 7, 0.6); await k.move(B, 82 - i * 7, 0.6); await k.wait(0.3); }
      k.music(null); k.sfx("chime"); k.caption("Doors opening.");
      await k.enter(C, 50, "bottom", "dance", { dur: 0.4 });
      k.prop("tissue", "🧻", 50, 30, 9); k.sfx("pop");
      await k.say(C, "CHOPE!", { kind: "shout", secs: 1 });
      k.sfx("whoosh"); await k.move(C, 50, 0.4, -40); k.gone(C);
      k.caption(null); await k.wait(0.6);
      await k.say(A, "...it's choped.");
      await k.say(B, "Rules are rules.");
      k.sfx("bugle"); k.fx(A, "jump"); k.fx(B, "jump"); k.caption("Respect the tissue.");
      await k.wait(2.2);
      k.caption("Next station: Clementi."); k.sfx("chime");
      await k.say(A, "Eh... how long we must guard?");
      await k.say(B, "Until the tissue owner come back. That's the law.");
      k.caption(null); k.sfx("chime"); await k.enter(BOSS, 50, "right", "nap", { dur: 0.7 });
      k.pgone("tissue"); k.sfx("squeak");
      await k.say(BOSS, "Ah, nice cushion.");
      k.fx(A, "shake"); k.fx(B, "shake"); k.sfx("scratch");
      await k.say(A, "WALAO!", { kind: "shout", secs: 1.2 });
      k.sfx("snore"); await k.wait(1.4);
      await k.say(B, "...can share or not?", { secs: 1.8 });
      k.sfx("snore"); await k.wait(1); k.sfx("rimshot"); await k.wait(1.6);
    } },
    { title: "Reply All", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("office"); k.caption("Subject: Q3 Synergy Alignment Touchpoint"); k.music("happy");
      k.put(A, 22, "work"); k.put(B, 55, "work"); k.put(C, 85, "work", { flip: true });
      k.sfx("typing"); await k.say(A, "*typing to " + k.n.B + "*  this meeting so long, can die", { kind: "think", secs: 3 });
      k.sfx("whoosh"); k.prop("mail", "✉️", 22, 40, 9); await k.pmove("mail", 50, 110, 0.7);
      k.music(null); await k.wait(0.8);
      await k.say(A, "...wait. Why got \"Reply All\"?", { secs: 2.2 });
      k.sfx("scratch"); k.zoom(true); k.fx(A, "shake"); k.mood(A, "tired");
      await k.say(A, "UNSEND! UNSEND! UNSEND!", { kind: "shout", secs: 1.6 });
      k.zoom(false); k.sfx("typing"); await k.wait(0.3); k.sfx("typing");
      k.caption("Recall failed."); k.sfx("buzz"); await k.wait(1.4);
      await k.say(A, "Maybe nobody read yet...", { kind: "think" });
      k.caption("Delivered to: Everyone (612 people).");
      for (let i = 0; i < 9; i++) { k.sfx("ding"); await k.wait(Math.max(0.12, 0.45 - i * 0.04)); }
      k.mood(B, ""); k.mood(C, ""); k.fx(B, "spin"); k.fx(C, "spin"); k.sfx("gasp"); await k.wait(1.2);
      await k.say(B, "Bro...");
      await k.say(C, "Bro, even the CEO liked it.", { secs: 2.2 });
      k.sfx("fall"); await k.move(A, 22, 0.6, -18); k.caption("*hides under desk*"); await k.wait(1.2);
      k.caption(null); await k.enter(BOSS, 50, "right", "", { dur: 0.6 });
      k.sfx("ding"); await k.say(BOSS, "I read your email.", { secs: 1.8 });
      k.sfx("dun"); await k.wait(1.6);
      await k.say(BOSS, "+1. I also fell asleep in it.", { secs: 2.4 });
      await k.say(BOSS, "Meeting cancelled. Go home!", { kind: "shout", secs: 2 });
      k.sfx("fanfare"); k.music("happy"); await k.move(A, 22, 0.4, 12);
      [A, B, C, BOSS].forEach((r) => { k.mood(r, "dance"); k.fx(r, "jump"); }); await k.wait(2.6);
    } },
    { title: "Eat What?", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("office"); k.caption("12:01 PM."); k.music("happy");
      k.put(A, 25, ""); k.put(B, 75, "", { flip: true });
      const lines = [["Lunch eat what?", "Anything."], ["Chicken rice?", "Don't want."], ["Laksa?", "Too hot."], ["Mala?", "Yesterday ate already."], ["Mee pok?", "Nah."], ["Prata?", "Heavy."], ["Sushi?", "Expensive."], ["Ban mian?", "Hmm... no."]];
      for (let i = 0; i < lines.length; i++) {
        const s = Math.max(0.55, 1.6 - i * 0.18);
        await k.say(A, lines[i][0], { secs: s }); await k.say(B, lines[i][1], { secs: s });
        if (i === 4) { k.mood(A, "tired"); k.caption("12:45 PM."); }
      }
      k.caption("1:30 PM. Still deciding."); k.sfx("buzz");
      await k.enter(C, 50, "bottom", "");
      await k.say(C, "ENOUGH. Let the wheel decide.", { kind: "shout" });
      k.prop("wheel", "🎡", 50, 48, 18, "spin"); k.sfx("spin"); k.sfx("drumroll"); await k.wait(2);
      k.pfx("wheel", "spin", false); k.sfx("ding");
      k.caption("The wheel says: \"ANYTHING\"."); await k.wait(2);
      await k.say(A, "Spin again!", { kind: "shout" });
      k.pfx("wheel", "spin"); k.sfx("spin"); await k.wait(1.4); k.pfx("wheel", "spin", false); k.sfx("ding");
      k.caption("The wheel says: \"ANYTHING\". Again."); await k.wait(2);
      k.scene("hawker", { sign: "ANYTHING STALL" }); k.caption("There is a stall called Anything."); k.music("happy");
      k.put(A, 20); k.put(B, 45); k.put(C, 70); k.put(BOSS, 50, "cook", { y: 40 });
      await k.say(BOSS, "What you want?");
      await k.say(B, "Anything.");
      await k.say(BOSS, "Anything got chicken rice, laksa, mala...", { secs: 2.6 });
      await k.say(B, "Don't want.");
      await k.say(BOSS, "...then you want what?", { secs: 1.8 });
      await k.say(B, "Anything.", { secs: 1.6 });
      k.fx(A, "faint"); k.fx(B, "faint"); k.fx(C, "faint"); k.sfx("fall"); await k.wait(0.9); k.sfx("thud"); k.shake();
      k.sfx("rimshot"); await k.wait(1.8);
    } },
    { title: "The Printer", async run(k) {
      const { A, B } = k;
      k.scene("office"); k.caption("Printing 1 page..."); k.music("happy");
      k.prop("printer", "🖨️", 62, 34, 22); k.put(A, 28, "");
      await k.say(A, "Just one page only. Please.");
      k.sfx("beep"); await k.wait(0.6); k.sfx("buzz");
      k.prop("err", '<div class="ct-sign">PAPER JAM</div>', 62, 58, 6); k.caption(null);
      await k.say(A, "Again?!", { kind: "shout" });
      await k.say(A, "Eh, nice printer... good printer... please lah.", { secs: 2.4 });
      k.sfx("buzz"); await k.wait(0.6);
      await k.say(A, "OK. Off and on again. Classic.");
      k.sfx("beep"); k.pset("err", '<div class="ct-sign">UPDATING 1%</div>'); await k.wait(1.6);
      k.pset("err", '<div class="ct-sign">UPDATING 2%</div>'); await k.wait(1.2);
      await k.say(A, "WALAO.", { kind: "shout" });
      k.fx(A, "jump"); k.sfx("clang"); k.shake(); k.caption("*kick*"); await k.wait(1);
      k.pgone("err"); k.caption(null); k.music("tense");
      k.sfx("whoosh"); k.prop("p0", "📄", 62, 40, 10);
      for (let i = 0; i < 14; i++) {
        const id = "p" + (i + 1); k.prop(id, "📄", 62, 40, 9);
        k.pmove(id, 18 + Math.random() * 22, 10 + Math.random() * 30, 0.35); k.sfx("paper");
        await k.wait(0.18);
      }
      k.mood(A, "tired"); k.fx(A, "shake"); k.caption("Printing 500 pages...");
      k.prop("pile", "📄📄📄<br>📄📄📄📄<br>📄📄📄📄📄", 28, 22, 9); k.gone(A); k.music(null); await k.wait(1.8);
      k.caption(null); await k.enter(B, 80, "right", "", { flip: true });
      await k.say(B, "Oh, it's working? Can print mine also?");
      k.sfx("beep"); k.prop("one", "📄", 62, 40, 9); await k.pmove("one", 78, 34, 0.4); k.sfx("ding");
      await k.say(B, "Nice. Thanks ah.");
      await k.move(B, 120, 0.8);
      k.put(A, 28, "tired", { y: 30 }); k.sfx("pop");
      await k.say(A, "...why.", { secs: 1.8 });
      k.sfx("beep"); k.prop("note", '<div class="ct-sign">SORRY :)</div>', 62, 58, 6); await k.wait(1.6);
      k.pset("note", '<div class="ct-sign">PAPER JAM</div>'); k.sfx("buzz"); await k.wait(1.2);
      k.sfx("rimshot"); await k.wait(1.8);
    } },
    { title: "Monday", async run(k) {
      const { A, B, C, BOSS } = k;
      k.scene("bedroom"); k.caption("Monday. 7:00 AM.");
      k.put(A, 34, "nap", { y: 30 }); k.prop("alarm", "⏰", 78, 30, 11);
      const snooze = async (t, gap) => {
        k.caption(t); k.sfx("alarm"); k.pfx("alarm", "spin"); await k.wait(gap);
        k.pfx("alarm", "spin", false); k.sfx("boing"); k.fx(A, "jump"); k.caption("*snooze*"); await k.wait(gap * 0.7); k.sfx("snore"); await k.wait(gap * 0.5);
      };
      await snooze("7:00 AM.", 1.3);
      await k.say(A, "Five more minutes... five more years...", { kind: "think" });
      await snooze("7:10 AM.", 1); await snooze("7:20 AM.", 0.8); await snooze("7:45 AM.", 0.6); await snooze("8:30 AM.", 0.45);
      k.caption("8:55 AM."); k.sfx("alarm"); k.zoom(true); k.mood(A, "tired");
      await k.say(A, "8:55?!?!", { kind: "shout", secs: 1.2 }); k.zoom(false);
      k.sfx("whoosh"); await k.move(A, 130, 0.35);
      k.scene("office"); k.caption("9:02 AM."); k.music("happy");
      k.put(B, 55, "work"); k.put(C, 82, "work", { flip: true });
      k.sfx("whoosh"); await k.enter(A, 22, "left", "tired", { dur: 0.35 }); k.fx(A, "pj"); k.prop("pillow", "🛏️", 22, 34, 8);
      k.music(null); k.mood(B, ""); k.mood(C, ""); await k.wait(1);
      await k.say(B, "...nice outfit.");
      await k.say(C, "Is that a pillow?");
      await k.say(A, "It's... an ergonomic laptop bag.", { secs: 2.4 });
      k.fx(A, "blush"); k.sfx("squeak"); await k.wait(1.2);
      await k.enter(BOSS, 50, "right", "", { dur: 0.8 }); k.fx(BOSS, "pj"); k.prop("teddy", "🧸", 56, 26, 8);
      await k.say(BOSS, "Morning everyone.");
      k.sfx("scratch"); await k.wait(1);
      await k.say(C, "Wait... today public holiday leh.", { secs: 2.4 });
      k.sfx("dun"); await k.wait(1.4);
      await k.say(BOSS, "...so why everybody here?", { secs: 2 });
      [A, B, C, BOSS].forEach((r) => k.mood(r, "nap")); k.caption("Everyone: ...ok bye."); k.sfx("snore");
      await k.wait(1.6); k.sfx("rimshot"); await k.wait(1.8);
    } },
  ];

  /* ---------------- playing ---------------- */
  // This week's episode: one per week from Monday, cycling through the list.
  const weekOf = (day) => Math.floor((Date.parse(day + "T00:00:00Z") - EPOCH) / (7 * 864e5));
  const pick = (day) => ((weekOf(day) % EPISODES.length) + EPISODES.length) % EPISODES.length;

  // The cast: you as the lead, then two cave-mates (a different pair each week), then Eugene.
  const FILL = [{ name: "Kopi", monster: 3, color: "teal" }, { name: "Milo", monster: 5, color: "violet" }, { name: "Teh", monster: 8, color: "gold" }];
  function castFor(me, members, day) {
    const w = weekOf(day), others = members.filter((p) => p.id !== me.id)
      .map((p, i) => ({ p, h: ((i + 1) * 2654435761 + w * 40503) % 4294967296 })).sort((a, b) => a.h - b.h).map((x) => x.p);
    const crew = [me, ...others, ...FILL].slice(0, 3);
    return { A: crew[0], B: crew[1], C: crew[2], BOSS: { name: "Eugene" } };
  }

  async function play(stage, cast, index, { ac, job }) {
    const ep = EPISODES[index], snd = audio(ac), k = makeKit(stage, cast, job, snd);
    try {
      const names = [cast.A, cast.B, cast.C].map((p) => esc(p.name));
      k.card(`<small>Cave Cartoons · Episode ${index + 1}</small><h3>${esc(ep.title)}</h3><div class="ct-crew">${k.monHTML("A")}${k.monHTML("B")}${k.monHTML("C")}</div><p>Starring ${names[0]}, ${names[1]} &amp; ${names[2]}</p>`);
      snd.sfx("fanfare"); await k.wait(3.4);
      await ep.run(k);
      snd.stop();
      k.card(`<h3>The End</h3><p>A new cartoon every Monday.</p>`, "dark"); snd.sfx("fanfare");
      await k.wait(2.6);
    } finally { snd.stop(); job.timers.forEach(clearTimeout); }
  }

  // The still title card shown before play.
  function poster(stage, cast, index) {
    const k = makeKit(stage, cast, { cancel: false, timers: [] }, audio(null));
    k.card(`<small>Cave Cartoons · Episode ${index + 1}</small><h3>${esc(EPISODES[index].title)}</h3><div class="ct-crew">${k.monHTML("A")}${k.monHTML("B")}${k.monHTML("C")}</div><p>Starring ${[cast.A, cast.B, cast.C].map((p) => esc(p.name)).join(", ")}</p>`);
  }

  window.CARTOONS = { EPISODES, pick, castFor, play, poster, STOP };
})();
