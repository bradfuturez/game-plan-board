/* timeline.js (v7.0): the "Game time line" tab.
   A SEPARATE view (the main board is never moved or changed): every board window as a compact card (title + a short
   preview, purple if it is a Main Window) in era lanes from left to right. Hold a card and drag it to another lane
   (touch, pen or mouse); swipe / pinch / wheel / +− to pan and zoom like the board; tap a card to fly back to the board
   with that window glowing orange (the v6.9 locate glow).
   Data: timeline.json in Brad's PRIVATE data repo, kept apart from board.json:
     {"app":"game-plan-board-timeline","version":1,"eras":[{"id","label","note"?}...],"placements":{"<windowId>":"<eraId>"},"updatedAt"}
   loaded / saved through the relay (timeline/get, timeline/save; the save sends only {windowId: eraId} changes, merged
   into the latest file). Era names live only in that file (never in this public app). A window missing from placements
   is Unplaced; windows deleted from the board are simply not shown. A copy is kept on the phone (works offline; unsent
   moves are retried). */
'use strict';
const TL_KEY = 'gpb.timeline.v1', TLV_KEY = 'gpb.timeline.view', TL_UNPLACED = 'unplaced';
const TL_LW = 248, TL_GAP = 14, TL_HOLD = 260, TL_MINZ = 0.25, TL_MAXZ = 2;
const tlView = $('#tlView'), tlStage = $('#tlStage'), tlWorld = $('#tlWorld'), tlStatusEl = $('#tlStatus');
let TL = tlLoadLocal(), TLV = tlLoadView(), tlOpenNow = false, tlSaveT = 0, tlBusy = false, tlState = '', tlFromLocate = false;

function tlLoadLocal() {
  try { const d = JSON.parse(localStorage.getItem(TL_KEY) || 'null'); if (d && typeof d === 'object') return { eras: Array.isArray(d.eras) ? d.eras : null, placements: d.placements || {}, pending: d.pending || {}, updatedAt: d.updatedAt || '', savedAt: d.savedAt || '' }; } catch (_) {}
  return { eras: null, placements: {}, pending: {}, updatedAt: '', savedAt: '' };
}
function tlPersist() { try { localStorage.setItem(TL_KEY, JSON.stringify(TL)); } catch (_) {} }
function tlLoadView() { try { const v = JSON.parse(localStorage.getItem(TLV_KEY) || 'null'); if (v && isFinite(v.x) && isFinite(v.y) && v.z > 0) return v; } catch (_) {} return null; }
function tlEras() { // the lanes, Unplaced always last
  const list = (TL.eras || []).filter(e => e && e.id && e.id !== TL_UNPLACED);
  const un = (TL.eras || []).find(e => e && e.id === TL_UNPLACED) || { id: TL_UNPLACED, label: 'Unplaced' };
  return [...list, un];
}
function tlEraOf(id) { const e = TL.placements[id]; return e && tlEras().some(x => x.id === e) ? e : TL_UNPLACED; }
function tlPreview(notes) { const t = String(notes || '').replace(/\s+/g, ' ').trim(); return t.length > 110 ? t.slice(0, 107).replace(/\s+\S*$/, '') + '…' : t; }

