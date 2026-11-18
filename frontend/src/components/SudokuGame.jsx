import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { won } from '../cards.js';
import { sfx } from '../sound.js';
import { hk } from '../keys.js';

const DIFF = [
  ['easy', '하 (쉬움)'],
  ['medium', '중 (보통)'],
  ['hard', '상 (어려움)'],
];
const SAVE_KEY = 'sudoku.progress'; // { id, board, startedAt } — 새로고침 대비 자동 저장(이 기기). '저장하고 나가기'는 서버(DB)에 저장

const load = () => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; }
};
const save = (v) => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 진행에는 지장 없음 */ }
};

const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
const peers = (a, b) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

/** 같은 행·열·박스에 같은 숫자가 있는 칸들 */
function conflictsOf(board) {
  const bad = new Set();
  for (let a = 0; a < 81; a++) {
    if (!board[a]) continue;
    for (let b = a + 1; b < 81; b++) if (board[b] === board[a] && peers(a, b)) bad.add(a).add(b);
  }
  return bad;
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** onExit: 화면에서 나가기 (저장하고 나가기 후 호출). exitRef: 바깥 '나가기' 버튼도 저장하고 나가도록 저장 함수를 걸어 둔다 */
export function SudokuGame({ onExit, exitRef }) {
  const { token, updateUser, notify } = useApp();
  const [info, setInfo] = useState(null); // { cleared, limit, left, reward }
  const [difficulty, setDifficulty] = useState('medium');
  const [puzzle, setPuzzle] = useState(null); // { id, difficulty, puzzle }
  const [board, setBoard] = useState(null);
  const [sel, setSel] = useState(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState(null); // { reward, seconds, capped, message }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitted = useRef(null); // 같은 판을 자동 제출로 두 번 보내지 않게

  // p.board/p.elapsed: 서버에 저장해 둔 판. 이 기기의 자동 저장(local)이 같은 문제이고 더 최근이면 그쪽을 쓴다
  const begin = useCallback((p, local) => {
    const mine = local?.id === p.id && Array.isArray(local.board) && (local.savedAt ?? 0) > (p.savedAt ?? 0);
    setPuzzle(p);
    setBoard(mine ? local.board : Array.isArray(p.board) ? p.board : [...p.puzzle]);
    setStartedAt(mine && local.startedAt ? local.startedAt : Date.now() - (p.elapsed ?? 0) * 1000);
    setSel(null);
    setResult(null);
    setError('');
    submitted.current = null;
    setDifficulty(p.difficulty);
  }, []);

  const newGame = useCallback(async (diff) => {
    setBusy(true);
    setError('');
    try {
      begin(await api.sudokuNew(token, diff));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, begin]);

  // 처음: 오늘 현황 + 풀던 문제가 있으면 이어서, 없으면 새 문제
  useEffect(() => {
    let off = false;
    api.sudokuStatus(token).then((st) => {
      if (off) return;
      setInfo(st.sudoku);
      if (st.current) begin(st.current, load());
      else newGame('medium');
    }).catch((e) => setError(e.message));
    return () => { off = true; };
  }, [token, begin, newGame]);

  useEffect(() => {
    if (puzzle && board) save({ id: puzzle.id, board, startedAt, savedAt: Date.now() });
  }, [puzzle, board, startedAt]);

  useEffect(() => {
    if (result || !puzzle) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [result, puzzle]);

  const conflicts = useMemo(() => (board ? conflictsOf(board) : new Set()), [board]);
  const filled = board ? board.every((d) => d > 0) : false;
  const counts = useMemo(() => {
    const c = Array(10).fill(0);
    board?.forEach((d) => c[d]++);
    return c;
  }, [board]);
  const given = (i) => puzzle?.puzzle[i] > 0;

  const submit = useCallback(async () => {
    if (!puzzle || !board || busy) return;
    submitted.current = puzzle.id;
    setBusy(true);
    setError('');
    try {
      const r = await api.sudokuSubmit(token, puzzle.id, board);
      updateUser(r.user);
      setInfo(r.sudoku);
      setResult({ reward: r.reward, seconds: r.seconds });
      sfx('win');
    } catch (e) {
      if (e.status === 403) {
        setInfo(e.data?.sudoku ?? info);
        setResult({ reward: 0, seconds: Math.round((Date.now() - startedAt) / 1000), capped: true, message: e.message });
        sfx('draw');
      } else {
        setError(e.message);
        sfx('lose');
      }
    } finally {
      setBusy(false);
    }
  }, [puzzle, board, busy, token, updateUser, info, startedAt]);

  // 다 채웠고 겹치는 숫자가 없으면 바로 제출
  useEffect(() => {
    if (filled && conflicts.size === 0 && !result && puzzle && submitted.current !== puzzle.id) submit();
  }, [filled, conflicts, result, puzzle, submit]);

  const input = (d) => {
    if (sel == null || given(sel) || result) return;
    setBoard((b) => {
      const n = [...b];
      n[sel] = d;
      return n;
    });
    if (d) sfx('tick');
    // 고친 뒤 다시 다 차면 다시 제출할 수 있게
    submitted.current = null;
  };

  // 방향키로 칸 이동 (숫자·지우기는 넘패드 버튼의 data-hotkey 가 처리)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!mv) return;
      e.preventDefault();
      setSel((s) => {
        if (s == null) return 0;
        const n = s + mv;
        if (mv === 1 && colOf(s) === 8) return s;
        if (mv === -1 && colOf(s) === 0) return s;
        return n < 0 || n > 80 ? s : n;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const elapsed = Math.max(0, Math.round(((result ? startedAt + (result.seconds ?? 0) * 1000 : now) - startedAt) / 1000));
  const selVal = sel != null && board ? board[sel] : 0;

  /** 저장하고 나가기: 풀던 판을 서버에 저장 → 다른 기기·서버 재시작 뒤에도 이어서. 다 푼 판(결과 창)은 저장할 게 없다 */
  const [saving, setSaving] = useState(false);
  const saveAndExit = async () => {
    if (saving) return;
    if (!puzzle || !board || result) return onExit?.();
    setSaving(true);
    setError('');
    try {
      await api.sudokuSave(token, puzzle.id, board, Math.round((Date.now() - startedAt) / 1000));
      onExit?.();
    } catch (e) {
      // 저장에 실패해도 갇히지 않게 나간다 — 이 기기의 자동 저장(localStorage)으로는 이어 풀 수 있다
      notify?.(`서버에 저장하지 못했어요(${e.message}). 이 기기에서는 이어서 풀 수 있어요.`);
      onExit?.();
    }
  };
  if (exitRef) exitRef.current = saveAndExit;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto p-3 sm:p-4">
      {/* 상태 패널: 난이도 · 오늘 보상 현황 */}
      <div className="w-full max-w-md space-y-2 md:max-w-[40rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="sudoku-diff" className="text-slate-300">난이도</label>
            <select
              id="sudoku-diff"
              className="rounded-lg bg-felt-900 px-2 py-1 text-sm text-white ring-1 ring-white/20"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={busy}
            >
              {DIFF.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn btn-gold !px-3 !py-1" onClick={() => newGame(difficulty)} disabled={busy}>새 문제</button>
          </div>
          {onExit && (
            <button className="btn btn-ghost !px-3 !py-1 text-sm" onClick={saveAndExit} disabled={saving || busy} title="풀던 판과 걸린 시간을 저장하고 로비로 — 다음에 이어서 풀어요">
              {saving ? '저장 중…' : '💾 저장하고 나가기'}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
          <span>
            오늘 남은 클리어 보상: <b className={info?.left ? 'text-gold-400' : 'text-red-400'}>{info ? info.left : '-'}</b> / {info?.limit ?? 10}회{' '}
            <span className="whitespace-nowrap text-slate-400">(클리어 당 {won(info?.reward ?? 1000)}원)</span>
          </span>
          <span className="shrink-0 tabular-nums text-slate-300" aria-label="걸린 시간">⏱ {mmss(elapsed)}</span>
        </div>
        {info && info.left === 0 && <p className="text-[11px] text-slate-400">오늘 보상은 모두 받았어요. 자정(한국 시간)에 다시 10회가 채워집니다. 그동안은 연습으로 풀 수 있어요.</p>}
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-3 md:max-w-[40rem] md:flex-row md:items-start">
      {/* 9×9 보드: 칸마다 테두리를 두고 3×3 경계만 굵게 */}
      <div className="w-full max-w-md">
        <div className="grid aspect-square w-full grid-cols-9 overflow-hidden rounded-md border-[3px] border-slate-900 bg-amber-50 shadow-xl" role="grid" aria-label="스도쿠 판">
          {(board ?? Array(81).fill(0)).map((d, i) => {
            const r = rowOf(i);
            const c = colOf(i);
            const fixed = given(i);
            const isSel = sel === i;
            const related = sel != null && peers(sel, i);
            const same = selVal > 0 && d === selVal && !isSel;
            const bad = conflicts.has(i);
            return (
              <button
                key={i}
                role="gridcell"
                aria-label={`${r + 1}행 ${c + 1}열 ${d || '빈칸'}${fixed ? ' (고정)' : ''}${bad ? ' (겹침)' : ''}`}
                aria-selected={isSel}
                onClick={() => setSel(i)}
                className={[
                  'flex items-center justify-center text-[clamp(16px,5.5vw,26px)] leading-none transition-colors',
                  c % 3 === 2 && c !== 8 ? 'border-r-[3px] border-r-slate-900' : c !== 8 ? 'border-r border-r-slate-400' : '',
                  r % 3 === 2 && r !== 8 ? 'border-b-[3px] border-b-slate-900' : r !== 8 ? 'border-b border-b-slate-400' : '',
                  isSel ? 'bg-sky-300' : same ? 'bg-sky-200' : related ? 'bg-sky-100' : fixed ? 'bg-stone-200/70' : 'bg-amber-50',
                  bad ? 'text-red-600' : fixed ? 'font-black text-slate-900' : 'font-semibold text-blue-600',
                ].join(' ')}
              >
                {d || ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* 넘패드: 칸을 고르고(Select) 숫자를 누른다(Input). 숫자 아래는 아직 놓을 수 있는 개수 */}
      <div className="w-full max-w-md space-y-2 md:w-52 md:shrink-0">
      <div className="grid grid-cols-5 gap-2 md:grid-cols-3" aria-label="숫자 입력">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            className="btn btn-ghost flex h-14 flex-col items-center justify-center !p-0 text-2xl font-black disabled:opacity-30"
            onClick={() => input(d)}
            disabled={sel == null || given(sel) || !!result || counts[d] >= 9}
            aria-label={`${d} 입력`}
            {...hk(String(d))}
          >
            {d}
            <span className="text-[10px] font-normal text-slate-400">{9 - counts[d]}</span>
          </button>
        ))}
        <button
          className="btn btn-red flex h-14 items-center justify-center !p-0 text-xl font-black disabled:opacity-30"
          onClick={() => input(0)}
          disabled={sel == null || given(sel) || !board?.[sel] || !!result}
          aria-label="지우기"
          {...hk('Backspace Delete 0 x', 'X')}
        >
          ✕
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{conflicts.size > 0 ? <b className="text-red-400">빨간 숫자는 같은 줄·칸에 겹쳐요</b> : filled ? '확인 중…' : '빈칸을 누르고 아래 숫자를 고르세요'}</span>
        <button className="btn btn-ghost shrink-0 whitespace-nowrap !px-3 !py-1 text-xs" onClick={submit} disabled={!filled || busy || !!result}>제출</button>
      </div>
      </div>
      </div>
      {error && <p className="w-full max-w-md rounded bg-red-700/80 px-3 py-1.5 text-center text-sm" role="alert">{error}</p>}

      <AnimatePresence>
        {result && (
          <motion.div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="dialog" aria-modal="true" aria-label="스도쿠 클리어" className="panel w-full max-w-xs space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
              <div className="text-4xl">🎉</div>
              <h3 className="text-xl font-black text-gold-400">클리어!</h3>
              <p className="text-sm text-slate-200">걸린 시간 {mmss(result.seconds ?? elapsed)}</p>
              {result.capped ? (
                <p className="text-sm text-slate-300">{result.message}<br />보상 없이 연습으로 기록됩니다.</p>
              ) : (
                <p className="text-lg font-black text-emerald-300">+{won(result.reward)}원</p>
              )}
              <p className="text-xs text-slate-400">오늘 남은 보상 {info?.left ?? 0} / {info?.limit ?? 10}회</p>
              <button className="btn btn-gold w-full" onClick={() => newGame(difficulty)} disabled={busy} {...hk('Enter', 'Enter')}>다음 문제</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
