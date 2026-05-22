const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const stars = [];
const STAR_LAYERS = [
  { count: 70, speed: 10, size: 1.0, alpha: 0.6 },
  { count: 45, speed: 16, size: 1.6, alpha: 0.8 },
  { count: 24, speed: 26, size: 2.2, alpha: 1.0 },
];

function initStarField() {
  stars.length = 0;
  STAR_LAYERS.forEach((layer) => {
    for (let i = 0; i < layer.count; i += 1) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: layer.size * (0.8 + Math.random() * 0.8),
        speed: layer.speed * (0.75 + Math.random() * 0.5),
        alpha: layer.alpha * (0.6 + Math.random() * 0.4),
      });
    }
  });
}

initStarField();

const introScreen = document.getElementById('introScreen');
const startScreen = document.getElementById('startScreen');
const instructionsScreen = document.getElementById('instructionsScreen');
const leaderboardScreen = document.getElementById('leaderboardScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const scoreValue = document.getElementById('scoreValue');
const livesValue = document.getElementById('livesValue');
const levelValue = document.getElementById('levelValue');
const leaderboardList = document.getElementById('leaderboardList');
const playerNameInput = document.getElementById('playerName');
const finalMessage = document.getElementById('finalMessage');
const finalTitle = document.getElementById('finalTitle');
const startButton = document.getElementById('startButton');
const instructionsButton = document.getElementById('instructionsButton');
const leaderboardButton = document.getElementById('leaderboardButton');
const submitScoreButton = document.getElementById('submitScoreButton');
const restartButton = document.getElementById('restartButton');
const moveLeftButton = document.getElementById('moveLeftButton');
const shootButton = document.getElementById('shootButton');
const moveRightButton = document.getElementById('moveRightButton');
const gameUI = document.getElementById('gameUI');

const state = {
  current: 'menu',
  score: 0,
  lives: 3,
  level: 1,
  ammo: 14,
  maxAmmo: 14,
  reloadTimer: 0,
  lastShot: 0,
  enemies: [],
  bullets: [],
  enemyBullets: [],
  blockers: [],
  particles: [],
  shakeIntensity: 0,
  player: { x: canvas.width / 2, y: canvas.height - 62, width: 56, height: 16, speed: 340 },
  keys: {},
  enemyDirection: 1,
  levelStartAt: 0,
  canSaveScore: false,
  lastSavedEntry: null,
  powerUps: [],
  powerUp: null,
  powerUpTimer: 0,
  shieldActive: false,
};

const levelConfigs = [
  { rows: 3, cols: 7, speed: 1.4, fireRate: 0.012, boss: false, blockers: 2, maxAmmo: 14, playerLives: 4, volley: 1 },
  { rows: 4, cols: 7, speed: 1.75, fireRate: 0.014, boss: false, blockers: 2, maxAmmo: 14, playerLives: 4, volley: 1 },
  { rows: 4, cols: 8, speed: 2.2, fireRate: 0.020, boss: true, blockers: 3, maxAmmo: 12, playerLives: 3, volley: 2 },
];

const leaderboardDBConfig = { dbName: 'NeonGalaxyLeaderboardDB', storeName: 'scores', version: 1 };
let leaderboardDB = null;

const sounds = {
  shoot: { frequency: 780, duration: 0.08 },
  explode: { frequency: 120, duration: 0.16 },
  hit: { frequency: 540, duration: 0.1 },
  music: null,
};

let audioContext;

function openLeaderboardDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error('IndexedDB not available'));
    }

    const request = window.indexedDB.open(leaderboardDBConfig.dbName, leaderboardDBConfig.version);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(leaderboardDBConfig.storeName)) {
        const store = db.createObjectStore(leaderboardDBConfig.storeName, { keyPath: 'id', autoIncrement: true });
        store.createIndex('score', 'score', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      leaderboardDB = event.target.result;
      resolve(leaderboardDB);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open leaderboard database.'));
    };
  });
}

