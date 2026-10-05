/* botresponse.js: the "BotResponse" tab. Brad's bots keep their own copy of his game board; when one changes its copy
   it posts a response (what it added / changed / removed / linked) to botresponse/inbox/ in his PRIVATE data repo.
   The relay (same passcode as Update to GitHub and DirectShare) lists them here. While any wait for an answer the tab
   glows yellow with a count. Tapping it shows each response as a mini window with two answers:
   "Yes, it matches me" or "No". The answer is kept on this phone (and in SAVE / Update to GitHub files) and sent back
   through the relay to botresponse/answers.json, where the bots read it. Offline: answers wait and go out later. */
'use strict';
const BR_KEY = 'gpb.botresponse.v1', BR_POLL_MS = 60000;
const BR_LABEL = { yes: 'Yes, it matches me', no: 'No' };
// The first response ships with the app (it describes this feature, nothing private), so the tab glows right after the
// update even before the relay has BotResponse. The same id sits in the private inbox, so it is never shown twice.
const BR_BUILTIN = {"id":"20261005-181500-gdev63","rev":2,"bot":"CreateAWar Game Developer","createdAt":"2026-10-05T18:15:00-04:00","title":"BotResponse tab added to your board app (now with photos & files)","summary":"I built the BotResponse feature you asked for. This is the first real response: it lists what I changed in your Game plan board app, so you can check it matches what you wanted. Responses can now carry photos, videos and files too: the room picture below is one.\n\nTap \"Yes, it matches me\" if it does, or \"No\" if something is off and I'll fix it.","changes":[{"type":"add","windowTitle":"BotResponse tab","after":"New tab in the bottom bar, next to More. It glows yellow with a count while a bot response waits for your answer, and stops glowing when everything is answered."},{"type":"add","windowTitle":"Mini windows","after":"Each response shows the bot's name, the time, its title and summary, and a list of what it added, changed, removed or tied on its board. Full text, no scrolling inside."},{"type":"add","windowTitle":"Yes / No answers","after":"Two buttons on every mini window: green \"Yes, it matches me\" and red \"No\". Your answer is saved on this phone and sent back so the bot can read it. Answered ones move to Answered."},{"type":"add","windowTitle":"Photos & files","after":"A response can include pictures (tap one to see it full size), videos that play right in the mini window, and files you tap to open or download."},{"type":"edit","windowTitle":"Bottom bar","before":"Add window · SAVE · Open · More","after":"Add window · SAVE · Open · BotResponse · More"},{"type":"link","windowTitle":"BotResponse tab","to":"DirectShare","rope":"orange","note":"Uses the same private connection and passcode as DirectShare."}],"attachments":[{"name":"procgen-room-t1.jpg","type":"image","url":"media/botresponse-seed-room.jpg","mime":"image/jpeg","size":25283},{"name":"BOTRESPONSE.md","type":"file","url":"docs/BOTRESPONSE.md","mime":"text/markdown","size":2760}]};
let BR = brLoad(), brPolling = false, brNeedPass = false;
if (!BR.seeded) BR.seeded = {};
if (!BR.seeded[BR_BUILTIN.id]) { BR.seeded[BR_BUILTIN.id] = 1; if (!BR.items[BR_BUILTIN.id]) BR.items[BR_BUILTIN.id] = BR_BUILTIN; brSave(); }
else if (BR.items[BR_BUILTIN.id] && BR.items[BR_BUILTIN.id].rev !== BR_BUILTIN.rev && !BR.items[BR_BUILTIN.id].fromRelay) { BR.items[BR_BUILTIN.id] = BR_BUILTIN; brSave(); } // newer copy (e.g. now with a photo)

