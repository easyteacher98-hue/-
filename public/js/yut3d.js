/*
 * 전통 윷놀이 3D 연출 (Three.js)
 * - 윷가락 4개가 손에서 떨어져 구르다가 앞/뒤가 정해져 멈추는 장면
 * - 말이 말판 위를 한 칸씩 걸어가는 장면 (잡기·완주 연출 포함)
 * 3D 를 그릴 수 없는 기기(오래된 태블릿·웹뷰)에서는 스스로 꺼지고,
 * 화면(mini-boards.js)이 지금까지의 2D 말판을 그대로 보여 줍니다.
 *
 * 저작권: 모든 그림(말판·윷가락·말)을 이 파일에서 직접 그립니다. 외부 이미지 없음.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});

  const WIN = { x: 11.6, z: 11.6 };          // 말판 크기(월드 좌표)
  const CELL = WIN.x / 5;                     // 5x5 격자 한 칸
  const STICK_ROW_Z = 7.9;                    // 윷가락이 떨어지는 자리

  function hasWebGL() {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (err) {
      return false;
    }
  }

  /* ---------------- 말판 그림 ---------------- */
  function drawBoardTexture(THREE, nodePos, paths) {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 바탕 (나무색)
    ctx.fillStyle = '#f6e6c8';
    ctx.fillRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(196,150,96,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 나뭇결
    ctx.strokeStyle = 'rgba(181,132,74,0.10)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      const y = (i + 0.5) * (size / 22);
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 32) {
        ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 6 + i) * 6);
      }
      ctx.stroke();
    }

    const margin = size * 0.075;
    const span = size - margin * 2;
    const toPx = function (p) {
      return { x: margin + (p.x / 5) * span, y: margin + (p.y / 5) * span };
    };

    // 판 테두리
    ctx.strokeStyle = '#a9744a';
    ctx.lineWidth = 10;
    ctx.strokeRect(margin * 0.55, margin * 0.55, size - margin * 1.1, size - margin * 1.1);

    // 길 (패스)
    const drawn = {};
    const line = function (a, b) {
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      if (drawn[key]) return;
      drawn[key] = true;
      const p1 = toPx(nodePos[a]);
      const p2 = toPx(nodePos[b]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    };
    ctx.strokeStyle = '#b98a5a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    Object.keys(paths).forEach(function (name) {
      const path = paths[name];
      for (let i = 0; i < path.length - 1; i++) line(path[i], path[i + 1]);
    });
    // 바깥 둘레 마지막 연결(19 → 0)
    line(19, 0);

    // 자리(점)
    Object.keys(nodePos).forEach(function (key) {
      const node = Number(key);
      const p = toPx(nodePos[key]);
      const big = node === 0 || node === 5 || node === 10 || node === 15 || node === 20;
      ctx.beginPath();
      ctx.arc(p.x, p.y, big ? 16 : 11, 0, Math.PI * 2);
      ctx.fillStyle = big ? '#8a5b34' : '#c79869';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff8ec';
      ctx.stroke();
    });

    // 글자
    ctx.fillStyle = '#6b4526';
    ctx.font = 'bold 34px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const start = toPx(nodePos[0]);
    ctx.fillText('출발', start.x + 58, start.y + 44);
    const mid = toPx(nodePos[20]);
    ctx.font = 'bold 28px "IBM Plex Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(107,69,38,0.75)';
    ctx.fillText('가운데', mid.x, mid.y - 30);

    // 가운데 문양
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 40, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(138,91,52,0.35)';
    ctx.lineWidth = 5;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    return texture;
  }

  function playerColors() {
    return ['#f4775c', '#5b8def', '#4fb477', '#b07be8'];
  }

  function labelSprite(THREE, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fillStyle = color || '#fff';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 62px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').slice(0, 2), 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.66, 0.66, 1);
    return sprite;
  }

  function createBoard(container, options) {
    const THREE = window.THREE;
    const opts = options || {};
    const state0 = opts.state || null;
    const nodePos = (state0 && state0.nodePos) || (window.Yut && window.Yut.NODE_POS) || {};
    const paths = (state0 && state0.paths) || (window.Yut && window.Yut.PATHS) || {};

    const width = container.clientWidth || 640;
    const height = container.clientHeight || Math.round(width * 0.72);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.className = 'yut3d-canvas';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#fdf1e3');

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const view = { theta: 0, phi: 0.62, radius: 19 };
    function updateCamera() {
      const sinPhi = Math.sin(view.phi);
      camera.position.set(view.radius * sinPhi * Math.sin(view.theta), view.radius * Math.cos(view.phi), view.radius * sinPhi * Math.cos(view.theta));
      camera.lookAt(0, 0, 1.6);
    }
    updateCamera();

    scene.add(new THREE.AmbientLight(0xffffff, 0.82));
    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe6c8, 0.3);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    // 말판
    const boardGroup = new THREE.Group();
    const boardTexture = drawBoardTexture(THREE, nodePos, paths);
    const boardGeo = new THREE.BoxGeometry(WIN.x, 0.34, WIN.z);
    const boardMat = [
      new THREE.MeshLambertMaterial({ color: '#c89a63' }),
      new THREE.MeshLambertMaterial({ color: '#c89a63' }),
      new THREE.MeshLambertMaterial({ map: boardTexture }),
      new THREE.MeshLambertMaterial({ color: '#b98a5a' }),
      new THREE.MeshLambertMaterial({ color: '#c89a63' }),
      new THREE.MeshLambertMaterial({ color: '#c89a63' })
    ];
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.y = -0.17;
    boardGroup.add(boardMesh);
    scene.add(boardGroup);

    // 윷가락 놓는 자리(매트)
    const matTexture = (function () {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = Math.round(size * 0.34);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#efe0c6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(169,116,74,0.45)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.fillStyle = 'rgba(107,69,38,0.55)';
      ctx.font = 'bold 34px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('윷가락', canvas.width / 2, canvas.height - 24);
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      return tex;
    })();
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 2.2),
      new THREE.MeshLambertMaterial({ map: matTexture })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.01, STICK_ROW_Z);
    scene.add(mat);

    /* ----- 윷가락 4개 ----- */
    const sticks = [];
    const stickColors = ['#e8cfa4', '#e3c493', '#ecd3ac', '#e0bf8d'];
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 1.28, 18, 1, false, 0, Math.PI),
        new THREE.MeshLambertMaterial({ color: stickColors[i] })
      );
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.0;
      group.add(body);

      // 납작한 면(배) — 흰 칠
      const flat = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.05, 0.3),
        new THREE.MeshLambertMaterial({ color: '#fffaf0' })
      );
      flat.position.set(0, -0.06, 0);
      group.add(flat);

      // 양 끝 붉은 띠 (전통 윷가락 느낌)
      [-0.56, 0.56].forEach(function (x) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.3, 0.3),
          new THREE.MeshLambertMaterial({ color: '#c9503f' })
        );
        band.position.set(x, -0.01, 0);
        group.add(band);
      });

      group.userData.index = i;
      group.position.set(-2.1 + i * 1.4, 0.17, STICK_ROW_Z);
      group.userData.rest = { x: -2.1 + i * 1.4, z: STICK_ROW_Z };
      group.rotation.set(0, 0, 0);
      scene.add(group);
      sticks.push(group);
    }

    /* ----- 말 ----- */
    const tokens = new Map();   // pieceId -> { group, walk, node, color }
    function colorFor(player, index) {
      // 번호가 있으면 번호 색, 없으면 좌석 순서 색
      const palette = playerColors();
      const seat = typeof index === 'number' ? index : 0;
      return palette[seat % palette.length];
    }

    function makeToken(piece, player, color) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.48, 0.16, 20),
        new THREE.MeshLambertMaterial({ color: color })
      );
      base.position.y = 0.08;
      group.add(base);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 12),
        new THREE.MeshLambertMaterial({ color: color })
      );
      body.position.y = 0.34;
      group.add(body);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 10),
        new THREE.MeshLambertMaterial({ color: '#fff8ec' })
      );
      cap.position.y = 0.56;
      group.add(cap);
      const label = labelSprite(THREE, player.number || (player.name || '').slice(0, 2), '#4a2f1a');
      label.position.y = 0.95;
      label.scale.set(0.5, 0.5, 1);
      group.add(label);
      group.visible = false;
      return group;
    }

    function nodeToWorld(node) {
      const p = nodePos[node];
      if (!p) return { x: 0, z: 0 };
      return {
        x: (p.x / 5 - 0.5) * WIN.x,
        z: (p.y / 5 - 0.5) * WIN.z
      };
    }

    /* ----- 상태 반영 ----- */
    let lastThrowSeq = 0;
    let lastMoveSeq = 0;
    let firstApply = true;
    const stickAnim = { startedAt: 0, values: [false, false, false, false], active: false, from: [] };

    function applyState(state) {
      if (!state) return false;
      try {
        applyStateInner(state);
        return true;
      } catch (err) {
        console.warn('[yut3d] 3D 말판을 갱신하지 못했습니다. 2D 말판으로 보여 줍니다.', err && err.message);
        return false;
      }
    }

    function applyStateInner(state) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      // 윷가락
      const info = state.throwInfo;
      if (info && info.seq && info.seq !== lastThrowSeq) {
        lastThrowSeq = info.seq;
        stickAnim.values = (info.sticks || []).slice(0, 4).map(function (v) { return !!v; });
        stickAnim.startedAt = now;
        stickAnim.active = true;
        stickAnim.from = sticks.map(function (s) {
          return { x: s.position.x, y: s.position.y, z: s.position.z, rx: s.rotation.x, ry: s.rotation.y, rz: s.rotation.z };
        });
        lastMoveSeq = 0;
      }

      // 말
      const players = state.players || [];
      const alive = {};
      players.forEach(function (player, index) {
        (player.pieces || []).forEach(function (piece) {
          alive[piece.id] = true;
          let token = tokens.get(piece.id);
          if (!token) {
            const color = colorFor(player, index);
            const group = makeToken(piece, player, color);
            token = { group: group, walk: null, node: null, color: color, playerId: player.id };
            tokens.set(piece.id, token);
            scene.add(group);
          }
          token.group.visible = !piece.finished;
          if (piece.finished) {
            token.node = 'finished';
            return;
          }
          const node = piece.node;
          if (node === null || node === undefined) {
            // 출발점 대기
            token.node = 'waiting';
            token.group.visible = false;
            return;
          }
          const target = nodeToWorld(node);
          if (firstApply || token.node === null || token.node === 'waiting' || token.node === 'finished') {
            token.group.position.set(target.x, 0.2, target.z);
            token.node = node;
            token.group.visible = true;
            return;
          }
          if (token.node !== node) {
            const fromNode = token.node;
            token.walk = {
              from: fromNode,
              to: node,
              path: piece.path,
              startedAt: now,
              // 잡기/완주는 조금 더 천천히
              duration: Math.min(1400, 260 + Math.abs((piece.idx || 0) - (token.idx || 0)) * 90)
            };
            token.node = node;
            token.idx = piece.idx;
            token.group.visible = true;
          }
        });
      });
      tokens.forEach(function (token, id) {
        if (!alive[id]) {
          scene.remove(token.group);
          tokens.delete(id);
        }
      });
      firstApply = false;
    }

    /* ----- 애니메이션 ----- */
    function animateSticks(now) {
      if (!stickAnim.active) return;
      const elapsed = now - stickAnim.startedAt;
      const duration = 1250;
      sticks.forEach(function (stick, i) {
        const delay = i * 70;
        const t = Math.min(1, Math.max(0, (elapsed - delay) / duration));
        const from = stickAnim.from[i] || { x: stick.userData.rest.x, y: 0.17, z: stick.userData.rest.z };
        const targetY = 0.17;
        // 포물선 낙하 + 여러 번 구르기
        const e = 1 - Math.pow(1 - t, 3);
        const spin = (1 - e) * 16 + 2;
        stick.position.x = from.x + (stick.userData.rest.x - from.x) * e;
        stick.position.z = from.z + (stick.userData.rest.z - from.z) * e;
        stick.position.y = targetY + (1 - e) * (2.6 + i * 0.1) * Math.abs(Math.cos(t * Math.PI * 1.4));
        const flipped = stickAnim.values[i];
        stick.rotation.x = (flipped ? Math.PI : 0) * e + spin * (1 - e) * 0.9;
        stick.rotation.y = (from.ry || 0) + spin * (1 - e) * 0.5;
        stick.rotation.z = (from.rz || 0) * (1 - e);
        if (t >= 1) {
          stick.position.set(stick.userData.rest.x, targetY, stick.userData.rest.z);
          stick.rotation.set(flipped ? Math.PI : 0, 0, 0);
        }
      });
      if (elapsed > duration + 400) stickAnim.active = false;
    }

    function animateTokens(now) {
      tokens.forEach(function (token) {
        const walk = token.walk;
        if (!walk) return;
        const t = Math.min(1, (now - walk.startedAt) / walk.duration);
        const a = nodeToWorld(walk.from);
        const b = nodeToWorld(walk.to);
        const e = t * t * (3 - 2 * t);
        const hop = Math.sin(t * Math.PI) * 0.5;
        token.group.position.set(a.x + (b.x - a.x) * e, 0.2 + hop, a.z + (b.z - a.z) * e);
        token.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (t >= 1) {
          token.group.position.set(b.x, 0.2, b.z);
          token.walk = null;
        }
      });
    }

    let raf = null;
    let disposed = false;
    function animate() {
      if (disposed) return;
      raf = window.requestAnimationFrame(animate);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      animateSticks(now);
      animateTokens(now);
      renderer.render(scene, camera);
    }
    animate();

    function resize() {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(function () { resize(); });
      observer.observe(container);
    }

    /* ----- 시점 돌리기 (드래그) ----- */
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const canvasEl = renderer.domElement;
    canvasEl.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvasEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      view.theta -= (e.clientX - lastX) * 0.006;
      view.phi = Math.max(0.35, Math.min(1.15, view.phi - (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    });
    function stopDrag() { dragging = false; }
    canvasEl.addEventListener('pointerup', stopDrag);
    canvasEl.addEventListener('pointercancel', stopDrag);
    canvasEl.addEventListener('pointerleave', stopDrag);

    function dispose() {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      tokens.forEach(function (token) { scene.remove(token.group); });
      tokens.clear();
      boardGeo.dispose();
      boardTexture.dispose();
      renderer.dispose();
      if (canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl);
    }

    return {
      host: container,
      applyState: applyState,
      resize: resize,
      dispose: dispose,
      isBusy: function () {
        if (stickAnim.active) return true;
        let busy = false;
        tokens.forEach(function (token) { if (token.walk) busy = true; });
        return busy;
      }
    };
  }

  BG.yut3d = {
    supported: hasWebGL,
    mount: function (container, options) {
      if (!container || !window.THREE || !hasWebGL()) return null;
      try {
        return createBoard(container, options);
      } catch (err) {
        console.warn('[yut3d] 3D 말판을 그리지 못해 2D 말판으로 보여 줍니다.', err && err.message);
        try { container.innerHTML = ''; } catch (e) { /* ignore */ }
        return null;
      }
    }
  };
})();
