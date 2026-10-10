/* botboardshare.js (v7.1): BotBoardShare. See the boards your bots share with you: their OWN boards, separate from yours.
   - Hold an empty spot → "BotBoardShare" (right under New window); also More → BotBoardShare; on a bot board the banner's
     "Boards" button. A picker lists "My board" + every shared bot board (bot, title, last updated).
   - Choosing a bot board switches the whole screen to it: its own windows, ropes, layout and media, drawn with the same
     corkboard look, pan and zoom. Tap a window to read it, tap a photo / video to see it. A banner says whose board it is
     ("<bot>'s board · view only") with "Back to my board". If the board has eras, "Lanes" shows it in the v7.0 time line
     view (read-only).
   - VIEW ONLY: while a bot board is on screen, S holds a throwaway copy of it; Brad's own board is kept aside (bbsMine) and
     is the only thing persist() ever writes, so his local save, board.json, timeline.json and Update to GitHub never see
     bot content. Editing, typing, ropes, SAVE / Open / Update to GitHub / DirectShare / bot answers are all switched off.
   - Data: relay botboards/list, botboards/get {bot}, botboards/media (private data repo botboards/<slug>/...), published
     from the box with /workspace/tools/botboardshare/publish.sh. A red dot (hold menu, More) marks a board that was
     shared or updated since Brad last opened it. Nothing about any bot board is in this public app. */
'use strict';
const BBS_LIST_KEY = 'gpb.bbs.list', BBS_SEEN_KEY = 'gpb.bbs.seen', BBS_POLL_MS = 10 * 60 * 1000, BBS_PART = 3.5 * 1024 * 1024;
const bbsLoad = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } };
let bbsList = bbsLoad(BBS_LIST_KEY, []), bbsSeen = bbsLoad(BBS_SEEN_KEY, {}), bbsCur = null, bbsMineS = null, bbsPolling = false, bbsState = '', bbsLoading = '';
const bbsUrls = new Map(), bbsViews = {};
if (!Array.isArray(bbsList)) bbsList = [];

/* ---------- used by the rest of the app ---------- */
function bbsMine() { return bbsMineS; }          // Brad's own board while a bot board is on screen (persist() saves this one)
function bbsActive() { return !!bbsCur; }
function bbsGuard(silent) { // true = a bot board is on screen, so the caller must not change anything
  if (!bbsCur) return false;
  if (!silent) toast(`This is ${esc(bbsCur.meta.bot)}'s board. It's view only.<br>Tap <b>Back to my board</b> to work on yours.`, { ms: 4500 });
  return true;
}
function bbsUnseen() { return bbsList.filter(b => b.updatedAt && bbsSeen[b.slug] !== b.updatedAt).length; }
function bbsDots() {
  const n = bbsUnseen();
  $('#bbsDot').hidden = !n; $('#bbsBadge').hidden = !n; $('#bbsBadge').textContent = n > 9 ? '9+' : String(n);
  $('#mBBS').classList.toggle('bbs-new', !!n);
  $('#mBBSSub').textContent = n ? `${n} new or updated bot board${n > 1 ? 's' : ''}` : bbsList.length ? `${bbsList.length} bot board${bbsList.length > 1 ? 's' : ''} shared with you` : 'See the boards your bots share with you';
  const ci = $('#ctxBBS'); if (ci && !ci.querySelector('.ctx-rdot') && n) ci.insertAdjacentHTML('beforeend', '<i class="ctx-rdot" aria-label="new"></i>');
  if (ci && !n) ci.querySelector('.ctx-rdot')?.remove();
}

