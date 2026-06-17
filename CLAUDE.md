# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly in a browser:

```bash
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux
```

Or serve locally (recommended, avoids some browser restrictions):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600 px) for the playfield, `<canvas id="next-canvas">` (120×120 px) for the piece preview, a side panel with score/lines/level displays, and an overlay div toggled for PAUSE and GAME OVER states.
- **`style.css`** — Dark/retro aesthetic using flexbox layout and `backdrop-filter` on the overlay.
- **`game.js`** — All game logic (~300 lines, `'use strict'`, no modules).

### Key data model

- `board`: `ROWS × COLS` (20×10) 2-D array. `0` = empty, `1–7` = color index matching `COLORS[]` and `PIECES[]`.
- `current` / `next`: piece objects `{ type, shape, x, y }` where `shape` is a 2-D matrix of color indices.

### Core functions to know

| Function | Purpose |
|---|---|
| `collide(shape, ox, oy)` | Bounds + overlap check against `board` |
| `rotateCW(shape)` | Transpose + reverse rows; used by `tryRotate` |
| `tryRotate()` | Applies rotation with wall-kick offsets `[0, -1, 1, -2, 2]` |
| `ghostY()` | Projects current piece down to find landing row |
| `lockPiece()` | `merge → clearLines → spawn` sequence |
| `clearLines()` | Iterates board bottom-up; splices full rows and unshifts empty ones |
| `loop(ts)` | `requestAnimationFrame` game loop; accumulates `dropAccum` against `dropInterval` |
| `init()` | Full reset; also wired to the Restart button |

### Tunable constants (top of `game.js`)

- `COLS`, `ROWS`, `BLOCK` — board dimensions and pixel size per cell. If changed, update `width`/`height` on `<canvas id="board">` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
- `LINE_SCORES` — points for 1/2/3/4 lines cleared (`[0, 100, 300, 500, 800]`), multiplied by current level.
- Drop speed: `Math.max(100, 1000 − (level − 1) × 90)` ms per row, recalculated in `clearLines`.
