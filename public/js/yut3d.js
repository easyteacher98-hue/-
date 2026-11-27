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

  /* 말판 그림의 여백 비율 — 그림의 자리(점)와 3D 말 위치를 똑같이 맞추는 데 씁니다. */
  const BOARD_MARGIN = 0.105;

  /**
   * 화면 비율에 따른 배치를 정합니다.
   * - 넓은 화면(노트북·태블릿 가로): 윷가락 자리를 말판 오른쪽에 두어 화면을 꽉 채웁니다.
   *   윷가락을 크게 키우면서 윷가락 자리(매트)도 그만큼 넓혔습니다.
   * - 좁은 화면(휴대폰·태블릿 세로): 윷가락 자리를 말판 앞쪽(카메라 쪽) 아래에 둡니다.
   */
  function layoutFor(aspect) {
    if (aspect >= 1.35) {
      return {
        wide: true,
        target: { x: 2.7, z: 0.2 },
        halfW: 9.0,
        halfD: 6.5,
        mat: { x: 9.35, z: 1.1, w: 4.3, h: 4.2 },
        sticks: { x: 9.35, z0: -0.48, dz: 1.05 }
      };
    }
    return {
      wide: false,
      target: { x: 0, z: 1.4 },
      halfW: 6.5,
      halfD: 10.1,
      mat: { x: 0, z: 8.15, w: 4.4, h: 4.2 },
      sticks: { x: 0, z0: 6.58, dz: 1.05 }
    };
  }

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

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function starPath(ctx, cx, cy, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawBoardTexture(THREE, nodePos, paths) {
    const size = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    /* 1) 따뜻한 원목 프레임 */
    const wood = ctx.createLinearGradient(0, 0, size, size);
    wood.addColorStop(0, '#e6c39b');
    wood.addColorStop(0.42, '#d2a877');
    wood.addColorStop(1, '#bf9064');
    ctx.fillStyle = wood;
    roundRectPath(ctx, 0, 0, size, size, 46);
    ctx.fill();

    // 나뭇결 (프레임에만)
    ctx.save();
    roundRectPath(ctx, 0, 0, size, size, 46);
    ctx.clip();
    ctx.strokeStyle = 'rgba(150,98,48,0.16)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const y = (i + 0.5) * (size / 26);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 40) {
        ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 7 + i) * 7);
      }
      ctx.stroke();
    }
    // 프레임 하이라이트
    ctx.strokeStyle = 'rgba(255,246,228,0.5)';
    ctx.lineWidth = 6;
    roundRectPath(ctx, 10, 10, size - 20, size - 20, 40);
    ctx.stroke();
    ctx.restore();

    /* 2) 포근한 펠트 판 */
    const inset = size * 0.072;
    const inner = size - inset * 2;
    ctx.save();
    roundRectPath(ctx, inset, inset, inner, inner, 30);
    ctx.clip();
    const felt = ctx.createRadialGradient(size * 0.44, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.74);
    felt.addColorStop(0, '#fffbf2');
    felt.addColorStop(0.62, '#f9edda');
    felt.addColorStop(1, '#f0dfc4');
    ctx.fillStyle = felt;
    ctx.fillRect(inset, inset, inner, inner);
    // 펠트 결 (아주 옅은 점)
    for (let i = 0; i < 2200; i++) {
      const x = inset + Math.random() * inner;
      const y = inset + Math.random() * inner;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(180,140,90,0.05)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, 2.4, 2.4);
    }
    // 안쪽 그림자
    ctx.strokeStyle = 'rgba(150,105,60,0.20)';
    ctx.lineWidth = 30;
    roundRectPath(ctx, inset + 15, inset + 15, inner - 30, inner - 30, 24);
    ctx.stroke();
    ctx.restore();

    // 펠트 테두리 재봉선
    ctx.save();
    ctx.setLineDash([2, 16]);
    ctx.strokeStyle = 'rgba(198,150,98,0.55)';
    ctx.lineWidth = 4;
    roundRectPath(ctx, inset + 26, inset + 26, inner - 52, inner - 52, 22);
    ctx.stroke();
    ctx.restore();

    const margin = size * BOARD_MARGIN;
    const span = size - margin * 2;
    const toPx = function (p) {
      return { x: margin + (p.x / 5) * span, y: margin + (p.y / 5) * span };
    };

    /* 3) 길 — 두꺼운 길 + 밝은 안쪽 선 */
    const segs = [];
    const seen = {};
    const addSeg = function (a, b) {
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      if (seen[key]) return;
      seen[key] = true;
      segs.push([a, b]);
    };
    Object.keys(paths).forEach(function (name) {
      const path = paths[name];
      for (let i = 0; i < path.length - 1; i++) addSeg(path[i], path[i + 1]);
    });
    addSeg(19, 0);

    const strokeSegs = function () {
      segs.forEach(function (pair) {
        const p1 = toPx(nodePos[pair[0]]);
        const p2 = toPx(nodePos[pair[1]]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 3-1) 길 그림자
    ctx.save();
    ctx.translate(0, 8);
    ctx.strokeStyle = 'rgba(140,96,52,0.20)';
    ctx.lineWidth = 52;
    strokeSegs();
    ctx.restore();

    // 3-2) 길 바탕 (따뜻한 캐러멜)
    ctx.strokeStyle = '#f2c891';
    ctx.lineWidth = 46;
    strokeSegs();

    // 3-3) 길 윗면 (크림색 띠 — 구시대적인 가는 선 대신 도톰한 이중선 느낌)
    ctx.strokeStyle = '#ffedcf';
    ctx.lineWidth = 26;
    strokeSegs();

    // 3-4) 가운데 스티치 점선
    ctx.save();
    ctx.setLineDash([1, 22]);
    ctx.strokeStyle = 'rgba(196,133,74,0.55)';
    ctx.lineWidth = 5;
    strokeSegs();
    ctx.restore();

    /* 4) 자리(칸) — 도톰한 칩 */
    const chip = function (p, r, style) {
      // 그림자
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 5, r + 4, r + 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(130,88,48,0.20)';
      ctx.fill();
      // 바깥 테 (크림)
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fffdf7';
      ctx.fill();
      // 알맹이 (위에서 빛이 드는 느낌)
      const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.45, r * 0.15, p.x, p.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, style.light || '#fff2d8');
      g.addColorStop(1, style.fill || '#f6d6a3');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // 링
      ctx.beginPath();
      ctx.arc(p.x, p.y, r - 7, 0, Math.PI * 2);
      ctx.strokeStyle = style.ring || 'rgba(196,142,82,0.72)';
      ctx.lineWidth = 5;
      ctx.stroke();
    };

    const chipR = 30;
    const bigR = 44;
    Object.keys(nodePos).forEach(function (key) {
      const node = Number(key);
      const p = toPx(nodePos[key]);
      if (node === 0) {
        chip(p, bigR, { fill: '#cdefdc', light: '#f2fff8', ring: '#4fb083' });
        // 출발 깃발
        ctx.fillStyle = '#2f7d58';
        ctx.fillRect(p.x - 2, p.y - 17, 4, 30);
        ctx.beginPath();
        ctx.moveTo(p.x + 2, p.y - 17);
        ctx.lineTo(p.x + 20, p.y - 10);
        ctx.lineTo(p.x + 2, p.y - 3);
        ctx.closePath();
        ctx.fillStyle = '#4fb083';
        ctx.fill();
      } else if (node === 20) {
        chip(p, bigR, { fill: '#ffe4ac', light: '#fffaf0', ring: '#e0a53a' });
        starPath(ctx, p.x, p.y, 20, 9, 5);
        ctx.fillStyle = '#f2b543';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (node === 5 || node === 10 || node === 15) {
        chip(p, bigR, { fill: '#ffd9c6', light: '#fff4ee', ring: '#ef8a5f' });
        // 모서리 표시 (꽃잎 점)
        for (let k = 0; k < 4; k++) {
          const a = (Math.PI / 2) * k + Math.PI / 4;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 13, 4.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(224,110,76,0.75)';
          ctx.fill();
        }
      } else {
        chip(p, chipR, {});
      }
    });

    // 출발 깃대는 칩 위에 한 번 더 (칩에 가리지 않게)

    /* 5) 글자 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const start = toPx(nodePos[0]);
    // 출발 글자는 말판 안쪽(가운데 방향)에 작은 이름표로 놓습니다.
    const toCenterX = start.x < size / 2 ? 1 : -1;
    const toCenterY = start.y < size / 2 ? 1 : -1;
    const startLabelX = start.x + toCenterX * (bigR + 52);
    const startLabelY = start.y + toCenterY * (bigR + 16);
    ctx.fillStyle = 'rgba(255,253,246,0.94)';
    roundRectPath(ctx, startLabelX - 48, startLabelY - 23, 96, 46, 23);
    ctx.fill();
    ctx.strokeStyle = 'rgba(79,176,131,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '900 27px "IBM Plex Sans KR", sans-serif';
    ctx.fillStyle = '#2f7d58';
    ctx.fillText('출발', startLabelX, startLabelY + 1);

    const mid = toPx(nodePos[20]);
    ctx.fillStyle = 'rgba(255,253,246,0.9)';
    roundRectPath(ctx, mid.x - 58, mid.y - bigR - 50, 116, 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,165,58,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '900 26px "IBM Plex Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(170,114,42,0.95)';
    ctx.fillText('가운데', mid.x, mid.y - bigR - 27);

    /* 6) 프레임 명판 */
    const plateW = 300;
    const plateH = 62;
    const plateX = size / 2 - plateW / 2;
    const plateY = size - inset / 2 - plateH / 2 + 2;
    ctx.fillStyle = 'rgba(255,248,234,0.92)';
    roundRectPath(ctx, plateX, plateY, plateW, plateH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,110,60,0.28)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '900 32px "IBM Plex Sans KR", sans-serif';
    ctx.fillStyle = '#9a6634';
    ctx.fillText('전통 윷놀이', size / 2, plateY + plateH / 2 + 1);

    // 프레임 장식 나사
    [[46, 46], [size - 46, 46], [46, size - 46], [size - 46, size - 46]].forEach(function (pos) {
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,250,238,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,100,55,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 8;
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

  /* ---------------- 윷가락 모양과 무늬 ----------------
   * 전통 윷가락은 반달 단면의 반원기둥입니다.
   *  · 둥근 등면  : 진한 나무껍질색 바탕 + 검정 × 3개  (던져서 이 면이 위로 오면 '펴진 것')
   *  · 평평한 배면: 밝은 아이보리 속살나무색        (이 면이 위로 오면 '뒤집힌 것' → 한 개가 도/개/걸/윷/모)
   *  · 빽도 윷가락(0번): 배면 가운데에 × 1개 → 밝은 면에 × 가 보이면 바로 '빽도'
   * 무늬는 캔버스로 직접 그려서 캔버스 텍스처로 올립니다. (외부 이미지 없음)
   */
  const STICK = { L: 3.1, R: 0.37 };
  const STICK_REST_Y = STICK.R / 2 + 0.02;

  /* 던져서 떨어진 느낌이 나도록 윷가락마다 아주 조금씩 비뚤어지게 둡니다. */
  const STICK_JITTER = [
    { dx: 0, dz: 0.03, yaw: -0.045 },
    { dx: 0.035, dz: -0.04, yaw: 0.03 },
    { dx: -0.03, dz: 0.05, yaw: 0.05 },
    { dx: 0.02, dz: -0.03, yaw: -0.06 }
  ];

  function canvasEl(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  function canvasTexture(THREE, canvas) {
    // 이 장면은 outputEncoding 을 기본(선형)으로 그리므로, 무늬 색을 그대로 보이게 sRGB 표시를 켜지 않습니다.
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  }

  function drawCross(ctx, cx, cy, size, color, lineWidth) {
    const half = size / 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx - half, cy - half);
    ctx.lineTo(cx + half, cy + half);
    ctx.moveTo(cx + half, cy - half);
    ctx.lineTo(cx - half, cy + half);
    ctx.stroke();
    ctx.restore();
  }

  /** 둥근 등면 무늬 — 진한 나무껍질색 + × 3개 */
  function barkTexture(THREE) {
    const R = STICK.R;
    const arcW = 256;
    const ppu = arcW / (Math.PI * R);          // 가로·세로 같은 비율(px per world unit)
    const arcH = Math.round(STICK.L * ppu);
    const canvas = canvasEl(arcW, arcH);
    const ctx = canvas.getContext('2d');

    // 바탕 — 가운데가 조금 밝고, 평평한 면과 만나는 양 가장자리는 어둡게 (등이 둥글게 보입니다)
    const base = ctx.createLinearGradient(0, 0, arcW, 0);
    base.addColorStop(0, '#7a4820');
    base.addColorStop(0.14, '#9c6229');
    base.addColorStop(0.5, '#bb7b39');
    base.addColorStop(0.86, '#9c6229');
    base.addColorStop(1, '#7a4820');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, arcW, arcH);

    // 나뭇결 (길이 방향)
    for (let i = 0; i < 30; i++) {
      const x = (i + 0.5) * (arcW / 30);
      ctx.beginPath();
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(58,30,10,0.18)' : 'rgba(210,158,100,0.14)';
      ctx.lineWidth = 1.4 + (i % 4) * 0.7;
      for (let y = 0; y <= arcH; y += 18) {
        const xx = x + Math.sin(y / 70 + i * 0.7) * 3.4;
        if (y === 0) ctx.moveTo(xx, y);
        else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }

    // × 3개 — 길이 방향으로 나란히
    const size = 0.33 * ppu;
    const lineWidth = Math.max(6, 0.05 * ppu);
    [0.17, 0.5, 0.83].forEach(function (f, i) {
      drawCross(ctx, arcW / 2 + (i === 1 ? 5 : -5), arcH * f, size, '#2a1608', lineWidth);
    });

    return canvasTexture(THREE, canvas);
  }

  /** 평평한 배면 무늬 — 밝은 아이보리 속살나무색. withMark 면 가운데 × 1개(빽도 윷가락) */
  function bellyTexture(THREE, withMark) {
    const w = 512;
    const ppu = w / STICK.L;
    const h = Math.round(2 * STICK.R * ppu);
    const canvas = canvasEl(w, h);
    const ctx = canvas.getContext('2d');

    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#f2dfb8');
    base.addColorStop(0.45, '#fbeed3');
    base.addColorStop(1, '#ebd2a5');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // 결
    for (let i = 0; i < 9; i++) {
      const y = (i + 0.5) * (h / 9);
      ctx.beginPath();
      ctx.strokeStyle = i % 2 ? 'rgba(198,152,98,0.20)' : 'rgba(228,196,152,0.32)';
      ctx.lineWidth = 1.6;
      for (let x = 0; x <= w; x += 20) {
        const yy = y + Math.sin(x / 90 + i) * 1.6;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // 또렷한 윤곽선
    ctx.strokeStyle = 'rgba(138,92,44,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    if (withMark) {
      drawCross(ctx, w / 2, h / 2, h * 0.56, '#3a2010', Math.max(5, h * 0.07));
    }

    return canvasTexture(THREE, canvas);
  }

  /** 양 끝 단면 — 밝은 나뭇결 */
  function endTexture(THREE) {
    const size = 256;
    const canvas = canvasEl(size, size);
    const ctx = canvas.getContext('2d');
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 6, c, c, c);
    g.addColorStop(0, '#f7e4bd');
    g.addColorStop(0.7, '#eed4a5');
    g.addColorStop(1, '#d8b57e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let r = 14; r < c; r += 13) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(170,126,76,0.22)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    return canvasTexture(THREE, canvas);
  }

  /**
   * 윷가락 하나를 만듭니다.
   * 중심(회전축)은 반달 단면을 감싸는 상자의 가운데 = 바닥에서 R/2 위입니다.
   * 그래서 앞면(평평한 배면)이 위로 오거나 뒤집혀도 높이가 같습니다.
   */
  function buildStick(THREE, index, textures) {
    const R = STICK.R;
    const L = STICK.L;
    const pivotY = -R / 2;
    const group = new THREE.Group();

    // 1) 둥근 등면 — 반원기둥의 곡면만
    const arcGeo = new THREE.CylinderGeometry(R, R, L, 36, 1, true, 0, Math.PI);
    const arc = new THREE.Mesh(arcGeo, new THREE.MeshLambertMaterial({ map: textures.bark }));
    arc.rotation.z = Math.PI / 2;
    arc.position.y = pivotY;
    group.add(arc);

    // 2) 평평한 배면 — 빽도 윷가락(0번)만 가운데 × 1개
    const flatGeo = new THREE.PlaneGeometry(L, R * 2);
    const flat = new THREE.Mesh(flatGeo, new THREE.MeshLambertMaterial({
      map: index === 0 ? textures.bellyMark : textures.belly
    }));
    flat.rotation.x = Math.PI / 2;
    flat.position.y = pivotY + 0.004;
    group.add(flat);

    // 3) 양 끝 단면 (반원)
    const capGeo = new THREE.CircleGeometry(R, 28, 0, Math.PI);
    const capMat = new THREE.MeshLambertMaterial({ map: textures.end });
    const capFront = new THREE.Mesh(capGeo, capMat);
    capFront.rotation.y = Math.PI / 2;
    capFront.position.set(L / 2, pivotY, 0);
    group.add(capFront);
    const capBack = new THREE.Mesh(capGeo, capMat);
    capBack.rotation.y = -Math.PI / 2;
    capBack.position.set(-L / 2, pivotY, 0);
    group.add(capBack);

    group.userData.parts = [arcGeo, flatGeo, capGeo];
    return group;
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
    // 배경은 CSS 그라데이션을 그대로 보이게 둡니다. (alpha: true)
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    const view = { theta: 0, phi: 0.62, radius: 19 };
    let layout = layoutFor(width / height);
    function updateCamera() {
      const fov = (camera.fov * Math.PI) / 180;
      const tan = Math.tan(fov / 2);
      const aspect = camera.aspect || 1;
      // 말판+윷가락 자리가 화면 안에 다 들어오도록 거리를 잡습니다.
      const rH = layout.halfD / tan;
      const rW = layout.halfW / (tan * aspect);
      view.radius = Math.max(rH, rW) * 0.96;
      const sinPhi = Math.sin(view.phi);
      camera.position.set(
        layout.target.x + view.radius * sinPhi * Math.sin(view.theta),
        view.radius * Math.cos(view.phi),
        layout.target.z + view.radius * sinPhi * Math.cos(view.theta)
      );
      camera.lookAt(layout.target.x, 0, layout.target.z);
    }
    updateCamera();

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 0.42);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe6c8, 0.22);
    fill.position.set(-8, 6, -6);
    scene.add(fill);

    /* ----- 부드러운 그림자 만들기 ----- */
    const softShadowTex = (function () {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(128, 128, 10, 128, 128, 126);
      g.addColorStop(0, 'rgba(120,82,45,0.34)');
      g.addColorStop(0.55, 'rgba(120,82,45,0.16)');
      g.addColorStop(1, 'rgba(120,82,45,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();

    const floorShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN.x * 1.62, WIN.z * 1.62),
      new THREE.MeshBasicMaterial({ map: softShadowTex, transparent: true, depthWrite: false })
    );
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.position.y = -0.735;
    scene.add(floorShadow);

    // 말판
    const boardGroup = new THREE.Group();
    const boardTexture = drawBoardTexture(THREE, nodePos, paths);
    const boardGeo = new THREE.BoxGeometry(WIN.x, 0.55, WIN.z);
    const boardMat = [
      new THREE.MeshLambertMaterial({ color: '#bb9067' }),
      new THREE.MeshLambertMaterial({ color: '#b3875d' }),
      new THREE.MeshLambertMaterial({ map: boardTexture }),
      new THREE.MeshLambertMaterial({ color: '#a97c52' }),
      new THREE.MeshLambertMaterial({ color: '#b68b60' }),
      new THREE.MeshLambertMaterial({ color: '#b68b60' })
    ];
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.y = -0.275;
    boardGroup.add(boardMesh);

    // 한 단 아래 받침 (원목 테두리가 두툼해 보이게)
    const rimGeo = new THREE.BoxGeometry(WIN.x + 0.46, 0.16, WIN.z + 0.46);
    const rimMat = new THREE.MeshLambertMaterial({ color: '#a97c52' });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = -0.63;
    boardGroup.add(rimMesh);
    scene.add(boardGroup);

    // 윷가락 놓는 자리(펠트 매트)
    const matTexture = (function () {
      const w = 480;
      const h = 460;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // 펠트 바탕
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#faefd8');
      g.addColorStop(0.55, '#f3e2c2');
      g.addColorStop(1, '#e8d2ab');
      ctx.fillStyle = g;
      roundRectPath(ctx, 4, 4, w - 8, h - 8, 26);
      ctx.fill();
      // 재봉선
      ctx.setLineDash([2, 12]);
      ctx.strokeStyle = 'rgba(198,150,98,0.65)';
      ctx.lineWidth = 3;
      roundRectPath(ctx, 18, 18, w - 36, h - 36, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      // 가운데 안쪽 그림자 (윷가락이 놓일 자리를 살짝 눌린 느낌으로)
      const inner = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.62);
      inner.addColorStop(0, 'rgba(255,255,255,0.28)');
      inner.addColorStop(1, 'rgba(180,140,90,0.10)');
      ctx.fillStyle = inner;
      roundRectPath(ctx, 18, 18, w - 36, h - 36, 18);
      ctx.fill();
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      return tex;
    })();
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.mat.w, layout.mat.h),
      new THREE.MeshLambertMaterial({ map: matTexture, transparent: true })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(layout.mat.x, 0.012, layout.mat.z);
    scene.add(mat);

    /* ----- 윷가락 4개 ----- */
    const stickTextures = {
      bark: barkTexture(THREE),
      belly: bellyTexture(THREE, false),
      bellyMark: bellyTexture(THREE, true),
      end: endTexture(THREE)
    };

    /** 윷가락이 쉬는 자리·각도 (던져서 떨어진 모양) */
    function restOf(index, lay) {
      const jitter = STICK_JITTER[index] || { dx: 0, dz: 0, yaw: 0 };
      return {
        x: lay.sticks.x + jitter.dx,
        y: STICK_REST_Y,
        z: lay.sticks.z0 + index * lay.sticks.dz + jitter.dz,
        yaw: jitter.yaw
      };
    }

    function poseAtRest(stick, rest, flipped) {
      stick.position.set(rest.x, rest.y, rest.z);
      stick.rotation.set(flipped ? Math.PI : 0, rest.yaw, 0);
    }

    const sticks = [];
    for (let i = 0; i < 4; i++) {
      const group = buildStick(THREE, i, stickTextures);
      group.userData.index = i;
      group.userData.rest = restOf(i, layout);
      poseAtRest(group, group.userData.rest, false);
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
      // 말 아래 부드러운 그림자
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.16, 1.16),
        new THREE.MeshBasicMaterial({ map: softShadowTex, transparent: true, depthWrite: false, opacity: 0.9 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.005;
      group.add(shadow);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.48, 0.16, 20),
        new THREE.MeshLambertMaterial({ color: color })
      );
      base.position.y = 0.08;
      group.add(base);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.045, 8, 24),
        new THREE.MeshLambertMaterial({ color: '#fffaf0' })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.17;
      group.add(ring);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 18, 14),
        new THREE.MeshLambertMaterial({ color: color })
      );
      body.position.y = 0.36;
      group.add(body);
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })
      );
      shine.position.set(-0.11, 0.47, -0.06);
      group.add(shine);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 10),
        new THREE.MeshLambertMaterial({ color: '#fff8ec' })
      );
      cap.position.y = 0.58;
      group.add(cap);
      const label = labelSprite(THREE, player.number || (player.name || '').slice(0, 2), '#4a2f1a');
      label.position.y = 1.06;
      label.scale.set(0.62, 0.62, 1);
      group.add(label);
      group.visible = false;
      return group;
    }

    function nodeToWorld(node) {
      const p = nodePos[node];
      if (!p) return { x: 0, z: 0 };
      // 그림(texture)에서 자리(점)가 놓인 비율과 같은 비율로 3D 위치를 잡습니다.
      const innerX = WIN.x * (1 - BOARD_MARGIN * 2);
      const innerZ = WIN.z * (1 - BOARD_MARGIN * 2);
      return {
        x: (p.x / 5 - 0.5) * innerX,
        z: (p.y / 5 - 0.5) * innerZ
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
      const info = state.throwInfo || state.lastThrow || null;
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
        const rest = stick.userData.rest;
        const from = stickAnim.from[i] || { x: rest.x, y: rest.y, z: rest.z, rx: 0, ry: rest.yaw, rz: 0 };
        // 포물선 낙하 + 여러 번 구르기
        const e = 1 - Math.pow(1 - t, 3);
        const spin = (1 - e) * 16 + 2;
        stick.position.x = from.x + (rest.x - from.x) * e;
        stick.position.z = from.z + (rest.z - from.z) * e;
        stick.position.y = rest.y + (1 - e) * (2.6 + i * 0.1) * Math.abs(Math.cos(t * Math.PI * 1.4));
        const flipped = stickAnim.values[i];
        stick.rotation.x = (flipped ? Math.PI : 0) * e + spin * (1 - e) * 0.9;
        stick.rotation.y = rest.yaw * e + (1 - e) * spin * 0.5;
        stick.rotation.z = (from.rz || 0) * (1 - e);
        if (t >= 1) poseAtRest(stick, rest, flipped);
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
      // 화면 비율이 바뀌면 윷가락 자리와 시점을 다시 잡습니다.
      const next = layoutFor(w / h);
      const changed = next.wide !== layout.wide;
      layout = next;
      mat.geometry.dispose();
      mat.geometry = new THREE.PlaneGeometry(layout.mat.w, layout.mat.h);
      mat.position.set(layout.mat.x, 0.01, layout.mat.z);
      sticks.forEach(function (stick, i) {
        stick.userData.rest = restOf(i, layout);
        if (changed && !stickAnim.active) {
          poseAtRest(stick, stick.userData.rest, stick.rotation.x !== 0);
        }
      });
      updateCamera();
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
      sticks.forEach(function (stick) {
        (stick.userData.parts || []).forEach(function (geo) {
          if (geo && geo.dispose) geo.dispose();
        });
      });
      Object.keys(stickTextures).forEach(function (key) {
        const texture = stickTextures[key];
        if (texture && texture.dispose) texture.dispose();
      });
      boardGeo.dispose();
      boardTexture.dispose();
      rimGeo.dispose();
      mat.geometry.dispose();
      if (matTexture && matTexture.dispose) matTexture.dispose();
      if (softShadowTex && softShadowTex.dispose) softShadowTex.dispose();
      floorShadow.geometry.dispose();
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
