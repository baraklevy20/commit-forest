// src/sha1.js
function sha1Head(text) {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array(((bytes.length + 8 >> 6) + 1) * 16);
  bytes.forEach((b2, i) => {
    words[i >> 2] |= b2 << 24 - i % 4 * 8;
  });
  words[bytes.length >> 2] |= 128 << 24 - bytes.length % 4 * 8;
  words[words.length - 1] = bytes.length * 8;
  let [a, b, c, d, e] = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
  const w = new Uint32Array(80);
  const rotl = (x, n) => x << n | x >>> 32 - n;
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[i + t] : rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let [A, B, C, D, E] = [a, b, c, d, e];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? B & C | ~B & D : t < 40 ? B ^ C ^ D : t < 60 ? B & C | B & D | C & D : B ^ C ^ D;
      const k = t < 20 ? 1518500249 : t < 40 ? 1859775393 : t < 60 ? 2400959708 : 3395469782;
      const tmp = rotl(A, 5) + f + E + k + w[t] >>> 0;
      [E, D, C, B, A] = [D, C, rotl(B, 30) >>> 0, A, tmp];
    }
    a = a + A >>> 0;
    b = b + B >>> 0;
    c = c + C >>> 0;
    d = d + D >>> 0;
    e = e + E >>> 0;
  }
  return a;
}

// src/forest.js
var SEEDLING = 0;
var SAPLING = 1;
var YOUNG = 2;
var MATURE = 3;
var OLD = 4;
var ANCIENT = 5;
var SAPLING_DAYS = 3;
var MATURE_DAYS = 21;
var OLD_DAYS = 180;
var ANCIENT_DAYS = 365;
var BREAK_DAYS = 14;
var MAX_INDIVIDUAL_TREES = 730;
var PINE_PERCENT = 34;
var SMALL_PERCENT = 20;
var REVIEWS_PER_BIRD = 40;
var BUSIEST = "FOURTH_QUARTILE";
var VISITORS = [
  ["rabbit", "a rabbit", "your forest reached 50 trees", (s) => s.trees >= 50],
  ["deer", "a deer", "your forest reached 100 trees", (s) => s.trees >= 100],
  ["owl", "an owl", "your first tree became ancient", (s) => s.ancient >= 1],
  ["heron", "a heron", "a pond formed where you took a break", (s) => s.ponds >= 1],
  ["cabin", "a cabin", "your forest turned one year old", (s) => s.forest_age >= ANCIENT_DAYS]
];
var DAY_MS = 864e5;
var dayNumber = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / DAY_MS);
var isoOf = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
function seedOf(text) {
  return sha1Head(text) & 2147483647;
}
function stageOf(ago) {
  if (ago <= 0) return SEEDLING;
  if (ago < SAPLING_DAYS) return SAPLING;
  if (ago < MATURE_DAYS) return YOUNG;
  if (ago < OLD_DAYS) return MATURE;
  if (ago < ANCIENT_DAYS) return OLD;
  return ANCIENT;
}
function inPeriod(days, period, today) {
  const year = period === "this-year" ? today.slice(0, 4) : /^\d{4}$/.test(period) ? period : null;
  return year ? days.filter((d) => d.date.startsWith(year + "-")) : days;
}
function buildForest(days, { login, today, cap = MAX_INDIVIDUAL_TREES }) {
  const todayN = dayNumber(today);
  const active = days.filter((d) => d.count > 0).sort((a, b) => a.date.localeCompare(b.date));
  const trees = active.map((d) => {
    const day = dayNumber(d.date), ago = todayN - day;
    const seed = seedOf(`${login.toLowerCase()}:${d.date}`);
    const size = d.level === BUSIEST ? 2 : (seed >>> 8) % 100 < SMALL_PERCENT ? 0 : 1;
    return {
      day,
      ago,
      date: d.date,
      n: d.count,
      stage: stageOf(ago),
      size,
      health: 0,
      kind: seed % 100 < PINE_PERCENT ? 1 : 0,
      seed,
      remembered: 1,
      strength: ago,
      struggling: 0,
      measured: false
    };
  });
  markPonds(trees, active.map((d) => dayNumber(d.date)));
  const stats = statsOf(trees, todayN);
  const visitors = VISITORS.filter(([, , , test]) => test(stats)).map(([key, label, why]) => ({ key, label, why, new: false }));
  return mergeOld({ trees, stats, visitors, forest_seed: seedOf(login.toLowerCase()), day_number: todayN }, cap);
}
function markPonds(trees, activeDays) {
  const ponds = [];
  for (let i = 1; i < activeDays.length; i++) {
    const gap = activeDays[i] - activeDays[i - 1] - 1;
    if (gap < BREAK_DAYS) continue;
    const last = ponds[ponds.length - 1];
    if (last && i <= last[0] + 1) {
      last[1] += gap;
      last[3] = activeDays[i] - 1;
    } else ponds.push([i, gap, activeDays[i - 1] + 1, activeDays[i] - 1]);
  }
  for (const [i, gap, from, to] of ponds) Object.assign(trees[i], { gap, gap_from: isoOf(from), gap_to: isoOf(to) });
}
function statsOf(trees, todayN) {
  const count = (stage) => trees.filter((t) => t.stage === stage).length;
  const last = trees[trees.length - 1];
  return {
    trees: trees.length,
    cards: trees.reduce((a, t) => a + t.n, 0),
    ancient: count(ANCIENT),
    old: count(OLD),
    young: count(YOUNG),
    yellowing: 0,
    // no streaks: nothing in the picture may depend on an unbroken run
    streak: 0,
    longest_streak: 0,
    reviews: trees.reduce((a, t) => a + t.n, 0),
    today_reviews: trees.filter((t) => t.ago <= 1).reduce((a, t) => a + t.n, 0) * REVIEWS_PER_BIRD,
    forest_age: trees.length ? todayN - trees[0].day : 0,
    oldest_date: trees.length ? trees[0].date : null,
    planted_today: Boolean(last && last.ago === 0),
    today_cards: last && last.ago === 0 ? last.n : 0,
    ponds: trees.filter((t) => t.gap).length,
    mature_cards: 0
  };
}
function mergeOld(forest, cap = MAX_INDIVIDUAL_TREES) {
  const { trees } = forest;
  if (trees.length <= cap) return forest;
  const old = trees.slice(0, trees.length - cap), kept = trees.slice(trees.length - cap);
  const merged = {
    count: old.length,
    cards: old.reduce((a, t) => a + t.n, 0),
    ancient: old.filter((t) => t.stage === ANCIENT).length,
    ponds: old.filter((t) => t.gap).length,
    from_date: old[0].date,
    to_date: old[old.length - 1].date,
    from_ago: old[0].ago,
    to_ago: old[old.length - 1].ago
  };
  return { ...forest, trees: kept, merged };
}

