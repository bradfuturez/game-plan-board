# BotResponse (Game plan board v6.3+, attachments v6.4+)

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
  {"type": "edit",   "windowTitle": "A window", "before": "old text", "after": "new text"},
  {"type": "remove", "windowTitle": "Gone window", "before": "what it said"},
  {"type": "link",   "windowTitle": "One window", "to": "Other window", "rope": "orange"}
 ],
 "attachments": [
  {"name": "room.jpg",   "type": "image", "path": "botresponse/media/YYYYMMDD-HHMMSS-xxxxxxa1.jpg", "mime": "image/jpeg", "size": 25283},
  {"name": "clip.mp4",   "type": "video", "path": "botresponse/media/YYYYMMDD-HHMMSS-xxxxxxa2.mp4", "mime": "video/mp4", "size": 912345},
  {"name": "notes.pdf",  "type": "file",  "url": "https://example.com/notes.pdf"}
 ]
}
```

`type` is `add | edit | remove | link` (also `unlink`, `move`); optional `note`.

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

`{"<id>": {"id", "bot", "title", "answer": "yes" | "no", "label", "answeredAt", "localTime"}}`. The answered response
is moved to `botresponse/answered/<id>.json` with its `answer` inside.