function getLeaderboardEntries() {
  if (leaderboardDB) {
    return new Promise((resolve, reject) => {
      const transaction = leaderboardDB.transaction([leaderboardDBConfig.storeName], 'readonly');
      const store = transaction.objectStore(leaderboardDBConfig.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = request.result || [];
        resolve(entries.sort((a, b) => b.score - a.score).slice(0, 10));
      };
      request.onerror = () => reject(request.error);
    });
  }

  return Promise.resolve(loadLeaderboardFromLocalStorage());
}

function saveLeaderboardEntry(entry) {
  if (leaderboardDB) {
    return new Promise((resolve, reject) => {
      const transaction = leaderboardDB.transaction([leaderboardDBConfig.storeName], 'readwrite');
      const store = transaction.objectStore(leaderboardDBConfig.storeName);
      const request = store.add(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  const entries = loadLeaderboardFromLocalStorage();
  entries.push(entry);
  const sorted = entries.sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem('neonGalaxyLeaderboard', JSON.stringify(sorted));
  return Promise.resolve();
}

function loadLeaderboardFromLocalStorage() {
  const raw = localStorage.getItem('neonGalaxyLeaderboard');
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function formatLeaderboardDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp || 'Unknown');
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function initializeLeaderboards() {
  return openLeaderboardDB().catch(() => {
    console.warn('Leaderboard database unavailable, using localStorage fallback.');
    leaderboardDB = null;
  });
}

function initAudio() {
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 0.05;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1400;
    lowpass.Q.value = 0.8;

    masterGain.connect(lowpass);
    lowpass.connect(audioContext.destination);
    audioContext._masterGain = masterGain;
    audioContext._filterNode = lowpass;
    playMusicLoop();
  } catch (error) {
    console.warn('Audio not available:', error);
  }
}

function playSynthNote(time, freq, duration, type = 'sawtooth', volume = 0.05) {
  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(volume, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(gainNode);
  gainNode.connect(audioContext._filterNode || audioContext._masterGain || audioContext.destination);
  osc.start(time);
  osc.stop(time + duration);
}

function playMusicLoop() {
  const now = audioContext.currentTime + 0.05;

  const bass = [110, 130.81, 146.83, 164.81];
  bass.forEach((freq, index) => {
    playSynthNote(now + index * 0.72, freq, 0.9, 'triangle', 0.04);
  });

  const pad = [220, 196, 247, 262];
  pad.forEach((freq, index) => {
    playSynthNote(now + index * 0.72 + 0.18, freq, 1.2, 'sine', 0.03);
  });

  const lead = [392, 440, 494, 523.25];
  lead.forEach((freq, index) => {
    playSynthNote(now + index * 0.46, freq, 0.32, 'triangle', 0.03);
  });

  setTimeout(() => {
    if (audioContext && audioContext.state === 'running') {
      playMusicLoop();
    }
  }, 2400);
}

function playSound({ frequency, duration }) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gainNode.gain.setValueAtTime(0.14, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  osc.connect(gainNode);
  gainNode.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

function resetGame() {
  state.score = 0;
  state.level = 1;
  const config = levelConfigs[state.level - 1];
  state.lives = config.playerLives;
  state.maxAmmo = config.maxAmmo;
  state.ammo = config.maxAmmo;
  state.reloadTimer = 0;
  state.player.x = canvas.width / 2;
  state.bullets = [];
  state.enemyBullets = [];
  state.powerUps = [];
  state.powerUp = null;
  state.powerUpTimer = 0;
  state.shieldActive = false;
  state.enemyDirection = 1;
  state.lastShot = 0;
  state.levelStartAt = performance.now();
  buildEnemies();
  updateUI();
}

function buildEnemies() {
  const config = levelConfigs[state.level - 1];
  const enemies = [];
  const spacingX = 72;
  const spacingY = 54;
  const offsetX = (canvas.width - spacingX * config.cols + 16) / 2;
  const startY = 60;

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      enemies.push({
        x: offsetX + col * spacingX,
        y: startY + row * spacingY,
        width: 42,
        height: 20,
        row,
        col,
        health: 1,
      });
    }
  }

  if (config.boss) {
    enemies.push({ x: canvas.width / 2 - 50, y: 18, width: 100, height: 28, row: -1, col: -1, health: 8, boss: true });
  }

  state.enemies = enemies;
  buildBlockers(config.blockers);
}

function buildBlockers(count) {
  state.blockers = [];
  const blockerWidth = 48;
  const blockerHeight = 32;
  const spacingX = canvas.width / (count + 1);
  const baseY = 280;

  for (let i = 0; i < count; i += 1) {
    state.blockers.push({
      x: (i + 1) * spacingX - blockerWidth / 2,
      y: baseY + Math.sin(i) * 40,
      width: blockerWidth,
      height: blockerHeight,
      health: 3,
    });
  }
}

function updateUI() {
  scoreValue.textContent = state.score;
  livesValue.textContent = state.lives;
  levelValue.textContent = state.level;
  const ammoValue = document.getElementById('ammoValue');
  const powerUpValue = document.getElementById('powerupValue');
  if (ammoValue) ammoValue.textContent = state.ammo;
  if (powerUpValue) powerUpValue.textContent = state.powerUp ? state.powerUp : 'None';
}

function setGameMode(active) {
  if (!gameUI) return;
  gameUI.classList.toggle('hidden', !active);
}

function showOverlay(name) {
  [startScreen, instructionsScreen, leaderboardScreen, gameOverScreen].forEach(screen => screen.classList.remove('visible'));
  if (name === 'menu') startScreen.classList.add('visible');
  if (name === 'instructions') instructionsScreen.classList.add('visible');
  if (name === 'leaderboard') leaderboardScreen.classList.add('visible');
  if (name === 'gameover') gameOverScreen.classList.add('visible');
  if (state.current !== 'playing') setGameMode(false);
}

function restoreGameView() {
  [startScreen, instructionsScreen, leaderboardScreen, gameOverScreen].forEach(screen => screen.classList.remove('visible'));
}

let introContinueListener = null;

function finishIntro() {
  introScreen.classList.remove('visible');
  introScreen.style.display = 'none';
  if (introContinueListener) {
    document.removeEventListener('keydown', introContinueListener);
    introScreen.removeEventListener('click', introContinueListener);
    introContinueListener = null;
  }
  showOverlay('menu');
}

function playIntro() {
  introScreen.style.display = 'flex';
  introScreen.classList.add('visible');
  introScreen.classList.remove('fade-out');

  introContinueListener = (event) => {
    if (event.type === 'keydown') {
      if (event.key === 'F5' || event.key === 'F11') return;
    }
    finishIntro();
  };

  document.addEventListener('keydown', introContinueListener);
  introScreen.addEventListener('click', introContinueListener);
}

function startGame() {
  initAudio();
  introScreen.style.display = 'none';
  introScreen.classList.remove('visible', 'fade-out');
  restoreGameView();
  setGameMode(true);
  state.current = 'playing';
  resetGame();
  lastFrame = performance.now();
  requestAnimationFrame(gameLoop);
}

function showInstructions() {
  showOverlay('instructions');
}

async function showLeaderboard() {
  await updateLeaderboardDisplay();
  showOverlay('leaderboard');
}

function showGameOver() {
  state.current = 'gameover';
  finalTitle.textContent = state.lives > 0 ? 'Victory' : 'Game Over';
  finalMessage.textContent = state.lives > 0 ? `You completed Level ${state.level} with ${state.score} points!` : `Your ship was destroyed. Final score: ${state.score}`;
  playerNameInput.value = '';
  submitScoreButton.disabled = false;
  showOverlay('gameover');
  state.canSaveScore = true;
}

async function updateLeaderboardDisplay() {
  const entries = await getLeaderboardEntries();
  if (entries.length === 0) {
    leaderboardList.innerHTML = '<div>No high scores yet. Play a game and submit your name!</div>';
    return;
  }
  leaderboardList.innerHTML = '<div><strong>Name</strong><strong>Score</strong><strong>Date</strong></div>' + entries.map(entry => `
    <div>
      <span>${entry.name}</span>
      <span>${entry.score}</span>
      <span>${formatLeaderboardDate(entry.timestamp)}</span>
    </div>
  `).join('');
}

async function saveScore() {
  if (!state.canSaveScore) return;
  const playerName = playerNameInput.value.trim().substring(0, 16);
  if (!playerName) {
    alert('Please enter a display name to save your score.');
    return;
  }

  const now = Date.now();
  const newEntry = { name: playerName, score: state.score, timestamp: now };

  if (state.lastSavedEntry && state.lastSavedEntry.name === newEntry.name && state.lastSavedEntry.score === newEntry.score && now - state.lastSavedEntry.timestamp < 15000) {
    alert('Duplicate submission detected. Wait a moment before submitting again.');
    return;
  }

  try {
    await saveLeaderboardEntry(newEntry);
    state.lastSavedEntry = newEntry;
    state.canSaveScore = false;
    submitScoreButton.disabled = true;
    alert('Score saved! View the leaderboard from the main menu.');
  } catch (error) {
    alert('Unable to save score right now. Please try again later.');
    console.error(error);
  }
}

function createExplosion(x, y, color, count = 12, speed = 200) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const velocity = speed + Math.random() * 100;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      color,
      life: 0.6,
      maxLife: 0.6,
      size: 3 + Math.random() * 3,
    });
  }
  state.shakeIntensity = Math.min(8, state.shakeIntensity + 2);
}

