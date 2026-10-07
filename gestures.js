/* gestures.js: touch / mouse gestures on the board.
   tap window = type in it (after 290ms so a double-tap can win) · double-tap window = orange rope
   hold (500ms) = menu at your finger (on a window it opens with "Make Main Window?" Yes / No on top) · right-click (mouse) = same menu · drag = move window / photo / board · pinch = zoom · tap pin = red string */
'use strict';
const DBL_MS = 300, FOCUS_DELAY = 290, HOLD_MS = 500;
let linkFrom = null, olinkFrom = null, pendingFocus = 0, lastCardTap = null, suppress = null;

/* ---------- linking ---------- */
function showLinkBar(text, orange) { const b = $('#linkBar'); b.querySelector('span').textContent = text; b.classList.toggle('orange', !!orange); b.hidden = false; }
function startLink(id) {
  cancelLinks(); blurEditing(); linkFrom = id;
  cardEls.get(id)?.classList.add('linking'); pinEls.get(id)?.classList.add('linking');
  stage.classList.add('connecting'); showLinkBar('Now tap another window to tie the red string');
}
function startOLink(id) {
  cancelLinks(); blurEditing(); olinkFrom = id;
  cardEls.get(id)?.classList.add('olink'); stage.classList.add('connecting');
  showLinkBar('Now double-tap another window to tie the orange rope', true);
  try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
}
function cancelLinks() {
  if (linkFrom) { cardEls.get(linkFrom)?.classList.remove('linking'); pinEls.get(linkFrom)?.classList.remove('linking'); }
  if (olinkFrom) cardEls.get(olinkFrom)?.classList.remove('olink');
  document.querySelectorAll('.card.target').forEach(el => el.classList.remove('target'));
  linkFrom = olinkFrom = null; band = null;
  stage.classList.remove('connecting'); $('#linkBar').hidden = true; renderThreads();
}
function tie(a, b, kind) {
  cancelLinks(); if (a === b) return;
  if (S.threads.some(t => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))) { toast('Those windows are already tied'); return; }
  S.threads.push({ a, b, kind }); renderThreads(); changed();
  toast(kind === 'orange' ? 'Orange rope tied' : 'String tied');
}
function removeThread(i) {
  const t = S.threads[i]; if (!t) return;
  const arm = snap(); S.threads.splice(i, 1); renderThreads(); changed();
  toast(t.kind === 'orange' ? 'Rope cut' : 'String cut', { undo: true }); arm();
}

/* ---------- typing inside a window ---------- */
function focusField(id, which = 'ct') {
  const c = byId(id), el = cardEls.get(id); if (!c || !el) return;
  clearTimeout(pendingFocus); cancelLinks();
  bringToFront(id); // (moving the element would drop focus, so do it first)
  el.classList.add('editing'); layoutCard(c); scheduleThreads();
  const ta = el.querySelector(which === 'cn' ? '.cn' : '.ct');
  ta.focus({ preventScroll: true });
  try { const n = ta.value.length; ta.setSelectionRange(n, n); } catch (e) {}
  [80, 450].forEach(ms => setTimeout(() => ensureVisible(id), ms)); // again after the keyboard has opened
}
function ensureVisible(id) {
  const el = cardEls.get(id); if (!el || !el.classList.contains('editing')) return;
  const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (r.top < s.top + 8 || r.height > s.height - 16) dy = s.top + 12 - r.top;
  else if (r.bottom > s.bottom - 8) dy = s.bottom - 12 - r.bottom;
  if (r.left < s.left + 4) dx = s.left + 8 - r.left; else if (r.right > s.right - 4) dx = Math.max(s.right - 8 - r.right, s.left + 8 - r.left);
  if (dx || dy) { S.view.x += dx; S.view.y += dy; applyView(); changed(); }
}
function blurEditing() { const a = document.activeElement; if (a && a.closest && a.closest('.card')) a.blur(); }
function endEditing(id) {
  const el = cardEls.get(id), c = byId(id); if (!el || !c) return;
  el.classList.remove('editing');
  if (newIds.has(id)) { newIds.delete(id); if (!c.title.trim() && !c.notes.trim() && !itemsIn(id).length) { deleteCard(id); return; } }
  layoutCard(c); scheduleThreads();
}
function pickField(id, clientY) {
  const c = byId(id), el = cardEls.get(id); if (!c.title) return 'ct';
  return clientY > el.querySelector('.ct').getBoundingClientRect().bottom ? 'cn' : 'ct';
}
cardsL.addEventListener('input', e => {
  const ta = e.target, card = ta.closest('.card'), c = card && byId(card.dataset.id); if (!c) return;
  if (ta.classList.contains('ct')) c.title = ta.value; else { c.notes = ta.value; ta.classList.toggle('empty', !c.notes); }
  grow(ta); scheduleThreads(); changed();
});
cardsL.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('ct')) { e.preventDefault(); e.target.closest('.card').querySelector('.cn').focus(); }
  if (e.key === 'Escape') e.target.blur();
});
cardsL.addEventListener('focusout', e => {
  const card = e.target.closest('.card'); if (!card) return;
  setTimeout(() => { if (!card.contains(document.activeElement)) endEditing(card.dataset.id); }, 0);
});

