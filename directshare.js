/* directshare.js: More → "DirectShare". Brad's bots drop text, photos, videos and files into an inbox in his PRIVATE
   GitHub data repo; the relay (same passcode as Update to GitHub) lists them here. When there is mail, the DirectShare
   box glows red (and More gets a red dot). One tap puts every item in its own window in the middle of the screen,
   then tells the relay they were delivered so they don't come back. Quiet when offline: no errors, it just tries later. */
'use strict';
const DS_POLL_MS = 60000, DS_DONE_KEY = 'gpb.ds.done', DS_PART = 3.5 * 1024 * 1024;
let dsItems = [], dsBusy = false, dsNeedPass = false, dsPolling = false;

function dsDone() { try { return JSON.parse(localStorage.getItem(DS_DONE_KEY) || '[]'); } catch (_) { return []; } }
function dsSetDone(ids) { localStorage.setItem(DS_DONE_KEY, JSON.stringify(ids.slice(-200))); }

async function dsCall(path, body, raw) {
  const pass = localStorage.getItem(PASS_KEY); if (!pass) throw new SyncError('passcode');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), raw ? 60000 : 20000);
  let r;
  try {
    r = await fetch(RELAY + path, { method: 'POST', body: JSON.stringify(body || {}), signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-passcode': pass } });
  } catch (e) { throw new SyncError(navigator.onLine ? 'network' : 'offline'); }
  finally { clearTimeout(t); }
  if (r.status === 401) throw new SyncError('passcode');
  if (!r.ok) { let d = null; try { d = await r.json(); } catch (_) {} throw new SyncError('server', (d && d.message) || ('Error ' + r.status)); }
  return raw ? r.blob() : r.json();
}

/* ---------- the glow ---------- */
function dsRender() {
  const n = dsItems.length, btn = $('#mDirect'), sub = $('#mDirectSub'), badge = $('#dsBadge'), dot = $('#dsDot');
  btn.classList.toggle('ds-mail', n > 0);
  badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n);
  dot.hidden = !n;
  $('#moreBtn').setAttribute('aria-label', n ? `More, ${n} new DirectShare item${n > 1 ? 's' : ''}` : 'More');
  if (n) {
    const froms = [...new Set(dsItems.map(i => i.from))];
    sub.textContent = `${n} new from ${froms.slice(0, 2).join(', ')}${froms.length > 2 ? '…' : ''}. Tap to put on your board`;
  } else sub.textContent = dsNeedPass ? 'Tap to connect (asks for your passcode once)' : 'No new mail. Things your bots send show up here';
}

async function dsPoll() {
  if (dsPolling || dsBusy || document.hidden) return;
  if (!localStorage.getItem(PASS_KEY)) { dsNeedPass = true; dsRender(); return; }
  if (!navigator.onLine) return;
  dsPolling = true;
  try {
    let done = dsDone();
    if (done.length) { // acks that didn't get through last time (e.g. went offline right after delivering)
      try { await dsCall('directshare/ack', { ids: done }); dsSetDone([]); done = []; } catch (_) {}
    }
    const d = await dsCall('directshare/list');
    dsNeedPass = false;
    dsItems = (d.items || []).filter(i => !done.includes(i.id));
  } catch (e) {
    if (e.kind === 'passcode') { dsNeedPass = true; dsItems = []; }
    // offline / relay unreachable: keep whatever we knew, try again later
  } finally { dsPolling = false; dsRender(); }
}