function updateParticles(dt) {
  state.particles = state.particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt; // gravity
    p.life -= dt;
    return p.life > 0;
  });

  state.shakeIntensity = Math.max(0, state.shakeIntensity - dt * 12);
}

function drawParticles() {
  state.particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
}

function handleInput(dt) {
  const speed = state.player.speed * dt;
  if (state.keys.ArrowLeft || state.keys.a || state.keys.A) state.player.x -= speed;
  if (state.keys.ArrowRight || state.keys.d || state.keys.D) state.player.x += speed;
  state.player.x = Math.max(24, Math.min(canvas.width - state.player.width - 24, state.player.x));

  const shotDelay = state.powerUp === 'Rapid' ? 160 : 260;
  if ((state.keys.Space || state.keys[' ']) && performance.now() - state.lastShot > shotDelay) {
    fireBullet();
    state.lastShot = performance.now();
  }
}

function updateAmmo(dt) {
  if (state.ammo < state.maxAmmo) {
    state.reloadTimer += dt;
    if (state.reloadTimer >= 0.35) {
      state.reloadTimer = 0;
      state.ammo += 1;
      if (state.ammo > state.maxAmmo) state.ammo = state.maxAmmo;
    }
  }
}

function fireBullet() {
  if (state.ammo <= 0) {
    playSound({ frequency: 260, duration: 0.04 });
    return;
  }
  state.ammo -= 1;
  state.bullets.push({ x: state.player.x + state.player.width / 2 - 4, y: state.player.y - 8, width: 8, height: 18, speed: 520 });
  playSound(sounds.shoot);
}