/* ---------- menu at the finger ---------- */
let ctxAt = 0;
const ICON = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/></svg>',
  type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h16M6 16l9-9 3 3-9 9H6z"/></svg>',
  rope: '<svg viewBox="0 0 24 24" fill="none" stroke="#FF8A1F" stroke-width="2.6" stroke-linecap="round"><circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M6.5 8C9 15 14 9 17.5 16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8 16L19 4M16 16L5 4"/></svg>',
  view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>'
};
function openCtx(x, y, items) {
  const box = $('#ctx'), m = box.querySelector('.ctx-menu'); m.innerHTML = '';
  items.forEach(it => {
    if (it.ask) { // a question with Yes / No, at the top of the menu (v6.6: "Make Main Window?")
      const q = document.createElement('div'); q.className = 'ctx-ask'; q.setAttribute('role', 'group');
      q.innerHTML = '<span class="ctx-q"></span><div class="ctx-yn"><button class="ctx-yes" role="menuitem">Yes</button><button class="ctx-no" role="menuitem">No</button></div>';
      q.querySelector('.ctx-q').textContent = it.ask; q.setAttribute('aria-label', it.ask);
      q.querySelector('.ctx-yes').addEventListener('click', () => { closeCtx(); it.yes(); });
      q.querySelector('.ctx-no').addEventListener('click', () => { closeCtx(); if (it.no) it.no(); });
      m.appendChild(q); return;
    }
    const b = document.createElement('button'); b.setAttribute('role', 'menuitem');
    if (it.danger) b.className = 'danger';
    b.innerHTML = (ICON[it.icon] || '') + '<span></span>'; b.querySelector('span').textContent = it.label;
    b.addEventListener('click', () => { closeCtx(); it.fn(); });
    m.appendChild(b);
  });
  box.hidden = false; ctxAt = performance.now();
  const dot = box.querySelector('.ctx-dot'); dot.style.left = x + 'px'; dot.style.top = y + 'px';
  m.style.left = '0px'; m.style.top = '0px'; // measure at full width (not squeezed by where it was last time)
  const r = m.getBoundingClientRect();
  let top = y + 18; if (top + r.height > innerHeight - 8) top = y - r.height - 18;
  m.style.left = clamp(x - 24, 8, innerWidth - r.width - 8) + 'px';
  m.style.top = clamp(top, 8, innerHeight - r.height - 8) + 'px';
}
function closeCtx() { $('#ctx').hidden = true; }
$('#ctx .ctx-bd').addEventListener('pointerup', () => { if (performance.now() - ctxAt > 350) closeCtx(); });
function onHold(kind, id, x, y) {
  if (kind === 'bg') {
    const w = screenToWorld(x, y);
    openCtx(x, y, [{ label: 'New window', icon: 'add', fn: () => addCard(w.x, w.y) },
                   { label: 'Import photos, videos, files', icon: 'img', fn: () => pickMedia(w) }]);
  } else if (kind === 'card') {
    const isMain = !!byId(id)?.main;
    openCtx(x, y, [{ ask: isMain ? 'Remove Main Window?' : 'Make Main Window?', yes: () => setMain(id, !isMain) },
                   { label: 'Type in this window', icon: 'type', fn: () => focusField(id, 'ct') },
                   { label: 'Tie an orange rope', icon: 'rope', fn: () => startOLink(id) },
                   { label: 'Delete window', icon: 'trash', danger: true, fn: () => { const n = byId(id)?.title || 'Untitled'; const arm = deleteCard(id); toast('Deleted “' + esc(n) + '”', { undo: true }); arm(); } }]);
  } else if (kind === 'item') {
    const it = itemById(id); if (!it) return;
    const list = [{ label: it.kind === 'video' ? 'Play' : it.kind === 'image' ? 'View' : 'Open / download', icon: 'view', fn: () => openItem(id) }];
    if (it.in) list.push({ label: 'Take out of window', icon: 'out', fn: () => takeOut(id) });
    list.push({ label: 'Remove', icon: 'trash', danger: true, fn: () => removeItem(id) });
    openCtx(x, y, list);
  }
}
/* ---------- Main Window (v6.6): the hub of a web of windows tied by ropes. More than one is allowed (e.g. one per bot work area). ---------- */
function setMain(id, on) {
  const c = byId(id); if (!c) return;
  const arm = snap();
  if (on) c.main = true; else delete c.main;
  layoutCard(c); scheduleThreads(); changed();
  const n = esc(c.title || 'Untitled');
  toast(on ? '<span class="ok">✓ “' + n + '” is now a Main Window</span>' : '“' + n + '” is no longer a Main Window', { undo: true }); arm();
}
function takeOut(id) {
  const it = itemById(id); if (!it || !it.in) return;
  const c = byId(it.in); it.in = null; it.x = c.x + cardW(c) + 20; it.y = c.y + 10;
  placeItem(it); layoutCard(c); scheduleThreads(); changed();
}