// src/presets.json
var presets_default = {
  golden_lake: {
    environment: "natural",
    landscape: "lake",
    landmark: "none",
    weather: "clear",
    time: "golden_hour",
    loop: 4,
    fps: 12
  },
  misty_valley: {
    environment: "misty_valley",
    landscape: "mountains",
    landmark: "peak",
    weather: "fog",
    time: "dawn",
    loop: 4,
    fps: 12
  },
  aurora: {
    environment: "aurora",
    landscape: "lake",
    landmark: "none",
    weather: "clear",
    time: "night",
    loop: 4,
    fps: 12
  },
  lanterns: {
    environment: "lanterns",
    landscape: "lake",
    landmark: "moon_bridge",
    weather: "clear",
    time: "night",
    loop: 60,
    fps: 8
  },
  bamboo: {
    environment: "bamboo",
    landscape: "river",
    landmark: "none",
    weather: "rain",
    time: "day",
    loop: 10,
    fps: 12
  },
  synthwave: {
    environment: "synthwave",
    landscape: "meadow",
    landmark: "none",
    weather: "clear",
    time: "dusk",
    loop: 4,
    fps: 12
  }
};

// src/scenery.js
var PANEL_PX = 776;
var tidy = (name) => name && name.trim().toLowerCase().replace(/-/g, "_");
function checkScenery(key, also = []) {
  if (!presets_default[key] && !also.includes(key)) {
    throw new Error(`there is no scenery called "${key}"; choose from ${[...Object.keys(presets_default), ...also].join(", ")}`);
  }
  return key;
}
function sceneryList(text) {
  if (!text || text.trim() === "all") return Object.keys(presets_default);
  return text.split(",").map(tidy).filter(Boolean).map((k) => checkScenery(k));
}
function dailyScenery(list, login, today, role = "light") {
  return list[seedOf(`${login.toLowerCase()}:daily:${role}:${today}`) % list.length];
}
function moonPhase(date) {
  const synodic = 29.530588853, knownNew = Date.UTC(2e3, 0, 6, 18, 14);
  return ((Date.parse(date + "T12:00:00Z") - knownNew) / 864e5 % synodic + synodic) % synodic / synodic;
}
function moodOf(scenery, date, time) {
  const look = presets_default[scenery];
  return {
    time: time || look.time,
    clock: false,
    weather: look.weather,
    special: look.environment,
    wind: false,
    environment: look.environment,
    landscape: look.landscape,
    landmark: look.landmark,
    moon: Math.round(moonPhase(date) * 1e3) / 1e3,
    source: "manual"
  };
}
function sceneData(forest, mood, loop = null) {
  return {
    trees: forest.trees,
    stats: forest.stats,
    visitors: forest.visitors,
    merged: forest.merged || null,
    forestSeed: forest.forest_seed,
    dayNumber: forest.day_number,
    anniversaries: [],
    events: [],
    journal: "",
    mood,
    environmentName: "",
    animations: true,
    tooltips: false,
    maxWidth: PANEL_PX,
    // the engine's loop mode: every motion repeats exactly in this many seconds
    loop
  };
}

