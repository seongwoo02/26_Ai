const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const restartButton = document.getElementById("restart-button");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const saveForm = document.getElementById("save-form");
const nicknameInput = document.getElementById("nickname");
const saveStatusEl = document.getElementById("save-status");
const skipSaveButton = document.getElementById("skip-save");
const leaderboardEl = document.getElementById("leaderboard");
const boardStatusEl = document.getElementById("board-status");
const refreshBoardButton = document.getElementById("refresh-board");

const arena = {
  width: canvas.width,
  height: canvas.height,
  padding: 28,
};

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

const player = {
  x: arena.width / 2,
  y: arena.height / 2,
  radius: 15,
  speed: 320,
};

const state = {
  arrows: [],
  running: false,
  gameOver: false,
  startTime: 0,
  lastTime: 0,
  elapsed: 0,
  best: Number(localStorage.getItem("arrow-dodge-best") || 0),
  spawnAccumulator: 0,
  leaderboard: [],
  saving: false,
  pendingScore: null,
  boardPollId: null,
};

bestScoreEl.textContent = formatScore(state.best);
updateOverlay("최대한 오래 버티세요", "시작 버튼을 누르거나 스페이스바를 눌러 게임을 시작하세요.");
render();
loadLeaderboard();
state.boardPollId = window.setInterval(() => {
  loadLeaderboard({ silent: true });
}, 10000);

function formatScore(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function updateOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
}

function setOverlayVisible(visible) {
  overlay.classList.toggle("hidden", !visible);
}

function showSaveForm(visible) {
  saveForm.classList.toggle("hidden", !visible);
}

function setSaveStatus(text, isError = false) {
  saveStatusEl.textContent = text;
  saveStatusEl.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function sanitizeNickname(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 16);
}

async function loadLeaderboard(options = {}) {
  const { silent = false } = options;

  if (!silent) {
    boardStatusEl.textContent = "리더보드를 불러오는 중...";
  }

  try {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("failed to load leaderboard");
    }

    const payload = await response.json();
    state.leaderboard = Array.isArray(payload.entries) ? payload.entries : [];
    renderLeaderboard();
    boardStatusEl.textContent = state.leaderboard.length
      ? `총 ${state.leaderboard.length}개의 기록`
      : "아직 저장된 기록이 없습니다.";
  } catch (error) {
    if (!silent) {
      boardStatusEl.textContent = "리더보드를 불러오지 못했습니다. 서버가 켜져 있는지 확인하세요.";
    }
  }
}

