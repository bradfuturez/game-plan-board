/* locate.js (v6.9): "show me the window the bot is talking about".
   Tap the white part of a bot's card (in a bot tab's sheet, or in the bottom BotResponse list), anywhere except its
   Yes / No buttons, photos, links or other controls, and:
   - the sheet gets out of the way (closes; the Android back gesture brings it back),
   - the board flies (pan + zoom, ~0.5 s) so the card's window is centred and readable; a TIE frames both windows and
     also lights the rope between them if it is already tied,
   - the window(s) glow ORANGE (thick orange ring + pulsing orange halo + an "▲ The bot means this" tag) until
     you tap somewhere else on the board, go back to the list, or 7 s pass,
   - a floating "Back to Bot Responses" button reopens the sheet at the same card and scroll position.
   Windows are matched like the cards name them: windowId first, then the exact title (then the trimmed,
   case-insensitive title, see bbFind). A new window (not on the board yet) glows the existing window it will be tied to
   (or placed next to); otherwise a toast says it's new. A window that is gone gets a toast saying so.
   Cost: nothing runs per frame unless the fly-to animation is playing; the glow is plain CSS (opacity pulse). */
'use strict';
const LOC_MS = 7000, LOC_FLY_MS = 520;
// taps on these never locate (Yes / No, photos, videos, files, links, inputs)
const LOC_SKIP = 'button,a,input,textarea,select,label,video,audio,summary,[role=button],[contenteditable],.br-atts,.bb-btns,.br-btns';
const locL = $('#locRope'), locBar = $('#locBar');
let locIds = [], locRopes = [], locT = 0, locBackTo = null, locRAF = 0, locIgnorePop = false, locTap = null;
const locQ = s => '“' + esc(s || 'Untitled') + '”';

/* ---------- which windows a change is about ---------- */
// out = {ids: [window ids to show], ropes: [thread objects to light], notes: [toast lines]}
function locMissing(id, title, r, out) {
  if (title && (r.changes || []).some(x => x.type === 'add' && bbNorm(x.windowTitle) === bbNorm(title))) out.notes.push(`${locQ(title)} is new and isn't on the board yet.`);
  else if (id) out.notes.push(`${locQ(title)} was already deleted. It isn't on your board any more.`);
  else out.notes.push(`${locQ(title)} isn't on your board. It may have been deleted or renamed.`);
}
function locChange(r, i, out) {
  const c = (r.changes || [])[i]; if (!c) return;
  const d = BR.decisions[r.id + ':' + i], push = w => { if (w && !out.ids.includes(w.id)) out.ids.push(w.id); };
  if (c.type === 'add') {
    const made = d && d.applied && d.windowId && byId(String(d.windowId)); // you already said Yes: it is on the board now
    if (made) { push(made); return; }
    const tied = [], near = (c.nearId || c.near) ? bbFind(c.nearId, c.near) : null, me = bbNorm(c.windowTitle);
    for (const x of r.changes || []) { // a TIE in the same response between this new window and one already on the board
      if (x.type !== 'link' || !me) continue;
      const ends = [[x.windowId, x.windowTitle], [x.toId, x.to]];
      for (let k = 0; k < 2; k++) {
        const [id, t] = ends[k], [oid, ot] = ends[1 - k];
        if (bbNorm(t) === me && !(id && byId(String(id)))) { const o = bbFind(oid, ot); if (o && !tied.includes(o)) tied.push(o); }
      }
    }
    if (tied.length) { tied.forEach(push); out.notes.push(`${locQ(c.windowTitle)} is new and isn't on the board yet. It will be tied to ${tied.map(w => locQ(w.title)).join(' and ')} (glowing orange).`); }
    else if (near) { push(near); out.notes.push(`${locQ(c.windowTitle)} is new and isn't on the board yet. It will go next to ${locQ(near.title)} (glowing orange).`); }
    else out.notes.push(r.changes.filter(x => x.type === 'add').length > 1 ? `${locQ(c.windowTitle)} is new and isn't on the board yet.` : "This window is new and isn't on the board yet.");
    return;
  }
  if (c.type === 'link' || c.type === 'unlink') {
    const a = bbFind(c.windowId, c.windowTitle), b = bbFind(c.toId, c.to);
    if (a) push(a); else locMissing(c.windowId, c.windowTitle, r, out);
    if (b) push(b); else locMissing(c.toId, c.to, r, out);
    if (a && b && a.id !== b.id) {
      const pair = t => (t.a === a.id && t.b === b.id) || (t.a === b.id && t.b === a.id);
      const rope = S.threads.find(t => pair(t) && (!c.rope || t.kind === c.rope)) || S.threads.find(pair);
      if (rope && !out.ropes.includes(rope)) out.ropes.push(rope);
    }
    return;
  }
  // edit / remove / move
  const w = bbFind(c.windowId, c.windowTitle);
  if (w) push(w);
  else if (c.type === 'remove' && d && d.answer === 'yes' && d.applied) out.notes.push(`${locQ(c.windowTitle || (d.old && d.old.title))} was already removed from your board.`);
  else locMissing(c.windowId, c.windowTitle || c.titleBefore, r, out);
}
function locResolve(r, idxs) { const out = { ids: [], ropes: [], notes: [] }; idxs.forEach(i => locChange(r, i, out)); return out; }

