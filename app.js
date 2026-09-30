/* app.js: bottom sheets, menus, header, importing media, the photo/video viewer, app updates, start-up. */
'use strict';

/* ---------- bottom sheets; Android back button closes them ---------- */
let openSheet = null, sheetAt = 0;
function showSheet(sel) {
  const swap = !!openSheet;
  if (openSheet) hideSheetNow();
  $('#toast').classList.remove('show'); closeCtx();
  openSheet = $(sel); openSheet.hidden = false; sheetAt = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => openSheet && openSheet.classList.add('open')));
  if (swap && history.state && history.state.sheet) history.replaceState({ sheet: 1 }, '');
  else history.pushState({ sheet: 1 }, '');
}
function closeSheet() { if (!openSheet) return; if (history.state && history.state.sheet) history.back(); else hideSheetNow(); }
function hideSheetNow() {
  const el = openSheet; if (!el) return; openSheet = null;
  el.classList.remove('open'); el.hidden = true;
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  if (el.id === 'viewer') { el.querySelectorAll('video').forEach(v => v.pause()); $('#viewBody').innerHTML = ''; }
}
addEventListener('popstate', () => { if (openSheet) hideSheetNow(); });
// (ignore the backdrop for a moment: the click from the tap that opened a sheet must not close it again)
document.querySelectorAll('.sheet').forEach(s => s.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c && !(c.classList.contains('backdrop') && performance.now() - sheetAt < 450)) closeSheet(); }));
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#ctx').hidden) closeCtx(); else if (openSheet) closeSheet(); else cancelLinks();
});

/* ---------- importing photos, videos and files ---------- */
let importAt = null;
function pickMedia(at) { importAt = at || viewCenter(); $('#mediaInput').click(); }
async function importFiles(files) {
  const at = importAt || viewCenter(); importAt = null;
  let n = 0, failed = 0;
  for (const f of files) {
    const kind = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : 'file';
    const it = { id: uid(), x: Math.round(at.x - 75 + n * 24), y: Math.round(at.y - 50 + n * 24), kind, name: f.name || kind, mime: f.type || '', size: f.size || 0, in: null };
    try { await MDB.put(it.id, f); } catch (e) { failed++; continue; }
    S.items.push(it); makeItem(it); n++;
  }
  if (n) { MDB.keep(); changed(); persist(); }
  toast(failed ? `Added ${n}. ${failed} could not be stored (phone storage full?).`
    : n === 1 ? 'Added. Drag it onto a window to put it inside.' : `Added ${n} items. Drag them onto a window to put them inside.`, { ms: 4500 });
}
$('#mediaInput').addEventListener('change', e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) importFiles(files); });

/* ---------- viewing / playing ---------- */
let viewing = null;
async function openItem(id) {
  const it = itemById(id); if (!it) return;
  if (it.kind === 'file') { const b = await MDB.get(id).catch(() => null); if (b) download(b, it.name); else toast('Sorry, that file is missing.'); return; }
  const url = await MDB.url(id); if (!url) { toast('Sorry, that item is missing.'); return; }
  viewing = it; $('#viewHead').textContent = it.name;
  const body = $('#viewBody'); body.innerHTML = '';
  const m = document.createElement(it.kind === 'video' ? 'video' : 'img');
  if (it.kind === 'video') { m.controls = true; m.playsInline = true; m.autoplay = true; } else m.alt = it.name;
  m.src = url; body.appendChild(m);
  showSheet('#viewer');
}
$('#viewSave').addEventListener('click', async () => { if (!viewing) return; const b = await MDB.get(viewing.id).catch(() => null); if (b) download(b, viewing.name); });

/* ---------- toolbar, header, menu ---------- */
$('#linkCancel').addEventListener('click', cancelLinks);
$('#zoomIn').addEventListener('click', () => centerZoom(1.25));
$('#zoomOut').addEventListener('click', () => centerZoom(0.8));
$('#zoomFit').addEventListener('click', () => fit());
let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(applyView, 100); });
const titleIn = $('#title');
titleIn.addEventListener('input', () => { S.title = titleIn.value; changed(); });
titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') titleIn.blur(); });
titleIn.addEventListener('blur', () => { if (!titleIn.value.trim()) { S.title = titleIn.value = 'Game plan board'; changed(); } });
$('#themeBtn').addEventListener('click', toggleTheme);
$('#addBtn').addEventListener('click', () => addCard());
$('#saveBtn').addEventListener('click', saveFile);
$('#openBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) openFile(f); });
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#mInstall').hidden = false; });
addEventListener('appinstalled', () => { installEvt = null; $('#mInstall').hidden = true; toast('Installed! Look for Game plan board on your home screen.'); });
$('#moreBtn').addEventListener('click', () => showSheet('#menuSheet'));
$('#mImport').addEventListener('click', () => { hideSheetNow(); if (history.state && history.state.sheet) history.back(); pickMedia(viewCenter()); });
$('#mImage').addEventListener('click', () => { closeSheet(); setTimeout(exportImage, 50); });
$('#mFit').addEventListener('click', () => { closeSheet(); fit(); });
function breaksLabel() { $('#mBreaksLabel').innerHTML = 'Keep my line breaks: ' + (keepBreaks ? 'On' : 'Off') + '<small>' + (keepBreaks ? 'On: every line break shows as typed' : 'Off: notes flow as paragraphs (blank line = new paragraph)') + '</small>'; }
$('#mBreaks').addEventListener('click', () => { keepBreaks = !keepBreaks; localStorage.setItem('gpb.breaks', keepBreaks ? '1' : '0'); breaksLabel(); S.cards.forEach(layoutCard); renderThreads(); closeSheet(); toast(keepBreaks ? 'Line breaks kept as typed' : 'Notes flow as paragraphs'); });
$('#mTheme').addEventListener('click', () => { toggleTheme(); closeSheet(); });
$('#mHelp').addEventListener('click', () => showSheet('#helpSheet'));
$('#mInstall').addEventListener('click', () => { closeSheet(); if (installEvt) { installEvt.prompt(); installEvt = null; $('#mInstall').hidden = true; } });
$('#mNew').addEventListener('click', () => {
  const arm = snap(); closeSheet(); cancelLinks();
  S = { title: 'Game plan board', cards: [], threads: [], items: [], view: null }; renderAll(); changed(); persist();
  toast('New empty board', { undo: true }); arm();
});

/* ---------- app updates: new versions take over promptly ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // first install, nothing to update
    persist();
    toast('A new version of the app is ready.', { action: { label: 'Update', fn: () => location.reload() }, ms: 60000 });
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {}));
}

/* ---------- start ---------- */
applyTheme(); breaksLabel();
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
const firstRun = !localStorage.getItem(KEY);
renderAll();
if (firstRun) persist();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { resetSizes(); S.cards.forEach(layoutCard); renderThreads(); if (firstRun) { fit(false); persist(); } });
setTimeout(() => MDB.cleanup(S.items.map(i => i.id)), 1500);
window.__gpb = { get state() { return S; }, MDB }; // for testing