function brLoad() {
  try { const d = JSON.parse(localStorage.getItem(BR_KEY) || 'null'); if (d && typeof d.items === 'object' && typeof d.answers === 'object') return d; } catch (_) {}
  return { items: {}, answers: {} };
}
function brSave() { try { localStorage.setItem(BR_KEY, JSON.stringify(BR)); } catch (_) {} }
const brTime = r => +new Date(r.createdAt) || 0;
const brPending = () => Object.values(BR.items).filter(r => !BR.answers[r.id]).sort((a, b) => brTime(b) - brTime(a));
const brAnswered = () => Object.values(BR.items).filter(r => BR.answers[r.id]).sort((a, b) => (+new Date(BR.answers[b.id].answeredAt) || 0) - (+new Date(BR.answers[a.id].answeredAt) || 0));
// what goes into SAVE files and Update to GitHub (board.json → botResponses)
function brExport() {
  return Object.values(BR.items).map(r => ({ id: r.id, bot: r.bot, title: r.title, createdAt: r.createdAt,
    ...(BR.answers[r.id] ? { answer: BR.answers[r.id].answer, label: BR_LABEL[BR.answers[r.id].answer], answeredAt: BR.answers[r.id].answeredAt } : { answer: null }) }));
}

/* ---------- the glow on the tab ---------- */
function brRender() {
  const n = brPending().length, btn = $('#brBtn'), badge = $('#brBadge');
  btn.classList.toggle('br-glow', n > 0);
  badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n);
  btn.setAttribute('aria-label', n ? `BotResponse, ${n} bot response${n > 1 ? 's' : ''} waiting for your answer` : 'BotResponse');
  if (openSheet && openSheet.id === 'brSheet' && brSig() !== brShown) brRenderSheet();
}
let brShown = '';
const brSig = () => JSON.stringify([Object.keys(BR.items).sort(), BR.answers, brNeedPass]);

/* ---------- mini windows ---------- */
const BR_KIND = { add: ['Added', 'add'], edit: ['Changed', 'edit'], remove: ['Removed', 'remove'], link: ['Linked', 'link'], unlink: ['Unlinked', 'remove'], move: ['Moved', 'edit'] };
function brChange(c) {
  const [word, cls] = BR_KIND[c.type] || BR_KIND.edit, t = c.windowTitle ? `“${esc(c.windowTitle)}”` : 'a window';
  let head = `<span class="br-tag br-${cls}">${word}</span> <b>${t}</b>`, body = '';
  if (c.type === 'link' || c.type === 'unlink') {
    head += ` ${c.rope === 'red' ? 'red string' : c.rope === 'orange' ? 'orange rope' : (c.type === 'link' ? 'tied' : 'untied')} ${c.type === 'link' ? 'to' : 'from'} <b>${c.to ? `“${esc(c.to)}”` : 'another window'}</b>`;
  }
  const line = (lab, v, k) => v ? `<div class="br-${k}"><i>${lab}</i>${esc(v)}</div>` : '';
  if (c.type === 'add') body = line('Says', c.after, 'now');
  else if (c.type === 'remove') body = line('It said', c.before, 'was');
  else body = line('Was', c.before, 'was') + line('Now', c.after, 'now');
  if (c.note) body += `<div class="br-note">${esc(c.note)}</div>`;
  return `<li>${head}${body}</li>`;
}
function brCard(r) {
  const a = BR.answers[r.id], n = (r.changes || []).length;
  const when = dsWhen(r.createdAt);
  let foot;
  if (a) {
    const t = dsWhen(a.answeredAt);
    foot = `<div class="br-result br-r-${a.answer}">${a.answer === 'yes' ? '✓' : '✗'} You said: <b>${esc(BR_LABEL[a.answer])}</b>${t ? ' · ' + esc(t) : ''}` +
      `<small>${a.synced ? `${esc(r.bot)} can see your answer` : "Saved on this phone. It goes to the bot when you're online"}</small></div>`;
  } else {
    foot = `<div class="br-ask">Does this match your board?</div><div class="br-btns"><button class="br-yes" data-br="${esc(r.id)}" data-a="yes">Yes, it matches me</button><button class="br-no" data-br="${esc(r.id)}" data-a="no">No</button></div>`;
  }
  return `<article class="br-card${a ? ' answered' : ''}" data-id="${esc(r.id)}">
    <div class="br-top"><span class="br-bot">${esc(r.bot)}</span>${when ? `<span class="br-when">${esc(when)}</span>` : ''}</div>
    ${a ? foot : ''}
    <h3>${esc(r.title || 'Changes to the board')}</h3>
    ${r.summary ? `<p class="br-sum">${esc(r.summary)}</p>` : ''}
    ${brAtts(r)}
    ${n ? `<div class="br-ch-head">${n} change${n > 1 ? 's' : ''} to its board</div><ul class="br-changes">${r.changes.map(brChange).join('')}</ul>` : ''}
    ${a ? '' : foot}
  </article>`;
}
function brRenderSheet() {
  const p = brPending(), done = brAnswered(), box = $('#brList');
  let h = '';
  if (p.length) h += `<h4 class="br-sec">Waiting for you (${p.length})</h4>` + p.map(brCard).join('');
  else h += `<div class="br-empty"><b>All caught up</b>${done.length ? 'Every bot response has your answer.' : brNeedPass ? 'Tap below to connect (asks for your passcode once).' : 'When a bot changes its copy of your board, it shows up here and this tab glows yellow.'}</div>` +
    (brNeedPass ? '<div class="row"><button class="btn primary" id="brConnect">Connect</button></div>' : '');
  if (done.length) h += `<h4 class="br-sec">Answered (${done.length})</h4>` + done.slice(0, 30).map(brCard).join('');
  box.innerHTML = h; brShown = brSig();
  box.querySelectorAll('[data-need]').forEach(el => brEnsure(el.dataset.r, +el.dataset.i));
  const cb = $('#brConnect'); if (cb) cb.addEventListener('click', brConnect);
}