/* ---------- fly the board to them ---------- */
let locTagW = 0; // screen width of the "▲ The bot means this" tag (it is drawn at screen size, so it doesn't shrink when zoomed out)
function locTag() {
  if (!locTagW) { const cv = document.createElement('canvas').getContext('2d'); cv.font = '800 14px "Atkinson Hyperlegible", system-ui, sans-serif'; locTagW = Math.ceil(cv.measureText('▲ The bot means this').width) + 30; }
  return locTagW;
}
function locSide(c, cs) { // which way a window's tag hangs: '' = centred (one window), 'l' = from its left edge, 'r' = from its right edge
  if (cs.length < 2) return '';
  const mid = cs.reduce((a, d) => a + d.x + cardW(d) / 2, 0) / cs.length;
  return c.x + cardW(c) / 2 <= mid ? 'l' : 'r';
}
function locTargetView(ids) {
  const cs = ids.map(byId).filter(Boolean);
  let y0 = Infinity, y1 = -Infinity;
  for (const c of cs) { y0 = Math.min(y0, c.y - (c.main ? MTAB_H : 0)); y1 = Math.max(y1, c.y + cardH(c)); }
  const st = stage.getBoundingClientRect(), T = locTag() / 2;
  const padX = 18, padTop = 26, padBot = 82 + 46; // room for the floating Back button + the tag under the window
  const aw = Math.max(80, st.width - 2 * padX), ah = Math.max(80, st.height - padTop - padBot), bh = Math.max(1, y1 - y0);
  // horizontal extent on screen at zoom z, counting each window's tag (centred under it, fixed screen width)
  // (with 2+ windows each tag hangs toward the middle of the group, see locSide, so it never pushes the view wider than needed)
  const span = z => { let L = Infinity, R = -Infinity; for (const c of cs) { const w = cardW(c) * z, x = c.x * z, side = locSide(c, cs);
    const tl = side === 'l' ? x : side === 'r' ? x + w - 2 * T : x + w / 2 - T; L = Math.min(L, x, tl); R = Math.max(R, x + w, tl + 2 * T); } return [L, R]; };
  let z = clamp(Math.min(1, ah / bh), MINZ, MAXZ); // never zoomed in past 100%: the window is shown whole and at its own size when it fits
  for (let k = 0; k < 60 && z > MINZ; k++) { const [L, R] = span(z); if (R - L <= aw) break; z = Math.max(MINZ, z * 0.95); }
  const [L, R] = span(z);
  return { x: Math.round(padX + (aw - (R - L)) / 2 - L), y: Math.round(padTop + (ah - bh * z) / 2 - y0 * z), z };
}
function locStopFly() { if (!locRAF) return; cancelAnimationFrame(locRAF); locRAF = 0; changed(); }
function locFly(to) {
  locStopFly();
  const from = { ...S.view };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !from || !(from.z > 0)) { S.view = to; applyView(); changed(); return; }
  const st = stage.getBoundingClientRect(), cx = st.width / 2, cy = st.height / 2;
  const a = { x: (cx - from.x) / from.z, y: (cy - from.y) / from.z }, b = { x: (cx - to.x) / to.z, y: (cy - to.y) / to.z }; // world point at the screen centre
  const lz0 = Math.log(from.z), lz1 = Math.log(to.z), t0 = performance.now();
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / LOC_FLY_MS), e = ease(t), z = Math.exp(lz0 + (lz1 - lz0) * e);
    S.view = t < 1 ? { x: cx - (a.x + (b.x - a.x) * e) * z, y: cy - (a.y + (b.y - a.y) * e) * z, z } : to;
    applyView();
    if (t < 1) locRAF = requestAnimationFrame(step); else { locRAF = 0; changed(); }
  };
  locRAF = requestAnimationFrame(step);
}

