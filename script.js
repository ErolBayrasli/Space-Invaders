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
const gameUI = document.getElementById('gameUI');

const state = {
  current: 'menu',
  score: 0,
  lives: 3,
  level: 1,
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
};

const levelConfigs = [
  { rows: 3, cols: 7, speed: 1.6, fireRate: 0.012, boss: false, blockers: 2 },
  { rows: 4, cols: 8, speed: 1.8, fireRate: 0.014, boss: false, blockers: 2 },
  { rows: 4, cols: 9, speed: 2.4, fireRate: 0.024, boss: true, blockers: 4 },
];

const sounds = {
  shoot: { frequency: 780, duration: 0.08 },
  explode: { frequency: 120, duration: 0.16 },
  hit: { frequency: 540, duration: 0.1 },
  music: null,
};

let audioContext;

function initAudio() {
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const gain = audioContext.createGain();
    gain.gain.value = 0.08;
    gain.connect(audioContext.destination);
    playAmbientLoop(gain);
  } catch (error) {
    console.warn('Audio not available:', error);
  }
}

function playAmbientLoop(gainNode) {
  const schedule = [
    { time: 0.0, freq: 220 },
    { time: 0.5, freq: 262 },
    { time: 1.0, freq: 196 },
    { time: 1.5, freq: 248 },
  ];
  const now = audioContext.currentTime;
  schedule.forEach(note => {
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    osc.connect(gainNode);
    osc.start(now + note.time);
    osc.stop(now + note.time + 0.28);
  });
  setTimeout(() => playAmbientLoop(gainNode), 1600);
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
  state.lives = 3;
  state.level = 1;
  state.player.x = canvas.width / 2;
  state.bullets = [];
  state.enemyBullets = [];
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
    enemies.push({ x: canvas.width / 2 - 50, y: 18, width: 100, height: 28, row: -1, col: -1, health: 5, boss: true });
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

function playIntro() {
  introScreen.style.display = 'none';
  showOverlay('menu');
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

function showLeaderboard() {
  updateLeaderboardDisplay();
  showOverlay('leaderboard');
}

function showGameOver() {
  state.current = 'gameover';
  finalTitle.textContent = state.lives > 0 ? 'Victory' : 'Game Over';
  finalMessage.textContent = state.lives > 0 ? `You completed Level ${state.level} with ${state.score} points!` : `Your ship was destroyed. Final score: ${state.score}`;
  playerNameInput.value = '';
  showOverlay('gameover');
  state.canSaveScore = true;
}

function updateLeaderboardDisplay() {
  const entries = loadLeaderboard();
  if (entries.length === 0) {
    leaderboardList.innerHTML = '<div>No high scores yet. Play a game and submit your name!</div>';
    return;
  }
  leaderboardList.innerHTML = '<div><strong>Name</strong><strong>Score</strong><strong>Date</strong></div>' + entries.map(entry => `
    <div>
      <span>${entry.name}</span>
      <span>${entry.score}</span>
      <span>${entry.date}</span>
    </div>
  `).join('');
}

function saveScore() {
  if (!state.canSaveScore) return;
  const playerName = playerNameInput.value.trim().substring(0, 16);
  if (!playerName) {
    alert('Please enter a display name to save your score.');
    return;
  }

  const entries = loadLeaderboard();
  entries.push({ name: playerName, score: state.score, date: new Date().toLocaleString() });
  const sorted = entries.sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem('neonGalaxyLeaderboard', JSON.stringify(sorted));
  state.canSaveScore = false;
  alert('Score saved! View the leaderboard from the main menu.');
}

function loadLeaderboard() {
  const raw = localStorage.getItem('neonGalaxyLeaderboard');
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
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

  if ((state.keys.Space || state.keys[' ']) && performance.now() - state.lastShot > 260) {
    fireBullet();
    state.lastShot = performance.now();
  }
}

function fireBullet() {
  state.bullets.push({ x: state.player.x + state.player.width / 2 - 4, y: state.player.y - 8, width: 8, height: 18, speed: 520 });
  playSound(sounds.shoot);
}

function fireEnemyBullet(enemy) {
  state.enemyBullets.push({ x: enemy.x + enemy.width / 2 - 4, y: enemy.y + enemy.height + 6, width: 8, height: 16, speed: 220 });
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

  if (Math.random() < config.fireRate) {
    const shooter = state.enemies[Math.floor(Math.random() * state.enemies.length)];
    if (shooter) fireEnemyBullet(shooter);
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
      state.lives -= 1;
      createExplosion(state.player.x + state.player.width / 2, state.player.y + state.player.height / 2, 'rgb(255, 80, 80)', 16, 180);
      playSound(sounds.hit);
    }
  });

  state.enemies.forEach(enemy => {
    if (enemy.y + enemy.height >= state.player.y) {
      state.lives = 0;
    }
  });

  state.bullets = state.bullets.filter(bullet => bullet.y > -20);
  state.enemyBullets = state.enemyBullets.filter(bullet => bullet.y < canvas.height + 20);
}

