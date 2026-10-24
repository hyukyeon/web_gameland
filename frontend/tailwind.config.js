/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
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
