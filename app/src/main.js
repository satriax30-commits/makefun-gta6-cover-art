// Neon Coast Cover Studio — the editor wiring: photo loading, the live preview, panel
// selection with drag-to-pan and scroll-to-zoom, and the shot scenes for screenshots.
// Photos are read on the machine and never uploaded anywhere.

import { SAMPLES, LAYOUTS, GRADES, SIZES, defaultState, panelsForLayout, CoverHistory } from './state.js';
import { drawCover, exportCover, fontsReady, layoutRects } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const state = defaultState();
const history = new CoverHistory();
/** Loaded photos, by panel key ('sample:<id>' or 'upload:<id>'). */
const photos = new Map();
let selectedPanel = 0;
let uploadCount = 0;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Loads a sample photo by id into the photo map, carrying its focus point. */
async function loadSample(id) {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) return null;
  if (!photos.has(`sample:${id}`)) {
    const img = await loadImage(sample.src);
    img._focus = sample.focus;
    photos.set(`sample:${id}`, img);
  }
  return photos.get(`sample:${id}`);
}

/** Loads every photo the current panels name. */
async function ensurePhotos() {
  await Promise.all(state.panels.map(async (panel) => {
    if (panel.key.startsWith('sample:') && !photos.has(panel.key)) {
      await loadSample(panel.key.slice('sample:'.length));
    }
  }));
}

/** Sizes the preview canvas to the chosen post size and repaints it. */
export function redraw() {
  const size = SIZES[state.size];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  canvas.style.aspectRatio = `${size.w} / ${size.h}`;
  drawCover(canvas, state, photos);
  renderPanelChips();
  document.getElementById('zoom').value = String(state.panels[selectedPanel]?.zoom ?? 1);
  document.getElementById('zoom-label').textContent =
    `${Math.round((state.panels[selectedPanel]?.zoom ?? 1) * 100)}%`;
  document.getElementById('undo').disabled = !history.canUndo();
  document.getElementById('redo').disabled = !history.canRedo();
}

/** Rebuilds the panel chips when the layout changes how many panels there are. */
let chipCount = -1;
function renderPanelChips() {
  const list = document.getElementById('panel-list');
  if (state.panels.length !== chipCount) {
    chipCount = state.panels.length;
    list.innerHTML = state.panels.map((panel, i) =>
      `<button type="button" class="panel-chip" data-i="${i}">Panel ${i + 1}</button>`).join('');
  }
  list.querySelectorAll('.panel-chip').forEach((chip, i) => {
    chip.classList.toggle('selected', i === selectedPanel);
  });
}

function say(message) {
  statusEl.textContent = message;
}

/** Records the state before a committed change, for undo. */
function commit() {
  history.push(state);
}

/** Applies a committed state change, then repaints. */
async function applyChange(patch) {
  Object.assign(state, patch);
  await ensurePhotos();
  redraw();
}

/** Which panel, if any, holds a point in canvas pixels. */
function panelAt(clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const x = ((clientX - box.left) / box.width) * canvas.width;
  const y = ((clientY - box.top) / box.height) * canvas.height;
  const rects = layoutRects(state.layout, canvas.width, canvas.height);
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const i = panelAt(e.clientX, e.clientY);
  if (i < 0) return;
  selectedPanel = i;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, ox: state.panels[i].ox, oy: state.panels[i].oy, moved: false };
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const box = canvas.getBoundingClientRect();
  const panel = state.panels[selectedPanel];
  const dx = (e.clientX - drag.x) / box.width;
  const dy = (e.clientY - drag.y) / box.height;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 0.002) {
    commit(); // Snapshot the pre-drag state before the first move lands.
    drag.moved = true;
  }
  panel.ox = Math.max(-1, Math.min(1, drag.ox + dx));
  panel.oy = Math.max(-1, Math.min(1, drag.oy + dy));
  redraw();
});
canvas.addEventListener('pointerup', () => {
  drag = null;
});
let wheelTimer = null;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  const next = Math.max(0.8, Math.min(3.5, panel.zoom * Math.exp(-e.deltaY * 0.0012)));
  if (Math.abs(next - panel.zoom) < 0.001) return;
  if (!wheelTimer) commit();
  panel.zoom = next;
  redraw();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelTimer = null; }, 500);
}, { passive: false });

/* ------------------------------------------------------------------ controls */

const $ = (id) => document.getElementById(id);

