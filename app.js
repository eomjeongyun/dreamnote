'use strict';

const DB_NAME = 'dreamnote';
const DB_VERSION = 1;
const STORE_NAME = 'days';
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const $ = s => document.querySelector(s);
let db;
let records = new Map();
let activeMonth = new Date();
let today = keyOf(new Date());
let saveTimer;

function keyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function loadAll() {
  return new Promise((resolve, reject) => {
    const req = tx().getAll();
    req.onsuccess = () => { records = new Map(req.result.map(r => [r.date, r])); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function saveRecord(record) {
  records.set(record.date, record);
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').put(record);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function durationText(start, end) {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간${m ? ` ${m}분` : ''} 잤어요`;
}

function renderToday() {
  const record = records.get(today) || { date: today, sleepStart: '', sleepEnd: '', dream: '' };
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  $('#today-date').textContent = `${m}월 ${d}일 ${WEEKDAY[date.getDay()]}요일`;
  $('#sleepStart').value = record.sleepStart || '';
  $('#sleepEnd').value = record.sleepEnd || '';
  $('#dreamText').value = record.dream || '';
  $('#sleep-duration').textContent = durationText(record.sleepStart, record.sleepEnd);
}

function queueSave() {
  clearTimeout(saveTimer);
  $('#save-indicator').textContent = '';
  saveTimer = setTimeout(async () => {
    const record = {
      date: today,
      sleepStart: $('#sleepStart').value,
      sleepEnd: $('#sleepEnd').value,
      dream: $('#dreamText').value,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveRecord(record);
      $('#sleep-duration').textContent = durationText(record.sleepStart, record.sleepEnd);
      $('#save-indicator').textContent = '저장됨';
    } catch (e) {
      $('#save-indicator').textContent = '저장 실패 (저장공간을 확인해주세요)';
    }
  }, 500);
}

function monthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function renderCalendar() {
  const y = activeMonth.getFullYear(), m = activeMonth.getMonth();
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  $('#month-label').textContent = monthLabel(activeMonth);
  let html = '';
  for (let i = 0; i < first; i++) html += '<span class="calendar-day blank"></span>';
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d);
    const key = keyOf(date);
    const record = records.get(key);
    const hasDream = Boolean(record && record.dream && record.dream.trim());
    html += `<button class="calendar-day${key === today ? ' today' : ''}${hasDream ? ' has-dream' : ''}" data-date="${key}" type="button" aria-label="${m + 1}월 ${d}일${hasDream ? ', 꿈 기록 있음' : ''}">${d}</button>`;
  }
  $('#calendar-grid').innerHTML = html;
}

function showDayDetail(key) {
  const record = records.get(key);
  const detail = $('#day-detail');
  const [y, m, d] = key.split('-').map(Number);
  const duration = record ? durationText(record.sleepStart, record.sleepEnd) : '';
  const dream = record && record.dream && record.dream.trim() ? record.dream : '이 날은 기록된 꿈이 없어요.';
  detail.innerHTML = `<strong>${y}년 ${m}월 ${d}일</strong>${duration ? duration + '<br><br>' : ''}${dream.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}`;
  detail.hidden = false;
}

function switchScreen(name) {
  $('#today-screen').hidden = name !== 'today';
  $('#calendar-screen').hidden = name !== 'calendar';
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.screen === name));
  $('#day-detail').hidden = true;
}

function initEvents() {
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchScreen(tab.dataset.screen)));
  $('#sleepStart').addEventListener('input', queueSave);
  $('#sleepEnd').addEventListener('input', queueSave);
  $('#dreamText').addEventListener('input', queueSave);
  $('#prev-month').addEventListener('click', () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1); renderCalendar(); $('#day-detail').hidden = true; });
  $('#next-month').addEventListener('click', () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1); renderCalendar(); $('#day-detail').hidden = true; });
  $('#calendar-grid').addEventListener('click', e => {
    const button = e.target.closest('[data-date]');
    if (button) showDayDetail(button.dataset.date);
  });
}

async function dailyBackup() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('dreamnote-backup-date') === today) return;
    const all = Array.from(records.values());
    const res = await fetch('https://appointee-unnoticed-donated.ngrok-free.dev/api/app-backup/dreamnote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all),
    });
    if (res.ok) localStorage.setItem('dreamnote-backup-date', today);
  } catch (e) {
    // 홈 서버가 꺼져 있는 건 정상이며 앱 사용에는 영향이 없습니다. 다음에 다시 시도합니다.
  }
}

async function init() {
  initEvents();
  try {
    db = await openDB();
    await loadAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    $('#save-indicator').textContent = '저장공간을 열지 못했어요';
  }
  renderToday();
  renderCalendar();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  }
  setTimeout(dailyBackup, 3000);
}

init();