// src/stamp.js
var GLYPHS = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7],
  1: [2, 6, 2, 2, 7],
  2: [6, 1, 2, 4, 7],
  3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6],
  6: [3, 4, 7, 5, 7],
  7: [7, 1, 2, 2, 2],
  8: [7, 5, 7, 5, 7],
  9: [7, 5, 7, 1, 6],
  ",": [0, 0, 0, 2, 4],
  ".": [0, 0, 0, 0, 2],
  "\xB7": [0, 0, 2, 0, 0],
  " ": [0, 0, 0, 0, 0],
  "'": [2, 2, 0, 0, 0],
  "=": [0, 7, 0, 7, 0],
  "-": [0, 0, 7, 0, 0],
  "/": [1, 1, 2, 4, 4]
};
var W = 3;
var H = 5;
var GAP = 1;
var MARGIN = 4;
var INK = [246, 238, 216];
var EDGE = [24, 28, 24];
var PLATE_SHOW = 0.35;
var PLATE_PAD = 2;
function labelLine(login) {
  return `${login} ON GITHUB \xB7 ONE TREE PER DAY WITH A CONTRIBUTION`;
}
function periodLabel(period, year) {
  return period === "this-year" ? year : /^\d{4}$/.test(period) ? period : null;
}
function statsLine(stats, period, year, since) {
  const n = (x) => x.toLocaleString("en-US");
  const parts = [`${n(stats.trees)} ${stats.trees === 1 ? "TREE" : "TREES"}`, `${n(stats.cards)} ${stats.cards === 1 ? "CONTRIBUTION" : "CONTRIBUTIONS"}`];
  const label = periodLabel(period, year);
  if (label) parts.unshift(label);
  else if (period === "last-year") parts[parts.length - 1] += " IN THE LAST YEAR";
  else if (period === "all" && since) parts[parts.length - 1] += ` SINCE ${since}`;
  return parts.join(" \xB7 ");
}
function textPixels(text, w, h, { top = false } = {}) {
  const glyphs = [...text.toUpperCase()].map((c) => GLYPHS[c] || GLYPHS[" "]);
  const x0 = MARGIN, y0 = top ? MARGIN : h - MARGIN - H;
  const lit = /* @__PURE__ */ new Set();
  glyphs.forEach((g, i) => g.forEach((row, y) => {
    for (let x = 0; x < W; x++) if (row & 1 << W - 1 - x) lit.add(`${x0 + i * (W + GAP) + x},${y0 + y}`);
  }));
  const ink = [...lit].map((p) => p.split(",").map(Number)), edge = /* @__PURE__ */ new Set();
  for (const [x, y] of ink) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!lit.has(`${x + dx},${y + dy}`)) edge.add(`${x + dx},${y + dy}`);
  const x1 = x0 + glyphs.length * (W + GAP) - GAP;
  const band = { x: x0 - PLATE_PAD, y: y0 - PLATE_PAD, w: x1 - x0 + 2 * PLATE_PAD, h: H + 2 * PLATE_PAD };
  return { band, ink, edge: [...edge].map((p) => p.split(",").map(Number)) };
}
var TEXT_COLOURS = { ink: INK, edge: EDGE, plateShow: PLATE_SHOW };

