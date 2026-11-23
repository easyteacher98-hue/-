/*
 * 카드/과일 그림 (인라인 SVG)
 * - 이모지 대신 직접 그려서 어떤 기기에서도 같은 모양으로 보이게 합니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const HG = window.HalliGalli;

  const ART = {
    strawberry:
      '<g>' +
      '<path d="M50 95C27 95 10 76 10 54c0-17 17-29 40-29s40 12 40 29c0 22-17 41-40 41z" fill="#e33a63"/>' +
      '<path d="M50 27c-6-9-16-13-25-12 3 8 10 13 18 16-9 0-18 2-24 7 8 5 20 6 31 3 11 3 23 2 31-3-6-5-15-7-24-7 8-3 15-8 18-16-9-1-19 3-25 12z" fill="#3f9a4d"/>' +
      '<g fill="#ffe6b8">' +
      '<ellipse cx="34" cy="52" rx="3" ry="4.4"/><ellipse cx="50" cy="45" rx="3" ry="4.4"/>' +
      '<ellipse cx="66" cy="52" rx="3" ry="4.4"/><ellipse cx="42" cy="68" rx="3" ry="4.4"/>' +
      '<ellipse cx="58" cy="68" rx="3" ry="4.4"/><ellipse cx="50" cy="82" rx="3" ry="4.4"/>' +
      '</g></g>',
    banana:
      '<g>' +
      '<path d="M15 33c0 31 21 54 51 54 12 0 20-5 20-13 0-6-5-9-12-8-24 2-38-12-38-33 0-6-4-10-10-10S15 27 15 33z" fill="#f0c02c"/>' +
      '<path d="M15 33c0 31 21 54 51 54 12 0 20-5 20-13 0-2-1-4-3-5 1 10-6 14-17 14-28 0-46-21-46-50 0-1 0-2 0-3-3 1-5 4-5 7z" fill="#d9a41a"/>' +
      '<path d="M24 33c0-6-4-10-9-10" fill="none" stroke="#8a6a13" stroke-width="4" stroke-linecap="round"/>' +
      '</g>',
    lime:
      '<g>' +
      '<circle cx="50" cy="56" r="37" fill="#5aa93a"/>' +
      '<circle cx="50" cy="56" r="29" fill="#7cc353"/>' +
      '<circle cx="38" cy="44" r="9" fill="#ffffff" opacity="0.35"/>' +
      '<path d="M50 20c2-9 10-14 19-13-2 9-9 14-17 15z" fill="#3f7f2b"/>' +
      '</g>',
    plum:
      '<g>' +
      '<circle cx="50" cy="58" r="36" fill="#8656b8"/>' +
      '<path d="M50 24c0 14 0 40 0 68" stroke="#673d92" stroke-width="4" fill="none" opacity="0.55"/>' +
      '<ellipse cx="36" cy="46" rx="9" ry="11" fill="#ffffff" opacity="0.22"/>' +
      '<path d="M52 26c4-7 14-8 19-4-4 7-13 8-19 4z" fill="#4f8f3a"/>' +
      '<path d="M50 26c0-6 2-9 6-11" stroke="#6b4a2a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
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
