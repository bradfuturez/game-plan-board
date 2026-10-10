# Game time line (Game plan board v7.0+)

The **Game time line** tab (top of the screen, next to the window count) opens a separate view: every window on Brad's
board as a compact card (title + short preview; purple if it is a Main Window, `"main": true`) in era lanes from left
(earliest) to right (latest). The main board is never moved or changed by it.

- Hold a card, then drag it to another lane (touch, pen or mouse). Swipe / pinch / wheel / + − pan and zoom.
- Tap a card: back to the board, which flies to that window and makes it glow orange (the v6.9 locate glow) with a
  **Back to Game time line** button.
- Windows with no era are in **Unplaced**. Windows deleted from the board are not shown.

## Data: `timeline.json` (private data repo, NOT board.json)

```json
{
 "app": "game-plan-board-timeline",
 "version": 1,
 "eras": [
  {"id": "era-one", "label": "First era", "note": "optional short description"},
  {"id": "era-two", "label": "Second era"},
  {"id": "unplaced", "label": "Unplaced"}
 ],
 "placements": {"<windowId>": "era-one"},
 "updatedAt": "2026-10-09T18:00:00.000Z"
}
```

- `eras`: the lanes in order, left to right; `unplaced` is always last (added if missing). Ids: `a-z 0-9 -`, max 40.
- `placements`: `{windowId: eraId}`, `windowId` = the window's `id` in `board.json`. Missing = Unplaced.
- Era names live only in this private file, never in the public app.

## Relay (same passcode / CORS as the other endpoints)

- `POST timeline/get` `{}` → `{ok, timeline | null}`
- `POST timeline/save` `{changes: {windowId: eraId | "unplaced" | null}}` → merges the changes into the latest file in one
  commit that writes only `timeline.json` → `{ok, timeline, applied, commit}`. `eras` in the body is used only when the
  file does not exist yet.

## Bots suggesting eras (later)

A bot can propose placements as plain `{windowId: eraId}` pairs (for example in a BotResponse summary or a future
`"timeline"` change type). Applying one is just a `timeline/save` with those pairs.
