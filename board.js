/* board.js: board state, autosave, drawing windows / pins / ropes / media, view (pan+zoom), theme, toast + undo.
   Plain scripts share top-level names, loaded in order: media-db, board, gestures, save-open, app. */
'use strict';
const KEY = 'gpb.board.v1', THEME_KEY = 'gpb.theme';
const PIN_Y = 12, MINZ = 0.25, MAXZ = 2.5, GRID = 24;
const $ = s => document.querySelector(s);
const stage = $('#stage'), world = $('#world'), cardsL = $('#cards'), pinsL = $('#pins'), hitsL = $('#hits'), threadsL = $('#threads'), mediaL = $('#media');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const rndTilt = () => Math.round((Math.random() * 4 - 2) * 10) / 10;
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const KINDS = ['image', 'video', 'file'];

/* ---------- state ---------- */
function sample() {
  const c = (id, x, y, title, notes, tilt) => ({ id, x, y, title, notes, tilt });
  return {
    title: 'Game plan board',
    cards: [
      c('goal', 20, 20, 'The goal', 'Tap a window to type in it.', -1.5),
      c('s1', 216, 50, 'Step 1', 'Hold the empty board for a menu: new window or import photos.', 1.2),
      c('s2', 30, 270, 'Step 2', 'Double-tap a window, then double-tap another, to tie an orange rope.', 1),
      c('save', 220, 320, 'Keep it safe', 'Press SAVE to put a copy in your Downloads. Open brings it back.', -1)
    ],
    threads: [{ a: 'goal', b: 's1', kind: 'red' }, { a: 'goal', b: 's2', kind: 'red' }, { a: 's1', b: 'save', kind: 'orange' }],
    items: [], view: null
  };
}
function normalize(d) {
  const cards = (Array.isArray(d.cards) ? d.cards : []).filter(c => c && c.id != null).map(c => ({
    id: String(c.id), x: +c.x || 0, y: +c.y || 0,
    title: String(c.title ?? ''), notes: String(c.notes ?? ''),
    tilt: Number.isFinite(+c.tilt) ? clamp(+c.tilt, -6, 6) : rndTilt()
  }));
  const ids = new Set(cards.map(c => c.id)), seen = new Set();
  const threads = (Array.isArray(d.threads) ? d.threads : []).map(t => t && ({ a: String(t.a), b: String(t.b), kind: t.kind === 'orange' ? 'orange' : 'red' })).filter(t => {
    if (!t || !ids.has(t.a) || !ids.has(t.b) || t.a === t.b) return false;
    const k = [t.a, t.b].sort().join('|') + t.kind;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  const items = (Array.isArray(d.items) ? d.items : []).filter(i => i && i.id != null).map(i => ({
    id: String(i.id), x: +i.x || 0, y: +i.y || 0, kind: KINDS.includes(i.kind) ? i.kind : 'file',
    name: String(i.name || 'file').slice(0, 200), mime: String(i.mime || ''), size: +i.size || 0,
    in: i.in != null && ids.has(String(i.in)) ? String(i.in) : null
  }));
  const v = d.view;
  const view = v && Number.isFinite(+v.z) && Number.isFinite(+v.x) && Number.isFinite(+v.y) ? { x: +v.x, y: +v.y, z: clamp(+v.z, MINZ, MAXZ) } : null;
  return { title: String(d.title || 'Game plan board').slice(0, 60), cards, threads, items, view };
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) {}
  return normalize(sample());
}
let S = load();
const byId = id => S.cards.find(c => c.id === id);
const itemById = id => S.items.find(i => i.id === id);
const itemsIn = id => S.items.filter(i => i.in === id);
const newIds = new Set(); // windows just created: removed again if left completely empty
let band = null;          // dashed orange rope following the finger: {from, pt}

/* ---------- autosave ---------- */
let saveT = 0;
function persist() {
  clearTimeout(saveT); saveT = 0;
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('Could not autosave on this phone. Press SAVE to keep a copy.'); }
}
function changed() { updateCount(); clearTimeout(saveT); saveT = setTimeout(persist, 250); }
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

