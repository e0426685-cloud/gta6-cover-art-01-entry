// Vice Cover Studio — editor wiring: photos, panels, caption, export.
// A `?shot=` query sets up a fixed scene for a screenshot (./shots.js).
import { renderCover, layoutRects } from './cover.js';
import { runShot } from './shots.js';

const SIZES = {
  square: { w: 1080, h: 1080, label: '1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: '1080 × 1350' },
  wide: { w: 1920, h: 1080, label: '1920 × 1080' },
};

const SAMPLES = [
  { name: 'Boulevard — sunset convertible', url: 'samples/boulevard.jpg' },
  { name: 'Pier — fishing at noon', url: 'samples/pier.jpg' },
];

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');

const state = {
  layout: localStorage.getItem('vcs-layout') || 'hero',
  title: localStorage.getItem('vcs-title') || 'Sunset Heist',
  subtitle: localStorage.getItem('vcs-subtitle') || 'Welcome to Vice City',
  tagline: localStorage.getItem('vcs-tagline') || 'A Vice City story',
  size: localStorage.getItem('vcs-size') || 'wide',
  // One entry per panel slot (hero 3, grid 4, columns 3); photo is an Image or null.
  panels: [
    { photo: null, zoom: 1, ox: 0, oy: 0, flip: false },
    { photo: null, zoom: 1, ox: 0, oy: 0, flip: false },
    { photo: null, zoom: 1, ox: 0, oy: 0, flip: false },
    { photo: null, zoom: 1, ox: 0, oy: 0, flip: false },
  ],
};
let photos = []; // { name, url, img } — samples + user uploads
let selected = 0;
let fontsReady = false;

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadFonts() {
  try {
    const anton = new FontFace('Anton', 'url(./fonts/Anton-Regular.ttf)');
    const pacifico = new FontFace('Pacifico', 'url(./fonts/Pacifico-Regular.ttf)');
    const [a, p] = await Promise.all([anton.load(), pacifico.load()]);
    document.fonts.add(a);
    document.fonts.add(p);
    await document.fonts.ready;
  } catch (e) {
    // Fall back to system fonts; the cover still renders.
    console.warn('bundled fonts did not load', e);
  }
  fontsReady = true;
}

function sizeOf() {
  return SIZES[state.size] || SIZES.wide;
}

function redraw() {
  const { w, h } = sizeOf();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  renderCover(ctx, state, w, h);
  syncPanelUI();
}

function savePrefs() {
  localStorage.setItem('vcs-layout', state.layout);
  localStorage.setItem('vcs-title', state.title);
  localStorage.setItem('vcs-subtitle', state.subtitle);
  localStorage.setItem('vcs-tagline', state.tagline);
  localStorage.setItem('vcs-size', state.size);
}

// ---- panel controls -------------------------------------------------------
const panelCount = () => layoutRects(state.layout, 100, 100).length;

function syncPanelUI() {
  const count = panelCount();
  document.querySelectorAll('#panels .panel-btn').forEach((btn, i) => {
    btn.hidden = i >= count;
    btn.classList.toggle('active', i === selected);
    btn.textContent = `Panel ${i + 1}`;
  });
  const p = state.panels[selected];
  $('zoom').value = p.zoom;
  $('zoom-val').textContent = `${Math.round(p.zoom * 100)}%`;
  $('flip').classList.toggle('on', !!p.flip);
  const sel = $('panel-photo');
  sel.innerHTML = '<option value="">— empty —</option>' + photos.map((ph, i) =>
    `<option value="${i}">${ph.name}</option>`).join('');
  const idx = p.photo ? photos.findIndex((ph) => ph.img === p.photo) : -1;
  sel.value = idx >= 0 ? String(idx) : '';
  document.querySelectorAll('.layout-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('.size-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.size === state.size));
}

function setPanelPhoto(i, photoIdx) {
  state.panels[i].photo = photoIdx === '' ? null : photos[Number(photoIdx)].img;
  state.panels[i].zoom = 1;
  state.panels[i].ox = 0;
  state.panels[i].oy = 0;
  redraw();
}

