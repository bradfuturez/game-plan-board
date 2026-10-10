/* botboard.js: BotResponse changes, answered from TABS at the top of the screen (v6.7).
   Every waiting bot response that proposes changes to Brad's board (add / edit / remove / link / unlink, matched by
   windowId, then exact title, then trimmed case-insensitive title) is NOT drawn on the board any more. Instead a row of
   tabs sits right under the header, one per bot that is waiting, each with a red count of things to answer. Tapping a tab
   opens that bot's list in a sheet: every change shows who, why, and the window's current text → the bot's version, with
   Yes (apply it to the board, undo-able) and No (leave it). A response that only describes the bot's own work (or whose
   windows can't be found) is one item with Yes / No for the whole response. Every decision is kept per change (with the
   old text, so it can be restored) and, once all of a response's board changes are decided, the response's answer goes
   back to the bot through the usual answer path. The bottom BotResponse button still opens the full list (all bots). */
'use strict';
const BB_ACTS = ['edit', 'remove', 'link', 'unlink', 'add'];
const bbNorm = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function bbFind(id, title) { // windowId first, then exact title, then trimmed case-insensitive title
  if (id) { const c = byId(String(id)); if (c) return c; }
  if (!title) return null;
  return S.cards.find(c => c.title === title) || S.cards.find(c => bbNorm(c.title) === bbNorm(title)) || null;
}
const bbOn = r => r && r.apply !== false && !BR.answers[r.id]; // responses that may touch the board
// one entry per waiting board change: {key, r, i, c, card?, to?, ok, why}
function bbTargets() {
  const out = [];
  for (const r of brPending()) {
    if (!bbOn(r)) continue;
    (r.changes || []).forEach((c, i) => {
      if (!BB_ACTS.includes(c.type)) return;
      const key = r.id + ':' + i; if (BR.decisions[key]) return;
      const t = { key, r, i, c, ok: false, why: '' };
      if (c.type === 'add') { t.ok = !!(c.windowTitle || c.after); out.push(t); return; }
      t.card = bbFind(c.windowId, c.windowTitle);
      if (!t.card) { t.why = 'window not found'; out.push(t); return; }
      if (c.type === 'edit') { t.ok = c.after != null || !!c.titleAfter; if (!t.ok) t.why = 'nothing to change'; }
      else if (c.type === 'link' || c.type === 'unlink') { t.to = bbFind(c.toId, c.to); t.ok = !!t.to && t.to.id !== t.card.id; if (!t.ok) t.why = 'other window not found'; }
      else t.ok = true;
      out.push(t);
    });
  }
  return out;
}
const bbLive = () => bbTargets().filter(t => t.ok);
function bbSig() { return JSON.stringify(bbTargets().map(t => [t.key, t.ok, t.card && t.card.id, t.why])); }

/* ---------- the tab: "Show on board" / applied / not found, per change ---------- */
function bbTabStatus(r, c, i) {
  if (!BB_ACTS.includes(c.type) || r.apply === false) return '';
  const d = BR.decisions[r.id + ':' + i];
  if (d) return `<div class="bb-st ${d.answer === 'yes' ? 'bb-yes' : 'bb-no'}">${d.answer === 'yes' ? (d.applied ? '✓ Done on your board' : '✓ You said yes') : '✗ You said no. Your window was left as it was'}</div>`;
  if (BR.answers[r.id]) return '';
  const t = bbTargets().find(t => t.key === r.id + ':' + i);
  if (!t) return '';
  if (!t.ok) return `<div class="bb-st bb-miss">${t.why === 'window not found' ? 'Window not found on your board' : esc(t.why[0].toUpperCase() + t.why.slice(1))}</div>`;
  return `<div class="bb-btns bb-inline"><button class="bb-y" data-key="${esc(t.key)}" data-a="yes">Yes</button><button class="bb-n" data-key="${esc(t.key)}" data-a="no">No</button></div>`;
}

