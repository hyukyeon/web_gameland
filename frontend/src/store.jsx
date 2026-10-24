import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { sfx, sfxForFrame } from './sound.js';
import { speedScale } from './settings.js';

/** 직전 프레임 대비 새로 완성된 족보(홍단/청단/초단/고도리/N광) */
const COMBO_RE = /^(홍단|청단|초단|고도리|\d광)$/;
function newCombos(prev, f) {
  if (!prev?.scores || !f.scores) return [];
  const out = [];
  for (const pid of Object.keys(f.scores)) {
    const had = new Set((prev.scores[pid]?.detail ?? []).map((d) => d.name));
    for (const d of f.scores[pid].detail ?? []) if (COMBO_RE.test(d.name) && !had.has(d.name)) out.push({ pid: Number(pid), name: d.name, pts: d.pts });
  }
  return out;
}

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAME_MS = 650;
const BANNER_MS = 1100;
const TOKEN_KEY = 'gostop.token';

const loadToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const saveToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
};

export function AppProvider({ children }) {
  const [token, setToken] = useState(loadToken);
  const [user, setUser] = useState(null);
  const [skew, setSkew] = useState(0); // 서버 시계 - 내 시계 (재접속 대기 카운트다운 보정용)
  const userRef = useRef(null);
  userRef.current = user;
  const [booting, setBooting] = useState(!!loadToken());
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [lobbyChat, setLobbyChat] = useState([]);
  const [room, setRoom] = useState(null);
  const [roomChat, setRoomChat] = useState([]);
  const [view, setView] = useState(null); // 현재 화면에 그려지는 게임 스냅샷(뷰)
  const [banner, setBanner] = useState(null);
  const [combo, setCombo] = useState(null); // 족보 완성 팝업 { pid, name, pts, key }
  const comboTimers = useRef([]);
  const [busy, setBusy] = useState(false); // 프레임 재생 중에는 입력 잠금
  const [over, setOver] = useState(null);
  const [startInfo, setStartInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [seotda, setSeotda] = useState(null); // 섯다 게임 뷰
  const [seotdaOver, setSeotdaOver] = useState(null);
  const [omok, setOmok] = useState(null); // 오목 게임 뷰 { board, turn, black, white, last, phase, result ... }
  const [omokOver, setOmokOver] = useState(null);
  const [turnInfo, setTurnInfo] = useState(null); // { userId, deadlineAt } 현재 베팅 차례
  const [seotdaNote, setSeotdaNote] = useState(null); // 구사 재경기 안내 등
  const [tieVote, setTieVote] = useState(null); // 섯다 묻고 더블 투표 { pids, votes, deadlineAt, ante }
  const [seotdaDeal, setSeotdaDeal] = useState(null); // 섯다 새 판 배분 연출 키 (재접속 복구면 null → 연출 없음)
  const [seotdaEvent, setSeotdaEvent] = useState(null); // 마지막 베팅 행동 { pid, action, amount, key } (칩 애니메이션)
  const [reward, setReward] = useState(null); // { emoji, title, lines[] } 출석/개평/업적 안내 모달
  const [emotes, setEmotes] = useState({}); // userId -> { text, key } (말풍선, 3초 뒤 사라짐)

  const sockRef = useRef(null);
  const queue = useRef([]);
  const running = useRef(false);
  const pendingOver = useRef(null);
  const lastFrame = useRef(null); // 효과음 판단용 직전 프레임
  const epoch = useRef(0); // game:start 마다 증가시켜 이전 재생을 끊는다

  const notify = useCallback((text) => {
    setToast({ text, key: Date.now() });
  }, []);

  const settleOver = useCallback(() => {
    if (pendingOver.current) {
      const o = pendingOver.current;
      const me = userRef.current?.id;
      sfx(o.result?.draw || o.result?.winner == null ? 'draw' : o.result.winner === me ? 'win' : 'lose');
      setOver(o);
      pendingOver.current = null;
    }
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const my = epoch.current;
    while (queue.current.length && my === epoch.current) {
      const f = queue.current.shift();
      sfxForFrame(lastFrame.current, f);
      newCombos(lastFrame.current, f).forEach((c, i) => {
        const t = setTimeout(() => {
          sfx('combo');
          setCombo({ ...c, key: `${Date.now()}-${i}` });
          const t2 = setTimeout(() => setCombo(null), 1900);
          comboTimers.current.push(t2);
        }, 350 + i * 1500);
        comboTimers.current.push(t);
      });
      lastFrame.current = f;
      setView(f);
      if (f.banner) setBanner({ ...f.banner, key: `${Date.now()}-${Math.random()}` });
      await sleep((f.banner ? BANNER_MS : FRAME_MS) * speedScale());
    }
    if (my === epoch.current) {
      running.current = false;
      setBusy(false);
      setBanner(null);
      settleOver();
    } else {
      running.current = false;
    }
  }, [settleOver]);

  // 출석 체크: 로그인/자동 로그인 후 세션당 한 번. 서버가 KST 하루 첫 호출에만 보너스를 준다.
  const checkedIn = useRef(null);
  useEffect(() => {
    if (!token || !user || checkedIn.current === token) return;
    checkedIn.current = token;
    api
      .checkin(token)
      .then((r) => {
        setUser(r.user);
        if (r.bonus > 0) setReward({ emoji: '📅', title: '출석 보너스!', lines: [`오늘 첫 접속 보너스 ${r.bonus.toLocaleString('ko-KR')}원이 지급되었습니다.`] });
      })
      .catch(() => {});
  }, [token, user]);

  const claimGaepyeong = useCallback(async () => {
    try {
      const r = await api.gaepyeong(token);
      setUser(r.user);
      setReward({ emoji: '🧧', title: '개평 받았다!', lines: [`${r.amount.toLocaleString('ko-KR')}원이 충전되었습니다. (오늘 ${r.user.gaepyeongLeft}회 남음)`] });
    } catch (e) {
      setToast({ text: e.message, key: Date.now() });
    }
  }, [token]);

  // 토큰 → 소켓 연결
  useEffect(() => {
    if (!token) return undefined;
    const s = io({
      auth: { token }, // 재접속 때도 토큰이 같이 가므로 서버가 userId 로 방/게임을 찾아 복구한다
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    sockRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (e) => {
      if (e.message === 'unauthorized') logout();
    });
    s.on('kicked', (m) => {
      notify(m);
      logout();
    });
    s.on('me:update', setUser);
    s.on('achievement:unlocked', ({ achievements }) => {
      sfx('win');
      setReward({ emoji: '🏆', title: '업적 달성!', lines: achievements.map((x) => `${x.emoji} ${x.name} — ${x.desc}`) });
    });
    s.on('lobby:rooms', setRooms);
    s.on('lobby:history', setLobbyChat);
    s.on('lobby:chat', (m) => setLobbyChat((c) => [...c.slice(-49), m]));
    s.on('room:joined', ({ room: r, chat }) => {
      setRoom(r);
      setRoomChat(chat || []);
    });
    s.on('room:state', setRoom);
    s.on('room:chat', (m) => {
      if (!m.system && m.userId !== userRef.current?.id) sfx('chat');
      setRoomChat((c) => [...c.slice(-99), m]);
    });
    s.on('BROADCAST_EMOTE', ({ userId, text }) => {
      const key = `${Date.now()}-${Math.random()}`;
      setEmotes((e) => ({ ...e, [userId]: { text, key } }));
      sfx('chat');
      setTimeout(() => setEmotes((e) => (e[userId]?.key === key ? { ...e, [userId]: undefined } : e)), 3000);
    });
    s.on('room:left', () => {
      setOmok(null);
      setOmokOver(null);
      setSeotda(null);
      setSeotdaOver(null);
      setTurnInfo(null);
      setSeotdaNote(null);
      epoch.current++;
      queue.current = [];
      pendingOver.current = null;
      setRoom(null);
      setRoomChat([]);
      setView(null);
      setOver(null);
      setBusy(false);
      setBanner(null);
      setStartInfo(null);
    });
    s.on('game:start', ({ view: v, first, flips, cutter, ranked }) => {
      setTurnInfo(null);
      epoch.current++;
      queue.current = [];
      comboTimers.current.forEach(clearTimeout);
      comboTimers.current = [];
      setCombo(null);
      lastFrame.current = v;
      if (first !== undefined) sfx('deal');
      running.current = false;
      pendingOver.current = null;
      setOver(null);
      setBusy(false);
      setBanner(null);
      setView(v);
      setStartInfo({ first, flips, cutter, ranked, key: Date.now() });
    });
    // 서버가 내려주는 전체 상태로 화면을 통째로 덮어쓴다 (재접속·새로고침·앱 복귀). 진행 중이던 재생은 모두 버린다.
    s.on('SYNC_BOARD_STATE', ({ room: r, chat, view: v, seotda: sd, omok: om, tieVote: tv, over: o, ranked, serverTime }) => {
      setSeotda(sd ?? null);
      setOmok(om ?? null);
      setOmokOver(null);
      setSeotdaDeal(null);
      setTieVote(tv ?? null);
      setTurnInfo(null);
      if (serverTime) setSkew(serverTime - Date.now());
      epoch.current++;
      queue.current = [];
      running.current = false;
      setBusy(false);
      setBanner(null);
      setRoom(r);
      setRoomChat(r ? chat || [] : []);
      setView(v);
      lastFrame.current = v;
      pendingOver.current = null;
      setStartInfo(v ? { first: null, flips: null, ranked } : null);
      if (o && o.black == null) setOver(o); // 오목 결과(black 있음)는 보드가 없으니 고스톱 결과창에 쓰지 않는다
      else if (!r || v) setOver(null);
    });
    // ----- 섯다 -----
    s.on('seotda:start', ({ view: v, round, rematch, kind }) => {
      setSeotda(v);
      setSeotdaOver(null);
      setTieVote(null);
      const note = kind === 'double' ? `💰 묻고 더블! 판돈 ${v.ante.toLocaleString('ko-KR')}원으로 다시 붙습니다` : rematch ? `🔁 재경기 ${round}판째 — 팟 이월` : null;
      setSeotdaNote(note ? { text: note, key: Date.now() } : null);
      setSeotdaDeal(Date.now());
      sfx('deal');
    });
    s.on('seotda:state', ({ view: v, event }) => {
      setSeotda(v);
      if (event) setSeotdaEvent({ ...event, key: `${Date.now()}-${Math.random()}` });
      if (event && event.action !== 'die') sfx('chip');
      else if (event) sfx('ppeok');
    });
    // ----- 오목 -----
    s.on('omok:start', ({ view: v }) => {
      setOmok(v);
      setOmokOver(null);
      sfx('deal');
    });
    s.on('omok:state', ({ view: v }) => {
      setOmok(v);
      sfx('chip');
    });
    s.on('omok:over', setOmokOver);
    s.on('TURN_START', (t) => {
      setTurnInfo(t);
      // 고스톱은 프레임 재생 시점에 차례 효과음이 나므로 섯다·오목만
      if ((t.game === 'seotda' || t.game === 'omok') && t.userId === userRef.current?.id && !t.auto) sfx('turn');
    });
    // 섯다 동점: 묻고 더블 투표
    s.on('seotda:tieVote', (v) => setTieVote(v));
    s.on('seotda:tieResult', ({ agreed }) => {
      sfx(agreed ? 'combo' : 'draw');
      setSeotdaNote({ text: agreed ? '💰 묻고 더블로 가! 동점자끼리 다시 붙습니다' : '🤝 동점 — 팟을 나눠 가집니다', key: Date.now() });
    });
    s.on('SHOW_DOWN', ({ rematch, round }) => {
      setTurnInfo(null);
      if (rematch) setSeotdaNote({ text: `🔁 구사 재경기! (${round}판) 팟을 그대로 두고 다시 시작합니다`, key: Date.now() });
    });
    // 승패 효과음은 쇼다운 공개 연출이 끝나고 결과 창이 뜰 때 SeotdaBoard 가 낸다
    s.on('seotda:over', setSeotdaOver);
    s.on('game:frames', ({ frames }) => {
      queue.current.push(...frames);
      run();
    });
    s.on('game:over', (payload) => {
      setTurnInfo(null);
      pendingOver.current = payload;
      if (!running.current && !queue.current.length) settleOver();
    });
    // 폰에서 화면이 꺼졌다 켜지거나 다른 앱에서 돌아오면: 끊겨 있으면 즉시 재연결, 연결돼 있으면 놓친 상태를 다시 받아온다
    const wake = () => {
      if (document.hidden) return;
      if (s.disconnected) s.connect();
      else s.emit('sync');
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
      s.removeAllListeners();
      s.disconnect();
      sockRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 저장된 토큰으로 자동 로그인
  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .me(token)
      .then((r) => setUser(r.user))
      .catch(() => {
        saveToken(null);
        setToken(null);
      })
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    saveToken(null);
    setToken(null);
    setUser(null);
    setRoom(null);
    setView(null);
    setOver(null);
    setRooms([]);
  }

  const auth = useCallback(async (mode, username, password) => {
    const r = await (mode === 'login' ? api.login : api.register)(username, password);
    saveToken(r.token);
    setUser(r.user);
    setToken(r.token);
  }, []);

  /** 서버로 이벤트 전송. ack 의 ok=false 면 토스트로 알린다 */
  const emit = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const s = sockRef.current;
        if (!s) return resolve({ ok: false });
        s.timeout(8000).emit(event, payload ?? {}, (err, res) => {
          const r = err ? { ok: false, error: '서버 응답이 없습니다.' } : res || { ok: true };
          if (!r.ok && r.error) notify(r.error);
          resolve(r);
        });
      }),
    [notify],
  );
  const send = useCallback((event, payload) => sockRef.current?.emit(event, payload), []);

  const value = {
    token, user, updateUser: setUser, skew, omok, omokOver, dismissOmok: () => { setOmok(null); setOmokOver(null); }, seotda, seotdaOver, seotdaDeal, seotdaEvent, turnInfo, seotdaNote, tieVote, dismissSeotda: () => { setSeotda(null); setSeotdaOver(null); setSeotdaNote(null); setTieVote(null); }, emotes, reward, closeReward: () => setReward(null), claimGaepyeong, booting, connected, rooms, lobbyChat, room, roomChat, view, banner, combo, busy, over, startInfo, toast,
    auth, logout, emit, send, notify, dismissOver: () => {
      setOver(null);
      setView(null);
      setStartInfo(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
