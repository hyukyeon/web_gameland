import React from 'react';

/** 화면/패널을 불러오는 동안 보여 주는 표시 */
export function Loading({ small = false }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-slate-300 ${small ? 'py-10' : 'h-full'}`} role="status">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-gold-400" />
      불러오는 중…
    </div>
  );
}
