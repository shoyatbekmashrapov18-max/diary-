'use strict';

// ===== Настройки =====
const ENTRIES_KEY = 'diary-entries-v1'; // старый ключ — прежние записи сохраняются
const EVENTS_KEY = 'diary-events-v1';
const THEME_KEY = 'diary-theme';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const MOOD_NAMES = ['Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const COLORS = ['violet', 'cyan', 'pink', 'amber', 'green'];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// Маленький помощник: создать элемент с классом и текстом (textContent — безопасно)
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const colorVar = (c) => `var(--c-${COLORS.includes(c) ? c : 'violet'})`;

// ===== Хранилище (localStorage) =====
function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Не удалось сохранить', err);
    toast('Не удалось сохранить');
  }
}

// entries = { "2026-10-27": { text, mood, updatedAt } }
let entries = loadJSON(ENTRIES_KEY, {});
if (typeof entries !== 'object' || Array.isArray(entries)) entries = {};
// events = [{ id, date: "2026-10-27", time: "14:00", end: "15:00", title, color, done }]
let events = loadJSON(EVENTS_KEY, []);
if (!Array.isArray(events)) events = [];

const saveEntries = () => saveJSON(ENTRIES_KEY, entries);
const saveEvents = () => saveJSON(EVENTS_KEY, events);

// ===== Даты =====
function keyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const todayKey = () => keyOf(new Date());
const prettyDate = (key) => { const d = fromKey(key); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
const toMinutes = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');

function eventStart(ev) { const d = fromKey(ev.date); d.setMinutes(toMinutes(ev.time)); return d; }
function eventEnd(ev) {
  const d = fromKey(ev.date);
  d.setMinutes(ev.end && toMinutes(ev.end) > toMinutes(ev.time) ? toMinutes(ev.end) : toMinutes(ev.time) + 60);
  return d;
}
const eventsOn = (key) => events.filter((e) => e.date === key).sort((a, b) => a.time.localeCompare(b.time));

// ===== Состояние экрана =====
let view = new Date(); view.setDate(1);
let selected = todayKey();
let lastDayKey = todayKey();
let selectedColor = 'violet';
let justSaved = null;

// ===== Тема =====
function currentTheme() {
  return document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
} catch { /* без сохранения темы */ }

$('themeBtn').addEventListener('click', (e) => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  const apply = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ок */ }
  };
  // Круг новой темы расходится от кнопки (где поддерживается View Transitions)
  if (document.startViewTransition && !reduceMotion) {
    const r = e.currentTarget.getBoundingClientRect();
    document.documentElement.style.setProperty('--vt-x', `${r.left + r.width / 2}px`);
    document.documentElement.style.setProperty('--vt-y', `${r.top + r.height / 2}px`);
    document.startViewTransition(apply);
  } else {
    apply();
  }
});

// ===== Анимация чисел =====
function animateNumber(node, to, decimals = 0) {
  const from = parseFloat(node.dataset.value || '0');
  node.dataset.value = to;
  if (reduceMotion || from === to) { node.textContent = to.toFixed(decimals); return; }
  const start = performance.now();
  const duration = 900;
  (function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    node.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

// ===== Часы =====
const timeEl = $('time');
function makeDigit() { const s = el('span', 'digit'); s.append(el('span', '', '0')); return s; }
const dH = [makeDigit(), makeDigit()];
const dM = [makeDigit(), makeDigit()];
const dS = [makeDigit(), makeDigit()];
(function buildClock() {
  const secs = el('span', 'secs');
  secs.append(dS[0], dS[1]);
  timeEl.append(dH[0], dH[1], el('span', 'colon', ':'), dM[0], dM[1], secs);
  const ticks = $('ticks');
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 100); line.setAttribute('x2', 100);
    line.setAttribute('y1', big ? 12 : 10); line.setAttribute('y2', big ? 22 : 15);
    line.setAttribute('transform', `rotate(${i * 6} 100 100)`);
    line.setAttribute('class', big ? 'tick big' : 'tick');
    ticks.appendChild(line);
  }
})();

