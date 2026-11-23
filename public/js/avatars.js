/*
 * 귀여운 동물 아바타 (인라인 SVG)
 * - 닉네임을 넣으면 항상 같은 동물이 나오도록 이름에서 골고루 뽑습니다.
 * - 대기방 · 게임판 · 교사 관전 · 우승 화면에서 함께 씁니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});

  const ANIMALS = [
    { id: 'dog', name: '강아지' },
    { id: 'cat', name: '고양이' },
    { id: 'rabbit', name: '토끼' },
    { id: 'bear', name: '곰' },
    { id: 'fox', name: '여우' },
    { id: 'chick', name: '병아리' }
  ];

  const ART = {
    dog:
      '<g>' +
      '<ellipse cx="25" cy="37" rx="11.5" ry="18" fill="#dfa578" transform="rotate(-16 25 37)"/>' +
      '<ellipse cx="75" cy="37" rx="11.5" ry="18" fill="#dfa578" transform="rotate(16 75 37)"/>' +
      '<circle cx="50" cy="57" r="30" fill="#f6d7b0"/>' +
      '<ellipse cx="50" cy="70" rx="16" ry="12" fill="#fff7ea"/>' +
      '<circle cx="39" cy="51" r="4.3" fill="#4a3a32"/>' +
      '<circle cx="61" cy="51" r="4.3" fill="#4a3a32"/>' +
      '<circle cx="40.5" cy="49.4" r="1.5" fill="#fff"/>' +
      '<circle cx="62.5" cy="49.4" r="1.5" fill="#fff"/>' +
      '<ellipse cx="50" cy="64" rx="5" ry="4" fill="#4a3a32"/>' +
      '<path d="M50 68v6" stroke="#4a3a32" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
      '<circle cx="30" cy="63" r="5" fill="#ffb9b9" opacity="0.75"/>' +
      '<circle cx="70" cy="63" r="5" fill="#ffb9b9" opacity="0.75"/>' +
      '</g>',
    cat:
      '<g>' +
      '<path d="M22 30l4 20 18-9z" fill="#f3b7c8"/>' +
      '<path d="M78 30l-4 20-18-9z" fill="#f3b7c8"/>' +
      '<path d="M27 33l2.5 12 10-5.5z" fill="#ffe3ea"/>' +
      '<path d="M73 33l-2.5 12-10-5.5z" fill="#ffe3ea"/>' +
      '<circle cx="50" cy="58" r="29" fill="#ffd9e3"/>' +
      '<circle cx="39" cy="52" r="4.6" fill="#4a3a32"/>' +
      '<circle cx="61" cy="52" r="4.6" fill="#4a3a32"/>' +
      '<circle cx="40.6" cy="50.3" r="1.6" fill="#fff"/>' +
      '<circle cx="62.6" cy="50.3" r="1.6" fill="#fff"/>' +
      '<path d="M50 62l-3.6 3.2h7.2z" fill="#e8879f"/>' +
      '<path d="M50 66c-1.6 3-4.6 3.4-6 1.2M50 66c1.6 3 4.6 3.4 6 1.2" stroke="#4a3a32" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M24 58h9M24 64h9M76 58h-9M76 64h-9" stroke="#e2a0b3" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="31" cy="63" r="4.6" fill="#ffb3b3" opacity="0.8"/>' +
      '<circle cx="69" cy="63" r="4.6" fill="#ffb3b3" opacity="0.8"/>' +
      '</g>',
    rabbit:
      '<g>' +
      '<ellipse cx="36" cy="26" rx="8.5" ry="21" fill="#efe6ff" transform="rotate(-9 36 26)"/>' +
      '<ellipse cx="64" cy="26" rx="8.5" ry="21" fill="#efe6ff" transform="rotate(9 64 26)"/>' +
      '<ellipse cx="36" cy="27" rx="4.2" ry="14" fill="#ffd0e2" transform="rotate(-9 36 27)"/>' +
      '<ellipse cx="64" cy="27" rx="4.2" ry="14" fill="#ffd0e2" transform="rotate(9 64 27)"/>' +
      '<circle cx="50" cy="60" r="29" fill="#f7f2ff"/>' +
      '<circle cx="39" cy="55" r="4.4" fill="#4a3a32"/>' +
      '<circle cx="61" cy="55" r="4.4" fill="#4a3a32"/>' +
      '<circle cx="40.5" cy="53.4" r="1.5" fill="#fff"/>' +
      '<circle cx="62.5" cy="53.4" r="1.5" fill="#fff"/>' +
      '<path d="M50 64l-3 2.8h6z" fill="#f0a0bb"/>' +
      '<path d="M50 67.5c-2 3-5 2.6-5.6 0.4M50 67.5c2 3 5 2.6 5.6 0.4" stroke="#4a3a32" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="31" cy="66" r="5.2" fill="#ffbccb" opacity="0.8"/>' +
      '<circle cx="69" cy="66" r="5.2" fill="#ffbccb" opacity="0.8"/>' +
      '</g>',
    bear:
      '<g>' +
      '<circle cx="25" cy="30" r="12" fill="#d9b184"/>' +
      '<circle cx="75" cy="30" r="12" fill="#d9b184"/>' +
      '<circle cx="25" cy="30" r="6.5" fill="#f6e2c8"/>' +
      '<circle cx="75" cy="30" r="6.5" fill="#f6e2c8"/>' +
      '<circle cx="50" cy="57" r="31" fill="#efd0aa"/>' +
      '<ellipse cx="50" cy="67" rx="16" ry="12.5" fill="#fff5e4"/>' +
      '<circle cx="39" cy="52" r="4.4" fill="#4a3a32"/>' +
      '<circle cx="61" cy="52" r="4.4" fill="#4a3a32"/>' +
      '<circle cx="40.5" cy="50.4" r="1.5" fill="#fff"/>' +
      '<circle cx="62.5" cy="50.4" r="1.5" fill="#fff"/>' +
      '<ellipse cx="50" cy="62" rx="5.4" ry="4.2" fill="#4a3a32"/>' +
      '<path d="M50 66v5M50 71c-2 2-4.5 1.6-5.3 0M50 71c2 2 4.5 1.6 5.3 0" stroke="#4a3a32" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="30" cy="62" r="5" fill="#ffb3a7" opacity="0.75"/>' +
      '<circle cx="70" cy="62" r="5" fill="#ffb3a7" opacity="0.75"/>' +
      '</g>',
    fox:
      '<g>' +
      '<path d="M20 26l6 24 20-12z" fill="#f09156"/>' +
      '<path d="M80 26l-6 24-20-12z" fill="#f09156"/>' +
      '<path d="M25 30l3.5 14 11-7z" fill="#ffe1cb"/>' +
      '<path d="M75 30l-3.5 14-11-7z" fill="#ffe1cb"/>' +
      '<circle cx="50" cy="57" r="29" fill="#ffb27b"/>' +
      '<path d="M50 86c-13 0-21-8-21-16 0-6 8-9 21-9s21 3 21 9c0 8-8 16-21 16z" fill="#fff3e6"/>' +
      '<circle cx="39" cy="51" r="4.5" fill="#4a3a32"/>' +
      '<circle cx="61" cy="51" r="4.5" fill="#4a3a32"/>' +
      '<circle cx="40.5" cy="49.4" r="1.5" fill="#fff"/>' +
      '<circle cx="62.5" cy="49.4" r="1.5" fill="#fff"/>' +
      '<ellipse cx="50" cy="65" rx="4.6" ry="3.6" fill="#4a3a32"/>' +
      '<path d="M50 68.5v4M50 72.5c-1.8 2-4.2 1.6-5 0M50 72.5c1.8 2 4.2 1.6 5 0" stroke="#4a3a32" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="29" cy="62" r="4.8" fill="#ff9d9d" opacity="0.7"/>' +
      '<circle cx="71" cy="62" r="4.8" fill="#ff9d9d" opacity="0.7"/>' +
      '</g>',
    chick:
      '<g>' +
      '<path d="M50 20c2-7 8-9 11-5-4 1-6 3-6 6z" fill="#f2c14e"/>' +
      '<circle cx="50" cy="58" r="30" fill="#ffe171"/>' +
      '<circle cx="50" cy="58" r="30" fill="none" stroke="#f3c94f" stroke-width="0"/>' +
      '<circle cx="39" cy="53" r="4.5" fill="#4a3a32"/>' +
      '<circle cx="61" cy="53" r="4.5" fill="#4a3a32"/>' +
      '<circle cx="40.5" cy="51.4" r="1.5" fill="#fff"/>' +
      '<circle cx="62.5" cy="51.4" r="1.5" fill="#fff"/>' +
      '<path d="M50 61l-7 4 7 4 7-4z" fill="#f79a3e"/>' +
      '<path d="M43 65h14" stroke="#e07f2a" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="30" cy="64" r="5" fill="#ffab9b" opacity="0.75"/>' +
      '<circle cx="70" cy="64" r="5" fill="#ffab9b" opacity="0.75"/>' +
      '<path d="M22 51c-3 1-5 4-5 7" stroke="#f3c94f" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '</g>'
  };

  function hash(text) {
    let h = 2166136261;
    const str = String(text === undefined || text === null ? '' : text);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  function meta(animalId) {
    return ANIMALS.find(function (a) { return a.id === animalId; }) || ANIMALS[0];
  }

  /** 닉네임(또는 좌석 id)으로 동물을 고릅니다. 같은 이름은 항상 같은 동물. */
  function forKey(key) {
    const animal = ANIMALS[hash(key) % ANIMALS.length];
    return { id: animal.id, name: animal.name };
  }

  function svg(animalId) {
    const art = ART[animalId] || ART.dog;
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + art + '</svg>';
  }

  /**
   * 아바타 HTML
   * @param {string|{name?:string,id?:string}} who 이름 또는 {name, id}
   * @param {'xs'|'sm'|'md'|'lg'} size
   */
  function html(who, size) {
    const key = typeof who === 'string'
      ? who
      : (who && (who.name || who.id)) || '';
    const animal = forKey(key);
    const label = size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
    return '<span class="avatar a-' + animal.id + ' ' + label + '" title="' + animal.name + ' 아바타" aria-hidden="true">' +
      svg(animal.id) + '</span>';
  }

  BG.avatars = {
    list: ANIMALS,
    forKey: forKey,
    svg: svg,
    html: html
  };
})();
