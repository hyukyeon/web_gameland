import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won } from '../cards.js';
import { Chat } from './Chat.jsx';
import { Avatar } from './Avatar.jsx';
import { OptionToggles } from './Lobby.jsx';
import { LEVELS, LEVEL_LABEL, STYLE_LABEL } from './options.js';

/** 방장용: 난이도를 골라 AI 봇 추가 */
function AddBot({ emit }) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <button className="btn btn-ghost !px-2 !py-0.5 text-xs text-slate-200" onClick={() => setOpen(true)}>🤖 AI 봇 추가</button>;
  return (
    <span className="flex items-center gap-1" role="group" aria-label="AI 난이도">
      {LEVELS.map(([k, label]) => (
        <button key={k} className="btn btn-ghost !px-2 !py-0.5 text-xs" title={`${label} 난이도 봇 추가`} onClick={() => { emit('room:addBot', { level: k }); setOpen(false); }}>
          {label}
        </button>
      ))}
      <button className="px-1 text-xs text-slate-400" aria-label="취소" onClick={() => setOpen(false)}>✕</button>
    </span>
  );
}

export function Room() {
  const { room, roomChat, user, emit, send } = useApp();
  const isHost = room.hostId === user.id;
  const me = room.players.find((p) => p.id === user.id);
  const spectator = !me;
  const seotda = room.game === 'seotda';
  const omok = room.game === 'omok';
  const yut = room.game === 'yut';
  const allReady = room.players.length >= 2 && room.players.every((p) => p.ready);

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-3">
      <header className="panel flex items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-lg font-black text-gold-400">{room.name}</h1>
          <p className="text-xs text-slate-300">
            판돈 {won(room.bet)} · {room.players.length}/{room.max}명 {omok ? '(1:1)' : '(2~4인)'} {!omok && !yut && room.players.length === 3 && '· 3인 맞고'}
            {' · '}
            {room.ranked ? '실전 (머니·전적 반영)' : '연습 (머니·전적 무반영)'}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => emit('room:leave')}>나가기</button>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_360px]">
        <section className="panel flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: room.max }).map((_, i) => {
              const p = room.players[i];
              return (
                <motion.div key={p?.id ?? `empty${i}`} layout className={`flex items-center justify-between rounded-lg p-3 ${p ? 'bg-white/10' : 'border border-dashed border-white/20 text-slate-500'}`}>
                  {p ? (
                    <>
                      <span className="flex min-w-0 items-center gap-2 font-bold">
                        <Avatar player={p} size={36} showTitle />
                        <span className="min-w-0 truncate">
                        {p.id === room.hostId && '👑 '}
                        {p.username}
                        {p.bot && ' 🤖'}
                        {p.bot && p.level && <span className="ml-1 whitespace-nowrap rounded bg-indigo-700 px-1 text-[10px] font-bold" title={`${LEVEL_LABEL[p.level]} · ${STYLE_LABEL[p.style]}`}>{LEVEL_LABEL[p.level]}</span>}
                        {p.bot && p.style && <span className="ml-1 hidden whitespace-nowrap text-[10px] text-slate-400 lg:inline">{STYLE_LABEL[p.style]}</span>}
                        {p.id === user.id && <span className="ml-1 text-xs text-gold-400">(나)</span>}
                        {!p.online && <span className="ml-1 text-xs text-red-400">접속 끊김</span>}
                        {p.auto && <span className="ml-1 text-xs text-indigo-300">🤖 자동</span>}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {p.bot && isHost && (
                          <button className="whitespace-nowrap rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/20" onClick={() => emit('room:removeBot', { botId: p.id })}>
                            내보내기
                          </button>
                        )}
                        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${p.ready ? 'bg-emerald-600' : 'bg-slate-600'}`}>{p.ready ? '준비 완료' : '대기'}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>빈 자리</span>
                      {isHost && !spectator && i === room.players.length && (
                        <AddBot emit={emit} />
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 rounded-lg bg-felt-800 px-4 py-2 ring-1 ring-white/10">
            <p className="text-sm text-slate-300">
              {room.players.length < 2 ? '상대를 기다리는 중입니다…' : allReady ? '게임을 시작합니다…' : '전원이 준비하면 시작합니다.'}
            </p>
            {spectator ? (
              <span className="rounded-full bg-sky-700 px-3 py-1 text-sm font-bold">👁️ 관전 중</span>
            ) : (
              <button className={`btn ${me?.ready ? 'btn-ghost' : 'btn-gold'}`} disabled={room.players.length < 2} onClick={() => emit('room:ready')}>
                {me?.ready ? '준비 취소' : '준비'}
              </button>
            )}
          </div>

          {room.spectators?.length > 0 && (
            <div className="text-xs text-slate-300">
              👁️ 관전 {room.spectators.length}명: {room.spectators.map((p) => p.username).join(', ')}
            </div>
          )}

          {yut ? (
            <p className="rounded-lg bg-white/5 p-3 text-xs text-slate-300">🎲 윷놀이 · 참가비 {won(room.bet)}원. 방 순서대로 청🔵·홍🔴 팀이 번갈아 들어가요(2명이면 1:1, 4명이면 2:2). 팀마다 말 4개를 먼저 모두 도착시키면 승리! 윷·모가 나오거나 상대 말을 잡으면 한 번 더 던져요. 진 팀이 이긴 팀에게 참가비를 내요. 우측 상단 ❓에서 규칙을 볼 수 있어요.</p>
          ) : omok ? (
            <p className="rounded-lg bg-white/5 p-3 text-xs text-slate-300">⚪⚫ 오목 · 참가비 {won(room.bet)}원. 15×15 판에서 먼저 5개를 잇는 사람이 이겨요. 첫 판은 무작위로 흑(선공)이 정해지고, 다음 판은 진 사람이 흑을 잡습니다. 흑은 쌍삼(3-3)·장목(6목 이상)이 금지! 우측 상단 ❓에서 규칙을 볼 수 있어요.</p>
          ) : seotda ? (
            <p className="rounded-lg bg-white/5 p-3 text-xs text-slate-300">🃏 섯다 · 참가비 {won(room.bet)}원. 한 판마다 패 2장을 받고 베팅합니다. 구사가 나오면 재경기(팟 이월)! 돈이 모자라면 올인(사이드팟), 동점이면 동점자 전원 동의 시 묻고 더블(판돈 2배)로 다시 붙어요. 우측 상단 ❓에서 족보를 볼 수 있어요.</p>
          ) : (
          <div>
            <h3 className="mb-2 text-sm font-bold">
              방 옵션 {!isHost && <span className="font-normal text-slate-400">(방장만 변경 가능)</span>}
            </h3>
            <OptionToggles opts={room.opts} disabled={!isHost} onChange={(opts) => emit('room:options', { opts })} />
          </div>
          )}
        </section>
        <Chat className="min-h-[240px]" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} placeholder="대기실 채팅" />
      </div>
    </div>
  );
}
