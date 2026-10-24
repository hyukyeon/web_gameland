import React from 'react';

export const DEFAULT_AVATAR = '/default-avatar.svg';
export const BOT_AVATAR = '/bot-avatar.svg';
const LEVEL_TEXT = { easy: ['하', '쉬움', 'bg-emerald-600'], normal: ['중', '보통', 'bg-sky-600'], hard: ['상', '어려움', 'bg-red-600'] };

/** 봇 이름 옆 난이도 배지 (하/중/상) */
export function BotLevel({ player }) {
  const l = player?.bot && LEVEL_TEXT[player.level];
  if (!l) return null;
  return <span className={`shrink-0 rounded px-1 text-[9px] font-black leading-4 text-white ${l[2]}`} title={`AI 난이도: ${l[1]}`} aria-label={`AI 난이도 ${l[1]}`}>{l[0]}</span>;
}

/** 플레이어 사진. 업로드한 사진이 없거나 불러오지 못하면 기본 이미지(봇은 로봇 이미지)를 보여준다. */
export function Avatar({ player, size = 32, className = '', showTitle = false }) {
  const fallback = player?.bot ? BOT_AVATAR : DEFAULT_AVATAR;
  const src = player?.avatar || fallback;
  const img = (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
      }}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full bg-felt-900 object-cover ring-2 ring-white/40 ${className}`}
    />
  );
  const title = showTitle ? player?.titleText ?? player?.title : null; // 내 정보는 titleText(문자열; title 은 업적 id), 방 플레이어는 title(문자열)
  if (!title) return img;
  // 대표 칭호: 아바타 위에 항상 떠 있는 작은 글씨
  return (
    <span className="relative inline-flex shrink-0">
      <span className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-500 px-1.5 text-[9px] font-black leading-4 text-felt-900 shadow">
        {title}
      </span>
      {img}
    </span>
  );
}