function fireEnemyBullet(enemy) {
  state.enemyBullets.push({ x: enemy.x + enemy.width / 2 - 4, y: enemy.y + enemy.height + 6, width: 8, height: 16, speed: 220 });
}

function fireEnemyVolley(enemy, count = 1) {
  const spacing = enemy.width / (count + 1);
  for (let index = 1; index <= count; index += 1) {
    state.enemyBullets.push({ x: enemy.x + spacing * index - 4, y: enemy.y + enemy.height + 6, width: 8, height: 16, speed: 220 + (enemy.boss ? 40 : 0) });
  }
}

function spawnPowerUp(x, y) {
  const types = ['Rapid', 'Shield'];
  const type = types[Math.floor(Math.random() * types.length)];
  state.powerUps.push({ x, y, width: 22, height: 22, type, speed: 120 });
}

function updatePowerUps(dt) {
  state.powerUps = state.powerUps.filter(powerUp => {
    powerUp.y += powerUp.speed * dt;
    return powerUp.y < canvas.height - 14;
  });
  if (state.powerUp) {
    state.powerUpTimer -= dt;
    if (state.powerUpTimer <= 0) {
      state.powerUp = null;
      state.shieldActive = false;
    }
  }
}

function drawPowerUps() {
  state.powerUps.forEach((powerUp) => {
    ctx.save();
    if (powerUp.type === 'Rapid') {
      ctx.fillStyle = '#7ef0ff';
    } else {
      ctx.fillStyle = '#ffaf5c';
    }
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 18;
    ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height);
    ctx.restore();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(powerUp.type === 'Rapid' ? 'R' : 'S', powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
  });
}

