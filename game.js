'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#ffd700', // power-up - dorado
  '#ffffff', // comodín (tinte) - blanco
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const POWERUP_TYPES = ['bomb', 'lightning', 'dye', 'gravity', 'freeze'];
const POWERUP_ICONS = { bomb: '💣', lightning: '⚡', dye: '🎨', gravity: '⬇️', freeze: '❄️' };
const POWERUP_NAMES = { bomb: 'Bomba', lightning: 'Rayo', dye: 'Tinte', gravity: 'Gravedad', freeze: 'Congelar' };
const POWERUP_INTERVAL = 8; // líneas eliminadas entre apariciones de power-up
const POWERUP_COLOR = 8;
const WILDCARD_COLOR = 9;
const FREEZE_DURATION = 5000; // ms

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerupStatus = document.getElementById('powerup-status');
const powerupText = document.getElementById('powerup-text');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, linesUntilPowerUp, freezeUntil;

function gridLineColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-line').trim() || '#22222e';
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  if (board) draw();
});

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece(forcePowerUp) {
  if (forcePowerUp) {
    const effect = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const shape = [[POWERUP_COLOR, POWERUP_COLOR], [POWERUP_COLOR, POWERUP_COLOR]];
    return { type: 0, shape, effect, x: Math.floor(COLS / 2) - 1, y: 0 };
  }
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, effect: null, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesUntilPowerUp -= cleared;
    updateHUD();
  }
}

function applyPowerUp(effect, cr, cc) {
  switch (effect) {
    case 'bomb': applyBomb(cr, cc); break;
    case 'lightning': applyLightning(cr, cc); break;
    case 'dye': applyDye(); break;
    case 'gravity': applyGravity(); break;
    case 'freeze': applyFreeze(); break;
  }
}

function applyBomb(cr, cc) {
  for (let r = cr - 1; r <= cr + 1; r++)
    for (let c = cc - 1; c <= cc + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function applyLightning(cr, cc) {
  board[cr] = new Array(COLS).fill(0);
  for (let r = 0; r < ROWS; r++) board[r][cc] = 0;
  score += 50 * level;
}

function applyDye() {
  const colors = new Set();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] >= 1 && board[r][c] <= 7) colors.add(board[r][c]);
  if (!colors.size) return;
  const list = [...colors];
  const target = list[Math.floor(Math.random() * list.length)];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILDCARD_COLOR;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const colVals = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r][c] !== 0) colVals.push(board[r][c]);
    const newCol = new Array(ROWS - colVals.length).fill(0).concat(colVals);
    for (let r = 0; r < ROWS; r++) board[r][c] = newCol[r];
  }
}

function applyFreeze() {
  freezeUntil = performance.now() + FREEZE_DURATION;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.effect) {
    applyPowerUp(current.effect, current.y, current.x);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  const forcePowerUp = linesUntilPowerUp <= 0;
  if (forcePowerUp) linesUntilPowerUp = POWERUP_INTERVAL;
  next = randomPiece(forcePowerUp);
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawEffectIcon(context, x, y, w, h, size, effect) {
  const icon = POWERUP_ICONS[effect];
  if (!icon) return;
  context.font = `${size * 0.9}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(icon, (x + w / 2) * size, (y + h / 2) * size);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (current.effect)
    drawEffectIcon(ctx, current.x, current.y, current.shape[0].length, current.shape.length, BLOCK, current.effect);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);

  if (next.effect)
    drawEffectIcon(nextCtx, offX, offY, shape[0].length, shape.length, NB, next.effect);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function updatePowerupStatus() {
  if (freezeUntil && performance.now() < freezeUntil) {
    powerupStatus.hidden = false;
    powerupText.textContent = `${POWERUP_ICONS.freeze} ${POWERUP_NAMES.freeze}`;
  } else {
    freezeUntil = 0;
    powerupStatus.hidden = true;
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (!freezeUntil || ts >= freezeUntil) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  if (gameOver) return; // lockPiece pudo disparar endGame en este tick
  updatePowerupStatus();
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  linesUntilPowerUp = POWERUP_INTERVAL;
  freezeUntil = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  powerupStatus.hidden = true;
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

init();
