// ── CONFIG ───────────────────────────────────────────────────
const GOAL  = 36000; // 10 hours in seconds
const CIRC  = 666.02;

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── CHART INSTANCES ──────────────────────────────────────────
let alltimeChart = null, chartMonthly = null, challengeChart = null;

// ── SHARED CHART OPTIONS ─────────────────────────────────────
function barChartOptions({ stacked = false, maxRotation = 0, maxTicksLimit = 16, yMax = 24 } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const v = ctx.raw;
            if (v == null || v === 0) return '';
            const h = Math.floor(v), m = Math.round((v - h) * 60);
            const label = ctx.dataset.label ? ` ${ctx.dataset.label}: ` : ' ';
            return `${label}${h}h ${String(m).padStart(2, '0')}m`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        ticks: { font: { size: 8, family: 'Jost, sans-serif' }, color: '#a89070', maxRotation, autoSkip: true, maxTicksLimit },
        border: { display: false }
      },
      y: {
        stacked,
        min: 0,
        max: yMax,
        grid: { color: '#f0ebe0' },
        ticks: { font: { size: 8, family: 'Jost, sans-serif' }, color: '#a89070', stepSize: 4, callback: v => v + 'h' },
        border: { display: false }
      }
    }
  };
}

// ── STORAGE ──────────────────────────────────────────────────
function dateKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function todayKey() { return dateKey(new Date()); }

function loadSessionData() {
  try {
    const data = JSON.parse(localStorage.getItem('tc30_v3') || '{}');
    const sess = data._session;
    delete data._session;
    return { data, sess };
  } catch(e) { return { data: {}, sess: null }; }
}

function saveSessionData() {
  try {
    const toSave = Object.assign({}, state);
    if (sessionStart) toSave._session = { start: sessionStart };
    localStorage.setItem('tc30_v3', JSON.stringify(toSave));
  } catch(e) {}
}

const _loaded = loadSessionData();
let state = _loaded.data;
let sessionStart = null, ticker = null;

if (_loaded.sess) {
  sessionStart = _loaded.sess.start;
  ticker = setInterval(() => { updateUI(); saveSessionData(); }, 1000);
}

function todayData() {
  const k = todayKey();
  if (!state[k]) state[k] = { total: 0 };
  return state[k];
}

function liveTotalSecs() {
  const d = todayData();
  return (d.total || 0) + (sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0);
}

function getEntry(d) {
  const k = dateKey(d);
  const isToday = k === todayKey();
  const raw = state[k] || {};
  const cats = loadCategories();
  const result = { total: raw.total || 0 };
  cats.forEach(cat => { result[cat.id] = raw[cat.id] || 0; });
  if (isToday && sessionStart) {
    const live = Math.floor((Date.now() - sessionStart) / 1000);
    result.total += live;
    result[activeCatId] = (result[activeCatId] || 0) + live;
  }
  return result;
}

function fmt(s) {
  return Math.floor(s / 3600) + 'h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm';
}

function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── TIMER ────────────────────────────────────────────────────
function toggleTimer() {
  if (!sessionStart) {
    sessionStart = Date.now();
    ticker = setInterval(() => { updateUI(); saveSessionData(); }, 1000);
    saveSessionData();
  } else {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const d = todayData();
    d.total = (d.total || 0) + elapsed;
    d[activeCatId] = (d[activeCatId] || 0) + elapsed;
    sessionStart = null;
    clearInterval(ticker); ticker = null;
    saveSessionData();
  }
  updateUI();
}

window.addEventListener('beforeunload', saveSessionData);

window.addEventListener('visibilitychange', () => {
  if (document.hidden && sessionStart) {
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const d = todayData();
    d.total = (d.total || 0) + elapsed;
    d[activeCatId] = (d[activeCatId] || 0) + elapsed;
    sessionStart = Date.now();
    saveSessionData();
  }
});

