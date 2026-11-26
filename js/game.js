/* =========================================================
   "Свет в кадре" — a small lighting puzzle
   Authors: Arseniy Sokolov, G. A. Rumyantsev
   ========================================================= */

(function () {
  'use strict';

  const shell = document.getElementById('light-game');
  const stage = document.getElementById('game-stage');
  const canvas = document.getElementById('game-canvas');
  const refCanvas = document.getElementById('game-reference-canvas');
  if (!shell || !stage || !canvas || !refCanvas || !window.THREE) return;

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = reduceQuery.matches;

  const ui = {
    level: document.getElementById('game-level'),
    record: document.getElementById('game-record'),
    progress: Array.prototype.slice.call(document.querySelectorAll('#game-progress .game-progress-seg')),
    refTitle: document.getElementById('game-ref-title'),
    refIndex: document.getElementById('game-ref-index'),
    brightness: document.getElementById('game-brightness'),
    brightnessOut: document.getElementById('game-brightness-out'),
    warmth: document.getElementById('game-warmth'),
    warmthOut: document.getElementById('game-warmth-out'),
    shoot: document.getElementById('game-shoot'),
    reset: document.getElementById('game-reset'),
    liveLabel: document.getElementById('game-live-label'),
    result: document.getElementById('game-result'),
    kicker: document.getElementById('game-result-kicker'),
    stars: document.getElementById('game-result-stars'),
    score: document.getElementById('game-result-score'),
    text: document.getElementById('game-result-text'),
    hints: document.getElementById('game-result-hints'),
    primary: document.getElementById('game-result-primary'),
    primaryLabel: document.getElementById('game-result-primary-label'),
    retry: document.getElementById('game-result-retry'),
    total: document.getElementById('game-result-total')
  };

  const BEST_KEY = 'poly-lightgame-best-v1';
  const LAST_LEVEL = 2;

  const LEVELS = [
    {
      name: 'Тёплый ключевой',
      rotation: [0.22, -0.55, 0],
      target: { azimuth: -38, elevation: 32, brightness: 0.72, warmth: 0.66 },
      start: { azimuth: 0, elevation: 22, brightness: 0.45, warmth: 0.45 },
      thresholds: [86, 72, 64]
    },
    {
      name: 'Холодный контровой',
      rotation: [0.58, 0.9, 0],
      target: { azimuth: 62, elevation: 36, brightness: 0.85, warmth: 0.18 },
      start: { azimuth: -20, elevation: 26, brightness: 0.55, warmth: 0.55 },
      thresholds: [88, 75, 66]
    },
    {
      name: 'Драматичный профиль',
      rotation: [-0.3, 2.1, 0],
      target: { azimuth: -104, elevation: 14, brightness: 0.98, warmth: 0.9 },
      start: { azimuth: 25, elevation: 30, brightness: 0.7, warmth: 0.4 },
      thresholds: [90, 78, 68]
    }
  ];

  const state = {
    level: 0,
    stars: [0, 0, 0],
    best: loadBest(),
    player: null,
    busy: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    action: 'retry',
    resultStars: 0
  };

  let playerRenderer;
  let refRenderer;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const DPR_MAX = COARSE ? 1.35 : 1.5;

  try {
    playerRenderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: !COARSE,
      powerPreference: 'high-performance'
    });
    refRenderer = new THREE.WebGLRenderer({
      canvas: refCanvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    showFallback();
    return;
  }

  configureRenderer(playerRenderer);
  configureRenderer(refRenderer);

  /* ---------- shared geometry and materials ---------- */

  const objectGeometry = new THREE.IcosahedronGeometry(0.95, 0);
  const objectMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7f1ff,
    roughness: 0.38,
    metalness: 0.04,
    flatShading: true
  });

  const podiumGeometry = new THREE.CylinderGeometry(1.5, 1.62, 0.24, 64);
  const podiumMaterial = new THREE.MeshStandardMaterial({
    color: 0x102235,
    roughness: 0.62,
    metalness: 0.12
  });

  const floorGeometry = new THREE.CircleGeometry(7, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x07121e,
    roughness: 0.92,
    metalness: 0.03
  });

  const ringGeometry = new THREE.TorusGeometry(1.505, 0.012, 8, 96);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x5a80ff,
    transparent: true,
    opacity: 0.55
  });

  const glowTexture = createGlowTexture();
  const coolColor = new THREE.Color(0x9dc7ff);
  const warmColor = new THREE.Color(0xd8a06a);
  const lightCenter = new THREE.Vector3(0, 0.08, 0);
  const clock = new THREE.Clock();

  /* ---------- studios ---------- */

  const playerStudio = createStudio(true);
  const targetStudio = createStudio(false);

  let inView = false;
  let running = false;
  let rafId = 0;

  /* ---------- controls ---------- */

  if (ui.brightness) {
    ui.brightness.addEventListener('input', function () {
      if (!state.player) return;
      const value = Number(ui.brightness.value);
      state.player.brightness = value / 100;
      if (ui.brightnessOut) ui.brightnessOut.textContent = value + '%';
      ui.brightness.style.setProperty('--val', value + '%');
      applyLighting(playerStudio, state.player);
      renderPlayer();
    });
  }

  if (ui.warmth) {
    ui.warmth.addEventListener('input', function () {
      if (!state.player) return;
      const value = Number(ui.warmth.value);
      state.player.warmth = value / 100;
      if (ui.warmthOut) ui.warmthOut.textContent = value + '%';
      ui.warmth.style.setProperty('--val', value + '%');
      applyLighting(playerStudio, state.player);
      renderPlayer();
    });
  }

  if (ui.reset) {
    ui.reset.addEventListener('click', function () {
      if (!state.player || state.busy || !ui.result.hidden) return;
      state.player = Object.assign({}, LEVELS[state.level].start);
      applyLighting(playerStudio, state.player);
      syncControls();
      renderPlayer();
    });
  }

  if (ui.shoot) {
    ui.shoot.addEventListener('click', shoot);
  }

  if (ui.primary) {
    ui.primary.addEventListener('click', function () {
      if (state.action === 'next') {
        setupLevel(state.level + 1);
      } else if (state.action === 'restart') {
        state.stars = [0, 0, 0];
        setupLevel(0);
      } else {
        hideResult();
      }
    });
  }

  if (ui.retry) {
    ui.retry.addEventListener('click', hideResult);
  }

  /* ---------- pointer drag ---------- */

  canvas.addEventListener('pointerdown', function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (state.busy || !ui.result.hidden || !state.player) return;

    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    stage.classList.add('is-dragging');

    if (!stage.classList.contains('has-dragged')) {
      stage.classList.add('has-dragged');
    }

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!state.dragging || !state.player) return;

    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;

    state.player.azimuth = clamp(state.player.azimuth + dx * 0.42, -165, 165);
    state.player.elevation = clamp(state.player.elevation - dy * 0.32, 8, 44);
    applyLighting(playerStudio, state.player);
    renderPlayer();
  });

  function endDrag(event) {
    if (!state.dragging) return;
    state.dragging = false;
    stage.classList.remove('is-dragging');

    if (event && event.pointerId !== undefined && canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', function () {
    state.dragging = false;
    stage.classList.remove('is-dragging');
  });

  canvas.addEventListener('keydown', function (event) {
    if (!state.player || state.busy || !ui.result.hidden) return;

    const step = event.shiftKey ? 2 : 6;
    let handled = true;

    switch (event.key) {
      case 'ArrowLeft':
        state.player.azimuth = clamp(state.player.azimuth - step, -165, 165);
        break;
      case 'ArrowRight':
        state.player.azimuth = clamp(state.player.azimuth + step, -165, 165);
        break;
      case 'ArrowUp':
        state.player.elevation = clamp(state.player.elevation + step, 8, 44);
        break;
      case 'ArrowDown':
        state.player.elevation = clamp(state.player.elevation - step, 8, 44);
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      stage.classList.add('has-dragged');
      applyLighting(playerStudio, state.player);
      renderPlayer();
    }
  });

  /* ---------- shooting and scoring ---------- */

  function shoot() {
    if (state.busy || !state.player || !ui.result.hidden) return;

    state.busy = true;
    stage.classList.remove('is-result');
    stage.classList.add('is-firing');
    setLive('EXPOSING');

    if (window.innerWidth <= 860) {
      const rect = stage.getBoundingClientRect();
      if (rect.top < 60 || rect.bottom > window.innerHeight) {
        stage.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'center'
        });
      }
    }

    window.setTimeout(function () {
      stage.classList.remove('is-firing');

      const level = LEVELS[state.level];
      const score = computeScore();
      const stars = starsForScore(score, level);
      state.resultStars = stars;

      if (stars > state.stars[state.level]) {
        state.stars[state.level] = stars;
      }

      setLive(stars > 0 ? 'SHOT' : 'MISS');
      updateProgress();
      showResult(score, stars);
      state.busy = false;
    }, 660);
  }

  function computeScore() {
    const level = LEVELS[state.level];
    const target = level.target;
    const player = state.player;

    const targetDir = directionFrom(target.azimuth, target.elevation);
    const playerDir = directionFrom(player.azimuth, player.elevation);
    const angle = THREE.MathUtils.radToDeg(Math.acos(clamp(targetDir.dot(playerDir), -1, 1)));

    const directionScore = 1 - clamp(angle / 75, 0, 1);
    const brightnessScore = 1 - clamp(Math.abs(player.brightness - target.brightness) / 0.65, 0, 1);
    const warmthScore = 1 - clamp(Math.abs(player.warmth - target.warmth) / 0.65, 0, 1);

    return Math.round((directionScore * 0.4 + brightnessScore * 0.3 + warmthScore * 0.3) * 100);
  }

  function starsForScore(score, level) {
    if (score >= level.thresholds[0]) return 3;
    if (score >= level.thresholds[1]) return 2;
    if (score >= level.thresholds[2]) return 1;
    return 0;
  }

  function buildHints(target) {
    const player = state.player;
    const hints = [];

    let azDelta = player.azimuth - target.azimuth;
    while (azDelta > 180) azDelta -= 360;
    while (azDelta < -180) azDelta += 360;

    if (Math.abs(azDelta) > 10) {
      hints.push(azDelta > 0 ? 'Сдвинь источник левее' : 'Сдвинь источник правее');
    }

    const elDelta = player.elevation - target.elevation;
    if (Math.abs(elDelta) > 9) {
      hints.push(elDelta > 0 ? 'Опусти свет ниже' : 'Подними свет выше');
    }

    const brightDelta = player.brightness - target.brightness;
    if (Math.abs(brightDelta) > 0.07) {
      hints.push(brightDelta > 0 ? 'Убавь яркость' : 'Добавь яркости');
    }

    const warmDelta = player.warmth - target.warmth;
    if (Math.abs(warmDelta) > 0.09) {
      hints.push(warmDelta > 0 ? 'Сделай свет холоднее' : 'Сделай свет теплее');
    }

    return hints.slice(0, 3);
  }

  function showResult(score, stars) {
    const level = LEVELS[state.level];
    const passed = stars > 0;
    const isLast = state.level === LAST_LEVEL;

    setShootEnabled(false);
    ui.result.hidden = false;
    stage.classList.add('is-result');

    ui.kicker.textContent = !passed
      ? 'Дубль не засчитан'
      : isLast
        ? 'Съёмка завершена'
        : 'Кадр засчитан';

    ui.score.textContent = String(score);
    ui.stars.innerHTML = buildStars(stars);
    ui.text.textContent = resultText(stars, isLast);

    const hints = passed && stars === 3 ? [] : buildHints(level.target);
    ui.hints.innerHTML = '';

    if (passed && stars === 3) {
      const item = document.createElement('li');
      item.textContent = 'Свет, тени и температура совпали с эталоном.';
      ui.hints.appendChild(item);
    } else {
      hints.forEach(function (hint) {
        const item = document.createElement('li');
        item.textContent = hint;
        ui.hints.appendChild(item);
      });
    }

    if (!passed) {
      state.action = 'retry';
      ui.primaryLabel.textContent = 'Попробовать снова';
      ui.retry.hidden = true;
      updateRunTotal();
    } else if (isLast) {
      state.action = 'restart';
      ui.primaryLabel.textContent = 'Сыграть заново';
      ui.retry.hidden = stars === 3;
      finalizeRun();
    } else {
      state.action = 'next';
      ui.primaryLabel.textContent = 'Дальше';
      ui.retry.hidden = stars === 3;
      updateRunTotal();
    }

    window.setTimeout(function () {
      if (ui.primary && !ui.primary.hidden) {
        ui.primary.focus({ preventScroll: true });
      }
    }, 90);
  }

  function hideResult() {
    ui.result.hidden = true;
    stage.classList.remove('is-result');
    setShootEnabled(true);
    setLive('LIVE');
  }

  function setShootEnabled(enabled) {
    if (!ui.shoot) return;
    ui.shoot.disabled = !enabled;
    ui.shoot.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  function resultText(stars, isLast) {
    if (stars === 3) {
      return isLast
        ? 'Все три кадра собраны. Свет в кадре — идеальный.'
        : 'Идеальная экспозиция. Свет, тени и блики совпали с эталоном.';
    }
    if (stars === 2) return 'Сильный дубль. Ещё немного точности — и будет идеально.';
    if (stars === 1) return 'Кадр засчитан. Свет уже близко, но характер ещё отличается.';
    return 'Свет не совпал с эталоном. Сравни сторону источника, яркость и температуру.';
  }

  function buildStars(count) {
    let markup = '';
    for (let i = 0; i < 3; i++) {
      markup += '<svg class="icon' + (i < count ? ' is-on' : '') + '" aria-hidden="true"><use href="#i-star"></use></svg>';
    }
    return markup;
  }

  function updateRunTotal(message) {
    const total = state.stars.reduce(function (sum, value) {
      return sum + value;
    }, 0);
    ui.total.textContent = message || 'За серию · ' + total + ' из 9';
  }

  function finalizeRun() {
    const total = state.stars.reduce(function (sum, value) {
      return sum + value;
    }, 0);
    const isRecord = total > state.best;

    if (isRecord) {
      state.best = total;
      saveBest(total);
    }

    updateRecord();
    updateRunTotal('Серия · ' + total + ' из 9 · ' + (isRecord ? 'новый рекорд!' : 'рекорд ' + state.best + ' / 9'));
  }

  /* ---------- levels ---------- */

  function setupLevel(index) {
    state.level = clamp(index, 0, LAST_LEVEL);
    const level = LEVELS[state.level];

    state.player = Object.assign({}, level.start);
    state.busy = false;
    hideResult();

    applyLighting(playerStudio, state.player);
    applyLighting(targetStudio, level.target);

    playerStudio.objectGroup.rotation.set(level.rotation[0], level.rotation[1], 0);
    targetStudio.objectGroup.rotation.set(level.rotation[0], level.rotation[1], 0);

    if (ui.level) ui.level.textContent = padLevel(state.level + 1);
    if (ui.refIndex) ui.refIndex.textContent = padLevel(state.level + 1);
    if (ui.refTitle) ui.refTitle.textContent = level.name;

    syncControls();
    updateProgress();
    updateRecord();
    setLive('LIVE');

    renderPlayer();
    renderTargetPhoto();
  }

  function updateProgress() {
    ui.progress.forEach(function (segment, index) {
      segment.classList.toggle('is-done', index < state.level);
      segment.classList.toggle('is-active', index === state.level);
    });
  }

  function updateRecord() {
    if (!ui.record) return;
    ui.record.textContent = state.best > 0 ? 'Рекорд · ' + state.best + ' / 9' : 'Рекорд · —';
  }

  function syncControls() {
    if (!state.player) return;

    const brightness = Math.round(state.player.brightness * 100);
    const warmth = Math.round(state.player.warmth * 100);

    if (ui.brightness) {
      ui.brightness.value = String(brightness);
      ui.brightness.style.setProperty('--val', brightness + '%');
    }
    if (ui.brightnessOut) ui.brightnessOut.textContent = brightness + '%';

    if (ui.warmth) {
      ui.warmth.value = String(warmth);
      ui.warmth.style.setProperty('--val', warmth + '%');
    }
    if (ui.warmthOut) ui.warmthOut.textContent = warmth + '%';
  }

  function setLive(label) {
    if (ui.liveLabel) ui.liveLabel.textContent = label;
  }

  /* ---------- 3D scene ---------- */

  function configureRenderer(renderer) {
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX));
  }

  function createStudio(withParticles) {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 50);
    camera.position.set(0, 1.05, 5.8);
    camera.lookAt(0, -0.15, 0);

    const objectGroup = new THREE.Group();
    const object = new THREE.Mesh(objectGeometry, objectMaterial);
    object.castShadow = true;
    object.receiveShadow = true;
    objectGroup.add(object);
    scene.add(objectGroup);

    const podium = new THREE.Mesh(podiumGeometry, podiumMaterial);
    podium.position.y = -1.12;
    podium.castShadow = true;
    podium.receiveShadow = true;
    scene.add(podium);

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.995;
    scene.add(ring);

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.24;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight(0xf4fbff, 0x0a1a2b, 0.4));

    const fill = new THREE.DirectionalLight(0x9dc7ff, 0.18);
    fill.position.set(3, 3.5, 4);
    scene.add(fill);

    const key = new THREE.DirectionalLight(0xffcf9f, 1.3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.bias = -0.0008;
    key.target.position.copy(lightCenter);
    scene.add(key.target);
    scene.add(key);

    const rim = new THREE.PointLight(0x2f63ff, 1.0, 16);
    rim.position.set(-3.2, 1.4, -3.4);
    scene.add(rim);

    const sunGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xffcf9f, toneMapped: false })
    );
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xffcf9f,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    sunGlow.scale.set(0.8, 0.8, 1);
    sunGroup.add(sunCore);
    sunGroup.add(sunGlow);
    scene.add(sunGroup);

    let particles = null;
    if (withParticles) {
      particles = createParticles();
      scene.add(particles);
    }

    return {
      scene: scene,
      camera: camera,
      key: key,
      sunGroup: sunGroup,
      sunCore: sunCore,
      sunGlow: sunGlow,
      objectGroup: objectGroup,
      particles: particles
    };
  }

  function applyLighting(studio, settings) {
    const color = lightColor(settings.warmth);
    const direction = directionFrom(settings.azimuth, settings.elevation);

    studio.key.color.copy(color);
    studio.key.intensity = 0.28 + settings.brightness * 2.2;
    studio.key.position.copy(lightCenter).addScaledVector(direction, 9);

    studio.sunGroup.position.copy(lightCenter).addScaledVector(direction, 2.6);
    studio.sunCore.material.color.copy(color);
    studio.sunCore.scale.setScalar(0.85 + settings.brightness * 0.5);
    studio.sunGlow.material.color.copy(color);
    studio.sunGlow.material.opacity = 0.55 + settings.brightness * 0.4;
    studio.sunGlow.scale.setScalar(0.72 + settings.brightness * 0.18);
  }

  function directionFrom(azimuth, elevation) {
    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(elevation);

    return new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el)
    );
  }

  function lightColor(warmth) {
    return coolColor.clone().lerp(warmColor, clamp(warmth, 0, 1));
  }

  function createGlowTexture() {
    const size = 128;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = size;
    textureCanvas.height = size;

    const context = textureCanvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    gradient.addColorStop(0, 'rgba(255, 252, 245, 0.95)');
    gradient.addColorStop(0.22, 'rgba(211, 185, 143, 0.55)');
    gradient.addColorStop(0.55, 'rgba(176, 86, 57, 0.14)');
    gradient.addColorStop(1, 'rgba(176, 86, 57, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(textureCanvas);
  }

  function createParticles() {
    const count = 64;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = -0.9 + Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x9dc7ff,
      size: 0.028,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    return new THREE.Points(geometry, material);
  }

  /* ---------- render loop ---------- */

  function renderPlayer() {
    playerRenderer.render(playerStudio.scene, playerStudio.camera);
  }

  function renderTargetPhoto() {
    refRenderer.render(targetStudio.scene, targetStudio.camera);
  }

  function resizeStage() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;

    playerRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX));
    playerRenderer.setSize(width, height, false);
    playerStudio.camera.aspect = width / height;
    playerStudio.camera.updateProjectionMatrix();

    if (!running) renderPlayer();
  }

  function resizeReference() {
    const frame = refCanvas.parentElement;
    if (!frame) return;

    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (!width || !height) return;

    refRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX));
    refRenderer.setSize(width, height, false);
    targetStudio.camera.aspect = width / height;
    targetStudio.camera.updateProjectionMatrix();

    renderTargetPhoto();
  }

  function loop() {
    if (!running) return;
    rafId = window.requestAnimationFrame(loop);

    const delta = Math.min(clock.getDelta(), 0.05);
    if (!reduceMotion && playerStudio.particles) {
      playerStudio.particles.rotation.y += delta * 0.035;
    }

    renderPlayer();
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function syncPlayback() {
    if (inView && !document.hidden) {
      start();
    } else {
      stop();
    }
  }

  document.addEventListener('visibilitychange', syncPlayback);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0.06 });

    observer.observe(stage);
  } else {
    inView = true;
    syncPlayback();
  }

  if ('ResizeObserver' in window) {
    const stageObserver = new ResizeObserver(function () {
      resizeStage();
    });
    stageObserver.observe(stage);

    const referenceObserver = new ResizeObserver(function () {
      resizeReference();
    });
    referenceObserver.observe(refCanvas.parentElement);
  } else {
    window.addEventListener('resize', function () {
      resizeStage();
      resizeReference();
    });
  }

  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', function (event) {
      reduceMotion = event.matches;
    });
  } else if (reduceQuery.addListener) {
    reduceQuery.addListener(function (event) {
      reduceMotion = event.matches;
    });
  }

  /* ---------- helpers ---------- */

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function padLevel(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function loadBest() {
    try {
      const stored = Number.parseInt(window.localStorage.getItem(BEST_KEY), 10);
      if (!Number.isFinite(stored)) return 0;
      return clamp(stored, 0, 9);
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      /* storage can be unavailable */
    }
  }

  function showFallback() {
    stage.classList.add('no-game');

    const message = document.createElement('p');
    message.className = 'game-fallback';
    message.textContent = 'Для мини-игры нужен WebGL. Включите аппаратное ускорение в браузере.';
    stage.appendChild(message);

    if (ui.shoot) {
      ui.shoot.disabled = true;
      ui.shoot.setAttribute('aria-disabled', 'true');
      ui.shoot.textContent = 'WebGL недоступен';
    }

    if (ui.brightness) ui.brightness.disabled = true;
    if (ui.warmth) ui.warmth.disabled = true;
    if (ui.reset) ui.reset.disabled = true;
  }

  /* ---------- init ---------- */

  setupLevel(0);
  resizeStage();
  resizeReference();

  if (inView) start();

  if (/[?&]debug=1/.test(window.location.search)) {
    window.__lightGame = {
      state: state,
      levels: LEVELS,
      setupLevel: setupLevel,
      setPlayer: function (next) {
        if (!state.player) return;
        Object.assign(state.player, next);
        applyLighting(playerStudio, state.player);
        syncControls();
        renderPlayer();
      },
      shoot: shoot
    };
  }
})();