function checkLevelProgress() {
  if (state.lives <= 0) {
    showGameOver();
    return;
  }
  if (state.enemies.length === 0) {
    if (state.level < levelConfigs.length) {
      state.level += 1;
      state.enemyBullets = [];
      state.bullets = [];
      state.enemyDirection = 1;
      state.levelStartAt = performance.now();
      buildEnemies();
      updateUI();
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
  const playerCenterX = state.player.x + state.player.width / 2;
  const playerCenterY = state.player.y + state.player.height / 2;

  state.enemies.forEach((enemy) => {
    ctx.save();
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;

    if (enemy.boss) {
      // Boss: Large angular pyramid spaceship
      ctx.shadowColor = 'rgba(255, 100, 50, 0.9)';
      ctx.shadowBlur = 20;
      
      // Main body - angular
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.width / 2, enemy.y); // top point
      ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height * 0.6); // right
      ctx.lineTo(enemy.x + enemy.width * 0.75, enemy.y + enemy.height); // bottom right
      ctx.lineTo(enemy.x + enemy.width * 0.25, enemy.y + enemy.height); // bottom left
      ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.6); // left
      ctx.closePath();
      ctx.fill();
      
      // Bright accent stripe
      ctx.fillStyle = '#ffaa55';
      ctx.fillRect(enemy.x + enemy.width * 0.15, enemy.y + enemy.height * 0.35, enemy.width * 0.7, enemy.height * 0.15);
      
      // Energy core glow
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(enemyCenterX, enemy.y + enemy.height * 0.5, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Outline glow
      ctx.strokeStyle = 'rgba(255, 180, 50, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.width / 2, enemy.y);
      ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height * 0.6);
      ctx.lineTo(enemy.x + enemy.width * 0.75, enemy.y + enemy.height);
      ctx.lineTo(enemy.x + enemy.width * 0.25, enemy.y + enemy.height);
      ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.6);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Regular enemies: Angular fighter ships
      const hue = (enemy.row * 60) % 360;
      const shipColor = `hsl(${hue}, 80%, 55%)`;
      const accentColor = `hsl(${hue}, 100%, 70%)`;
      
      ctx.shadowColor = `rgba(100, 200, 255, 0.7)`;
      ctx.shadowBlur = 10;
      
      // Main hull - pointed front
      ctx.fillStyle = shipColor;
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.width / 2, enemy.y); // front point
      ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height * 0.5);
      ctx.lineTo(enemy.x + enemy.width * 0.85, enemy.y + enemy.height);
      ctx.lineTo(enemy.x + enemy.width * 0.15, enemy.y + enemy.height);
      ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.5);
      ctx.closePath();
      ctx.fill();
      
      // Accent wing stripe
      ctx.fillStyle = accentColor;
      ctx.fillRect(enemy.x + enemy.width * 0.1, enemy.y + enemy.height * 0.4, enemy.width * 0.8, enemy.height * 0.2);
      
      // Side vents
      ctx.fillStyle = `hsl(${hue}, 60%, 35%)`;
      ctx.fillRect(enemy.x + 2, enemy.y + enemy.height * 0.35, 3, enemy.height * 0.3);
      ctx.fillRect(enemy.x + enemy.width - 5, enemy.y + enemy.height * 0.35, 3, enemy.height * 0.3);
      
      // Front weapon indicator
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(enemy.x + enemy.width * 0.45, enemy.y + 1, enemy.width * 0.1, 2);
      
      // Outline
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(enemy.x + enemy.width / 2, enemy.y);
      ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height * 0.5);
      ctx.lineTo(enemy.x + enemy.width * 0.85, enemy.y + enemy.height);
      ctx.lineTo(enemy.x + enemy.width * 0.15, enemy.y + enemy.height);
      ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
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
  updateBullets(dt);
  updateEnemies(dt);
  handleCollisions();
  checkLevelProgress();
  updateUI();

  drawBackground();
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

updateLeaderboardDisplay();
playIntro();
