/* Food Logger — main app logic (Supabase-backed) */
import { FoodAPI } from './db.js';
import { isConfigured } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('app');

const $ = id => document.getElementById(id);

const els = {
  setupView: $('setup-view'),
  authView: $('auth-view'),
  authForm: $('auth-form'),
  authEmail: $('auth-email'),
  authSend: $('auth-send'),
  otpForm: $('otp-form'),
  otpCode: $('otp-code'),
  authStatus: $('auth-status'),
  signoutBtn: $('signout-btn'),
  logView: $('log-view'),
  entriesList: $('entries-list'),
  emptyState: $('empty-state'),
  addBtn: $('add-btn'),
  cameraInput: $('camera-input'),
  galleryInput: $('gallery-input'),
  sourceSheet: $('source-sheet'),
  editor: $('editor'),
  editorTitle: $('editor-title'),
  editorPreview: $('editor-preview'),
  editorSave: $('editor-save'),
  editorCancel: $('editor-cancel'),
  editorDelete: $('editor-delete'),
  mealType: $('meal-type'),
  tagInput: $('tag-input'),
  tagBox: $('tag-box'),
  selectedTags: $('selected-tags'),
  tagSuggestions: $('tag-suggestions'),
  noteInput: $('note-input'),
  timeInput: $('time-input'),
  aiSummary: $('ai-summary'),
  aiFoods: $('ai-foods'),
  analyzeBtn: $('analyze-btn'),
  lightbox: $('lightbox'),
  lightboxImg: $('lightbox-img'),
  toast: $('toast'),
  exportBtn: $('export-btn'),
};

// Editor state: null when closed.
let draft = null;
let objectUrls = [];
let session = null;

/* ---------- utils ---------- */

function toast(msg, ms = 2400) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function revokeUrls() {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
}

function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

function guessMeal(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

function toLocalInputValue(ms) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const MEAL_EMOJI = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' };

function analysisLine(analysis) {
  if (analysis?.status === 'done') {
    return `🔥 ${Math.round(analysis.calories)} kcal · P ${analysis.protein_g}g · C ${analysis.carbs_g}g · F ${analysis.fat_g}g`;
  }
  if (analysis?.status === 'error') return '⚠️ analysis failed — open entry to retry';
  if (analysis?.status === 'analyzing') return '🔍 analyzing…';
  return '⏳ awaiting AI analysis';
}

/* ---------- image processing ---------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function scaleToBlob(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encode failed')), 'image/jpeg', quality);
  });
}

async function processFile(file) {
  log.info(`processing image: ${file.name || 'capture'} ${Math.round(file.size / 1024)}KB`);
  const img = await loadImage(file);
  const [imageBlob, thumbBlob] = await Promise.all([
    scaleToBlob(img, 1280, 0.82), // full image — sent to Groq vision
    scaleToBlob(img, 200, 0.7),   // list thumbnail
  ]);
  log.debug(`resized ${img.naturalWidth}x${img.naturalHeight} → ${Math.round(imageBlob.size / 1024)}KB + ${Math.round(thumbBlob.size / 1024)}KB thumb`);
  return { imageBlob, thumbBlob };
}

/* ---------- view switching ---------- */

function showView(name) {
  log.debug('view:', name);
  els.setupView.hidden = name !== 'setup';
  els.authView.hidden = name !== 'auth';
  els.logView.hidden = name !== 'log';
  els.addBtn.hidden = name !== 'log';
  els.exportBtn.hidden = name !== 'log';
  els.signoutBtn.hidden = name !== 'log';
}

/* ---------- auth ---------- */

els.authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = els.authEmail.value.trim();
  if (!email) return;
  els.authSend.disabled = true;
  els.authStatus.hidden = true;
  try {
    await FoodAPI.sendLoginEmail(email);
    els.otpForm.hidden = false;
    els.otpCode.focus();
  } catch (err) {
    els.authStatus.textContent = err.message;
    els.authStatus.hidden = false;
  } finally {
    els.authSend.disabled = false;
  }
});

els.otpForm.addEventListener('submit', async e => {
  e.preventDefault();
  const code = els.otpCode.value.trim();
  if (code.length < 6) return;
  try {
    await FoodAPI.verifyCode(els.authEmail.value.trim(), code);
    // onAuthChange takes it from here.
  } catch (err) {
    els.authStatus.textContent = err.message;
    els.authStatus.hidden = false;
  }
});

