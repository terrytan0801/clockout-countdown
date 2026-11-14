// v50: the village. Map, buildings, farm crops, Mr. Veggie, deep-sea fish and the harbor view for fishing.
// Plain SVG strings, like cave-home.js. Loaded after cave-home.js (it adds the sea fish to CAVE_HOME.FISH).
(function () {
  const eye = (x, y, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x - 0.5}" cy="${y + 0.5}" r="${r * 0.52}" fill="#1d2b3a"/>`;

  /* ---------- the map ---------- */
  function map(night) {
    const sky = night ? ["#151d3d", "#2b3a72"] : ["#8fd0ff", "#dff3ff"], g1 = night ? "#2f5a3a" : "#7cc96a", g2 = night ? "#27503a" : "#6cbf5c";
    const path = night ? "#6b5a45" : "#e2c48f", sea = night ? ["#1e3f7a", "#122a55"] : ["#4d9be8", "#2f6fc4"];
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
<linearGradient id="vSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
<linearGradient id="vSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea[0]}"/><stop offset="1" stop-color="${sea[1]}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#vSky)"/>
${night ? `<g fill="#fff"><circle cx="40" cy="20" r="1.2"/><circle cx="120" cy="34" r="1"/><circle cx="210" cy="14" r="1.3"/><circle cx="300" cy="28" r="1"/><circle cx="360" cy="12" r="1.2"/></g><circle cx="340" cy="34" r="12" fill="#fff6c8"/><circle cx="335" cy="30" r="12" fill="${sky[0]}"/>`
      : `<circle cx="344" cy="34" r="16" fill="#ffd34d"/><g fill="#fff" opacity=".9"><ellipse cx="70" cy="34" rx="26" ry="9"/><ellipse cx="90" cy="28" rx="17" ry="10"/><ellipse cx="250" cy="22" rx="20" ry="7"/></g>`}
<path d="M0 86 Q50 54 110 74 Q160 50 220 70 Q290 46 340 70 Q376 58 400 72 L400 100 L0 100Z" fill="${night ? "#1f4030" : "#5aa85a"}"/>
<rect y="88" width="400" height="212" fill="${g1}"/>
<path d="M0 170 Q100 150 200 168 Q300 186 400 160 L400 300 L0 300Z" fill="${g2}"/>
<path d="M286 300 Q300 250 344 236 Q380 226 400 232 L400 300Z" fill="url(#vSea)"/>
<g stroke="#fff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"><path d="M330 262 q6 -3 12 0 q6 3 12 0"/><path d="M360 282 q6 -3 12 0"/><path d="M372 248 q5 -2 10 0"/></g>
<g fill="none" stroke="${path}" stroke-width="12" stroke-linecap="round" opacity=".95"><path d="M200 128 Q150 132 92 128"/><path d="M200 128 Q250 132 310 128"/><path d="M200 132 Q190 180 110 222"/><path d="M200 132 Q220 190 300 232"/><path d="M200 132 Q196 200 204 252"/></g>
<g transform="translate(200 104)"><path d="M-46 30 Q-48 -22 0 -26 Q48 -22 46 30Z" fill="${night ? "#5b6170" : "#8d93a3"}"/><path d="M-36 30 Q-34 -12 -10 -18 L-22 30Z" fill="${night ? "#6b7282" : "#a3a9b8"}"/>
<path d="M-18 30 Q-18 0 0 -2 Q18 0 18 30Z" fill="#2b2233"/><circle cx="26" cy="6" r="3.4" fill="#ffd34d"/><path d="M26 9 L26 30" stroke="#6b4a2a" stroke-width="2"/>
<path d="M-10 8 Q0 2 10 8" stroke="#ffd34d" stroke-width="2" fill="none" opacity=".7"/></g>
<g fill="${night ? "#1c3b28" : "#4f9e4f"}"><circle cx="18" cy="104" r="12"/><circle cx="34" cy="98" r="9"/><circle cx="380" cy="102" r="12"/><circle cx="140" cy="290" r="10"/><circle cx="154" cy="294" r="8"/><circle cx="20" cy="282" r="12"/></g>
<g fill="#ff8fab"><circle cx="150" cy="160" r="2.4"/><circle cx="256" cy="158" r="2.4"/><circle cx="170" cy="250" r="2"/></g><g fill="#fff59d"><circle cx="160" cy="166" r="2"/><circle cx="244" cy="166" r="2.2"/></g>
</svg>`;
  }

  /* ---------- buildings (viewBox 0 0 120 100, standing on y=96) ---------- */
  const shadow = `<ellipse cx="60" cy="96" rx="50" ry="5" fill="#000" opacity=".14"/>`;
  const BUILD = {
    weather: { name: "Weather station", zh: "天气情报所", svg: shadow +
      `<rect x="22" y="48" width="70" height="48" rx="3" fill="#f4f6fb"/><path d="M16 50 L57 26 L98 50Z" fill="#4d7cc7"/><rect x="48" y="70" width="18" height="26" rx="2" fill="#4d7cc7"/>` +
      `<rect x="28" y="58" width="14" height="12" rx="2" fill="#bfe3ff"/><rect x="74" y="58" width="14" height="12" rx="2" fill="#bfe3ff"/>` +
      `<path d="M80 34 L80 16" stroke="#6b7685" stroke-width="2.4"/><path d="M68 20 Q80 2 92 20Z" fill="#e9eef5" stroke="#9aa8b8" stroke-width="1.4"/>` +
      `<path d="M36 36 L36 18" stroke="#6b7685" stroke-width="2"/><path d="M28 18 L44 18" stroke="#6b7685" stroke-width="2"/><circle cx="28" cy="18" r="3" fill="#ff8c5a"/><circle cx="44" cy="18" r="3" fill="#ff8c5a"/>` +
      `<g transform="translate(57 42)"><ellipse rx="9" ry="5" fill="#fff"/><ellipse cx="-4" cy="-2" rx="5" ry="4.4" fill="#fff"/><ellipse cx="4" cy="-3" rx="5.6" ry="5" fill="#fff"/><path d="M-4 5 l-2 5 M1 5 l-2 5 M6 5 l-2 5" stroke="#4d9be8" stroke-width="1.6" stroke-linecap="round"/></g>` },
    farm: { name: "Farm", zh: "农田", svg: shadow +
      `<rect x="8" y="80" width="104" height="16" rx="3" fill="#8d5a34"/><g stroke="#5f3b20" stroke-width="2"><path d="M14 84 L106 84 M14 90 L106 90"/></g>` +
      `<g fill="#6cbf5c"><circle cx="22" cy="80" r="4"/><circle cx="40" cy="80" r="4"/><circle cx="58" cy="80" r="4"/><circle cx="76" cy="80" r="4"/><circle cx="94" cy="80" r="4"/></g>` +
      `<rect x="30" y="38" width="50" height="42" fill="#d9483b"/><path d="M24 40 L55 16 L86 40Z" fill="#a8352c"/><path d="M45 80 L45 56 L65 56 L65 80Z" fill="#fff"/><path d="M45 56 L65 80 M65 56 L45 80" stroke="#d9483b" stroke-width="2.4"/>` +
      `<rect x="49" y="36" width="12" height="10" fill="#fff"/><rect x="86" y="30" width="18" height="50" rx="9" fill="#c9ced8"/><path d="M86 38 Q95 24 104 38" fill="#a7b0bf"/>` +
      `<g stroke="#fff" stroke-width="2"><path d="M8 74 L8 86 M20 74 L20 86 M8 77 L20 77"/></g>` },
    harbor: { name: "Harbor", zh: "渔港", svg: `<rect x="0" y="62" width="120" height="38" fill="#4d9be8"/><g stroke="#fff" stroke-width="1.4" opacity=".5" fill="none"><path d="M6 76 q5 -3 10 0 q5 3 10 0"/><path d="M60 90 q5 -3 10 0"/></g>` +
      `<rect x="4" y="58" width="74" height="8" fill="#a8743f"/><g fill="#7b5228"><rect x="10" y="64" width="5" height="30"/><rect x="38" y="64" width="5" height="30"/><rect x="66" y="64" width="5" height="30"/></g>` +
      `<path d="M30 78 L66 78 L60 88 L36 88Z" fill="#ff8c5a"/><path d="M48 78 L48 60" stroke="#6b4a2a" stroke-width="2"/><path d="M48 60 L60 74 L48 74Z" fill="#fff"/>` +
      `<path d="M86 94 L90 30 L104 30 L108 94Z" fill="#fff"/><path d="M87.5 74 L106.5 74 L107 82 L87 82Z M89 50 L105 50 L105.5 58 L88.6 58Z" fill="#e5383b"/>` +
      `<rect x="88" y="20" width="18" height="12" rx="2" fill="#ffd34d"/><path d="M86 20 L97 10 L108 20Z" fill="#e5383b"/><path d="M106 26 L120 20 L120 32Z" fill="#fff59d" opacity=".7"/>` },
    cinema: { name: "Cinema", zh: "电影院", svg: shadow +
      `<rect x="14" y="34" width="92" height="62" rx="3" fill="#6a3fa0"/><rect x="10" y="26" width="100" height="16" rx="3" fill="#ffd34d"/>` +
      `<text x="60" y="38.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="11" fill="#6a3fa0">CINEMA</text>` +
      `<g fill="#fff59d">${Array.from({ length: 12 }, (_, i) => `<circle cx="${14 + i * 8.4}" cy="24" r="1.8"/>`).join("")}</g>` +
      `<path d="M44 96 L44 64 Q60 54 76 64 L76 96Z" fill="#c62828"/><path d="M60 58 L60 96" stroke="#8e1b1b" stroke-width="2"/>` +
      `<rect x="20" y="52" width="18" height="24" rx="2" fill="#fff"/><rect x="82" y="52" width="18" height="24" rx="2" fill="#fff"/><path d="M23 56 l12 0 M23 62 l12 0 M85 56 l12 0 M85 62 l12 0" stroke="#6a3fa0" stroke-width="1.6"/>` +
      `<g transform="translate(60 10)"><circle r="9" fill="#2b2233"/><g fill="#9aa8b8"><circle cx="0" cy="-4.5" r="2"/><circle cx="4.3" cy="1.5" r="2"/><circle cx="-4.3" cy="1.5" r="2"/></g></g>` },
    planner: { name: "Holiday planner", zh: "假期规划局", svg: shadow +
      `<rect x="22" y="44" width="62" height="52" rx="3" fill="#fff3e0"/><path d="M16 46 L53 26 L90 46Z" fill="#26a69a"/><rect x="44" y="70" width="18" height="26" rx="2" fill="#26a69a"/>` +
      `<g transform="translate(36 6)"><rect width="34" height="30" rx="4" fill="#fff" stroke="#e53935" stroke-width="2"/><rect width="34" height="9" rx="3" fill="#e53935"/>` +
      `<text x="17" y="26" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="15" fill="#1d2b3a">31</text><path d="M9 -3 L9 4 M25 -3 L25 4" stroke="#555" stroke-width="2.4" stroke-linecap="round"/></g>` +
      `<rect x="28" y="54" width="12" height="11" rx="2" fill="#bfe3ff"/><rect x="66" y="54" width="12" height="11" rx="2" fill="#bfe3ff"/>` +
      `<path d="M100 96 Q98 70 104 52" stroke="#8d6e63" stroke-width="4" fill="none"/><g fill="#43a047"><path d="M104 52 Q88 44 82 54 Q94 48 104 54Z"/><path d="M104 52 Q120 42 124 54 Q112 48 104 54Z"/><path d="M104 52 Q100 36 90 36 Q100 42 104 54Z"/><path d="M104 52 Q112 36 120 38 Q110 42 104 54Z"/></g>` +
      `<rect x="2" y="78" width="18" height="16" rx="3" fill="#ff8c5a"/><path d="M7 78 L7 74 L15 74 L15 78" stroke="#6b4a2a" stroke-width="2" fill="none"/><path d="M2 85 L20 85" stroke="#fff" stroke-width="1.6"/>` },
    lot: { name: "Empty lot", svg: `<ellipse cx="60" cy="82" rx="50" ry="14" fill="#b8915f" opacity=".75"/><g stroke="#8d6a3f" stroke-width="2.2"><path d="M14 82 L14 66 M60 70 L60 54 M106 82 L106 66"/></g>` +
      `<path d="M14 68 Q37 74 60 56 Q83 74 106 68" stroke="#fff" stroke-width="1.4" fill="none" stroke-dasharray="3 2"/>` },
    scaffold: { name: "Being built", svg: shadow + `<ellipse cx="60" cy="88" rx="50" ry="10" fill="#b8915f" opacity=".7"/>` +
      `<g stroke="#c8915a" stroke-width="3" fill="none"><rect x="24" y="40" width="56" height="50"/><path d="M24 65 L80 65 M24 40 L80 90 M80 40 L24 90"/></g>` +
      `<path d="M96 92 L96 14 M96 16 L60 16 M96 30 L84 16" stroke="#ffb703" stroke-width="3.4" fill="none"/><path d="M66 16 L66 34" stroke="#555" stroke-width="1.4"/><rect x="60" y="34" width="12" height="8" fill="#9aa8b8"/>` +
      `<path d="M10 92 L16 76 L22 92Z M100 92 L106 78 L112 92Z" fill="#ff8c5a"/><path d="M12 87 L20 87 M102 88 L110 88" stroke="#fff" stroke-width="2"/>` },
  };

  /* ---------- crops ---------- */
  const leaf = (x, y, r, c = "#4caf50") => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.45}" fill="${c}" transform="rotate(-30 ${x} ${y})"/>`;
  const CROPS = {
    radish: { name: "Radish", zh: "小萝卜", hours: 4,
      produce: `<path d="M50 50 Q30 46 32 28 Q36 16 50 16 Q64 16 68 28 Q70 46 50 50Z" fill="#e94b6a"/><path d="M50 50 L50 58" stroke="#e8c7cf" stroke-width="2"/><path d="M42 18 Q34 2 42 2 Q48 8 48 16 Q52 0 58 4 Q60 10 56 18Z" fill="#4caf50"/><ellipse cx="42" cy="28" rx="4" ry="6" fill="#fff" opacity=".35"/>`,
      ripe: `<g transform="translate(0 9)"><path d="M30 44 Q20 42 21 32 Q24 24 30 24 Q36 24 39 32 Q40 42 30 44Z" fill="#e94b6a"/>${leaf(26, 18, 8)}${leaf(34, 16, 8, "#66bb6a")}</g><ellipse cx="30" cy="54" rx="26" ry="6" fill="#6d4c41" opacity=".55"/>` },
    tomato: { name: "Tomato", zh: "番茄", hours: 24,
      produce: `<circle cx="50" cy="34" r="22" fill="#e53935"/><path d="M50 14 l4 6 l7 -2 l-4 6 l6 4 l-8 0 l-5 6 l-1 -7 l-7 -1 l6 -4Z" fill="#43a047"/><ellipse cx="40" cy="28" rx="5" ry="7" fill="#fff" opacity=".3"/>`,
      ripe: `<path d="M30 56 L30 14" stroke="#43a047" stroke-width="2.4"/>${leaf(24, 26, 7)}${leaf(36, 34, 7, "#66bb6a")}${leaf(24, 42, 6)}<circle cx="22" cy="34" r="6" fill="#e53935"/><circle cx="38" cy="22" r="6" fill="#e53935"/><circle cx="37" cy="44" r="5" fill="#ef6c00"/>` },
    pumpkin: { name: "Pumpkin", zh: "南瓜", hours: 72,
      produce: `<ellipse cx="50" cy="36" rx="30" ry="20" fill="#fb8c00"/><ellipse cx="50" cy="36" rx="16" ry="20" fill="#ffa726"/><ellipse cx="50" cy="36" rx="5" ry="20" fill="#fb8c00"/><path d="M48 16 Q50 6 58 6" stroke="#6d4c41" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      ripe: `<path d="M8 50 Q30 40 52 50" stroke="#43a047" stroke-width="2" fill="none"/>${leaf(14, 42, 7)}${leaf(46, 40, 7, "#66bb6a")}<ellipse cx="30" cy="46" rx="16" ry="11" fill="#fb8c00"/><ellipse cx="30" cy="46" rx="8" ry="11" fill="#ffa726"/><path d="M30 35 Q31 29 36 29" stroke="#6d4c41" stroke-width="2.6" fill="none"/>` },
    monflower: { name: "Monster flower", zh: "怪物花", hours: 168,
      produce: `<path d="M50 58 L50 34" stroke="#43a047" stroke-width="3"/>${leaf(42, 50, 7)}<g fill="#ab47bc">${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="50" cy="12" rx="7" ry="11" transform="rotate(${a} 50 26)"/>`).join("")}</g><circle cx="50" cy="26" r="10" fill="#ffd34d"/>${eye(46, 24, 2.6)}${eye(55, 24, 2.6)}<path d="M46 30 Q50 33 54 30" stroke="#7a4a00" stroke-width="1.4" fill="none"/>`,
      ripe: `<path d="M30 58 L30 30" stroke="#43a047" stroke-width="2.6"/>${leaf(24, 46, 7)}${leaf(36, 40, 6, "#66bb6a")}<g fill="#ab47bc">${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="30" cy="12" rx="5.6" ry="8" transform="rotate(${a} 30 22)"/>`).join("")}</g><circle cx="30" cy="22" r="7.4" fill="#ffd34d"/>${eye(27, 21, 2)}${eye(33.6, 21, 2)}` },
  };
  // growing stages (viewBox 0 0 60 60), the same for every crop
  const STAGE = [
    `<path d="M30 52 L30 40" stroke="#43a047" stroke-width="2.4"/>${leaf(26, 38, 5)}${leaf(34, 36, 5, "#66bb6a")}`,
    `<path d="M30 54 L30 26" stroke="#43a047" stroke-width="2.6"/>${leaf(24, 40, 7)}${leaf(36, 34, 7, "#66bb6a")}${leaf(25, 28, 6)}`,
  ];
  const DEAD = `<path d="M30 54 Q30 40 22 34" stroke="#8d6e63" stroke-width="2.6" fill="none"/><ellipse cx="20" cy="36" rx="7" ry="3" fill="#a1887f" transform="rotate(30 20 36)"/><ellipse cx="34" cy="46" rx="7" ry="3" fill="#8d6e63" transform="rotate(-20 34 46)"/>`;
  const SOIL = `<ellipse cx="30" cy="54" rx="26" ry="6" fill="#6d4c41"/><path d="M10 54 q5 -2 10 0 M26 55 q5 -2 10 0 M40 54 q5 -2 10 0" stroke="#5d4037" stroke-width="1.4" fill="none"/>`;
  function plant(kind, status, frac) {
    const c = CROPS[kind];
    if (!c) return SOIL;
    if (status === "dead") return SOIL + DEAD;
    if (status === "ripe") return SOIL + c.ripe;
    return SOIL + STAGE[frac < 0.5 ? 0 : 1];
  }

  /* ---------- Mr. Veggie (viewBox 0 0 100 100) ---------- */
  const VEGGIE = `<ellipse cx="50" cy="96" rx="26" ry="4" fill="#000" opacity=".12"/><path d="M32 92 L28 98 L40 98Z M68 92 L60 98 L72 98Z" fill="#8d6e63"/>` +
    `<path d="M28 58 Q28 28 50 28 Q72 28 72 58 Q72 92 50 92 Q28 92 28 58Z" fill="#8bc34a"/><path d="M38 70 Q50 92 62 70 Q50 80 38 70Z" fill="#dcedc8"/>` +
    `<path d="M28 60 L14 70 L18 74Z M72 60 L82 66 L80 70Z" fill="#689f38"/>${eye(41, 50, 6.4)}${eye(59, 50, 6.4)}<path d="M41 63 Q50 71 59 63" stroke="#33691e" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="50" cy="30" rx="34" ry="6" fill="#e9c46a"/><path d="M32 30 Q34 12 50 12 Q66 12 68 30Z" fill="#f2d68a"/><path d="M33 26 Q50 20 67 26" stroke="#43a047" stroke-width="4" fill="none"/>` +
    `<path d="M76 70 L98 70 L94 92 L80 92Z" fill="#c8915a" stroke="#8d6a3f" stroke-width="1.2"/><path d="M76 70 Q87 56 98 70" fill="none" stroke="#8d6a3f" stroke-width="1.6"/>` +
    `<circle cx="82" cy="68" r="5" fill="#e53935"/><path d="M88 70 L96 58" stroke="#fb8c00" stroke-width="4" stroke-linecap="round"/><path d="M95 59 l3 -5 M95 59 l5 -2" stroke="#4caf50" stroke-width="1.6"/>`;

  /* ---------- deep-sea fish (viewBox 0 0 100 60, facing left like the pond fish) ---------- */
  const SEA_FISH = {
    squid: { name: "Squid", a: "a", svg: `<path d="M40 21 Q70 13 92 30 Q70 47 40 39Z" fill="#ff8a80"/><path d="M86 30 L98 17 L96 30 L98 43Z" fill="#ff6f61"/>` +
      `<g fill="#ffcdd2"><circle cx="62" cy="26" r="2.4"/><circle cx="72" cy="32" r="2"/><circle cx="56" cy="34" r="1.8"/></g>` +
      `<g stroke="#ff8a80" stroke-width="3" fill="none" stroke-linecap="round"><path d="M32 25 Q20 18 7 23"/><path d="M31 30 Q18 30 3 32"/><path d="M32 34 Q20 41 8 38"/><path d="M35 37 Q25 47 13 47"/></g>` +
      `<ellipse cx="40" cy="30" rx="10" ry="9" fill="#ff9e94"/>${eye(38, 27)}` },
    tuna: { name: "Tuna", a: "a", svg: `<path d="M80 30 L98 13 L92 30 L98 47Z" fill="#2c4a7c"/><path d="M6 30 Q20 14 50 14 Q76 16 84 30 Q76 44 50 46 Q20 46 6 30Z" fill="#cfd8e3"/>` +
      `<path d="M6 30 Q20 14 50 14 Q76 16 84 30 Q60 26 6 30Z" fill="#2c4a7c"/><path d="M36 15 L44 3 L50 15Z" fill="#2c4a7c"/>` +
      `<g fill="#ffd34d"><path d="M60 15 l3 -5 l2 6Z"/><path d="M68 17 l3 -5 l2 6Z"/><path d="M62 45 l3 5 l2 -6Z"/><path d="M70 43 l3 5 l2 -6Z"/></g>` +
      `<path d="M26 22 Q30 30 26 38" stroke="#8fa3bb" stroke-width="1.4" fill="none"/>${eye(18, 27)}` },
    sword: { name: "Swordfish", a: "a", svg: `<path d="M80 30 L98 11 L92 30 L98 49Z" fill="#3a5f8f"/><path d="M34 18 Q40 0 62 4 Q58 12 56 18Z" fill="#2f4f7a"/>` +
      `<path d="M18 30 Q28 16 54 17 Q76 18 84 30 Q76 42 54 43 Q28 44 18 30Z" fill="#5b86b8"/><path d="M18 30 Q40 34 84 30 Q76 42 54 43 Q28 44 18 30Z" fill="#c9d9ec"/>` +
      `<path d="M20 28 L0 30 L20 32Z" fill="#3a5f8f"/>${eye(27, 27, 3)}` },
    angler: { name: "Anglerfish", a: "an", svg: `<path d="M74 30 L94 16 L90 30 L94 44Z" fill="#3b2f4a"/><ellipse cx="44" cy="32" rx="34" ry="22" fill="#4a3b5c"/>` +
      `<g fill="#6d5a82"><circle cx="56" cy="22" r="2"/><circle cx="64" cy="34" r="2.4"/><circle cx="50" cy="44" r="1.8"/></g>` +
      `<path d="M10 34 Q30 54 52 38 Q30 41 10 34Z" fill="#1d1426"/><path d="M14 35.5 l2 4 l2 -3 l2 4 l2 -3 l2 4 l2 -3 l2 4 l2 -3 l2 4 l2 -3" stroke="#fff" stroke-width="1.3" fill="none"/>` +
      `${eye(34, 22, 4)}<path d="M40 11 Q30 -4 14 6" stroke="#4a3b5c" stroke-width="2" fill="none"/><circle cx="14" cy="7" r="8" fill="#fff59d" opacity=".35"/><circle cx="14" cy="7" r="4.5" fill="#fff59d"/>` },
    whaleshark: { name: "Whale shark", a: "a", svg: `<path d="M78 30 L98 9 L94 30 L98 51Z" fill="#3d5a73"/><path d="M44 13 L52 0 L58 14Z" fill="#3d5a73"/>` +
      `<path d="M4 32 Q8 12 40 12 Q70 14 84 30 Q70 46 40 48 Q8 50 4 32Z" fill="#4f7391"/><path d="M4 34 Q30 40 84 31 Q70 46 40 48 Q8 50 4 34Z" fill="#dfe8ef"/>` +
      `<g fill="#e8f1f8">${[[28, 20], [38, 18], [48, 20], [58, 22], [34, 27], [44, 26], [54, 28], [66, 26], [72, 30], [62, 31]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join("")}</g>` +
      `<path d="M4 33 Q14 36 22 33" stroke="#2c3e50" stroke-width="2" fill="none"/><g stroke="#3d5a73" stroke-width="1.2"><path d="M22 22 L22 36 M25 21 L25 37 M28 21 L28 36"/></g><circle cx="15" cy="27" r="2.2" fill="#1d2b3a"/>` },
  };
  for (const f of Object.values(SEA_FISH)) f.sea = true;
  if (window.CAVE_HOME) Object.assign(window.CAVE_HOME.FISH, SEA_FISH);

  /* ---------- the harbor, for fishing at sea (same layout as the pond: water from y 114 to 252) ---------- */
  function sea(night) {
    const sky = night ? ["#151d3d", "#2b3a72"] : ["#8fd0ff", "#e3f4ff"], water = night ? ["#173a6b", "#0c2147"] : ["#2d7fd0", "#1b4f99"];
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
<linearGradient id="szSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
<linearGradient id="szWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${water[0]}"/><stop offset="1" stop-color="${water[1]}"/></linearGradient></defs>
<rect width="400" height="120" fill="url(#szSky)"/>${night ? `<circle cx="330" cy="36" r="14" fill="#fff6c8"/><circle cx="324" cy="32" r="14" fill="${sky[0]}"/>` : `<circle cx="80" cy="40" r="16" fill="#ffd34d"/><g fill="#fff" opacity=".9"><ellipse cx="270" cy="36" rx="28" ry="9"/><ellipse cx="292" cy="30" rx="18" ry="10"/></g>`}
<path d="M300 112 Q320 92 346 96 Q366 90 384 112Z" fill="${night ? "#1f4030" : "#5aa85a"}"/><path d="M352 98 L354 70 L362 70 L364 98Z" fill="#fff"/><path d="M353 84 L363 84 L363.5 90 L352.6 90Z" fill="#e5383b"/><rect x="352" y="64" width="12" height="7" fill="#ffd34d"/>
<path d="M40 112 L56 112 L52 106 L44 106Z" fill="#fff"/><path d="M48 106 L48 96 L54 104Z" fill="#fff"/>
<rect y="112" width="400" height="152" fill="url(#szWater)"/>
<g stroke="#fff" stroke-width="2" fill="none" opacity=".3" stroke-linecap="round"><path class="fz-wave" d="M30 136 q10 -4 20 0 q10 4 20 0"/><path class="fz-wave w2" d="M290 150 q10 -4 20 0 q10 4 20 0"/><path class="fz-wave" d="M80 186 q10 -4 20 0 q10 4 20 0"/><path class="fz-wave w2" d="M240 210 q10 -4 20 0 q10 4 20 0"/><path class="fz-wave" d="M170 128 q8 -3 16 0"/><path class="fz-wave w2" d="M340 230 q8 -3 16 0"/></g>
<rect y="250" width="400" height="50" fill="${night ? "#5d4630" : "#a8743f"}"/><g stroke="${night ? "#463422" : "#7b5228"}" stroke-width="2"><path d="M0 262 L400 262 M0 276 L400 276 M0 290 L400 290"/><path d="M60 250 L60 262 M150 262 L150 276 M250 250 L250 262 M330 276 L330 290 M90 276 L90 290"/></g>
<g fill="${night ? "#463422" : "#7b5228"}"><rect x="10" y="236" width="10" height="16" rx="2"/><rect x="380" y="236" width="10" height="16" rx="2"/></g>
</svg>`;
  }

  /* ---------- a building site that grows with the money given (v52), viewBox 0 0 120 100 ---------- */
  // pct 0..1 of the price raised; done = fully paid and in its last day of building
  function site(pct, done) {
    const h = done ? 54 : 8 + 46 * Math.max(0, Math.min(1, pct)), top = 92 - h; // the walls rise as money comes in
    let bricks = "";
    for (let y = 92 - 7; y >= top; y -= 7) {
      const row = Math.round((92 - y) / 7), off = row % 2 ? 7 : 0;
      for (let x = 24 - off; x < 96; x += 14) { const x0 = Math.max(24, x), x1 = Math.min(96, x + 13); if (x1 > x0) bricks += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="6" rx="1" fill="${(row + x) % 3 ? "#d9764a" : "#c9653d"}"/>`; }
    }
    const poles = h > 14 ? `<g stroke="#c8915a" stroke-width="2.6" fill="none"><path d="M20 94 L20 ${top - 6} M100 94 L100 ${top - 6}"/>` +
      Array.from({ length: Math.floor((h + 6) / 16) }, (_, i) => `<path d="M18 ${92 - 16 * (i + 1)} L102 ${92 - 16 * (i + 1)}"/>`).join("") + `</g>` : "";
    const crane = `<path d="M108 94 L108 10 M108 12 L62 12 M108 26 L94 12" stroke="#ffb703" stroke-width="3.4" fill="none"/><path d="M104 94 L112 94" stroke="#555" stroke-width="3"/>` +
      `<path d="M74 12 L74 ${Math.min(top - 10, 40)}" stroke="#555" stroke-width="1.4"/><rect x="66" y="${Math.min(top - 10, 40)}" width="16" height="8" rx="1.5" fill="#d9764a" stroke="#8a3d22" stroke-width="1"/>`;
    const cones = `<path d="M6 94 L11 80 L16 94Z M112 94 L116 84 L120 94Z" fill="#ff8c5a"/><path d="M8 89 L14 89" stroke="#fff" stroke-width="2"/>`;
    const sign = done ? `<g transform="translate(40 ${top - 16})"><rect width="40" height="13" rx="3" fill="#ffd34d" stroke="#5a3d00" stroke-width="1.2"/><text x="20" y="9.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="7" fill="#5a3d00">SOON!</text></g>` : "";
    return `<ellipse cx="60" cy="96" rx="52" ry="5" fill="#000" opacity=".14"/><ellipse cx="60" cy="92" rx="50" ry="8" fill="#b8915f" opacity=".8"/>` +
      `<rect x="22" y="${top}" width="76" height="${h}" fill="#8a3d22"/>${bricks}${poles}${crane}${cones}${sign}`;
  }

  window.VILLAGE = { map, BUILD, CROPS, plant, VEGGIE, SEA_FISH, sea, site };
})();
