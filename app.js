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

// ===== Состояние =====
// entries = { "2026-10-27": { text: "...", mood: 3, updatedAt: 1730000000000 } }
let entries = load();
let view = new Date();
view.setDate(1);
let selectedKey = null;
let selectedMood = null;

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

// ===== Отрисовка календаря =====
function renderCalendar() {
  const year = view.getFullYear();
  const month = view.getMonth();
  const todayKey = keyOf(new Date());

  $('monthLabel').textContent = MONTHS[month];
  $('yearLabel').textContent = year;
  grid.innerHTML = '';

  // Сдвиг, чтобы неделя начиналась с понедельника
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement('span'));
  }

  let monthCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = keyOf(new Date(year, month, day));
    const entry = entries[key];

    const btn = document.createElement('button');
    btn.className = 'day';
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

    btn.append(num, mark);
    grid.appendChild(btn);
  }

  $('monthNum').textContent = monthCount;
  $('streakNum').textContent = streak();
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

  for (const key of keys) {
    const entry = entries[key];
    const li = document.createElement('li');
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

    btn.append(mood, body);
    btn.addEventListener('click', () => openSheet(key));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

function render() {
  renderCalendar();
  renderRecent();
}

// ===== Панель записи =====
function renderMoods() {
  moodsBox.innerHTML = '';
  MOODS.forEach((emoji, i) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.setAttribute('aria-pressed', String(selectedMood === i));
    if (selectedMood === i) b.classList.add('active');
    b.addEventListener('click', () => {
      // Повторное нажатие снимает выбор
      selectedMood = selectedMood === i ? null : i;
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
  sheet.classList.add('open');
  backdrop.classList.add('open');
  setTimeout(() => entryText.focus(), 300);
}

function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  selectedKey = null;
}

function saveEntry() {
  const text = entryText.value.trim();
  if (!text && selectedMood == null) {
    delete entries[selectedKey]; // пустая запись = удалить
  } else {
    entries[selectedKey] = { text, mood: selectedMood, updatedAt: Date.now() };
  }
  save();
  closeSheet();
  render();
}

function deleteEntry() {
  delete entries[selectedKey];
  save();
  closeSheet();
  render();
}

// ===== События =====
$('prevBtn').addEventListener('click', () => {
  view.setMonth(view.getMonth() - 1);
  renderCalendar();
});
$('nextBtn').addEventListener('click', () => {
  view.setMonth(view.getMonth() + 1);
  renderCalendar();
});
$('todayBtn').addEventListener('click', () => {
  view = new Date();
  view.setDate(1);
  renderCalendar();
});
$('saveBtn').addEventListener('click', saveEntry);
$('cancelBtn').addEventListener('click', closeSheet);
$('deleteBtn').addEventListener('click', deleteEntry);
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selectedKey) closeSheet();
});

// ===== Старт =====
render();