function activatePowerUp(type) {
  state.powerUp = type;
  state.powerUpTimer = 8;
  if (type === 'Shield') {
    state.lives += 1;
    state.shieldActive = true;
  }
  if (type === 'Rapid') {
    playSound({ frequency: 960, duration: 0.12 });
  }
}

function collectPowerUps() {
  state.powerUps = state.powerUps.filter(powerUp => {
    const colliding = powerUp.x < state.player.x + state.player.width && powerUp.x + powerUp.width > state.player.x && powerUp.y < state.player.y + state.player.height && powerUp.y + powerUp.height > state.player.y;
    if (colliding) {
      activatePowerUp(powerUp.type);
      playSound({ frequency: powerUp.type === 'Rapid' ? 880 : 520, duration: 0.14 });
      return false;
    }
    return true;
  });
}

function updateBullets(dt) {
  state.bullets = state.bullets.filter(bullet => {
    bullet.y -= bullet.speed * dt;
    return bullet.y + bullet.height > 0;
  });

  state.enemyBullets = state.enemyBullets.filter(bullet => {
    bullet.y += bullet.speed * dt;
    return bullet.y < canvas.height + 20;
  });
}

function updateEnemies(dt) {
  const config = levelConfigs[state.level - 1];
  const shiftDistance = 22;
  let shiftDown = false;
  let borderHit = false;

  state.enemies.forEach(enemy => {
    if (!enemy) return;
    enemy.x += config.speed * state.enemyDirection * dt * 70;
    if (enemy.x < 10 || enemy.x + enemy.width > canvas.width - 10) borderHit = true;
  });

  if (borderHit) {
    state.enemyDirection *= -1;
    shiftDown = true;
  }

  if (shiftDown) {
    state.enemies.forEach(enemy => enemy.y += shiftDistance);
  }

  if (state.enemies.length > 0 && Math.random() < config.fireRate) {
    const shooter = state.enemies[Math.floor(Math.random() * state.enemies.length)];
    if (shooter) {
      const volleyCount = shooter.boss ? Math.max(2, config.volley) : config.volley;
      fireEnemyVolley(shooter, volleyCount);
    }
  }
}

