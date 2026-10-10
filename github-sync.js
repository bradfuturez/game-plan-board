/* github-sync.js: More → "Update to GitHub". Sends the board to Brad's private GitHub repo through a small relay
   (the relay holds the GitHub access; this public app only knows a passcode, typed once and kept on this phone).
   Media go up as separate files named by their SHA-256, so repeat updates only send new photos/videos. */
'use strict';
const RELAY = 'https://game-plan-board-relay.vercel.app/api/';
const PASS_KEY = 'gpb.passcode', LAST_KEY = 'gpb.lastSent';
const GH_MAX_FILE = 50 * 1024 * 1024;   // files over this are skipped (and listed in the upload)
const GH_PART = 3.5 * 1024 * 1024;      // bytes per request (must match the relay)
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/svg+xml': 'svg',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'application/pdf': 'pdf', 'text/plain': 'txt' };
let syncing = false;

class SyncError extends Error { constructor(kind, msg) { super(msg || kind); this.kind = kind; } }
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
function extFor(it, blob) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(it.name || '');
  return (m ? m[1] : MIME_EXT[(blob.type || it.mime || '').toLowerCase()] || 'bin').toLowerCase();
}
function niceTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function longTime(d) { return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
function fileStamp(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }

async function relay(path, body, pass, isJson = true) {
  let r;
  for (let attempt = 0; ; attempt++) {
    try {
      r = await fetch(RELAY + path, { method: 'POST', body: isJson ? JSON.stringify(body) : body,
        headers: { 'content-type': isJson ? 'application/json' : 'application/octet-stream', 'x-passcode': pass } });
      break;
    } catch (e) {
      if (!navigator.onLine) throw new SyncError('offline');
      if (attempt >= 2) throw new SyncError('network');
      await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  let d = null; try { d = await r.json(); } catch (_) {}
  if (r.status === 401) throw new SyncError('passcode');
  if (!r.ok) throw new SyncError('server', (d && d.message) || ('Error ' + r.status));
  return d;
}

/* ---------- passcode sheet (asked once, then remembered on this phone) ---------- */
function askPasscode(wrong, okLabel) {
  return new Promise(resolve => {
    const sh = $('#passSheet'), inp = $('#passInput'), msg = $('#passMsg');
    sh.querySelector('button[type=submit]').textContent = okLabel || 'Send to GitHub';
    msg.textContent = wrong ? "That passcode didn't work. Please check it and try again." : 'You only need to do this once on this phone.';
    msg.classList.toggle('bad', !!wrong);
    inp.value = '';
    let done = false;
    const finish = v => { if (done) return; done = true; sh.removeEventListener('submit', onOk); obs.disconnect(); resolve(v); };
    const onOk = e => { e.preventDefault(); const v = inp.value.trim(); if (!v) { inp.focus(); return; } finish(v); closeSheet(); };
    sh.addEventListener('submit', onOk);
    const obs = new MutationObserver(() => { if (sh.hidden) finish(null); });
    obs.observe(sh, { attributes: true, attributeFilter: ['hidden'] });
    showSheet('#passSheet');
    setTimeout(() => inp.focus(), 250);
  });
}

function lastSentLabel() {
  const t = localStorage.getItem(LAST_KEY), el = $('#mGitHubSub'); if (!el) return;
  el.textContent = t ? 'Last sent ' + new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Sends your board so your assistant can see it';
}
const progress = html => toast('<span class="spin" aria-hidden="true"></span>' + html, { ms: 300000 });

const OFFLINE_MSG = "📶 You're offline right now.<br>Try <b>Update to GitHub</b> again when you're connected.";
async function updateToGitHub(typed) {
  if (syncing || (typeof bbsGuard === 'function' && bbsGuard())) return; // v7.1: only Brad's own board goes to GitHub
  if (!navigator.onLine) { toast(OFFLINE_MSG, { ms: 6000 }); return; }
  let pass = typed || localStorage.getItem(PASS_KEY);
  if (!pass) { pass = await askPasscode(false); if (!pass) return; }
  syncing = true; persist();
  try {
    progress('Getting your board ready…');
    // 1) fingerprint every photo/video/file so unchanged ones aren't sent again
    const files = [], skipped = [], media = {};
    for (const it of S.items) {
      let b = null; try { b = await MDB.get(it.id); } catch (_) {}
      if (!b) { skipped.push({ id: it.id, name: it.name, reason: 'missing on the phone' }); continue; }
      if (b.size > GH_MAX_FILE) { skipped.push({ id: it.id, name: it.name, reason: `too big (${mb(b.size)}, limit 50 MB)` }); continue; }
      const hash = hex(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()));
      const path = `media/${hash}.${extFor(it, b)}`;
      media[it.id] = { path, name: it.name, kind: it.kind, mime: b.type || it.mime || '', size: b.size, sha256: hash };
      if (!files.some(f => f.path === path)) files.push({ path, hash, blob: b, name: it.name });
    }
    // 2) ask which ones GitHub already has (this also checks the passcode)
    progress('Connecting to GitHub…');
    let have;
    for (;;) {
      try { have = (await relay('check', { paths: files.map(f => f.path) }, pass)).have || {}; break; }
      catch (e) {
        if (e.kind !== 'passcode') throw e;
        localStorage.removeItem(PASS_KEY);
        pass = await askPasscode(true); if (!pass) { syncing = false; $('#toast').classList.remove('show'); return; }
        progress('Connecting to GitHub…');
      }
    }
    localStorage.setItem(PASS_KEY, pass);
    // 3) send the new ones, in parts
    const todo = files.filter(f => !have[f.path]), shas = { ...have };
    const total = todo.reduce((s, f) => s + f.blob.size, 0); let sent = 0;
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i], parts = Math.max(1, Math.ceil(f.blob.size / GH_PART));
      let res;
      for (let p = 0; p < parts; p++) {
        const pct = total ? Math.round(100 * sent / total) : 0;
        progress(`Sending ${todo.length > 1 ? `photo/video ${i + 1} of ${todo.length}` : esc(f.name)}… ${pct}%`);
        const chunk = f.blob.slice(p * GH_PART, Math.min(f.blob.size, (p + 1) * GH_PART));
        res = await relay(`media?hash=${f.hash}&part=${p}&parts=${parts}&size=${f.blob.size}`, chunk, pass, false);
        sent += chunk.size;
      }
      shas[f.path] = res.sha;
    }
    // 4) commit board.json + history snapshot + media
    progress('Saving on GitHub…');
    const now = new Date();
    const env = boardEnvelope(media, { format: 'github', localTime: longTime(now), stamp: fileStamp(now), skipped, files: {} });
    for (const f of files) env.files[f.path] = shas[f.path];
    await relay('commit', env, pass);
    localStorage.setItem(LAST_KEY, now.toISOString()); lastSentLabel();
    toast(`<span class="ok">Sent to GitHub ✓ ${esc(niceTime(now))}</span>` + (todo.length ? `<br>${todo.length} new photo/video${todo.length > 1 ? 's' : ''} included` : '') +
      (skipped.length ? `<br>Not sent: ${skipped.map(s => esc(s.name) + ' (' + esc(s.reason) + ')').join(', ')}` : ''), { ms: skipped.length ? 9000 : 6000 });
  } catch (e) {
    const k = e instanceof SyncError ? e.kind : 'other';
    toast(k === 'offline' ? OFFLINE_MSG
      : k === 'network' ? "Couldn't reach GitHub.<br>Check your internet connection and try again."
      : "Sorry, the update didn't go through.<br>" + esc(e.message || 'Please try again in a minute.'), { ms: 8000 });
  } finally { syncing = false; }
}
$('#mGitHub').addEventListener('click', async () => {
  // First time: swap the More menu straight to the passcode sheet. Otherwise close the menu and go.
  if (!syncing && navigator.onLine && !localStorage.getItem(PASS_KEY)) { const p = await askPasscode(false); if (p) updateToGitHub(p); return; }
  closeSheet(); setTimeout(updateToGitHub, 60);
});
lastSentLabel();