/* ---------- the list of shared boards ---------- */
async function bbsPoll() {
  if (bbsPolling || document.hidden) return;
  if (!localStorage.getItem(PASS_KEY)) { bbsState = 'pass'; bbsRenderPicker(); return; }
  if (!navigator.onLine) { bbsState = 'offline'; bbsRenderPicker(); return; }
  bbsPolling = true; bbsState = 'loading'; bbsRenderPicker();
  try {
    const d = await dsCall('botboards/list');
    bbsList = (d && Array.isArray(d.boards) ? d.boards : []).filter(b => b && b.slug);
    try { localStorage.setItem(BBS_LIST_KEY, JSON.stringify(bbsList)); } catch (_) {}
    bbsState = '';
  } catch (e) { bbsState = e.kind === 'passcode' ? 'pass' : 'error'; }
  finally { bbsPolling = false; bbsDots(); bbsRenderPicker(); }
}
function bbsRow(b) {
  const on = bbsCur && bbsCur.slug === b.slug, isNew = b.updatedAt && bbsSeen[b.slug] !== b.updatedAt, when = dsWhen(b.updatedAt);
  return `<button class="bbs-row${on ? ' on' : ''}" data-slug="${esc(b.slug)}">` +
    `<span class="bbs-ic">${esc((b.bot || '?').trim().charAt(0).toUpperCase())}</span>` +
    `<span class="bbs-txt"><b>${esc(b.bot || b.slug)}</b><span class="bbs-t">${esc(b.title || 'Untitled board')}</span>` +
    `<small>${when ? 'Updated ' + esc(when) : ''}${b.windows ? ` · ${b.windows} window${b.windows > 1 ? 's' : ''}` : ''}${b.lanes ? ' · lanes' : ''}</small></span>` +
    (on ? '<span class="bbs-on-tag">On screen</span>' : isNew ? '<span class="bbs-new-tag"><i></i>New</span>' : '') + '</button>';
}
function bbsRenderPicker() {
  const el = $('#bbsList'); if (!el || !openSheet || openSheet.id !== 'bbsSheet') return;
  const mine = bbsMineS || S, n = mine.cards.length;
  let h = `<button class="bbs-row bbs-mine${bbsCur ? '' : ' on'}" data-slug=""><span class="bbs-ic">★</span><span class="bbs-txt"><b>My board</b><span class="bbs-t">${esc(mine.title || 'Game plan board')}</span><small>${n} window${n === 1 ? '' : 's'} · yours</small></span>${bbsCur ? '' : '<span class="bbs-on-tag">On screen</span>'}</button>`;
  h += '<div class="bbs-sep">Shared by your bots</div>';
  if (bbsList.length) h += bbsList.map(bbsRow).join('');
  if (bbsState === 'pass') h += '<div class="bbs-note">Connect once to see your bots\' boards (same passcode as Update to GitHub).<button class="btn primary" id="bbsConnect">Connect</button></div>';
  else if (bbsState === 'loading' && !bbsList.length) h += '<div class="bbs-note"><span class="spin" aria-hidden="true"></span> Looking for shared boards…</div>';
  else if (bbsState === 'offline') h += `<div class="bbs-note">You're offline.${bbsList.length ? ' Showing the last list.' : ''}</div>`;
  else if (bbsState === 'error') h += `<div class="bbs-note">Couldn't reach GitHub.${bbsList.length ? ' Showing the last list.' : ''}</div>`;
  else if (!bbsList.length) h += '<div class="bbs-note">No bot has shared a board yet.</div>';
  el.innerHTML = h;
}
function bbsPicker() {
  closeCtx();
  bbsRenderPicker(); showSheet('#bbsSheet'); bbsRenderPicker(); $('#bbsSheet .panel').scrollTop = 0;
  bbsPoll();
}
$('#bbsList').addEventListener('click', async e => {
  if (e.target.closest('#bbsConnect')) { const p = await askPasscode(false, 'Connect'); if (p) { localStorage.setItem(PASS_KEY, p); bbsPicker(); } return; }
  const row = e.target.closest('.bbs-row'); if (!row || bbsLoading) return;
  const slug = row.dataset.slug;
  if (!slug) { if (bbsCur) bbsHome(); else closeSheet(); return; }
  if (bbsCur && bbsCur.slug === slug) { closeSheet(); return; }
  bbsOpen(slug);
});
$('#mBBS').addEventListener('click', () => bbsPicker());
$('#bbsSwitch').addEventListener('click', () => bbsPicker());

