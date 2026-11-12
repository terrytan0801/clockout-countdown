// Props for the monsters' day (v41): beds, food, books and free-time things.
// Each prop is drawn in the same 100x100 box as the monster and laid over it (front) or behind it (back),
// so it works for every monster. index.html picks one with monsterProps(classes) and puts it in the monster's box.
(function () {
  /* ---------- food: every meal can be something different (they're monsters) ---------- */
  const FOOD = {
    noodles: `<path class="steam" d="M42 62 q-3 -5 0 -9 q3 -4 0 -8"/><path class="steam s2" d="M52 61 q-3 -5 0 -9 q3 -4 0 -8"/>` +
      `<path class="chop" d="M60 56 L80 80"/><path class="chop" d="M66 54 L83 79"/>` +
      `<path class="bowl" d="M24 76 Q26 95 50 95 Q74 95 76 76Z"/><ellipse class="rice" cx="50" cy="76" rx="26" ry="5"/>` +
      `<path class="noodle" d="M32 76 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0"/><path class="bowl-band" d="M28 84 Q50 90 72 84"/>`,
    pizza: `<path class="pz" d="M50 60 L73 95 Q50 100 27 95Z"/><path class="pz-crust" d="M26 94 Q50 100 74 94 L76 98 Q50 104 24 98Z"/>` +
      `<circle class="pep" cx="47" cy="77" r="3.6"/><circle class="pep" cx="57" cy="87" r="3.6"/><circle class="pep" cx="42" cy="90" r="3"/>` +
      `<path class="cheese-d" d="M61 82 q1.5 5 -.5 8"/>`,
    burger: `<path class="bun" d="M27 80 Q27 63 50 63 Q73 63 73 80Z"/><circle class="seed" cx="41" cy="70" r="1.2"/><circle class="seed" cx="51" cy="67" r="1.2"/><circle class="seed" cx="60" cy="71" r="1.2"/>` +
      `<path class="lettuce" d="M25 81 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 q4 3 8 0 L75 85 L25 85Z"/>` +
      `<path class="cheese" d="M27 84 L73 84 L68 90 L62 85 L54 91 L46 85 L38 90 L32 85Z"/><rect class="patty" x="26" y="85" width="48" height="6" rx="3"/>` +
      `<path class="bun" d="M27 91 L73 91 Q73 98 50 98 Q27 98 27 91Z"/>`,
    donut: `<circle class="dough" cx="50" cy="81" r="15"/><path class="icing" d="M37 77 Q36 67 50 66 Q64 67 63 77 Q66 83 60 85 Q56 89 50 86 Q44 90 40 85 Q34 83 37 77Z"/>` +
      `<circle class="hole" cx="50" cy="79" r="4.5"/><path class="spr" d="M42 72l2 2M55 71l-1 3M60 78l2-1M44 83l-2 1M53 85l1 2M38 79l1 2"/>`,
    icecream: `<path class="cone" d="M40 77 L60 77 L50 99Z"/><path class="cone-l" d="M43 81 L55 91 M57 81 L46 92"/>` +
      `<circle class="scoop1" cx="50" cy="72" r="10"/><circle class="scoop2" cx="50" cy="60" r="8.5"/><circle class="cherry" cx="53" cy="50" r="3.2"/>` +
      `<path class="drip" d="M42 75 q0 6 2.2 6 q2 0 2 -4"/>`,
    sushi: `<ellipse class="plate" cx="50" cy="91" rx="31" ry="6"/><rect class="rice2" x="26" y="80" width="20" height="10" rx="4.5"/>` +
      `<path class="salmon" d="M25 81 Q36 73 47 81 L46 85 L26 85Z"/><path class="salmon-l" d="M30 80 l4 -3 M36 80 l4 -3"/>` +
      `<rect class="rice2" x="54" y="80" width="20" height="10" rx="4.5"/><rect class="tamago" x="53" y="77" width="22" height="6" rx="2"/><rect class="nori" x="62" y="76" width="4" height="13"/>` +
      `<path class="chop" d="M66 58 L86 84"/><path class="chop" d="M72 56 L89 82"/>`,
    cake: `<path class="cake-b" d="M26 93 L74 93 L74 76 L26 83Z"/><path class="cake-m" d="M26 88 L74 85 L74 88 L26 91Z"/>` +
      `<path class="cake-t" d="M26 83 L74 76 L74 80 Q62 84 50 81 Q38 86 26 86Z"/><circle class="straw" cx="60" cy="74" r="4.2"/>` +
      `<rect class="candle" x="40" y="66" width="3.4" height="14" rx="1"/><path class="flame" d="M41.7 58 Q45.5 63 41.7 66 Q38 63 41.7 58Z"/>`,
    drumstick: `<path class="meat" d="M28 70 Q22 87 37 93 Q53 98 59 85 Q63 74 52 67 Q39 61 28 70Z"/><path class="meat-hi" d="M34 72 Q30 79 34 84"/>` +
      `<path class="bone" d="M56 84 L74 75"/><circle class="bone-e" cx="76" cy="71" r="4.2"/><circle class="bone-e" cx="79" cy="77" r="4.2"/>`,
    eyesoup: `<path class="steam" d="M40 62 q-3 -5 0 -9 q3 -4 0 -8"/><path class="steam s2" d="M60 61 q-3 -5 0 -9 q3 -4 0 -8"/>` +
      `<path class="bowl2" d="M24 76 Q26 95 50 95 Q74 95 76 76Z"/><ellipse class="soup" cx="50" cy="76" rx="26" ry="5"/>` +
      `<circle class="eyeb" cx="41" cy="75" r="4.2"/><circle class="eyep" cx="42.5" cy="75.6" r="1.9"/>` +
      `<circle class="eyeb" cx="59" cy="76" r="3.6"/><circle class="eyep" cx="57.8" cy="76.6" r="1.6"/><circle class="bub" cx="50" cy="74" r="1.6"/>`,
    cotton: `<path class="stick" d="M50 99 L50 74"/><circle class="cc" cx="50" cy="63" r="11"/><circle class="cc" cx="40" cy="70" r="8"/>` +
      `<circle class="cc" cx="60" cy="70" r="8"/><circle class="cc2" cx="46" cy="60" r="4"/><circle class="cc2" cx="57" cy="66" r="3"/>`,
    cactus: `<path class="pot2" d="M38 86 L62 86 L59 98 L41 98Z"/><path class="cactus" d="M45 86 L45 64 Q50 58 55 64 L55 86Z M45 76 L39 76 L39 68" /><path class="cactus-arm" d="M55 72 L61 72 L61 64"/>` +
      `<path class="bite" d="M55 66 q-3 2 0 4"/><path class="prick" d="M47 68 l-2 -1 M53 74 l2 -1 M47 80 l-2 1"/>`,
  };

  /* ---------- books: nobody reads the same one ---------- */
  const openBook = (cover, pages = "") => `<path class="bk-cover" style="fill:${cover}" d="M19 70 L50 75 L81 70 L81 93 L50 97 L19 93Z"/>` +
    `<path class="bk-page" d="M22 69 Q37 65 50 72 L50 94 Q37 88 22 91Z"/><path class="bk-page" d="M78 69 Q63 65 50 72 L50 94 Q63 88 78 91Z"/>` + pages +
    `<path class="bk-page bk-flip" d="M78 69 Q63 65 50 72 L50 94 Q63 88 78 91Z"/>`;
  const LINES = `<path class="bk-line" d="M27 75 Q37 72 45 77 M27 80 Q37 77 45 82 M27 85 Q37 82 45 87 M55 77 Q63 72 73 75 M55 82 Q63 77 73 80 M55 87 Q63 82 73 85"/>`;
  const BOOK = {
    novel: openBook("#3d6fd6", LINES),
    comic: openBook("#e8583e", `<path class="bk-panel" d="M26 73 L46 76 L46 84 L26 82Z M26 84 L36 85 L36 90 L26 89Z M38 85 L46 86 L46 91 L38 90Z M54 76 L74 73 L74 82 L54 84Z M54 86 L74 84 L74 89 L54 91Z"/>` +
      `<path class="pow" d="M64 54 l3 5 6 -2 -2 6 6 3 -6 3 2 6 -6 -2 -3 5 -3 -5 -6 2 2 -6 -6 -3 6 -3 -2 -6 6 2Z"/><text class="pow-t" x="64" y="68.5">POW</text>`),
    spell: openBook("#6a3fb5", `<path class="rune" d="M31 77 l3 -4 3 4 -3 4Z M40 82 l2 -3 2 3 -2 3Z M58 77 l3 -4 3 4 -3 4Z M66 83 l2 -3 2 3 -2 3Z"/>` +
      `<path class="spark sp1" d="M38 56 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5Z"/><path class="spark sp2" d="M62 50 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2Z"/>` +
      `<path class="spark sp3" d="M52 44 l1 2.5 2.5 1 -2.5 1 -1 2.5 -1 -2.5 -2.5 -1 2.5 -1Z"/>`),
    paper: `<rect class="np" x="12" y="62" width="76" height="35" rx="1.5"/><path class="np-fold" d="M50 62 L50 97"/>` +
      `<rect class="np-head" x="16" y="65" width="30" height="5" rx="1"/><rect class="np-pic" x="54" y="66" width="30" height="13" rx="1"/>` +
      `<path class="np-col" d="M16 74 H46 M16 78 H46 M16 82 H46 M16 86 H46 M16 90 H40 M54 83 H84 M54 87 H84 M54 91 H78"/>`,
    map: `<path class="map" d="M14 66 L32 62 L50 68 L68 62 L86 66 L86 96 L68 92 L50 98 L32 92 L14 96Z"/><path class="map-f" d="M32 62 L32 92 M50 68 L50 98 M68 62 L68 92"/>` +
      `<path class="map-path" d="M20 90 Q30 78 40 84 Q52 92 58 78 Q62 70 72 74"/><path class="map-x" d="M72 70 l6 6 M78 70 l-6 6"/>`,
    tiny: `<path class="bk-cover" style="fill:#2fa36b" d="M43 84 L50 86 L57 84 L57 93 L50 95 L43 93Z"/><path class="bk-page" d="M44 83.5 Q47 82.5 50 85 L50 93 Q47 91.5 44 92.5Z"/><path class="bk-page" d="M56 83.5 Q53 82.5 50 85 L50 93 Q53 91.5 56 92.5Z"/>`,
  };

  /* ---------- free time ---------- */
  const FUN = {
    game: `<rect class="gm-body" x="21" y="70" width="58" height="24" rx="11"/><rect class="gm-screen" x="38" y="73" width="24" height="17" rx="2.5"/>` +
      `<path class="gm-pad" d="M27 82h8M31 78v8"/><circle class="gm-btn" cx="67" cy="79" r="2.5"/><circle class="gm-btn b2" cx="72" cy="85" r="2.5"/>`,
    ball: `<g class="dribble"><circle class="bl" cx="85" cy="85" r="8.5"/><path class="bl-line" d="M76.5 85h17M85 76.5v17M79 79q6 6 0 12M91 79q-6 6 0 12"/></g>`,
    guitar: `<path class="gtr-neck" d="M56 72 L88 36"/><rect class="gtr-head" x="84" y="28" width="9" height="11" rx="2" transform="rotate(42 88 33)"/>` +
      `<path class="gtr-body" d="M30 72 Q25 61 36 59 Q43 59 47 64 Q53 59 59 64 Q67 71 60 81 Q62 93 47 95 Q31 96 29 86 Q24 80 30 72Z"/>` +
      `<circle class="gtr-hole" cx="46" cy="77" r="4.2"/><path class="gtr-str" d="M38 84 L86 34 M40 86 L88 36"/>` +
      `<text class="note" x="6" y="44">♪</text><text class="note n2" x="16" y="26">♫</text>`,
    paint: `<path class="easel" d="M70 99 L79 46 L88 99 M79 46 L79 99"/><rect class="canvas" x="64" y="44" width="31" height="27" rx="1"/>` +
      `<circle class="blob b1" cx="72" cy="54" r="4"/><circle class="blob b2" cx="86" cy="52" r="3.5"/><path class="blob b3" d="M69 64 Q78 57 90 64"/>` +
      `<path class="brush" d="M54 80 L67 62"/><path class="brush-tip" d="M66 63 L69 59 L71 61Z"/><ellipse class="palette" cx="28" cy="88" rx="13" ry="7"/>` +
      `<circle class="dab" cx="23" cy="86" r="2"/><circle class="dab d2" cx="29" cy="85" r="2"/><circle class="dab d3" cx="34" cy="88" r="2"/>`,
    bubbles: `<path class="wand" d="M58 90 L70 68"/><circle class="wand-ring" cx="72" cy="63" r="5.5"/>` +
      `<circle class="bbl q1" cx="78" cy="50" r="5"/><circle class="bbl q2" cx="86" cy="36" r="3.5"/><circle class="bbl q3" cx="70" cy="30" r="4.5"/>`,
    fish: `<path class="rod" d="M50 90 L92 16"/><path class="fline" d="M92 16 L92 64"/><circle class="bobber" cx="92" cy="66" r="3.2"/>` +
      `<path class="water" d="M76 76 q4 -3 8 0 q4 3 8 0 q4 -3 8 0"/><path class="fishy" d="M80 86 Q87 79 94 86 Q87 93 80 86Z M80 86 L75 81 L75 91Z"/>` +
      `<path class="bucket" d="M14 82 L32 82 L30 97 L16 97Z"/><path class="bucket-h" d="M14 82 Q23 72 32 82"/>`,
    garden: `<path class="pot" d="M12 84 L34 84 L31 98 L15 98Z"/><g class="flower"><path class="stem" d="M23 84 L23 64"/><path class="leaf" d="M23 76 Q30 70 31 76 Q27 78 23 76Z"/>` +
      `<circle class="petal" cx="23" cy="56" r="4"/><circle class="petal" cx="17" cy="61" r="4"/><circle class="petal" cx="29" cy="61" r="4"/><circle class="petal" cx="20" cy="67" r="4"/><circle class="petal" cx="26" cy="67" r="4"/><circle class="fl-c" cx="23" cy="62" r="3.2"/></g>` +
      `<g class="can"><path class="can-b" d="M64 70 L86 70 L84 90 L66 90Z"/><path class="can-sp" d="M64 75 L50 64"/><path class="can-h" d="M86 74 Q95 77 85 86"/></g>` +
      `<path class="drop dr1" d="M48 66 q1.6 3 0 4.2 q-1.6 -1.2 0 -4.2Z"/><path class="drop dr2" d="M44 64 q1.6 3 0 4.2 q-1.6 -1.2 0 -4.2Z"/>`,
    juggle: `<g class="jug"><circle class="jb j1" cx="50" cy="-12" r="4.5"/><circle class="jb j2" cx="37" cy="10" r="4.5"/><circle class="jb j3" cx="63" cy="10" r="4.5"/></g>`,
    skate: `<rect class="deck" x="20" y="91" width="60" height="4.5" rx="2.2"/><circle class="wheel" cx="31" cy="97.5" r="3"/><circle class="wheel" cx="69" cy="97.5" r="3"/>`,
    zen: `<ellipse class="cushion" cx="50" cy="95" rx="27" ry="5"/>` +
      `<path class="spark sp1" d="M16 44 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5Z"/><path class="spark sp2" d="M84 36 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5Z"/>` +
      `<path class="spark sp3" d="M80 70 l1 2.5 2.5 1 -2.5 1 -1 2.5 -1 -2.5 -2.5 -1 2.5 -1Z"/><path class="spark sp1" d="M20 76 l1 2.5 2.5 1 -2.5 1 -1 2.5 -1 -2.5 -2.5 -1 2.5 -1Z"/>`,
    cook: `<ellipse class="pan" cx="42" cy="86" rx="21" ry="5.5"/><path class="pan-h" d="M62 85 L88 80"/>` +
      `<g class="egg"><path class="egg-w" d="M34 84 Q32 78 40 78 Q49 76 51 82 Q53 86 45 86 Q37 88 34 84Z"/><circle class="egg-y" cx="42" cy="82" r="3.2"/></g>` +
      `<path class="steam" d="M30 72 q-3 -5 0 -9 q3 -4 0 -8"/><path class="steam s2" d="M52 70 q-3 -5 0 -9 q3 -4 0 -8"/>`,
  };

  /* ---------- beds: everyone has their own blanket ---------- */
  const BLANKETS = {
    sky: { fill: "#5b8def", deco: "" },
    stripes: { fill: "#f4f1ea", deco: `<path class="bl-stripe" d="M16 68 L16 90 M26 67 L26 90 M36 66 L36 90 M46 66 L46 90 M56 66 L56 90 M66 66 L66 90 M76 67 L76 90 M86 68 L86 90"/>` },
    dots: { fill: "#f2c94c", deco: `<path class="bl-dot" d="M18 76h.1M30 82h.1M42 74h.1M54 84h.1M66 75h.1M78 83h.1M24 87h.1M60 88h.1M84 74h.1M36 88h.1"/>` },
    stars: { fill: "#283a73", deco: `<path class="bl-star" d="M22 76 l1.2 3 3 .3 -2.3 2 .7 3 -2.6 -1.6 -2.6 1.6 .7 -3 -2.3 -2 3 -.3Z M52 72 l1.2 3 3 .3 -2.3 2 .7 3 -2.6 -1.6 -2.6 1.6 .7 -3 -2.3 -2 3 -.3Z M78 80 l1.2 3 3 .3 -2.3 2 .7 3 -2.6 -1.6 -2.6 1.6 .7 -3 -2.3 -2 3 -.3Z M38 84 l.8 2 2 .2 -1.5 1.3 .5 2 -1.8 -1 -1.8 1 .5 -2 -1.5 -1.3 2 -.2Z"/>` },
    hearts: { fill: "#f48fb1", deco: `<path class="bl-heart" d="M24 78 q-3 -4 0 -5 q2 -1 3 1 q1 -2 3 -1 q3 1 0 5 l-3 3Z M56 74 q-3 -4 0 -5 q2 -1 3 1 q1 -2 3 -1 q3 1 0 5 l-3 3Z M74 84 q-3 -4 0 -5 q2 -1 3 1 q1 -2 3 -1 q3 1 0 5 l-3 3Z"/>` },
    checks: { fill: "#e8583e", deco: `<path class="bl-check" d="M8 74 H92 M8 82 H92 M20 66 V90 M36 66 V90 M52 66 V90 M68 66 V90 M84 66 V90"/>` },
  };
  // Sitting up asleep (sv1, sv3, sv4) or lying down (sv2).
  function bed(pose, blanket) {
    const b = BLANKETS[blanket] || BLANKETS.sky;
    if (pose === "sv2") return {
      back: `<rect class="hb" x="2" y="46" width="11" height="52" rx="4"/><rect class="foot" x="89" y="66" width="9" height="32" rx="3"/><ellipse class="pillow" cx="27" cy="76" rx="15" ry="8"/>`,
      front: `<path class="blanket" style="fill:${b.fill}" d="M40 70 Q62 62 90 68 L90 90 L40 90 Q36 80 40 70Z"/><g class="bl-deco">${b.deco}</g>` +
        `<path class="blanket-fold" d="M40 70 Q38 80 41 90 L46 90 Q43 80 45 70Z"/><rect class="mattress" x="4" y="88" width="92" height="6" rx="2"/>` +
        `<rect class="bedleg" x="6" y="94" width="5" height="5"/><rect class="bedleg" x="89" y="94" width="5" height="5"/>`,
    };
    return {
      back: `<rect class="hb" x="10" y="26" width="80" height="70" rx="12"/><rect class="hb-in" x="16" y="32" width="68" height="20" rx="8"/><rect class="pillow" x="22" y="40" width="56" height="18" rx="9"/>`,
      front: `<path class="blanket" style="fill:${b.fill}" d="M6 70 Q50 62 94 70 L94 91 L6 91Z"/><g class="bl-deco">${b.deco}</g>` +
        `<path class="blanket-fold" d="M6 70 Q50 62 94 70 L94 75 Q50 67 6 75Z"/><rect class="mattress" x="4" y="89" width="92" height="5" rx="2"/>` +
        `<rect class="bedleg" x="8" y="94" width="5" height="5"/><rect class="bedleg" x="87" y="94" width="5" height="5"/>` +
        (pose === "sv4" ? `<circle class="snot" cx="63" cy="58" r="5"/>` : ""),
    };
  }

  window.MONSTER_PROPS = { FOOD: Object.keys(FOOD), BOOKS: Object.keys(BOOK), FUN: Object.keys(FUN), BLANKETS: Object.keys(BLANKETS) };
  // classes: the monster's mood classes (e.g. ["eat","f-pizza"]). Returns {key, back, front} or null.
  window.monsterProps = function (classes) {
    const has = (c) => classes.includes(c), pick = (pre, list, def) => { const c = classes.find((x) => x.startsWith(pre)); const k = c && c.slice(pre.length); return list[k] !== undefined ? k : def; };
    if (has("nap")) {
      const pose = ["sv1", "sv2", "sv3", "sv4"].find(has) || "sv1", bl = pick("bd-", BLANKETS, "sky");
      return { key: `bed:${pose}:${bl}`, ...bed(pose, bl) };
    }
    if (has("eat")) { const f = pick("f-", FOOD, "noodles"); return { key: "food:" + f, back: "", front: FOOD[f] }; }
    if (has("read")) { const k = pick("bk-", BOOK, "novel"); return { key: "book:" + k, back: "", front: BOOK[k] }; }
    const fun = Object.keys(FUN).find(has);
    return fun ? { key: "fun:" + fun, back: "", front: FUN[fun] } : null;
  };
})();