// site/app.js
var CALENDAR_API = "https://github-contributions-api.jogruber.de/v4/";
var SHUFFLE_MS = 5e3;
var NAMES = {
  golden_lake: "Golden hour by the lake",
  misty_valley: "Misty mountain valley",
  aurora: "Aurora night",
  lanterns: "Lanterns at night",
  bamboo: "Rainy bamboo grove",
  synthwave: "Synthwave"
};
var DEFAULTS = { scenery: "golden_lake", dark: "aurora", period: "last-year" };
var $ = (id) => document.getElementById(id);
var el = {
  form: $("options"),
  user: $("user"),
  madeup: $("madeup"),
  madeupBox: $("madeup-box"),
  perweek: $("perweek"),
  breaks: $("breaks"),
  years: $("years"),
  scenery: $("scenery"),
  dark: $("dark"),
  period: $("period"),
  time: $("time"),
  label: $("label"),
  stats: $("stats"),
  status: $("status"),
  stage: $("stage"),
  inner: $("stage-inner"),
  forest: $("forest"),
  overlay: $("overlay"),
  showLight: $("show-light"),
  showDark: $("show-dark"),
  yaml: $("yaml"),
  snippet: $("snippet"),
  loading: $("loading"),
  loadingText: $("loading-text"),
  load: $("load"),
  addLink: $("add-link"),
  addWrap: $("add-wrap"),
  repoLink: $("repo-link")
};
var calendar = null;
var viewDark = false;
var shuffleTimer = null;
var branch = null;
var todayIso = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function fillSceneries() {
  const opts = (extra) => [...Object.keys(presets_default).map((k) => [k, NAMES[k] || k]), ...extra].map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  el.scenery.innerHTML = opts([["daily", "A different one each day"], ["shuffle", "All of them in turn"]]);
  el.dark.innerHTML = opts([["daily", "A different one each day"], ["shuffle", "All of them in turn"], ["", "No dark image"]]);
  el.scenery.value = DEFAULTS.scenery;
  el.dark.value = DEFAULTS.dark;
}
var settings = () => ({
  scenery: el.scenery.value,
  dark: el.dark.value,
  period: el.period.value,
  time: el.time.value,
  label: el.label.checked,
  stats: el.stats.checked
});
function busy(text) {
  el.loading.hidden = !text;
  if (text) el.loadingText.textContent = text;
  el.load.disabled = Boolean(text);
  el.load.textContent = text ? "Loading" : "Show";
}
function setStatus(text, bad = false) {
  el.status.textContent = text;
  el.status.classList.toggle("bad", bad);
}
async function fetchDays(login, period) {
  const year = todayIso().slice(0, 4);
  const y = period === "last-year" ? "last" : period === "this-year" ? year : "all";
  const res = await fetch(`${CALENDAR_API}${encodeURIComponent(login)}?y=${y}`);
  if (res.status === 404) throw new Error(`There is no GitHub user called ${login}.`);
  if (!res.ok) throw new Error("The contribution calendar could not be read just now. Try again, or use a made-up history.");
  const body = await res.json();
  const today = todayIso();
  const days = body.contributions.filter((d) => d.date <= today).map((d) => ({ date: d.date, count: d.count, level: d.level === 4 ? "FOURTH_QUARTILE" : "OTHER" })).sort((a, b) => a.date.localeCompare(b.date));
  return { login, days, today: days.length ? days[days.length - 1].date : today };
}
function madeUpDays() {
  const perWeek = +el.perweek.value, breaks = +el.breaks.value, years = +el.years.value;
  let seed = seedOf(`made-up:${perWeek}:${breaks}:${years}`);
  const rand = () => (seed = seed * 1103515245 + 12345 & 2147483647) / 2147483647;
  const today = todayIso(), end = Date.parse(today + "T00:00:00Z"), span = years * 365;
  const away = /* @__PURE__ */ new Set();
  for (let y = 0; y < years; y++) {
    for (let b = 0; b < breaks; b++) {
      const start = Math.floor(y * 365 + rand() * 340), length = 15 + Math.floor(rand() * 15);
      for (let d = start; d < start + length; d++) away.add(d);
    }
  }
  const days = [];
  for (let ago = span; ago >= 0; ago--) {
    const date = new Date(end - ago * 864e5).toISOString().slice(0, 10);
    const active = !away.has(ago) && rand() < perWeek / 7;
    const count = active ? 1 + Math.floor(rand() * rand() * 20) : 0;
    days.push({ date, count, level: active && rand() < 0.2 ? "FOURTH_QUARTILE" : "OTHER" });
  }
  return { login: el.user.value.trim() || "you", days, today, madeUp: true };
}
async function load() {
  const login = el.user.value.trim();
  if (el.madeup.checked || !login) {
    calendar = madeUpDays();
    setStatus(login ? "A made-up history." : "A made-up history. Type a username to see a real one.");
  } else {
    setStatus("");
    busy(`Reading ${login}'s contributions`);
    try {
      calendar = await fetchDays(login, el.period.value);
    } catch (e) {
      const reason = e instanceof TypeError ? "The contribution calendar could not be reached just now." : e.message;
      calendar = { ...madeUpDays(), login };
      setStatus(`${reason} Showing a made-up history for now.`, true);
    } finally {
      busy(null);
    }
  }
  updateUrl();
  draw();
  lookUpRepo(login);
}
function forestNow() {
  const { period } = settings();
  let days = inPeriod(calendar.days, period, calendar.today);
  if (period === "last-year" && calendar.madeUp) {
    const from = new Date(Date.parse(calendar.today + "T00:00:00Z") - 364 * 864e5).toISOString().slice(0, 10);
    days = days.filter((d) => d.date >= from);
  }
  return buildForest(days, { login: calendar.login, today: calendar.today });
}
function scale() {
  const s = Math.min(1, el.stage.clientWidth / PANEL_PX);
  el.inner.style.transform = `scale(${s})`;
  el.stage.style.height = `${Math.round(PANEL_PX / 2 * s)}px`;
}
function drawText(forest, canvas) {
  const { period, label, stats } = settings();
  const w = canvas.width, h = canvas.height, g = el.overlay.getContext("2d");
  el.overlay.width = w;
  el.overlay.height = h;
  g.clearRect(0, 0, w, h);
  const year = calendar.today.slice(0, 4), since = forest.stats.oldest_date && forest.stats.oldest_date.slice(0, 4);
  const lines = [];
  if (label) lines.push([labelLine(calendar.login), true]);
  if (stats) lines.push([statsLine(forest.stats, period, year, since), false]);
  const rgb = (c) => `rgb(${c.join(",")})`;
  for (const [text, top] of lines) {
    const { band, ink, edge } = textPixels(text, w, h, { top });
    g.fillStyle = `rgba(${TEXT_COLOURS.edge.join(",")},${1 - TEXT_COLOURS.plateShow})`;
    g.fillRect(band.x, band.y, band.w, band.h);
    g.fillStyle = rgb(TEXT_COLOURS.edge);
    edge.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    g.fillStyle = rgb(TEXT_COLOURS.ink);
    ink.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }
}
function mount(forest, key, time) {
  window.AnkiForest.mount(el.forest, sceneData(forest, moodOf(key, calendar.today, time)), { now: true });
  const canvas = el.forest.querySelector("canvas");
  if (canvas) drawText(forest, canvas);
}
function draw() {
  if (!calendar) return;
  clearInterval(shuffleTimer);
  const s = settings(), forest = forestNow();
  const choice = viewDark ? s.dark : s.scenery;
  const time = viewDark ? null : s.time || null;
  if (viewDark && !choice) {
    setStatus("There is no dark image: dark mode shows the light one.");
  }
  const pick = choice || s.scenery;
  const all = sceneryList("all");
  if (pick === "shuffle") {
    let i = 0;
    mount(forest, all[0], time);
    shuffleTimer = setInterval(() => {
      i = (i + 1) % all.length;
      mount(forest, all[i], time);
    }, SHUFFLE_MS);
  } else {
    const key = pick === "daily" ? dailyScenery(all, calendar.login, calendar.today, viewDark ? "dark" : "light") : pick;
    mount(forest, key, time);
  }
  scale();
  writeSetup();
}
function workflow() {
  const s = settings(), w = [];
  if (s.scenery !== DEFAULTS.scenery) w.push(`scenery: ${s.scenery}`);
  if (s.dark !== DEFAULTS.dark) w.push(`dark_scenery: ${s.dark ? s.dark : '""'}`);
  if (s.period !== DEFAULTS.period) w.push(`period: ${s.period}`);
  if (!s.label) w.push("label: false");
  if (!s.stats) w.push("stats: false");
  if (s.time) w.push(`timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  const cron = s.time ? '"0 * * * *" }]   # every hour, to follow your clock' : '"17 4 * * *" }]   # once a day';
  return [
    "name: forest",
    "on:",
    `  schedule: [{ cron: ${cron}`,
    "  workflow_dispatch:",
    "  push: { paths: [.github/workflows/forest.yml] }",
    "permissions:",
    "  contents: write",
    "jobs:",
    "  grow:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: baraklevy20/commit-forest@v1",
    ...w.length ? ["        with:", ...w.map((x) => `          ${x}`)] : []
  ].join("\n");
}
function snippet() {
  const login = calendar && calendar.login !== "you" && calendar.login || "<you>";
  const url = (f) => `https://raw.githubusercontent.com/${login}/${login}/output/${f}`;
  const img = `<img alt="My contribution forest: one tree for each day I contributed" src="${url("forest.png")}">`;
  const inner = settings().dark ? `<picture>
    <source media="(prefers-color-scheme: dark)" srcset="${url("forest-dark.png")}">
    ${img}
  </picture>` : img;
  return `<a href="https://github.com/baraklevy20/commit-forest">
  ${inner}
</a>`;
}
function writeSetup() {
  const yaml = workflow();
  el.yaml.textContent = yaml;
  el.snippet.textContent = snippet();
  const login = calendar && calendar.login !== "you" ? calendar.login : null;
  if (login && branch) {
    el.addLink.href = `https://github.com/${login}/${login}/new/${branch}?filename=.github/workflows/forest.yml&value=${encodeURIComponent(yaml)}`;
    el.addWrap.hidden = false;
  } else {
    el.addWrap.hidden = true;
  }
}
async function lookUpRepo(login) {
  branch = null;
  if (!login || el.madeup.checked) {
    el.repoLink.href = "https://github.com/new";
    writeSetup();
    return;
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}`);
    if (res.ok) {
      branch = (await res.json()).default_branch;
      el.repoLink.href = `https://github.com/${login}/${login}`;
    } else {
      el.repoLink.href = "https://github.com/new";
    }
  } catch {
  }
  writeSetup();
}
function updateUrl() {
  const q = new URLSearchParams();
  if (el.user.value.trim() && !el.madeup.checked) q.set("user", el.user.value.trim());
  history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
}
fillSceneries();
for (const id of ["perweek", "breaks", "years"]) {
  const show = () => {
    $(`${id}-v`).textContent = el[id].value;
  };
  el[id].addEventListener("input", show);
  show();
  el[id].addEventListener("change", load);
}
el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  load();
});
el.madeup.addEventListener("change", () => {
  el.madeupBox.hidden = !el.madeup.checked;
  load();
});
el.period.addEventListener("change", () => calendar && !el.madeup.checked && el.user.value.trim() ? load() : draw());
for (const x of [el.scenery, el.dark, el.time, el.label, el.stats]) x.addEventListener("change", draw);
var view = (dark) => () => {
  viewDark = dark;
  el.showLight.setAttribute("aria-pressed", String(!dark));
  el.showDark.setAttribute("aria-pressed", String(dark));
  draw();
};
el.showLight.addEventListener("click", view(false));
el.showDark.addEventListener("click", view(true));
document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  const text = $(b.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(text);
    b.textContent = "Copied";
  } catch {
    b.textContent = "Select and copy";
  }
  setTimeout(() => {
    b.textContent = "Copy";
  }, 1500);
}));
window.addEventListener("resize", scale);
el.user.value = new URLSearchParams(location.search).get("user") || "";
load();