function renderLeaderboard() {
  leaderboardEl.innerHTML = "";

  if (!state.leaderboard.length) {
    const emptyItem = document.createElement("li");
    emptyItem.innerHTML = '<span class="rank">-</span><span class="entry-name">기록 없음</span><span class="entry-score">0.0s</span>';
    leaderboardEl.appendChild(emptyItem);
    return;
  }

  state.leaderboard.forEach((entry, index) => {
    const item = document.createElement("li");
    const safeName = escapeHtml(entry.name);
    const rankClass = index === 0 ? "rank rank-gold" : index === 1 ? "rank rank-silver" : index === 2 ? "rank rank-bronze" : "rank rank-default";
    item.innerHTML = `
      <span class="${rankClass}">#${index + 1}</span>
      <span class="entry-name">${safeName}</span>
      <span class="entry-score">${formatScore(entry.score)}</span>
    `;
    leaderboardEl.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resetGame() {
  player.x = arena.width / 2;
  player.y = arena.height / 2;
  state.arrows = [];
  state.running = true;
  state.gameOver = false;
  state.startTime = performance.now();
  state.lastTime = state.startTime;
  state.elapsed = 0;
  state.spawnAccumulator = 0;
  state.pendingScore = null;
  scoreEl.textContent = "0.0s";
  restartButton.textContent = "Restart Game";
  showSaveForm(false);
  setSaveStatus("");
  setOverlayVisible(false);
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  state.pendingScore = Number(state.elapsed.toFixed(1));

  if (state.elapsed > state.best) {
    state.best = state.elapsed;
    localStorage.setItem("arrow-dodge-best", String(state.best));
    bestScoreEl.textContent = formatScore(state.best);
  }

  updateOverlay(`Game Over: ${formatScore(state.elapsed)}`, "닉네임을 적고 리더보드에 저장할지 선택하세요.");
  setSaveStatus("");
  nicknameInput.value = "";
  showSaveForm(true);
  setOverlayVisible(true);
  window.setTimeout(() => nicknameInput.focus(), 0);
}

function currentSpawnRate(elapsed) {
  return Math.min(4.6, 1.2 + elapsed * 0.16);
}

function currentArrowSpeed(elapsed) {
  return Math.min(640, 200 + elapsed * 22);
}

function spawnArrow(elapsed) {
  const edge = Math.floor(Math.random() * 4);
  const speed = currentArrowSpeed(elapsed) * (0.88 + Math.random() * 0.28);
  let startX = 0;
  let startY = 0;
  let targetX = player.x + (Math.random() * 140 - 70);
  let targetY = player.y + (Math.random() * 140 - 70);

  if (edge === 0) {
    startX = Math.random() * arena.width;
    startY = -40;
  } else if (edge === 1) {
    startX = arena.width + 40;
    startY = Math.random() * arena.height;
  } else if (edge === 2) {
    startX = Math.random() * arena.width;
    startY = arena.height + 40;
  } else {
    startX = -40;
    startY = Math.random() * arena.height;
  }

  const dx = targetX - startX;
  const dy = targetY - startY;
  const length = Math.hypot(dx, dy) || 1;
  const vx = (dx / length) * speed;
  const vy = (dy / length) * speed;

  state.arrows.push({
    x: startX,
    y: startY,
    vx,
    vy,
    angle: Math.atan2(vy, vx),
    length: 26,
    width: 8,
  });
}

function updatePlayer(deltaSeconds) {
  let moveX = 0;
  let moveY = 0;

  if (keys.ArrowUp) moveY -= 1;
  if (keys.ArrowDown) moveY += 1;
  if (keys.ArrowLeft) moveX -= 1;
  if (keys.ArrowRight) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const magnitude = Math.hypot(moveX, moveY) || 1;
    player.x += (moveX / magnitude) * player.speed * deltaSeconds;
    player.y += (moveY / magnitude) * player.speed * deltaSeconds;
  }

  player.x = Math.max(arena.padding, Math.min(arena.width - arena.padding, player.x));
  player.y = Math.max(arena.padding, Math.min(arena.height - arena.padding, player.y));
}

function updateArrows(deltaSeconds) {
  for (const arrow of state.arrows) {
    arrow.x += arrow.vx * deltaSeconds;
    arrow.y += arrow.vy * deltaSeconds;
  }

  state.arrows = state.arrows.filter((arrow) => {
    const margin = 100;
    return (
      arrow.x > -margin &&
      arrow.x < arena.width + margin &&
      arrow.y > -margin &&
      arrow.y < arena.height + margin
    );
  });
}

function checkCollision() {
  for (const arrow of state.arrows) {
    const tipX = arrow.x + Math.cos(arrow.angle) * arrow.length * 0.55;
    const tipY = arrow.y + Math.sin(arrow.angle) * arrow.length * 0.55;
    const distance = Math.hypot(player.x - tipX, player.y - tipY);
    if (distance <= player.radius + 6) {
      return true;
    }
  }
  return false;
}

function updateSpawning(deltaSeconds) {
  const rate = currentSpawnRate(state.elapsed);
  state.spawnAccumulator += deltaSeconds * rate;

  while (state.spawnAccumulator >= 1) {
    spawnArrow(state.elapsed);
    state.spawnAccumulator -= 1;
  }
}

function drawArena() {
  const gradient = ctx.createLinearGradient(0, 0, arena.width, arena.height);
  gradient.addColorStop(0, "rgba(25, 50, 60, 0.95)");
  gradient.addColorStop(1, "rgba(39, 83, 94, 0.92)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, arena.width, arena.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= arena.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, arena.height);
    ctx.stroke();
  }

  for (let y = 0; y <= arena.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(arena.width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(247, 181, 56, 0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, arena.width - 4, arena.height - 4);
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = "#f7b538";
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fff7d6";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#1c2428";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArrow(arrow) {
  ctx.save();
  ctx.translate(arrow.x, arrow.y);
  ctx.rotate(arrow.angle);

  ctx.fillStyle = "#f2ece1";
  ctx.fillRect(-arrow.length * 0.55, -2, arrow.length * 0.6, 4);

  ctx.fillStyle = "#7b4f2d";
  ctx.fillRect(-arrow.length * 0.35, -3, arrow.length * 0.35, 6);

  ctx.fillStyle = "#d1495b";
  ctx.beginPath();
  ctx.moveTo(-arrow.length * 0.5, 0);
  ctx.lineTo(-arrow.length * 0.82, -arrow.width);
  ctx.lineTo(-arrow.length * 0.72, 0);
  ctx.lineTo(-arrow.length * 0.82, arrow.width);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#eaeaea";
  ctx.beginPath();
  ctx.moveTo(arrow.length * 0.45, 0);
  ctx.lineTo(arrow.length * 0.1, -6);
  ctx.lineTo(arrow.length * 0.1, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function render() {
  drawArena();
  for (const arrow of state.arrows) {
    drawArrow(arrow);
  }
  drawPlayer();
}

function loop(timestamp) {
  if (!state.running) {
    render();
    return;
  }

  const deltaSeconds = Math.min((timestamp - state.lastTime) / 1000, 0.032);
  state.lastTime = timestamp;
  state.elapsed = (timestamp - state.startTime) / 1000;

  updatePlayer(deltaSeconds);
  updateSpawning(deltaSeconds);
  updateArrows(deltaSeconds);

  if (checkCollision()) {
    scoreEl.textContent = formatScore(state.elapsed);
    render();
    endGame();
    return;
  }

  scoreEl.textContent = formatScore(state.elapsed);
  render();
  requestAnimationFrame(loop);
}

function handleKey(event, isPressed) {
  if (event.code === "Space") {
    const inTypingField = document.activeElement === nicknameInput;
    if (isPressed && !inTypingField && (!state.running || state.gameOver)) {
      resetGame();
    }
    if (!inTypingField) {
      event.preventDefault();
    }
    return;
  }

  if (Object.hasOwn(keys, event.key)) {
    keys[event.key] = isPressed;
    event.preventDefault();
  }
}

async function submitScore(event) {
  event.preventDefault();
  if (state.saving || state.pendingScore === null) {
    return;
  }

  const nickname = sanitizeNickname(nicknameInput.value);
  if (!nickname) {
    setSaveStatus("닉네임을 입력하세요.", true);
    return;
  }

  state.saving = true;
  setSaveStatus("기록을 저장하는 중...");

  try {
    const response = await fetch("/api/leaderboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: nickname,
        score: state.pendingScore,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "failed to save score");
    }

    setSaveStatus("리더보드에 저장했습니다.");
    state.leaderboard = payload.entries || [];
    renderLeaderboard();
    boardStatusEl.textContent = `총 ${state.leaderboard.length}개의 기록`;
    showSaveForm(false);
    updateOverlay(`Game Over: ${formatScore(state.elapsed)}`, "리더보드에 저장했습니다. 스페이스바 또는 Restart Game 버튼으로 다시 시작하세요.");
  } catch (error) {
    setSaveStatus("기록 저장에 실패했습니다. 서버가 켜져 있는지 확인하세요.", true);
  } finally {
    state.saving = false;
  }
}

function skipSave() {
  showSaveForm(false);
  setSaveStatus("");
  updateOverlay(`Game Over: ${formatScore(state.elapsed)}`, "스페이스바 또는 Restart Game 버튼으로 다시 시작하세요.");
}

window.addEventListener("keydown", (event) => handleKey(event, true));
window.addEventListener("keyup", (event) => handleKey(event, false));
restartButton.addEventListener("click", resetGame);
saveForm.addEventListener("submit", submitScore);
skipSaveButton.addEventListener("click", skipSave);
refreshBoardButton.addEventListener("click", () => loadLeaderboard());
