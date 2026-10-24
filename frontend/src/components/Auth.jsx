import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { Card } from './Card.jsx';

export function Auth() {
  const { auth } = useApp();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await auth(mode, username.trim(), password);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-cover bg-center p-4" style={{ backgroundImage: 'linear-gradient(rgba(8,4,12,.5), rgba(8,4,12,.7)), url(/casino-bg.svg)' }}>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel w-full max-w-sm space-y-4 bg-black/55 p-6"
      >
        <div className="flex justify-center gap-1">
          {[0, 8, 16, 24].map((id, i) => (
            <motion.div key={id} initial={{ rotate: -20, y: 20, opacity: 0 }} animate={{ rotate: (i - 1.5) * 8, y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}>
              <Card id={id} size="md" />
            </motion.div>
          ))}
        </div>
        <h1 className="flex items-center justify-center gap-2 text-3xl font-black tracking-wide">
          <span>🎰</span>
          <span className="bg-gradient-to-b from-yellow-200 to-amber-500 bg-clip-text text-transparent">강원랜드</span>
        </h1>
        <div className="grid grid-cols-2 gap-2">
          {[['login', '로그인'], ['register', '회원가입']].map(([k, label]) => (
            <button type="button" key={k} onClick={() => setMode(k)} className={`btn ${mode === k ? 'btn-gold' : 'btn-ghost'}`}>
              {label}
            </button>
          ))}
        </div>
        <input className="input" placeholder="아이디 (2~12자)" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <input
          className="input"
          type="password"
          placeholder="비밀번호 (4자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn btn-gold w-full" disabled={loading || !username || !password}>
          {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작 (100,000원 지급)'}
        </button>
      </motion.form>
    </div>
  );
}