function handleCollisions() {
  state.bullets.forEach((bullet) => {
    state.blockers.forEach((blocker) => {
      if (bullet.x < blocker.x + blocker.width && bullet.x + bullet.width > blocker.x && bullet.y < blocker.y + blocker.height && bullet.y + bullet.height > blocker.y) {
        blocker.health -= 1;
        bullet.y = -100;
        createExplosion(bullet.x, bullet.y, 'rgb(255, 150, 80)', 8, 120);
      }
    });
    state.enemies.forEach((enemy) => {
      if (!enemy) return;
      if (bullet.x < enemy.x + enemy.width && bullet.x + bullet.width > enemy.x && bullet.y < enemy.y + enemy.height && bullet.y + bullet.height > enemy.y) {
        enemy.health -= 1;
        bullet.y = -100;
        createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'rgb(100, 200, 255)', 10, 150);
        playSound(sounds.explode);
        if (enemy.health <= 0) {
          createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 'rgb(255, 200, 100)', 20, 200);
        }
      }
    });
  });

  state.blockers = state.blockers.filter(blocker => blocker.health > 0);

  state.enemies = state.enemies.filter(enemy => {
    if (enemy.health <= 0) {
      state.score += enemy.boss ? 300 : 80;
      if (Math.random() < 0.18) {
        spawnPowerUp(enemy.x + enemy.width / 2 - 11, enemy.y + enemy.height / 2);
      }
      return false;
    }
    return true;
  });

  state.enemyBullets.forEach((bullet) => {
    state.blockers.forEach((blocker) => {
      if (bullet.x < blocker.x + blocker.width && bullet.x + bullet.width > blocker.x && bullet.y < blocker.y + blocker.height && bullet.y + bullet.height > blocker.y) {
        bullet.y = canvas.height + 20;
        createExplosion(bullet.x, bullet.y, 'rgb(255, 100, 100)', 8, 100);
      }
    });
    if (bullet.x < state.player.x + state.player.width && bullet.x + bullet.width > state.player.x && bullet.y < state.player.y + state.player.height && bullet.y + bullet.height > state.player.y) {
      bullet.y = canvas.height + 20;
      if (state.shieldActive) {
        state.shieldActive = false;
        createExplosion(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2, 'rgb(150, 255, 180)', 18, 140);
      } else {
        state.lives -= 1;
        createExplosion(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2, 'rgb(255, 80, 80)', 16, 180);
      }
      playSound(sounds.hit);
    }
  });

  state.enemies.forEach(enemy => {
    if (enemy.y + enemy.height >= state.player.y) {
      state.lives = 0;
    }
  });

  collectPowerUps();
  state.bullets = state.bullets.filter(bullet => bullet.y > -20);
  state.enemyBullets = state.enemyBullets.filter(bullet => bullet.y < canvas.height + 20);
}

function showLevelAnnouncement(message) {
  const announcement = document.getElementById('levelAnnouncement');
  if (!announcement) return;
  announcement.textContent = message;
  announcement.classList.add('visible');
  announcement.classList.remove('hidden');
  setTimeout(() => {
    announcement.classList.remove('visible');
    announcement.classList.add('hidden');
  }, 1700);
}

function checkLevelProgress() {
  if (state.lives <= 0) {
    showGameOver();
    return;
  }
  if (state.enemies.length === 0) {
    if (state.level < levelConfigs.length) {
      state.level += 1;
      const config = levelConfigs[state.level - 1];
      state.maxAmmo = config.maxAmmo;
      state.ammo = Math.min(state.ammo + 4, config.maxAmmo);
      state.lives = Math.min(state.lives, config.playerLives);
      state.enemyBullets = [];
      state.bullets = [];
      state.enemyDirection = 1;
      state.levelStartAt = performance.now();
      buildEnemies();
      updateUI();
      showLevelAnnouncement(`Wave ${state.level} Engaging`);
      return;
    }
    showGameOver();
  }
}