/* ---------- where an "add" lands when you say Yes (same spot as before: next to its "near" window, else right of the board) ---------- */
function bbGhostPos(t) {
  if (!BR.ghost) BR.ghost = {};
  if (!BR.ghost[t.key]) {
    const near = bbFind(t.c.nearId, t.c.near), b = bounds();
    const n = Object.keys(BR.ghost).length;
    BR.ghost[t.key] = near ? { x: Math.round(near.x + cardW(near) + 70), y: Math.round(near.y + n * 30) }
      : b ? { x: Math.round(b.x1 + 90), y: Math.round(b.y0 + n * 230) } : { x: 0, y: 0 };
    brSave();
  }
  return BR.ghost[t.key];
}
function bbText(v) { return `<div class="bb-txt">${paraHTML(v) || '<p class="bb-empty">(empty)</p>'}</div>`; }
function bbBody(t) {
  const c = t.c, w = t.card;
  if (c.type === 'add') return `<div class="bb-what">Add a new window</div><div class="bb-row bb-new"><i>Title</i><b>${esc(c.windowTitle || 'Untitled')}</b></div>` + (c.after ? `<div class="bb-row bb-new"><i>Text</i>${bbText(c.after)}</div>` : '');
  if (c.type === 'remove') return `<div class="bb-what">Remove this window</div><div class="bb-row bb-old"><i>“${esc(w.title || 'Untitled')}” says</i>${bbText(w.notes)}</div>`;
  if (c.type === 'link' || c.type === 'unlink') {
    const to = `<b>“${esc(t.to.title || 'Untitled')}”</b>`;
    return `<div class="bb-what">${c.type === 'link' ? `Tie ${c.rope === 'red' ? 'a red string' : 'an orange rope'} from this window to ${to}` : `Cut the ${c.rope === 'red' ? 'red string' : c.rope ? 'orange rope' : 'tie'} between this window and ${to}`}</div>`;
  }
  let h = '<div class="bb-what">Change this window</div>';
  if (c.titleAfter && c.titleAfter !== w.title) h += `<div class="bb-row bb-old"><i>Title now</i><b>${esc(w.title || 'Untitled')}</b></div><div class="bb-arrow">↓</div><div class="bb-row bb-new"><i>New title</i><b>${esc(c.titleAfter)}</b></div>`;
  if (c.after != null && c.after !== w.notes) {
    h += `<div class="bb-row bb-old"><i>Your text now</i>${bbText(w.notes)}</div><div class="bb-arrow">↓</div><div class="bb-row bb-new"><i>${esc(t.r.bot)}'s version</i>${bbText(c.after)}</div>`;
    if (c.before != null && bbNorm(c.before) !== bbNorm(w.notes)) h += '<div class="bb-warn">Your window changed since the bot looked at it.</div>';
  }
  if (h === '<div class="bb-what">Change this window</div>') h += '<div class="bb-warn">Your window already says this.</div>';
  return h;
}
const BB_VERB = { edit: 'Change', remove: 'Remove', link: 'Tie', unlink: 'Cut a tie', add: 'New window' };

/* ---------- what is waiting, one entry per thing to answer ---------- */
const btName = r => String((r && (r.bot || r.from)) || 'A bot').trim() || 'A bot';
// tab label: the bot's name, shortened for a phone ("CreateAWar Game Developer" → "Game Developer")
function btShort(n) {
  let s = String(n).trim();
  if (s.length > 14) s = s.replace(/^creat(e)?\s*a\s*war\s+/i, '') || s;
  return s.length > 22 ? s.slice(0, 21).trimEnd() + '…' : s;
}
// {bot, key, kind: 'change' (one board change, Yes = apply) | 'resp' (whole response, Yes = "it matches me"), r, t?}
function btUnits() {
  const live = bbLive(), out = [];
  for (const r of brPending()) {
    const mine = live.filter(t => t.r.id === r.id);
    if (mine.length) mine.forEach(t => out.push({ bot: btName(r), key: t.key, kind: 'change', r, t }));
    else out.push({ bot: btName(r), key: 'r:' + r.id, kind: 'resp', r });
  }
  return out;
}
function btGroups(units) { // [[bot, units]] in order of the newest response
  const m = new Map();
  for (const u of units) { if (!m.has(u.bot)) m.set(u.bot, []); m.get(u.bot).push(u); }
  return [...m];
}

