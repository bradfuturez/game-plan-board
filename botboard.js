/* botboard.js: BotResponse ON the board. When a waiting bot response proposes a change to one of Brad's windows
   (edit / remove / link / unlink, matched by windowId, then exact title, then trimmed case-insensitive title), that
   window glows red and a white "bot input" callout hangs next to it on a red line, showing who, why, and the window's
   current text → the bot's version, with Yes (apply it to the window) and No (leave it). "add" changes show as a dashed
   ghost window with the same Yes / No. Callouts live in screen space so they stay readable at any zoom. Every decision
   is kept per change (with the old text, so it can be restored; Yes is also undo-able) and, once all of a response's
   board changes are decided, the response's answer goes back to the bot through the usual answer path. */
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
  return `<button class="bb-show" data-show="${esc(t.key)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>Show on board</button>`;
}

/* ---------- ghost windows for "add" ---------- */
let bbGhostL = null;
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
function bbGhosts(list) {
  if (!bbGhostL) { bbGhostL = document.createElement('div'); bbGhostL.id = 'bbGhosts'; bbGhostL.className = 'layer'; world.appendChild(bbGhostL); }
  bbGhostL.innerHTML = list.filter(t => t.c.type === 'add' && t.ok).map(t => {
    const p = bbGhostPos(t);
    return `<div class="bb-ghost" data-key="${esc(t.key)}" style="transform:translate(${p.x}px,${p.y}px)"><div class="bb-ghost-tag">New window from ${esc(t.r.bot)}</div>` +
      `<div class="ct">${esc(t.c.windowTitle || 'Untitled')}</div><div class="cv">${paraHTML(t.c.after || '')}</div></div>`;
  }).join('');
}