// ── MAIN UI ──────────────────────────────────────────────────
function updateUI() {
  const todayMs = new Date(new Date().toDateString()).getTime();
  const secs    = liveTotalSecs();
  const ch      = loadChallenge();
  const goal    = effectiveGoal(ch, todayMs);

  const pct = Math.min(1, secs / goal);
  document.getElementById('progress-ring').style.strokeDashoffset = CIRC * (1 - pct);
  document.getElementById('time-display').textContent = fmt(secs);
  document.getElementById('pct-label').textContent = Math.round(pct * 100) + '%';
  document.getElementById('time-sub').textContent = 'of ' + Math.round(goal / 3600) + 'h goal';

  if (ch) {
    const startMs = new Date(ch.startDate).getTime();
    const endMs   = startMs + (ch.days - 1) * 86400000;
    const dayNum  = Math.floor((todayMs - startMs) / 86400000) + 1;
    const chName  = ch.name ? ch.name + ' — ' : '';
    if (todayMs < startMs) {
      document.getElementById('day-label').textContent = ch.name || 'Challenge';
    } else if (todayMs > endMs) {
      document.getElementById('day-label').textContent = (ch.name || 'Challenge') + ' Complete';
    } else {
      document.getElementById('day-label').textContent = chName + 'Day ' + dayNum + ' of ' + ch.days;
    }
    document.getElementById('challenge-btn').classList.toggle('active-challenge', todayMs >= startMs && todayMs <= endMs);
  } else {
    document.getElementById('day-label').textContent = '';
    document.getElementById('challenge-btn').classList.remove('active-challenge');
  }

  const running = !!sessionStart;
  const cats = loadCategories();
  const activeCat = cats.find(c => c.id === activeCatId) || cats[0];
  document.getElementById('active-type-label')[running ? 'textContent' : 'innerHTML'] =
    running ? (activeCat ? activeCat.name : 'Studying') : '&nbsp;';
  document.getElementById('dot').className = running ? 'live' : '';
  document.getElementById('btn-label').textContent = running ? 'Stop' : 'Start';
  document.getElementById('start-stop').className = running ? 'running' : '';

  document.getElementById('sum-study').textContent = fmt(secs);
  document.getElementById('bar-study').style.width = Math.min(100, secs / goal * 100) + '%';

  if (ch) {
    const startMs = new Date(ch.startDate).getTime();
    const chGoal  = ch.goalHours * 3600;
    let daysDone = 0;
    for (let i = 0; i < ch.days; i++) {
      const dMs = startMs + i * 86400000;
      if (dMs > todayMs) break;
      if (getEntry(new Date(dMs)).total >= chGoal) daysDone++;
    }
    document.getElementById('sum-days').textContent = daysDone + ' / ' + ch.days;
    document.getElementById('bar-days').style.width = (daysDone / ch.days * 100) + '%';
  } else {
    document.getElementById('sum-days').textContent = '—';
    document.getElementById('bar-days').style.width = '0%';
  }
}

// ── LOG OVERLAY ──────────────────────────────────────────────
function openCal() {
  document.getElementById('overlay').classList.add('open');
  switchTab('monthly');
}
function closeCal() {
  document.getElementById('overlay').classList.remove('open');
}

function switchTab(tab) {
  ['monthly', 'alltime', 'streak'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('visible', t === tab);
    document.getElementById('tab-' + t + '-btn').classList.toggle('active', t === tab);
  });
  if (tab === 'monthly')     buildMonthlyCalendar();
  else if (tab === 'streak') buildStreakTab();
  else                       buildAllTime();
}

// ── CALENDAR TAB ─────────────────────────────────────────────
let calMonth = new Date().getMonth();
let calYear  = new Date().getFullYear();