els.signoutBtn.addEventListener('click', async () => {
  await FoodAPI.signOut();
});

/* ---------- log list rendering ---------- */

async function renderLog() {
  revokeUrls();
  let entries;
  try {
    entries = await FoodAPI.listEntries();
  } catch (err) {
    log.error(err);
    toast('Could not load entries — check connection');
    return;
  }

  const thumbUrls = await FoodAPI.signUrls(entries.map(e => e.thumbPath).filter(Boolean))
    .catch(() => new Map());

  els.emptyState.hidden = entries.length > 0;
  els.entriesList.innerHTML = '';

  let currentDay = null;
  let dayEntries = 0;
  let dayHeaderEl = null;

  for (const entry of entries) {
    const label = dayLabel(entry.timestamp);
    if (label !== currentDay) {
      if (dayHeaderEl) setDayCount(dayHeaderEl, dayEntries);
      currentDay = label;
      dayEntries = 0;
      dayHeaderEl = document.createElement('div');
      dayHeaderEl.className = 'day-header';
      dayHeaderEl.textContent = label;
      els.entriesList.appendChild(dayHeaderEl);
    }
    dayEntries++;
    els.entriesList.appendChild(entryCard(entry, thumbUrls.get(entry.thumbPath)));
  }
  if (dayHeaderEl) setDayCount(dayHeaderEl, dayEntries);
}

function setDayCount(headerEl, n) {
  const span = document.createElement('span');
  span.className = 'day-count';
  span.textContent = ` · ${n} meal${n === 1 ? '' : 's'}`;
  headerEl.appendChild(span);
}

function entryCard(entry, thumbUrl) {
  const card = document.createElement('div');
  card.className = 'entry-card';

  const thumb = document.createElement('img');
  thumb.className = 'entry-thumb';
  if (thumbUrl) thumb.src = thumbUrl;
  thumb.alt = 'Meal photo';
  thumb.loading = 'lazy';
  thumb.addEventListener('click', e => {
    e.stopPropagation();
    openLightbox(entry.imagePath);
  });

  const info = document.createElement('div');
  info.className = 'entry-info';

  const top = document.createElement('div');
  top.className = 'entry-top';
  const badge = document.createElement('span');
  badge.className = `meal-badge meal-${entry.meal}`;
  badge.textContent = `${MEAL_EMOJI[entry.meal] || ''} ${entry.meal}`;
  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = timeLabel(entry.timestamp);
  top.append(badge, time);
  info.appendChild(top);

  if (entry.tags.length) {
    const tags = document.createElement('div');
    tags.className = 'entry-tags';
    for (const t of entry.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = t;
      tags.appendChild(chip);
    }
    info.appendChild(tags);
  }

  if (entry.note) {
    const note = document.createElement('div');
    note.className = 'entry-note';
    note.textContent = entry.note;
    info.appendChild(note);
  }

  const ai = document.createElement('div');
  ai.className = 'entry-ai' + (entry.analysis?.status === 'done' ? ' done' : '');
  ai.textContent = analysisLine(entry.analysis);
  info.appendChild(ai);

  card.append(thumb, info);
  card.addEventListener('click', () => openEditor('edit', entry));
  return card;
}

/* ---------- lightbox ---------- */

async function openLightbox(imagePath) {
  if (!imagePath) return;
  try {
    const urls = await FoodAPI.signUrls([imagePath]);
    els.lightboxImg.src = urls.get(imagePath);
    els.lightbox.hidden = false;
  } catch {
    toast('Could not load image');
  }
}
els.lightbox.addEventListener('click', () => { els.lightbox.hidden = true; });

/* ---------- capture flow ---------- */

els.addBtn.addEventListener('click', () => { els.sourceSheet.hidden = false; });
$('source-cancel').addEventListener('click', () => { els.sourceSheet.hidden = true; });
els.sourceSheet.addEventListener('click', e => {
  if (e.target === els.sourceSheet) els.sourceSheet.hidden = true;
});
$('source-camera').addEventListener('click', () => {
  els.sourceSheet.hidden = true;
  els.cameraInput.click();
});
$('source-gallery').addEventListener('click', () => {
  els.sourceSheet.hidden = true;
  els.galleryInput.click();
});

async function onFilePicked(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const { imageBlob, thumbBlob } = await processFile(file);
    openEditor('new', null, { imageBlob, thumbBlob });
  } catch (err) {
    log.error(err);
    toast('Could not read that image');
  }
}
els.cameraInput.addEventListener('change', () => onFilePicked(els.cameraInput));
els.galleryInput.addEventListener('change', () => onFilePicked(els.galleryInput));

