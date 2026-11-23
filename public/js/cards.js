/*
 * 카드/과일 그림 (인라인 SVG)
 * - 이모지 대신 직접 그려서 어떤 기기에서도 같은 모양으로 보이게 합니다.
 * - 과일마다 귀여운 눈·입·볼터치가 있지만, 카드 위 개수(1~5개)가
 *   한눈에 세어지도록 표정은 과일 가운데에 작게 그립니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const HG = window.HalliGalli;

  const FACE_EYES = function (x1, x2, y) {
    return (
      '<circle cx="' + x1 + '" cy="' + y + '" r="5" fill="#4a3a32"/>' +
      '<circle cx="' + x2 + '" cy="' + y + '" r="5" fill="#4a3a32"/>' +
      '<circle cx="' + (x1 + 1.6) + '" cy="' + (y - 1.7) + '" r="1.7" fill="#fff"/>' +
      '<circle cx="' + (x2 + 1.6) + '" cy="' + (y - 1.7) + '" r="1.7" fill="#fff"/>'
    );
  };

  const SMILE = function (x, y, w) {
    const half = w / 2;
    return '<path d="M' + (x - half) + ' ' + y + 'c' + (half * 0.45) + ' ' + (w * 0.36) + ' ' + (half * 1.55) + ' ' + (w * 0.36) + ' ' + w + ' 0" ' +
      'stroke="#5a3a2a" stroke-width="2.8" stroke-linecap="round" fill="none"/>';
  };

  const ART = {
    strawberry:
      '<g>' +
      '<path d="M50 95C26 95 9 76 9 53c0-17 18-29 41-29s41 12 41 29c0 23-17 42-41 42z" fill="#ef4a6d"/>' +
      '<path d="M50 95C26 95 9 76 9 53c0-4 1-7 3-10 5 22 20 37 38 37s33-15 38-37c2 3 3 6 3 10 0 23-17 42-41 42z" fill="#d93a5c" opacity="0.55"/>' +
      '<path d="M50 26c-6-9-16-13-25-12 3 8 10 13 18 16-9 0-18 2-24 7 8 5 20 6 31 3 11 3 23 2 31-3-6-5-15-7-24-7 8-3 15-8 18-16-9-1-19 3-25 12z" fill="#48a95a"/>' +
      '<path d="M50 26c-2-4-4-7-6-9 3 0 5 1 7 3 2-2 4-3 7-3-2 2-4 5-6 9z" fill="#377f45"/>' +
      '<g fill="#ffe9c2" opacity="0.9">' +
      '<ellipse cx="27" cy="44" rx="2.6" ry="3.8" transform="rotate(-18 27 44)"/>' +
      '<ellipse cx="73" cy="44" rx="2.6" ry="3.8" transform="rotate(18 73 44)"/>' +
      '<ellipse cx="21" cy="63" rx="2.6" ry="3.8" transform="rotate(-30 21 63)"/>' +
      '<ellipse cx="79" cy="63" rx="2.6" ry="3.8" transform="rotate(30 79 63)"/>' +
      '<ellipse cx="50" cy="88" rx="2.6" ry="3.6"/>' +
      '</g>' +
      FACE_EYES(38, 62, 60) +
      '<ellipse cx="27" cy="71" rx="6.4" ry="4.6" fill="#ff9db0" opacity="0.75"/>' +
      '<ellipse cx="73" cy="71" rx="6.4" ry="4.6" fill="#ff9db0" opacity="0.75"/>' +
      SMILE(50, 69, 13) +
      '</g>',
    banana:
      '<g>' +
      '<path d="M14 30c0 34 24 60 56 60 13 0 22-6 22-15 0-7-6-11-14-9-22 4-38-13-38-36 0-7-5-11-12-11S14 24 14 30z" fill="#f8d24b"/>' +
      '<path d="M14 30c0 34 24 60 56 60 13 0 22-6 22-15 0-2-1-4-2-6 0 9-8 13-19 13-31 0-52-24-52-55 0-2 0-3 1-4-4 2-6 4-6 7z" fill="#e2b32c" opacity="0.85"/>' +
      '<path d="M26 26c0-7-4-11-10-11" fill="none" stroke="#a97c1a" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M28 20c2-4 6-6 10-5-3 4-6 5-10 5z" fill="#7f9a3a"/>' +
      FACE_EYES(42, 60, 72) +
      '<ellipse cx="32" cy="80" rx="5.6" ry="4" fill="#ff9d8f" opacity="0.65"/>' +
      '<ellipse cx="70" cy="77" rx="5.6" ry="4" fill="#ff9d8f" opacity="0.65"/>' +
      SMILE(51, 81, 12) +
      '</g>',
    lime:
      '<g>' +
      '<circle cx="50" cy="57" r="37" fill="#4e9e33"/>' +
      '<circle cx="50" cy="57" r="30" fill="#7ac74f"/>' +
      '<circle cx="50" cy="57" r="30" fill="none" stroke="#93d96a" stroke-width="2" opacity="0.6"/>' +
      '<circle cx="36" cy="40" r="8" fill="#ffffff" opacity="0.28"/>' +
      '<path d="M52 21c3-9 12-14 21-12-3 9-11 14-20 14z" fill="#3f7f2b"/>' +
      '<path d="M50 20c0-5 2-8 6-11" stroke="#6b4a2a" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      FACE_EYES(41, 61, 57) +
      '<ellipse cx="28" cy="68" rx="6.2" ry="4.4" fill="#ff8fa3" opacity="0.6"/>' +
      '<ellipse cx="72" cy="68" rx="6.2" ry="4.4" fill="#ff8fa3" opacity="0.6"/>' +
      SMILE(51, 66, 13) +
      '</g>',
    plum:
      '<g>' +
      '<circle cx="50" cy="59" r="36" fill="#8656b8"/>' +
      '<circle cx="50" cy="57" r="33" fill="#9a67cc"/>' +
      '<path d="M32 26c-7 18-4 42 8 60" stroke="#7a49ab" stroke-width="4" fill="none" opacity="0.45" stroke-linecap="round"/>' +
      '<ellipse cx="34" cy="42" rx="8" ry="10" fill="#ffffff" opacity="0.2"/>' +
      '<path d="M55 24c5-7 15-7 20-3-5 7-14 8-20 3z" fill="#4f8f3a"/>' +
      '<path d="M50 26c0-6 2-9 6-11" stroke="#6b4a2a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      FACE_EYES(42, 62, 60) +
      '<ellipse cx="29" cy="71" rx="6" ry="4.4" fill="#ffb0c4" opacity="0.6"/>' +
      '<ellipse cx="73" cy="71" rx="6" ry="4.4" fill="#ffb0c4" opacity="0.6"/>' +
      SMILE(52, 69, 12) +
      '</g>'
  };

  function fruitSvg(fruitId, className) {
    const art = ART[fruitId] || ART.lime;
    return '<svg viewBox="0 0 100 100" class="' + (className || '') + '" aria-hidden="true" focusable="false">' + art + '</svg>';
  }

  function fruitIcon(fruitId) {
    return '<span class="fruit-icon">' + fruitSvg(fruitId) + '</span>';
  }

  function fruitMeta(fruitId) {
    const list = (HG && HG.FRUITS) || [];
    return list.find(function (f) { return f.id === fruitId; }) || { id: fruitId, name: fruitId };
  }

  /**
   * @param {{fruit:string,count:number}} card
   * @param {'sm'|'md'|'lg'} size
   * @param {string} extraClass
   */
  function cardHtml(card, size, extraClass) {
    if (!card) return emptyCardHtml(size);
    const meta = fruitMeta(card.fruit);
    let icons = '';
    for (let i = 0; i < card.count; i++) icons += fruitIcon(card.fruit);
    return (
      '<div class="card ' + (size || 'md') + ' ' + (extraClass || '') + '" data-card="' + card.id + '">' +
        '<div class="card-fruits count-' + card.count + '">' + icons + '</div>' +
        '<div class="card-foot"><span class="fruit-name">' + meta.name + '</span>' +
        '<span class="count-badge">' + card.count + '</span></div>' +
      '</div>'
    );
  }

  function emptyCardHtml(size) {
    const s = size || 'md';
    return '<div class="card-static ' + s + '">카드 없음</div>';
  }

  BG.cards = {
    fruitSvg: fruitSvg,
    fruitIcon: fruitIcon,
    fruitMeta: fruitMeta,
    cardHtml: cardHtml,
    emptyCardHtml: emptyCardHtml
  };
})();