/* ---------- attachments: photos (tap = full size), videos (play inline), files (tap = open / download) ----------
   {name, type: image|video|file, url} ships with the app or lives on the web; {name, type, path: "botresponse/media/<id>.<ext>",
   mime, size} lives in the private data repo and is fetched through the relay (botresponse/media, or DirectShare's
   media endpoint for the same file in directshare/delivered/), then kept on this phone in IndexedDB. */
const BR_PART = 3.5 * 1024 * 1024, brUrls = new Map(), brBusy = new Set(), brFailed = new Set();
const brKey = (rid, i) => `br-${rid}-${i}`;
function brMediaKeys() { const k = []; for (const r of Object.values(BR.items)) (r.attachments || []).forEach((a, i) => { if (a.path) k.push(brKey(r.id, i)); }); return k; }
function brUrl(a) { // only https or this app's own files
  if (!a.url) return null;
  try { const u = new URL(a.url, location.href); if (u.protocol === 'https:' || u.origin === location.origin) return u.href; } catch (_) {}
  return null;
}
const brSize = n => !n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : mb(n);
const BR_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
function brAtt(r, a, i) {
  const k = brKey(r.id, i), src = brUrl(a) || brUrls.get(k) || null, name = esc(a.name || (a.path || a.url || 'file').split('/').pop()), at = `data-r="${esc(r.id)}" data-i="${i}" data-k="${k}"`;
  const type = ['image', 'video'].includes(a.type) ? a.type : 'file';
  if (type !== 'file' && !src) {
    const why = brFailed.has(k) ? (navigator.onLine ? "Couldn't load it right now. Tap to try again" : "📶 Offline. It loads when you're connected")
      : !localStorage.getItem(PASS_KEY) ? 'Connect (More → DirectShare) to load it' : 'Loading…';
    return `<button class="br-att br-ph" ${at} data-need="1" data-retry="1">${type === 'image' ? '🖼️' : '🎬'} <b>${name}</b><small>${esc(why)}</small></button>`;
  }
  if (type === 'image') return `<figure class="br-att"><button class="br-img" ${at} aria-label="Open ${name} full size"><img src="${esc(src)}" alt="${name}"></button><figcaption>${name}</figcaption></figure>`;
  if (type === 'video') return `<figure class="br-att"><video class="br-vid" ${at} src="${esc(src)}" controls playsinline preload="metadata"></video><figcaption>${name}</figcaption></figure>`;
  const sub = `<small>${esc([brSize(a.size), 'Tap to open'].filter(Boolean).join(' · '))}</small>`;
  if (src) return `<a class="br-chip" ${at} href="${esc(src)}" target="_blank" rel="noopener">${BR_FILE_ICON}<span>${name}${sub}</span></a>`; // web / bundled file: the browser opens it
  return `<button class="br-chip" ${at}>${BR_FILE_ICON}<span>${name}${sub}</span></button>`;
}
function brAtts(r) { const l = r.attachments || []; return l.length ? `<div class="br-atts">${l.map((a, i) => brAtt(r, a, i)).join('')}</div>` : ''; }
async function brFetch(a, onPart) {
  const file = String(a.path).split('/').pop(), parts = Math.max(1, Math.ceil((a.size || 1) / BR_PART));
  let last;
  for (const ep of ['botresponse/media', 'directshare/media']) {
    try {
      const bufs = [];
      for (let p = 0; p < parts; p++) { if (onPart) onPart(p, parts); bufs.push(await dsCall(`${ep}?file=${encodeURIComponent(file)}&part=${p}&size=${a.size || 0}`, {}, true)); }
      return new Blob(bufs, { type: a.mime || 'application/octet-stream' });
    } catch (e) { last = e; if (e.kind === 'passcode' || e.kind === 'offline') break; }
  }
  throw last;
}
async function brBlob(rid, i, onPart) { // stored copy, or fetch + store
  const r = BR.items[rid], a = r && (r.attachments || [])[i]; if (!a || !a.path) return null;
  const k = brKey(rid, i);
  let b = await MDB.get(k).catch(() => null);
  if (!b) { b = await brFetch(a, onPart); await MDB.put(k, b).catch(() => {}); MDB.keep(); }
  return b;
}
async function brEnsure(rid, i) {
  const k = brKey(rid, i); if (brUrls.has(k) || brBusy.has(k)) return;
  brBusy.add(k);
  try {
    let u = await MDB.url(k);
    if (!u && localStorage.getItem(PASS_KEY) && navigator.onLine) { await brBlob(rid, i); u = await MDB.url(k); }
    if (u) { brUrls.set(k, u); brFailed.delete(k); }
  } catch (e) { brFailed.add(k); }
  finally { brBusy.delete(k); }
  const el = document.querySelector(`#brList [data-k="${k}"]`), r = BR.items[rid];
  if (el && r) { const t = document.createElement('div'); t.innerHTML = brAtt(r, r.attachments[i], i); (el.closest('figure') || el).replaceWith(t.firstElementChild); }
}
let brLightSrc = null;
function brLight(src, name, rid, i) {
  brLightSrc = { src, name, rid, i };
  $('#brLightImg').src = src; $('#brLightImg').alt = name; $('#brLightName').textContent = name;
  $('#brLight').hidden = false;
}
function brLightClose() { $('#brLight').hidden = true; $('#brLightImg').removeAttribute('src'); brLightSrc = null; }
async function brOpenFile(rid, i) {
  const r = BR.items[rid], a = r && r.attachments[i]; if (!a) return;
  const name = a.name || 'file', u = brUrl(a);
  if (u) { window.open(u, '_blank', 'noopener'); return; }
  try {
    const stored = await MDB.get(brKey(rid, i)).catch(() => null);
    if (!stored) {
      if (!localStorage.getItem(PASS_KEY)) { toast('Connect first (More → DirectShare) to open files from your bots.'); return; }
      if (!navigator.onLine) { toast("📶 You're offline. The file opens when you're connected."); return; }
    }
    const b = stored || await brBlob(rid, i, (p, n) => progress(`Getting “${esc(name)}”…${n > 1 ? ' ' + Math.round(100 * p / n) + '%' : ''}`));
    $('#toast').classList.remove('show');
    download(b, name);
  } catch (e) { toast("Couldn't get that file right now. Try again in a minute."); }
}

