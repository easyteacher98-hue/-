/*
 * 꼬리잡기 끝말잇기 – 단어 목록 생성기
 *
 * scripts/wordchain-src-*.txt 에 한 줄에 한 단어씩 적은 목록을 읽어
 *   - 표준어 명사인지 형식을 확인하고(한글 2글자 이상)
 *   - 중복을 지우고
 *   - public/wordchain-words.js 를 만듭니다. (서버·브라우저 공용)
 *
 * 실행: node scripts/build-wordchain-dict.js [--check]
 *   --check : 파일을 쓰지 않고, 개수와 '이어 갈 단어가 없는 끝글자'만 확인합니다.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'scripts');
const OUT = path.join(ROOT, 'public', 'wordchain-words.js');

/* 한글 음절을 초성·중성·종성으로 나눕니다. */
const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function splitSyllable(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return {
    initial: INITIALS[Math.floor(code / 588)],
    vowel: Math.floor((code % 588) / 28),
    final: code % 28
  };
}

/* 두음법칙: 첫소리 ㄴ·ㄹ·ㅇ 은 같은 글자로 봅니다. (녀↔여, 리↔이, 라↔나) */
function startKey(ch) {
  const part = splitSyllable(ch);
  if (!part) return null;
  const initial = (part.initial === 'ㄴ' || part.initial === 'ㄹ') ? 'ㅇ' : part.initial;
  return initial + ':' + part.vowel + ':' + part.final;
}

function readWords() {
  const files = fs.readdirSync(SRC_DIR)
    .filter(function (name) { return /^wordchain-src-\d+\.txt$/.test(name); })
    .sort();
  const words = [];
  files.forEach(function (name) {
    const text = fs.readFileSync(path.join(SRC_DIR, name), 'utf8');
    text.split(/\r?\n/).forEach(function (line) {
      const word = line.trim();
      if (!word || word.charAt(0) === '#') return;
      words.push({ word: word, from: name });
    });
  });
  return words;
}

function main() {
  const check = process.argv.indexOf('--check') !== -1;
  const raw = readWords();
  const seen = new Set();
  const words = [];
  const problems = [];
  raw.forEach(function (item) {
    const word = item.word;
    if (!/^[가-힣]{2,}$/.test(word)) {
      problems.push('한글이 아니거나 1글자: ' + word + ' (' + item.from + ')');
      return;
    }
    if (seen.has(word)) return;
    seen.add(word);
    words.push(word);
  });
  words.sort(function (a, b) { return a.localeCompare(b, 'ko'); });

  // 끝글자별로 이어지는 단어가 있는지 확인합니다.
  const byStart = new Map();
  words.forEach(function (word) {
    const key = startKey(word.charAt(0));
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(word);
  });
  const endings = new Map();
  words.forEach(function (word) {
    const last = word.charAt(word.length - 1);
    const key = startKey(last);
    if (!endings.has(last)) endings.set(last, { key: key, words: [] });
    endings.get(last).words.push(word);
  });
  const deadEndings = [];
  const deadWords = [];
  endings.forEach(function (info, last) {
    const followers = byStart.get(info.key) || [];
    if (!followers.length) {
      deadEndings.push(last + ' (' + info.words.length + '개: ' + info.words.slice(0, 6).join(', ') + ')');
      info.words.forEach(function (w) { deadWords.push(w); });
    }
  });

  console.log('원본 줄 수:', raw.length);
  console.log('중복 제거 후 단어:', words.length);
  console.log('끝글자 종류:', endings.size);
  console.log('이어 갈 단어가 없는 끝글자:', deadEndings.length);
  if (deadEndings.length) console.log('  ' + deadEndings.join('\n  '));
  console.log('그래서 낼 수 없는 단어:', deadWords.length, '(' + Math.round(deadWords.length / words.length * 1000) / 10 + '%)');
  if (problems.length) {
    console.log('형식 문제:', problems.length);
    problems.slice(0, 40).forEach(function (p) { console.log('  -', p); });
  }

  if (check) return;

  const body = '/*\n * 꼬리잡기 끝말잇기 – 우리말 명사 목록 (자동 생성 파일)\n' +
    ' * scripts/build-wordchain-dict.js 가 scripts/wordchain-src-*.txt 를 읽어 만듭니다.\n' +
    ' * 직접 고치지 말고 원본 목록을 고친 뒤 다시 실행하세요.\n' +
    ' * 단어 수: ' + words.length + '\n */\n' +
    '(function (root, factory) {\n' +
    "  if (typeof module === 'object' && module.exports) module.exports = factory();\n" +
    '  else root.WordChainWords = factory();\n' +
    "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n" +
    "  'use strict';\n" +
    '  return {\n' +
    '    version: 1,\n' +
    '    words: [\n' +
    words.map(function (w) { return "      '" + w + "'"; }).join(',\n') + '\n' +
    '    ]\n' +
    '  };\n' +
    '});\n';
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('저장:', path.relative(ROOT, OUT));
}

main();
