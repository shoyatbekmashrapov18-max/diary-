// ===== Настройки =====
const STORAGE_KEY = 'diary-entries-v1';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ===== Элементы страницы =====
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const sheet = $('sheet');
const backdrop = $('backdrop');
const entryText = $('entryText');
const moodsBox = $('moods');

// Без этой строки iOS Safari не показывает :active-анимацию при касании
document.addEventListener('touchstart', () => {}, { passive: true });

// ===== Состояние =====
// entries = { "2026-10-27": { text: "...", mood: 3, updatedAt: 1730000000000 } }
let entries = load();
let view = new Date();
view.setDate(1);
let selectedKey = null;
let selectedMood = null;
let justSaved = null; // день, который нужно «подбросить» после сохранения

// ===== Хранилище (localStorage в браузере) =====
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Не удалось сохранить', err);
  }
}

// ===== Даты =====
// Ключ дня в формате YYYY-MM-DD (в местном времени, без сдвигов UTC)
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

function prettyDate(key) {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

// ===== Счётчик серии: сколько дней подряд есть записи =====
function streak() {
  const d = new Date();
  // Если сегодня ещё не писали — серия не сгорает, считаем со вчера
  if (!entries[keyOf(d)]) d.setDate(d.getDate() - 1);
  let count = 0;
  while (entries[keyOf(d)]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

// ===== Анимация чисел: плавно «докручивает» от старого значения к новому =====
function animateNumber(el, to) {
  const from = Number(el.textContent) || 0;
  if (from === to) return;
  const duration = 500;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ===== Отрисовка календаря =====
// dir: -1 (листаем назад), 1 (вперёд), 0 (без анимации появления)
function renderCalendar(dir = 0) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const todayKey = keyOf(new Date());

  const title = $('monthLabel');
  if (title.textContent !== MONTHS[month]) {
    title.textContent = MONTHS[month];
    title.classList.remove('swap');
    void title.offsetWidth; // перезапуск анимации
    title.classList.add('swap');
  }
  $('yearLabel').textContent = year;
  grid.innerHTML = '';

  // Анимация «волны» дней при смене месяца
  grid.classList.remove('enter');
  if (dir !== 0) {
    grid.style.setProperty('--dir', dir);
    void grid.offsetWidth;
    grid.classList.add('enter');
  }

  // Сдвиг, чтобы неделя начиналась с понедельника
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement('span');
    blank.className = 'blank';
    blank.style.setProperty('--i', i);
    grid.appendChild(blank);
  }

  let monthCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = keyOf(new Date(year, month, day));
    const entry = entries[key];

    const btn = document.createElement('button');
    btn.className = 'day tap';
    btn.style.setProperty('--i', offset + day);
    btn.setAttribute('aria-label', prettyDate(key));

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = day;

    const mark = document.createElement('span');
    mark.className = 'mark';

    if (key === todayKey) btn.classList.add('today');

    if (key > todayKey) {
      // Будущие дни нельзя заполнять
      btn.classList.add('future');
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => openSheet(key));
    }

    if (entry) {
      btn.classList.add('has-entry');
      mark.textContent = entry.mood != null ? MOODS[entry.mood] : '•';
      monthCount++;
    }

    if (key === justSaved) btn.classList.add('pop');

    btn.append(num, mark);
    grid.appendChild(btn);
  }
  justSaved = null;

  const s = streak();
  animateNumber($('monthNum'), monthCount);
  animateNumber($('streakNum'), s);
  $('streakCard').classList.toggle('hot', s >= 3);
}

function changeMonth(step) {
  view.setMonth(view.getMonth() + step);
  renderCalendar(step);
}