/* ---------- sizes ---------- */
function cardW(c) { const n = itemsIn(c.id).length; return n === 0 ? 176 : n === 1 ? 230 : n <= 4 ? 310 : 420; }
function cardCols(c) { const n = itemsIn(c.id).filter(i => i.kind !== 'file').length; return n <= 1 ? 1 : n <= 4 ? 2 : 3; }
const cardH = c => cardEls.get(c.id)?.offsetHeight || 116;
const pinPos = c => ({ x: c.x + cardW(c) / 2, y: c.y + PIN_Y });
const centerPos = c => ({ x: c.x + cardW(c) / 2, y: c.y + cardH(c) / 2 });
function grow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

/* ---------- windows ---------- */
const cardEls = new Map(), pinEls = new Map(), itemEls = new Map();
function makeCard(c) {
  const el = document.createElement('div');
  el.className = 'card'; el.dataset.id = c.id;
  el.innerHTML = '<textarea class="ct" rows="1" maxlength="120" placeholder="Title" enterkeyhint="next" aria-label="Window title"></textarea>' +
    '<textarea class="cn" rows="1" placeholder="Type notes…" aria-label="Window notes"></textarea><div class="mbox"></div>';
  el.querySelector('.ct').value = c.title; el.querySelector('.cn').value = c.notes;
  cardsL.appendChild(el); cardEls.set(c.id, el);
  const pin = document.createElement('button');
  pin.className = 'pin'; pin.dataset.id = c.id; pin.tabIndex = -1;
  pin.setAttribute('aria-label', 'Tie a red string from this window');
  pinsL.appendChild(pin); pinEls.set(c.id, pin);
}
function layoutCard(c) {
  const el = cardEls.get(c?.id); if (!el) return;
  el.style.width = cardW(c) + 'px';
  el.querySelector('.mbox').style.gridTemplateColumns = `repeat(${cardCols(c)},1fr)`;
  el.querySelector('.cn').classList.toggle('empty', !c.notes);
  grow(el.querySelector('.ct')); grow(el.querySelector('.cn'));
  posCard(c);
}
function posCard(c) {
  const el = cardEls.get(c.id); if (!el) return;
  const tilt = el.classList.contains('editing') || el.classList.contains('drop') ? 0 : c.tilt;
  el.style.transform = `translate(${c.x}px,${c.y}px) rotate(${tilt}deg)`;
  const p = pinPos(c);
  pinEls.get(c.id).style.transform = `translate(${p.x - 22}px,${p.y - 22}px)`;
}
function removeCardEl(id) { cardEls.get(id)?.remove(); pinEls.get(id)?.remove(); cardEls.delete(id); pinEls.delete(id); }
function bringToFront(id) {
  const i = S.cards.findIndex(c => c.id === id); if (i < 0 || i === S.cards.length - 1) return;
  S.cards.push(S.cards.splice(i, 1)[0]);
  cardsL.appendChild(cardEls.get(id)); pinsL.appendChild(pinEls.get(id));
}

