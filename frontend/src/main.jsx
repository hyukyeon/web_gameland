import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './index.css';
import App from './App.jsx';
import { AppProvider } from './store.jsx';
import { installHotkeys } from './keys.js';
import { registerServiceWorker } from './pwa.js';
import { useSettings, reducedMotionOf } from './settings.js';

installHotkeys();
registerServiceWorker();

// 애니메이션 설정: 켜기(기본) · 기기 설정('동작 줄이기'면 큰 이동 생략, #26) · 끄기
function Root() {
  const { motion } = useSettings();
  return (
    <MotionConfig reducedMotion={reducedMotionOf(motion)}>
      <AppProvider>
        <App />
      </AppProvider>
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