/* ---------- pointer state machine ---------- */
const ptrs = new Map();
let g = null, pinch = null, holdT = 0;
const cardAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.card')?.dataset.id || null;
function mark(cls, id) { document.querySelectorAll('.card.' + cls).forEach(el => { if (el.dataset.id !== id) { el.classList.remove(cls); const c = byId(el.dataset.id); c && posCard(c); } }); if (id && cardEls.has(id) && !cardEls.get(id).classList.contains(cls)) { cardEls.get(id).classList.add(cls); posCard(byId(id)); } if (cls === 'drop') scheduleThreads(); } // v6.8: rope glow follows the un-tilted drop window
let lastPtrType = '';
stage.addEventListener('pointerdown', e => {
  lastPtrType = e.pointerType;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('.stage-ui') || e.target.closest('.card.editing textarea')) return; // let the caret work normally
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { clearTimeout(holdT); startPinch(); return; }
  if (ptrs.size > 2) return;
  const mi = e.target.closest('.mi'), pin = e.target.closest('.pin'), card = e.target.closest('.card'), hit = e.target.closest('#hits path');
  const kind = mi ? 'item' : pin ? 'pin' : card ? 'card' : hit ? 'thread' : 'bg';
  const id = mi ? mi.dataset.item : pin ? pin.dataset.id : card ? card.dataset.id : null;
  g = { kind, id, t: hit ? +hit.dataset.t : null, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, vx: S.view.x, vy: S.view.y };
  if (kind === 'card' || kind === 'pin') { const c = byId(id); g.cx = c.x; g.cy = c.y; }
  const now = performance.now();
  if (kind === 'card' && suppress && suppress.id === id && now < suppress.until) { suppress = null; g.kind = 'none'; return; } // 2nd tap of the tying double-tap
  if (kind === 'card' && lastCardTap && lastCardTap.id === id && now - lastCardTap.t < DBL_MS && Math.hypot(e.clientX - lastCardTap.x, e.clientY - lastCardTap.y) < 40) {
    lastCardTap = null; clearTimeout(pendingFocus);
    if (olinkFrom && olinkFrom !== id) { tie(olinkFrom, id, 'orange'); g.kind = 'none'; return; }
    startOLink(id); g.kind = 'olink'; g.from = id; return;
  }
  if (kind === 'bg' || kind === 'card' || kind === 'item') {
    const x = e.clientX, y = e.clientY;
    holdT = setTimeout(() => {
      if (!g || g.moved || g.pid !== e.pointerId) return;
      g.kind = 'none'; clearTimeout(pendingFocus); blurEditing();
      try { navigator.vibrate && navigator.vibrate(20); } catch (_) {}
      onHold(kind, id, x, y);
    }, HOLD_MS);
  }
  if (e.pointerType === 'mouse') e.preventDefault();
});
stage.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) { updatePinch(); return; }
  if (!g || g.pid !== e.pointerId) return;
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.kind === 'olink') { // dashed orange rope follows the finger
    if (Math.hypot(dx, dy) > 9) g.moved = true;
    band = { from: g.from, pt: screenToWorld(e.clientX, e.clientY) };
    const t = cardAt(e.clientX, e.clientY); mark('target', t && t !== g.from ? t : null);
    scheduleThreads(); return;
  }
  if (g.kind === 'none') return;
  if (!g.moved) {
    if (Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 4 : 9)) return;
    g.moved = true; clearTimeout(holdT);
    if (g.kind === 'pin' || g.kind === 'card') { g.kind = 'card'; bringToFront(g.id); cardEls.get(g.id).classList.add('dragging'); }
    else if (g.kind === 'item') beginItemDrag(e);
    else { g.kind = 'pan'; stage.classList.add('panning'); }
  }
  if (g.kind === 'pan') { S.view.x = g.vx + dx; S.view.y = g.vy + dy; applyView(); }
  else if (g.kind === 'card') { const c = byId(g.id); if (!c) return; c.x = Math.round(g.cx + dx / S.view.z); c.y = Math.round(g.cy + dy / S.view.z); posCard(c); scheduleThreads(); }
  else if (g.kind === 'itemdrag') {
    const it = itemById(g.id); if (!it) return;
    it.x = Math.round(g.ix + dx / S.view.z); it.y = Math.round(g.iy + dy / S.view.z); posItem(it);
    g.drop = cardAt(e.clientX, e.clientY); mark('drop', g.drop);
  }
});
function beginItemDrag(e) {
  const it = itemById(g.id), el = itemEls.get(g.id); if (!it || !el) { g.kind = 'none'; return; }
  if (it.in) { // pull it out of its window; it follows the finger
    const host = byId(it.in), w = screenToWorld(e.clientX, e.clientY);
    it.in = null; it.x = Math.round(w.x - 75); it.y = Math.round(w.y - 50); placeItem(it); layoutCard(host); scheduleThreads();
  }
  mediaL.appendChild(el); el.classList.add('dragging');
  g.kind = 'itemdrag'; g.ix = it.x - (e.clientX - g.sx) / S.view.z; g.iy = it.y - (e.clientY - g.sy) / S.view.z;
}
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) { pinch = null; changed(); } return; }
  const cur = g; if (!cur || cur.pid !== e.pointerId) return;
  g = null; clearTimeout(holdT); stage.classList.remove('panning');
  if (cur.kind === 'olink') {
    mark('target', null);
    if (cur.moved) { const t = cardAt(e.clientX, e.clientY); if (t && t !== cur.from && e.type !== 'pointercancel') tie(cur.from, t, 'orange'); else { band = null; scheduleThreads(); } }
    return;
  }
  if (cur.kind === 'none') return;
  if (cur.moved) {
    if (cur.kind === 'card') cardEls.get(cur.id)?.classList.remove('dragging');
    if (cur.kind === 'itemdrag') finishItemDrag(cur, e.type === 'pointercancel');
    changed(); return;
  }
  if (e.type === 'pointercancel') return;
  const now = performance.now(), id = cur.id;
  if (cur.kind === 'pin') {
    if (olinkFrom) { if (olinkFrom !== id) tie(olinkFrom, id, 'orange'); else cancelLinks(); }
    else if (!linkFrom) startLink(id); else if (linkFrom === id) cancelLinks(); else tie(linkFrom, id, 'red');
  } else if (cur.kind === 'card') {
    if (olinkFrom) { if (olinkFrom === id) cancelLinks(); else { tie(olinkFrom, id, 'orange'); suppress = { id, until: now + 450 }; } return; }
    if (linkFrom) { if (linkFrom === id) cancelLinks(); else tie(linkFrom, id, 'red'); return; }
    lastCardTap = { id, t: now, x: e.clientX, y: e.clientY };
    const which = pickField(id, e.clientY);
    clearTimeout(pendingFocus); pendingFocus = setTimeout(() => focusField(id, which), FOCUS_DELAY);
  } else if (cur.kind === 'item') { if (linkFrom || olinkFrom) cancelLinks(); else openItem(id); }
  else if (cur.kind === 'thread') {
    if (linkFrom || olinkFrom) { cancelLinks(); return; }
    const t = S.threads[cur.t]; if (!t) return;
    openCtx(e.clientX, e.clientY, [{ label: t.kind === 'orange' ? 'Cut this rope' : 'Cut this string', icon: 'cut', danger: true, fn: () => removeThread(cur.t) }]);
  } else { clearTimeout(pendingFocus); cancelLinks(); blurEditing(); }
}
function finishItemDrag(cur, cancelled) {
  const it = itemById(cur.id), el = itemEls.get(cur.id); mark('drop', null);
  el?.classList.remove('dragging'); if (!it) return;
  const host = !cancelled && cur.drop && byId(cur.drop);
  if (host) { it.in = host.id; placeItem(it); layoutCard(host); scheduleThreads(); toast('Put inside “' + esc(host.title || 'Untitled') + '”'); }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
function startPinch() {
  if (g && g.moved && g.kind === 'card') { cardEls.get(g.id)?.classList.remove('dragging'); changed(); }
  if (g && g.kind === 'itemdrag') finishItemDrag(g, true);
  g = null; stage.classList.remove('panning');
  const [a, b] = [...ptrs.values()], r = stage.getBoundingClientRect(), v = S.view;
  const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.z, wx: (mx - v.x) / v.z, wy: (my - v.y) / v.z };
}
function updatePinch() {
  const [a, b] = [...ptrs.values()]; if (!b) return;
  const r = stage.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
  const z = clamp(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, MINZ, MAXZ);
  S.view = { x: mx - pinch.wx * z, y: my - pinch.wy * z, z }; applyView();
}
stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
stage.addEventListener('contextmenu', e => {
  if (e.target.closest('.card.editing textarea')) return;
  e.preventDefault();
  // Mouse right-click opens the same menu as holding. (Touch long-press also fires contextmenu on Android; the hold timer handles that.)
  if ((e.pointerType || lastPtrType) !== 'mouse' || e.target.closest('.stage-ui') || !$('#ctx').hidden) return;
  if (g) { g.kind = 'none'; clearTimeout(holdT); }
  const mi = e.target.closest('.mi'), card = e.target.closest('.card');
  clearTimeout(pendingFocus); blurEditing();
  if (mi) onHold('item', mi.dataset.item, e.clientX, e.clientY);
  else if (card) onHold('card', card.dataset.id, e.clientX, e.clientY);
  else if (!e.target.closest('.pin') && !e.target.closest('#hits path')) onHold('bg', null, e.clientX, e.clientY);
});
stage.addEventListener('dblclick', e => e.preventDefault());
