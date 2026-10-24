import React, { useEffect, useState } from 'react';
import { isSoundOn, setSoundOn, onSoundChange } from '../sound.js';

/** 효과음 빠른 켜기/끄기 (배경음악·음량은 ⚙️ 설정에서) */
export function SoundToggle() {
  const [fx, setFx] = useState(isSoundOn());
  useEffect(() => onSoundChange(() => setFx(isSoundOn())), []);
  return (
    <button
      className={`btn btn-ghost whitespace-nowrap !px-3 !py-1 ${fx ? '' : 'opacity-60'}`}
      title={fx ? '효과음 끄기' : '효과음 켜기'}
      aria-label="효과음"
      aria-pressed={fx}
      onClick={() => setSoundOn(!fx)}
    >
      {fx ? '🔊' : '🔇'}<span className="hidden sm:inline"> 효과음</span>
    </button>
  );
}
