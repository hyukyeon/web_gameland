import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './index.css';
import App from './App.jsx';
import { AppProvider } from './store.jsx';
import { installHotkeys } from './keys.js';
import { registerServiceWorker } from './pwa.js';

installHotkeys();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  // 운영체제의 '동작 줄이기' 설정을 따르면 큰 이동 애니메이션을 생략한다 (#26)
  <MotionConfig reducedMotion="user">
    <AppProvider>
      <App />
    </AppProvider>
  </MotionConfig>,
);