/* ---------- switching the screen to a bot board, and back ---------- */
async function bbsOpen(slug) {
  bbsLoading = slug;
  const row = document.querySelector(`.bbs-row[data-slug="${CSS.escape(slug)}"]`); row?.classList.add('busy');
  toast('<span class="spin" aria-hidden="true"></span>Opening the board…', { ms: 30000 });
  try {
    const d = await dsCall('botboards/get', { bot: slug });
    if (!d || !d.board) throw new Error('empty');
    bbsEnter(slug, d.meta || { slug, bot: slug }, d.board);
    $('#toast').classList.remove('show');
  } catch (e) {
    toast(e.kind === 'passcode' ? "That passcode didn't work. Try More → Update to GitHub to enter it again." : e.kind === 'offline' ? "You're offline. Try again when you're connected." : "Couldn't open that board. " + esc(e.message || ''), { ms: 6000 });
  } finally { bbsLoading = ''; row?.classList.remove('busy'); }
}
function bbsEnter(slug, meta, board) {
  if (typeof locEnd === 'function' && !$('#locBar').hidden) locEnd(false);
  if (typeof tlHide === 'function') tlHide();
  cancelLinks(); closeCtx(); blurEditing(); clearTimeout(pendingFocus);
  if (bbsCur) bbsViews[bbsCur.slug] = S.view;
  persist();                                  // Brad's board saved as it is right now
  if (!bbsMineS) bbsMineS = S;                // ...and kept aside, untouched, until he comes back
  const placements = {}, files = {};
  for (const c of board.cards || []) if (c.era) placements[c.id] = c.era;
  for (const i of board.items || []) files[i.id] = { file: i.file, size: i.size || 0, mime: i.mime || '' };
  bbsCur = { slug, meta, board, placements, files };
  S = normalize({ title: board.title || meta.title || meta.bot, cards: board.cards || [], threads: board.threads || [], items: board.items || [], view: bbsViews[slug] || null });
  document.body.classList.add('bbs-on');
  $('#bbsBar').hidden = false;
  $('#bbsWho').textContent = `${meta.bot || slug}'s board · view only`;
  $('#bbsSub').textContent = (board.title || meta.title || '') + (meta.updatedAt && dsWhen(meta.updatedAt) ? ` · updated ${dsWhen(meta.updatedAt)}` : '');
  const eras = Array.isArray(board.eras) ? board.eras : [];
  $('#bbsLanes').hidden = !eras.length;
  if (typeof tlSetSource === 'function') tlSetSource(eras.length ? { eras, placements, bot: meta.bot || slug } : null);
  $('#title').readOnly = true;
  renderAll();
  cardsL.querySelectorAll('textarea').forEach(t => { t.readOnly = true; t.tabIndex = -1; });
  bbsSeen[slug] = meta.updatedAt || bbsSeen[slug] || ''; try { localStorage.setItem(BBS_SEEN_KEY, JSON.stringify(bbsSeen)); } catch (_) {}
  bbsDots();
  // history: the phone's back button = back to my board
  if (openSheet) { hideSheetNow(); if (history.state && history.state.sheet) history.replaceState({ bbs: slug }, ''); else history.pushState({ bbs: slug }, ''); }
  else if (!(history.state && history.state.bbs)) history.pushState({ bbs: slug }, '');
  else history.replaceState({ bbs: slug }, '');
}
function bbsExitNow() {
  if (!bbsCur) return;
  bbsViews[bbsCur.slug] = S.view;
  if (typeof tlHide === 'function') tlHide();
  if (typeof tlSetSource === 'function') tlSetSource(null);
  if (typeof locEnd === 'function' && !$('#locBar').hidden) locEnd(false);
  if (openSheet && (openSheet.id === 'bbsWin' || openSheet.id === 'viewer')) hideSheetNow();
  cancelLinks(); closeCtx();
  S = bbsMineS; bbsMineS = null; bbsCur = null;
  document.body.classList.remove('bbs-on');
  $('#bbsBar').hidden = true; $('#title').readOnly = false;
  renderAll();
}
function bbsHome() {
  if (!bbsCur) { if (openSheet) closeSheet(); return; }
  if (openSheet) hideSheetNow();
  if (history.state && (history.state.bbs || history.state.sheet)) { bbsExitNow(); history.replaceState(null, ''); }
  else bbsExitNow();
}
$('#bbsHome').addEventListener('click', bbsHome);
$('#bbsLanes').addEventListener('click', () => { if (bbsCur && typeof tlOpen === 'function') tlOpen(); });
addEventListener('popstate', () => {
  const st = history.state;
  if (bbsCur && !(st && (st.bbs || st.sheet || st.locate || st.timeline))) bbsExitNow();
});