/* ---------- drawing ---------- */
function tlRender() {
  const eras = tlEras(), lanes = new Map(eras.map(e => [e.id, []]));
  for (const c of S.cards) lanes.get(tlEraOf(c.id)).push(c); // only windows that are on the board right now
  const sort = (a, b) => (!!b.main - !!a.main) || (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  tlWorld.innerHTML = eras.map((e, i) => { const cs = lanes.get(e.id).sort(sort);
    return `<section class="tl-lane${e.id === TL_UNPLACED ? ' tl-un' : ''}" data-era="${esc(e.id)}" style="left:${i * (TL_LW + TL_GAP)}px;width:${TL_LW}px">` +
      `<header class="tl-lh"><span class="tl-n">${e.id === TL_UNPLACED ? '?' : i + 1}</span><span class="tl-lt"><b>${esc(e.label || e.id)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span><span class="tl-c">${cs.length}</span></header>` +
      `<div class="tl-cards">${cs.map(c => `<article class="tl-card${c.main ? ' main' : ''}" data-id="${esc(c.id)}">${c.main ? '<span class="tl-mt">Main window</span>' : ''}<h4>${esc(c.title || 'Untitled')}</h4>${tlPreview(c.notes) ? `<p>${esc(tlPreview(c.notes))}</p>` : ''}</article>`).join('')}` +
      `${cs.length ? '' : '<div class="tl-empty">Drag a card here</div>'}</div></section>`; }).join('');
  $('#tlSetup').hidden = !!TL.eras;
  $('#tlNone').hidden = S.cards.length > 0;
  tlApply();
}
function tlApply() {
  if (!TLV) tlFit(false);
  tlWorld.style.transform = `translate(${TLV.x}px,${TLV.y}px) scale(${TLV.z})`;
}
function tlFit(save = true) {
  const r = tlStage.getBoundingClientRect(), n = tlEras().length, w = n * TL_LW + (n - 1) * TL_GAP;
  const z = clamp(Math.min(1, (r.width - 24) / Math.min(w, 2 * TL_LW + TL_GAP)), TL_MINZ, TL_MAXZ); // phone: about two lanes across, readable
  TLV = { x: 12, y: 12, z: r.width ? z : 1 };
  if (save) tlSaveView();
  if (save) tlApply();
}
function tlSaveView() { try { localStorage.setItem(TLV_KEY, JSON.stringify(TLV)); } catch (_) {} }
function tlZoomAt(cx, cy, f) {
  const r = tlStage.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top, z = clamp(TLV.z * f, TL_MINZ, TL_MAXZ);
  const wx = (mx - TLV.x) / TLV.z, wy = (my - TLV.y) / TLV.z; TLV = { x: mx - wx * z, y: my - wy * z, z }; tlApply(); tlSaveView();
}
function tlStatus(text, kind) { tlState = kind || ''; tlStatusEl.innerHTML = text; tlStatusEl.className = 'tl-status' + (kind ? ' tl-' + kind : ''); $('#tlConnect').hidden = kind !== 'connect'; }

/* ---------- open / close (own history entry: the phone's back button closes it) ---------- */
function tlOpen() {
  if (tlOpenNow) return;
  if (openSheet) hideSheetNow();
  if (typeof locEnd === 'function' && !$('#locBar').hidden) locEnd(false);
  tlOpenNow = true; tlView.hidden = false; document.body.classList.add('tl-on');
  if (history.state && (history.state.sheet || history.state.locate)) history.replaceState({ timeline: 1 }, ''); else history.pushState({ timeline: 1 }, '');
  tlRender();
  tlStatus(TL.savedAt ? tlSavedText() : '', '');
  tlFetch();
}
function tlHide() { if (!tlOpenNow) return; tlOpenNow = false; tlView.hidden = true; document.body.classList.remove('tl-on'); tlEndDrag(true); }
function tlClose() { if (!tlOpenNow) return; if (history.state && history.state.timeline) history.back(); else tlHide(); }
addEventListener('popstate', () => { if (tlOpenNow && !(history.state && (history.state.timeline || history.state.sheet))) tlHide(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && tlOpenNow && !openSheet) { e.stopImmediatePropagation(); tlClose(); } }, true);
$('#tlBtn').addEventListener('click', tlOpen);
$('#tlBack').addEventListener('click', tlClose);
$('#tlZoomIn').addEventListener('click', () => { const r = tlStage.getBoundingClientRect(); tlZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); });
$('#tlZoomOut').addEventListener('click', () => { const r = tlStage.getBoundingClientRect(); tlZoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); });
$('#tlZoomFit').addEventListener('click', () => tlFit());
addEventListener('resize', () => { if (tlOpenNow) tlApply(); });

