// The preview page: the Action's own forest rules and scenery data, drawn live in the browser
// by the same engine, with the workflow and README snippet for whatever is chosen.

import { buildForest, inPeriod, seedOf } from '../src/forest.js';
import { dailyScenery, moodOf, PANEL_PX, SCENERIES, sceneData, sceneryList } from '../src/scenery.js';
import { labelLine, statsLine, TEXT_COLOURS, textPixels } from '../src/stamp.js';

// public contribution calendars, with no token: github.com/grubersjoe/github-contributions-api
const CALENDAR_API = 'https://github-contributions-api.jogruber.de/v4/';
const SHUFFLE_MS = 5000;
const NAMES = {
  golden_lake: 'Golden hour by the lake', misty_valley: 'Misty mountain valley', aurora: 'Aurora night',
  lanterns: 'Lanterns at night', bamboo: 'Rainy bamboo grove', synthwave: 'Synthwave',
};
const DEFAULTS = { scenery: 'golden_lake', dark: 'aurora', period: 'last-year' };

const $ = id => document.getElementById(id);
const el = {
  form: $('options'), user: $('user'), madeup: $('madeup'), madeupBox: $('madeup-box'),
  perweek: $('perweek'), breaks: $('breaks'), years: $('years'), scenery: $('scenery'), dark: $('dark'),
  period: $('period'), time: $('time'), label: $('label'), stats: $('stats'), status: $('status'),
  stage: $('stage'), inner: $('stage-inner'), forest: $('forest'), overlay: $('overlay'),
  showLight: $('show-light'), showDark: $('show-dark'), yaml: $('yaml'), snippet: $('snippet'),
  addLink: $('add-link'), addWrap: $('add-wrap'), repoLink: $('repo-link'),
};

let calendar = null;      // { login, days, today } as last loaded
let viewDark = false;     // previewing the dark-mode image
let shuffleTimer = null;
let branch = null;        // the profile repository's default branch, once known

const todayIso = () => new Date().toISOString().slice(0, 10);

/* ---------- the settings ---------- */

function fillSceneries() {
  const opts = (extra) => [...Object.keys(SCENERIES).map(k => [k, NAMES[k] || k]), ...extra]
    .map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  el.scenery.innerHTML = opts([['daily', 'A different one each day'], ['shuffle', 'All of them in turn']]);
  el.dark.innerHTML = opts([['daily', 'A different one each day'], ['shuffle', 'All of them in turn'], ['', 'No dark image']]);
  el.scenery.value = DEFAULTS.scenery;
  el.dark.value = DEFAULTS.dark;
}

const settings = () => ({
  scenery: el.scenery.value, dark: el.dark.value, period: el.period.value, time: el.time.value,
  label: el.label.checked, stats: el.stats.checked,
});

function setStatus(text, bad = false) {
  el.status.textContent = text;
  el.status.classList.toggle('bad', bad);
}

/* ---------- where the contributions come from ---------- */

async function fetchDays(login, period) {
  const year = todayIso().slice(0, 4);
  const y = period === 'last-year' ? 'last' : period === 'this-year' ? year : 'all';
  const res = await fetch(`${CALENDAR_API}${encodeURIComponent(login)}?y=${y}`);
  if (res.status === 404) throw new Error(`There is no GitHub user called ${login}.`);
  if (!res.ok) throw new Error('The contribution calendar could not be read just now. Try again, or use a made-up history.');
  const body = await res.json();
  const today = todayIso();
  // level 4 is the darkest square, which grows a broad crown
  const days = body.contributions.filter(d => d.date <= today)
    .map(d => ({ date: d.date, count: d.count, level: d.level === 4 ? 'FOURTH_QUARTILE' : 'OTHER' }));
  return { login, days, today: days.length ? days[days.length - 1].date : today };
}

