import React, { useEffect, useRef, useState } from 'react';

export function Chat({ messages, onSend, me, className = '', placeholder = '메시지 입력' }) {
  const [text, setText] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [messages]);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };
  return (
    <div className={`panel flex min-h-0 flex-col ${className}`}>
      <div ref={box} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={m.system ? 'text-xs text-amber-300/80' : ''}>
            {!m.system && <b className={m.user === me ? 'text-gold-400' : 'text-sky-300'}>{m.user}</b>}
            {!m.system && ' '}
            <span className="break-words">{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button className="btn btn-ghost shrink-0">전송</button>
      </form>
    </div>
  );
}
