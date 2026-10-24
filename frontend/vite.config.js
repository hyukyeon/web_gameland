import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // 라이브러리는 앱 코드와 따로 묶어 앱만 바뀌었을 때 캐시를 그대로 쓰게 한다
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/ },
            { name: 'socket', test: /node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|@socket\.io|debug|ms|xmlhttprequest-ssl|ws)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': target,
      '/pics': target,
      '/socket.io': { target, ws: true },
    },
  },
});