/* ---------- talking to the relay ---------- */
async function brSync() {
  const todo = Object.entries(BR.answers).filter(([, a]) => !a.synced).map(([id, a]) => ({ id, answer: a.answer, answeredAt: a.answeredAt, localTime: a.localTime,
    bot: (BR.items[id] || {}).bot || '', title: (BR.items[id] || {}).title || '' }));
  if (!todo.length) return 0;
  const d = await dsCall('botresponse/answer', { answers: todo });
  for (const id of d.saved || []) if (BR.answers[id]) BR.answers[id].synced = true;
  brSave(); return (d.saved || []).length;
}
async function brPoll() {
  if (brPolling || document.hidden) return;
  if (!localStorage.getItem(PASS_KEY)) { brNeedPass = true; brRender(); return; }
  if (!navigator.onLine) return;
  brPolling = true;
  try {
    try { await brSync(); } catch (e) { if (e.kind === 'passcode') throw e; }
    const d = await dsCall('botresponse/list');
    brNeedPass = false;
    const server = d.answers || {}, live = new Set((d.items || []).map(r => r.id));
    for (const r of d.items || []) BR.items[r.id] = { ...r, fromRelay: 1 };
    for (const [id, a] of Object.entries(server)) {
      if (!BR.answers[id] && BR.items[id]) BR.answers[id] = { answer: a.answer, answeredAt: a.answeredAt, localTime: a.localTime, synced: true }; // answered on another device
    }
    for (const id of Object.keys(BR.items)) if (!live.has(id) && !BR.answers[id] && !server[id]) delete BR.items[id]; // the bot took it back
    brSave();
  } catch (e) {
    if (e.kind === 'passcode') brNeedPass = true;
  } finally { brPolling = false; brRender(); }
}
async function brConnect() {
  let wrong = false;
  for (;;) {
    const p = await askPasscode(wrong, 'Connect'); if (!p) return;
    localStorage.setItem(PASS_KEY, p);
    try { await dsCall('botresponse/list'); break; }
    catch (e) { if (e.kind !== 'passcode') break; localStorage.removeItem(PASS_KEY); wrong = true; }
  }
  brNeedPass = false; await brPoll();
  if (typeof dsPoll === 'function') dsPoll();
  showSheet('#brSheet');
}