function buildMonthlyCalendar() {
  const todayMs  = new Date(new Date().toDateString()).getTime();
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay  = new Date(calYear, calMonth + 1, 0);
  const ch       = loadChallenge();
  const dayGoal  = effectiveGoal(ch, todayMs);

  document.getElementById('monthly-title').textContent = MONTHS_LONG[calMonth] + ' ' + calYear;

  let totalTime = 0, daysDone = 0;
  const labels = [];
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(calYear, calMonth, day);
    labels.push(String(day));
    if (d.getTime() > todayMs) continue;
    const e = getEntry(d);
    totalTime += e.total;
    if (e.total >= dayGoal) daysDone++;
  }

  document.getElementById('stats-monthly').innerHTML = `
    <div class="stat-card"><div class="stat-val study">${Math.floor(totalTime / 3600)}h</div><div class="stat-lbl">Total</div></div>
    <div class="stat-card"><div class="stat-val days">${daysDone}</div><div class="stat-lbl">Days Done</div></div>
  `;

  const grid = document.getElementById('cal-monthly');
  grid.innerHTML = '';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const el = document.createElement('div'); el.className = 'dn'; el.textContent = d; grid.appendChild(el);
  });
  for (let i = 0; i < firstDay.getDay(); i++) {
    const el = document.createElement('div'); el.className = 'cal-day-m empty'; grid.appendChild(el);
  }
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d       = new Date(calYear, calMonth, day);
    const dMs     = d.getTime();
    const isToday  = dMs === todayMs;
    const isFuture = dMs > todayMs;
    const e       = isFuture ? null : getEntry(d);
    const tot     = e ? e.total : 0;
    const done    = tot >= dayGoal;
    const el = document.createElement('div');
    el.className = 'cal-day-m' + (isToday ? ' today' : '') + (done ? ' done-day' : '') + (isFuture ? ' future' : '');
    const num = document.createElement('div'); num.className = 'cd-num'; num.textContent = day; el.appendChild(num);
    if (!isFuture && tot > 0) {
      const t = document.createElement('div'); t.className = 'cd-total';
      t.textContent = (tot / 3600).toFixed(1) + 'h'; el.appendChild(t);
      if (done) { const c = document.createElement('div'); c.className = 'cd-check'; c.textContent = '✓'; el.appendChild(c); }
    }
    grid.appendChild(el);
  }

  const catDatasets = loadCategories().map(cat => ({
    label: cat.name,
    data: labels.map((_, i) => {
      const d2 = new Date(calYear, calMonth, i + 1);
      if (d2.getTime() > todayMs) return null;
      return +((getEntry(d2)[cat.id] || 0) / 3600).toFixed(2);
    }),
    backgroundColor: hexRgba(cat.color, 0.72),
    borderColor: hexRgba(cat.color, 0.9),
    borderWidth: 1, borderRadius: 3, borderSkipped: false,
  }));

  document.getElementById('chart-monthly-title').textContent = 'Daily Hours — ' + MONTHS_LONG[calMonth] + ' ' + calYear;
  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  chartMonthly = new Chart(document.getElementById('chart-monthly').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: catDatasets },
    options: barChartOptions({ stacked: true, maxRotation: 0, maxTicksLimit: 16, yMax: 24 })
  });
}

function prevMonth() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  buildMonthlyCalendar();
}
function nextMonth() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  buildMonthlyCalendar();
}