/** Renders the panel chips and the layout/grade/size pickers from the catalogs. */
function buildPickers() {
  $('panel-list').addEventListener('click', (e) => {
    const chip = e.target.closest('.panel-chip');
    if (!chip) return;
    selectedPanel = Number(chip.dataset.i);
    redraw();
  });
  $('layout-list').innerHTML = Object.entries(LAYOUTS).map(([key, layout]) =>
    `<button type="button" class="layout-btn" data-layout="${key}" title="${layout.hint}">${layout.name}</button>`).join('');
  $('layout-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.layout-btn');
    if (!btn || btn.dataset.layout === state.layout) return;
    commit();
    state.layout = btn.dataset.layout;
    state.panels = panelsForLayout(state, state.layout);
    selectedPanel = 0;
    ensurePhotos().then(redraw);
    syncPickers();
  });
  $('grade-list').innerHTML = Object.entries(GRADES).map(([key, grade]) =>
    `<button type="button" class="grade-btn" data-grade="${key}" title="${grade.name}">
       <span class="swatch" style="background:${grade.swatch}"></span>${grade.name}
     </button>`).join('');
  $('grade-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.grade-btn');
    if (!btn || btn.dataset.grade === state.grade) return;
    commit();
    state.grade = btn.dataset.grade;
    redraw();
    syncPickers();
  });
  $('size-list').innerHTML = Object.entries(SIZES).map(([key, size]) =>
    `<button type="button" class="size-btn" data-size="${key}">${size.name}<br><small>${size.label}</small></button>`).join('');
  $('size-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn || btn.dataset.size === state.size) return;
    commit();
    state.size = btn.dataset.size;
    redraw();
    syncPickers();
  });
  $('sample-list').innerHTML = SAMPLES.map((sample) =>
    `<button type="button" class="sample-btn" data-sample="${sample.id}">
       <img src="${sample.src}" alt="${sample.label} sample photo" loading="lazy">
       <span>${sample.label}</span>
     </button>`).join('');
  $('sample-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.sample-btn');
    if (!btn) return;
    commit();
    state.panels[selectedPanel] = { key: `sample:${btn.dataset.sample}`, zoom: 1, ox: 0, oy: 0 };
    await ensurePhotos();
    redraw();
    say(`Panel ${selectedPanel + 1} now shows the ${btn.dataset.sample} photo.`);
  });
}

function syncPickers() {
  document.querySelectorAll('.layout-btn').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('.grade-btn').forEach((b) => b.classList.toggle('active', b.dataset.grade === state.grade));
  document.querySelectorAll('.size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === state.size));
}

$('upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  commit();
  uploadCount += 1;
  const key = `upload:${uploadCount}`;
  try {
    photos.set(key, await loadImage(URL.createObjectURL(file)));
  } catch {
    say('That file could not be read as a photo.');
    return;
  }
  state.panels[selectedPanel] = { key, zoom: 1, ox: 0, oy: 0 };
  redraw();
  say(`Your photo is in panel ${selectedPanel + 1}. Drag it to position it.`);
  e.target.value = '';
});

$('fill-all').addEventListener('click', async () => {
  const key = state.panels[selectedPanel]?.key;
  if (!key) return;
  commit();
  state.panels = state.panels.map(() => ({ key, zoom: 1, ox: 0, oy: 0 }));
  await ensurePhotos();
  redraw();
  say('Every panel now shows the same photo.');
});

let sliderOpen = false;
$('zoom').addEventListener('input', (e) => {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  if (!sliderOpen) { commit(); sliderOpen = true; } // Snapshot before the first tick.
  panel.zoom = Number(e.target.value);
  redraw();
});
$('zoom').addEventListener('change', () => { sliderOpen = false; });
$('fit').addEventListener('click', () => {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  commit();
  panel.zoom = 1; panel.ox = 0; panel.oy = 0;
  redraw();
});

$('title').addEventListener('focus', () => commit()); // Snapshot before typing starts.
$('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
$('subtitle').addEventListener('focus', () => commit());
$('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
$('stars').addEventListener('change', (e) => {
  commit();
  state.stars = Number(e.target.value);
  redraw();
});

$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  say('Exporting…');
  await fontsReady();
  const { blob, w, h } = await exportCover(state, photos, state.size);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neon-coast-cover-${w}x${h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $('export').disabled = false;
  say(`Saved neon-coast-cover-${w}x${h}.png — ${SIZES[state.size].label}.`);
});

$('undo').addEventListener('click', () => {
  const prev = history.undo(state);
  if (!prev) return;
  Object.assign(state, prev);
  state.panels = panelsForLayout(state, state.layout);
  ensurePhotos().then(redraw);
  syncPickers();
});
$('redo').addEventListener('click', () => {
  const next = history.redo(state);
  if (!next) return;
  Object.assign(state, next);
  state.panels = panelsForLayout(state, state.layout);
  ensurePhotos().then(redraw);
  syncPickers();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    (e.shiftKey ? $('redo') : $('undo')).click();
  }
});

/* ---------------------------------------------------------------------- boot */

buildPickers();
syncPickers();
$('title').value = state.title;
$('subtitle').value = state.subtitle;
$('stars').value = String(state.stars);

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  await fontsReady();
  await runShot(shot, query, {
    state, photos, loadSample, ensurePhotos, redraw,
    loadImage, drawCover, fontsReady, canvas,
    setState(next) { Object.assign(state, next); },
  });
  syncPickers();
} else {
  await fontsReady();
  await ensurePhotos();
  redraw();
}
