/* ===========================================================
   TimeFlow — Manajemen Waktu Mahasiswa
   Semua data kegiatan disimpan di Local Storage.
   =========================================================== */

const STORAGE_KEY = 'timeflow.tasks.v1';
const FOCUS_KEY = 'timeflow.focus.v1';

/* ---------------- Util ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const pad = (n) => String(n).padStart(2, '0');

function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() {
  return toISO(new Date());
}
function formatLong(iso) {
  return fromISO(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatShort(iso) {
  if (iso === todayISO()) return 'Hari ini';
  return fromISO(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRIORITY_LABEL = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };

/* ---------------- State ---------------- */
let tasks = [];
let activeView = 'dashboard';
let taskFilter = 'all';
let scheduleDate = todayISO();
let selectedDate = todayISO();
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let editingId = null;
let formPriority = 'medium';

const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan aktivitas dan produktivitasmu hari ini.'],
  tasks: ['Kegiatan', 'Kelola seluruh tugas dan kegiatan harianmu.'],
  schedule: ['Jadwal', 'Lihat kegiatanmu diurutkan berdasarkan waktu.'],
  calendar: ['Kalender', 'Pantau sebaran kegiatanmu dalam satu bulan.'],
  timer: ['Timer', 'Fokus dengan teknik Pomodoro 25 menit.'],
};

/* ---------------- Storage ---------------- */
function loadTasks() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t) => t && typeof t.title === 'string' && t.title.trim())
      .map((t) => ({
        id: String(t.id || Date.now() + Math.random()),
        title: t.title,
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayISO(),
        time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : '08:00',
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        done: Boolean(t.done),
      }));
  } catch (err) {
    console.warn('Gagal membaca data kegiatan:', err);
    return [];
  }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn('Gagal menyimpan data kegiatan:', err);
  }
}

function loadFocusStats() {
  try {
    const data = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null');
    if (!data || data.date !== todayISO()) return { date: todayISO(), sessions: 0, minutes: 0 };
    return { date: data.date, sessions: Number(data.sessions) || 0, minutes: Number(data.minutes) || 0 };
  } catch (err) {
    return { date: todayISO(), sessions: 0, minutes: 0 };
  }
}
function saveFocusStats() {
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(focusStats));
  } catch (err) {
    console.warn('Gagal menyimpan statistik fokus:', err);
  }
}

/* ---------------- Derived data ---------------- */
function sortByDateTime(a, b) {
  return (a.date + a.time).localeCompare(b.date + b.time);
}
function tasksOf(iso) {
  return tasks.filter((t) => t.date === iso).sort((a, b) => a.time.localeCompare(b.time));
}
function progressInfo() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pending: total - done, pct };
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------- Navigation ---------------- */
function switchView(view) {
  if (!PAGE_META[view]) return;
  activeView = view;
  $$('.nav-item').forEach((btn) => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $$('.view').forEach((sec) => sec.classList.toggle('active', sec.id === `view-${view}`));
  $('#pageTitle').textContent = PAGE_META[view][0];
  $('#pageSubtitle').textContent = PAGE_META[view][1];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Render: dashboard ---------------- */
function renderDashboard() {
  const now = new Date();
  const h = now.getHours();
  let greeting = 'Selamat malam';
  if (h >= 5 && h < 11) greeting = 'Selamat pagi';
  else if (h >= 11 && h < 15) greeting = 'Selamat siang';
  else if (h >= 15 && h < 18) greeting = 'Selamat sore';

  const info = progressInfo();
  $('#greetingEyebrow').textContent = `${greeting} 👋`;
  $('#greetingDate').textContent = formatLong(todayISO());
  $('#topDate').textContent = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });

  if (info.total === 0) {
    $('#greetingBody').textContent =
      'Selamat datang di TimeFlow. Mulai dengan menambahkan kegiatan pertamamu agar harimu lebih teratur dan produktif.';
  } else if (info.pct === 100) {
    $('#greetingBody').textContent =
      'Semua kegiatan sudah selesai. Luar biasa! Gunakan sisa waktu untuk beristirahat atau belajar hal baru.';
  } else if (info.done === 0) {
    $('#greetingBody').textContent =
      `Kamu punya ${info.total} kegiatan yang menunggu. Kerjakan satu per satu, mulai dari prioritas tertinggi.`;
  } else {
    $('#greetingBody').textContent =
      `Sudah ${info.done} kegiatan selesai. Sisa ${info.pending} kegiatan lagi — tetap semangat!`;
  }

  $('#statTotal').textContent = info.total;
  $('#statDone').textContent = info.done;
  $('#statPending').textContent = info.pending;

  $('#dashPct').textContent = `${info.pct}%`;
  $('#dashRing').style.strokeDashoffset = String(314.16 * (1 - info.pct / 100));

  $('#countHigh').textContent = tasks.filter((t) => t.priority === 'high' && !t.done).length;
  $('#countMedium').textContent = tasks.filter((t) => t.priority === 'medium' && !t.done).length;
  $('#countLow').textContent = tasks.filter((t) => t.priority === 'low' && !t.done).length;

  $('#navTaskBadge').textContent = info.pending;
  $('#navTaskBadge').dataset.zero = String(info.pending === 0);
}