// Цифра «уезжает» вниз, новая «прилетает» сверху
function setDigit(slot, ch) {
  const cur = slot.lastElementChild;
  if (cur && cur.textContent === ch && !cur.classList.contains('d-out')) return;
  if (cur) {
    cur.classList.add('d-out');
    setTimeout(() => cur.remove(), 420);
  }
  slot.append(el('span', 'd-in', ch));
}

function setBar(id, pctId, value) {
  $(id).style.setProperty('--p', `${(value * 100).toFixed(2)}%`);
  $(pctId).textContent = `${Math.floor(value * 100)}%`;
}

function greetingFor(h) {
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

let lastMinute = -1;
function tick() {
  const now = new Date();
  const h = pad(now.getHours()), m = pad(now.getMinutes()), s = pad(now.getSeconds());
  setDigit(dH[0], h[0]); setDigit(dH[1], h[1]);
  setDigit(dM[0], m[0]); setDigit(dM[1], m[1]);
  setDigit(dS[0], s[0]); setDigit(dS[1], s[1]);

  // Обновления раз в минуту
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    $('dateLabel').textContent = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()]} ${now.getFullYear()}`;
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setBar('dayBar', 'dayPct', (now - dayStart) / 864e5);
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    setBar('monthBar', 'monthPct', (now - mStart) / (mEnd - mStart));
    const yStart = new Date(now.getFullYear(), 0, 1);
    const yEnd = new Date(now.getFullYear() + 1, 0, 1);
    setBar('yearBar', 'yearPct', (now - yStart) / (yEnd - yStart));
    $('greeting').textContent = `${greetingFor(now.getHours())}! Как проходит день?`;

    // Наступила полночь — переключаемся на новый день
    if (todayKey() !== lastDayKey) {
      if (selected === lastDayKey) selected = todayKey();
      lastDayKey = todayKey();
      renderAll();
    } else {
      renderUpcoming();
      renderDayEvents();
    }
  }
}

// Плавные стрелки аналоговых часов
function animateHands() {
  const now = new Date();
  const ms = now.getMilliseconds();
  const sec = now.getSeconds() + ms / 1000;
  const min = now.getMinutes() + sec / 60;
  const hour = (now.getHours() % 12) + min / 60;
  $('secHand').setAttribute('transform', `rotate(${sec * 6} 100 100)`);
  $('minHand').setAttribute('transform', `rotate(${min * 6} 100 100)`);
  $('hourHand').setAttribute('transform', `rotate(${hour * 30} 100 100)`);
  $('secRing').style.strokeDasharray = `${sec} 60`;
  requestAnimationFrame(animateHands);
}

try {
  $('tzLabel').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ');
} catch { /* без пояса */ }

// ===== Статистика =====
function streak() {
  const d = new Date();
  if (!entries[keyOf(d)]) d.setDate(d.getDate() - 1);
  let count = 0;
  while (entries[keyOf(d)]) { count++; d.setDate(d.getDate() - 1); }
  return count;
}

function lastDays(n) {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) { out.push(keyOf(d)); d.setDate(d.getDate() + 1); }
  return out;
}

function renderStats() {
  const s = streak();
  animateNumber($('streakNum'), s);
  $('streakCard').classList.toggle('hot', s >= 3);

  const prefix = todayKey().slice(0, 7);
  animateNumber($('monthNum'), Object.keys(entries).filter((k) => k.startsWith(prefix)).length);

  const moods = lastDays(30).map((k) => entries[k]?.mood).filter((m) => m != null);
  const avgEl = $('avgMood');
  if (moods.length) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    avgEl.textContent = MOODS[Math.round(avg)];
    avgEl.title = `${(avg + 1).toFixed(1)} из 5`;
  } else {
    avgEl.textContent = '—';
  }

  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 864e5);
  animateNumber($('weekEvents'), events.filter((e) => eventEnd(e) > now && eventStart(e) < weekLater).length);
}

// ===== Ближайшие встречи =====
function relativeWhen(ev, now) {
  const start = eventStart(ev);
  if (start <= now && eventEnd(ev) > now) return 'сейчас';
  const diffMin = Math.round((start - now) / 60000);
  if (diffMin < 60) return `через ${diffMin} мин`;
  const startDay = fromKey(ev.date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startDay - today) / 864e5);
  if (days === 0) return `через ${Math.floor(diffMin / 60)} ч ${diffMin % 60 ? `${diffMin % 60} мин` : ''}`.trim();
  if (days === 1) return `завтра, ${ev.time}`;
  if (days < 7) return `${WD_SHORT[startDay.getDay()]}, ${ev.time}`;
  return `${prettyDate(ev.date)}`;
}

function renderUpcoming() {
  const list = $('upcomingList');
  list.innerHTML = '';
  const now = new Date();
  const upcoming = events
    .filter((e) => !e.done && eventEnd(e) > now)
    .sort((a, b) => eventStart(a) - eventStart(b));
  $('upcomingCount').textContent = upcoming.length ? `${upcoming.length}` : '';

  if (!upcoming.length) {
    const li = el('li', 'empty');
    li.append(el('b', '', '☕'), 'Встреч не запланировано. Выберите день в календаре и добавьте встречу.');
    list.appendChild(li);
    return;
  }

  upcoming.slice(0, 5).forEach((ev, i) => {
    const when = relativeWhen(ev, now);
    const li = el('li', `up-item${when === 'сейчас' ? ' now' : ''}`);
    li.style.setProperty('--i', i);
    li.style.setProperty('--c', colorVar(ev.color));
    li.tabIndex = 0;
    const body = el('div');
    body.style.minWidth = '0';
    body.append(el('div', 't', ev.title), el('div', 's', `${prettyDate(ev.date)} · ${ev.time}${ev.end ? `–${ev.end}` : ''}`));
    li.append(el('span', 'stripe'), body, el('span', 'when', when));
    const go = () => selectDay(ev.date, true);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    list.appendChild(li);
  });
}

// ===== Календарь =====
const grid = $('grid');

function renderCalendar(dir = 0) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const tKey = todayKey();

  const title = $('monthLabel');
  if (title.textContent !== MONTHS[month]) {
    title.textContent = MONTHS[month];
    title.classList.remove('swap'); void title.offsetWidth; title.classList.add('swap');
  }
  $('yearLabel').textContent = year;

  grid.innerHTML = '';
  grid.classList.remove('enter');
  if (dir !== 0 && !reduceMotion) {
    grid.style.setProperty('--dir', dir);
    void grid.offsetWidth;
    grid.classList.add('enter');
  }

  // Неделя с понедельника; показываем хвосты соседних месяцев, всего 6 недель
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);

  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = keyOf(date);
    const entry = entries[key];
    const dayEvents = eventsOn(key);

    const btn = el('button', 'day ripple');
    btn.style.setProperty('--i', i);
    if (date.getMonth() !== month) btn.classList.add('other');
    if (key === tKey) btn.classList.add('today');
    if (key === selected) btn.classList.add('selected');
    if (entry) btn.classList.add('has-entry');
    if (key === justSaved) btn.classList.add('pop');

    const label = [`${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`];
    if (entry?.mood != null) label.push(`настроение: ${MOOD_NAMES[entry.mood]}`);
    if (dayEvents.length) label.push(`встреч: ${dayEvents.length}`);
    btn.setAttribute('aria-label', label.join(', '));
    btn.title = dayEvents.map((e) => `${e.time} ${e.title}`).join('\n');

    const mark = el('span', 'mood-mark', entry ? (entry.mood != null ? MOODS[entry.mood] : '✎') : '');
    const dots = el('span', 'dots');
    dayEvents.slice(0, 3).forEach((ev) => {
      const dot = el('i');
      dot.style.setProperty('--c', colorVar(ev.color));
      dots.appendChild(dot);
    });

    btn.append(el('span', 'num', date.getDate()), mark, dots);
    btn.addEventListener('click', () => selectDay(key));
    grid.appendChild(btn);
  }
  justSaved = null;
}

function changeMonth(step) {
  view.setMonth(view.getMonth() + step);
  renderCalendar(step);
}

function goToday() {
  const now = new Date();
  const dir = Math.sign((now.getFullYear() - view.getFullYear()) * 12 + now.getMonth() - view.getMonth());
  view = new Date(now.getFullYear(), now.getMonth(), 1);
  selectDay(todayKey());
  if (dir) renderCalendar(dir);
}

// Выбрать день: календарь переключится на его месяц, панель дня обновится
function selectDay(key, scroll = false) {
  flushEntry();
  const d = fromKey(key);
  const dir = Math.sign((d.getFullYear() - view.getFullYear()) * 12 + d.getMonth() - view.getMonth());
  const changed = key !== selected;
  selected = key;
  if (dir) view = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar(dir);
  if (changed) renderDay(true);
  if (scroll) document.querySelector('.w-day').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

// ===== Панель выбранного дня =====
const entryText = $('entryText');
const moodsBox = $('moods');
let saveTimer = null;

function renderDay(animate = false) {
  const d = fromKey(selected);
  const tKey = todayKey();
  const isFuture = selected > tKey;

  const title = $('dayTitle');
  title.textContent = prettyDate(selected);
  $('dayWeekday').textContent = `${WEEKDAYS[d.getDay()]}, ${d.getFullYear()}`;

  const diff = Math.round((d - fromKey(tKey)) / 864e5);
  $('dayBadge').textContent = diff === 0 ? 'Сегодня' : diff === -1 ? 'Вчера' : diff === 1 ? 'Завтра' :
    diff > 0 ? `через ${diff} дн.` : `${-diff} дн. назад`;

  if (animate && !reduceMotion) {
    const cols = document.querySelector('.day-cols');
    for (const n of [title, cols]) { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }
  }

  const entry = entries[selected];
  entryText.value = entry?.text || '';
  entryText.disabled = isFuture;
  entryText.placeholder = isFuture
    ? 'Этот день ещё не наступил — запись можно будет сделать потом. А вот встречи добавлять можно уже сейчас →'
    : 'Что сегодня было? Мысли, события, мелочи…';
  $('deleteBtn').hidden = !entry;
  updateCharCount();
  $('saveState').classList.remove('show');
  renderMoods();
  renderDayEvents();
}

function renderMoods() {
  moodsBox.innerHTML = '';
  const mood = entries[selected]?.mood ?? null;
  const isFuture = selected > todayKey();
  moodsBox.classList.toggle('has-choice', mood != null);
  MOODS.forEach((emoji, i) => {
    const b = el('button', mood === i ? 'active' : '', emoji);
    b.title = MOOD_NAMES[i];
    b.disabled = isFuture;
    b.setAttribute('aria-pressed', String(mood === i));
    b.addEventListener('click', () => {
      const cur = entries[selected]?.mood ?? null;
      const next = cur === i ? null : i;
      updateEntry({ mood: next });
      if (next != null) burst(b, emoji);
      renderMoods();
    });
    moodsBox.appendChild(b);
  });
}

function updateCharCount() {
  const n = entryText.value.trim().length;
  $('charCount').textContent = n ? `${n} симв.` : '';
}

// Изменить запись выбранного дня; пустая запись удаляется
function updateEntry(patch) {
  const cur = entries[selected] || { text: '', mood: null };
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  const hadEntry = Boolean(entries[selected]);
  if (!next.text && next.mood == null) delete entries[selected];
  else entries[selected] = next;
  if (!hadEntry && entries[selected]) justSaved = selected;
  saveEntries();
  $('deleteBtn').hidden = !entries[selected];
  showSaved();
  renderCalendar();
  renderStats();
  renderChart();
  renderRecent();
}

function showSaved() {
  const s = $('saveState');
  s.textContent = '✓ сохранено';
  s.classList.add('show');
  clearTimeout(showSaved.t);
  showSaved.t = setTimeout(() => s.classList.remove('show'), 1800);
}

// Автосохранение текста через полсекунды после последнего нажатия
entryText.addEventListener('input', () => {
  updateCharCount();
  const s = $('saveState');
  s.textContent = 'сохраняю…';
  s.classList.add('show');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushEntry, 500);
});
entryText.addEventListener('blur', flushEntry);

function flushEntry() {
  if (saveTimer == null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const text = entryText.value.trim();
  if ((entries[selected]?.text || '') !== text) updateEntry({ text });
}

$('deleteBtn').addEventListener('click', () => {
  if (!entries[selected]) return;
  if (!confirm(`Удалить запись за ${prettyDate(selected)}?`)) return;
  clearTimeout(saveTimer); saveTimer = null;
  delete entries[selected];
  saveEntries();
  renderAll();
  toast('Запись удалена');
});

// ===== Встречи выбранного дня =====
function renderDayEvents() {
  const list = $('eventList');
  list.innerHTML = '';
  const dayEvents = eventsOn(selected);
  const now = new Date();

  if (!dayEvents.length) {
    const li = el('li', 'empty');
    li.append(el('b', '', '🗓️'), 'На этот день ничего нет');
    list.appendChild(li);
    return;
  }

  dayEvents.forEach((ev, i) => {
    const li = el('li', 'ev-item');
    li.style.setProperty('--i', i);
    li.style.setProperty('--c', colorVar(ev.color));
    const isNow = eventStart(ev) <= now && eventEnd(ev) > now;
    if (eventEnd(ev) <= now) li.classList.add('past');
    if (ev.done) li.classList.add('done');

    const check = el('button', 'ev-check', ev.done ? '✓' : '');
    check.setAttribute('aria-label', ev.done ? 'Отметить как не выполненное' : 'Отметить как выполненное');
    check.addEventListener('click', () => {
      ev.done = !ev.done;
      saveEvents();
      renderDayEvents(); renderUpcoming(); renderStats();
    });

    const body = el('div');
    const title = el('div', 'ev-title', ev.title);
    if (isNow) title.append(el('span', 'ev-now', 'сейчас'));
    body.append(el('div', 'ev-time', ev.end ? `${ev.time} – ${ev.end}` : ev.time), title);

    const del = el('button', 'ev-del', '✕');
    del.setAttribute('aria-label', `Удалить «${ev.title}»`);
    del.addEventListener('click', () => {
      li.classList.add('removing');
      setTimeout(() => {
        events = events.filter((e) => e.id !== ev.id);
        saveEvents();
        renderCalendar(); renderDayEvents(); renderUpcoming(); renderStats();
        toast('Встреча удалена');
      }, reduceMotion ? 0 : 320);
    });

    li.append(check, body, del);
    list.appendChild(li);
  });
}

// Выбор цвета встречи
(function buildColors() {
  const box = $('colorPick');
  COLORS.forEach((c) => {
    const b = el('button');
    b.type = 'button';
    b.style.setProperty('--c', colorVar(c));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', c);
    b.setAttribute('aria-checked', String(c === selectedColor));
    b.addEventListener('click', () => {
      selectedColor = c;
      box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    box.appendChild(b);
  });
})();

function defaultTime() {
  const now = new Date();
  return `${pad(Math.min(now.getHours() + 1, 23))}:00`;
}
$('evTime').value = defaultTime();

$('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const titleInput = $('evTitle');
  const title = titleInput.value.trim();
  const time = $('evTime').value;
  const end = $('evEnd').value;
  if (!title || !time) {
    const bad = !title ? titleInput : $('evTime');
    bad.classList.remove('shake'); void bad.offsetWidth; bad.classList.add('shake');
    bad.focus();
    return;
  }
  events.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: selected,
    time,
    end: end && end > time ? end : '',
    title,
    color: selectedColor,
    done: false,
  });
  saveEvents();
  titleInput.value = '';
  $('evEnd').value = '';
  justSaved = selected;
  renderCalendar(); renderDayEvents(); renderUpcoming(); renderStats();
  toast('Встреча добавлена');
});

// ===== График настроения =====
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// Плавная кривая через точки (Catmull-Rom → кривые Безье)
function smoothPath(pts) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

let chartPoints = [];
function renderChart() {
  const wrap = $('chartWrap');
  const chart = $('chart');
  chart.innerHTML = '';
  chart.classList.remove('drawn');
  wrap.querySelector('.chart-empty')?.remove();

  const W = wrap.clientWidth || 600;
  const H = wrap.clientHeight || 230;
  chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const padL = 34, padR = 12, padT = 16, padB = 26;
  const days = lastDays(30);
  const x = (i) => padL + (i * (W - padL - padR)) / (days.length - 1);
  const y = (m) => padT + ((4 - m) * (H - padT - padB)) / 4;

  const defs = svg('defs');
  const lg = svg('linearGradient', { id: 'lineGrad', x1: 0, y1: 0, x2: 1, y2: 0 });
  lg.append(svg('stop', { offset: 0, style: 'stop-color:var(--accent-2)' }),
    svg('stop', { offset: 0.5, style: 'stop-color:var(--accent)' }),
    svg('stop', { offset: 1, style: 'stop-color:var(--accent-3)' }));
  const ag = svg('linearGradient', { id: 'areaGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  ag.append(svg('stop', { offset: 0, style: 'stop-color:var(--accent);stop-opacity:0.35' }),
    svg('stop', { offset: 1, style: 'stop-color:var(--accent);stop-opacity:0' }));
  defs.append(lg, ag);
  chart.appendChild(defs);

  // Сетка и подписи
  for (let m = 0; m <= 4; m++) {
    chart.appendChild(svg('line', { class: 'gridline', x1: padL, x2: W - padR, y1: y(m), y2: y(m) }));
    const t = svg('text', { class: 'ylabel', x: 4, y: y(m) + 5 });
    t.textContent = MOODS[m];
    chart.appendChild(t);
  }
  days.forEach((k, i) => {
    if (i % 5 !== 4 && i !== 0) return;
    const t = svg('text', { class: 'xlabel', x: x(i), y: H - 4, 'text-anchor': 'middle' });
    t.textContent = prettyDate(k).replace(/(\d+) (\S{3})\S*/, '$1 $2');
    chart.appendChild(t);
  });

  chartPoints = days.map((k, i) => ({ key: k, i, x: x(i), mood: entries[k]?.mood ?? null }))
    .filter((p) => p.mood != null)
    .map((p) => ({ ...p, y: y(p.mood) }));

  const moods = chartPoints.map((p) => p.mood);
  if (moods.length) {
    const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
    $('chartSummary').textContent = `в среднем ${MOODS[Math.round(avg)]} · ${moods.length} дн.`;
  } else {
    $('chartSummary').textContent = '';
  }

  if (chartPoints.length < 2) {
    const empty = el('div', 'chart-empty', 'Отмечайте настроение хотя бы пару дней — здесь появится график 📈');
    wrap.appendChild(empty);
    return;
  }

  const d = smoothPath(chartPoints);
  const last = chartPoints[chartPoints.length - 1];
  chart.appendChild(svg('path', { class: 'area', d: `${d} L${last.x},${H - padB} L${chartPoints[0].x},${H - padB} Z` }));
  const line = svg('path', { class: 'line', d });
  chart.appendChild(line);
  chart.appendChild(svg('line', { class: 'cursor', id: 'chartCursor', y1: padT, y2: H - padB, x1: 0, x2: 0 }));
  chartPoints.forEach((p, i) => {
    const c = svg('circle', { class: 'pt', cx: p.x, cy: p.y, r: 5 });
    c.style.setProperty('--i', i);
    p.node = c;
    chart.appendChild(c);
  });

  // Линия «рисуется» слева направо
  const len = line.getTotalLength();
  line.style.strokeDasharray = len;
  line.style.strokeDashoffset = reduceMotion ? 0 : len;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    line.style.strokeDashoffset = 0;
    chart.classList.add('drawn');
  }));
}

// Подсказка при наведении на график
(function chartHover() {
  const wrap = $('chartWrap');
  const tip = $('chartTip');
  let active = null;
  wrap.addEventListener('pointermove', (e) => {
    if (chartPoints.length < 2) return;
    const r = wrap.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = chartPoints[0];
    for (const p of chartPoints) if (Math.abs(p.x - px) < Math.abs(best.x - px)) best = p;
    if (active !== best) {
      active?.node.classList.remove('hover');
      best.node.classList.add('hover');
      active = best;
      const text = entries[best.key]?.text;
      tip.textContent = '';
      tip.append(`${MOODS[best.mood]} ${MOOD_NAMES[best.mood]}`,
        el('small', '', `${prettyDate(best.key)}${text ? ' · ' + (text.length > 34 ? text.slice(0, 34) + '…' : text) : ''}`));
    }
    tip.style.left = `${best.x}px`;
    tip.style.top = `${best.y}px`;
    tip.classList.add('show');
    const cur = $('chartCursor');
    cur?.setAttribute('x1', best.x); cur?.setAttribute('x2', best.x); cur?.classList.add('show');
  });
  wrap.addEventListener('pointerleave', () => {
    tip.classList.remove('show');
    active?.node.classList.remove('hover');
    active = null;
    $('chartCursor')?.classList.remove('show');
  });
  wrap.addEventListener('click', () => { if (active) selectDay(active.key, true); });
})();

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 200); });

// ===== Последние записи и поиск =====
const searchInput = $('searchInput');

function highlight(text, q) {
  const frag = document.createDocumentFragment();
  if (!q) { frag.append(text); return frag; }
  const lower = text.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(q);
  // Начинаем показ чуть до первого совпадения, чтобы оно было видно
  if (idx > 24) { i = idx - 20; frag.append('…'); }
  while (idx !== -1) {
    frag.append(text.slice(i, idx));
    frag.append(el('mark', '', text.slice(idx, idx + q.length)));
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  frag.append(text.slice(i));
  return frag;
}

function renderRecent() {
  const list = $('recentList');
  list.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  let keys = Object.keys(entries).sort().reverse();
  if (q) keys = keys.filter((k) => (entries[k].text || '').toLowerCase().includes(q) || prettyDate(k).includes(q));

  $('recentTitle').textContent = q ? 'Результаты поиска' : 'Последние записи';
  $('recentCount').textContent = keys.length ? `${keys.length}` : '';

  if (!keys.length) {
    const li = el('li', 'empty');
    li.append(el('b', '', q ? '🔍' : '✍️'), q ? 'Ничего не нашлось' : 'Пока пусто. Выберите сегодняшний день и напишите первую запись.');
    list.appendChild(li);
    return;
  }

  keys.slice(0, q ? 50 : 20).forEach((key, i) => {
    const entry = entries[key];
    const li = el('li');
    li.style.setProperty('--i', Math.min(i, 10));
    const btn = el('button');
    const body = el('div');
    body.style.minWidth = '0';
    const textEl = el('div', 'rec-text');
    textEl.append(highlight(entry.text || 'Без текста', q));
    body.append(el('div', 'rec-date', `${prettyDate(key)}, ${WD_SHORT[fromKey(key).getDay()]}`), textEl);
    btn.append(el('span', 'rec-mood', entry.mood != null ? MOODS[entry.mood] : '📝'), body, el('span', 'chev', '›'));
    btn.addEventListener('click', () => selectDay(key, true));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
searchInput.addEventListener('input', renderRecent);

// ===== Экспорт / импорт резервной копии =====
$('exportBtn').addEventListener('click', () => {
  const data = { app: 'diary', version: 2, exportedAt: new Date().toISOString(), entries, events };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diary-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Резервная копия скачана');
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    // Поддерживаем и новый формат, и «голый» объект записей из старой версии
    const inEntries = data.entries && typeof data.entries === 'object' ? data.entries : (data.version ? {} : data);
    const inEvents = Array.isArray(data.events) ? data.events : [];
    let added = 0;
    for (const [k, v] of Object.entries(inEntries)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') {
        entries[k] = { text: String(v.text || ''), mood: Number.isInteger(v.mood) && v.mood >= 0 && v.mood < 5 ? v.mood : null, updatedAt: v.updatedAt || Date.now() };
        added++;
      }
    }
    const ids = new Set(events.map((x) => x.id));
    for (const ev of inEvents) {
      if (ev && /^\d{4}-\d{2}-\d{2}$/.test(ev.date) && /^\d{2}:\d{2}$/.test(ev.time) && ev.title && !ids.has(ev.id)) {
        events.push({ id: String(ev.id || Math.random().toString(36).slice(2)), date: ev.date, time: ev.time,
          end: /^\d{2}:\d{2}$/.test(ev.end) ? ev.end : '', title: String(ev.title).slice(0, 80),
          color: COLORS.includes(ev.color) ? ev.color : 'violet', done: Boolean(ev.done) });
        added++;
      }
    }
    saveEntries(); saveEvents();
    renderAll();
    toast(`Импортировано: ${added}`);
  } catch (err) {
    console.error(err);
    toast('Не удалось прочитать файл');
  }
});

// ===== Уведомление =====
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ===== Эффекты =====
// Взрыв эмодзи при выборе настроения
function burst(origin, emoji) {
  if (reduceMotion) return;
  const r = origin.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 10; i++) {
    const p = el('span', 'particle', emoji);
    document.body.appendChild(p);
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
    const dist = 60 + Math.random() * 60;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist - 30;
    p.animate([
      { transform: `translate(${cx - 11}px, ${cy - 11}px) scale(0.4)`, opacity: 1 },
      { transform: `translate(${cx - 11 + dx}px, ${cy - 11 + dy}px) scale(1.1) rotate(${(Math.random() - 0.5) * 120}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${cx - 11 + dx * 1.2}px, ${cy - 11 + dy + 40}px) scale(0.6)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }).onfinish = () => p.remove();
  }
}