// ===== Последние записи =====
function renderRecent() {
  const list = $('recentList');
  list.innerHTML = '';

  const keys = Object.keys(entries).sort().reverse().slice(0, 5);

  if (keys.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Пока пусто. Нажмите на сегодняшний день, чтобы сделать первую запись.';
    list.appendChild(li);
    return;
  }

  keys.forEach((key, i) => {
    const entry = entries[key];
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const btn = document.createElement('button');

    const mood = document.createElement('span');
    mood.className = 'mood';
    mood.textContent = entry.mood != null ? MOODS[entry.mood] : '📝';

    const body = document.createElement('div');
    body.className = 'body';
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = prettyDate(key);
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = entry.text || 'Без текста';
    body.append(date, preview);

    const chev = document.createElement('span');
    chev.className = 'chev';
    chev.textContent = '›';

    btn.append(mood, body, chev);
    btn.addEventListener('click', () => openSheet(key));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function render(dir = 0) {
  renderCalendar(dir);
  renderRecent();
}

// ===== Уведомление внизу экрана =====
let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// Лёгкая вибрация на телефонах, где это поддерживается (Android)
function buzz(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ===== Панель записи =====
function renderMoods() {
  moodsBox.innerHTML = '';
  moodsBox.classList.toggle('has-choice', selectedMood != null);
  MOODS.forEach((emoji, i) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.setAttribute('aria-pressed', String(selectedMood === i));
    if (selectedMood === i) b.classList.add('active');
    b.addEventListener('click', () => {
      // Повторное нажатие снимает выбор
      selectedMood = selectedMood === i ? null : i;
      buzz();
      renderMoods();
    });
    moodsBox.appendChild(b);
  });
}

function openSheet(key) {
  selectedKey = key;
  const entry = entries[key];
  selectedMood = entry ? entry.mood : null;
  entryText.value = entry ? entry.text : '';
  $('sheetTitle').textContent = prettyDate(key);
  $('deleteBtn').hidden = !entry;
  renderMoods();
  sheet.style.setProperty('--drag', '0px');
  sheet.classList.add('open');
  backdrop.classList.add('open');
  document.body.classList.add('sheet-open');
  setTimeout(() => entryText.focus({ preventScroll: true }), 400);
}

function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.classList.remove('sheet-open');
  sheet.style.setProperty('--drag', '0px');
  entryText.blur();
  selectedKey = null;
}

function saveEntry() {
  const text = entryText.value.trim();
  if (!text && selectedMood == null) {
    delete entries[selectedKey]; // пустая запись = удалить
  } else {
    entries[selectedKey] = { text, mood: selectedMood, updatedAt: Date.now() };
    justSaved = selectedKey;
  }
  save();
  closeSheet();
  render();
  buzz(15);
  toast('Сохранено');
}

function deleteEntry() {
  delete entries[selectedKey];
  save();
  closeSheet();
  render();
  toast('Запись удалена');
}

// ===== Свайп по календарю: влево — следующий месяц, вправо — предыдущий =====
const calendar = $('calendar');
let swipeStart = null;
let swiped = false;

calendar.addEventListener('pointerdown', (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
  swiped = false;
});
calendar.addEventListener('pointerup', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    swiped = true;
    buzz();
    changeMonth(dx < 0 ? 1 : -1);
  }
});
calendar.addEventListener('pointercancel', () => { swipeStart = null; });
// Если это был свайп, не открываем день, на котором отпустили палец
calendar.addEventListener('click', (e) => {
  if (swiped) {
    e.stopPropagation();
    e.preventDefault();
    swiped = false;
  }
}, true);

// ===== Панель можно потянуть вниз, чтобы закрыть =====
const dragZone = $('dragZone');
let dragStartY = null;
let dragDy = 0;

dragZone.addEventListener('pointerdown', (e) => {
  dragStartY = e.clientY;
  dragDy = 0;
  sheet.classList.add('dragging');
  dragZone.setPointerCapture(e.pointerId);
});
dragZone.addEventListener('pointermove', (e) => {
  if (dragStartY == null) return;
  const dy = e.clientY - dragStartY;
  // Вверх тянется туго (как резинка), вниз — свободно
  dragDy = dy > 0 ? dy : dy / 4;
  sheet.style.setProperty('--drag', dragDy + 'px');
});
function endDrag() {
  if (dragStartY == null) return;
  dragStartY = null;
  sheet.classList.remove('dragging');
  if (dragDy > 110) closeSheet();
  else sheet.style.setProperty('--drag', '0px');
}
dragZone.addEventListener('pointerup', endDrag);
dragZone.addEventListener('pointercancel', endDrag);

// ===== События =====
$('prevBtn').addEventListener('click', () => changeMonth(-1));
$('nextBtn').addEventListener('click', () => changeMonth(1));
$('todayBtn').addEventListener('click', () => {
  const now = new Date();
  const dir = Math.sign((now.getFullYear() - view.getFullYear()) * 12 + now.getMonth() - view.getMonth());
  view = now;
  view.setDate(1);
  renderCalendar(dir);
});
$('saveBtn').addEventListener('click', saveEntry);
$('cancelBtn').addEventListener('click', closeSheet);
$('deleteBtn').addEventListener('click', deleteEntry);
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (!selectedKey) {
    if (e.key === 'ArrowLeft') changeMonth(-1);
    if (e.key === 'ArrowRight') changeMonth(1);
    return;
  }
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEntry();
});

// ===== Старт: при загрузке дни появляются волной =====
render(1);