function renderProgress() {
  const info = progressInfo();
  $('#progressBar').style.width = `${info.pct}%`;
  $('#progressPctBadge').textContent = `${info.pct}%`;
  $('#progressText').textContent = info.total
    ? `${info.done} dari ${info.total} kegiatan telah selesai.`
    : 'Belum ada kegiatan';
  $('#progressRatio').textContent = `${info.done} / ${info.total}`;

  $('#sideProgressBar').style.width = `${info.pct}%`;
  $('#sideProgressPct').textContent = `${info.pct}%`;
  $('#sideProgressText').textContent = info.total
    ? `${info.pending} kegiatan belum selesai`
    : 'Belum ada kegiatan';
}

function miniItemHTML(t) {
  return `
    <div class="mini-item ${t.done ? 'done' : ''}">
      <span class="mini-time">${esc(t.time)}</span>
      <div class="mini-body">
        <div class="mini-title">${esc(t.title)}</div>
        <div class="mini-sub">${esc(PRIORITY_LABEL[t.priority])} · ${t.done ? 'Selesai' : 'Belum selesai'}</div>
      </div>
      <span class="dot prio-${t.priority}" title="Prioritas ${PRIORITY_LABEL[t.priority]}"></span>
    </div>`;
}

function renderTodayList() {
  const list = tasksOf(todayISO());
  const wrap = $('#todayList');
  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty">
        <strong>Belum ada kegiatan hari ini</strong>
        Tambahkan kegiatan agar harimu lebih teratur.
      </div>`;
    return;
  }
  wrap.innerHTML = list.slice(0, 5).map(miniItemHTML).join('') +
    (list.length > 5
      ? `<button class="link-btn" data-view="schedule" style="align-self:flex-start">+${list.length - 5} kegiatan lainnya</button>`
      : '');
}

/* ---------------- Render: daftar kegiatan ---------------- */
function taskItemHTML(t) {
  return `
    <div class="task-item ${t.done ? 'is-done' : ''}" data-priority="${t.priority}" data-id="${t.id}">
      <button class="check" data-action="toggle" aria-label="${t.done ? 'Tandai belum selesai' : 'Tandai selesai'}">
        <svg class="ico"><use href="#i-check"/></svg>
      </button>
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span><svg class="ico"><use href="#i-calendar"/></svg>${esc(formatShort(t.date))}</span>
          <span><svg class="ico"><use href="#i-clock"/></svg>${esc(t.time)}</span>
          <span class="tag ${t.priority}">${esc(PRIORITY_LABEL[t.priority])}</span>
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-action="edit" aria-label="Edit kegiatan">
          <svg class="ico"><use href="#i-edit"/></svg>
        </button>
        <button class="icon-btn del" data-action="delete" aria-label="Hapus kegiatan">
          <svg class="ico"><use href="#i-trash"/></svg>
        </button>
      </div>
    </div>`;
}

function renderTaskList() {
  const wrap = $('#taskList');
  let list = [...tasks].sort(sortByDateTime);
  if (taskFilter === 'pending') list = list.filter((t) => !t.done);
  if (taskFilter === 'done') list = list.filter((t) => t.done);

  if (!list.length) {
    let msg = '<strong>Belum ada kegiatan</strong>Klik "Tambah Kegiatan" untuk membuat kegiatan pertamamu.';
    if (tasks.length && taskFilter === 'pending') msg = '<strong>Tidak ada kegiatan tersisa</strong>Semua kegiatan sudah selesai. Kerja bagus!';
    if (tasks.length && taskFilter === 'done') msg = '<strong>Belum ada kegiatan selesai</strong>Tandai kegiatan yang sudah kamu kerjakan.';
    wrap.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  wrap.innerHTML = list.map(taskItemHTML).join('');
}

/* ---------------- Render: jadwal ---------------- */
function renderSchedule() {
  const label = formatLong(scheduleDate);
  $('#scheduleDateLabel').textContent =
    scheduleDate === todayISO() ? `${label} · Hari ini` : label;

  const list = tasksOf(scheduleDate);
  const wrap = $('#scheduleList');
  if (!list.length) {
    wrap.classList.add('empty-timeline');
    wrap.innerHTML = `
      <div class="empty">
        <strong>Tidak ada kegiatan pada tanggal ini</strong>
        Pilih tanggal lain atau tambahkan kegiatan baru.
      </div>`;
    return;
  }

  wrap.classList.remove('empty-timeline');
  wrap.innerHTML = list.map((t) => `
    <div class="tl-item ${t.done ? 'is-done' : ''}">
      <div class="tl-time">${esc(t.time)}</div>
      <span class="tl-node"></span>
      <div class="tl-card ${t.done ? 'is-done' : ''}">
        <div>
          <div class="tl-title">${esc(t.title)}</div>
          <div class="tl-sub">${t.done ? 'Sudah selesai' : 'Belum selesai'}</div>
        </div>
        <span class="tag ${t.priority}">${esc(PRIORITY_LABEL[t.priority])}</span>
      </div>
    </div>`).join('');
}

/* ---------------- Render: kalender ---------------- */
const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('#calendarTitle').textContent = `${MONTH_NAMES[month]} ${year}`;

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Senin sebagai awal minggu
  const start = new Date(year, month, 1 - offset);
  const today = todayISO();

  let cells = WEEKDAYS.map((d) => `<div class="cal-weekday">${d}</div>`).join('');

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === month;
    const dayTasks = tasksOf(iso);
    const dots = dayTasks.slice(0, 3)
      .map((t) => `<span class="dot prio-${t.priority}"></span>`).join('');

    cells += `
      <button type="button"
        class="cal-day ${inMonth ? '' : 'muted'} ${iso === today ? 'today' : ''} ${iso === selectedDate ? 'selected' : ''} ${dayTasks.length ? 'has-tasks' : ''}"
        data-date="${iso}"
        aria-label="${esc(formatLong(iso))}${dayTasks.length ? `, ${dayTasks.length} kegiatan` : ''}">
        <span>${d.getDate()}</span>
        <span class="cal-dots">${dots}</span>
      </button>`;
  }
  $('#calendarGrid').innerHTML = cells;
  renderCalendarDay();
}

function renderCalendarDay() {
  const list = tasksOf(selectedDate);
  $('#calSelectedTitle').textContent = formatLong(selectedDate);
  $('#calSelectedSub').textContent = list.length
    ? `${list.length} kegiatan · ${list.filter((t) => t.done).length} selesai`
    : 'Tidak ada kegiatan pada tanggal ini.';

  const wrap = $('#calDayList');
  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty">
        <strong>Hari yang kosong</strong>
        Tambahkan kegiatan untuk tanggal ini agar lebih terencana.
      </div>`;
    return;
  }
  wrap.innerHTML = list.map(miniItemHTML).join('');
}

