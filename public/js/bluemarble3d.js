/*
 * 세계여행 마블 3D 보드 (Three.js)
 * - 28칸 입체 보드 · 도시 라벨(캔버스 텍스처) · 별장/빌딩/호텔 · 3D 주사위 · 동물 색 말
 * - 서버가 판정한 주사위 눈에 정확히 맞춰 주사위가 멈춥니다.
 * - WebGL을 쓸 수 없는 기기(또는 테스트 환경)에서는 null을 돌려주고, 화면은 2D 보드로 대신합니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const BM = window.BlueMarble;

  const ANIMAL_HEX = {
    dog: '#d99a63',
    cat: '#e989a8',
    rabbit: '#a98be8',
    bear: '#b8875a',
    fox: '#ef8a4c',
    chick: '#e9bf3b'
  };
  const SEAT_HEX = ['#f4775c', '#6b9fe0', '#4fb083', '#9b7fe0'];

  const TILE_SIZE = 0.96;
  const BOARD_SPAN = 7;       // 한 변 7칸 (코너 포함)

  /* ---------------- 칸 위치 ---------------- */

  function tilePosition(idx) {
    const i = ((idx % 28) + 28) % 28;
    const side = Math.floor(i / 7);
    const k = i % 7;
    const half = BOARD_SPAN / 2; // 3.5
    let x = 0;
    let z = 0;
    if (side === 0) { x = -half + k; z = half; }
    else if (side === 1) { x = half; z = half - k; }
    else if (side === 2) { x = half - k; z = -half; }
    else { x = -half; z = -half + k; }
    return { x: x, z: z, side: side, rotation: side * Math.PI / 2 };
  }

  function colorForPlayer(player) {
    if (!player) return SEAT_HEX[0];
    if (BG.avatars && player.number !== null && player.number !== undefined && player.number !== '') {
      const animal = BG.avatars.forKey('no:' + player.number);
      if (animal && ANIMAL_HEX[animal.id]) return ANIMAL_HEX[animal.id];
    }
    return SEAT_HEX[(player.seat || 0) % SEAT_HEX.length];
  }

  function animalFor(player) {
    if (BG.avatars && player && player.number !== null && player.number !== undefined) {
      return BG.avatars.forKey('no:' + player.number);
    }
    return null;
  }

  /* ---------------- 캔버스 텍스처 도우미 ---------------- */

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function tint(hex, amount) {
    const h = String(hex || '#cccccc').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const mix = function (v) { return Math.round(v + (255 - v) * amount); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  function drawKey(ctx, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - 14, cy - 8, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy + 1);
    ctx.lineTo(cx + 30, cy + 34);
    ctx.moveTo(cx + 18, cy + 30);
    ctx.lineTo(cx + 27, cy + 21);
    ctx.stroke();
    ctx.restore();
  }

  function drawTileTexture(tile, idx, ownerPlayer, level, side) {
    const S = 256;
    const canvas = makeCanvas(S);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(side * Math.PI / 2);
    ctx.translate(-S / 2, -S / 2);

    const baseColor = tile.color || '#e8d7c4';
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(0, 0, S, S);
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, tint(baseColor, 0.62));
    grad.addColorStop(0.62, '#fffaf0');
    grad.addColorStop(1, '#fff4e2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // 테두리 (지역 색)
    ctx.strokeStyle = tint(baseColor, 0.15);
    ctx.lineWidth = 7;
    ctx.strokeRect(3.5, 3.5, S - 7, S - 7);

    // 소유자 표시 띠
    if (ownerPlayer) {
      ctx.fillStyle = colorForPlayer(ownerPlayer);
      ctx.fillRect(0, 0, S, 16);
    } else {
      ctx.fillStyle = tint(baseColor, 0.35);
      ctx.fillRect(0, 0, S, 10);
    }

    const name = String(tile.name || '');
    const centerY = 108;

    if (tile.type === BM.TILE_TYPES.CITY) {
      ctx.fillStyle = '#3d2f26';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (name.length >= 3 ? 52 : 60) + 'px "Jua", "Gowun Dodum", "Malgun Gothic", sans-serif';
      ctx.fillText(name, S / 2, centerY - 12);

      ctx.font = '600 36px "Gowun Dodum", "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#7a6455';
      ctx.fillText(BM.shortMoney(tile.price), S / 2, centerY + 52);

      // 건물 단계
      const levelText = BM.BUILD_NAMES[level] || '땅';
      ctx.font = '600 30px "Gowun Dodum", "Malgun Gothic", sans-serif';
      ctx.fillStyle = level === 3 ? '#b57a12' : level > 0 ? '#4d7d5f' : '#a99a8b';
      ctx.fillText(level === 3 ? '★ 호텔 ★' : levelText, S / 2, 214);

      if (ownerPlayer) {
        const label = ownerPlayer.number !== null && ownerPlayer.number !== undefined
          ? ownerPlayer.number + '번'
          : ownerPlayer.name;
        ctx.fillStyle = colorForPlayer(ownerPlayer);
        roundedRect(ctx, S / 2 - 52, S - 34, 104, 30, 15);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 20px "Jua", "Gowun Dodum", sans-serif';
        ctx.fillText(label, S / 2, S - 18);
      } else {
        ctx.fillStyle = '#9b8a7b';
        ctx.font = '600 19px "Gowun Dodum", sans-serif';
        ctx.fillText('매입 가능', S / 2, S - 18);
      }
    } else {
      // 특수 칸
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3d2f26';
      ctx.font = '700 ' + (name.length >= 4 ? 44 : 52) + 'px "Jua", "Gowun Dodum", "Malgun Gothic", sans-serif';
      ctx.fillText(name, S / 2, 150);
      ctx.font = '500 24px "Gowun Dodum", "Malgun Gothic", sans-serif';
      ctx.fillStyle = '#7a6455';
      const desc = String(tile.desc || '');
      if (desc) ctx.fillText(desc, S / 2, 198);

      if (tile.type === BM.TILE_TYPES.GOLDEN) drawKey(ctx, 128, 82, '#d8a01f');
      else if (tile.type === BM.TILE_TYPES.TAX) {
        ctx.fillStyle = '#c98d6b';
        ctx.beginPath(); ctx.arc(128, 78, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 38px "Jua", sans-serif'; ctx.fillText('₩', 128, 80);
      } else if (tile.type === BM.TILE_TYPES.BONUS) {
        ctx.fillStyle = '#dfa62f';
        ctx.beginPath(); ctx.arc(128, 78, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 44px "Jua", sans-serif'; ctx.fillText('+', 128, 80);
      } else if (tile.type === BM.TILE_TYPES.START) {
        ctx.fillStyle = '#f4775c';
        ctx.beginPath(); ctx.arc(128, 76, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 26px "Jua", sans-serif'; ctx.fillText('GO', 128, 78);
      } else if (tile.type === BM.TILE_TYPES.ISLAND) {
        ctx.fillStyle = '#7fb6c9';
        ctx.beginPath(); ctx.arc(128, 76, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 26px "Jua", sans-serif'; ctx.fillText('ISLE', 128, 78);
      } else if (tile.type === BM.TILE_TYPES.TRAVEL) {
        ctx.fillStyle = '#9b7fe0';
        ctx.beginPath(); ctx.arc(128, 76, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 26px "Jua", sans-serif'; ctx.fillText('AIR', 128, 78);
      } else if (tile.type === BM.TILE_TYPES.PARK) {
        ctx.fillStyle = '#4fb083';
        ctx.beginPath(); ctx.arc(128, 76, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 30px "Jua", sans-serif'; ctx.fillText('P', 128, 78);
      }
    }

    ctx.restore();
    return canvas;
  }

  function drawCenterTexture(label) {
    const S = 512;
    const canvas = makeCanvas(S);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.72);
    grad.addColorStop(0, '#eef9ec');
    grad.addColorStop(0.62, '#d9eed6');
    grad.addColorStop(1, '#c2e0c6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((S / 8) * i, 0);
      ctx.lineTo((S / 8) * i, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (S / 8) * i);
      ctx.lineTo(S, (S / 8) * i);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = label || '세계여행 마블';
    let titleSize = 62;
    ctx.font = '700 ' + titleSize + 'px "Jua", "Gowun Dodum", sans-serif';
    while (titleSize > 26 && ctx.measureText(title).width > S * 0.74) {
      titleSize -= 4;
      ctx.font = '700 ' + titleSize + 'px "Jua", "Gowun Dodum", sans-serif';
    }
    ctx.fillStyle = '#6b5647';
    ctx.fillText(title, S / 2, S / 2 - 30);
    ctx.fillStyle = '#7d9c80';
    ctx.font = '600 24px "Gowun Dodum", sans-serif';
    ctx.fillText('3D BOARD GAME', S / 2, S / 2 + 36);
    ctx.fillStyle = '#9ab39c';
    ctx.font = '500 19px "Gowun Dodum", sans-serif';
    ctx.fillText('보드게임천국', S / 2, S / 2 + 76);

    // 나침반
    ctx.strokeStyle = 'rgba(120,160,130,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(S / 2, S / 2 + 150, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 + 124); ctx.lineTo(S / 2, S / 2 + 176);
    ctx.moveTo(S / 2 - 10, S / 2 + 136); ctx.lineTo(S / 2, S / 2 + 124); ctx.lineTo(S / 2 + 10, S / 2 + 136);
    ctx.stroke();
    return canvas;
  }

  function pipTexture(count) {
    const S = 128;
    const canvas = makeCanvas(S);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#e6d8c6';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, S - 6, S - 6);
    const r = 11;
    const positions = {
      1: [[64, 64]],
      2: [[36, 36], [92, 92]],
      3: [[34, 34], [64, 64], [94, 94]],
      4: [[36, 36], [92, 36], [36, 92], [92, 92]],
      5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
      6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]]
    };
    ctx.fillStyle = count === 1 ? '#e0603f' : '#4a3a32';
    (positions[count] || positions[1]).forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    });
    return canvas;
  }

  function labelSprite(text, color) {
    const W = 256;
    const H = 128;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(58,44,34,0.82)';
    roundedRect(ctx, 20, 26, W - 40, 76, 34);
    ctx.fill();
    ctx.fillStyle = color || '#fff';
    ctx.font = '700 46px "Jua", "Gowun Dodum", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, 66);
    return canvas;
  }

  /* ---------------- 3D 보드 ---------------- */

  class Board3D {
    constructor(container, options) {
      const THREE = window.THREE;
      this.THREE = THREE;
      this.container = container;
      this.options = options || {};
      this.tiles = [];
      this.tokenGroups = new Map();
      this.tokenWalk = new Map();
      this.buildings = new Array(28).fill(null);
      this.tileTextureKeys = new Array(28).fill('');
      this.lastRollSeq = 0;
      this.lastCardSeq = 0;
      this.dice = null;
      this.currentRing = null;
      this.players = [];
      this.youId = null;
      this.clock = null;
      this.raf = 0;
      this.disposed = false;

      this.theta = 0;
      this.phi = 0.80;
      this.radius = 11.8;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0xfdf1e3, 28, 48);

      const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 0, height: 0 };
      const width = Math.max(320, Math.floor(rect.width || container.clientWidth || 0));
      const height = Math.max(260, Math.floor(rect.height || container.clientHeight || 0));

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setSize(width, height, false);
      if (THREE.sRGBEncoding !== undefined && 'outputEncoding' in this.renderer) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const canvas = this.renderer.domElement;
      canvas.className = 'bm3d-canvas';
      canvas.setAttribute('aria-label', '세계여행 마블 3D 보드');
      container.appendChild(canvas);

      this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
      this.updateCamera();

      this.buildLights();
      this.buildBoard();
      this.buildDice();
      this.buildCurrentRing();

      this.bindControls();
      this.resizeObserver = null;
      if (typeof ResizeObserver !== 'undefined') {
        const self = this;
        this.resizeObserver = new ResizeObserver(function () { self.resize(); });
        this.resizeObserver.observe(container);
      }
      this.onWinResize = this.resize.bind(this);
      window.addEventListener('resize', this.onWinResize);

      this.animate();
    }

    /* ----- 조명 ----- */

    buildLights() {
      const THREE = this.THREE;
      const hemi = new THREE.HemisphereLight(0xffffff, 0xb99f80, 0.62);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0d6, 0.85);
      sun.position.set(9, 16, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -8;
      sun.shadow.camera.right = 8;
      sun.shadow.camera.top = 8;
      sun.shadow.camera.bottom = -8;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 40;
      sun.shadow.bias = -0.0008;
      this.scene.add(sun);
      const fill = new THREE.DirectionalLight(0xdceaff, 0.22);
      fill.position.set(-8, 7, -6);
      this.scene.add(fill);
    }

    /* ----- 보드 바닥 · 칸 ----- */

    buildBoard() {
      const THREE = this.THREE;
      const baseMat = new THREE.MeshLambertMaterial({ color: 0xe8c9a0 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.55, 8.6), baseMat);
      base.position.y = -0.5;
      base.receiveShadow = true;
      this.scene.add(base);

      const edgeMat = new THREE.MeshLambertMaterial({ color: 0xc9a271 });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.22, 8.9), edgeMat);
      edge.position.y = -0.82;
      this.scene.add(edge);

      const centerTexture = drawCenterTexture(this.options.title);
      const centerMat = centerTexture
        ? new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(centerTexture) })
        : new THREE.MeshLambertMaterial({ color: 0xdcefdc });
      if (centerMat.map && THREE.sRGBEncoding !== undefined) centerMat.map.encoding = THREE.sRGBEncoding;
      const center = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.1, 6.0), centerMat);
      center.position.y = -0.2;
      center.receiveShadow = true;
      this.scene.add(center);

      // 칸
      for (let i = 0; i < 28; i++) {
        const tile = BM.BOARD[i];
        const pos = tilePosition(i);
        const group = new THREE.Group();
        group.position.set(pos.x, -0.07, pos.z);

        const sideMat = new THREE.MeshLambertMaterial({ color: 0xf0dcc0 });
        const topTexture = drawTileTexture(tile, i, null, 0, pos.side);
        const topMat = topTexture
          ? new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(topTexture) })
          : new THREE.MeshLambertMaterial({ color: 0xfff6e8 });
        if (topMat.map && THREE.sRGBEncoding !== undefined) topMat.map.encoding = THREE.sRGBEncoding;

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE, 0.26, TILE_SIZE),
          [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]
        );
        mesh.receiveShadow = true;
        mesh.userData.tileIndex = i;
        group.add(mesh);
        this.scene.add(group);

        this.tiles.push({ group: group, mesh: mesh, topMat: topMat, tile: tile, index: i });
        if (topMat.map) this.tileTextureKeys[i] = '';
      }

      // 보드 위 작은 구름 장식은 두지 않습니다. (보드가 작게 보이거나 가려지지 않도록)
    }

    /* ----- 주사위 ----- */

    buildDice() {
      const THREE = this.THREE;
      const counts = [3, 4, 1, 6, 2, 5]; // px, nx, py, ny, pz, nz
      const textures = counts.map(function (n) { return new THREE.CanvasTexture(pipTexture(n)); });
      textures.forEach(function (tex) { if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding; });
      const mats = textures.map(function (tex) { return new THREE.MeshLambertMaterial({ map: tex }); });

      const makeDie = function (x) {
        const die = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), mats);
        die.castShadow = true;
        die.receiveShadow = true;
        die.position.set(x, 0.2, 1.95);
        return die;
      };
      this.dice = { a: makeDie(-0.44), b: makeDie(0.44), anim: null };
      this.scene.add(this.dice.a);
      this.scene.add(this.dice.b);
      this.dice.a.rotation.set(0.1, 0.2, 0);
      this.dice.b.rotation.set(-0.12, 0.35, 0.05);
    }

    /* ----- 현재 칸 표시 링 ----- */

    buildCurrentRing() {
      const THREE = this.THREE;
      const geo = new THREE.RingGeometry(0.5, 0.62, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      ring.visible = false;
      this.currentRing = ring;
      this.scene.add(ring);
    }

    /* ----- 칸 텍스처 · 건물 갱신 ----- */

    applyState(state, youId) {
      if (!state || this.disposed) return;
      this.players = state.players || [];
      this.youId = youId || null;

      const byId = {};
      this.players.forEach(function (p) { byId[p.id] = p; });

      for (let i = 0; i < 28; i++) {
        const ownerId = state.owner ? state.owner[i] : null;
        const owner = ownerId ? byId[ownerId] : null;
        const level = state.level ? state.level[i] : 0;
        const key = (ownerId || '-') + '|' + level;
        if (this.tileTextureKeys[i] !== key) {
          this.tileTextureKeys[i] = key;
          this.updateTileTexture(i, owner, level);
          this.updateBuilding(i, owner, level);
        }
      }

      this.updateTokens(state);
      this.updateCurrentRing(state);
      this.updateDice(state.lastRoll);
    }

    updateTileTexture(idx, owner, level) {
      const THREE = this.THREE;
      const item = this.tiles[idx];
      if (!item) return;
      const pos = tilePosition(idx);
      const canvas = drawTileTexture(item.tile, idx, owner, level, pos.side);
      if (!canvas) return;
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      tex.needsUpdate = true;
      const old = item.topMat.map;
      item.topMat.map = tex;
      item.topMat.needsUpdate = true;
      if (old && old.dispose) old.dispose();
    }

    updateBuilding(idx, owner, level) {
      const THREE = this.THREE;
      if (this.buildings[idx]) {
        const old = this.buildings[idx];
        this.scene.remove(old);
        old.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material && obj.material.dispose) obj.material.dispose();
        });
        this.buildings[idx] = null;
      }
      if (!owner || !level) return;

      const pos = tilePosition(idx);
      const group = new THREE.Group();
      group.position.set(pos.x, 0.07, pos.z);
      const color = new THREE.Color(colorForPlayer(owner));
      const wallMat = new THREE.MeshLambertMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.28) });
      const roofMat = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.72) });
      const trimMat = new THREE.MeshLambertMaterial({ color: 0xfff7ea });
      const goldMat = new THREE.MeshLambertMaterial({ color: 0xf3c14b });

      if (level === 1) {
        // 별장: 작은 집 + 지붕
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.34), wallMat);
        body.position.y = 0.12;
        body.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 4), roofMat);
        roof.position.y = 0.36;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.02), trimMat);
        door.position.set(0, 0.07, 0.18);
        group.add(body, roof, door);
      } else if (level === 2) {
        // 빌딩: 계단식 두 덩이 + 창문
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.4), wallMat);
        body.position.y = 0.23;
        body.castShadow = true;
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), roofMat);
        top.position.y = 0.56;
        top.castShadow = true;
        group.add(body, top);
        for (let w = 0; w < 4; w++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), goldMat);
          win.position.set(w % 2 === 0 ? -0.09 : 0.09, w < 2 ? 0.3 : 0.12, 0.205);
          group.add(win);
        }
      } else {
        // 호텔: 큰 몸체 + 탑 + 금색 지붕 + 깃발
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.5, 0.52), wallMat);
        body.position.y = 0.25;
        body.castShadow = true;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), roofMat);
        tower.position.y = 0.67;
        tower.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.26, 4), goldMat);
        roof.position.y = 0.97;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), trimMat);
        pole.position.y = 1.24;
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.02), goldMat);
        flag.position.set(0.08, 1.33, 0);
        group.add(body, tower, roof, pole, flag);
        for (let w = 0; w < 6; w++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), goldMat);
          win.position.set(w % 3 === 0 ? -0.15 : w % 3 === 1 ? 0 : 0.15, w < 3 ? 0.36 : 0.18, 0.265);
          group.add(win);
        }
      }

      group.position;
      this.scene.add(group);
      this.buildings[idx] = group;
    }

    /* ----- 말(토큰) ----- */

    makeToken(player) {
      const THREE = this.THREE;
      const color = new THREE.Color(colorForPlayer(player));
      const group = new THREE.Group();

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 0.07, 20),
        new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.8) })
      );
      base.castShadow = true;
      base.position.y = 0.035;

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.13, 0.2, 16),
        new THREE.MeshLambertMaterial({ color: color })
      );
      body.castShadow = true;
      body.position.y = 0.18;

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 18, 14),
        new THREE.MeshLambertMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.1) })
      );
      head.castShadow = true;
      head.position.y = 0.36;

      // 귀(동물 느낌)
      const earMat = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.9) });
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 8), earMat);
      earL.position.set(-0.07, 0.45, 0);
      earL.rotation.z = 0.25;
      const earR = earL.clone();
      earR.position.x = 0.07;
      earR.rotation.z = -0.25;

      // 눈
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2c24 });
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeMat);
      eyeL.position.set(-0.04, 0.37, 0.105);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.04;

      group.add(base, body, head, earL, earR, eyeL, eyeR);

      const label = player.number !== null && player.number !== undefined
        ? player.number + '번'
        : String(player.name || '').slice(0, 4);
      const spriteCanvas = labelSprite(label, '#fff');
      if (spriteCanvas) {
        const tex = new THREE.CanvasTexture(spriteCanvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.64, 0.32, 1);
        sprite.position.set(0, 0.64, 0);
        group.add(sprite);
        group.userData.label = sprite;
      }
      group.userData.playerId = player.id;
      return group;
    }

    updateTokens(state) {
      const self = this;
      const seen = {};
      const byPos = {};
      state.players.forEach(function (p) { byPos[p.pos] = (byPos[p.pos] || 0) + 1; });

      state.players.forEach(function (p) {
        seen[p.id] = true;
        const count = byPos[p.pos] || 1;
        const order = state.players.filter(function (o) { return o.pos === p.pos; }).indexOf(p);
        const slots = [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.21], [0.21, 0.21]];
        const slot = count > 1 ? slots[order % slots.length] : [0, 0];
        const offset = { x: slot[0], z: slot[1] };

        let group = self.tokenGroups.get(p.id);
        if (!group) {
          group = self.makeToken(p);
          const start = tilePosition(p.pos);
          group.position.set(start.x + offset.x, 0.06, start.z + offset.z);
          group.userData.tile = p.pos;
          self.tokenGroups.set(p.id, group);
          self.scene.add(group);
        }
        group.visible = !p.bankrupt;
        if (group.userData.label) group.userData.label.visible = count <= 2;

        const walk = self.tokenWalk.get(p.id);
        const tile = p.pos;
        if (!walk && group.userData.tile !== tile) {
          self.startWalk(p.id, group, group.userData.tile, tile, offset);
        } else if (walk && !walk.offset) {
          walk.offset = offset;
        }
      });

      // 사라진 플레이어 토큰 정리
      this.tokenGroups.forEach(function (group, id) {
        if (!seen[id] && self.tokenGroups.has(id)) {
          self.scene.remove(group);
          self.tokenGroups.delete(id);
          self.tokenWalk.delete(id);
        }
      });
    }

    startWalk(playerId, group, from, to, offset) {
      const distance = ((to - from) % 28 + 28) % 28;
      const walk = {
        from: from,
        to: to,
        steps: distance,
        step: 0,
        startedAt: performance.now(),
        stepMs: distance > 10 ? 90 : 140,
        offset: offset || { x: 0, z: 0 }
      };
      // 14칸 넘게 움직이면(무인도로 이동 등) 순간이동
      if (distance > 14) {
        const target = tilePosition(to);
        group.position.set(target.x + walk.offset.x, 0.06, target.z + walk.offset.z);
        group.userData.tile = to;
        return;
      }
      walk.prev = group.position.clone();
      this.tokenWalk.set(playerId, walk);
    }

    updateCurrentRing(state) {
      if (!this.currentRing) return;
      if (state.status !== 'playing' || !state.turn) {
        this.currentRing.visible = false;
        return;
      }
      const player = state.players.find(function (p) { return p.id === state.turn; });
      if (!player) {
        this.currentRing.visible = false;
        return;
      }
      const pos = tilePosition(player.pos);
      this.currentRing.position.set(pos.x, 0.09, pos.z);
      this.currentRing.visible = true;
      const color = colorForPlayer(player);
      this.currentRing.material.color.set(color);
    }

    /* ----- 주사위 애니메이션 ----- */

    faceQuaternion(value) {
      const THREE = this.THREE;
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      if (value === 1) e.set(0, 0, 0);
      else if (value === 6) e.set(Math.PI, 0, 0);
      else if (value === 3) e.set(0, 0, Math.PI / 2);
      else if (value === 4) e.set(0, 0, -Math.PI / 2);
      else if (value === 2) e.set(-Math.PI / 2, 0, 0);
      else e.set(Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (Math.random() - 0.5) * 0.7, 0));
      return spin.multiply(q);
    }

    updateDice(lastRoll) {
      if (!this.dice || !lastRoll) return;
      if (lastRoll.seq === this.lastRollSeq) return;
      this.lastRollSeq = lastRoll.seq;
      const self = this;
      const now = performance.now();
      this.dice.anim = {
        startedAt: now,
        duration: 1050,
        values: [lastRoll.a, lastRoll.b],
        startRot: [self.dice.a.rotation.clone(), self.dice.b.rotation.clone()],
        targets: [self.faceQuaternion(lastRoll.a), self.faceQuaternion(lastRoll.b)],
        startPos: [self.dice.a.position.clone(), self.dice.b.position.clone()]
      };
    }

    animateDice(now) {
      const anim = this.dice && this.dice.anim;
      if (!anim) return;
      const t = Math.min(1, (now - anim.startedAt) / anim.duration);
      const dice = [this.dice.a, this.dice.b];

      if (t < 0.8) {
        for (let i = 0; i < 2; i++) {
          const die = dice[i];
          const spin = (1 - t) * 26;
          die.rotation.set(
            anim.startRot[i].x + spin * (i === 0 ? 1 : 0.8),
            anim.startRot[i].y + spin * 1.3,
            anim.startRot[i].z + spin * 0.7
          );
          die.position.y = 0.2 + Math.abs(Math.sin(t * Math.PI * 5)) * (0.55 * (1 - t));
          die.position.x = anim.startPos[i].x + Math.sin(t * Math.PI * 3 + i) * 0.16 * (1 - t);
        }
        return;
      }

      if (!anim.settle) {
        anim.settle = [dice[0].quaternion.clone(), dice[1].quaternion.clone()];
        anim.settleAt = now;
      }
      const k = Math.min(1, (now - anim.settleAt) / Math.max(60, anim.duration * 0.2));
      const ease = 1 - Math.pow(1 - k, 3);
      for (let i = 0; i < 2; i++) {
        const die = dice[i];
        die.quaternion.copy(anim.settle[i]).slerp(anim.targets[i], ease);
        die.position.y = 0.2 + Math.sin(k * Math.PI) * 0.08;
        die.position.x = anim.startPos[i].x;
      }
      if (t >= 1) {
        for (let i = 0; i < 2; i++) {
          dice[i].quaternion.copy(anim.targets[i]);
          dice[i].rotation.setFromQuaternion(dice[i].quaternion);
          dice[i].position.set(anim.startPos[i].x, 0.2, anim.startPos[i].z);
        }
        this.dice.anim = null;
      }
    }

    quatFromEuler(euler) {
      const THREE = this.THREE;
      return new THREE.Quaternion().setFromEuler(euler);
    }

    /* ----- 애니메이션 루프 ----- */

    animate() {
      if (this.disposed) return;
      const self = this;
      this.raf = window.requestAnimationFrame(function () { self.animate(); });
      const now = performance.now();
      this.animateDice(now);
      this.animateTokens(now);
      if (this.currentRing && this.currentRing.visible) {
        const pulse = 0.75 + Math.sin(now / 260) * 0.2;
        this.currentRing.material.opacity = pulse;
        this.currentRing.rotation.z = now / 1800;
      }
      this.renderer.render(this.scene, this.camera);
    }

    animateTokens(now) {
      const THREE = this.THREE;
      const self = this;
      this.tokenWalk.forEach(function (walk, playerId) {
        const group = self.tokenGroups.get(playerId);
        if (!group) {
          self.tokenWalk.delete(playerId);
          return;
        }
        const elapsed = now - walk.startedAt;
        const stepTime = walk.stepMs;
        const stepFloat = elapsed / stepTime;
        const stepIndex = Math.floor(stepFloat);
        if (stepIndex >= walk.steps) {
          const target = tilePosition(walk.to);
          group.position.set(target.x + (walk.offset ? walk.offset.x : 0), 0.06, target.z + (walk.offset ? walk.offset.z : 0));
          group.userData.tile = walk.to;
          self.tokenWalk.delete(playerId);
          return;
        }
        const fromIdx = (walk.from + stepIndex) % 28;
        const toIdx = (walk.from + stepIndex + 1) % 28;
        const a = tilePosition(fromIdx);
        const b = tilePosition(toIdx);
        const k = stepFloat - stepIndex;
        const x = a.x + (b.x - a.x) * k;
        const z = a.z + (b.z - a.z) * k;
        const hop = Math.sin(k * Math.PI) * 0.34;
        group.position.set(x, 0.06 + hop, z);
        group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      });
    }

    /* ----- 카메라 · 조작 ----- */

    updateCamera() {
      const THREE = this.THREE;
      const sinPhi = Math.sin(this.phi);
      this.camera.position.set(
        this.radius * sinPhi * Math.sin(this.theta),
        this.radius * Math.cos(this.phi),
        this.radius * sinPhi * Math.cos(this.theta)
      );
      this.camera.lookAt(0, 0.1, 0);
    }

    resetCamera() {
      this.theta = 0;
      this.phi = 0.80;
      this.radius = 11.8;
      this.updateCamera();
    }

    bindControls() {
      const canvas = this.renderer.domElement;
      const self = this;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let pinch = 0;

      canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        self.theta -= dx * 0.006;
        self.phi = Math.max(0.32, Math.min(1.18, self.phi - dy * 0.005));
        self.updateCamera();
      });
      const end = function () {
        dragging = false;
        canvas.classList.remove('is-dragging');
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('pointerleave', end);
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        self.radius = Math.max(7.5, Math.min(21, self.radius + e.deltaY * 0.012));
        self.updateCamera();
      }, { passive: false });
      canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
          pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2 && pinch) {
          const next = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          self.radius = Math.max(7.5, Math.min(21, self.radius - (next - pinch) * 0.03));
          self.updateCamera();
          pinch = next;
          e.preventDefault();
        }
      }, { passive: false });
      canvas.addEventListener('touchend', function () { pinch = 0; }, { passive: true });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    resize() {
      if (this.disposed) return;
      const rect = this.container.getBoundingClientRect ? this.container.getBoundingClientRect() : { width: 0, height: 0 };
      const width = Math.max(280, Math.floor(rect.width || this.container.clientWidth || 0));
      const height = Math.max(220, Math.floor(rect.height || this.container.clientHeight || 0));
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }

    dispose() {
      this.disposed = true;
      window.cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.onWinResize);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      this.renderer.dispose();
    }
  }

  function mount(container, options) {
    if (!container) return null;
    if (!window.THREE) return null;
    if (typeof window.WebGLRenderingContext === 'undefined') return null;
    try {
      return new Board3D(container, options);
    } catch (err) {
      console.warn('[bm3d] 3D 화면을 만들 수 없어 2D 보드로 표시합니다.', err);
      return null;
    }
  }

  BG.bm3d = {
    mount: mount,
    tilePosition: tilePosition,
    colorForPlayer: colorForPlayer,
    animalFor: animalFor,
    ANIMAL_HEX: ANIMAL_HEX,
    SEAT_HEX: SEAT_HEX
  };
})();