/* ---------- editor ---------- */

async function openEditor(mode, entry, blobs) {
  const now = Date.now();
  draft = mode === 'new'
    ? {
        mode, id: crypto.randomUUID(),
        imageBlob: blobs.imageBlob, thumbBlob: blobs.thumbBlob,
        tags: [], meal: guessMeal(), timestamp: now, note: '',
      }
    : { mode, ...structuredClone(entry), existing: entry };

  els.editorTitle.textContent = mode === 'new' ? 'New Meal' : 'Edit Meal';
  els.editorDelete.hidden = mode === 'new';
  els.noteInput.value = draft.note;
  els.timeInput.value = toLocalInputValue(draft.timestamp);
  els.tagInput.value = '';
  setMeal(draft.meal);
  renderSelectedTags();
  renderAiBox();
  els.editor.hidden = false;

  if (mode === 'new') {
    els.editorPreview.src = blobUrl(draft.imageBlob);
  } else {
    els.editorPreview.src = '';
    FoodAPI.signUrls([entry.thumbPath, entry.imagePath].filter(Boolean)).then(urls => {
      if (!draft || draft.id !== entry.id) return;
      els.editorPreview.src = urls.get(entry.imagePath) || urls.get(entry.thumbPath) || '';
    }).catch(() => {});
  }
  await renderSuggestions();
}

function renderAiBox() {
  const a = draft?.analysis;
  els.analyzeBtn.hidden = draft?.mode === 'new';
  els.aiFoods.hidden = true;
  if (draft?.mode === 'new') {
    els.aiSummary.innerHTML = '🤖 Calories &amp; macros: <em>analyzed automatically after saving</em>.';
    return;
  }
  els.aiSummary.textContent = analysisLine(a);
  if (a?.status === 'done') {
    els.aiSummary.textContent += ` · confidence: ${a.confidence}`;
    if (a.foods?.length) {
      els.aiFoods.innerHTML = '';
      for (const f of a.foods) {
        const row = document.createElement('div');
        row.textContent = `• ${f.name}${f.quantity ? ` (${f.quantity})` : ''} — ${Math.round(f.calories)} kcal`;
        els.aiFoods.appendChild(row);
      }
      els.aiFoods.hidden = false;
    }
  }
}

function closeEditor() {
  els.editor.hidden = true;
  draft = null;
}

function setMeal(meal) {
  draft.meal = meal;
  for (const btn of els.mealType.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.meal === meal);
  }
}
els.mealType.addEventListener('click', e => {
  const btn = e.target.closest('button[data-meal]');
  if (btn) setMeal(btn.dataset.meal);
});

/* --- tags --- */

function normalizeTag(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
}

function addTag(raw) {
  const tag = normalizeTag(raw);
  if (!tag || draft.tags.includes(tag)) return;
  draft.tags.push(tag);
  renderSelectedTags();
  renderSuggestions();
}

function removeTag(tag) {
  draft.tags = draft.tags.filter(t => t !== tag);
  renderSelectedTags();
  renderSuggestions();
}

function renderSelectedTags() {
  els.selectedTags.innerHTML = '';
  for (const tag of draft.tags) {
    const chip = document.createElement('span');
    chip.className = 'selected-tag';
    chip.append(tag, Object.assign(document.createElement('span'), { className: 'x', textContent: '✕' }));
    chip.addEventListener('click', () => removeTag(tag));
    els.selectedTags.appendChild(chip);
  }
}

async function renderSuggestions() {
  const top = await FoodAPI.getTopTags(14).catch(() => []);
  if (!draft) return;
  const typed = normalizeTag(els.tagInput.value);
  els.tagSuggestions.innerHTML = '';
  top
    .filter(t => !draft.tags.includes(t))
    .filter(t => !typed || t.includes(typed))
    .slice(0, 8)
    .forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.textContent = `+ ${t}`;
      chip.addEventListener('click', () => {
        els.tagInput.value = '';
        addTag(t);
        els.tagInput.focus();
      });
      els.tagSuggestions.appendChild(chip);
    });
}