/* ---------------- Render: timer ---------------- */
const MODES = {
  focus: { total: 25 * 60, label: 'Fokus', status: 'Siap dimulai' },
  break: { total: 5 * 60, label: 'Istirahat', status: 'Siap dimulai' },
};
const RING_CIRCUMFERENCE = 2 * Math.PI * 104;

let timerMode = 'focus';
let timerRemaining = MODES.focus.total;
let timerInterval = null;
let timerRunning = false;
let focusStats = loadFocusStats();

function formatTime(sec) {
  const s = Math.max(0, sec);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function renderTimer() {
  const mode = MODES[timerMode];
  $('#timerDisplay').textContent = formatTime(timerRemaining);
  $('#timerModeLabel').textContent = mode.label;

  const ratio = 1 - timerRemaining / mode.total;
  const ring = $('#timerRing');
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * ratio);
  ring.classList.toggle('break-mode', timerMode === 'break');

  $$('.mode-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === timerMode));

  $('#timerStart').disabled = timerRunning;
  $('#timerPause').disabled = !timerRunning;
  $('#timerStartLabel').textContent =
    timerRemaining < mode.total && timerRemaining > 0 ? 'Lanjutkan' : 'Mulai';

  $('#focusCount').textContent = focusStats.sessions;
  $('#focusMinutes').textContent = focusStats.minutes;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}

function tick() {
  timerRemaining -= 1;
  if (timerRemaining <= 0) {
    stopTimer();
    timerRemaining = 0;
    renderTimer();
    completeSession();
    return;
  }
  renderTimer();
}

function startTimer() {
  if (timerRunning) return;
  if (timerRemaining <= 0) timerRemaining = MODES[timerMode].total;
  timerRunning = true;
  $('#timerStatus').textContent = timerMode === 'focus' ? 'Waktu fokus berjalan…' : 'Waktu istirahat berjalan…';
  timerInterval = setInterval(tick, 1000);
  renderTimer();
}

function pauseTimer() {
  if (!timerRunning) return;
  stopTimer();
  $('#timerStatus').textContent = 'Dijeda';
  renderTimer();
}

function resetTimer() {
  stopTimer();
  timerRemaining = MODES[timerMode].total;
  $('#timerStatus').textContent = 'Siap dimulai';
  renderTimer();
}

function completeSession() {
  if (timerMode === 'focus') {
    focusStats.sessions += 1;
    focusStats.minutes += 25;
    saveFocusStats();
    $('#timerStatus').textContent = 'Sesi fokus selesai';
    toast('Sesi fokus selesai! Waktunya istirahat 5 menit.');
    setTimerMode('break');
    $('#timerStatus').textContent = 'Waktunya istirahat';
  } else {
    $('#timerStatus').textContent = 'Istirahat selesai';
    toast('Istirahat selesai! Siap fokus lagi?');
    setTimerMode('focus');
    $('#timerStatus').textContent = 'Siap fokus kembali';
  }
  renderTimer();
}

function setTimerMode(mode) {
  if (!MODES[mode]) return;
  stopTimer();
  timerMode = mode;
  timerRemaining = MODES[mode].total;
  renderTimer();
}

/* ---------------- Modal form ---------------- */
function openModal(task = null) {
  editingId = task ? task.id : null;
  $('#modalTitle').textContent = task ? 'Edit Kegiatan' : 'Tambah Kegiatan';
  $('#saveTaskBtn').textContent = task ? 'Simpan Perubahan' : 'Simpan Kegiatan';
  $('#taskName').value = task ? task.title : '';
  const defaultDate = activeView === 'schedule' ? scheduleDate
    : activeView === 'calendar' ? selectedDate
      : todayISO();
  $('#taskDate').value = task ? task.date : defaultDate;
  $('#taskTime').value = task ? task.time : '';
  setFormPriority(task ? task.priority : 'medium');
  clearErrors();

  const modal = $('#taskModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#taskName').focus(), 30);
}

