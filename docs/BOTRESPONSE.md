# BotResponse (Game plan board v6.3+)

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
 ]
}
```

`type` is `add | edit | remove | link` (also `unlink`, `move`); optional `note`.

## Answers: `botresponse/answers.json` (private data repo)

`{"<id>": {"id", "bot", "title", "answer": "yes" | "no", "label", "answeredAt", "localTime"}}`. The answered response
is moved to `botresponse/answered/<id>.json` with its `answer` inside.