/* ---------- the orange glow ---------- */
function locMark(on) {
  const cs = locIds.map(byId).filter(Boolean);
  for (const id of locIds) {
    const el = cardEls.get(id), side = on && byId(id) ? locSide(byId(id), cs) : '';
    if (el) { el.classList.toggle('loc-glow', on); el.classList.toggle('loc-tl', side === 'l'); el.classList.toggle('loc-tr', side === 'r'); }
    pinEls.get(id)?.classList.toggle('loc-glow', on);
  }
}
function locDrawRopes() {
  if (!locL) return;
  let h = '';
  for (const t of locRopes) {
    if (!S.threads.includes(t)) continue;
    const A = byId(t.a), B = byId(t.b); if (!A || !B) continue;
    const o = t.kind === 'orange', p = threadPath(o ? centerPos(A) : pinPos(A), o ? centerPos(B) : pinPos(B));
    h += `<path class="lr-halo" d="${p}"/><path class="lr-core" d="${p}"/>`;
  }
  locL.innerHTML = h;
}
function locGlow(ids, ropes) {
  locClearGlow();
  locIds = ids.slice(); locRopes = ropes.slice();
  locMark(true); locDrawRopes();
  locT = setTimeout(locClearGlow, LOC_MS);
}
function locClearGlow() {
  clearTimeout(locT); locT = 0;
  if (!locIds.length && !locRopes.length) return;
  locMark(false); locIds = []; locRopes = [];
  if (locL) locL.innerHTML = '';
}

/* ---------- open / leave the "locate" view ---------- */
function locShowBar(on) { locBar.hidden = !on; document.body.classList.toggle('loc-on', on); }
function locShow(r, idxs, back) {
  const out = locResolve(r, idxs);
  if (!out.ids.length) { // nothing on the board to show: say why, keep the list open
    toast(out.notes.length === 1 ? out.notes[0] : out.notes.length ? "None of the windows on this card are on your board (they're new, or were deleted)." : "This card doesn't point at a window on your board.", { ms: 5000 });
    return false;
  }
  locBackTo = back;
  if (openSheet) { // the sheet gets out of the way; its history entry now means "locate view" (back gesture = reopen it)
    hideSheetNow();
    if (history.state && history.state.sheet) history.replaceState({ locate: 1 }, ''); else history.pushState({ locate: 1 }, '');
  } else history.pushState({ locate: 1 }, '');
  locShowBar(true);
  locFly(locTargetView(out.ids));
  locGlow(out.ids, out.ropes);
  if (out.notes.length) toast(out.notes.slice(0, 2).join('<br>'), { ms: 6500 });
  return true;
}
function locEnd(dropHistory) {
  locBackTo = null; locShowBar(false); locClearGlow();
  if (dropHistory && history.state && history.state.locate) { locIgnorePop = true; history.back(); }
}
function locReopen() {
  const b = locBackTo; locEnd(false); if (!b) return;
  if (b.sheet === 'btSheet') { btOpen(b.bot); if (!btIsOpen()) { brRenderSheet(); showSheet('#brSheet'); } } // that bot has nothing left: the full list
  else { brRenderSheet(); showSheet('#brSheet'); }
  const panel = openSheet && openSheet.querySelector('.panel'); if (!panel) return;
  panel.scrollTop = b.scroll || 0;
  const card = b.sel && openSheet.querySelector(b.sel); if (!card) return;
  const pr = panel.getBoundingClientRect(), cr = card.getBoundingClientRect(), off = cr.top - pr.top;
  if (off < 0 || off > panel.clientHeight - 80) panel.scrollTop += off - 16; // the list changed under it: bring the card back into view
  card.classList.remove('loc-back'); void card.offsetWidth; card.classList.add('loc-back'); setTimeout(() => card.classList.remove('loc-back'), 1300);
}
$('#locBack').addEventListener('click', () => { if (history.state && history.state.locate) history.back(); else locReopen(); }); // popstate below reopens it
$('#locX').addEventListener('click', () => locEnd(true));
addEventListener('popstate', () => {
  if (locIgnorePop) { locIgnorePop = false; return; }
  if (locBackTo && !locBar.hidden) locReopen(); // Android back while looking at the window = back to the list
});

