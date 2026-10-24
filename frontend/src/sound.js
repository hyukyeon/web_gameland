import { getSettings, subscribeSettings, vibrate } from './settings.js';

// 효과음: 외부 음원 없이 Web Audio 로 합성한다. 브라우저 자동재생 정책 때문에 첫 사용자 입력 뒤에 컨텍스트가 만들어진다.
let ctx = null;
let master = null;
let enabled = true;
try {
  enabled = localStorage.getItem('gostop.sound') !== 'off';
} catch {
  /* 저장소를 못 쓰면 기본값 */
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7 * getSettings().sfxVolume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 음 하나: 주파수 f → (slide 가 있으면) 그쪽으로 미끄러짐 */
function tone(f, dur, { type = 'sine', vol = 0.3, at = 0, slide = null, attack = 0.005 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** 잡음 버스트 (필터 통과). 짝! 쿵! 쉭! 같은 타격/바람 소리의 바탕 */
function noise(dur, { vol = 0.3, at = 0, freq = 2000, q = 0.8, type = 'bandpass', slide = null } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(freq, t);
  if (slide) flt.frequency.exponentialRampToValueAtTime(slide, t + dur);
  flt.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t);
}

const notes = (arr, step, opts) => arr.forEach((f, i) => tone(f, opts?.dur ?? 0.25, { ...opts, at: i * step + (opts?.at ?? 0) }));

const SOUNDS = {
  // 화투패를 바닥에 탁
  place() {
    noise(0.09, { vol: 0.55, freq: 1800, q: 0.7 });
    tone(150, 0.12, { type: 'triangle', vol: 0.45, slide: 60 });
  },
  // 더미에서 뒤집기 (쉭)
  flip() {
    noise(0.16, { vol: 0.22, freq: 1200, slide: 5000, q: 0.9 });
    tone(520, 0.08, { type: 'triangle', vol: 0.1, at: 0.1 });
  },
  // 짝을 맞춰 먹기
  capture() {
    noise(0.07, { vol: 0.35, freq: 2400 });
    notes([660, 880], 0.07, { type: 'triangle', vol: 0.22, dur: 0.18, at: 0.04 });
  },
  turn() {
    notes([784, 1175], 0.09, { type: 'sine', vol: 0.12, dur: 0.2 });
  },
  click() {
    tone(900, 0.04, { type: 'square', vol: 0.05 });
  },
  chat() {
    tone(1200, 0.07, { type: 'sine', vol: 0.12 });
    tone(1600, 0.09, { type: 'sine', vol: 0.1, at: 0.06 });
  },
  deal() {
    for (let i = 0; i < 6; i++) noise(0.05, { vol: 0.25, freq: 3000 + i * 150, at: i * 0.07 });
  },
  // 뻑: 풀 죽은 하강음
  ppeok() {
    tone(330, 0.5, { type: 'sawtooth', vol: 0.22, slide: 90 });
    tone(250, 0.5, { type: 'square', vol: 0.12, slide: 70, at: 0.05 });
    noise(0.25, { vol: 0.2, freq: 400, type: 'lowpass' });
  },
  // 폭탄: 쾅
  bomb() {
    noise(0.7, { vol: 0.8, freq: 1500, slide: 80, type: 'lowpass', q: 0.5 });
    tone(110, 0.6, { type: 'sine', vol: 0.7, slide: 28 });
    tone(60, 0.5, { type: 'triangle', vol: 0.5, slide: 30, at: 0.02 });
  },
  // 따닥: 연달아 두 번 찰싹 + 반짝
  ttadak() {
    for (const at of [0, 0.14]) {
      noise(0.08, { vol: 0.6, freq: 2000, at });
      tone(170, 0.1, { type: 'triangle', vol: 0.4, slide: 70, at });
    }
    notes([988, 1319], 0.08, { type: 'triangle', vol: 0.2, dur: 0.25, at: 0.3 });
  },
  // 쪽
  jjok() {
    noise(0.05, { vol: 0.3, freq: 3500 });
    tone(1500, 0.14, { type: 'sine', vol: 0.25, slide: 700 });
  },
  // 싹쓸이: 쓸어 담는 소리 + 상승 아르페지오
  sweep() {
    noise(0.45, { vol: 0.3, freq: 600, slide: 6000, q: 1.2 });
    notes([523, 659, 784, 1047, 1319], 0.07, { type: 'triangle', vol: 0.2, dur: 0.3, at: 0.1 });
  },
  go() {
    notes([523, 659, 784], 0.09, { type: 'square', vol: 0.12, dur: 0.18 });
    tone(1047, 0.45, { type: 'triangle', vol: 0.25, at: 0.28 });
    tone(1319, 0.45, { type: 'triangle', vol: 0.18, at: 0.28 });
  },
  stop() {
    tone(196, 0.9, { type: 'sine', vol: 0.4 });
    tone(392, 0.7, { type: 'sine', vol: 0.15 });
    noise(0.05, { vol: 0.3, freq: 800 });
  },
  shake() {
    for (let i = 0; i < 8; i++) noise(0.04, { vol: 0.25, freq: 4000 + (i % 2) * 1500, at: i * 0.05, q: 2 });
  },
  bonus() {
    notes([1319, 1760], 0.08, { type: 'square', vol: 0.12, dur: 0.14 });
    tone(2093, 0.3, { type: 'triangle', vol: 0.15, at: 0.18 });
  },
  sale() {
    notes([1568, 2093, 1568, 2093], 0.07, { type: 'triangle', vol: 0.14, dur: 0.12 });
  },
  steal() {
    tone(880, 0.22, { type: 'triangle', vol: 0.22, slide: 330 });
  },
  special() {
    notes([659, 784, 988], 0.07, { type: 'triangle', vol: 0.18, dur: 0.18 });
  },
  end() {
    tone(392, 0.2, { type: 'triangle', vol: 0.2 });
  },
  // ----- 섯다 -----
  chip() {
    tone(2200, 0.06, { type: 'triangle', vol: 0.18 });
    tone(3100, 0.08, { type: 'sine', vol: 0.12, at: 0.04 });
    noise(0.04, { vol: 0.2, freq: 5000 });
  },
  // ----- 슬롯머신 -----
  slotSpin() {
    noise(0.7, { vol: 0.28, freq: 400, slide: 3200, q: 1.1 });
    for (let i = 0; i < 6; i++) tone(300 + i * 60, 0.07, { type: 'square', vol: 0.05, at: i * 0.1 });
  },
  slotStop() {
    noise(0.07, { vol: 0.5, freq: 900, q: 0.6 });
    tone(130, 0.12, { type: 'triangle', vol: 0.5, slide: 55 });
  },
  slotWin() {
    notes([784, 988, 1175, 1568], 0.09, { type: 'triangle', vol: 0.22, dur: 0.22 });
    for (let i = 0; i < 5; i++) tone(2400 + (i % 2) * 400, 0.06, { type: 'sine', vol: 0.1, at: 0.35 + i * 0.06 });
  },
  jackpot() {
    notes([523, 659, 784, 1047, 1319, 1568, 2093], 0.1, { type: 'triangle', vol: 0.26, dur: 0.35 });
    notes([262, 330, 392, 523], 0.1, { type: 'sine', vol: 0.18, dur: 0.6 });
    for (let i = 0; i < 14; i++) tone(2200 + (i % 3) * 350, 0.07, { type: 'sine', vol: 0.1, at: 0.7 + i * 0.07 });
  },
  win() {
    notes([523, 659, 784, 1047, 784, 1047, 1319], 0.12, { type: 'triangle', vol: 0.22, dur: 0.3 });
    notes([262, 330, 392, 523], 0.12, { type: 'sine', vol: 0.15, dur: 0.4 });
  },
  lose() {
    notes([392, 349, 311, 262], 0.22, { type: 'sawtooth', vol: 0.12, dur: 0.4 });
  },
  draw() {
    notes([440, 440], 0.2, { type: 'triangle', vol: 0.15, dur: 0.3 });
  },
  // 족보(홍단/청단/초단/고도리/광) 완성: 밝은 상승 아르페지오 + 반짝임
  combo() {
    notes([523, 659, 784, 1047, 1319], 0.085, { type: 'triangle', vol: 0.22, dur: 0.28 });
    tone(2093, 0.5, { type: 'sine', vol: 0.1, at: 0.45 });
    tone(1568, 0.5, { type: 'sine', vol: 0.08, at: 0.52 });
  },
  // 족보 비상(한 장 남음): 짧은 경고음 두 번
  alert() {
    for (const at of [0, 0.18]) tone(880, 0.13, { type: 'square', vol: 0.08, slide: 660, at });
  },
  // 정산 연출: 점수가 한 줄씩 쌓일 때
  tick() {
    tone(1400, 0.05, { type: 'triangle', vol: 0.12 });
  },
  // 오목 착수: '딱' — 흑은 묵직하게, 백은 조금 높고 가볍게
  stoneB() {
    noise(0.035, { vol: 0.5, freq: 2600, q: 1.2 });
    tone(210, 0.1, { type: 'triangle', vol: 0.5, slide: 120 });
  },
  stoneW() {
    noise(0.03, { vol: 0.42, freq: 3600, q: 1.4 });
    tone(330, 0.08, { type: 'triangle', vol: 0.4, slide: 210 });
  },
  // 초읽기(내 차례 5초 이하): 짧은 삑
  urgent() {
    tone(1000, 0.07, { type: 'square', vol: 0.08 });
  },
  // 배수가 붙을 때
  boost() {
    tone(500, 0.18, { type: 'square', vol: 0.08, slide: 1500 });
  },
};

// 소리와 함께 울리는 진동 (효과음을 꺼도 진동 설정이 켜져 있으면 울린다)
const HAPTIC = { urgent: 25, turn: 35, combo: [40, 60, 40], alert: [25, 40, 25], win: [60, 40, 120], lose: 220, ppeok: [80, 40, 80], bomb: [50, 30, 90] };

export function sfx(name) {
  if (HAPTIC[name]) vibrate(HAPTIC[name]);
  if (!enabled) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* 오디오 오류는 게임 진행에 영향 없음 */
  }
}

// ---------- 배경음악 (효과음과 별도로 켜고 끈다) ----------
let bgmOn = true;
try {
  bgmOn = localStorage.getItem('gostop.bgm') !== 'off';
} catch {
  /* 기본값 */
}
let bgm = null;
let bgmWanted = false; // 첫 사용자 입력 전에는 자동재생이 막히므로, 입력이 들어오면 재생을 시작한다

function bgmEl() {
  if (!bgm && typeof Audio !== 'undefined') {
    bgm = new Audio('/bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.75 * getSettings().bgmVolume;
  }
  return bgm;
}

function syncBgm() {
  const a = bgmEl();
  if (!a) return;
  try {
    // 오래된 브라우저(와 jsdom)는 play() 가 Promise 를 돌려주지 않는다
    if (bgmOn && bgmWanted && !document.hidden) Promise.resolve(a.play()).catch(() => {});
    else a.pause();
  } catch {
    /* 재생 미지원 */
  }
}

export const isBgmOn = () => bgmOn;
export function setBgmOn(on) {
  bgmOn = on;
  try {
    localStorage.setItem('gostop.bgm', on ? 'on' : 'off');
  } catch {
    /* 무시 */
  }
  bgmWanted = true; // 켜는 클릭 자체가 사용자 입력이다
  syncBgm();
}

export const isSoundOn = () => enabled;
const soundListeners = new Set();
/** 효과음 켜짐/꺼짐이 바뀔 때 (여러 버튼의 표시를 맞춘다) */
export function onSoundChange(fn) {
  soundListeners.add(fn);
  return () => soundListeners.delete(fn);
}
export function setSoundOn(on) {
  enabled = on;
  soundListeners.forEach((f) => f(on));
  try {
    localStorage.setItem('gostop.sound', on ? 'on' : 'off');
  } catch {
    /* 무시 */
  }
  if (on) sfx('click');
}

const count = (s) => Object.values(s.captured).reduce((n, a) => n + a.length, 0);

/** 직전 프레임(prev)에서 f 로 넘어갈 때 어울리는 효과음 */
export function sfxForFrame(prev, f) {
  let name = null;
  if (f.banner) name = f.banner.kind;
  else if (prev && count(f) > count(prev)) name = 'capture';
  else if (f.played != null && f.played !== prev?.played) name = 'place';
  else if (f.drawn != null && f.drawn !== prev?.drawn) name = 'flip';
  if (name) sfx(name);
  const myTurnNow = f.turn === f.you && ['play', 'choose', 'gostop', 'gwang', 'chong'].includes(f.phase);
  const myTurnBefore = prev && prev.turn === prev.you && prev.phase === f.phase;
  if (myTurnNow && !myTurnBefore) setTimeout(() => sfx('turn'), name ? 450 : 0);
}

if (typeof document !== 'undefined') {
  const arm = () => {
    bgmWanted = true;
    syncBgm();
  };
  document.addEventListener('pointerdown', arm, { once: true });
  document.addEventListener('keydown', arm, { once: true });
  document.addEventListener('visibilitychange', syncBgm);
}

// 모든 버튼에 가벼운 클릭음
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('button')) sfx('click');
  });
}

// 설정에서 음량을 바꾸면 바로 반영
subscribeSettings((st) => {
  if (master) master.gain.value = 0.7 * st.sfxVolume;
  if (bgm) bgm.volume = 0.75 * st.bgmVolume;
});
