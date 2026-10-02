/* save-open.js: SAVE to Downloads (JSON with photos/videos embedded), Open, and Export image (PNG). */
'use strict';
const BIG_SAVE = 60 * 1024 * 1024; // warn above ~60 MB of media
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const mb = n => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';

// The one board serializer: SAVE embeds media as data: URLs; Update to GitHub passes file references instead.
function boardEnvelope(media, extra) {
  return Object.assign({ app: 'game-plan-board', version: 2, savedAt: new Date().toISOString(),
    board: { title: S.title, cards: S.cards, threads: S.threads, items: S.items, view: S.view }, media }, extra || {});
}
async function saveFile() {
  persist();
  const total = S.items.reduce((s, i) => s + (i.size || 0), 0);
  if (total > BIG_SAVE && !confirm(`Your photos and videos add up to about ${mb(total)}. The save file will be large and may take a while. Continue?`)) return;
  if (S.items.length) toast('Saving…', { ms: 20000 });
  const media = {}; let missing = 0;
  for (const it of S.items) {
    try { const b = await MDB.get(it.id); if (b) media[it.id] = await blobToDataURL(b); else missing++; } catch (e) { missing++; }
  }
  const data = boardEnvelope(media);
  const name = `game-plan-board-${stamp()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  download(blob, name);
  toast('<span class="ok">✓ Saved to Downloads</span><br>' + esc(name) + (S.items.length ? ` (${mb(blob.size)})` : '') +
    (missing ? `<br>${missing} item(s) could not be read` : ''), { ms: 5000 });
}
async function openFile(f) {
  try {
    const d = JSON.parse(await f.text());
    const b = d && d.board ? d.board : d;
    if (!b || !Array.isArray(b.cards)) throw new Error('not a board');
    const media = d.media && typeof d.media === 'object' ? d.media : {};
    for (const [id, url] of Object.entries(media)) {
      if (typeof url !== 'string' || !url.startsWith('data:')) continue;
      const blob = await (await fetch(url)).blob();
      await MDB.put(String(id), blob);
    }
    if (Object.keys(media).length) MDB.keep();
    const arm = snap();
    cancelLinks(); S = normalize(b); renderAll(); if (!S.view) fit(); changed(); persist();
    toast('Opened “' + esc(S.title) + '”', { undo: true }); arm();
  } catch (err) { toast("Sorry, that file isn't a Game plan board save."); }
}

/* ---------- export a PNG picture ---------- */
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => {
    let line = '';
    par.split(/(\s+)/).forEach(w => {
      if (!w) return;
      const test = line + w;
      if (ctx.measureText(test).width <= maxW || !line.trim()) {
        if (ctx.measureText(test).width > maxW) { for (const ch of w) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; } line += ch; } }
        else line = test;
      } else { out.push(line.trimEnd()); line = w.trimStart(); }
    });
    out.push(line.trimEnd());
  });
  return out;
}
function offsetIn(el, host) { let x = 0, y = 0; while (el && el !== host) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x, y }; }
function drawMedia(ctx, el, x, y, w, h, V) {
  const m = el.querySelector('img,video');
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, w, h);
  if (el.classList.contains('file')) {
    ctx.fillStyle = V('--chrome'); ctx.fillRect(x, y, w, h); ctx.fillStyle = V('--chrome-ink');
    ctx.font = '700 13px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(('📄 ' + (el.querySelector('.fn')?.textContent || '')).slice(0, 30), x + 10, y + h / 2); return;
  }
  try {
    const nw = m.naturalWidth || m.videoWidth, nh = m.naturalHeight || m.videoHeight;
    if (nw && nh) { const s = Math.max(w / nw, h / nh), sw = w / s, sh = h / s; ctx.drawImage(m, (nw - sw) / 2, (nh - sh) / 2, sw, sh, x, y, w, h); }
  } catch (e) {}
  if (el.classList.contains('video')) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 18, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + w / 2 - 6, y + h / 2 - 9); ctx.lineTo(x + w / 2 + 10, y + h / 2); ctx.lineTo(x + w / 2 - 6, y + h / 2 + 9); ctx.fill(); }
}
async function exportImage() {
  const b = bounds(); if (!b) { toast('Add a window first'); return; }
  try { await document.fonts.ready; } catch (_) {}
  const cs = getComputedStyle(document.documentElement), V = n => cs.getPropertyValue(n).trim();
  const pad = 50, top = 70, W = b.w + pad * 2, H = b.h + pad + top + 30;
  let scale = 2; while (W * H * scale * scale > 16e6 && scale > 0.5) scale -= 0.25;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
  ctx.fillStyle = V('--canvas'); ctx.fillRect(0, 0, W, H);
  const ox = pad - b.x0, oy = top - b.y0;
  ctx.fillStyle = V('--dot');
  for (let gx = Math.floor(-ox / GRID) * GRID; gx + ox < W; gx += GRID) for (let gy = Math.floor(-oy / GRID) * GRID; gy + oy < H; gy += GRID) { ctx.beginPath(); ctx.arc(gx + ox, gy + oy, 1.5, 0, 7); ctx.fill(); }
  ctx.fillStyle = V('--chrome-ink'); ctx.font = '700 26px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(S.title, pad, 44);
  ctx.translate(ox, oy); ctx.lineCap = 'round';
  // 1) ropes first, so windows sit on top of them
  S.threads.forEach(t => {
    const A = byId(t.a), B = byId(t.b); if (!A || !B) return;
    const o = t.kind === 'orange', a = o ? centerPos(A) : pinPos(A), c = o ? centerPos(B) : pinPos(B);
    const sag = Math.min(70, Math.hypot(c.x - a.x, c.y - a.y) * 0.16);
    const draw = (dx, dy, col, w) => { ctx.beginPath(); ctx.moveTo(a.x + dx, a.y + dy); ctx.quadraticCurveTo((a.x + c.x) / 2 + dx, (a.y + c.y) / 2 + sag + dy, c.x + dx, c.y + dy); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    draw(2, 5, 'rgba(0,0,0,.22)', 4);
    if (o) draw(0, 0, '#FF8A1F', 5);
    else { const g = V('--thread-glow'); draw(0, 0, `rgba(${g},.16)`, 18); draw(0, 0, `rgba(${g},.34)`, 10); draw(0, 0, V('--thread'), 5); draw(0, 0, 'rgba(255,180,170,.85)', 1.6); }
  });
  // 2) windows with their text and media (drawn straight, without the tilt)
  S.cards.forEach(c => {
    const el = cardEls.get(c.id), w = cardW(c), h = cardH(c);
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.shadowColor = V('--shadow'); ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    ctx.fillStyle = V('--card'); ctx.fillRect(0, 0, w, h); ctx.shadowColor = 'transparent';
    const inner = w - 28; let y = 24; ctx.textBaseline = 'top';
    ctx.font = '700 17px "Bricolage Grotesque", system-ui, sans-serif'; ctx.fillStyle = c.title ? V('--card-ink') : V('--card-muted');
    wrapLines(ctx, c.title || 'Untitled', inner).forEach(l => { ctx.fillText(l, 14, y + 1); y += 20.4; });
    y += 6; ctx.fillStyle = 'rgba(210,73,63,.55)'; ctx.fillRect(14, y, inner, 2); y += 8;
    if (c.notes) { ctx.font = '400 15px "Atkinson Hyperlegible", system-ui, sans-serif'; ctx.fillStyle = V('--card-ink');
      paragraphs(c.notes).forEach((para, k) => { if (k) y += 10; wrapLines(ctx, para, inner).forEach(l => { ctx.fillText(l, 14, y + 3); y += 22; }); }); }
    itemsIn(c.id).forEach(it => { const m = itemEls.get(it.id); if (!m) return; const p = offsetIn(m, el); drawMedia(ctx, m, p.x, p.y, m.offsetWidth, m.offsetHeight, V); });
    ctx.restore();
  });
  // 3) pins, 4) loose photos on top
  S.cards.forEach(c => {
    const p = pinPos(c);
    ctx.beginPath(); ctx.arc(p.x + 1, p.y + 3, 10, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    const gr = ctx.createRadialGradient(p.x - 3, p.y - 3.6, 0.5, p.x, p.y, 10);
    gr.addColorStop(0, '#FFF3CF'); gr.addColorStop(0.2, V('--pin')); gr.addColorStop(0.6, V('--pin')); gr.addColorStop(1, '#9C6F1E');
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.fillStyle = gr; ctx.fill();
  });
  S.items.forEach(it => {
    if (it.in) return; const m = itemEls.get(it.id); if (!m) return;
    const w = m.offsetWidth, h = m.offsetHeight;
    if (!m.classList.contains('file')) { ctx.fillStyle = '#FFFDF8'; ctx.fillRect(it.x, it.y, w, h); drawMedia(ctx, m, it.x + 5, it.y + 5, w - 10, h - 19, V); }
    else drawMedia(ctx, m, it.x, it.y, w, h, V);
  });
  const name = `game-plan-board-${stamp()}.png`;
  cv.toBlob(blob => {
    if (!blob) { toast('Sorry, the image could not be made.'); return; }
    download(blob, name); toast('<span class="ok">✓ Image saved to Downloads</span><br>' + esc(name), { ms: 4500 });
  }, 'image/png');
}