// ── HISTORY TAB ──────────────────────────────────────────────
function buildAllTime() {
  const todayMs = new Date(new Date().toDateString()).getTime();
  const cats = loadCategories();
  let grandTotal = 0, daysActive = 0;
  const catTotals = {};
  cats.forEach(c => { catTotals[c.id] = 0; });

  Object.keys(state).forEach(k => {
    if (k === '_session') return;
    const entry = state[k];
    if (!entry) return;
    const [y, mo, day] = k.split('-').map(Number);
    if (new Date(y, mo - 1, day).getTime() > todayMs) return;
    let dayTotal = entry.total || 0;
    if (k === todayKey() && sessionStart) dayTotal += Math.floor((Date.now() - sessionStart) / 1000);
    if (dayTotal > 0) daysActive++;
    grandTotal += dayTotal;
    cats.forEach(c => {
      let secs = entry[c.id] || 0;
      if (k === todayKey() && sessionStart && activeCatId === c.id) secs += Math.floor((Date.now() - sessionStart) / 1000);
      catTotals[c.id] += secs;
    });
  });

  const catStats = cats.map(c =>
    `<div class="stat-card"><div class="stat-val" style="color:${c.color}">${Math.floor(catTotals[c.id] / 3600)}h</div><div class="stat-lbl">${c.name}</div></div>`
  ).join('');
  document.getElementById('stats-alltime').innerHTML = `
    <div class="stat-card"><div class="stat-val total">${Math.floor(grandTotal / 3600)}h</div><div class="stat-lbl">Grand Total</div></div>
    <div class="stat-card"><div class="stat-val days">${daysActive}</div><div class="stat-lbl">Days Active</div></div>
    ${catStats}
  `;

  buildAllTimeChart(todayMs);
}

function buildAllTimeChart(todayMs) {
  const allKeys = Object.keys(state).filter(k => k !== '_session').sort();
  if (!allKeys.length) {
    if (alltimeChart) { alltimeChart.destroy(); alltimeChart = null; }
    return;
  }

  const firstMs = new Date(allKeys[0].replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) =>
    `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)).getTime();
  const cats = loadCategories();
  const labels = [];
  const catDataArrays = cats.map(() => []);
  const cursor = new Date(firstMs);

  while (cursor.getTime() <= todayMs) {
    const k = dateKey(cursor);
    labels.push(MONTHS_SHORT[cursor.getMonth()] + ' ' + cursor.getDate());
    const entry = state[k] || {};
    const isToday = k === todayKey();
    cats.forEach((cat, i) => {
      let secs = entry[cat.id] || 0;
      if (isToday && sessionStart && activeCatId === cat.id) secs += Math.floor((Date.now() - sessionStart) / 1000);
      catDataArrays[i].push(+(secs / 3600).toFixed(2));
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const datasets = cats.map((cat, i) => ({
    label: cat.name,
    data: catDataArrays[i],
    backgroundColor: hexRgba(cat.color, 0.72),
    borderColor: hexRgba(cat.color, 0.9),
    borderWidth: 1, borderRadius: 3, borderSkipped: false,
  }));

  if (alltimeChart) { alltimeChart.destroy(); alltimeChart = null; }
  const opts = barChartOptions({ stacked: true, maxRotation: 45, maxTicksLimit: 14, yMax: 24 });
  opts.scales.x.ticks.font.size = 7;
  opts.scales.y.ticks.stepSize = 2;
  alltimeChart = new Chart(document.getElementById('chart-alltime').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: opts
  });
}

// ── STREAK ───────────────────────────────────────────────────
function loadStreak() {
  try { return JSON.parse(localStorage.getItem('nofap_streak') || 'null'); } catch(e) { return null; }
}
function saveStreak(data) { localStorage.setItem('nofap_streak', JSON.stringify(data)); }

function streakDays(startISO) {
  const start = new Date(new Date(startISO).toDateString());
  const today = new Date(new Date().toDateString());
  return Math.floor((today - start) / 86400000);
}

function fmtDate(iso) {
  const d = new Date(iso);
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function updateStreakUI() {
  const data = loadStreak();
  const countEl = document.getElementById('streak-count');
  const sinceEl = document.getElementById('streak-since');
  if (!data || !data.start) {
    countEl.textContent = '0 days';
    sinceEl.textContent = 'not started';
    return;
  }
  const days = streakDays(data.start);
  countEl.textContent = days === 1 ? '1 day' : days + ' days';
  sinceEl.textContent = 'since ' + fmtDate(data.start);
}

function buildStreakTab() {
  const data = loadStreak() || { start: new Date().toISOString(), resets: [] };
  const resets = data.resets || [];
  const days = streakDays(data.start);

  document.getElementById('streak-tab-count').textContent = days === 1 ? '1 day' : days + ' days';
  document.getElementById('streak-tab-since').textContent = 'since ' + fmtDate(data.start);
  document.getElementById('streak-tab-resets').textContent = resets.length;

  const list = document.getElementById('streak-history-list');
  if (resets.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:0.5rem 0;">No resets yet. Keep going.</div>';
  } else {
    list.innerHTML = resets.slice().reverse().map((r, i) => {
      const d = new Date(r);
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
      <div class="reset-row">
        <span>${fmtDate(r)} <span style="color:var(--text-3);font-size:11px;">${time}</span></span>
        <span class="reset-num">Reset #${resets.length - i}</span>
      </div>`;
    }).join('');
  }
}