/* ---------- media on a bot board (fetched through the relay, kept in memory only) ---------- */
async function bbsBlob(id) {
  const f = bbsCur && bbsCur.files[id]; if (!f) return null;
  const slug = bbsCur.slug, key = slug + '/' + f.file;
  if (bbsUrls.has(key)) return bbsUrls.get(key);
  const parts = f.size ? Math.max(1, Math.ceil(f.size / BBS_PART)) : 1, bufs = [];
  for (let p = 0; p < parts; p++) bufs.push(await dsCall(`botboards/media?bot=${encodeURIComponent(slug)}&file=${encodeURIComponent(f.file)}&part=${p}&size=${f.size || 0}`, {}, true));
  const blob = new Blob(bufs, { type: f.mime || 'application/octet-stream' }), out = { blob, url: URL.createObjectURL(blob) };
  bbsUrls.set(key, out); return out;
}
{
  const _makeItem = makeItem, _openItem = openItem;
  makeItem = function (it) {
    if (!bbsCur) return _makeItem(it);
    const el = document.createElement('div');
    el.className = 'mi ' + it.kind; el.dataset.item = it.id;
    el.setAttribute('aria-label', (it.kind === 'file' ? 'File ' : it.kind === 'video' ? 'Video ' : 'Photo ') + it.name);
    if (it.kind === 'file') { el.innerHTML = '<span class="fi">📄</span><span class="fn"></span>'; el.querySelector('.fn').textContent = it.name; }
    else if (it.kind === 'image') el.innerHTML = '<img alt="">';
    else el.innerHTML = '<video muted playsinline preload="metadata"></video><span class="play"></span>';
    itemEls.set(it.id, el); placeItem(it);
    const cur = bbsCur;
    if (it.kind !== 'file') bbsBlob(it.id).then(r => {
      if (cur !== bbsCur || !r) return;
      const m = el.querySelector('img,video');
      m.addEventListener(it.kind === 'image' ? 'load' : 'loadeddata', () => { const c = it.in && byId(it.in); if (c) layoutCard(c); scheduleThreads(); }, { once: true });
      m.src = it.kind === 'video' ? r.url + '#t=0.1' : r.url;
    }).catch(() => el.classList.add('missing'));
  };
  openItem = async function (id) {
    if (!bbsCur) return _openItem(id);
    const it = itemById(id); if (!it) return;
    let r = null; try { r = await bbsBlob(id); } catch (_) {}
    if (!r) { toast("Sorry, couldn't load that from the bot's board."); return; }
    if (it.kind === 'file') { download(r.blob, it.name); return; }
    viewing = null; $('#viewHead').textContent = it.name;
    const body = $('#viewBody'); body.innerHTML = '';
    const m = document.createElement(it.kind === 'video' ? 'video' : 'img');
    if (it.kind === 'video') { m.controls = true; m.playsInline = true; m.autoplay = true; } else m.alt = it.name;
    m.src = r.url; body.appendChild(m);
    showSheet('#viewer');
  };
  $('#viewSave').addEventListener('click', async () => { // Download from the viewer also works for a bot board's photo
    if (!bbsCur || viewing) return;
    const img = $('#viewBody img,#viewBody video'); if (!img) return;
    const b = [...bbsUrls.values()].find(v => v.url === img.src.split('#')[0]); if (b) download(b.blob, $('#viewHead').textContent || 'file');
  });
}