// Волна-«чернила» при нажатии на кнопки
document.addEventListener('pointerdown', (e) => {
  if (reduceMotion) return;
  const target = e.target.closest('.ripple');
  if (!target || target.disabled) return;
  const r = target.getBoundingClientRect();
  const ink = el('span', 'ripple-ink');
  ink.style.left = `${e.clientX - r.left}px`;
  ink.style.top = `${e.clientY - r.top}px`;
  target.appendChild(ink);
  setTimeout(() => ink.remove(), 650);
});

// Подсветка карточек под курсором + лёгкий 3D-наклон + свечение за курсором
const widgets = [...document.querySelectorAll('.w')];
widgets.forEach((w) => {
  w.addEventListener('animationend', (e) => { if (e.target === w) w.classList.add('ready'); });
});
const glow = $('cursorGlow');
let gx = -999, gy = -999, tx = -999, ty = -999;
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  tx = e.clientX; ty = e.clientY;
  const w = e.target.closest?.('.w');
  if (!w) return;
  const r = w.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  w.style.setProperty('--mx', `${mx}px`);
  w.style.setProperty('--my', `${my}px`);
  if (w.hasAttribute('data-tilt') && !reduceMotion) {
    w.style.setProperty('--ry', `${((mx / r.width) - 0.5) * 5}deg`);
    w.style.setProperty('--rx', `${(0.5 - (my / r.height)) * 5}deg`);
  }
});
document.querySelectorAll('[data-tilt]').forEach((w) => {
  w.addEventListener('pointerleave', () => { w.style.setProperty('--rx', '0deg'); w.style.setProperty('--ry', '0deg'); });
});
(function followGlow() {
  if (reduceMotion) return;
  if (gx === -999) { gx = tx; gy = ty; }
  gx += (tx - gx) * 0.12;
  gy += (ty - gy) * 0.12;
  glow.style.setProperty('--gx', `${gx}px`);
  glow.style.setProperty('--gy', `${gy}px`);
  requestAnimationFrame(followGlow);
})();

// ===== Клавиатура =====
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if (e.key === 'Escape' && typing) { document.activeElement.blur(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
  else if (e.key === 'ArrowLeft') changeMonth(-1);
  else if (e.key === 'ArrowRight') changeMonth(1);
  else if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') goToday();
});

$('prevBtn').addEventListener('click', () => changeMonth(-1));
$('nextBtn').addEventListener('click', () => changeMonth(1));
$('todayBtn').addEventListener('click', goToday);

// ===== Старт =====
function renderAll() {
  renderCalendar();
  renderDay();
  renderStats();
  renderUpcoming();
  renderRecent();
  renderChart();
}

renderCalendar(1);
renderDay();
renderStats();
renderUpcoming();
renderRecent();
tick();
setInterval(tick, 1000);
requestAnimationFrame(animateHands);
// График рисуем, когда карточка уже появилась
setTimeout(renderChart, reduceMotion ? 0 : 450);