/* ---------- the tabs under the header ---------- */
let btBot = null, btTabSig = '', btListSig = '', btLastYes = null;
const btCount = n => n > 99 ? '99+' : String(n);
function btRenderTabs(groups) {
  const bar = $('#botTabs'); if (!bar) return;
  const sig = JSON.stringify(groups.map(([b, l]) => [b, l.length]));
  if (sig === btTabSig) return; btTabSig = sig;
  bar.hidden = !groups.length;
  bar.innerHTML = groups.map(([b, l]) => `<button class="bt-tab" role="tab" data-bot="${esc(b)}" title="${esc(b)}" aria-label="${esc(b)}: ${l.length} waiting for your answer">` +
    `<span class="bt-name">${esc(btShort(b))}</span><b class="bt-badge">${btCount(l.length)}</b></button>`).join('');
}

/* ---------- the sheet: one bot's waiting items (or every bot's, btBot = '') ---------- */
function btCard(u, first) {
  const r = u.r, when = dsWhen(r.createdAt);
  const top = `<div class="bt-top"><span class="bt-who">${btBot ? '' : esc(u.bot)}</span>${when ? `<span class="bt-when">${esc(when)}</span>` : ''}</div>`;
  if (u.kind === 'change') {
    const t = u.t, note = t.c.note || (first ? r.summary : '') || '';
    return `<article class="bt-card" data-key="${esc(u.key)}">${top}
      <span class="bt-verb bt-v-${esc(t.c.type)}">${esc(BB_VERB[t.c.type])}</span>
      ${first && r.title ? `<h3>${esc(r.title)}</h3>` : ''}
      ${t.card ? `<div class="bt-win">Your window: <b>“${esc(t.card.title || 'Untitled')}”</b></div>` : ''}
      ${note ? `<p class="bb-note">${esc(note)}</p>` : ''}
      ${bbBody(t)}
      ${first ? brAtts(r) : ''}
      <div class="bb-btns"><button class="bb-y" data-key="${esc(t.key)}" data-a="yes">Yes</button><button class="bb-n" data-key="${esc(t.key)}" data-a="no">No</button></div>
    </article>`;
  }
  const n = (r.changes || []).length;
  return `<article class="bt-card" data-key="${esc(u.key)}">${top}
    <span class="bt-verb bt-v-resp">Update</span>
    <h3>${esc(r.title || 'Changes to the board')}</h3>
    ${r.summary ? `<p class="bb-note bt-sum">${esc(r.summary)}</p>` : ''}
    ${brAtts(r)}
    ${n ? `<div class="br-ch-head">${n} change${n > 1 ? 's' : ''}</div><ul class="br-changes">${r.changes.map((c, i) => brChange(c, i, r)).join('')}</ul>` : ''}
    <div class="bt-ask">Does this match your board?</div>
    <div class="bb-btns"><button class="bb-y" data-resp="${esc(r.id)}" data-a="yes">Yes</button><button class="bb-n" data-resp="${esc(r.id)}" data-a="no">No</button></div>
  </article>`;
}
function btRenderSheet(units, force) {
  const mine = btBot ? units.filter(u => u.bot === btBot) : units;
  const sig = JSON.stringify([btBot, mine.map(u => u.key), bbShownSig]);
  if (!force && sig === btListSig) return mine.length; btListSig = sig;
  $('#btHead').textContent = btBot || 'All bots';
  $('#btSub').textContent = mine.length ? `${mine.length} waiting · Yes puts it on your board, No throws it away` : 'All caught up';
  const seen = new Set();
  $('#btList').innerHTML = mine.length ? mine.map(u => { const f = !seen.has(u.r.id); seen.add(u.r.id); return btCard(u, f); }).join('')
    : '<div class="br-empty"><b>All caught up</b>Nothing from your bots is waiting.</div>';
  $('#btList').querySelectorAll('[data-need]').forEach(el => brEnsure(el.dataset.r, +el.dataset.i));
  return mine.length;
}
function btOpen(bot) {
  btBot = bot || ''; btLastYes = null;
  const left = btRenderSheet(btUnits(), true);
  if (!left) return;
  showSheet('#btSheet'); $('#btSheet .panel').scrollTop = 0;
}
const btIsOpen = () => openSheet && openSheet.id === 'btSheet';