/* ---------- loading / saving through the relay (same passcode as Update to GitHub) ---------- */
const tlSavedText = () => TL.savedAt ? `<span class="ok">Saved ✓</span> ${esc(niceTime(new Date(TL.savedAt)))}` : '';
function tlMerge(remote) { // the file's placements, with this phone's not-yet-sent moves on top
  TL.eras = remote.eras; TL.updatedAt = remote.updatedAt || '';
  const p = { ...(remote.placements || {}) };
  for (const [id, e] of Object.entries(TL.pending)) { if (e === TL_UNPLACED) delete p[id]; else p[id] = e; }
  TL.placements = p;
}
async function tlFetch(typed) {
  const pass = typed || localStorage.getItem(PASS_KEY);
  if (!pass) { tlStatus(TL.eras ? 'Moves stay on this phone until you connect.' : 'Connect once to load your eras.', 'connect'); return; }
  if (!navigator.onLine) { tlStatus(Object.keys(TL.pending).length ? "Offline. Your moves are saved when you're back online." : "Offline. Showing this phone's copy.", 'warn'); return; }
  if (tlBusy) return; tlBusy = true;
  if (!TL.eras) tlStatus('<span class="spin" aria-hidden="true"></span>Loading your eras…', 'busy');
  try {
    const d = await relay('timeline/get', {}, pass);
    if (typed) localStorage.setItem(PASS_KEY, pass);
    if (d && d.timeline) { tlMerge(d.timeline); tlPersist(); if (tlOpenNow) tlRender(); tlStatus(tlSavedText() || 'Up to date ✓', ''); }
    else tlStatus('No time line file on GitHub yet.', 'warn');
    tlBusy = false;
    if (Object.keys(TL.pending).length && TL.eras) tlSaveNow();
  } catch (e) {
    tlBusy = false;
    if (e instanceof SyncError && e.kind === 'passcode') { localStorage.removeItem(PASS_KEY); tlStatus("That passcode didn't work.", 'connect'); }
    else tlStatus("Couldn't reach GitHub. Showing this phone's copy.", 'warn');
  }
}
$('#tlConnect').addEventListener('click', async () => {
  const p = await askPasscode(false, 'Connect'); if (p) tlFetch(p);
});
function tlScheduleSave() { clearTimeout(tlSaveT); tlSaveT = setTimeout(tlSaveNow, 1200); }
async function tlSaveNow() {
  clearTimeout(tlSaveT); tlSaveT = 0;
  const pass = localStorage.getItem(PASS_KEY), sent = { ...TL.pending };
  if (!Object.keys(sent).length) return;
  if (!pass) { tlStatus('Saved on this phone. Connect to save to GitHub.', 'connect'); return; }
  if (!navigator.onLine) { tlStatus("Offline. Your moves are saved when you're back online.", 'warn'); return; }
  if (tlBusy) { tlScheduleSave(); return; }
  tlBusy = true; tlStatus('<span class="spin" aria-hidden="true"></span>Saving…', 'busy');
  try {
    const d = await relay('timeline/save', { changes: sent }, pass);
    for (const [id, e] of Object.entries(sent)) if (TL.pending[id] === e) delete TL.pending[id]; // moved again meanwhile: keep the newer one
    if (d && d.timeline) tlMerge(d.timeline);
    TL.savedAt = new Date().toISOString(); tlPersist();
    if (tlOpenNow && !tlDrag) tlRender();
    tlStatus(tlSavedText(), '');
  } catch (e) {
    if (e instanceof SyncError && e.kind === 'passcode') { localStorage.removeItem(PASS_KEY); tlStatus("Saved on this phone. That passcode didn't work.", 'connect'); }
    else tlStatus("Saved on this phone. Couldn't reach GitHub yet; trying again soon.", 'warn');
    setTimeout(() => { if (Object.keys(TL.pending).length) tlSaveNow(); }, 30000);
  } finally { tlBusy = false; }
}
addEventListener('online', () => { if (Object.keys(TL.pending).length) tlSaveNow(); });