/* ---------- reading a window ---------- */
function bbsOpenWin(id) {
  const c = byId(id); if (!c || !bbsCur) return;
  $('#bbsWinTag').textContent = `${bbsCur.meta.bot || bbsCur.slug}'s board · view only` + (c.main ? ' · Main window' : '');
  $('#bbsWinHead').textContent = c.title || 'Untitled';
  $('#bbsWinBody').innerHTML = paraHTML(c.notes) || '<p class="bbs-empty">(no notes)</p>';
  const its = itemsIn(c.id);
  $('#bbsWinMedia').innerHTML = its.map(i => `<button class="bbs-wm" data-item="${esc(i.id)}">${i.kind === 'image' ? '🖼' : i.kind === 'video' ? '🎬' : '📄'} ${esc(i.name)}</button>`).join('');
  $('#bbsWin').classList.toggle('main', !!c.main);
  $('#bbsCopy').dataset.id = c.id; // hook: "Copy to my board" (later version); the button stays hidden in v7.1
  showSheet('#bbsWin');
}
$('#bbsWinMedia').addEventListener('click', e => { const b = e.target.closest('.bbs-wm'); if (b) openItem(b.dataset.item); });
/* Hook for a later version: copy one window from the bot board onto Brad's board. In v7.1 nothing calls it and #bbsCopy is
   hidden; when it is turned on, it should add {title, notes} as a NEW window on bbsMine() (never edit the bot board). */
function bbsCopyToMyBoard(id) {
  const c = bbsCur && (bbsCur.board.cards || []).find(x => x.id === id); if (!c) return null;
  return { title: c.title, notes: c.notes, fromBot: bbsCur.meta.bot, fromSlug: bbsCur.slug, fromId: c.id };
}

/* ---------- taps / holds on a bot board (windows ignore the pointer there, so the board pans from anywhere) ---------- */
function bbsHit(x, y) {
  const inR = el => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  for (const el of [...mediaL.querySelectorAll('.mi'), ...cardsL.querySelectorAll('.mi')].reverse()) if (inR(el)) return { item: el.dataset.item };
  for (let i = S.cards.length - 1; i >= 0; i--) { const el = cardEls.get(S.cards[i].id); if (el && inR(el)) return { card: S.cards[i].id }; }
  return null;
}
let bbsTap = null;
stage.addEventListener('pointerdown', e => {
  if (!bbsCur) return;
  if (bbsTap) { bbsTap.multi = true; return; }
  if (e.target.closest('.stage-ui')) return;
  bbsTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
}, true);
function bbsTapEnd(e) {
  const t = bbsTap; if (!t || t.id !== e.pointerId) return;
  bbsTap = null;
  if (!bbsCur || e.type === 'pointercancel' || t.multi || performance.now() - t.t > 450 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10 || !$('#ctx').hidden) return;
  const h = bbsHit(e.clientX, e.clientY); if (!h) return;
  setTimeout(() => { if (h.item) openItem(h.item); else bbsOpenWin(h.card); }, 0);
}
stage.addEventListener('pointerup', bbsTapEnd, true);
stage.addEventListener('pointercancel', bbsTapEnd, true);
function bbsOnHold(kind, id, x, y) {
  if (!bbsCur) return false;
  const h = bbsHit(x, y), list = [];
  if (h && h.card) list.push({ label: 'Read this window', icon: 'view', fn: () => bbsOpenWin(h.card) });
  if (h && h.item) list.push({ label: 'View', icon: 'view', fn: () => openItem(h.item) });
  list.push({ label: 'BotBoardShare', icon: 'boards', id: 'ctxBBS', dot: bbsUnseen() > 0, fn: () => bbsPicker() });
  if (!$('#bbsLanes').hidden) list.push({ label: 'Show as lanes', icon: 'boards', fn: () => tlOpen() });
  list.push({ label: 'Back to my board', icon: 'out', fn: () => bbsHome() });
  openCtx(x, y, list);
  return true;
}

/* ---------- start ---------- */
bbsDots();
setTimeout(bbsPoll, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) bbsPoll(); });
setInterval(bbsPoll, BBS_POLL_MS);
window.__gpb.bbs = { open: bbsOpen, enter: bbsEnter, home: bbsHome, picker: bbsPicker, poll: bbsPoll, copyHook: bbsCopyToMyBoard,
  get current() { return bbsCur && { slug: bbsCur.slug, bot: bbsCur.meta.bot }; }, get mine() { return bbsMineS || S; }, get list() { return bbsList.slice(); }, get unseen() { return bbsUnseen(); } };