/* ---------- keep tabs + sheet in step with what is waiting ---------- */
let bbShownSig = '';
function bbRefresh() {
  if (typeof cardEls === 'undefined') return;
  const live = bbLive();
  bbShownSig = bbSig() + '|' + live.map(t => t.card ? t.card.title + '\u0000' + t.card.notes : '').join('|');
  const units = btUnits();
  btRenderTabs(btGroups(units));
  if (btIsOpen()) {
    const left = btRenderSheet(units);
    if (!left) { closeSheet(); setTimeout(() => { if (btLastYes) bbShow(btLastYes); btLastYes = null; }, 280); } // that bot is done: close, show the last window you said yes to
  }
}
function bbPlaceSoon() {} // nothing is drawn on the board any more (kept: other files call it)

/* ---------- Show on board: pan / zoom to a window (used after the last Yes) ---------- */
function bbShow(id) {
  const c = byId(String(id)); if (!c) return false;
  const st = stage.getBoundingClientRect(), w = cardW(c), h = cardH(c);
  const z = clamp(Math.min(1, (st.width - 40) / w, (st.height - 40) / h), Math.max(MINZ, 0.2), MAXZ);
  S.view = { x: Math.round(st.width / 2 - (c.x + w / 2) * z), y: Math.round(st.height / 2 - (c.y + h / 2) * z), z };
  applyView(); changed();
  const el = cardEls.get(c.id);
  if (el) { el.classList.remove('bb-flash'); void el.offsetWidth; el.classList.add('bb-flash'); setTimeout(() => el.classList.remove('bb-flash'), 1000); }
  return true;
}