/* ---------- moving a card to another era ---------- */
function tlMove(id, era, quiet) {
  const c = byId(id); if (!c || !tlEras().some(e => e.id === era)) return false;
  const from = tlEraOf(id); if (from === era) return false;
  if (era === TL_UNPLACED) delete TL.placements[id]; else TL.placements[id] = era;
  TL.pending[id] = era; tlPersist(); tlRender(); tlScheduleSave();
  const label = (tlEras().find(e => e.id === era) || {}).label || era;
  if (!quiet) toast(`Moved “${esc(c.title || 'Untitled')}” to <b>${esc(label)}</b>`, { action: { label: 'Undo', fn: () => tlMove(id, from, true) }, ms: 5000 });
  return true;
}

/* ---------- touch / mouse: swipe = pan, pinch = zoom, hold a card then drag = move it, tap a card = show it on the board ---------- */
const tlPts = new Map(); let tlG = null, tlDrag = null, tlPinch = null, tlEdgeRAF = 0;
function tlLaneAt(cx) { const r = tlStage.getBoundingClientRect(), wx = (cx - r.left - TLV.x) / TLV.z, eras = tlEras(); return eras[clamp(Math.floor((wx + TL_GAP / 2) / (TL_LW + TL_GAP)), 0, eras.length - 1)].id; }
function tlStartDrag(g) {
  const el = tlWorld.querySelector(`.tl-card[data-id="${CSS.escape(g.id)}"]`); if (!el) return;
  const r = el.getBoundingClientRect(), ghost = el.cloneNode(true);
  ghost.classList.add('tl-ghost'); ghost.style.width = (r.width / TLV.z) + 'px'; ghost.style.transform = `scale(${TLV.z})`;
  tlView.appendChild(ghost); el.classList.add('tl-lifted');
  tlDrag = { id: g.id, el, ghost, dx: g.x - r.left, dy: g.y - r.top, x: g.x, y: g.y, from: tlEraOf(g.id), over: null };
  try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
  tlDragMove(g.x, g.y);
}
function tlDragMove(x, y) {
  const d = tlDrag; if (!d) return; d.x = x; d.y = y;
  d.ghost.style.left = (x - d.dx) + 'px'; d.ghost.style.top = (y - d.dy) + 'px';
  const over = tlLaneAt(x);
  if (over !== d.over) { tlWorld.querySelectorAll('.tl-lane.tl-over').forEach(l => l.classList.remove('tl-over')); tlWorld.querySelector(`.tl-lane[data-era="${CSS.escape(over)}"]`)?.classList.add('tl-over'); d.over = over; }
  const r = tlStage.getBoundingClientRect(), edge = 44;
  d.push = x < r.left + edge ? 1 : x > r.right - edge ? -1 : 0; // near an edge: the lanes scroll under the card
  if (d.push && !tlEdgeRAF) tlEdgeRAF = requestAnimationFrame(tlEdgeStep);
}
function tlEdgeStep() { tlEdgeRAF = 0; const d = tlDrag; if (!d || !d.push) return; TLV.x += d.push * 9; tlApply(); tlDragMove(d.x, d.y); }
function tlEndDrag(cancel) {
  const d = tlDrag; if (!d) return; tlDrag = null;
  cancelAnimationFrame(tlEdgeRAF); tlEdgeRAF = 0;
  d.ghost.remove(); d.el.classList.remove('tl-lifted');
  tlWorld.querySelectorAll('.tl-lane.tl-over').forEach(l => l.classList.remove('tl-over'));
  tlSaveView();
  if (!cancel && d.over && d.over !== d.from) tlMove(d.id, d.over);
}
tlStage.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  if (e.target.closest('.tl-ui')) return;
  tlStage.setPointerCapture?.(e.pointerId);
  tlPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (tlPts.size === 2 && !tlDrag) { // pinch
    clearTimeout(tlG?.hold); tlG = null;
    const [a, b] = [...tlPts.values()]; tlPinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return;
  }
  if (tlPts.size > 1) return;
  const card = e.target.closest('.tl-card');
  tlG = { pid: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: card ? card.dataset.id : null, mouse: e.pointerType === 'mouse', moved: false, t: performance.now() };
  if (card && !tlG.mouse) { const g = tlG; g.hold = setTimeout(() => { if (tlG === g && !g.moved) tlStartDrag(g); }, TL_HOLD); }
});
tlStage.addEventListener('pointermove', e => {
  if (!tlPts.has(e.pointerId)) return;
  tlPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (tlPinch && tlPts.size >= 2) {
    const [a, b] = [...tlPts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    TLV.x += mx - tlPinch.mx; TLV.y += my - tlPinch.my; tlPinch.mx = mx; tlPinch.my = my;
    if (tlPinch.d > 10) tlZoomAt(mx, my, d / tlPinch.d); tlPinch.d = d; tlApply(); return;
  }
  const g = tlG; if (!g || g.pid !== e.pointerId) return;
  if (tlDrag) { tlDragMove(e.clientX, e.clientY); return; }
  if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) {
    g.moved = true; clearTimeout(g.hold);
    if (g.id && g.mouse) { tlStartDrag(g); tlDragMove(e.clientX, e.clientY); return; } // mouse: drag right away
  }
  if (g.moved) { TLV.x += e.clientX - g.x; TLV.y += e.clientY - g.y; tlApply(); tlStage.classList.add('panning'); }
  g.x = e.clientX; g.y = e.clientY;
});
function tlUp(e) {
  if (!tlPts.has(e.pointerId)) return;
  tlPts.delete(e.pointerId);
  if (tlPinch) { if (tlPts.size < 2) { tlPinch = null; tlSaveView(); } tlG = null; return; }
  const g = tlG; if (!g || g.pid !== e.pointerId) return;
  clearTimeout(g.hold); tlG = null; tlStage.classList.remove('panning');
  if (tlDrag) { tlEndDrag(e.type === 'pointercancel'); return; }
  if (g.moved) { tlSaveView(); return; }
  if (e.type !== 'pointercancel' && g.id && performance.now() - g.t < 700) tlLocate(g.id);
}
tlStage.addEventListener('pointerup', tlUp);
tlStage.addEventListener('pointercancel', tlUp);
tlStage.addEventListener('wheel', e => { e.preventDefault(); tlZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
tlStage.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- tap a card: back to the main board, that window glows (v6.9 locate glow) ---------- */
function tlLocate(id) {
  const c = byId(id); if (!c) { toast("That window isn't on your board any more."); tlRender(); return; }
  tlHide();
  if (history.state && history.state.timeline) history.replaceState({ locate: 1 }, ''); else history.pushState({ locate: 1 }, '');
  tlFromLocate = true; tlLocLabel(true);
  locBackTo = { timeline: 1, id };
  locShowBar(true);
  locFly(locTargetView([id]));
  locGlow([id], []);
}
function tlLocLabel(on) {
  const b = $('#locBack'), t = [...b.childNodes].find(n => n.nodeType === 3);
  if (t) t.textContent = on ? 'Back to Game time line' : 'Back to Bot Responses';
  document.body.classList.toggle('loc-tlsrc', on);
}
{ // the Back button / phone back after a timeline tap reopens the timeline at the same place; bot cards work as before
  const _reopen = locReopen, _show = locShow, _end = locEnd;
  locReopen = function () {
    const b = locBackTo;
    if (b && b.timeline) { locEnd(false); tlOpen(); const el = tlWorld.querySelector(`.tl-card[data-id="${CSS.escape(b.id)}"]`); if (el) { el.classList.add('tl-back'); setTimeout(() => el.classList.remove('tl-back'), 1300); } return; }
    return _reopen.apply(this, arguments);
  };
  locShow = function () { tlLocLabel(false); tlFromLocate = false; return _show.apply(this, arguments); };
  locEnd = function () { const r = _end.apply(this, arguments); if (tlFromLocate) { tlFromLocate = false; tlLocLabel(false); } return r; };
}

window.__gpb.tl = { open: tlOpen, close: tlClose, move: tlMove, fetch: tlFetch, save: tlSaveNow, locate: tlLocate, eraOf: tlEraOf,
  get data() { return JSON.parse(JSON.stringify(TL)); }, get view() { return { ...TLV }; }, set view(v) { TLV = { ...v }; tlApply(); tlSaveView(); }, get isOpen() { return tlOpenNow; }, get dragging() { return !!tlDrag; } };