$('panel-photo').addEventListener('change', (e) => setPanelPhoto(selected, e.target.value));
$('zoom').addEventListener('input', (e) => {
  state.panels[selected].zoom = Number(e.target.value);
  redraw();
});
$('flip').addEventListener('click', () => {
  state.panels[selected].flip = !state.panels[selected].flip;
  redraw();
});
$('centre').addEventListener('click', () => {
  const p = state.panels[selected];
  p.zoom = 1; p.ox = 0; p.oy = 0;
  redraw();
});
document.querySelectorAll('#panels .panel-btn').forEach((btn, i) => {
  btn.addEventListener('click', () => { selected = i; syncPanelUI(); });
});
document.querySelectorAll('.layout-btn').forEach((b) => {
  b.addEventListener('click', () => {
    state.layout = b.dataset.layout;
    if (selected >= panelCount()) selected = 0;
    savePrefs();
    redraw();
  });
});
document.querySelectorAll('.size-btn').forEach((b) => {
  b.addEventListener('click', () => {
    state.size = b.dataset.size;
    savePrefs();
    redraw();
  });
});

// Drag on the preview to pan the selected panel's photo (or click to select a panel).
let drag = null;
function panelAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const px = ((clientX - r.left) / r.width) * canvas.width;
  const py = ((clientY - r.top) / r.height) * canvas.height;
  const rects = layoutRects(state.layout, canvas.width, canvas.height);
  const i = rects.findIndex((rc) => px >= rc.x && px <= rc.x + rc.w && py >= rc.y && py <= rc.y + rc.h);
  return { i, px, py, rect: r };
}
canvas.addEventListener('pointerdown', (e) => {
  const hit = panelAt(e.clientX, e.clientY);
  if (hit.i < 0) return;
  selected = hit.i;
  syncPanelUI();
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, ox: state.panels[hit.i].ox, oy: state.panels[hit.i].oy, rect: hit.rect };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = state.panels[selected];
  p.ox = drag.ox + ((e.clientX - drag.x) / drag.rect.width) * (canvas.width / 1080) * 1.4;
  p.oy = drag.oy + ((e.clientY - drag.y) / drag.rect.height) * (canvas.height / 1080) * 1.4;
  p.ox = Math.max(-0.6, Math.min(0.6, p.ox));
  p.oy = Math.max(-0.6, Math.min(0.6, p.oy));
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

// ---- photos ---------------------------------------------------------------
async function addPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  photos.push({ name: file.name, url, img });
  $('status').textContent = `Added ${file.name} — pick it for a panel below.`;
  // First user photo fills any empty panel automatically.
  const empty = state.panels.findIndex((p, i) => i < panelCount() && !p.photo);
  if (empty >= 0) state.panels[empty].photo = img;
  redraw();
}
$('photo').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    try { await addPhotoFile(file); } catch { $('status').textContent = `Could not read ${file.name}.`; }
  }
  e.target.value = '';
});
$('sample-boulevard').addEventListener('click', () => setPanelPhoto(selected, '0'));
$('sample-pier').addEventListener('click', () => setPanelPhoto(selected, '1'));

// ---- caption --------------------------------------------------------------
$('title').addEventListener('input', (e) => { state.title = e.target.value; savePrefs(); redraw(); });
$('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; savePrefs(); redraw(); });
$('tagline').addEventListener('input', (e) => { state.tagline = e.target.value; savePrefs(); redraw(); });

// ---- export ---------------------------------------------------------------
$('export').addEventListener('click', () => {
  const { w, h } = sizeOf();
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  renderCover(off.getContext('2d'), state, w, h);
  off.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${w}x${h}.png`;
    a.click();
    $('status').textContent = `Saved vice-cover-${w}x${h}.png`;
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

// ---- boot -----------------------------------------------------------------
async function boot() {
  $('title').value = state.title;
  $('subtitle').value = state.subtitle;
  $('tagline').value = state.tagline;
  for (const s of SAMPLES) {
    try {
      const img = await loadImage(s.url);
      photos.push({ name: s.name, url: s.url, img });
    } catch { /* sample missing: panels stay empty */ }
  }
  // Defaults: hero = boulevard, bottom-left = pier, bottom-right = boulevard (car close-up).
  if (photos[0]) {
    state.panels[0].photo = photos[0].img;
    state.panels[0].oy = -0.04;
    state.panels[2].photo = photos[0].img;
    state.panels[2].zoom = 1.6;
    state.panels[2].ox = 0.12;
    state.panels[2].oy = 0.18;
    state.panels[3].photo = photos[0].img;
    state.panels[3].zoom = 1.4;
    state.panels[3].oy = 0.1;
  }
  if (photos[1]) {
    state.panels[1].photo = photos[1].img;
    state.panels[1].zoom = 1.15;
  }
  const shot = new URLSearchParams(location.search).get('shot');
  await loadFonts();
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), { state, photos, redraw, loadImage, SIZES, sizeOf });
  } else {
    redraw();
  }
  window.__appReady = true;
}

boot();
