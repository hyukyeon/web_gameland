/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // 시스템 다크 모드를 따라가지 않는다 (dark: 변형은 .dark 클래스가 있을 때만 — 지금은 쓰지 않음)
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        felt: { 900: '#0b2a1c', 800: '#0f3b27', 700: '#14513a', 600: '#1b6a4b' },
        gold: { 400: '#f4c95d', 500: '#e0a82e' },
      },
      fontFamily: { sans: ['"Noto Sans KR"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