function closeModal() {
  const modal = $('#taskModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  editingId = null;
}

function setFormPriority(value) {
  formPriority = value;
  $$('.prio-option').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.priority === value));
}

function clearErrors() {
  ['#taskName', '#taskDate', '#taskTime'].forEach((sel) => $(sel).classList.remove('invalid'));
  ['#errName', '#errDate', '#errTime'].forEach((sel) => {
    $(sel).textContent = '';
    $(sel).classList.remove('show');
  });
}

function showError(inputSel, errSel, message) {
  $(inputSel).classList.add('invalid');
  $(errSel).textContent = message;
  $(errSel).classList.add('show');
}

function handleSubmit(e) {
  e.preventDefault();
  clearErrors();

  const title = $('#taskName').value.trim();
  const date = $('#taskDate').value;
  const time = $('#taskTime').value.slice(0, 5);
  let valid = true;

  if (!title) {
    showError('#taskName', '#errName', 'Nama kegiatan wajib diisi.');
    valid = false;
  }
  if (!date) {
    showError('#taskDate', '#errDate', 'Tanggal wajib dipilih.');
    valid = false;
  }
  if (!time) {
    showError('#taskTime', '#errTime', 'Waktu wajib diisi.');
    valid = false;
  }
  if (!valid) return;

  if (editingId) {
    const idx = tasks.findIndex((t) => t.id === editingId);
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], title, date, time, priority: formPriority };
      toast('Kegiatan berhasil diperbarui.');
    }
  } else {
    tasks.push({
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title, date, time, priority: formPriority, done: false,
    });
    toast('Kegiatan baru berhasil ditambahkan.');
  }

  persist();
  renderAll();
  closeModal();
}