function resetStreak() {
  if (!confirm('Reset your streak? This marks today as day 0.')) return;
  const data = loadStreak() || { start: new Date().toISOString(), resets: [] };
  if (!data.resets) data.resets = [];
  data.resets.push(new Date().toISOString());
  data.start = new Date().toISOString();
  saveStreak(data);
  updateStreakUI();
  buildStreakTab();
}

if (!loadStreak()) saveStreak({ start: new Date().toISOString(), resets: [] });

// ── CATEGORIES ───────────────────────────────────────────────
const CAT_PALETTE = ['#c8921a','#3a8a58','#5b7fa6','#9b6b9b','#c05050','#4a8a80','#c87840','#6b8a4a'];
const DEFAULT_CATS = [
  { id: 'study', name: 'Studying', color: '#c8921a' },
  { id: 'sabr',  name: 'SABR',    color: '#3a8a58' }
];

function loadCategories() {
  try { return JSON.parse(localStorage.getItem('tc30_cats') || 'null') || DEFAULT_CATS; }
  catch(e) { return DEFAULT_CATS; }
}
function saveCategories(cats) { localStorage.setItem('tc30_cats', JSON.stringify(cats)); }

let activeCatId = loadCategories()[0].id;
let newCatColor = CAT_PALETTE[0];

function renderCatSelector() {
  const cats = loadCategories();
  const sel = document.getElementById('cat-selector');
  sel.innerHTML = '';
  cats.forEach(cat => {
    const isActive = cat.id === activeCatId;
    const wrap = document.createElement('div');
    wrap.className = 'cat-pill-wrap';

    const btn = document.createElement('button');
    btn.className = 'cat-pill' + (isActive ? ' active' : '');
    btn.textContent = cat.name;
    if (isActive) btn.style.cssText = `background:${cat.color};border-color:${cat.color}`;
    btn.onclick = () => { activeCatId = cat.id; renderCatSelector(); };
    wrap.appendChild(btn);

    if (!isActive && cats.length > 1) {
      const x = document.createElement('button');
      x.className = 'cat-pill-x';
      x.textContent = '×';
      x.title = 'Delete ' + cat.name;
      x.onclick = (e) => {
        e.stopPropagation();
        if (!confirm('Delete "' + cat.name + '"?')) return;
        const updated = loadCategories().filter(c => c.id !== cat.id);
        saveCategories(updated);
        renderCatSelector();
      };
      wrap.appendChild(x);
    }

    sel.appendChild(wrap);
  });
  const manageBtn = document.createElement('button');
  manageBtn.className = 'cat-manage-btn';
  manageBtn.textContent = '+ Add';
  manageBtn.onclick = openCatModal;
  sel.appendChild(manageBtn);
}

function openCatModal() {
  document.getElementById('cat-name-input').value = '';
  newCatColor = CAT_PALETTE[0];
  renderCatModalList();
  renderCatSwatches();
  document.getElementById('cat-modal').classList.add('open');
}
function closeCatModal() { document.getElementById('cat-modal').classList.remove('open'); }