/* ---------- glow + callouts ---------- */
let bbShownSig = '', bbRAF = 0;
function bbRefresh() {
  if (typeof cardEls === 'undefined') return;
  const live = bbLive(), ids = new Set(live.filter(t => t.card).map(t => t.card.id));
  for (const [id, el] of cardEls) el.classList.toggle('br-glowing', ids.has(id));
  const sig = bbSig() + '|' + live.map(t => t.card ? t.card.title + '\u0000' + t.card.notes : '').join('|');
  if (sig !== bbShownSig) { bbShownSig = sig; bbBuild(live); }
  bbPlaceSoon();
  bbAutoShow(live);
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
function bbBuild(live) {
  const box = $('#bbCallouts'), seen = new Set();
  bbGhosts(live);
  box.innerHTML = live.map(t => {
    const first = !seen.has(t.r.id); seen.add(t.r.id);
    const note = t.c.note || t.r.summary || '';
    return `<section class="bb-call stage-ui" data-key="${esc(t.key)}" role="group" aria-label="${esc(t.r.bot)} suggests a change">
      <button class="bb-pill" data-open="${esc(t.key)}"><span class="bb-lab">bot input</span><b>${esc(t.r.bot)}</b><small>${esc(BB_VERB[t.c.type])} · tap to see</small></button>
      <div class="bb-full"><div class="bb-head"><span class="bb-bot">${esc(t.r.bot)}</span><span class="bb-lab">bot input</span></div>
      ${note ? `<p class="bb-note">${esc(note)}</p>` : ''}
      ${bbBody(t)}
      ${first ? brAtts(t.r) : ''}
      <div class="bb-btns"><button class="bb-y" data-key="${esc(t.key)}" data-a="yes">Yes</button><button class="bb-n" data-key="${esc(t.key)}" data-a="no">No</button></div></div>
    </section>`;
  }).join('');
  box.querySelectorAll('[data-need]').forEach(el => brEnsure(el.dataset.r, +el.dataset.i));
}
const BB_VERB = { edit: 'Change', remove: 'Remove', link: 'Tie', unlink: 'Cut a tie', add: 'New window' };
// Only one callout is open at a time (the phone is narrow); the others shrink to small "bot input" tags on their lines.
let bbActive = '', bbFit = null; // bbFit: the callout height Show on board fitted the view to
function bbPlaceSoon() { if (!bbRAF) bbRAF = requestAnimationFrame(() => { bbRAF = 0; bbPlace(); }); }
const bbOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function bbTargetRect(t, st) {
  const el = t.card ? cardEls.get(t.card.id) : bbGhostL && bbGhostL.querySelector(`.bb-ghost[data-key="${CSS.escape(t.key)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height };
}
function bbPlace() {
  const box = $('#bbCallouts'), svg = $('#bbLines'); if (!box) return;
  const st = stage.getBoundingClientRect(), W = Math.min(340, st.width - 24), GAP = 44, placed = [];
  const live = bbLive(); let lines = '';
  const rects = new Map(live.map(t => [t.key, bbTargetRect(t, st)]));
  const onScr = R => R && R.x + R.w > 0 && R.y + R.h > 0 && R.x < st.width && R.y < st.height;
  if (!live.some(t => t.key === bbActive && onScr(rects.get(t.key)))) { // open the one nearest the middle of the screen
    let best = null, bd = Infinity;
    for (const t of live) { const R = rects.get(t.key); if (!onScr(R)) continue; const d = Math.hypot(R.x + R.w / 2 - st.width / 2, R.y + R.h / 2 - st.height / 2); if (d < bd) { bd = d; best = t.key; } }
    if (best) bbActive = best;
  }
  const order = [...box.children].sort((p, q) => (q.dataset.key === bbActive) - (p.dataset.key === bbActive));
  for (const call of order) {
    const t = live.find(x => x.key === call.dataset.key), R = t && rects.get(t.key);
    if (!onScr(R)) { call.style.visibility = 'hidden'; continue; }
    const mini = call.dataset.key !== bbActive; call.classList.toggle('bb-mini', mini);
    call.style.width = mini ? '' : W + 'px'; call.style.visibility = 'visible';
    const H = call.offsetHeight, cx = R.x + R.w / 2, W0 = W, Wc = mini ? call.offsetWidth : W;
    { const W = Wc;
    const X = clamp(cx - W / 2, 12, st.width - W - 12);
    const cands = [
      { side: 'above', x: X, y: R.y - GAP - H }, { side: 'below', x: X, y: R.y + R.h + GAP },
      { side: 'right', x: R.x + R.w + GAP, y: clamp(R.y, 8, st.height - H - 8) }, { side: 'left', x: R.x - GAP - W, y: clamp(R.y, 8, st.height - H - 8) }];
    const fits = p => p.x >= 8 && p.y >= 8 && p.x + W <= st.width - 8 && p.y + H <= st.height - 8;
    const free = p => !placed.some(q => bbOverlap({ x: p.x, y: p.y, w: W, h: H }, q)) && !bbOverlap({ x: p.x, y: p.y, w: W, h: H }, R);
    let p = cands.find(q => fits(q) && free(q));
    if (!p && mini) { // a small tag: nudge it up / down to a free spot, or leave just the glow
      for (const dy of [-56, 56, -112, 112, -168, 168]) { p = cands.map(q => ({ ...q, y: q.y + dy })).find(q => fits(q) && free(q)); if (p) break; }
      if (!p) { call.style.visibility = 'hidden'; continue; }
    }
    p = p || cands.find(fits);
    call.style.zIndex = mini ? 1 : 2;
    if (!mini && bbFit && bbFit.key === call.dataset.key && Math.abs(H - bbFit.H) > 8 && Date.now() - bbFit.at < 6000) { const k = bbFit.key; bbFit = null; setTimeout(() => bbShow(k, true), 0); } // it grew (photo loaded): fit again
    if (!p) { // not enough room: the side with more space, kept on screen
      const up = R.y > st.height - (R.y + R.h);
      p = { side: up ? 'above' : 'below', x: X, y: up ? R.y - GAP - H : R.y + R.h + GAP }; // never on top of the window; drag the board to read the rest
    }
    call.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;
    call.dataset.side = p.side;
    placed.push({ x: p.x, y: p.y, w: W, h: H });
    // red connector line: callout edge → window edge, with a little sag like the ropes
    let a, b;
    if (p.side === 'above') { a = { x: clamp(cx, p.x + 24, p.x + W - 24), y: p.y + H }; b = { x: cx, y: R.y + 4 }; }
    else if (p.side === 'below') { a = { x: clamp(cx, p.x + 24, p.x + W - 24), y: p.y }; b = { x: cx, y: R.y + R.h - 4 }; }
    else if (p.side === 'right') { a = { x: p.x, y: p.y + 30 }; b = { x: R.x + R.w - 4, y: clamp(p.y + 30, R.y + 10, R.y + R.h - 10) }; }
    else { a = { x: p.x + W, y: p.y + 30 }; b = { x: R.x + 4, y: clamp(p.y + 30, R.y + 10, R.y + R.h - 10) }; }
    const d = threadPath(a, b);
    lines += `<path class="bb-glw${mini ? ' bb-thin' : ''}" d="${d}"/><path class="bb-str${mini ? ' bb-thin' : ''}" d="${d}"/><circle class="bb-dot" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="5"/>`;
    }
  }
  svg.innerHTML = lines;
}

/* ---------- Show on board: pan / zoom so the window and its callout both fit ---------- */
function bbShow(key, quiet) {
  const t = bbLive().find(x => x.key === key); if (!t) return false;
  bbActive = key; const cl = $(`#bbCallouts .bb-call[data-key="${CSS.escape(key)}"]`); if (cl) cl.classList.remove('bb-mini');
  if (openSheet) closeSheet();
  const st = stage.getBoundingClientRect(), call = $(`#bbCallouts .bb-call[data-key="${CSS.escape(key)}"]`);
  const W = Math.min(340, st.width - 24); if (call) call.style.width = W + 'px';
  const H = call ? call.offsetHeight : 260; bbFit = { key, H, at: Date.now() };
  let x0, y0, w, h;
  if (t.card) { x0 = t.card.x; y0 = t.card.y; w = cardW(t.card); h = cardH(t.card); }
  else { const g = bbGhostPos(t), el = bbGhostL && bbGhostL.querySelector(`.bb-ghost[data-key="${CSS.escape(key)}"]`); x0 = g.x; y0 = g.y; w = el ? el.offsetWidth : 240; h = el ? el.offsetHeight : 140; }
  const GAP = 44, room = st.height - H - GAP - 24; // callout above, window under it, both on screen
  const z = clamp(Math.min(1.1, (st.width - 40) / w, room / h), Math.max(MINZ, 0.2), MAXZ), total = H + GAP + h * z;
  const top = total <= st.height - 16 ? (st.height - total) / 2 + H + GAP : 12; // too tall: window at the top, callout under it
  S.view = { x: Math.round(st.width / 2 - (x0 + w / 2) * z), y: Math.round(top - y0 * z), z };
  applyView(); changed();
  const el = t.card ? cardEls.get(t.card.id) : null;
  if (el && !quiet) { el.classList.remove('bb-flash'); void el.offsetWidth; el.classList.add('bb-flash'); setTimeout(() => el.classList.remove('bb-flash'), 1000); }
  bbPlaceSoon();
  return true;
}
// a response that arrives (or is waiting when the app opens) gets shown once by itself
function bbAutoShow(live) {
  if (!BR.bbSeen) BR.bbSeen = {};
  const fresh = live.filter(t => !BR.bbSeen[t.key]);
  if (!fresh.length) return;
  fresh.forEach(t => { BR.bbSeen[t.key] = 1; }); brSave();
  if (openSheet || document.activeElement?.closest?.('.card')) return;
  setTimeout(() => bbShow(fresh[0].key, true), 60);
}

/* ---------- Yes / No ---------- */
function bbDecide(key, answer) {
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

/* ---------- wiring: follow the board as it pans, zooms, redraws ---------- */
$('#bbCallouts').addEventListener('click', e => {
  const b = e.target.closest('button[data-key]'); if (b) { bbDecide(b.dataset.key, b.dataset.a); return; }
  const o = e.target.closest('button[data-open]'); if (o) { bbShow(o.dataset.open); return; }
  brAttClick(e);
});
{
  const _applyView = applyView, _posCard = posCard, _renderAll = renderAll, _changed = changed;
  applyView = function () { _applyView(); world.style.setProperty('--bz', String(Math.min(8, 1 / S.view.z))); bbPlaceSoon(); };
  posCard = function (c) { _posCard(c); bbPlaceSoon(); };
  renderAll = function () { _renderAll(); bbShownSig = ''; bbRefresh(); };
  let t = 0; changed = function () { _changed(); clearTimeout(t); t = setTimeout(bbRefresh, 120); };
}
addEventListener('resize', bbPlaceSoon);
if (S.view) world.style.setProperty('--bz', String(Math.min(8, 1 / S.view.z)));
requestAnimationFrame(() => bbRefresh());
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { bbShownSig = ''; bbRefresh(); });
window.__gpb.bb = { targets: bbTargets, show: bbShow, decide: bbDecide, find: bbFind };