/* ---------------- Task actions ---------------- */
function toggleTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  persist();
  renderAll();
  toast(t.done ? 'Kegiatan ditandai selesai.' : 'Kegiatan ditandai belum selesai.');
}

function deleteTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  if (!window.confirm(`Hapus kegiatan "${t.title}"?`)) return;
  tasks = tasks.filter((x) => x.id !== id);
  persist();
  renderAll();
  toast('Kegiatan berhasil dihapus.');
}

function editTask(id) {
  const t = tasks.find((x) => x.id === id);
  if (t) openModal(t);
}

/* ---------------- Master render ---------------- */
function renderAll() {
  renderDashboard();
  renderProgress();
  renderTodayList();
  renderTaskList();
  renderSchedule();
  renderCalendar();
  renderTimer();
}

/* ---------------- Event wiring ---------------- */
function initEvents() {
  // Navigasi
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-view]');
    if (navBtn) switchView(navBtn.dataset.view);
  });

  // Buka form
  $('#openAddBtn').addEventListener('click', () => openModal());

  // Filter kegiatan
  $$('.chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      taskFilter = chip.dataset.filter;
      $$('.chip[data-filter]').forEach((c) => c.classList.toggle('active', c === chip));
      renderTaskList();
    });
  });

  // Aksi pada daftar kegiatan
  $('#taskList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const item = e.target.closest('.task-item');
    if (!item) return;
    const id = item.dataset.id;
    if (btn.dataset.action === 'toggle') toggleTask(id);
    if (btn.dataset.action === 'edit') editTask(id);
    if (btn.dataset.action === 'delete') deleteTask(id);
  });

  // Jadwal
  $('#scheduleDate').addEventListener('change', (e) => {
    if (!e.target.value) return;
    scheduleDate = e.target.value;
    renderSchedule();
  });
  $('#scheduleTodayBtn').addEventListener('click', () => {
    scheduleDate = todayISO();
    $('#scheduleDate').value = scheduleDate;
    renderSchedule();
  });

  // Kalender
  const changeMonth = (delta) => {
    const next = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    calendarCursor = next;
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === next.getFullYear() && now.getMonth() === next.getMonth();
    selectedDate = isCurrentMonth ? todayISO() : toISO(next);
    renderCalendar();
  };
  $('#calPrev').addEventListener('click', () => changeMonth(-1));
  $('#calNext').addEventListener('click', () => changeMonth(1));
  $('#calendarGrid').addEventListener('click', (e) => {
    const day = e.target.closest('.cal-day');
    if (!day) return;
    selectedDate = day.dataset.date;
    const d = fromISO(selectedDate);
    if (d.getMonth() !== calendarCursor.getMonth() || d.getFullYear() !== calendarCursor.getFullYear()) {
      calendarCursor = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    renderCalendar();
  });

  // Timer
  $('#timerStart').addEventListener('click', startTimer);
  $('#timerPause').addEventListener('click', pauseTimer);
  $('#timerReset').addEventListener('click', resetTimer);
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTimerMode(btn.dataset.mode);
      $('#timerStatus').textContent = 'Siap dimulai';
    });
  });

  // Form tambah/edit
  $('#taskForm').addEventListener('submit', handleSubmit);
  $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
  $$('.prio-option').forEach((btn) => {
    btn.addEventListener('click', () => setFormPriority(btn.dataset.priority));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#taskModal').classList.contains('open')) closeModal();
  });
}

/* ---------------- Init ---------------- */
function init() {
  tasks = loadTasks();
  $('#scheduleDate').value = scheduleDate;
  $('#taskDate').min = '2000-01-01';
  initEvents();
  renderAll();
}

init();