/* ---------- delivering: each item becomes a window in the middle of the screen ---------- */
async function dsFetchMedia(m) {
  const parts = Math.max(1, Math.ceil((m.size || 1) / DS_PART)), bufs = [];
  for (let p = 0; p < parts; p++) {
    if (parts > 1) progress(`Bringing in “${esc(m.name || m.title || 'file')}”… ${Math.round(100 * p / parts)}%`);
    bufs.push(await dsCall(`directshare/media?file=${encodeURIComponent(m.file)}&part=${p}&size=${m.size || 0}`, {}, true));
  }
  return new Blob(bufs, { type: m.mime || 'application/octet-stream' });
}
function dsWhen(s) { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

async function dsDeliver() {
  if (dsBusy) return;
  if (!localStorage.getItem(PASS_KEY)) {
    let wrong = false;
    for (;;) {
      const p = await askPasscode(wrong, 'Connect'); if (!p) return;
      localStorage.setItem(PASS_KEY, p);
      try { await dsCall('directshare/list'); break; }
      catch (e) { if (e.kind !== 'passcode') break; localStorage.removeItem(PASS_KEY); wrong = true; }
    }
    dsNeedPass = false;
  } else closeSheet();
  if (!navigator.onLine) { toast("📶 You're offline right now.<br>DirectShare will check again when you're connected.", { ms: 5000 }); return; }
  dsBusy = true;
  try {
    progress('Checking DirectShare…');
    let items;
    try { const done = dsDone(); items = ((await dsCall('directshare/list')).items || []).filter(i => !done.includes(i.id)); }
    catch (e) {
      toast(e.kind === 'passcode' ? "Your passcode didn't work. Tap DirectShare to enter it again." : "Couldn't reach DirectShare right now.<br>It will try again by itself.", { ms: 6000 });
      if (e.kind === 'passcode') { localStorage.removeItem(PASS_KEY); dsNeedPass = true; }
      return;
    }
    if (!items.length) { dsItems = []; toast('No new DirectShare mail'); return; }
    const center = viewCenter(), placed = [], made = [];
    let failed = 0;
    for (const m of items) {
      progress(`Putting ${items.length > 1 ? `item ${placed.length + failed + 1} of ${items.length}` : 'it'} on your board…`);
      let blob = null;
      if (m.file) { try { blob = await dsFetchMedia(m); } catch (e) { failed++; continue; } }
      const by = '— sent by ' + m.from + (dsWhen(m.created) ? ', ' + dsWhen(m.created) : '');
      const title = (m.title || (m.type === 'text' ? 'From ' + m.from : m.name || 'From ' + m.from)).slice(0, 120);
      const c = { id: uid(), x: 0, y: 0, title, notes: (m.text ? m.text.replace(/\s+$/, '') + '\n\n' : '') + by, tilt: rndTilt() };
      S.cards.push(c); makeCard(c);
      if (blob) {
        const kind = m.type === 'image' || m.type === 'video' ? m.type : 'file';
        const it = { id: uid(), x: 0, y: 0, kind, name: m.name || m.file, mime: blob.type || m.mime || '', size: blob.size, in: c.id };
        try { await MDB.put(it.id, blob); S.items.push(it); makeItem(it); } catch (e) { c.notes += '\n\n(Could not store ' + (m.name || 'the file') + ' on this phone: storage full?)'; }
      }
      layoutCard(c); made.push(c); placed.push(m.id);
    }
    // centre the new windows in the current view, slightly staggered so each one shows
    const k0 = (made.length - 1) / 2;
    made.forEach((c, k) => {
      c.x = Math.round(center.x - cardW(c) / 2 + (k - k0) * 26);
      c.y = Math.round(center.y - cardH(c) / 2 + (k - k0) * 30);
      posCard(c);
    });
    renderThreads();
    if (S.items.length) MDB.keep();
    changed(); persist();
    if (placed.length) {
      dsSetDone([...dsDone(), ...placed]);
      try { await dsCall('directshare/ack', { ids: placed }); dsSetDone(dsDone().filter(id => !placed.includes(id))); } catch (_) { /* retried on the next check */ }
    }
    dsItems = items.filter(i => !placed.includes(i.id));
    const n = placed.length;
    toast(n ? `<span class="ok">✓ ${n} DirectShare item${n > 1 ? 's' : ''} on your board</span><br>Drag ${n > 1 ? 'them' : 'it'} wherever you like` + (failed ? `<br>${failed} couldn't be brought in, it will try again` : '')
      : "Couldn't bring those in right now. They'll wait in DirectShare.", { ms: 5000 });
  } finally { dsBusy = false; dsRender(); }
}

$('#mDirect').addEventListener('click', dsDeliver);
document.addEventListener('visibilitychange', () => { if (!document.hidden) dsPoll(); });
addEventListener('focus', dsPoll);
addEventListener('online', dsPoll);
setInterval(dsPoll, DS_POLL_MS);
dsRender();
setTimeout(dsPoll, 800);