async function brAnswer(id, answer, btn) {
  const r = BR.items[id]; if (!r || BR.answers[id]) return;
  const now = new Date();
  BR.answers[id] = { answer, answeredAt: now.toISOString(), localTime: longTime(now), synced: false };
  brSave();
  const card = btn && btn.closest('.br-card');
  if (card) { card.classList.add(answer === 'yes' ? 'chose-yes' : 'chose-no'); await new Promise(res => setTimeout(res, 380)); }
  brRender();
  const who = esc(r.bot);
  if (!localStorage.getItem(PASS_KEY)) { toast(`Saved: <b>${esc(BR_LABEL[answer])}</b><br>Connect once so ${who} can see it.`, { action: { label: 'Connect', fn: brConnect }, ms: 8000 }); return; }
  if (!navigator.onLine) { toast(`Saved: <b>${esc(BR_LABEL[answer])}</b><br>📶 Offline. ${who} gets it when you're connected.`, { ms: 5000 }); return; }
  try { await brSync(); toast(`<span class="ok">✓ ${esc(BR_LABEL[answer])}</span><br>${who} can see your answer now`, { ms: 4000 }); }
  catch (e) { toast(`Saved: <b>${esc(BR_LABEL[answer])}</b><br>It will reach ${who} by itself in a minute.`, { ms: 5000 }); }
  brRender();
}

$('#brList').addEventListener('click', e => {
  const b = e.target.closest('button[data-br]'); if (b) { brAnswer(b.dataset.br, b.dataset.a, b); return; }
  const im = e.target.closest('.br-img'); if (im) { const img = im.querySelector('img'); brLight(img.src, img.alt, im.dataset.r, +im.dataset.i); return; }
  const ch = e.target.closest('button.br-chip'); if (ch) { brOpenFile(ch.dataset.r, +ch.dataset.i); return; }
  const ph = e.target.closest('.br-ph'); if (ph) { brFailed.delete(ph.dataset.k); brEnsure(ph.dataset.r, +ph.dataset.i); }
});
$('#brLight').addEventListener('click', e => { if (e.target.id === 'brLightSave') return; brLightClose(); });
$('#brLightSave').addEventListener('click', async () => {
  const L = brLightSrc; if (!L) return;
  try { const b = (BR.items[L.rid] && BR.items[L.rid].attachments[L.i].path) ? await brBlob(L.rid, L.i) : await (await fetch(L.src)).blob(); download(b, L.name); }
  catch (_) { toast("Couldn't save that picture right now."); }
});
addEventListener('popstate', brLightClose);
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#brLight').hidden) brLightClose(); });
$('#brBtn').addEventListener('click', () => { brRenderSheet(); showSheet('#brSheet'); $('#brSheet .panel').scrollTop = 0; brPoll(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) brPoll(); });
addEventListener('focus', brPoll);
addEventListener('online', brPoll);
setInterval(brPoll, BR_POLL_MS);
brRender();
setTimeout(brPoll, 1000);
