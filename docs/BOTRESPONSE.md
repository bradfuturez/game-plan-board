# BotResponse (Game plan board v6.3+, attachments v6.4+, on the board v6.5+)

The **BotResponse** tab glows yellow when one of Brad's bots has changed its copy of his game board. Each response
shows as a mini window (bot, time, title, summary, a list of the changes) with two answers: **Yes, it matches me** or
**No**. Answers are saved on the phone, included in SAVE / Update to GitHub, and sent back to the bots.

Responses and answers live only in Brad's **private** data repo (never in this public repo). Bots on Brad's box post
with `/workspace/tools/botresponse/send.sh` (full guide: `/workspace/tools/botresponse/README.md`).

## Response format: `botresponse/inbox/<id>.json` (private data repo)

```json
{
 "id": "YYYYMMDD-HHMMSS-xxxxxx",
 "bot": "Bot name",
 "createdAt": "2026-10-05T18:15:00-04:00",
 "title": "Short headline",
 "summary": "What changed and why.",
 "changes": [
  {"type": "add",    "windowTitle": "New window", "after": "its text"},
  {"type": "edit",   "windowId": "y8edpc09", "windowTitle": "A window", "before": "old text", "after": "new text",
   "titleAfter": "New title (optional)", "note": "why (shown in the callout)"},
  {"type": "remove", "windowTitle": "Gone window", "before": "what it said"},
  {"type": "link",   "windowTitle": "One window", "to": "Other window", "toId": "ab12cd34", "rope": "orange"}
 ],
 "attachments": [
  {"name": "room.jpg",   "type": "image", "path": "botresponse/media/YYYYMMDD-HHMMSS-xxxxxxa1.jpg", "mime": "image/jpeg", "size": 25283},
  {"name": "clip.mp4",   "type": "video", "path": "botresponse/media/YYYYMMDD-HHMMSS-xxxxxxa2.mp4", "mime": "video/mp4", "size": 912345},
  {"name": "notes.pdf",  "type": "file",  "url": "https://example.com/notes.pdf"}
 ]
}
```

`type` is `add | edit | remove | link` (also `unlink`, `move`); optional `note`.

Optional (v6.5): `windowId` / `toId` = the window's `id` in Brad's `board.json` (stable even if he renames it),
`titleAfter` (edit: new title; `titleBefore` = old one), `near` / `nearId` (add: put the new window next to this one),
and response-level `"apply": false` for a response that only describes your own work (shown in the tab, never on the board).

## On the board (v6.5)

A waiting response whose change targets one of Brad's windows (`edit`, `remove`, `link`, `unlink`) is shown **on the board**:

- The window is found by `windowId` first, then the exact `windowTitle`, then the title trimmed / case-insensitive.
- It gets a pulsing **red glow**, and a white **bot input** callout hangs next to it on a red line (never covering it):
  bot name, the note (or summary), the window's **current** text → your version (title and/or text), attachments as
  thumbnails, and **Yes** (green) / **No** (red). The callout is drawn at screen size, so it stays readable at any zoom,
  and shows all its text (no inner scrolling). Only one callout is open at a time; the others are small "bot input" tags
  (tap to open).
- **Yes** applies it to his real window: edit = new text / title; remove = asks again, then removes; link = ties the
  rope (`rope: red` = red string); unlink = cuts it. The board saves as usual and the toast has **Undo**. The old text is
  also kept in the decision record (`before`), so it can always be restored. **No** leaves the window as it was.
- `add` shows a dashed **ghost window** (next to `near`, or right of the board) with the same Yes / No; Yes makes it real.
- If the window can't be found, the change shows only in the tab, marked **Window not found on your board**.
- Each targeted change in the tab has **Show on board** (pans / zooms to the glowing window). When the app opens with
  a new targeted response it shows it on the board by itself, once.
- When every board change of a response has a Yes / No, the response is answered (`yes` only if every change was yes) and
  sent back like a tab answer, with the per-change decisions in `changes`. The tab's own **Yes, it matches me / No**
  buttons still work as before (they answer the whole response without touching the board).

### Attachments (optional, up to 20)

`{name, type: image | video | file, path | url, mime?, size?}`

- `path`: a file in the private data repo at `botresponse/media/<YYYYMMDD-HHMMSS-xxxx>.<ext>` (same naming as DirectShare
  media; 49 MB max). Include `size` (bytes) so big files are fetched in 3.5 MB parts. The app gets the bytes through the
  relay (`botresponse/media`, or DirectShare's `directshare/media` for the same file in `directshare/delivered/`, which
  `send.sh --attach` writes as a free twin of the same git blob) and keeps them on the phone.
- `url`: an `https://` link (or a file shipped with the app). Shown straight from the web; never use it for private content.
- In the mini window: **image** = thumbnail, tap for full size (with Download); **video** = inline player;
  **file** = a chip, tap to open / download.

## Answers: `botresponse/answers.json` (private data repo)

`{"<id>": {"id", "bot", "title", "answer": "yes" | "no", "label", "answeredAt", "localTime", "changes"?}}`. The answered response
is moved to `botresponse/answered/<id>.json` with its `answer` inside. `changes` (v6.5, answers made on the board) =
`[{index, type, windowTitle, windowId, answer, applied, answeredAt, before: {title, notes}}]`: Brad's Yes / No per change,
whether it was applied to his window, and the text the window had before. The same data is also in the board file
(`botResponses[].changes`) that SAVE / Update to GitHub writes.

Note: the relay keeps `windowId`, `toId`, `titleAfter`, `apply` and the per-change `changes` from relay commit 02d6575 on.
A relay deployed before that strips them (title matching still works; per-change decisions then reach bots only through
the board file).
