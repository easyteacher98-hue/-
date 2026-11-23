/*
 * 가벼운 효과음 (Web Audio API)
 * - 종소리 '띠링~', 카드 뒤집기 '톡', 정답/오답 피드백
 * - 소리 파일을 받아오지 않고 브라우저에서 직접 만들어 인터넷이 느려도 바로 납니다.
 * - 음소거 상태는 localStorage('bg.sound')에 기억합니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const KEY = 'bg.sound';
  const AC = window.AudioContext || window.webkitAudioContext || null;

  let ctx = null;

  function readEnabled() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === null) return true;
      return JSON.parse(raw) !== false;
    } catch (err) {
      return true;
    }
  }

  function saveEnabled(value) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(!!value));
    } catch (err) { /* 저장할 수 없는 환경은 무시 */ }
  }

  const sound = {
    enabled: readEnabled(),
    supported: !!AC,

    /** 사용자 동작 안에서 호출해야 브라우저가 소리를 허용합니다. */
    unlock() {
      if (!AC) return null;
      if (!ctx) {
        try {
          ctx = new AC();
        } catch (err) {
          return null;
        }
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        try { ctx.resume(); } catch (err) { /* ignore */ }
      }
      return ctx;
    },

    tone(freq, options) {
      const opts = options || {};
      if (!sound.enabled) return;
      const audio = sound.unlock();
      if (!audio) return;
      const now = audio.currentTime + (opts.delay || 0);
      const dur = opts.duration || 0.3;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, now + dur);
      const peak = typeof opts.gain === 'number' ? opts.gain : 0.16;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + (opts.attack || 0.008));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    },

    /** 종소리: 기본음 + 배음이 겹쳐 '띠링~' */
    bell(kind) {
      if (!sound.enabled) return;
      if (kind === 'wrong') {
        sound.tone(320, { type: 'triangle', duration: 0.22, gain: 0.11, slideTo: 150 });
        sound.tone(210, { type: 'sine', duration: 0.3, gain: 0.09, delay: 0.05, slideTo: 120 });
        return;
      }
      const base = kind === 'correct' ? 1.12 : 1;
      sound.tone(880 * base, { duration: 0.9, gain: 0.15 });
      sound.tone(1320 * base, { duration: 0.75, gain: 0.1 });
      sound.tone(1760 * base, { duration: 0.55, gain: 0.07 });
      sound.tone(2640 * base, { duration: 0.32, gain: 0.04 });
      sound.tone(1180 * base, { duration: 0.3, gain: 0.05, delay: 0.1 });
    },

    /** 정답이면 반짝이는 두 번째 종소리 */
    cheer() {
      [1175, 1480, 1760].forEach(function (freq, i) {
        sound.tone(freq, { duration: 0.34, gain: 0.085, delay: 0.12 + i * 0.08 });
      });
    },

    /** 박수 소리 — Web Audio로 만든 짧은 잡음 타격(박수) 여러 개 */
    applause(duration) {
      if (!sound.enabled) return;
      const audio = sound.unlock();
      if (!audio) return;
      const total = duration || 2.1;
      const rate = audio.sampleRate;
      const buffer = audio.createBuffer(1, Math.floor(rate * total), rate);
      const data = buffer.getChannelData(0);
      const clapEvery = 0.075;
      for (let i = 0; i < data.length; i++) {
        const t = i / rate;
        const slot = Math.floor(t / clapEvery);
        const local = t - slot * clapEvery;
        const seed = Math.sin(slot * 12.9898) * 43758.5453;
        const jitter = (seed - Math.floor(seed)) * 0.9 + 0.3;
        const env = Math.exp(-local * 65) * Math.min(1, t * 6) * Math.exp(-t * 0.9) * jitter * 0.5;
        data[i] = ((Math.random() * 2 - 1) * 0.9 + Math.sin(t * 180 * Math.PI) * 0.12) * env;
      }
      const src = audio.createBufferSource();
      src.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.6;
      const gain = audio.createGain();
      gain.gain.value = 0.5;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start();
    },

    /** 우승 축하: 팡파레 + 박수 */
    celebration() {
      if (!sound.enabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach(function (freq, i) {
        sound.tone(freq, { type: 'triangle', duration: 0.42, gain: 0.15, delay: i * 0.12 });
      });
      [523.25, 659.25, 783.99, 1046.5].forEach(function (freq) {
        sound.tone(freq, { type: 'sine', duration: 0.9, gain: 0.09, delay: 0.52 });
      });
      sound.applause(2.2);
    },

    flip() {
      sound.tone(520, { type: 'triangle', duration: 0.09, gain: 0.05, slideTo: 760 });
    },

    tap() {
      sound.tone(660, { type: 'sine', duration: 0.08, gain: 0.05 });
    },

    toggle() {
      sound.enabled = !sound.enabled;
      saveEnabled(sound.enabled);
      if (sound.enabled) sound.tap();
      return sound.enabled;
    }
  };

  BG.sound = sound;
})();