function renderCatModalList() {
  const cats = loadCategories();
  const list = document.getElementById('cat-list');
  list.innerHTML = '';
  cats.forEach(cat => {
    const row = document.createElement('div'); row.className = 'cat-list-row';
    const dot = document.createElement('div'); dot.className = 'cat-dot'; dot.style.background = cat.color;
    const name = document.createElement('span'); name.className = 'cat-list-name'; name.textContent = cat.name;
    const del = document.createElement('button'); del.className = 'cat-del-btn'; del.textContent = '×';
    del.onclick = () => {
      if (cats.length <= 1) return;
      if (!confirm('Delete "' + cat.name + '"?')) return;
      const updated = loadCategories().filter(c => c.id !== cat.id);
      saveCategories(updated);
      if (activeCatId === cat.id) activeCatId = updated[0].id;
      renderCatSelector();
      renderCatModalList();
    };
    row.appendChild(dot); row.appendChild(name); row.appendChild(del);
    list.appendChild(row);
  });
}

function renderCatSwatches() {
  const row = document.getElementById('cat-color-row');
  row.innerHTML = '';
  CAT_PALETTE.forEach(color => {
    const sw = document.createElement('div');
    sw.className = 'cat-swatch' + (color === newCatColor ? ' sel' : '');
    sw.style.background = color;
    sw.onclick = () => { newCatColor = color; renderCatSwatches(); };
    row.appendChild(sw);
  });
}

function addCategory() {
  const name = document.getElementById('cat-name-input').value.trim();
  if (!name) return;
  const cats = loadCategories();
  const id = 'cat_' + Date.now();
  cats.push({ id, name, color: newCatColor });
  saveCategories(cats);
  document.getElementById('cat-name-input').value = '';
  newCatColor = CAT_PALETTE[0];
  renderCatSwatches();
  renderCatModalList();
  renderCatSelector();
}

// ── CHALLENGE ────────────────────────────────────────────────
let chDaysVal = 7;
let chGoalVal = 10;

function loadChallenge() {
  try { return JSON.parse(localStorage.getItem('tc30_challenge') || 'null'); } catch(e) { return null; }
}
function saveChallenge(data) { localStorage.setItem('tc30_challenge', JSON.stringify(data)); }

function effectiveGoal(ch, todayMs) {
  if (!ch) return GOAL;
  const startMs = new Date(ch.startDate).getTime();
  const endMs   = startMs + (ch.days - 1) * 86400000;
  return (todayMs >= startMs && todayMs <= endMs) ? ch.goalHours * 3600 : GOAL;
}

function openChallenge() {
  document.getElementById('challenge-overlay').classList.add('open');
  renderChallengeOverlay();
}
function closeChallenge() {
  document.getElementById('challenge-overlay').classList.remove('open');
  if (challengeChart) { challengeChart.destroy(); challengeChart = null; }
}

function showChallengeForm() {
  document.getElementById('ch-active-view').style.display   = 'none';
  document.getElementById('ch-complete-view').style.display = 'none';
  document.getElementById('ch-form-view').style.display     = 'block';
  document.getElementById('ch-days-val').textContent = chDaysVal;
  document.getElementById('ch-goal-val').textContent = chGoalVal;
}

