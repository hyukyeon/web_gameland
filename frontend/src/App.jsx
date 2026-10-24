import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './store.jsx';
import { Auth } from './components/Auth.jsx';
import { Lobby } from './components/Lobby.jsx';
import { Room } from './components/Room.jsx';
import { GameBoard } from './components/GameBoard.jsx';
import { SeotdaBoard } from './components/SeotdaBoard.jsx';

function Toast() {
  const { toast } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center">
      <AnimatePresence mode="wait">
        {toast && <ToastItem key={toast.key} text={toast.text} />}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ text }) {
  const [show, setShow] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setShow(false), 2800);
    return () => clearTimeout(t);
  }, []);
  return show ? (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold shadow-lg">
      {text}
    </motion.div>
  ) : null;
}

/** 소켓이 끊겨 있는 동안 화면을 가리고 조작을 막는다. 짧은 끊김(0.8초 미만)에는 깜빡이지 않도록 지연해서 표시. */
function DisconnectOverlay() {
  const { token, user, connected } = useApp();
  const [show, setShow] = React.useState(false);
  const active = !!token && !!user && !connected;
  React.useEffect(() => {
    if (!active) {
      setShow(false);
      return undefined;
    }
    const t = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(t);
  }, [active]);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm" role="alert">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-gold-400" />
      <p className="text-lg font-bold text-white">서버와 연결이 끊겼습니다.</p>
      <p className="text-sm text-slate-300">재접속 중… 잠시만 기다려 주세요.</p>
    </div>
  );
}

/** 출석 보너스 / 개평 / 업적 달성 안내 모달 */
function RewardModal() {
  const { reward, closeReward } = useApp();
  return (
    <AnimatePresence>
      {reward && (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeReward}>
          <motion.div
            className="panel w-full max-w-sm space-y-3 bg-felt-800 p-6 text-center"
            initial={{ scale: 0.6, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl">{reward.emoji}</div>
            <h2 className="text-xl font-black text-gold-400">{reward.title}</h2>
            {reward.lines.map((l) => (
              <p key={l} className="text-sm">{l}</p>
            ))}
            <button className="btn btn-gold w-full" onClick={closeReward}>확인</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const { token, user, booting, room, view, seotda } = useApp();
  let screen;
  if (booting) screen = <div className="flex h-full items-center justify-center text-slate-300">불러오는 중…</div>;
  else if (!token || !user) screen = <Auth />;
  else if (room && view) screen = <GameBoard />;
  else if (room && seotda) screen = <SeotdaBoard />;
  else if (room) screen = <Room />;
  else screen = <Lobby />;
  return (
    <>
      {screen}
      <Toast />
      <RewardModal />
      <DisconnectOverlay />
    </>
  );
}