/* ---------- media items ---------- */
function makeItem(it) {
  const el = document.createElement('div');
  el.className = 'mi ' + it.kind; el.dataset.item = it.id;
  el.setAttribute('aria-label', (it.kind === 'file' ? 'File ' : it.kind === 'video' ? 'Video ' : 'Photo ') + it.name);
  if (it.kind === 'file') { el.innerHTML = '<span class="fi">📄</span><span class="fn"></span>'; el.querySelector('.fn').textContent = it.name; }
  else if (it.kind === 'image') el.innerHTML = '<img alt="">';
  else el.innerHTML = '<video muted playsinline preload="metadata"></video><span class="play"></span>';
  itemEls.set(it.id, el); placeItem(it);
  if (it.kind !== 'file') MDB.url(it.id).then(u => {
    if (!u) { el.classList.add('missing'); return; }
    const m = el.querySelector('img,video');
    m.addEventListener(it.kind === 'image' ? 'load' : 'loadeddata', scheduleThreads, { once: true });
    m.src = it.kind === 'video' ? u + '#t=0.1' : u;
  });
}
function placeItem(it) {
  const el = itemEls.get(it.id); if (!el) return;
  if (it.in && cardEls.has(it.in)) { el.style.transform = ''; cardEls.get(it.in).querySelector('.mbox').appendChild(el); }
  else { mediaL.appendChild(el); posItem(it); }
}
function posItem(it) { const el = itemEls.get(it.id); if (el && !it.in) el.style.transform = `translate(${it.x}px,${it.y}px)`; }
function removeItemEl(id) { itemEls.get(id)?.remove(); itemEls.delete(id); }

/* ---------- ropes (drawn in a layer UNDER the windows) ---------- */
function threadPath(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), sag = Math.min(70, d * 0.16);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + sag).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
function renderThreads() {
  let h = '', v = '';
  S.threads.forEach((t, i) => {
    const A = byId(t.a), B = byId(t.b); if (!A || !B) return;
    const orange = t.kind === 'orange';
    const p = orange ? threadPath(centerPos(A), centerPos(B)) : threadPath(pinPos(A), pinPos(B));
    h += `<path data-t="${i}" d="${p}"/>`;
    v += `<path class="shd" d="${p}"/>` + (orange ? `<path class="rope" d="${p}"/><path class="rope2" d="${p}"/>` : `<path class="str" d="${p}"/>`);
  });
  if (band && byId(band.from)) { const a = centerPos(byId(band.from)); v += `<path class="band" d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${band.pt.x.toFixed(1)} ${band.pt.y.toFixed(1)}"/>`; }
  hitsL.innerHTML = h; threadsL.innerHTML = v;
}
let threadsRAF = 0;
function scheduleThreads() { if (!threadsRAF) threadsRAF = requestAnimationFrame(() => { threadsRAF = 0; renderThreads(); }); }

function updateCount() {
  const n = S.cards.length;
  $('#count').textContent = n + (n === 1 ? ' window' : ' windows');
  $('#empty').hidden = n > 0 || S.items.length > 0;
}
function renderAll() {
  cardsL.innerHTML = ''; pinsL.innerHTML = ''; mediaL.innerHTML = '';
  cardEls.clear(); pinEls.clear(); itemEls.clear();
  S.cards.forEach(makeCard); S.items.forEach(makeItem); S.cards.forEach(layoutCard);
  renderThreads(); updateCount();
  $('#title').value = S.title;
  if (S.view) applyView(); else fit(false);
}