/* ---------- taps on the cards ---------- */
function locSkip(e) {
  const t = e.target;
  if (!(t instanceof Element) || !t.isConnected || t.closest(LOC_SKIP)) return true;
  const sel = window.getSelection && String(window.getSelection()); return !!(sel && sel.trim()); // selecting text, not tapping
}
function locIdxs(r, e) { const li = e.target.closest('li[data-i]'); return li ? [+li.dataset.i] : (r.changes || []).map((_, i) => i); }
$('#btList').addEventListener('click', e => {
  if (locSkip(e)) return;
  const card = e.target.closest('.bt-card'); if (!card || card.classList.contains('chose-yes') || card.classList.contains('chose-no')) return;
  const key = card.dataset.key || '', panel = $('#btSheet .panel'), back = { sheet: 'btSheet', bot: btBot, sel: `.bt-card[data-key="${CSS.escape(key)}"]`, scroll: panel.scrollTop };
  if (key.startsWith('r:')) { const r = BR.items[key.slice(2)]; if (r) locShow(r, locIdxs(r, e), back); return; }
  const k = key.lastIndexOf(':'), r = BR.items[key.slice(0, k)]; if (r) locShow(r, [+key.slice(k + 1)], back);
});
$('#brList').addEventListener('click', e => {
  if (locSkip(e)) return;
  const card = e.target.closest('.br-card'); if (!card || card.classList.contains('chose-yes') || card.classList.contains('chose-no')) return;
  const r = BR.items[card.dataset.id]; if (!r) return;
  locShow(r, locIdxs(r, e), { sheet: 'brSheet', sel: `.br-card[data-id="${CSS.escape(r.id)}"]`, scroll: $('#brSheet .panel').scrollTop });
});

/* ---------- taps on the board: a tap anywhere but the glowing window ends the glow (pan / pinch don't) ---------- */
stage.addEventListener('pointerdown', e => {
  locStopFly(); // a finger on the board stops the fly-to right where it is
  if (!locIds.length) return;
  if (locTap && locTap.id !== e.pointerId) { locTap.multi = true; return; }
  const card = e.target.closest && e.target.closest('.card');
  locTap = { id: e.pointerId, x: e.clientX, y: e.clientY, ui: !!(e.target.closest && e.target.closest('.stage-ui')), onGlow: !!(card && locIds.includes(card.dataset.id)) };
}, true);
function locTapEnd(e) {
  const t = locTap; if (!t || t.id !== e.pointerId) return; locTap = null;
  if (e.type === 'pointercancel' || t.multi || t.ui || t.onGlow || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
  locClearGlow();
}
stage.addEventListener('pointerup', locTapEnd, true);
stage.addEventListener('pointercancel', locTapEnd, true);

/* ---------- keep it in step with the rest of the app ---------- */
{
  const _renderThreads = renderThreads, _renderAll = renderAll, _showSheet = showSheet;
  renderThreads = function () { _renderThreads(); if (locRopes.length) locDrawRopes(); }; // the lit rope follows a dragged window
  renderAll = function () { _renderAll(); if (locIds.length) { locMark(true); locDrawRopes(); } }; // e.g. Undo rebuilds the windows
  showSheet = function (sel) { // another sheet opened from the locate view (a bot tab, More…): leave the locate view first
    if (!locBar.hidden) locEnd(false);
    return _showSheet(sel);
  };
}
window.__gpb.loc = { show: locShow, resolve: locResolve, view: locTargetView, end: locEnd, reopen: locReopen, get ids() { return locIds.slice(); }, get ropes() { return locRopes.slice(); }, get flying() { return !!locRAF; }, get back() { return locBackTo; } };
