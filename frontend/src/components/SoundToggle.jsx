import React, { useState } from 'react';
import { isBgmOn, isSoundOn, setBgmOn, setSoundOn } from '../sound.js';

/** 효과음 / 배경음악을 각각 켜고 끈다 */
export function SoundToggle() {
  const [fx, setFx] = useState(isSoundOn());
  const [bgm, setBgm] = useState(isBgmOn());
  return (
    <>
      <button
        className={`btn btn-ghost whitespace-nowrap !px-3 !py-1 ${fx ? '' : 'opacity-60'}`}
        title={fx ? '효과음 끄기' : '효과음 켜기'}
        onClick={() => {
          setSoundOn(!fx);
          setFx(!fx);
        }}
      >
        {fx ? '🔊' : '🔇'}<span className="hidden sm:inline"> 효과음</span>
      </button>
      <button
        className={`btn btn-ghost whitespace-nowrap !px-3 !py-1 ${bgm ? '' : 'opacity-60'}`}
        title={bgm ? '배경음악 끄기' : '배경음악 켜기'}
        onClick={() => {
          setBgmOn(!bgm);
          setBgm(!bgm);
        }}
      >
        🎵<span className="hidden sm:inline"> 배경음{bgm ? '' : ' OFF'}</span>{!bgm && <span className="sm:hidden">✕</span>}
      </button>
    </>
  );
}
