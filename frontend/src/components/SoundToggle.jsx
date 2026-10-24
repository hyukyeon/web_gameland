import React, { useEffect, useState } from 'react';
import { isSoundOn, setSoundOn, onSoundChange } from '../sound.js';
import { BarLabel } from './TurnTools.jsx';

/** 효과음 빠른 켜기/끄기 (배경음악·음량은 ⚙️ 설정에서) */
export function SoundToggle({ stacked = false }) {
  const [fx, setFx] = useState(isSoundOn());
  useEffect(() => onSoundChange(() => setFx(isSoundOn())), []);
  return (
    <button
      className={`btn btn-ghost whitespace-nowrap !py-1 ${stacked ? '!px-2.5 sm:!px-3' : '!px-3'} ${fx ? '' : 'opacity-60'}`}
      title={fx ? '효과음 끄기' : '효과음 켜기'}
      aria-label="효과음"
      aria-pressed={fx}
      onClick={() => setSoundOn(!fx)}
    >
      <BarLabel icon={fx ? '🔊' : '🔇'} text="효과음" stacked={stacked} />
    </button>
  );
}