/* ---------- view ---------- */
function applyView() {
  const { x, y, z } = S.view;
  world.style.transform = `translate(${x}px,${y}px) scale(${z})`;
  stage.style.backgroundSize = `${GRID * z}px ${GRID * z}px`;
  stage.style.backgroundPosition = `${x}px ${y}px`;
}
function screenToWorld(cx, cy) { const r = stage.getBoundingClientRect(), v = S.view; return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; }
function viewCenter() { const r = stage.getBoundingClientRect(); return screenToWorld(r.left + r.width / 2, r.top + r.height / 2); }
function bounds() {
  const boxes = S.cards.map(c => [c.x, c.y, cardW(c), cardH(c)]);
  S.items.forEach(i => { if (!i.in) { const el = itemEls.get(i.id); boxes.push([i.x, i.y, el?.offsetWidth || 150, el?.offsetHeight || 110]); } });
  if (!boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  boxes.forEach(([x, y, w, h]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); });
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function fit(save = true) {
  const r = stage.getBoundingClientRect(), b = bounds();
  if (!b) { S.view = { x: r.width / 2, y: r.height / 3, z: 1 }; applyView(); return; }
  const z = clamp(Math.min((r.width - 40) / b.w, (r.height - 90) / b.h), MINZ, 1.15);
  S.view = { x: (r.width - b.w * z) / 2 - b.x0 * z, y: Math.max(16, (r.height - 70 - b.h * z) / 2) - b.y0 * z, z };
  applyView(); if (save) changed();
}
function zoomAt(cx, cy, f) {
  const r = stage.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top, v = S.view;
  const z = clamp(v.z * f, MINZ, MAXZ), wx = (mx - v.x) / v.z, wy = (my - v.y) / v.z;
  S.view = { x: mx - wx * z, y: my - wy * z, z }; applyView(); changed();
}
function centerZoom(f) { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }

/* ---------- theme ---------- */
function theme() {
  const t = localStorage.getItem(THEME_KEY);
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme() {
  const t = theme(), other = t === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#F4F0E6' : '#1B2430';
  $('#themeBtn').setAttribute('aria-label', 'Switch to ' + other + ' theme');
  $('#themeBtn').innerHTML = t === 'dark'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  $('#mThemeLabel').innerHTML = (other === 'light' ? 'Light theme' : 'Dark theme') + '<small>Switch the board colours</small>';
}
function toggleTheme() { localStorage.setItem(THEME_KEY, theme() === 'dark' ? 'light' : 'dark'); applyTheme(); }

/* ---------- toast (with Undo or another action button) ---------- */
let toastT = 0, undoSnap = null, toastFn = null;
function toast(msg, opt = {}) {
  const t = $('#toast'), btn = $('#toastBtn');
  t.querySelector('.msg').innerHTML = msg;
  if (opt.undo) { btn.textContent = 'Undo'; toastFn = doUndo; }
  else if (opt.action) { btn.textContent = opt.action.label; toastFn = opt.action.fn; }
  else toastFn = null;
  btn.hidden = !toastFn;
  if (!opt.undo) undoSnap = null;
  t.classList.add('show');
  const ms = opt.ms || (toastFn ? 5500 : 3200);
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); undoSnap = null; toastFn = null; }, ms);
}
function snap() { const s = JSON.stringify(S); return () => { undoSnap = s; }; }
function doUndo() {
  if (!undoSnap) return;
  const view = S.view; S = normalize(JSON.parse(undoSnap)); S.view = view; undoSnap = null;
  cancelLinks(); renderAll(); changed(); toast('Undone');
}
$('#toastBtn').addEventListener('click', () => { const f = toastFn; $('#toast').classList.remove('show'); toastFn = null; if (f) f(); });

/* ---------- add / delete ---------- */
function addCard(wx, wy) {
  if (wx == null) { const n = S.cards.length % 5, c = viewCenter(); wx = c.x - 88 + n * 14; wy = c.y - 70 + n * 14; }
  else { wx -= 88; wy -= PIN_Y + 10; }
  const c = { id: uid(), x: Math.round(wx), y: Math.round(wy), title: '', notes: '', tilt: rndTilt() };
  S.cards.push(c); makeCard(c); layoutCard(c); newIds.add(c.id); changed();
  focusField(c.id, 'ct');
  return c;
}
function deleteCard(id) {
  const arm = snap(), c = byId(id); if (!c) return arm;
  itemsIn(id).forEach((it, k) => { it.in = null; it.x = c.x + k * 20; it.y = c.y + k * 20; placeItem(it); }); // photos stay on the board
  S.cards = S.cards.filter(x => x.id !== id);
  S.threads = S.threads.filter(t => t.a !== id && t.b !== id);
  newIds.delete(id); removeCardEl(id); renderThreads(); changed();
  return arm;
}
function removeItem(id) {
  const it = itemById(id); if (!it) return;
  const arm = snap(), host = it.in && byId(it.in);
  S.items = S.items.filter(i => i.id !== id); removeItemEl(id);
  if (host) layoutCard(host);
  scheduleThreads(); changed();
  toast('Removed “' + esc(it.name) + '”', { undo: true }); arm();
}