/* ---------- Yes / No ---------- */
function bbDecide(key, answer) {
  if (typeof bbsGuard === 'function' && bbsGuard()) return;
  const t = bbTargets().find(x => x.key === key); if (!t || BR.decisions[key]) return;
  const c = t.c, w = t.card, rec = { answer, at: new Date().toISOString(), applied: false };
  let msg = '', arm = null;
  if (answer === 'yes') {
    if (c.type === 'remove' && !confirm(`Remove “${w.title || 'Untitled'}” from your board?\n\nYou can undo right after.`)) return;
    arm = snap();
    if (w) { rec.windowId = w.id; rec.old = { title: w.title, notes: w.notes }; }
    if (c.type === 'edit') {
      if (c.titleAfter) w.title = String(c.titleAfter).slice(0, 120);
      if (c.after != null) w.notes = String(c.after);
      const el = cardEls.get(w.id); if (el) { el.querySelector('.ct').value = w.title; el.querySelector('.cn').value = w.notes; }
      layoutCard(w); renderThreads(); msg = `Changed “${esc(w.title || 'Untitled')}”`;
    } else if (c.type === 'remove') {
      deleteCard(w.id); msg = `Removed “${esc(rec.old.title || 'Untitled')}”`;
    } else if (c.type === 'link') {
      const kind = c.rope === 'red' ? 'red' : 'orange';
      if (!S.threads.some(x => x.kind === kind && [x.a, x.b].sort().join() === [w.id, t.to.id].sort().join())) S.threads.push({ a: w.id, b: t.to.id, kind });
      rec.to = t.to.id; renderThreads(); msg = `Tied “${esc(w.title || 'Untitled')}” to “${esc(t.to.title || 'Untitled')}”`;
    } else if (c.type === 'unlink') {
      rec.oldThreads = S.threads.filter(x => [x.a, x.b].sort().join() === [w.id, t.to.id].sort().join() && (!c.rope || x.kind === c.rope));
      S.threads = S.threads.filter(x => !rec.oldThreads.includes(x)); renderThreads(); msg = `Cut the tie between “${esc(w.title || 'Untitled')}” and “${esc(t.to.title || 'Untitled')}”`;
    } else if (c.type === 'add') {
      const g = bbGhostPos(t), n = { id: uid(), x: g.x, y: g.y, title: String(c.windowTitle || '').slice(0, 120), notes: String(c.after || ''), tilt: rndTilt() };
      S.cards.push(n); makeCard(n); layoutCard(n); renderThreads(); rec.windowId = n.id; msg = `Added “${esc(n.title || 'Untitled')}”`;
    }
    rec.applied = true;
    changed(); persist();
  }
  BR.decisions[key] = rec;
  const r = t.r, acts = (r.changes || []).map((x, i) => [x, i]).filter(([x]) => BB_ACTS.includes(x.type));
  const open = bbTargets().filter(x => x.r.id === r.id); // board changes of this response still waiting (incl. ones whose window is missing: those are answered in the tab)
  if (!open.length && !BR.answers[r.id]) { // every board change decided → the response's answer goes to the bot
    const all = acts.map(([, i]) => BR.decisions[r.id + ':' + i]).filter(Boolean), now = new Date();
    BR.answers[r.id] = { answer: all.length && all.every(d => d.answer === 'yes') ? 'yes' : 'no', answeredAt: now.toISOString(), localTime: longTime(now), synced: false, via: 'board' };
  }
  brSave(); brRender();
  const sent = !localStorage.getItem(PASS_KEY) ? '' : navigator.onLine ? ` ${esc(r.bot)} will see it.` : ' Sent when you are online.';
  if (answer === 'yes') { toast(`<span class="ok">✓ ${msg}</span>${sent ? '<br>' + sent.trim() : ''}`, { undo: true, ms: 7000 }); arm(); }
  else toast(`Left “${esc((w && w.title) || c.windowTitle || 'it')}” as it is.${sent ? '<br>' + sent.trim() : ''}`, { ms: 4000 });
  if (BR.answers[r.id] && !BR.answers[r.id].synced) brSync().then(() => brRender()).catch(() => {});
}

/* ---------- wiring ---------- */
$('#botTabs').addEventListener('click', e => { const b = e.target.closest('.bt-tab'); if (b) btOpen(b.dataset.bot); });
$('#btList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-key]');
  if (b) {
    const key = b.dataset.key, t = bbTargets().find(x => x.key === key);
    const card = b.closest('.bt-card'); if (card) card.classList.add(b.dataset.a === 'yes' ? 'chose-yes' : 'chose-no');
    bbDecide(key, b.dataset.a);
    if (BR.decisions[key]) { if (b.dataset.a === 'yes' && BR.decisions[key].windowId && (!t || t.c.type !== 'remove')) btLastYes = BR.decisions[key].windowId; }
    else if (card) card.classList.remove('chose-yes', 'chose-no'); // cancelled (e.g. "Remove?" → Cancel)
    return;
  }
  const r = e.target.closest('button[data-resp]'); if (r) { await brAnswer(r.dataset.resp, r.dataset.a, r); return; }
  brAttClick(e);
});
{
  const _applyView = applyView, _renderAll = renderAll, _changed = changed;
  applyView = function () { _applyView(); world.style.setProperty('--bz', String(Math.min(8, 1 / S.view.z))); };
  renderAll = function () { _renderAll(); bbRefresh(); };
  let t = 0; changed = function () { _changed(); clearTimeout(t); t = setTimeout(bbRefresh, 120); };
}
if (S.view) world.style.setProperty('--bz', String(Math.min(8, 1 / S.view.z)));
requestAnimationFrame(() => bbRefresh());
window.__gpb.bb = { targets: bbTargets, units: btUnits, open: btOpen, show: bbShow, decide: bbDecide, find: bbFind };
