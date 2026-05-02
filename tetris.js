(function () {
  const LEADERBOARD_URL = "https://jsonblob.com/api/jsonBlob/019ddaab-5e0c-7206-9c5d-94827e756807";
  const INITIALS_STORAGE_KEY = "tetris-site-initials-v1";
  const BOARD_WIDTH = 10;
  const BOARD_HEIGHT = 20;
  const CELL_SIZE = 30;
  const PREVIEW_CELL_SIZE = 24;
  const MAX_LEADERBOARD_ENTRIES = 12;
  const PIECE_TYPES = ["I", "J", "L", "O", "S", "T", "Z"];
  const PIECE_VALUES = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };
  const COLORS = {
    1: "#32c8c0",
    2: "#4f79d8",
    3: "#ff9f43",
    4: "#f7d154",
    5: "#46c36f",
    6: "#b06bf2",
    7: "#ef5d7a"
  };
  const PIECES = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    J: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    L: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ],
    O: [
      [1, 1],
      [1, 1]
    ],
    S: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ],
    T: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    Z: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ]
  };
  const scoreFormatter = new Intl.NumberFormat("ru-RU");
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  });

  window.createTetrisArcade = function createTetrisArcade() {
    const elements = {
      view: document.querySelector("#tetrisView"),
      canvas: document.querySelector("#tetrisCanvas"),
      nextCanvas: document.querySelector("#tetrisNextCanvas"),
      overlay: document.querySelector("#tetrisOverlay"),
      score: document.querySelector("#tetrisScore"),
      lines: document.querySelector("#tetrisLines"),
      level: document.querySelector("#tetrisLevel"),
      startButton: document.querySelector("#tetrisStartButton"),
      pauseButton: document.querySelector("#tetrisPauseButton"),
      refreshButton: document.querySelector("#leaderboardRefreshButton"),
      form: document.querySelector("#leaderboardForm"),
      initialsInput: document.querySelector("#leaderboardInitials"),
      submitButton: document.querySelector("#leaderboardSubmitButton"),
      hint: document.querySelector("#leaderboardHint"),
      list: document.querySelector("#leaderboardList"),
      status: document.querySelector("#leaderboardStatus")
    };

    if (!elements.canvas || !elements.nextCanvas) {
      return {
        setActive() {},
        refreshLeaderboard() {}
      };
    }

    const context = elements.canvas.getContext("2d");
    const nextContext = elements.nextCanvas.getContext("2d");

    context.scale(CELL_SIZE, CELL_SIZE);
    nextContext.scale(PREVIEW_CELL_SIZE, PREVIEW_CELL_SIZE);

    const state = {
      active: false,
      running: false,
      paused: false,
      gameOver: false,
      board: createMatrix(BOARD_WIDTH, BOARD_HEIGHT),
      bag: [],
      currentPiece: null,
      nextPiece: null,
      score: 0,
      lines: 0,
      level: 1,
      dropInterval: getDropInterval(1),
      dropCounter: 0,
      lastTime: 0,
      animationFrameId: 0,
      leaderboardEntries: [],
      leaderboardBusy: false,
      lastLeaderboardFetch: 0,
      pendingSubmission: null,
      lastSubmittedId: ""
    };

    bindEvents();
    hydrateInitials();
    updateStats();
    updateButtons();
    updateSubmissionState();
    drawScene();
    showOverlay("Нажми «Новая игра»");
    renderLeaderboard();
    refreshLeaderboard({ force: true });

    return {
      setActive,
      refreshLeaderboard
    };

    function bindEvents() {
      elements.startButton.addEventListener("click", startGame);
      elements.pauseButton.addEventListener("click", togglePause);
      elements.refreshButton.addEventListener("click", () => {
        refreshLeaderboard({ force: true });
      });
      elements.form.addEventListener("submit", submitScore);
      elements.initialsInput.addEventListener("input", () => {
        const initials = normalizeInitials(elements.initialsInput.value);
        elements.initialsInput.value = initials;
        saveInitials(initials);
        updateSubmissionState();
      });
      window.addEventListener("keydown", handleKeydown);
    }

    function setActive(isActive) {
      state.active = Boolean(isActive);

      if (!state.active && state.running && !state.paused && !state.gameOver) {
        togglePause(true);
      }

      if (state.active) {
        const isStale = Date.now() - state.lastLeaderboardFetch > 60000;
        if (!state.lastLeaderboardFetch || isStale) {
          refreshLeaderboard({ force: isStale });
        }
      }
    }

    function startGame() {
      state.board = createMatrix(BOARD_WIDTH, BOARD_HEIGHT);
      state.bag = [];
      state.score = 0;
      state.lines = 0;
      state.level = 1;
      state.dropInterval = getDropInterval(1);
      state.dropCounter = 0;
      state.lastTime = 0;
      state.running = true;
      state.paused = false;
      state.gameOver = false;
      state.pendingSubmission = null;
      state.lastSubmittedId = "";
      state.currentPiece = null;
      state.nextPiece = createPiece(drawPieceType());

      spawnNextPiece();
      updateStats();
      updateButtons();
      updateSubmissionState();
      hideOverlay();
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = requestAnimationFrame(update);
    }

    function drawPieceType() {
      if (!state.bag.length) {
        state.bag = shuffleArray([...PIECE_TYPES]);
      }

      return state.bag.pop();
    }

    function update(time = 0) {
      if (!state.running) return;

      const deltaTime = time - state.lastTime;
      state.lastTime = time;

      if (!state.paused) {
        state.dropCounter += deltaTime;
        if (state.dropCounter >= state.dropInterval) {
          dropPiece();
        }
      }

      drawScene();
      state.animationFrameId = requestAnimationFrame(update);
    }

    function dropPiece() {
      if (!state.currentPiece) return;

      state.currentPiece.pos.y += 1;

      if (collides(state.board, state.currentPiece.matrix, state.currentPiece.pos)) {
        state.currentPiece.pos.y -= 1;
        lockPiece();
        return;
      }

      state.dropCounter = 0;
    }

    function softDrop() {
      if (!canControlPiece()) return;

      state.currentPiece.pos.y += 1;

      if (collides(state.board, state.currentPiece.matrix, state.currentPiece.pos)) {
        state.currentPiece.pos.y -= 1;
        lockPiece();
        return;
      }

      state.score += 1;
      state.dropCounter = 0;
      updateStats();
    }

    function hardDrop() {
      if (!canControlPiece()) return;

      let distance = 0;

      while (!collides(state.board, state.currentPiece.matrix, { x: state.currentPiece.pos.x, y: state.currentPiece.pos.y + 1 })) {
        state.currentPiece.pos.y += 1;
        distance += 1;
      }

      state.score += distance * 2;
      updateStats();
      lockPiece();
    }

    function lockPiece() {
      merge(state.board, state.currentPiece.matrix, state.currentPiece.pos);
      clearLines();
      spawnNextPiece();
      state.dropCounter = 0;
    }

    function spawnNextPiece() {
      state.currentPiece = state.nextPiece || createPiece(drawPieceType());
      state.nextPiece = createPiece(drawPieceType());
      state.currentPiece.pos = {
        x: Math.floor(BOARD_WIDTH / 2) - Math.ceil(state.currentPiece.matrix[0].length / 2),
        y: 0
      };

      if (collides(state.board, state.currentPiece.matrix, state.currentPiece.pos)) {
        finishGame();
      }
    }

    function finishGame() {
      state.running = false;
      state.gameOver = true;
      cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = 0;
      state.pendingSubmission =
        state.score > 0
          ? {
              id: createEntryId(),
              score: state.score,
              lines: state.lines,
              level: state.level
            }
          : null;

      updateButtons();
      updateSubmissionState();

      if (state.pendingSubmission) {
        showOverlay(`Игра окончена: ${formatScore(state.score)} очков. Введи инициалы и сохрани рекорд.`);
      } else {
        showOverlay("Игра окончена. Нажми «Новая игра», чтобы начать заново.");
      }
    }

    function togglePause(forceState) {
      if (!state.running || state.gameOver) return;

      state.paused = typeof forceState === "boolean" ? forceState : !state.paused;
      updateButtons();

      if (state.paused) {
        showOverlay("Пауза");
      } else {
        hideOverlay();
      }
    }

    function movePiece(direction) {
      if (!canControlPiece()) return;

      state.currentPiece.pos.x += direction;

      if (collides(state.board, state.currentPiece.matrix, state.currentPiece.pos)) {
        state.currentPiece.pos.x -= direction;
      }
    }

    function rotatePiece(direction) {
      if (!canControlPiece()) return;

      const originalX = state.currentPiece.pos.x;
      rotateMatrix(state.currentPiece.matrix, direction);

      let offset = 1;
      while (collides(state.board, state.currentPiece.matrix, state.currentPiece.pos)) {
        state.currentPiece.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));

        if (Math.abs(offset) > state.currentPiece.matrix[0].length) {
          rotateMatrix(state.currentPiece.matrix, -direction);
          state.currentPiece.pos.x = originalX;
          return;
        }
      }
    }

    function clearLines() {
      let cleared = 0;

      for (let row = state.board.length - 1; row >= 0; row -= 1) {
        if (state.board[row].every((cell) => cell !== 0)) {
          const clearedRow = state.board.splice(row, 1)[0].fill(0);
          state.board.unshift(clearedRow);
          cleared += 1;
          row += 1;
        }
      }

      if (!cleared) return;

      const lineScores = [0, 100, 300, 500, 800];

      state.lines += cleared;
      state.score += (lineScores[cleared] || cleared * 250) * state.level;
      state.level = Math.max(1, Math.floor(state.lines / 10) + 1);
      state.dropInterval = getDropInterval(state.level);
      updateStats();
    }

    function handleKeydown(event) {
      if (!state.active) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return;

      const isGameKey =
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.code === "Space" ||
        event.key === "p" ||
        event.key === "P";

      if (!isGameKey) return;

      event.preventDefault();

      if (event.key === "p" || event.key === "P") {
        togglePause();
        return;
      }

      if (!state.running || state.paused) return;

      switch (event.key) {
        case "ArrowLeft":
          movePiece(-1);
          break;
        case "ArrowRight":
          movePiece(1);
          break;
        case "ArrowDown":
          softDrop();
          break;
        case "ArrowUp":
          rotatePiece(1);
          break;
        default:
          if (event.code === "Space") {
            hardDrop();
          }
      }
    }

    function canControlPiece() {
      return state.active && state.running && !state.paused && !state.gameOver && Boolean(state.currentPiece);
    }

    function updateStats() {
      elements.score.textContent = formatScore(state.score);
      elements.lines.textContent = formatScore(state.lines);
      elements.level.textContent = formatScore(state.level);
    }

    function updateButtons() {
      elements.pauseButton.disabled = !state.running || state.gameOver;
      elements.pauseButton.textContent = state.paused ? "Продолжить" : "Пауза";
    }

    function updateSubmissionState() {
      const initials = normalizeInitials(elements.initialsInput.value);
      const canSubmit = hasValidInitials(initials) && Boolean(state.pendingSubmission) && !state.leaderboardBusy;
      const wasSubmitted = Boolean(state.lastSubmittedId);

      elements.submitButton.disabled = !canSubmit || wasSubmitted;

      if (wasSubmitted) {
        elements.hint.textContent = "Рекорд сохранён. Обнови список, если хочешь перепроверить общую таблицу.";
        return;
      }

      if (state.pendingSubmission) {
        elements.hint.textContent =
          `Игра закончена на ${formatScore(state.pendingSubmission.score)} очках. Введи инициалы и отправь рекорд.`;
        return;
      }

      elements.hint.textContent = "Закончи игру и отправь счёт, чтобы он появился у всех посетителей.";
    }

    function showOverlay(text) {
      elements.overlay.textContent = text;
      elements.overlay.classList.remove("hidden");
    }

    function hideOverlay() {
      elements.overlay.textContent = "";
      elements.overlay.classList.add("hidden");
    }

    function drawScene() {
      fillCanvas(context, "#0b1310", BOARD_WIDTH, BOARD_HEIGHT);
      drawGrid(context, BOARD_WIDTH, BOARD_HEIGHT);
      drawMatrix(context, state.board, { x: 0, y: 0 });

      if (state.currentPiece) {
        drawGhostPiece();
        drawMatrix(context, state.currentPiece.matrix, state.currentPiece.pos);
      }

      fillCanvas(nextContext, "#0b1310", 5, 5);
      drawGrid(nextContext, 5, 5, 0.08);
      drawNextPiece();
    }

    function drawGhostPiece() {
      if (!state.currentPiece) return;

      const ghostPosition = {
        x: state.currentPiece.pos.x,
        y: state.currentPiece.pos.y
      };

      while (!collides(state.board, state.currentPiece.matrix, { x: ghostPosition.x, y: ghostPosition.y + 1 })) {
        ghostPosition.y += 1;
      }

      context.save();
      context.globalAlpha = 0.2;
      drawMatrix(context, state.currentPiece.matrix, ghostPosition);
      context.restore();
    }

    function drawNextPiece() {
      if (!state.nextPiece) return;

      const offsetX = Math.floor((5 - state.nextPiece.matrix[0].length) / 2);
      const offsetY = Math.floor((5 - state.nextPiece.matrix.length) / 2);

      drawMatrix(nextContext, state.nextPiece.matrix, { x: offsetX, y: offsetY });
    }

    function renderLeaderboard() {
      elements.list.innerHTML = "";

      if (!state.leaderboardEntries.length) {
        const emptyState = document.createElement("p");
        emptyState.className = "leaderboard-empty";
        emptyState.textContent = "Пока никто не сохранил рекорд.";
        elements.list.insertAdjacentElement("beforebegin", emptyState);
        removeDuplicateEmptyStates(emptyState);
        return;
      }

      removeDuplicateEmptyStates();

      state.leaderboardEntries.forEach((entry, index) => {
        const item = document.createElement("li");
        const rank = document.createElement("span");
        const name = document.createElement("span");
        const score = document.createElement("span");
        const meta = document.createElement("span");

        item.className = "leaderboard-item";
        rank.className = "leaderboard-rank";
        name.className = "leaderboard-name";
        score.className = "leaderboard-score";
        meta.className = "leaderboard-meta";

        rank.textContent = `#${index + 1}`;
        name.textContent = entry.initials;
        score.textContent = formatScore(entry.score);

        const detailParts = [`${formatScore(entry.lines)} линий`, `ур. ${formatScore(entry.level)}`];
        if (entry.playedAt) {
          detailParts.push(dateFormatter.format(new Date(entry.playedAt)));
        }
        meta.textContent = detailParts.join(" · ");

        name.append(` `, meta);
        item.append(rank, name, score);
        elements.list.appendChild(item);
      });
    }

    function removeDuplicateEmptyStates(currentNode) {
      const emptyStates = elements.view.querySelectorAll(".leaderboard-empty");

      emptyStates.forEach((node) => {
        if (!currentNode || node !== currentNode) {
          node.remove();
        }
      });
    }

    async function refreshLeaderboard(options = {}) {
      if (state.leaderboardBusy && !options.force) return;

      state.leaderboardBusy = true;
      syncStatus(options.silent ? "" : "Обновляю таблицу лидеров...");
      updateSubmissionState();

      try {
        const payload = await fetchLeaderboardPayload();
        state.leaderboardEntries = sortEntries(normalizeEntries(payload.entries)).slice(0, MAX_LEADERBOARD_ENTRIES);
        state.lastLeaderboardFetch = Date.now();
        renderLeaderboard();
        if (!options.silent) {
          syncStatus("Таблица лидеров обновлена.");
        }
      } catch (error) {
        if (!state.leaderboardEntries.length) {
          renderLeaderboard();
        }
        if (!options.silent) {
          syncStatus("Не удалось обновить таблицу лидеров. Попробуй ещё раз чуть позже.");
        }
      } finally {
        state.leaderboardBusy = false;
        updateSubmissionState();
      }
    }

    async function submitScore(event) {
      event.preventDefault();

      if (!state.pendingSubmission || state.leaderboardBusy || state.lastSubmittedId) return;

      const initials = normalizeInitials(elements.initialsInput.value);
      if (!hasValidInitials(initials)) {
        syncStatus("Введи 2-4 символа для инициалов.");
        updateSubmissionState();
        return;
      }

      const entry = {
        id: state.pendingSubmission.id,
        initials,
        score: state.pendingSubmission.score,
        lines: state.pendingSubmission.lines,
        level: state.pendingSubmission.level,
        playedAt: new Date().toISOString()
      };

      state.leaderboardBusy = true;
      syncStatus("Сохраняю рекорд...");
      updateSubmissionState();

      try {
        saveInitials(initials);
        const payload = await fetchLeaderboardPayload();
        const mergedEntries = sortEntries([...normalizeEntries(payload.entries), entry]).slice(0, MAX_LEADERBOARD_ENTRIES);

        await saveLeaderboardPayload(mergedEntries);

        state.leaderboardEntries = mergedEntries;
        state.lastLeaderboardFetch = Date.now();
        state.lastSubmittedId = entry.id;
        state.pendingSubmission = null;
        renderLeaderboard();
        syncStatus("Рекорд сохранён. Его увидят все посетители сайта.");
      } catch (error) {
        syncStatus("Не удалось сохранить рекорд. Попробуй отправить его ещё раз.");
      } finally {
        state.leaderboardBusy = false;
        updateSubmissionState();
      }
    }

    function syncStatus(message) {
      elements.status.textContent = message;
    }

    function hydrateInitials() {
      try {
        elements.initialsInput.value = normalizeInitials(localStorage.getItem(INITIALS_STORAGE_KEY) || "");
      } catch {
        elements.initialsInput.value = "";
      }
    }

    function saveInitials(initials) {
      try {
        localStorage.setItem(INITIALS_STORAGE_KEY, normalizeInitials(initials));
      } catch {
        return;
      }
    }

    async function fetchLeaderboardPayload() {
      return requestJson(LEADERBOARD_URL, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    }

    async function saveLeaderboardPayload(entries) {
      return requestJson(LEADERBOARD_URL, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          game: "tetris",
          version: 1,
          entries
        })
      });
    }
  };

  async function requestJson(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function createMatrix(width, height) {
    return Array.from({ length: height }, () => Array(width).fill(0));
  }

  function createPiece(type) {
    return {
      type,
      matrix: PIECES[type].map((row) => row.map((value) => (value ? PIECE_VALUES[type] : 0))),
      pos: { x: 0, y: 0 }
    };
  }

  function collides(board, matrix, position) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;

        const boardY = y + position.y;
        const boardX = x + position.x;

        if (boardX < 0 || boardX >= board[0].length || boardY >= board.length) {
          return true;
        }

        if (boardY >= 0 && board[boardY][boardX] !== 0) {
          return true;
        }
      }
    }

    return false;
  }

  function merge(board, matrix, position) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        board[y + position.y][x + position.x] = value;
      });
    });
  }

  function rotateMatrix(matrix, direction) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < y; x += 1) {
        [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
      }
    }

    if (direction > 0) {
      matrix.forEach((row) => row.reverse());
    } else {
      matrix.reverse();
    }
  }

  function fillCanvas(context, color, width, height) {
    context.save();
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  function drawGrid(context, width, height, alpha = 0.12) {
    context.save();
    context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    context.lineWidth = 0.04;

    for (let x = 0; x <= width; x += 1) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y <= height; y += 1) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.restore();
  }

  function drawMatrix(context, matrix, offset) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;

        const drawX = x + offset.x;
        const drawY = y + offset.y;

        context.fillStyle = COLORS[value];
        context.fillRect(drawX + 0.06, drawY + 0.06, 0.88, 0.88);
        context.fillStyle = "rgba(255, 255, 255, 0.16)";
        context.fillRect(drawX + 0.06, drawY + 0.06, 0.88, 0.2);
        context.strokeStyle = "rgba(0, 0, 0, 0.2)";
        context.lineWidth = 0.05;
        context.strokeRect(drawX + 0.06, drawY + 0.06, 0.88, 0.88);
      });
    });
  }

  function normalizeInitials(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^0-9A-ZА-ЯЁ]/g, "")
      .slice(0, 4);
  }

  function hasValidInitials(initials) {
    return normalizeInitials(initials).length >= 2;
  }

  function normalizeEntries(entries) {
    if (!Array.isArray(entries)) return [];

    return entries
      .map((entry, index) => {
        const score = Number(entry.score);
        const lines = Number(entry.lines);
        const level = Number(entry.level);
        const initials = normalizeInitials(entry.initials || entry.name || "");
        const playedAt = typeof entry.playedAt === "string" ? entry.playedAt : "";

        if (!initials || !Number.isFinite(score)) return null;

        return {
          id: entry.id || `legacy-${index}`,
          initials,
          score: Math.max(0, Math.round(score)),
          lines: Number.isFinite(lines) ? Math.max(0, Math.round(lines)) : 0,
          level: Number.isFinite(level) ? Math.max(1, Math.round(level)) : 1,
          playedAt
        };
      })
      .filter(Boolean);
  }

  function sortEntries(entries) {
    return [...entries].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.lines !== left.lines) return right.lines - left.lines;
      if (right.level !== left.level) return right.level - left.level;
      return String(right.playedAt).localeCompare(String(left.playedAt));
    });
  }

  function shuffleArray(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }

    return result;
  }

  function getDropInterval(level) {
    return Math.max(120, 920 - (level - 1) * 70);
  }

  function formatScore(value) {
    return scoreFormatter.format(Number(value) || 0);
  }

  function createEntryId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `score-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
})();