function renderChallengeOverlay() {
  const ch = loadChallenge();
  if (!ch) { showChallengeForm(); return; }

  const todayMs = new Date(new Date().toDateString()).getTime();
  const startMs = new Date(ch.startDate).getTime();
  const endMs   = startMs + (ch.days - 1) * 86400000;
  const chGoal  = ch.goalHours * 3600;

  if (todayMs > endMs) {
    let daysDone = 0, totalSecs = 0;
    for (let i = 0; i < ch.days; i++) {
      const e = getEntry(new Date(startMs + i * 86400000));
      if (e.total >= chGoal) daysDone++;
      totalSecs += e.total;
    }
    document.getElementById('ch-active-view').style.display   = 'none';
    document.getElementById('ch-form-view').style.display     = 'none';
    document.getElementById('ch-complete-view').style.display = 'block';
    document.getElementById('ch-complete-name').textContent   = ch.name || (ch.days + '-Day Challenge');
    document.getElementById('ch-complete-done').textContent   = daysDone + '/' + ch.days;
    document.getElementById('ch-complete-hours').textContent  = Math.floor(totalSecs / 3600) + 'h';
    return;
  }

  const dayNum   = Math.max(1, Math.floor((todayMs - startMs) / 86400000) + 1);
  const daysLeft = Math.floor((endMs - todayMs) / 86400000);
  let daysDone = 0;
  for (let i = 0; i < ch.days; i++) {
    const dMs = startMs + i * 86400000;
    if (dMs > todayMs) break;
    if (getEntry(new Date(dMs)).total >= chGoal) daysDone++;
  }

  document.getElementById('ch-form-view').style.display     = 'none';
  document.getElementById('ch-complete-view').style.display = 'none';
  document.getElementById('ch-active-view').style.display   = 'block';
  document.getElementById('ch-card-name').textContent  = ch.name || (ch.days + '-Day Challenge');
  document.getElementById('ch-stat-day').textContent   = dayNum;
  document.getElementById('ch-stat-left').textContent  = daysLeft;
  document.getElementById('ch-stat-goal').textContent  = ch.goalHours + 'h';
  document.getElementById('ch-stat-done').textContent  = daysDone + '/' + ch.days;

  const grid = document.getElementById('ch-days-grid');
  grid.innerHTML = '';
  const chartLabels = [], chartData = [], chartColors = [];
  for (let i = 0; i < ch.days; i++) {
    const dMs      = startMs + i * 86400000;
    const isToday  = dMs === todayMs;
    const isFuture = dMs > todayMs;
    const e        = isFuture ? null : getEntry(new Date(dMs));
    const done     = e && e.total >= chGoal;
    const dot = document.createElement('div');
    dot.className = 'ch-dot' + (done ? ' done' : '') + (isToday ? ' today' : '') + (isFuture ? ' future' : '');
    dot.textContent = i + 1;
    grid.appendChild(dot);
    chartLabels.push('Day ' + (i + 1));
    chartData.push(isFuture ? null : +((e ? e.total : 0) / 3600).toFixed(2));
    chartColors.push(done ? 'rgba(200,146,26,0.85)' : 'rgba(200,146,26,0.45)');
  }

  document.getElementById('ch-chart-title').textContent = (ch.name || 'Challenge') + ' — Daily Hours';
  if (challengeChart) { challengeChart.destroy(); challengeChart = null; }
  const chOpts = barChartOptions({ stacked: false, maxRotation: 0, yMax: Math.max(24, ch.goalHours + 2) });
  challengeChart = new Chart(document.getElementById('chart-challenge').getContext('2d'), {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Hours',
        data: chartData,
        backgroundColor: chartColors,
        borderColor: chartColors.map(c => c.replace('0.85', '1').replace('0.45', '0.7')),
        borderWidth: 1, borderRadius: 4, borderSkipped: false,
      }]
    },
    options: chOpts
  });
}

function chAdj(type, delta) {
  if (type === 'days') {
    chDaysVal = Math.max(1, Math.min(90, chDaysVal + delta));
    document.getElementById('ch-days-val').textContent = chDaysVal;
  } else {
    chGoalVal = Math.max(1, Math.min(24, chGoalVal + delta));
    document.getElementById('ch-goal-val').textContent = chGoalVal;
  }
}

function startChallenge() {
  const name = document.getElementById('ch-name-input').value.trim();
  const key  = dateKey(new Date());
  saveChallenge({ name, days: chDaysVal, goalHours: chGoalVal, startDate: key });
  document.getElementById('ch-name-input').value = '';
  renderChallengeOverlay();
  updateUI();
}

function endChallenge() {
  if (!confirm('End this challenge early? This cannot be undone.')) return;
  localStorage.removeItem('tc30_challenge');
  renderChallengeOverlay();
  updateUI();
}

// ── INIT ─────────────────────────────────────────────────────
renderCatSelector();
updateUI();
updateStreakUI();
