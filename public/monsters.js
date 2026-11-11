// The monster crew. Each one is a 100x100 SVG coloured by the CSS variable --mc.
// Parts are tagged so CSS can switch moods:
//   .b        body group (moves for each mood)    .arm   only shown while dancing
//   .pu       pupils (look down at the laptop)    .lid   half-closed eyelids on overtime
//   .mouth    normal mouth                        .mouth-t  wobbly tired mouth
//   .sweat .zz .lap   overtime sweat, sleepy z's, and the laptop      .food  lunch bowl (mood .eat)
(function () {
  function starPoints(cx, cy, ro, ri, n) {
    const p = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro, a = (Math.PI * i) / n - Math.PI / 2;
      p.push((cx + r * Math.cos(a)).toFixed(1) + "," + (cy + r * Math.sin(a)).toFixed(1));
    }
    return p.join(" ");
  }
  const lid = (cx, cy, r, cls = "m-body") =>
    `<path class="${cls} lid" d="M${cx - r} ${cy + 1} A${r} ${r} 0 0 1 ${cx + r} ${cy + 1}Z"/>` +
    `<path class="m-line lid" style="stroke-width:2" d="M${cx - r + 1} ${cy + 1} L${cx + r - 1} ${cy + 1}"/>`;
  const LAPTOP = `<g class="lap"><rect class="lap-back" x="23" y="63" width="54" height="28" rx="3"/><circle class="lap-logo" cx="50" cy="77" r="3.2"/><rect class="lap-base" x="14" y="90" width="72" height="4.5" rx="2"/></g>`;
  // lunch (v35): a steaming bowl with chopsticks, shown instead of the laptop
  const FOOD = `<g class="food"><path class="steam" d="M42 62 q-3 -5 0 -9 q3 -4 0 -8"/><path class="steam s2" d="M52 61 q-3 -5 0 -9 q3 -4 0 -8"/>` +
    `<path class="chop" d="M60 56 L80 80"/><path class="chop" d="M66 54 L83 79"/>` +
    `<path class="bowl" d="M24 76 Q26 95 50 95 Q74 95 76 76Z"/><ellipse class="rice" cx="50" cy="76" rx="26" ry="5"/>` +
    `<path class="bowl-band" d="M28 84 Q50 90 72 84"/></g>`;
  const SWEAT = `<path class="sweat" d="M75 27 Q80 34 75 38 Q70 34 75 27Z"/>`;
  const ZZ = `<text class="zz" x="80" y="20">z</text><text class="zz z2" x="86" y="11">z</text>`;
  const eye = (cx, cy, r, pr, dx = 1, dy = 1) =>
    `<circle class="m-eye" cx="${cx}" cy="${cy}" r="${r}"/><circle class="m-pupil pu" cx="${cx + dx}" cy="${cy + dy}" r="${pr}"/>`;
  const wrap = (cls, inner) => `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true">${inner}${LAPTOP}${FOOD}${ZZ}</svg>`;

  window.MONSTERS = [
    { name: "Jelly", svg: wrap("jelly", `
      <ellipse class="m-shadow sh" cx="50" cy="93" rx="24" ry="4"/>
      <g class="b">
        <path class="m-limb arm aL" d="M24 60 Q10 52 11 38"/><path class="m-limb arm aR" d="M76 60 Q90 52 89 38"/>
        <path class="m-body" d="M20 84 C18 44 34 24 50 24 C66 24 82 44 80 84 Q65 90 50 86 Q35 90 20 84Z"/>
        ${eye(40, 50, 8, 4)}${eye(60, 50, 8, 4)}${lid(40, 50, 9)}${lid(60, 50, 9)}
        <path class="m-line mouth" d="M41 65 Q50 74 59 65"/><path class="m-line mouth-t" d="M41 68 Q45.5 64 50 68 Q54.5 72 59 68"/>
        <circle class="m-cheek" cx="31" cy="62" r="4"/><circle class="m-cheek" cx="69" cy="62" r="4"/>
        ${SWEAT}
      </g>`) },

    { name: "Cyclo", svg: wrap("cyclo", `
      <ellipse class="m-shadow" cx="50" cy="94" rx="22" ry="4"/>
      <rect class="m-body lL" x="34" y="76" width="10" height="16" rx="5"/><rect class="m-body lR" x="56" y="76" width="10" height="16" rx="5"/>
      <g class="b">
        <path class="m-body" d="M33 34 L27 13 L45 30Z"/><path class="m-body" d="M67 34 L73 13 L55 30Z"/>
        <rect class="m-body" x="24" y="28" width="52" height="54" rx="18"/>
        <path class="m-limb arm" d="M26 58 L14 50"/><path class="m-limb arm" d="M74 58 L86 66"/>
        <circle class="m-eye" cx="50" cy="50" r="12"/><circle class="m-pupil pu look" cx="50" cy="51" r="5.5"/>
        ${lid(50, 50, 13)}
        <path class="m-line mouth" d="M39 68 Q50 75 61 68"/>
        <path class="m-eye mouth" d="M44 69.5 L46 74 L48 70.5Z"/><path class="m-eye mouth" d="M52 70.5 L54 74 L56 69.5Z"/>
        <path class="m-line mouth-t" d="M40 70 Q45 66 50 70 Q55 74 60 70"/>
        ${SWEAT}
      </g>`) },

    { name: "Noodle", svg: wrap("noodle", `
      <ellipse class="m-shadow" cx="50" cy="94" rx="22" ry="4"/>
      <g class="b">
        <path class="m-limb arm aL" d="M31 56 L16 36"/><path class="m-limb arm aR" d="M69 56 L84 36"/>
        <path class="m-body" d="M30 90 L30 40 Q30 12 50 12 Q70 12 70 40 L70 90 Q65 82 60 90 Q55 82 50 90 Q45 82 40 90 Q35 82 30 90Z"/>
        <ellipse class="m-pupil pu" cx="42" cy="38" rx="4" ry="6"/><ellipse class="m-pupil pu" cx="58" cy="38" rx="4" ry="6"/>
        <circle class="m-eye" cx="43.5" cy="36" r="1.6"/><circle class="m-eye" cx="59.5" cy="36" r="1.6"/>
        ${lid(42, 38, 6.5)}${lid(58, 38, 6.5)}
        <ellipse class="m-pupil mouth" cx="50" cy="54" rx="4" ry="5"/><path class="m-line mouth-t" d="M44 55 Q47 52 50 55 Q53 58 56 55"/>
        <circle class="m-cheek" cx="36" cy="49" r="3.5"/><circle class="m-cheek" cx="64" cy="49" r="3.5"/>
        ${SWEAT}
      </g>`) },

    { name: "Spike", svg: wrap("spike", `
      <ellipse class="m-shadow sh" cx="50" cy="93" rx="22" ry="4"/>
      <g class="b">
        <polygon class="m-body" points="${starPoints(50, 52, 34, 24, 10)}"/>
        ${eye(40, 50, 6, 3)}${eye(60, 50, 6, 3)}${eye(50, 39, 5, 2.5)}
        ${lid(40, 50, 7)}${lid(60, 50, 7)}${lid(50, 39, 6)}
        <path class="m-line mouth" d="M42 62 Q50 68 58 62"/><path class="m-line mouth-t" d="M42 64 Q46 61 50 64 Q54 67 58 64"/>
        ${SWEAT}
      </g>`) },

    { name: "Bun", svg: wrap("bun", `
      <ellipse class="m-shadow sh" cx="50" cy="93" rx="22" ry="4"/>
      <g class="b">
        <g class="earL"><ellipse class="m-body" cx="38" cy="24" rx="7.5" ry="17" transform="rotate(-10 38 24)"/><ellipse class="m-cheek" cx="38" cy="25" rx="3.4" ry="11" transform="rotate(-10 38 25)"/></g>
        <g class="earR"><ellipse class="m-body" cx="62" cy="24" rx="7.5" ry="17" transform="rotate(10 62 24)"/><ellipse class="m-cheek" cx="62" cy="25" rx="3.4" ry="11" transform="rotate(10 62 25)"/></g>
        <path class="m-limb arm aL" d="M27 66 L15 55"/><path class="m-limb arm aR" d="M73 66 L85 55"/>
        <ellipse class="m-body" cx="50" cy="63" rx="27" ry="25"/>
        ${eye(41, 55, 6, 3, 0.6)}${eye(59, 55, 6, 3, 0.6)}${lid(41, 55, 7)}${lid(59, 55, 7)}
        <path class="m-pupil" d="M47.6 61.5 L52.4 61.5 L50 64.2Z"/>
        <path class="m-line mouth" style="stroke-width:2.4" d="M45.5 65.5 Q47.8 68.5 50 65.5 Q52.2 68.5 54.5 65.5"/>
        <path class="m-line mouth-t" style="stroke-width:2.4" d="M45 67.5 L55 67.5"/>
        <circle class="m-cheek" cx="33" cy="63" r="3.5"/><circle class="m-cheek" cx="67" cy="63" r="3.5"/>
        ${SWEAT}
      </g>`) },

    { name: "Tako", svg: wrap("tako", `
      <ellipse class="m-shadow sh" cx="50" cy="94" rx="24" ry="4"/>
      <g class="b">
        <path class="m-limb tt t1" d="M31 60 Q22 72 28 86"/><path class="m-limb tt t2" d="M43 64 Q38 77 43 90"/>
        <path class="m-limb tt t3" d="M57 64 Q62 77 57 90"/><path class="m-limb tt t4" d="M69 60 Q78 72 72 86"/>
        <path class="m-body" d="M22 62 C20 34 34 22 50 22 C66 22 80 34 78 62 Q50 72 22 62Z"/>
        ${eye(40, 45, 7, 3.5)}${eye(60, 45, 7, 3.5)}${lid(40, 45, 8)}${lid(60, 45, 8)}
        <ellipse class="m-pupil mouth" cx="50" cy="57" rx="3" ry="3.6"/><path class="m-line mouth-t" d="M45 58 Q50 55 55 58"/>
        <circle class="m-cheek" cx="30" cy="53" r="3.5"/><circle class="m-cheek" cx="70" cy="53" r="3.5"/>
        ${SWEAT}
      </g>`) },

    { name: "Mush", svg: wrap("mush", `
      <ellipse class="m-shadow sh" cx="50" cy="93" rx="20" ry="4"/>
      <g class="b">
        <path class="m-limb arm aL" d="M36 70 L24 61"/><path class="m-limb arm aR" d="M64 70 L76 61"/>
        <rect class="m-stem" x="34" y="38" width="32" height="52" rx="14"/>
        <circle class="m-pupil pu" cx="44" cy="54" r="3.2"/><circle class="m-pupil pu" cx="56" cy="54" r="3.2"/>
        ${lid(44, 54, 3.9, "m-stem")}${lid(56, 54, 3.9, "m-stem")}
        <circle class="m-blush" cx="39.5" cy="59.5" r="2.6"/><circle class="m-blush" cx="60.5" cy="59.5" r="2.6"/>
        <path class="m-line mouth" style="stroke-width:2.4" d="M46.5 59.5 Q50 63 53.5 59.5"/>
        <path class="m-line mouth-t" style="stroke-width:2.4" d="M46 61 Q48 59 50 61 Q52 63 54 61"/>
        <g class="cap">
          <path class="m-body" d="M14 45 C14 20 32 10 50 10 C68 10 86 20 86 45 Q50 53 14 45Z"/>
          <circle class="m-spot" cx="31" cy="31" r="5"/><circle class="m-spot" cx="52" cy="20" r="6"/>
          <circle class="m-spot" cx="70" cy="33" r="4.5"/><circle class="m-spot" cx="45" cy="38" r="3.4"/>
        </g>
        ${SWEAT}
      </g>`) },

    { name: "Chomp", svg: wrap("chomp", `
      <ellipse class="m-shadow" cx="50" cy="94" rx="24" ry="4"/>
      <rect class="m-body lL" x="32" y="80" width="11" height="13" rx="4"/><rect class="m-body lR" x="57" y="80" width="11" height="13" rx="4"/>
      <g class="b">
        <path class="m-limb arm aL" d="M23 58 L11 45"/><path class="m-limb arm aR" d="M77 58 L89 45"/>
        <rect class="m-body" x="22" y="22" width="56" height="62" rx="14"/>
        ${eye(38, 37, 7.5, 3.5)}${eye(62, 37, 7.5, 3.5)}${lid(38, 37, 8.5)}${lid(62, 37, 8.5)}
        <g class="mouth jaw">
          <rect class="m-pupil" x="30" y="49" width="40" height="21" rx="7"/>
          <path class="m-eye" d="M34 49 L39 49 L36.5 55Z M43 49 L48 49 L45.5 55Z M52 49 L57 49 L54.5 55Z M61 49 L66 49 L63.5 55Z"/>
          <path class="m-eye" d="M39 70 L44 70 L41.5 64.5Z M56 70 L61 70 L58.5 64.5Z"/>
        </g>
        <path class="m-line mouth-t" d="M33 60 Q41.5 56 50 60 Q58.5 64 67 60"/>
        ${SWEAT}
      </g>`) },

    { name: "Fluff", svg: wrap("fluff", `
      <ellipse class="m-shadow sh" cx="50" cy="93" rx="20" ry="4"/>
      <rect class="m-body lL" x="38" y="74" width="8" height="15" rx="4"/><rect class="m-body lR" x="54" y="74" width="8" height="15" rx="4"/>
      <g class="b">
        <path class="m-limb arm aL" d="M22 60 L11 51"/><path class="m-limb arm aR" d="M78 60 L89 51"/>
        <circle class="m-body" cx="31" cy="57" r="15"/><circle class="m-body" cx="69" cy="57" r="15"/>
        <circle class="m-body" cx="40" cy="45" r="16"/><circle class="m-body" cx="60" cy="45" r="16"/>
        <circle class="m-body" cx="50" cy="38" r="17"/><circle class="m-body" cx="50" cy="61" r="18"/>
        ${eye(43, 51, 5.5, 2.8, 0.5)}${eye(57, 51, 5.5, 2.8, 0.5)}${lid(43, 51, 6.5)}${lid(57, 51, 6.5)}
        <path class="m-line mouth" style="stroke-width:2.5" d="M46 59.5 Q50 63 54 59.5"/>
        <path class="m-line mouth-t" style="stroke-width:2.5" d="M46 61 Q48 59 50 61 Q52 63 54 61"/>
        <circle class="m-cheek" cx="35" cy="57" r="3.2"/><circle class="m-cheek" cx="65" cy="57" r="3.2"/>
        ${SWEAT}
      </g>`) },

    { name: "Dino", svg: wrap("dino", `
      <ellipse class="m-shadow" cx="50" cy="94" rx="24" ry="4"/>
      <rect class="m-body lL" x="33" y="80" width="12" height="13" rx="4"/><rect class="m-body lR" x="55" y="80" width="12" height="13" rx="4"/>
      <g class="b">
        <path class="m-limb tail" d="M66 80 Q86 82 90 64"/>
        <path class="m-body" d="M36 31 L40 15 L46 29Z M45 27 L50 10 L55 27Z M54 29 L60 15 L64 31Z"/>
        <path class="m-limb arm aL" d="M30 62 L19 55"/><path class="m-limb arm aR" d="M70 62 L81 55"/>
        <rect class="m-body" x="28" y="24" width="44" height="64" rx="20"/>
        <ellipse class="m-cheek" cx="50" cy="73" rx="13" ry="12"/>
        ${eye(42, 43, 6.5, 3.2, 0.5)}${eye(58, 43, 6.5, 3.2, 0.5)}${lid(42, 43, 7.5)}${lid(58, 43, 7.5)}
        <circle class="m-pupil" cx="47" cy="52" r="1.2"/><circle class="m-pupil" cx="53" cy="52" r="1.2"/>
        <path class="m-line mouth" d="M40 57 Q50 65 60 57"/><path class="m-eye mouth" d="M43.5 58.6 L45.5 62 L47 59.8Z"/>
        <path class="m-line mouth-t" d="M41 60 Q45.5 57 50 60 Q54.5 63 59 60"/>
        ${SWEAT}
      </g>`) },
  ];
})();
