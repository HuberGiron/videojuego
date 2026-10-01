(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const highScoreEl = document.getElementById('highScore');
  const startOverlay = document.getElementById('startOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const pauseBadge = document.getElementById('pauseBadge');
  const finalScoreEl = document.getElementById('finalScore');
  const recordMessage = document.getElementById('recordMessage');
  const soundBtn = document.getElementById('soundBtn');

  const W = canvas.width;
  const H = canvas.height;
  const TILE = 40;
  const COLS = W / TILE;
  const ROWS = H / TILE;

  const map = [
    '########################',
    '#..........##..........#',
    '#.####.###.##.###.####.#',
    '#.#....#........#....#.#',
    '#.#.##.#.######.#.##.#.#',
    '#......#...##...#......#',
    '######.###.##.###.######',
    '#......................#',
    '#.####.##.####.##.####.#',
    '#....#....#..#....#....#',
    '####.####.#..#.####.####',
    '#..........##..........#',
    '#.######.######.######.#',
    '#......................#',
    '########################'
  ];

  const images = {};
  const imageSources = {
    hero: 'assets/hero.svg',
    enemyRed: 'assets/enemy-red.svg',
    enemyPurple: 'assets/enemy-purple.svg',
    energy: 'assets/energy-core.svg'
  };

  Object.entries(imageSources).forEach(([key, src]) => {
    const img = new Image();
    img.src = src;
    images[key] = img;
  });

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, inside: false };
  let running = false;
  let paused = false;
  let lastTime = 0;
  let elapsed = 0;
  let score = 0;
  let level = 1;
  let lives = 3;
  let highScore = Number(localStorage.getItem('mazeBlasterHighScore') || 0);
  let soundOn = true;
  let spawnTimer = 0;
  let nextLevelScore = 1500;
  let shake = 0;
  let flash = 0;

  const bullets = [];
  const enemies = [];
  const particles = [];
  const pickups = [];
  const pellets = [];

  const player = {
    x: TILE * 2.5,
    y: TILE * 7.5,
    r: 17,
    speed: 185,
    dirX: 1,
    dirY: 0,
    aimX: 1,
    aimY: 0,
    shootCooldown: 0,
    invuln: 0,
    mouth: 0,
    mouthDir: 1
  };

  const audio = {
    ctx: null,
    ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    beep(freq, duration, type = 'square', volume = 0.035, endFreq = null) {
      if (!soundOn) return;
      this.ensure();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    }
  };

  function formatScore(v) {
    return Math.max(0, Math.floor(v)).toString().padStart(6, '0');
  }

  function updateHud() {
    scoreEl.textContent = formatScore(score);
    levelEl.textContent = String(level).padStart(2, '0');
    livesEl.textContent = lives > 0 ? Array(lives).fill('●').join(' ') : '—';
    highScoreEl.textContent = formatScore(highScore);
  }

  function isWallAt(px, py, radius = 0) {
    const points = radius > 0 ? [
      [px - radius, py - radius], [px + radius, py - radius],
      [px - radius, py + radius], [px + radius, py + radius]
    ] : [[px, py]];

    return points.some(([x, y]) => {
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);
      return row < 0 || row >= ROWS || col < 0 || col >= COLS || map[row][col] === '#';
    });
  }

  function moveWithWalls(entity, dx, dy, radius) {
    if (!isWallAt(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (!isWallAt(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  function resetPlayer() {
    player.x = TILE * 2.5;
    player.y = TILE * 7.5;
    player.dirX = 1;
    player.dirY = 0;
    player.aimX = 1;
    player.aimY = 0;
    player.invuln = 1.9;
    player.shootCooldown = 0;
  }

  function buildPellets() {
    pellets.length = 0;
    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        if (map[row][col] !== '#') {
          const x = col * TILE + TILE / 2;
          const y = row * TILE + TILE / 2;
          if (Math.hypot(x - player.x, y - player.y) > 70 && Math.random() > .18) {
            pellets.push({ x, y, r: Math.random() > .92 ? 4.5 : 2.4, big: false, phase: Math.random() * Math.PI * 2 });
          }
        }
      }
    }
  }

  function resetGame() {
    score = 0;
    level = 1;
    lives = 3;
    nextLevelScore = 1500;
    enemies.length = 0;
    bullets.length = 0;
    particles.length = 0;
    pickups.length = 0;
    spawnTimer = 0;
    elapsed = 0;
    paused = false;
    resetPlayer();
    buildPellets();
    updateHud();
  }

  function startGame() {
    resetGame();
    running = true;
    lastTime = performance.now();
    startOverlay.classList.remove('is-visible');
    gameOverOverlay.classList.remove('is-visible');
    pauseBadge.classList.remove('is-visible');
    audio.beep(420, .08, 'square', .03, 720);
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    finalScoreEl.textContent = formatScore(score);
    const oldHigh = highScore;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('mazeBlasterHighScore', String(highScore));
    }
    recordMessage.textContent = score > oldHigh ? '¡Nuevo récord!' : `Récord: ${formatScore(highScore)}`;
    updateHud();
    gameOverOverlay.classList.add('is-visible');
    audio.beep(170, .45, 'sawtooth', .05, 65);
  }

  function spawnEnemy() {
    const spawnCells = [];
    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        if (map[row][col] === '#') continue;
        const x = col * TILE + TILE / 2;
        const y = row * TILE + TILE / 2;
        if (Math.hypot(x - player.x, y - player.y) > 320) spawnCells.push({ x, y });
      }
    }
    if (!spawnCells.length) return;
    const s = spawnCells[Math.floor(Math.random() * spawnCells.length)];
    const purple = Math.random() < Math.min(.2 + level * .035, .55);
    enemies.push({
      x: s.x, y: s.y,
      r: purple ? 17 : 16,
      speed: (purple ? 83 : 68) + level * 7 + Math.random() * 12,
      hp: purple ? 2 : 1,
      maxHp: purple ? 2 : 1,
      purple,
      phase: Math.random() * Math.PI * 2,
      decisionTimer: 0,
      dirX: 0,
      dirY: 0
    });
  }

  function shoot(dirX = player.aimX, dirY = player.aimY) {
    if (player.shootCooldown > 0 || !running || paused) return;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    bullets.push({
      x: player.x + nx * 22,
      y: player.y + ny * 22,
      vx: nx * 510,
      vy: ny * 510,
      r: 4,
      life: 1.15
    });
    player.shootCooldown = .18;
    player.aimX = nx;
    player.aimY = ny;
    createParticles(player.x + nx * 24, player.y + ny * 24, '#80efff', 4, 80);
    audio.beep(760, .055, 'square', .025, 430);
  }

  function createParticles(x, y, color, count, speed = 140) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (.35 + Math.random() * .8);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: .25 + Math.random() * .45,
        maxLife: .7,
        r: 1.5 + Math.random() * 3,
        color
      });
    }
  }

  function hitPlayer() {
    if (player.invuln > 0) return;
    lives--;
    shake = 12;
    flash = .22;
    createParticles(player.x, player.y, '#ffd52a', 28, 220);
    audio.beep(240, .28, 'sawtooth', .06, 80);
    updateHud();
    if (lives <= 0) {
      endGame();
    } else {
      resetPlayer();
    }
  }

  function addScore(points) {
    score += points;
    if (score > highScore) highScore = score;
    if (score >= nextLevelScore) {
      level++;
      nextLevelScore += 1500 + level * 450;
      audio.beep(520, .12, 'square', .035, 980);
      for (let i = 0; i < 3 + level; i++) spawnEnemy();
    }
    updateHud();
  }

  function update(dt) {
    elapsed += dt;
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.mouth += dt * 8 * player.mouthDir;
    if (player.mouth > 1) { player.mouth = 1; player.mouthDir = -1; }
    if (player.mouth < 0) { player.mouth = 0; player.mouthDir = 1; }
    shake = Math.max(0, shake - dt * 45);
    flash = Math.max(0, flash - dt);

    let mx = 0, my = 0;
    if (keys.has('KeyW')) my -= 1;
    if (keys.has('KeyS')) my += 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      player.dirX = mx; player.dirY = my;
      if (!mouse.inside) { player.aimX = mx; player.aimY = my; }
      moveWithWalls(player, mx * player.speed * dt, my * player.speed * dt, player.r - 2);
    }

    if (mouse.inside) {
      const ax = mouse.x - player.x;
      const ay = mouse.y - player.y;
      const len = Math.hypot(ax, ay) || 1;
      player.aimX = ax / len;
      player.aimY = ay / len;
      if (mouse.down) shoot();
    }

    if (keys.has('Space')) shoot();

    spawnTimer -= dt;
    const maxEnemies = 5 + level * 2;
    if (spawnTimer <= 0 && enemies.length < maxEnemies) {
      spawnEnemy();
      spawnTimer = Math.max(.65, 2.1 - level * .11) * (.85 + Math.random() * .35);
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      if (b.life <= 0 || isWallAt(nx, ny, b.r)) {
        createParticles(b.x, b.y, '#66e9ff', 3, 70);
        bullets.splice(i, 1);
        continue;
      }
      b.x = nx; b.y = ny;

      let removed = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          e.hp--;
          createParticles(b.x, b.y, e.purple ? '#a77cff' : '#ff5579', 9, 150);
          bullets.splice(i, 1);
          removed = true;
          if (e.hp <= 0) {
            createParticles(e.x, e.y, e.purple ? '#a77cff' : '#ff5579', 20, 210);
            enemies.splice(j, 1);
            addScore(e.purple ? 160 : 100);
            if (Math.random() < .12) pickups.push({ x: e.x, y: e.y, r: 13, life: 9, phase: 0 });
            audio.beep(e.purple ? 260 : 320, .08, 'triangle', .03, 130);
          } else {
            audio.beep(170, .045, 'square', .018, 120);
          }
          break;
        }
      }
      if (removed) continue;
    }

    for (const e of enemies) {
      e.phase += dt * 4;
      e.decisionTimer -= dt;
      if (e.decisionTimer <= 0) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const candidates = Math.abs(dx) > Math.abs(dy)
          ? [[Math.sign(dx), 0], [0, Math.sign(dy)], [0, -Math.sign(dy)], [-Math.sign(dx), 0]]
          : [[0, Math.sign(dy)], [Math.sign(dx), 0], [-Math.sign(dx), 0], [0, -Math.sign(dy)]];
        let found = null;
        for (const [cx, cy] of candidates) {
          if (!cx && !cy) continue;
          if (!isWallAt(e.x + cx * 22, e.y + cy * 22, e.r - 2)) { found = [cx, cy]; break; }
        }
        if (found) [e.dirX, e.dirY] = found;
        e.decisionTimer = .18 + Math.random() * .28;
      }
      moveWithWalls(e, e.dirX * e.speed * dt, e.dirY * e.speed * dt, e.r - 3);
      if (Math.hypot(player.x - e.x, player.y - e.y) < player.r + e.r - 3) hitPlayer();
    }

    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      p.phase += dt * 4;
      if (Math.hypot(player.x - p.x, player.y - p.y) < player.r + 7) {
        addScore(10);
        if (Math.random() < .25) audio.beep(980, .025, 'sine', .01, 1180);
        pellets.splice(i, 1);
      }
    }

    if (!pellets.length) {
      buildPellets();
      addScore(500);
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.life -= dt;
      p.phase += dt * 5;
      if (p.life <= 0) { pickups.splice(i, 1); continue; }
      if (Math.hypot(player.x - p.x, player.y - p.y) < player.r + p.r + 4) {
        addScore(250);
        if (lives < 3 && Math.random() < .3) lives++;
        updateHud();
        createParticles(p.x, p.y, '#72eeff', 25, 180);
        audio.beep(600, .16, 'sine', .04, 1200);
        pickups.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= .97;
      p.vy *= .97;
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawMaze() {
    ctx.fillStyle = '#050817';
    ctx.fillRect(0, 0, W, H);

    const grd = ctx.createRadialGradient(W * .5, H * .45, 40, W * .5, H * .45, W * .7);
    grd.addColorStop(0, 'rgba(39, 52, 115, .16)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (map[row][col] !== '#') continue;
        const x = col * TILE;
        const y = row * TILE;
        roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 8);
        ctx.fillStyle = '#101b53';
        ctx.fill();
        ctx.strokeStyle = 'rgba(69, 125, 255, .8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        roundRect(x + 7, y + 7, TILE - 14, TILE - 14, 5);
        ctx.strokeStyle = 'rgba(74, 238, 255, .11)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawPellets() {
    for (const p of pellets) {
      const pulse = 1 + Math.sin(p.phase) * .18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#d7f9ff';
      ctx.shadowColor = '#76ebff';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    const ang = Math.atan2(player.aimY, player.aimX);
    ctx.rotate(ang);
    const mouth = .16 + player.mouth * .28;

    ctx.shadowColor = 'rgba(255,213,42,.55)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffd52a';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, player.r, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff5a7';
    ctx.beginPath();
    ctx.arc(-4, -9, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111733';
    ctx.beginPath();
    ctx.arc(-3, -9, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#495a95';
    roundRect(8, -5, 22, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#75eaff';
    roundRect(14, -2, 18, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y + Math.sin(e.phase) * 2.5);
      ctx.shadowColor = e.purple ? '#8d64ff' : '#ff456c';
      ctx.shadowBlur = 13;
      const img = e.purple ? images.enemyPurple : images.enemyRed;
      if (img.complete) ctx.drawImage(img, -22, -22, 44, 44);
      ctx.shadowBlur = 0;
      if (e.maxHp > 1) {
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fillRect(-15, -27, 30, 3);
        ctx.fillStyle = '#d2c1ff';
        ctx.fillRect(-15, -27, 30 * (e.hp / e.maxHp), 3);
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = '#e4fdff';
      ctx.shadowColor = '#45eaff';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawPickups() {
    for (const p of pickups) {
      const bob = Math.sin(p.phase) * 4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.shadowColor = '#5de8ff';
      ctx.shadowBlur = 18;
      if (images.energy.complete) ctx.drawImage(images.energy, p.x - 15, p.y - 15 + bob, 30, 30);
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCrosshair() {
    if (!mouse.inside || !running) return;
    ctx.save();
    ctx.translate(mouse.x, mouse.y);
    ctx.strokeStyle = 'rgba(140, 241, 255, .7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.moveTo(-16, 0); ctx.lineTo(-7, 0);
    ctx.moveTo(16, 0); ctx.lineTo(7, 0);
    ctx.moveTo(0, -16); ctx.lineTo(0, -7);
    ctx.moveTo(0, 16); ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawMaze();
    drawPellets();
    drawPickups();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawParticles();
    drawCrosshair();
    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 77, 103, ${flash * 1.3})`;
      ctx.fillRect(0, 0, W, H);
    }

    const edge = ctx.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, 'rgba(71, 104, 255, .08)');
    edge.addColorStop(.5, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, W, H);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function pointerToCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  window.addEventListener('keydown', (e) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'KeyP' && running) {
      paused = !paused;
      pauseBadge.classList.toggle('is-visible', paused);
      if (!paused) lastTime = performance.now();
    }
    if (e.code === 'KeyR') startGame();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  canvas.addEventListener('mousemove', (e) => {
    Object.assign(mouse, pointerToCanvas(e));
    mouse.inside = true;
  });
  canvas.addEventListener('mouseenter', () => mouse.inside = true);
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; mouse.down = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    Object.assign(mouse, pointerToCanvas(e));
    mouse.down = true;
    shoot(mouse.x - player.x, mouse.y - player.y);
  });
  window.addEventListener('mouseup', () => mouse.down = false);

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', startGame);
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.textContent = `SONIDO: ${soundOn ? 'ON' : 'OFF'}`;
    if (soundOn) audio.beep(660, .08, 'sine', .025, 920);
  });

  updateHud();
  resetPlayer();
  buildPellets();
  draw();
})();