/* A made-up history from the sliders, the same every time for the same settings. */
function madeUpDays() {
  const perWeek = +el.perweek.value, breaks = +el.breaks.value, years = +el.years.value;
  let seed = seedOf(`made-up:${perWeek}:${breaks}:${years}`);
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const today = todayIso(), end = Date.parse(today + 'T00:00:00Z'), span = years * 365;
  const away = new Set();
  for (let y = 0; y < years; y++) {
    for (let b = 0; b < breaks; b++) {
      const start = Math.floor(y * 365 + rand() * 340), length = 15 + Math.floor(rand() * 15);
      for (let d = start; d < start + length; d++) away.add(d);
    }
  }
  const days = [];
  for (let ago = span; ago >= 0; ago--) {
    const date = new Date(end - ago * 86400000).toISOString().slice(0, 10);
    const active = !away.has(ago) && rand() < perWeek / 7;
    const count = active ? 1 + Math.floor(rand() * rand() * 20) : 0;
    days.push({ date, count, level: active && rand() < 0.2 ? 'FOURTH_QUARTILE' : 'OTHER' });
  }
  return { login: el.user.value.trim() || 'you', days, today };
}

async function load() {
  const login = el.user.value.trim();
  if (el.madeup.checked || !login) {
    calendar = madeUpDays();
    setStatus(login ? 'A made-up history.' : 'A made-up history. Type a username to see a real one.');
  } else {
    setStatus(`Reading ${login}'s contributions...`);
    try {
      calendar = await fetchDays(login, el.period.value);
      setStatus('');
    } catch (e) {
      // the page still shows a forest, from made-up days, and says why
      const reason = e instanceof TypeError ? 'The contribution calendar could not be reached just now.' : e.message;
      calendar = { ...madeUpDays(), login };
      setStatus(`${reason} Showing a made-up history for now.`, true);
    }
  }
  updateUrl();
  draw();
  lookUpRepo(login);
}

/* ---------- drawing ---------- */

function forestNow() {
  const { period } = settings();
  return buildForest(inPeriod(calendar.days, period, calendar.today), { login: calendar.login, today: calendar.today });
}

function scale() {
  const s = Math.min(1, el.stage.clientWidth / PANEL_PX);
  el.inner.style.transform = `scale(${s})`;
  el.stage.style.height = `${Math.round(PANEL_PX / 2 * s)}px`;
}

/* The label and the numbers, drawn over the engine's canvas exactly as the Action stamps them. */
function drawText(forest, canvas) {
  const { period, label, stats } = settings();
  const w = canvas.width, h = canvas.height, g = el.overlay.getContext('2d');
  el.overlay.width = w; el.overlay.height = h;
  g.clearRect(0, 0, w, h);
  const year = calendar.today.slice(0, 4), since = forest.stats.oldest_date && forest.stats.oldest_date.slice(0, 4);
  const lines = [];
  if (label) lines.push([labelLine(calendar.login), true]);
  if (stats) lines.push([statsLine(forest.stats, period, year, since), false]);
  const rgb = c => `rgb(${c.join(',')})`;
  for (const [text, top] of lines) {
    const { band, ink, edge } = textPixels(text, w, h, { top });
    g.fillStyle = `rgba(${TEXT_COLOURS.edge.join(',')},${1 - TEXT_COLOURS.plateShow})`;
    g.fillRect(band.x, band.y, band.w, band.h);
    g.fillStyle = rgb(TEXT_COLOURS.edge); edge.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    g.fillStyle = rgb(TEXT_COLOURS.ink); ink.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }
}

function mount(forest, key, time) {
  window.AnkiForest.mount(el.forest, sceneData(forest, moodOf(key, calendar.today, time)), { now: true });
  const canvas = el.forest.querySelector('canvas');
  if (canvas) drawText(forest, canvas);
}

function draw() {
  if (!calendar) return;
  clearInterval(shuffleTimer);
  const s = settings(), forest = forestNow();
  const choice = viewDark ? s.dark : s.scenery;
  // the time of day stands in for the timezone setting, which only moves the light image
  const time = viewDark ? null : s.time || null;
  if (viewDark && !choice) { setStatus('There is no dark image: dark mode shows the light one.'); }
  const pick = choice || s.scenery;
  const all = sceneryList('all');
  if (pick === 'shuffle') {
    let i = 0;
    mount(forest, all[0], time);
    shuffleTimer = setInterval(() => { i = (i + 1) % all.length; mount(forest, all[i], time); }, SHUFFLE_MS);
  } else {
    const key = pick === 'daily' ? dailyScenery(all, calendar.login, calendar.today, viewDark ? 'dark' : 'light') : pick;
    mount(forest, key, time);
  }
  scale();
  writeSetup();
}