function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#020611';
  ctx.fillRect(0, 0, w, h);

  const nebula = ctx.createRadialGradient(w * 0.7, h * 0.18, 10, w * 0.62, h * 0.34, h * 0.8);
  nebula.addColorStop(0, 'rgba(92, 174, 255, 0.24)');
  nebula.addColorStop(0.35, 'rgba(28, 44, 98, 0.14)');
  nebula.addColorStop(1, 'rgba(2, 6, 14, 0.98)');
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, w, h);

  const nebula2 = ctx.createRadialGradient(w * 0.25, h * 0.25, 8, w * 0.32, h * 0.38, h * 0.7);
  nebula2.addColorStop(0, 'rgba(180, 220, 255, 0.18)');
  nebula2.addColorStop(0.4, 'rgba(4, 8, 22, 0.02)');
  nebula2.addColorStop(1, 'rgba(4, 8, 22, 0.95)');
  ctx.fillStyle = nebula2;
  ctx.fillRect(0, 0, w, h);

  stars.forEach((star) => {
    star.y += star.speed * 0.018;
    if (star.y > h + star.size) star.y = -star.size;
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPlayer() {
  const x = state.player.x;
  const y = state.player.y;
  const w = state.player.width;
  const h = state.player.height;
  const centerX = x + w / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(118, 205, 255, 0.85)';
  ctx.shadowBlur = 20;

  ctx.fillStyle = '#bce8ff';
  ctx.beginPath();
  ctx.moveTo(centerX, y - 10);
  ctx.lineTo(x + w * 1.02, y + h * 0.8);
  ctx.lineTo(x + w * 0.9, y + h * 1.5);
  ctx.lineTo(x + w * 0.1, y + h * 1.5);
  ctx.lineTo(x - w * 0.02, y + h * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7cb8ff';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h * 0.55);
  ctx.lineTo(x - w * 0.35, y + h * 0.95);
  ctx.lineTo(x + w * 0.08, y + h * 1.15);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + w * 0.92, y + h * 0.55);
  ctx.lineTo(x + w * 1.35, y + h * 0.95);
  ctx.lineTo(x + w * 0.92, y + h * 1.15);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#5e9dff';
  ctx.beginPath();
  ctx.ellipse(centerX, y + h * 0.2, w * 0.18, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(102, 215, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(centerX, y + h * 1.55, w * 0.24, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  if (state.shieldActive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(106, 255, 190, 0.75)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(106, 255, 190, 0.6)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(centerX, y + h * 0.8, w * 0.9, h * 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(centerX, y - 10);
  ctx.lineTo(x + w * 0.92, y + h * 0.8);
  ctx.moveTo(centerX, y - 10);
  ctx.lineTo(x + w * 0.08, y + h * 0.8);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(centerX, y + h * 0.13, w * 0.08, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemies() {
  const invaderPatterns = [
    [
      [0,0,1,1,1,1,1,1,0,0],
      [0,1,2,1,1,1,1,2,1,0],
      [1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,0,1],
      [1,1,0,0,0,0,0,0,1,1],
      [0,1,1,1,1,1,1,1,1,0],
      [0,0,1,0,0,0,0,1,0,0],
      [0,0,1,0,1,1,0,1,0,0],
    ],
    [
      [0,0,1,1,1,1,1,1,0,0],
      [0,1,1,2,1,1,2,1,1,0],
      [1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,0,1],
      [1,1,1,0,0,0,0,1,1,1],
      [0,1,1,1,1,1,1,1,1,0],
      [0,0,1,0,0,0,0,1,0,0],
      [0,0,1,0,1,1,0,1,0,0],
    ],
  ];

  const bossPattern = [
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,1,1,1,1,1,1,0,1],
    [1,1,1,1,0,0,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,0],
    [0,0,1,0,1,1,0,1,0,0],
    [0,0,1,0,0,0,0,1,0,0],
  ];

  const colors = [
    { body: '#3df600', eye: '#ffffff', outline: '#0b3c00' },
    { body: '#51c8ff', eye: '#ffffff', outline: '#063145' },
  ];

  state.enemies.forEach((enemy) => {
    const pattern = enemy.boss ? bossPattern : invaderPatterns[enemy.row % invaderPatterns.length];
    const rows = pattern.length;
    const cols = pattern[0].length;
    const cellW = enemy.width / cols;
    const cellH = enemy.height / rows;
    const palette = enemy.boss ? { body: '#ffd27a', eye: '#000000', outline: '#7a4f02' } : colors[Math.abs(enemy.row) % colors.length];

    ctx.save();
    pattern.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (!cell) return;
        const x = Math.round(enemy.x + colIndex * cellW);
        const y = Math.round(enemy.y + rowIndex * cellH);
        ctx.fillStyle = cell === 2 ? palette.eye : palette.body;
        ctx.fillRect(x, y, Math.round(cellW), Math.round(cellH));
      });
    });

    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
    ctx.restore();
  });

  state.blockers.forEach((blocker) => {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 100, 80, 0.7)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#d4513d';
    ctx.fillRect(blocker.x, blocker.y, blocker.width, blocker.height);
    ctx.strokeStyle = 'rgba(255, 140, 110, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(blocker.x, blocker.y, blocker.width, blocker.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(blocker.health, blocker.x + blocker.width / 2, blocker.y + blocker.height / 2);
    ctx.restore();
  });
}

function drawBullets() {
  ctx.save();
  ctx.shadowColor = 'rgba(171, 252, 255, 0.8)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#a8f5ff';
  state.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(255, 112, 112, 0.65)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ff9fa9';
  state.enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
  ctx.restore();
}

let lastFrame = performance.now();
function gameLoop(timestamp) {
  if (state.current !== 'playing') return;
  const dt = Math.min((timestamp - lastFrame) / 1000, 0.035);
  lastFrame = timestamp;

  handleInput(dt);
  updateAmmo(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updatePowerUps(dt);
  handleCollisions();
  checkLevelProgress();
  updateUI();

  drawBackground();
  drawPowerUps();
  drawPlayer();
  drawEnemies();
  drawBullets();

  if (state.current === 'playing') {
    requestAnimationFrame(gameLoop);
  }
}

window.addEventListener('keydown', (event) => {
  state.keys[event.key] = true;
  if (event.key === ' ') event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  state.keys[event.key] = false;
});

function updateMobileControlsVisibility() {
  const controls = document.getElementById('mobileControls');
  if (!controls) return;
  const isPhone = window.innerWidth <= 760;
  controls.classList.toggle('hidden', !isPhone);
}

function setTouchKey(key, active) {
  state.keys[key] = active;
}

if (moveLeftButton) {
  moveLeftButton.addEventListener('touchstart', (event) => { event.preventDefault(); setTouchKey('ArrowLeft', true); moveLeftButton.classList.add('active'); });
  moveLeftButton.addEventListener('touchend', (event) => { event.preventDefault(); setTouchKey('ArrowLeft', false); moveLeftButton.classList.remove('active'); });
  moveLeftButton.addEventListener('mousedown', () => { setTouchKey('ArrowLeft', true); moveLeftButton.classList.add('active'); });
  moveLeftButton.addEventListener('mouseup', () => { setTouchKey('ArrowLeft', false); moveLeftButton.classList.remove('active'); });
}
if (moveRightButton) {
  moveRightButton.addEventListener('touchstart', (event) => { event.preventDefault(); setTouchKey('ArrowRight', true); moveRightButton.classList.add('active'); });
  moveRightButton.addEventListener('touchend', (event) => { event.preventDefault(); setTouchKey('ArrowRight', false); moveRightButton.classList.remove('active'); });
  moveRightButton.addEventListener('mousedown', () => { setTouchKey('ArrowRight', true); moveRightButton.classList.add('active'); });
  moveRightButton.addEventListener('mouseup', () => { setTouchKey('ArrowRight', false); moveRightButton.classList.remove('active'); });
}
if (shootButton) {
  shootButton.addEventListener('touchstart', (event) => { event.preventDefault(); setTouchKey(' ', true); shootButton.classList.add('active'); });
  shootButton.addEventListener('touchend', (event) => { event.preventDefault(); setTouchKey(' ', false); shootButton.classList.remove('active'); });
  shootButton.addEventListener('mousedown', () => { setTouchKey(' ', true); shootButton.classList.add('active'); });
  shootButton.addEventListener('mouseup', () => { setTouchKey(' ', false); shootButton.classList.remove('active'); });
}

window.addEventListener('resize', updateMobileControlsVisibility);
updateMobileControlsVisibility();

startButton.addEventListener('click', startGame);
instructionsButton.addEventListener('click', showInstructions);
leaderboardButton.addEventListener('click', showLeaderboard);

const backButtons = document.querySelectorAll('.backButton');
backButtons.forEach(button => button.addEventListener('click', () => showOverlay('menu')));

submitScoreButton.addEventListener('click', saveScore);
restartButton.addEventListener('click', () => {
  showOverlay('menu');
  startGame();
});

initializeLeaderboards().then(updateLeaderboardDisplay).catch(() => updateLeaderboardDisplay());
playIntro();