els.tagInput.addEventListener('input', renderSuggestions);
els.tagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(els.tagInput.value);
    els.tagInput.value = '';
    renderSuggestions();
  } else if (e.key === 'Backspace' && !els.tagInput.value && draft.tags.length) {
    removeTag(draft.tags[draft.tags.length - 1]);
  }
});
// Commit whatever's typed when leaving the field (mobile keyboards rarely send Enter).
els.tagInput.addEventListener('blur', () => {
  if (els.tagInput.value.trim()) {
    addTag(els.tagInput.value);
    els.tagInput.value = '';
    renderSuggestions();
  }
});
els.tagBox.addEventListener('click', () => els.tagInput.focus());

/* --- analysis --- */

async function runAnalysis(entryId) {
  try {
    const analysis = await FoodAPI.analyze(entryId);
    toast(`✨ ${Math.round(analysis.calories)} kcal estimated`);
    if (draft && draft.id === entryId) {
      draft.analysis = analysis;
      renderAiBox();
    }
    await renderLog();
  } catch (err) {
    log.error(err);
    toast(err.message);
    await renderLog();
  }
}

els.analyzeBtn.addEventListener('click', () => {
  if (!draft || draft.mode === 'new') return;
  draft.analysis = { status: 'analyzing' };
  renderAiBox();
  runAnalysis(draft.id);
});

/* --- save / cancel / delete --- */

els.editorSave.addEventListener('click', async () => {
  if (els.tagInput.value.trim()) {
    addTag(els.tagInput.value);
    els.tagInput.value = '';
  }
  const ts = els.timeInput.value ? new Date(els.timeInput.value).getTime() : draft.timestamp;
  const record = {
    id: draft.id,
    timestamp: Number.isFinite(ts) ? ts : draft.timestamp,
    meal: draft.meal,
    tags: draft.tags,
    note: els.noteInput.value.trim(),
  };
  const isNew = draft.mode === 'new';
  els.editorSave.disabled = true;
  try {
    if (isNew) {
      toast('Uploading…', 8000);
      await FoodAPI.createEntry(record, draft.imageBlob, draft.thumbBlob);
    } else {
      await FoodAPI.updateEntry(record);
    }
    const savedId = draft.id;
    closeEditor();
    toast('Saved ✓');
    await renderLog();
    if (isNew) runAnalysis(savedId); // fire-and-forget; card updates when done
  } catch (err) {
    log.error(err);
    toast(`Save failed: ${err.message}`, 4000);
  } finally {
    els.editorSave.disabled = false;
  }
});

els.editorCancel.addEventListener('click', closeEditor);

els.editorDelete.addEventListener('click', async () => {
  if (!confirm('Delete this meal entry? This cannot be undone.')) return;
  try {
    await FoodAPI.deleteEntry(draft.existing);
    closeEditor();
    toast('Deleted');
    await renderLog();
  } catch (err) {
    log.error(err);
    toast(`Delete failed: ${err.message}`, 4000);
  }
});

/* ---------- export ---------- */

els.exportBtn.addEventListener('click', async () => {
  const entries = await FoodAPI.listEntries().catch(() => []);
  if (!entries.length) { toast('Nothing to export'); return; }
  toast('Preparing export…', 15000);
  const out = [];
  for (const e of entries) {
    let image = null;
    try {
      image = await blobToDataUrl(await FoodAPI.downloadImage(e.imagePath));
    } catch { /* image missing — export metadata anyway */ }
    out.push({
      id: e.id,
      timestamp: new Date(e.timestamp).toISOString(),
      meal: e.meal,
      tags: e.tags,
      note: e.note,
      analysis: e.analysis,
      image,
    });
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `food-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Export ready ✓');
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/* ---------- service worker ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => log.info('service worker registered, scope:', reg.scope))
      .catch(err => log.warn('SW registration failed:', err));
  });
}

/* ---------- init ---------- */

async function init() {
  log.info('init — debug logs:', localStorage.getItem('foodlog:debug') === '1' ? 'on' : 'off (enable with ?debug=1)');
  if (!isConfigured()) {
    log.warn('Supabase not configured — showing setup screen');
    showView('setup');
    return;
  }
  session = await FoodAPI.getSession();
  FoodAPI.onAuthChange(s => {
    const wasSignedIn = !!session;
    session = s;
    if (s && !wasSignedIn) {
      showView('log');
      renderLog();
    } else if (!s) {
      showView('auth');
      els.otpForm.hidden = true;
    }
  });
  if (session) {
    showView('log');
    renderLog();
  } else {
    showView('auth');
  }
}

init();