/* ---------- the setup it leads to ---------- */

function workflow() {
  const s = settings(), w = [];
  if (s.scenery !== DEFAULTS.scenery) w.push(`scenery: ${s.scenery}`);
  if (s.dark !== DEFAULTS.dark) w.push(`dark_scenery: ${s.dark ? s.dark : '""'}`);
  if (s.period !== DEFAULTS.period) w.push(`period: ${s.period}`);
  if (!s.label) w.push('label: false');
  if (!s.stats) w.push('stats: false');
  if (s.time) w.push(`timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  const cron = s.time ? '"0 * * * *" }]   # every hour, to follow your clock' : '"17 4 * * *" }]   # once a day';
  return ['name: forest', 'on:', `  schedule: [{ cron: ${cron}`, '  workflow_dispatch:',
    '  push: { paths: [.github/workflows/forest.yml] }', 'permissions:', '  contents: write', 'jobs:', '  grow:',
    '    runs-on: ubuntu-latest', '    steps:', '      - uses: baraklevy20/commit-forest@v1',
    ...(w.length ? ['        with:', ...w.map(x => `          ${x}`)] : [])].join('\n');
}

function snippet() {
  const login = (calendar && calendar.login !== 'you' && calendar.login) || '<you>';
  const url = f => `https://raw.githubusercontent.com/${login}/${login}/output/${f}`;
  const img = `<img alt="My contribution forest: one tree for each day I contributed" src="${url('forest.png')}">`;
  const inner = settings().dark
    ? `<picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${url('forest-dark.png')}">\n    ${img}\n  </picture>`
    : img;
  return `<a href="https://github.com/baraklevy20/commit-forest">\n  ${inner}\n</a>`;
}

function writeSetup() {
  const yaml = workflow();
  el.yaml.textContent = yaml;
  el.snippet.textContent = snippet();
  const login = calendar && calendar.login !== 'you' ? calendar.login : null;
  if (login && branch) {
    el.addLink.href = `https://github.com/${login}/${login}/new/${branch}?filename=.github/workflows/forest.yml&value=${encodeURIComponent(yaml)}`;
    el.addWrap.hidden = false;
  } else {
    el.addWrap.hidden = true;
  }
}

/* Whether the user has a profile repository yet, and its default branch (for the link that
 * opens the workflow already filled in). */
async function lookUpRepo(login) {
  branch = null;
  if (!login || el.madeup.checked) { el.repoLink.href = 'https://github.com/new'; writeSetup(); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(login)}`);
    if (res.ok) {
      branch = (await res.json()).default_branch;
      el.repoLink.href = `https://github.com/${login}/${login}`;
    } else {
      el.repoLink.href = 'https://github.com/new';
    }
  } catch { /* the link stays general */ }
  writeSetup();
}

function updateUrl() {
  const q = new URLSearchParams();
  if (el.user.value.trim() && !el.madeup.checked) q.set('user', el.user.value.trim());
  history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
}

/* ---------- wiring ---------- */

fillSceneries();
for (const id of ['perweek', 'breaks', 'years']) {
  const show = () => { $(`${id}-v`).textContent = el[id].value; };
  el[id].addEventListener('input', show); show();
  el[id].addEventListener('change', load);
}
el.form.addEventListener('submit', e => { e.preventDefault(); load(); });
el.madeup.addEventListener('change', () => { el.madeupBox.hidden = !el.madeup.checked; load(); });
// a real history is fetched for the period it covers; a made-up one already has every year
el.period.addEventListener('change', () => (calendar && !el.madeup.checked && el.user.value.trim() ? load() : draw()));
for (const x of [el.scenery, el.dark, el.time, el.label, el.stats]) x.addEventListener('change', draw);
const view = dark => () => {
  viewDark = dark;
  el.showLight.setAttribute('aria-pressed', String(!dark));
  el.showDark.setAttribute('aria-pressed', String(dark));
  draw();
};
el.showLight.addEventListener('click', view(false));
el.showDark.addEventListener('click', view(true));
document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
  const text = $(b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1500);
}));
window.addEventListener('resize', scale);

el.user.value = new URLSearchParams(location.search).get('user') || '';
load();
